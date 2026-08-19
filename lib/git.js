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
      outlier: false,
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

module.exports = { runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff };
