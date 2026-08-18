// @ts-nocheck
'use strict';

const { CONFIG } = require('./config');
const { THRESHOLDS } = require('./thresholds');

/**
 * Check if a filename matches test file patterns.
 * Defined here (not lib/git.js) so GitHub Actions workflows can require('./lib/metrics')
 * without pulling in child_process-dependent git functions.
 * @param {string} filename
 * @returns {boolean}
 */
function isTestFile(filename) {
  return CONFIG.TEST_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/** @type {RegExp} */
const CONVENTIONAL_COMMIT_RE = /^(feat|fix|refactor|test|chore|docs|perf|ci|build|revert)(\(.+\))?:/i;

/**
 * @type {RegExp} A `Key: value` line, matching git's own trailer line shape (a token of
 * letters, digits, and hyphens, a colon, then a non-empty value). Matched generically rather
 * than against an enumerated list of known names (PR-URL, Reviewed-By, Signed-off-by, ...) so
 * unfamiliar trailers (Change-Id, See-Also, ...) are recognized too.
 */
const TRAILER_LINE_RE = /^([A-Za-z][A-Za-z0-9-]*):\s+\S/;

/**
 * @param {string} line
 * @returns {boolean}
 */
function isTrailerLine(line) {
  return TRAILER_LINE_RE.test(line.trim());
}

/**
 * Strip a trailing block of `Key: value` trailer lines (PR-URL, Reviewed-By, etc.) from a
 * commit body, so that trailer volume does not pad the word-count quality check. Only the
 * final paragraph (the run of non-blank lines at the end of the message) is considered, and
 * only when every line in it is a trailer line; the subject line itself is never stripped.
 * @param {string} text
 * @returns {string}
 */
function stripTrailingTrailerBlock(text) {
  const lines = text.split('\n');
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  let start = end;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  if (start === 0) return text;
  const paragraph = lines.slice(start, end);
  if (paragraph.length === 0 || !paragraph.every(isTrailerLine)) return text;
  let newEnd = start;
  while (newEnd > 0 && lines[newEnd - 1].trim() === '') newEnd--;
  return lines.slice(0, newEnd).join('\n');
}

/**
 * Score a single commit message for quality.
 * Quality = conventional commit format OR word count >= MESSAGE_QUALITY_MIN_WORDS.
 *
 * Scores fullMessage (the entire commit body: %B) when it is available, since a short,
 * conventional subject line with the explanation in the body, common in the pre-Conventional-
 * Commits era (postgres, curl, git), would otherwise never accumulate enough words to pass.
 * Falls back to message (the subject line alone) when fullMessage is absent, which is the
 * case for callers driven by the GitHub REST API (.github/workflows/pr-metrics.yml and
 * code-metrics.yml, which only have the equivalent of the subject line).
 *
 * A trailing block of trailer lines (PR-URL, Reviewed-By, Signed-off-by, etc.) is stripped
 * before the word-count check, so trailer volume alone cannot pass a message with no prose.
 * @param {string} message
 * @param {string} [fullMessage]
 * @returns {boolean}
 */
function scoreMessageQuality(message, fullMessage) {
  const text = fullMessage || message;
  if (!text) return false;
  if (CONVENTIONAL_COMMIT_RE.test(text)) return true;
  const withoutTrailers = stripTrailingTrailerBlock(text);
  return withoutTrailers.split(/\s+/).filter(Boolean).length >= CONFIG.MESSAGE_QUALITY_MIN_WORDS;
}

/**
 * Classify a repo into a DORA team archetype based on summary metrics.
 * Evaluated in priority order: harmonious-high-achiever → legacy-bottleneck → foundational-challenges → mixed-signals
 * @param {{ large_commits_pct: string, sprawling_commits_pct: string, test_coverage_rate: string, uncovered_prod_rate: string, message_quality_pct: string }} summary
 * @returns {string}
 */
function classifyDoraArchetype(summary) {
  const large = parseFloat(summary.large_commits_pct);
  const sprawling = parseFloat(summary.sprawling_commits_pct);
  const testCoverage = parseFloat(summary.test_coverage_rate);
  const uncoveredProd = parseFloat(summary.uncovered_prod_rate);
  const msgQuality = parseFloat(summary.message_quality_pct);

  const { HARMONIOUS, LEGACY_BOTTLENECK, FOUNDATIONAL_CHALLENGES } = THRESHOLDS.DORA_ARCHETYPE;

  if (large < HARMONIOUS.large && sprawling < HARMONIOUS.sprawling && testCoverage > HARMONIOUS.testCoverage && uncoveredProd < HARMONIOUS.uncoveredProd && msgQuality > HARMONIOUS.messageQuality) return 'harmonious-high-achiever';
  if (sprawling > LEGACY_BOTTLENECK.sprawling && large > LEGACY_BOTTLENECK.large) return 'legacy-bottleneck';
  if (large > FOUNDATIONAL_CHALLENGES.large || uncoveredProd > FOUNDATIONAL_CHALLENGES.uncoveredProd) return 'foundational-challenges';
  return 'mixed-signals';
}

/**
 * Whether a value exceeds a metric's critical bound. Returns false when the
 * bound is null/undefined (a two-band metric: calibration/derive-bands.js
 * found the extreme rests on a single reference repo/window, see
 * lib/thresholds.js's comments) rather than comparing against it directly --
 * `value > null` coerces null to 0 and would fabricate a critical verdict for
 * any positive value, which is the defect this guard exists to prevent.
 * @param {number} value
 * @param {{critical?: (number|null)}} threshold
 * @returns {boolean}
 */
function exceedsCritical(value, threshold) {
  return threshold.critical !== null && threshold.critical !== undefined && value > threshold.critical;
}

/**
 * Generate insights based on metrics
 * @param {{ large_commits_pct: string, sprawling_commits_pct: string, test_coverage_rate: string, test_isolation_rate: string, uncovered_prod_rate: string, avg_lines_changed: string }} summary
 * @param {Array<object>} metrics
 * @returns {{ insights: string[], warnings: string[], recommendations: string[] }}
 */
function generateInsights(summary, metrics) {
  const insights = [];
  const warnings = [];
  const recommendations = [];

  const largePct = parseFloat(summary.large_commits_pct);
  const sprawlingPct = parseFloat(summary.sprawling_commits_pct);
  const testCoveragePct = parseFloat(summary.test_coverage_rate);
  const testIsolationPct = parseFloat(summary.test_isolation_rate);
  const uncoveredProdPct = parseFloat(summary.uncovered_prod_rate);
  const avgLines = parseFloat(summary.avg_lines_changed);

  if (exceedsCritical(largePct, THRESHOLDS.LARGE_COMMITS_PCT)) {
    warnings.push(`🚨 Very high large commit rate (${largePct}%) - Strong AI drift indicators`);
    recommendations.push('Consider breaking AI-generated code into smaller, focused commits');
  } else if (largePct > THRESHOLDS.LARGE_COMMITS_PCT.healthy) {
    warnings.push(`⚠️ High large commit rate (${largePct}%) - Monitor AI tool usage patterns`);
  } else {
    insights.push(`✅ Healthy large commit rate (${largePct}%)`);
  }

  if (exceedsCritical(sprawlingPct, THRESHOLDS.SPRAWLING_COMMITS_PCT)) {
    warnings.push(`🚨 Very high sprawling commit rate (${sprawlingPct}%) - Possible shotgun surgery`);
    recommendations.push('Review if AI suggestions are causing scattered changes across unrelated files');
  } else if (sprawlingPct > THRESHOLDS.SPRAWLING_COMMITS_PCT.healthy) {
    warnings.push(`⚠️ High sprawling commit rate (${sprawlingPct}%) - Watch for scope creep`);
  } else {
    insights.push(`✅ Good sprawling commit control (${sprawlingPct}%)`);
  }

  if (exceedsCritical(uncoveredProdPct, THRESHOLDS.UNCOVERED_PROD_RATE)) {
    warnings.push(`🚨 High rate of uncovered production commits (${uncoveredProdPct}%) - Large prod commits with no tests`);
    recommendations.push('Write tests before accepting AI-generated production code');
  } else if (uncoveredProdPct >= THRESHOLDS.UNCOVERED_PROD_RATE.healthy) {
    warnings.push(`⚠️ Elevated uncovered production commits (${uncoveredProdPct}%) - Monitor test discipline`);
  }

  if (testCoveragePct > THRESHOLDS.TEST_COVERAGE_RATE.healthy) {
    insights.push(`✅ Strong test coverage discipline (${testCoveragePct}%)`);
  } else if (testCoveragePct < THRESHOLDS.TEST_COVERAGE_RATE.warning) {
    warnings.push(`⚠️ Low test coverage rate (${testCoveragePct}%) - AI tools may be bypassing TDD`);
    recommendations.push('Ensure test coverage when accepting AI-generated code');
  }

  if (testIsolationPct > THRESHOLDS.TEST_ISOLATION_RATE.positive) {
    insights.push(`✅ Healthy rate of test-only commits (${testIsolationPct}%) - TDD red-phase or test improvement commits visible`);
  }

  if (exceedsCritical(avgLines, THRESHOLDS.AVG_LINES_CHANGED)) {
    warnings.push(`🚨 Very high average lines per commit (${avgLines}) - Extreme batch coding`);
    recommendations.push('Implement strict commit size limits when using AI tools');
  } else if (avgLines > THRESHOLDS.AVG_LINES_CHANGED.healthy) {
    warnings.push(`⚠️ High average lines per commit (${avgLines}) - Monitor AI batch acceptance`);
  }

  const possibleAICommits = metrics.filter(m =>
    m.large_commit && m.total_additions > m.total_deletions * THRESHOLDS.AI_BATCH_SHARE.additionsRatio
  ).length;

  if (possibleAICommits > metrics.length * THRESHOLDS.AI_BATCH_SHARE.share) {
    warnings.push(`🤖 High proportion of addition-heavy large commits (${possibleAICommits}/${metrics.length}) - Possible AI batch acceptance`);
  }

  return { insights, warnings, recommendations };
}

module.exports = { isTestFile, scoreMessageQuality, classifyDoraArchetype, generateInsights };
