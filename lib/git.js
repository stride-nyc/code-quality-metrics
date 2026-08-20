// @ts-nocheck
'use strict';

const { execSync } = require('child_process');
const { CONFIG } = require('./config');
const { isTestFile, isExcludedPath, isRepoFurniture, matchesAnyPattern } = require('./metrics');

/**
 * Execute Git command with error handling
 * @param {string} command
 * @returns {string}
 */
function runGitCommand(command) {
  try {
    const result = execSync(command, { encoding: 'utf8' }).trim();
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error running Git command: ${command}`);
    console.error(`Error: ${msg}`);
    return '';
  }
}

// Record separator emitted by %x1e between commits. %B (the full commit message) is
// multi-line, so newline can no longer serve as the record boundary the way it did when
// the log format captured only %s (the subject line).
const RECORD_SEPARATOR = '\x1e';

// Separates the committer name from the commit body within the trailing pipe-delimited
// field, rather than adding a fifth pipe-delimited field ahead of the body (issue #62's
// committer-attribution requirement). %B can contain '|', which is why the body was already
// rejoined rather than split on it; inserting %cn as its own field before %B would have
// meant re-deriving that rejoin logic against a shifted field count and would have changed
// every existing fixture below %B. Appending "\x1f%cn" after %B instead means a record with
// no \x1f (every fixture that predates this change) parses exactly as before: committer
// defaults to '', full_message is untouched. \x1f (unit separator) is exceedingly unlikely
// to occur inside a commit body, the same assumption RECORD_SEPARATOR already makes about
// \x1e.
const COMMITTER_SEPARATOR = '\x1f';

/**
 * Parse Git log output into structured commit data.
 * Expects one record per commit, fields pipe-delimited (sha|committer-date|author|body),
 * records separated by RECORD_SEPARATOR (git format `%H|%ci|%an|%B\x1f%cn%x1e`, produced by
 * local-code-metrics.js's fetchBranchCommits). This function is format-token-agnostic -- it
 * only splits on '|' -- so the date field's meaning (committer date, not author date; see
 * fetchBranchCommits' own comment, code-quality-metrics-75 / mbiw) is a property of the caller's
 * format string, not of this parser. The trailing `\x1f%cn` is the committer name, appended
 * after the body rather than as its own pipe-delimited field -- see COMMITTER_SEPARATOR's own
 * comment for why.
 * @param {string} logOutput
 * @returns {Array<{sha: string, full_sha: string, date: string, author: string, committer: string, message: string, full_message: string, source_branch?: string}>}
 */
function parseGitLog(logOutput) {
  if (!logOutput) return [];

  const commits = [];
  const records = logOutput.split(RECORD_SEPARATOR).map(r => r.trim()).filter(Boolean);

  for (const record of records) {
    const parts = record.split('|');
    if (parts.length < 4) continue;

    const [sha, date, author, ...messageParts] = parts;
    if (sha && sha.length === 40) {
      // Body may legitimately contain '|', so it is rejoined the same way the old
      // subject-only field was.
      const rawBody = messageParts.join('|');
      const separatorIndex = rawBody.lastIndexOf(COMMITTER_SEPARATOR);
      // No \x1f found (every pre-committer-capture fixture): full_message is the raw body
      // unchanged, committer defaults to ''.
      const full_message = separatorIndex === -1 ? rawBody : rawBody.slice(0, separatorIndex);
      const committer = separatorIndex === -1 ? '' : rawBody.slice(separatorIndex + 1);
      commits.push({
        sha: sha.substring(0, 8),
        full_sha: sha,
        date,
        author,
        committer,
        // message stays subject-only: the Flight Log table, the console sample output
        // and report-template.js all render one line and would break on a multi-line value.
        message: full_message.split('\n')[0],
        full_message
      });
    }
  }
  return commits;
}

/**
 * Analyze a single commit for AI drift indicators
 * @param {string} sha
 * @param {string} branch
 * @returns {object|null}
 */
function analyzeCommit(sha, branch) {
  try {
    // `git show --numstat` (no -m/-c/-cc) diffs a merge commit against its first parent.
    // For a conflict-free two-parent merge -- e.g. GitHub's "Merge pull request" button on
    // a single-commit PR -- that reproduces one of the merged children's diff exactly, so
    // the same change would be counted a second time under the merge commit's own sha.
    // Skipping the merge entirely (rather than, say, diffing it against all parents) is the
    // choice made here: it costs the rare case of a long-lived branch merge that carries
    // genuine conflict-resolution edits of its own, which then goes uncounted, but that is
    // cheaper than double-counting the common case. See code-quality-metrics-pke.
    const parentsOutput = runGitCommand(`git show --no-patch --format=%P ${sha}`);
    const parentCount = parentsOutput ? parentsOutput.trim().split(/\s+/).filter(Boolean).length : 0;
    if (parentCount > 1) {
      console.warn(`  Skipping merge commit ${sha} (${parentCount} parents): its diff against the first parent would double-count a change already attributed to one of its parents.`);
      return null;
    }

    // runGitCommand collapses "the command failed" and "the command succeeded with empty
    // stdout" into the same '' return, which is exactly the distinction this needs: a
    // `git commit --allow-empty` commit succeeds with an empty diff and must be counted
    // with zero stats, while an actually failed git invocation must still be dropped and
    // reported as a failure (code-quality-metrics-p4c). execSync's own success/failure
    // (not the emptiness of its output) is asked here directly, rather than reusing
    // runGitCommand and losing that distinction again.
    let statsOutput;
    try {
      statsOutput = execSync(`git show --numstat --format="" ${sha}`, { encoding: 'utf8' }).trim();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  Warning: git show --numstat failed for commit ${sha}; excluding it from the analysis. (${msg})`);
      return null;
    }

    // statsOutput may legitimately be '' here: a genuinely empty commit. It is counted
    // below with zero additions, zero deletions and zero files -- a real commit the team
    // made, which is information, not an error -- rather than dropped from every
    // downstream rate's denominator.
    const statsLines = statsOutput.split('\n').filter(line => line.trim());

    let totalAdditions = 0;
    let totalDeletions = 0;
    let countedAdditions = 0;
    let countedDeletions = 0;
    let prodAdditions = 0;
    let prodDeletions = 0;
    let filesChanged = 0;
    let countedFilesChanged = 0;
    let testFiles = 0;
    let prodFiles = 0;
    let binaryFiles = 0;
    let excludedFiles = 0;
    let excludedAdditions = 0;
    let excludedDeletions = 0;
    let vendoredDefaultFiles = 0;
    let vendoredDefaultAdditions = 0;
    let vendoredDefaultDeletions = 0;
    /** @type {string[]} */
    const prodFilePaths = [];

    for (const line of statsLines) {
      const [additions, deletions, filename] = line.split('\t');
      if (!filename) continue;

      filesChanged++;

      const isBinary = additions === '-' && deletions === '-';
      const addNum = isBinary ? 0 : (parseInt(additions) || 0);
      const delNum = isBinary ? 0 : (parseInt(deletions) || 0);

      // Always-on, independent of ANALYSIS_IGNORE_PATTERNS and of whatever it is
      // configured to (code-quality-metrics-3b6, the higher-value half of step 3): the
      // share of changed volume matching the existing vendored/generated default patterns
      // already in CONFIG.DUPLICATE_IGNORE_PATTERNS, so the distortion is visible even on a
      // repository whose owner has configured nothing. This never changes classification or
      // any scored metric; it is purely observational.
      if (matchesAnyPattern(filename, CONFIG.DUPLICATE_IGNORE_PATTERNS)) {
        vendoredDefaultFiles++;
        vendoredDefaultAdditions += addNum;
        vendoredDefaultDeletions += delNum;
      }

      // A path matching ANALYSIS_IGNORE_PATTERNS counts as NEITHER test nor production
      // (code-quality-metrics-1tp): it stays in the raw, honest totals below (total_additions,
      // total_deletions, files_changed) so a reader comparing this report to `git log` sees
      // the real commit, but it is excluded from prod/test classification and from the
      // non-excluded file count sprawling_commit is judged against. isTestFile alone cannot
      // express "neither", which is the defect this fixes (code-quality-metrics-y8j).
      if (isExcludedPath(filename)) {
        excludedFiles++;
        excludedAdditions += addNum;
        excludedDeletions += delNum;
        totalAdditions += addNum;
        totalDeletions += delNum;
        if (isBinary) binaryFiles++;
        continue;
      }

      countedFilesChanged++;

      // Handle binary files (marked with '-' in git numstat)
      if (isBinary) {
        binaryFiles++;
        continue;
      }

      totalAdditions += addNum;
      totalDeletions += delNum;
      countedAdditions += addNum;
      countedDeletions += delNum;

      if (isTestFile(filename)) {
        testFiles++;
      } else {
        prodFiles++;
        prodFilePaths.push(filename);
        prodAdditions += addNum;
        prodDeletions += delNum;
      }
    }

    // Size judgements count production lines only. Counting test lines meant that adding
    // tests could push a change over the large-commit threshold, penalising the practice
    // this toolkit identifies as the strongest protection against drift. total_additions,
    // total_deletions and files_changed stay whole-diff, deliberately: a reader comparing
    // this report against `git log` must still see the real commit, not a number already
    // shrunk by configuration they may not know about.
    //
    // counted_additions, counted_deletions and counted_files_changed (GitHub #90) are the
    // exclusion-aware siblings of those three raw fields -- the same whole-diff figures minus
    // whatever ANALYSIS_IGNORE_PATTERNS matched, mirroring countedFilesChanged's existing role
    // in sprawling_commit above. CLAUDE.md documents ANALYSIS_IGNORE_PATTERNS as excluding
    // globs from "the line-count distributions" (avg/p50/p90/p95 lines changed, p90 files
    // changed, local-code-metrics.js), but until this fix those distributions were built
    // directly from the raw whole-diff fields and never actually moved when exclusions were
    // configured -- measured on denoland/deno (`**/yarn.lock`, 43.67% of lines: p90 lines
    // changed bit-for-bit unchanged) and tiangolo/fastapi (`Pipfile.lock`, `dist/**`, 9.41%).
    // local-code-metrics.js now builds those distributions from the counted fields instead,
    // leaving the raw fields (and every metric documented as whole-diff, e.g. net additions
    // ratio) untouched. Equal to the raw fields whenever nothing is excluded.
    const prodLines = prodAdditions + prodDeletions;

    return {
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      files_changed: filesChanged,
      counted_additions: countedAdditions,
      counted_deletions: countedDeletions,
      counted_files_changed: countedFilesChanged,
      binary_files: binaryFiles,
      test_files_count: testFiles,
      prod_files_count: prodFiles,
      prod_file_paths: prodFilePaths,
      // Named for what this actually detects: same-commit co-occurrence of test and
      // production file changes, not an ordering claim. Sun et al. (TOSEM 2023, doi
      // 10.1145/3607183) exist specifically to test whether this heuristic identifies
      // genuine test/production co-evolution and report "the pervasive existence of
      // noise" in samples identified this way. Borle et al. (EMSE 2018, doi
      // 10.1007/s10664-017-9576-3) make the same point in their own threats-to-validity
      // section: "In a git history, test first could look like testing at the same
      // time, or even testing later depending on how the git commits were formed."
      // Marsavina, Romano & Zaidman (SCAM 2014, Section V.A) report that test changes
      // triggered by a production change often land in a later commit, requiring
      // several subsequent commits to be inspected before the pairing shows up at all.
      // The field was previously named test_first_indicator, which asserted an
      // ordering this same-commit check cannot observe; renamed under
      // code-quality-metrics-36d.
      test_prod_cochange_commit: testFiles > 0 && prodFiles > 0,
      test_only_commit: testFiles > 0 && prodFiles === 0,
      prod_additions: prodAdditions,
      prod_deletions: prodDeletions,
      uncovered_prod_commit: testFiles === 0 && prodFiles > 0 && prodLines > CONFIG.LARGE_COMMIT_THRESHOLD,
      large_commit: prodLines > CONFIG.LARGE_COMMIT_THRESHOLD,
      // Judged against countedFilesChanged (files_changed minus any ANALYSIS_IGNORE_PATTERNS
      // match), not the raw files_changed above: a commit that touches 196 excluded build-
      // output files and one real source file must not read as sprawling on that account
      // (code-quality-metrics-1tp). Equals filesChanged whenever nothing is excluded.
      sprawling_commit: countedFilesChanged > CONFIG.SPRAWLING_COMMIT_THRESHOLD,
      // Excluded volume (code-quality-metrics-3b6): reported so the exclusion is visible
      // rather than silently changing the scored metrics with nothing in the output saying
      // so -- the same defect class as the silent inclusion this fixes.
      excluded_files_count: excludedFiles,
      excluded_additions: excludedAdditions,
      excluded_deletions: excludedDeletions,
      // Vendored/generated default share (code-quality-metrics-3b6): observational only,
      // computed even when ANALYSIS_IGNORE_PATTERNS is not configured.
      vendored_default_files_count: vendoredDefaultFiles,
      vendored_default_additions: vendoredDefaultAdditions,
      vendored_default_deletions: vendoredDefaultDeletions,
      source_branch: branch,
      change_ratio: totalDeletions > 0 ? (totalAdditions / totalDeletions).toFixed(2) : 'inf'
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Error analyzing commit ${sha}: ${msg}`);
    return null;
  }
}

/**
 * Fetch the stat summary and full diff for a single commit SHA.
 * Returns a combined string truncated to AI_DIFF_MAX_CHARS.
 * @param {string} sha
 * @returns {string}
 */
function getCommitDiff(sha) {
  const stat = runGitCommand(`git show --stat --format="" ${sha}`);
  const diff = runGitCommand(`git show --format="" ${sha}`);
  const combined = `--- File Summary ---\n${stat}\n\n--- Diff ---\n${diff}`;
  return combined.substring(0, CONFIG.AI_DIFF_MAX_CHARS);
}

// A GitHub squash-merge commit's subject carries the PR number the button appended, e.g.
// "feat: add widget (#101)". See calibration/README.md's own screening command
// (`git log --format=%s | grep -cE '\(#[0-9]+\)$'`) and calibration/observations.json's
// node.js/emberjs merge_style_evidence notes, which this mirrors.
//
// GitHub also writes "(GH-N)" instead of "(#N)" for a backported commit, and some
// repositories (cpython) use that form for roughly half their squashed history. Matching
// only "(#N)" undercounted pr_reference_share for those repos, which cost confidence
// (sometimes low instead of high) without ever flipping the verdict itself -- but a
// repository that used only the GH-N form and nothing else could fall under the 0.5 share
// and be classified granular outright. See code-quality-metrics-wgc.
const PR_REFERENCE_PATTERN = /\((?:#|GH-)\d+\)$/;

// The committer GitHub's web UI records for a squash- or merge-button commit ("web-flow",
// or a bot account like "GitHub" / "Node.js GitHub Bot"). Substring, case-insensitive: this
// alone is not decisive (node.js's rebase-and-land process also commits as a "GitHub" bot
// while keeping every commit granular -- calibration/observations.json's node entry), so it
// only ever lowers confidence, never flips the classification on its own.
const SQUASH_COMMITTER_PATTERN = /web-flow|github|\[bot\]/i;

/**
 * Detect whether a set of analyzed commits looks like granular commit history
 * (direct push, or a real merge-commit workflow) or squashed history (a
 * GitHub "Squash and merge" per pull request), from the same signals used to
 * screen calibration reference repositories. See code-quality-metrics-bnq.
 *
 * Decisive signals, checked in order:
 *  1. A majority of subjects carry the squash button's trailing PR reference
 *     -- direct evidence of squashing, confidence high.
 *  2. Some subjects do (a mixed workflow, e.g. microsoft/vscode: some PRs
 *     squashed, some merged, some pushed directly) -- ambiguous, and per
 *     code-quality-metrics-bnq's notes this defaults to squashed rather than
 *     unknown: squashing is the more common workflow, and asserting a
 *     verdict against bands that don't apply is a worse error than
 *     withholding one that would have been valid.
 *  3. No PR reference at all, but true merge commits exist -- a two-parent
 *     merge-button workflow (e.g. emberjs) preserves individual commits, so
 *     this is direct evidence FOR granular, not a squash signal.
 *  4. No PR reference, no merge commits, no squash-flavoured committer
 *     identity either -- a clean direct-push/mailing-list workflow (e.g.
 *     git, postgres). Granular, high confidence.
 *  5. No PR reference, no merge commits, but a squash-flavoured committer
 *     identity is present anyway -- the node.js case, still granular, but
 *     the committer signal alone is not decisive, so confidence drops.
 * @param {{ commits: Array<{message?: string}>, committerNames: string[], mergeCommitCount: number }} args
 * @returns {{ value: 'granular'|'squashed'|'unknown', confidence: 'high'|'low', signals: { pr_reference_share: number, squash_committer_share: number, merge_commit_count: number, sample_size: number } }}
 */
function detectHistoryGranularity({ commits, committerNames, mergeCommitCount }) {
  const total = commits.length;
  if (total === 0) {
    return {
      value: 'unknown',
      confidence: 'low',
      // sample_size names the population pr_reference_share is a share of (code-quality-
      // metrics-66oo): a bare percentage with no denominator recorded alongside it is exactly
      // how a population mismatch (the 73V case -- a share computed over 1246 pre-slice
      // candidates while the report described 50 analyzed commits) went unnoticed.
      signals: { pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: mergeCommitCount, sample_size: total }
    };
  }

  const prReferenceShare = commits.filter(c => PR_REFERENCE_PATTERN.test(c.message || '')).length / total;
  const squashCommitterShare = committerNames.length > 0
    ? committerNames.filter(name => SQUASH_COMMITTER_PATTERN.test(name)).length / committerNames.length
    : 0;
  const hasMergeCommits = mergeCommitCount > 0;
  const signals = { pr_reference_share: prReferenceShare, squash_committer_share: squashCommitterShare, merge_commit_count: mergeCommitCount, sample_size: total };

  if (prReferenceShare >= 0.5) {
    return { value: 'squashed', confidence: 'high', signals };
  }
  if (prReferenceShare > 0) {
    return { value: 'squashed', confidence: 'low', signals };
  }
  if (hasMergeCommits || squashCommitterShare === 0) {
    return { value: 'granular', confidence: 'high', signals };
  }
  return { value: 'granular', confidence: 'low', signals };
}

/**
 * Group analyzed commits that share a content signature (normalized subject, total additions,
 * and total deletions) despite carrying different SHAs -- the shape a squash-merge duplicate
 * takes: the squash commit on the default branch and the feature-branch commits it squashed are
 * different SHAs carrying the same net change, and when the branch survives the merge both
 * remain reachable and both get analyzed (code-quality-metrics-7ccq). The existing same-SHA
 * dedup in local-code-metrics.js does not catch this, since the two copies are different SHAs.
 *
 * This is a floor, not an exact test. It catches the case where the squash commit's net diff
 * equals the sum of its constituents' diffs exactly -- true for a single-commit squashed branch,
 * or several commits touching disjoint lines -- but it misses a multi-commit branch whose squash
 * commit's net diff differs from the sum of its parts (conflict-resolution edits folded into the
 * squash, or a rebase before merging). git patch-id does not help either: a squash commit's
 * patch-id matches none of its individual constituents. Because of this floor, and because two
 * unrelated commits could in principle coincide on subject and line counts, this function is
 * detection only -- see local-code-metrics.js's own comment on why a detected group is surfaced
 * as a count beside total_commits, never used to silently drop an entry from the analyzed set.
 *
 * Subject normalization strips a trailing GitHub PR-reference suffix ("(#42)" or "(GH-42)")
 * before comparing, reusing PR_REFERENCE_PATTERN (above) -- the same suffix
 * detectHistoryGranularity already matches against: a squash-merge button commit carries it,
 * the original commit(s) on the surviving branch usually do not.
 * @param {Array<{full_sha: string, message?: string, total_additions: number, total_deletions: number}>} commits
 * @returns {Array<{subject: string, total_additions: number, total_deletions: number, shas: string[]}>}
 */
function findContentDuplicateGroups(commits) {
  /** @type {Map<string, {subject: string, total_additions: number, total_deletions: number, shas: string[]}>} */
  const groups = new Map();
  for (const commit of commits) {
    const subject = (commit.message || '').replace(PR_REFERENCE_PATTERN, '').trim();
    const key = `${subject} ${commit.total_additions} ${commit.total_deletions}`;
    if (!groups.has(key)) {
      groups.set(key, { subject, total_additions: commit.total_additions, total_deletions: commit.total_deletions, shas: [] });
    }
    const group = /** @type {{subject: string, total_additions: number, total_deletions: number, shas: string[]}} */ (groups.get(key));
    if (!group.shas.includes(commit.full_sha)) {
      group.shas.push(commit.full_sha);
    }
  }
  return [...groups.values()].filter(group => group.shas.length > 1);
}

/**
 * Detect whether the analyzed commit window includes the repository's own first commit(s) --
 * a structural fact, not a tuned number (code-quality-metrics-31w). Every reference window this
 * toolkit's bands were calibrated on measures maintenance-era work on a decades-old codebase
 * (calibration/observations.json's brownfield-only-lifecycle reservation, high severity), and
 * three bands are biased against a genuine initial build in the same direction: large commits
 * are disproportionately forward engineering, and initial build carries scaffolding, vendored
 * dependencies and generated files (Hattori and Lanza, EVOL 2008).
 *
 * rootShas comes from the caller running `git rev-list --max-parents=0 --all`, so this checks
 * the whole repository's history, not just the refs actually analyzed -- the question is
 * "does this window include the start of the project", independent of workflow_type.
 * @param {{ analyzedShas: string[], rootShas: string[] }} args
 * @returns {boolean}
 */
function windowIncludesRepositoryRoot({ analyzedShas, rootShas }) {
  if (!rootShas || rootShas.length === 0) return false;
  const analyzed = new Set(analyzedShas);
  return rootShas.some(sha => analyzed.has(sha));
}

/**
 * Find the repository's root commit(s) across every ref (`git rev-list --max-parents=0
 * --all`), distinguishing a genuine command failure from the command succeeding with no
 * root commits found. runGitCommand collapses both into '', which previously let a failed
 * rev-list read as "no root commit found" (project_lifecycle: established), silently
 * defeating the greenfield detection windowIncludesRepositoryRoot exists to support on
 * exactly the repository it is supposed to protect (code-quality-metrics-dqri). execSync's
 * own success/failure is asked here directly, the same way analyzeCommit's numstat query
 * already does (code-quality-metrics-p4c).
 * @returns {{ shas: string[], failed: boolean }}
 */
function findRepositoryRootShas() {
  try {
    const output = execSync('git rev-list --max-parents=0 --all', { encoding: 'utf8' }).trim();
    return { shas: output ? output.split('\n').filter(Boolean) : [], failed: false };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error running Git command: git rev-list --max-parents=0 --all');
    console.error(`Error: ${msg}`);
    return { shas: [], failed: true };
  }
}

/**
 * Does a commit introduce at least one production file? Extends the tool's existing
 * test/production/excluded classification (isTestFile, isExcludedPath from lib/metrics.js) --
 * the same one analyzeCommit's own prodFiles count uses -- with one further, purely structural
 * check: isRepoFurniture (code-quality-metrics-fex3, GitHub #71). No tuned constant such as
 * repository age or commit count is introduced; REPO_FURNITURE_PATTERNS (lib/config.js) is a
 * named, explicit list of conventional repo-scaffolding filenames (LICENSE, README, .gitignore,
 * anything under .github/, ...), not a numeric threshold.
 *
 * This is deliberately scoped to scaffold detection only: isRepoFurniture is not folded into
 * analyzeCommit's own prodFiles classification, so large_commit, sprawling_commit,
 * uncovered_prod_rate and duplication scanning are all unaffected by this change -- a LICENSE
 * change in an ordinary (non-root) commit still counts exactly as it always has for every
 * other metric.
 *
 * A file counts as production here when it is not a test file, not excluded by
 * CONFIG.ANALYSIS_IGNORE_PATTERNS, and not repo furniture. Under bare default configuration
 * (CONFIG.ANALYSIS_IGNORE_PATTERNS empty), a commit whose only files are LICENSE + README.md --
 * stride-nyc/73V's actual root commit, ec1026c4 -- now introduces zero production files by this
 * rule, without requiring any operator configuration.
 * @param {string} sha
 * @returns {boolean}
 */
function commitIntroducesProductionFiles(sha) {
  const output = runGitCommand(`git show --name-only --format="" ${sha}`);
  if (!output) return false;
  return output
    .split('\n')
    .filter(Boolean)
    .some(filename => !isExcludedPath(filename) && !isTestFile(filename) && !isRepoFurniture(filename));
}

/**
 * Find the effective start-of-history commit for one repository root commit, accounting for a
 * scaffold root that introduces no production files (code-quality-metrics-fex3, GitHub #71). A
 * production-bearing root is its own effective root, unchanged. A root that introduces none is
 * walked forward -- oldest-first, across the whole repository's history via `git log --all
 * --reverse`, not just the refs actually analyzed, the same "whole repository" scope
 * findRepositoryRootShas already uses -- to the first later commit that does introduce a
 * production file, so the lifecycle test measures against the true start of development rather
 * than a scaffold commit that can sit years before it (measured: stride-nyc/73V, root
 * 2022-01-26, three-year dormancy, then 2,928 commits from 2025-01-24 onward).
 *
 * If no later commit introduces one either (the repository's whole history is scaffold-only),
 * rootSha is returned unchanged -- there is nothing better to fall back to.
 *
 * Distinguishes a genuine command failure from the command succeeding with no candidates found
 * (GitHub #89): runGitCommand collapses both into '', which previously let an ENOBUFS-sized
 * history (or any other git failure) read as "no scaffold root found" -- indistinguishable from
 * a genuinely non-scaffold root, silently defeating the greenfield detection this function
 * exists to support. execSync's own success/failure is asked here directly, the same way
 * findRepositoryRootShas and analyzeCommit's numstat query already do
 * (code-quality-metrics-p4c, code-quality-metrics-dqri). Fixing only the maxBuffer ceiling
 * above without this would leave the class of bug in place for the next history that outgrows
 * even a raised buffer.
 * @param {string} rootSha
 * @returns {{ sha: string, failed: boolean }}
 */
function findEffectiveRootSha(rootSha) {
  if (commitIntroducesProductionFiles(rootSha)) return { sha: rootSha, failed: false };

  // Not runGitCommand: this query emits one SHA per commit across every ref, so its output can
  // exceed execSync's ~1MB default maxBuffer on a large history (GitHub #89, measured on
  // ziglang/zig's 36,058-commit history at ~1.48MB). CONFIG.GIT_LOG_MAX_BUFFER raises that
  // ceiling well above every measured case; see its own comment (lib/config.js) for the sizing.
  let log;
  try {
    log = execSync('git log --all --reverse --pretty=format:%H', { encoding: 'utf8', maxBuffer: CONFIG.GIT_LOG_MAX_BUFFER }).trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error running Git command: git log --all --reverse --pretty=format:%H');
    console.error(`Error: ${msg}`);
    return { sha: rootSha, failed: true };
  }

  const allShas = log ? log.split('\n').filter(Boolean) : [];
  const rootIndex = allShas.indexOf(rootSha);
  const candidates = rootIndex >= 0 ? allShas.slice(rootIndex + 1) : allShas;

  for (const sha of candidates) {
    if (commitIntroducesProductionFiles(sha)) return { sha, failed: false };
  }
  return { sha: rootSha, failed: false };
}

/**
 * Count commits reachable from each of the given refs since a date boundary, summed across
 * refs. Used as an independent cross-check against the commit count local-code-metrics.js's own
 * git log fetch actually returned (code-quality-metrics-tde9): a large gap between the two means
 * the analysis target was misresolved (wrong ref, a stale remote-tracking branch, or a broken
 * partial-clone fetch after `git remote remove origin`), not that the window genuinely
 * contained few commits.
 *
 * --no-merges matches fetchBranchCommits' own boundary exactly (local-code-metrics.js), so a
 * comparison against a genuinely merge-heavy repository (ember.js, git.git) does not read as a
 * false discrepancy. A ref that fails to resolve contributes 0 rather than throwing, the same
 * graceful degradation runGitCommand already gives every other caller in this file.
 *
 * sinceStr is optional: omitting it (used by the --max-commits unbounded safety pre-flight
 * check in local-code-metrics.js) counts each ref's whole reachable history instead of a
 * dated window, with no --since clause in the command at all.
 * @param {string[]} refs
 * @param {string} [sinceStr]
 * @returns {number}
 */
function getExpectedCommitCount(refs, sinceStr) {
  const sinceArg = sinceStr ? `--since="${sinceStr}" ` : '';
  return refs.reduce((total, ref) => {
    const output = runGitCommand(`git rev-list --no-merges --count ${sinceArg}${ref}`);
    const count = parseInt(output, 10);
    return total + (Number.isNaN(count) ? 0 : count);
  }, 0);
}

/**
 * The committer date (YYYY-MM-DD) of the newest commit reachable from any of the given refs,
 * or null when none is found (rather than an empty string, so a caller can tell "no answer"
 * apart from a genuinely empty date).
 * @param {string[]} refs
 * @returns {string|null}
 */
function findNewestCommitDate(refs) {
  const output = runGitCommand(`git log ${refs.join(' ')} -1 --pretty=format:%cs`);
  return output || null;
}

module.exports = { runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff, detectHistoryGranularity, findContentDuplicateGroups, windowIncludesRepositoryRoot, findRepositoryRootShas, commitIntroducesProductionFiles, findEffectiveRootSha, getExpectedCommitCount, findNewestCommitDate };
