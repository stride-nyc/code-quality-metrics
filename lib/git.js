// @ts-nocheck
'use strict';

const { execSync } = require('child_process');
const { CONFIG } = require('./config');
const { isTestFile } = require('./metrics');

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

    const statsOutput = runGitCommand(`git show --numstat --format="" ${sha}`);
    if (!statsOutput) {
      console.warn(`  Warning: No stats found for commit ${sha}`);
      return null;
    }

    const statsLines = statsOutput.split('\n').filter(line => line.trim());

    let totalAdditions = 0;
    let totalDeletions = 0;
    let prodAdditions = 0;
    let prodDeletions = 0;
    let filesChanged = 0;
    let testFiles = 0;
    let prodFiles = 0;
    let binaryFiles = 0;
    /** @type {string[]} */
    const prodFilePaths = [];

    for (const line of statsLines) {
      const [additions, deletions, filename] = line.split('\t');
      if (!filename) continue;

      filesChanged++;

      // Handle binary files (marked with '-' in git numstat)
      if (additions === '-' && deletions === '-') {
        binaryFiles++;
        continue;
      }

      const addNum = parseInt(additions) || 0;
      const delNum = parseInt(deletions) || 0;

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
      test_first_indicator: testFiles > 0 && prodFiles > 0,
      test_only_commit: testFiles > 0 && prodFiles === 0,
      prod_additions: prodAdditions,
      prod_deletions: prodDeletions,
      uncovered_prod_commit: testFiles === 0 && prodFiles > 0 && prodLines > CONFIG.LARGE_COMMIT_THRESHOLD,
      large_commit: prodLines > CONFIG.LARGE_COMMIT_THRESHOLD,
      sprawling_commit: filesChanged > CONFIG.SPRAWLING_COMMIT_THRESHOLD,
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

module.exports = { runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff, detectHistoryGranularity };
