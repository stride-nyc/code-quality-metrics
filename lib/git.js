// @ts-nocheck
'use strict';

const { execSync } = require('child_process');
const { CONFIG } = require('./config');
const { isTestFile, isExcludedPath, matchesAnyPattern } = require('./metrics');

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

/**
 * Parse Git log output into structured commit data.
 * Expects one record per commit, fields pipe-delimited (sha|author-date|author|body),
 * records separated by RECORD_SEPARATOR (git format `%H|%ai|%an|%B%x1e`).
 * @param {string} logOutput
 * @returns {Array<{sha: string, full_sha: string, date: string, author: string, message: string, full_message: string, source_branch?: string}>}
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
      const full_message = messageParts.join('|');
      commits.push({
        sha: sha.substring(0, 8),
        full_sha: sha,
        date,
        author,
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
    // this toolkit identifies as the strongest protection against drift. total_additions
    // and total_deletions stay whole-diff, since the size distributions describe how much
    // a reviewer actually reads.
    const prodLines = prodAdditions + prodDeletions;

    return {
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      files_changed: filesChanged,
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
 * @returns {{ value: 'granular'|'squashed'|'unknown', confidence: 'high'|'low', signals: { pr_reference_share: number, squash_committer_share: number, merge_commit_count: number } }}
 */
function detectHistoryGranularity({ commits, committerNames, mergeCommitCount }) {
  const total = commits.length;
  if (total === 0) {
    return {
      value: 'unknown',
      confidence: 'low',
      signals: { pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: mergeCommitCount }
    };
  }

  const prReferenceShare = commits.filter(c => PR_REFERENCE_PATTERN.test(c.message || '')).length / total;
  const squashCommitterShare = committerNames.length > 0
    ? committerNames.filter(name => SQUASH_COMMITTER_PATTERN.test(name)).length / committerNames.length
    : 0;
  const hasMergeCommits = mergeCommitCount > 0;
  const signals = { pr_reference_share: prReferenceShare, squash_committer_share: squashCommitterShare, merge_commit_count: mergeCommitCount };

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

module.exports = { runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff, detectHistoryGranularity, windowIncludesRepositoryRoot };
