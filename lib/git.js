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

/**
 * Parse Git log output into structured commit data
 * @param {string} logOutput
 * @returns {Array<{sha: string, full_sha: string, date: string, author: string, message: string, source_branch?: string}>}
 */
function parseGitLog(logOutput) {
  if (!logOutput) return [];

  const commits = [];
  const lines = logOutput.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 4) continue;

    const [sha, date, author, ...messageParts] = parts;
    if (sha && sha.length === 40) {
      commits.push({
        sha: sha.substring(0, 8),
        full_sha: sha,
        date,
        author,
        message: messageParts.join('|')
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
    let filesChanged = 0;
    let testFiles = 0;
    let prodFiles = 0;
    let binaryFiles = 0;

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
      }
    }

    const totalLines = totalAdditions + totalDeletions;

    return {
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      files_changed: filesChanged,
      binary_files: binaryFiles,
      test_files_count: testFiles,
      prod_files_count: prodFiles,
      test_first_indicator: testFiles > 0 && prodFiles > 0,
      large_commit: totalLines > CONFIG.LARGE_COMMIT_THRESHOLD,
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
