// @ts-nocheck
'use strict';

const { minimatch } = require('minimatch');
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

/**
 * Check if a filename matches any of the given glob patterns. Shared by isExcludedPath
 * below and by lib/git.js's vendored/generated-default observational check
 * (code-quality-metrics-3b6), so both consult the same matcher rather than growing a
 * second glob implementation.
 * @param {string} filename
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesAnyPattern(filename, patterns) {
  return patterns.some(pattern => minimatch(filename, pattern));
}

/**
 * Check if a filename matches CONFIG.ANALYSIS_IGNORE_PATTERNS: a path this toolkit should
 * count as NEITHER test nor production, excluded from the commit-shape metrics entirely
 * (large_commit, sprawling_commit, the line-count distributions, prod/test classification,
 * uncovered_prod_rate). isTestFile alone cannot express this -- it can only sort a file
 * into test or production, never "neither" (code-quality-metrics-y8j).
 *
 * Defined here (not lib/git.js) so both GitHub Actions workflows can require('./lib/metrics')
 * and apply the same exclusion their own inline classification uses, the same reason
 * isTestFile lives here rather than in the git-shell-command module.
 *
 * Default CONFIG.ANALYSIS_IGNORE_PATTERNS is [], so this returns false for every path until
 * a repo configures it (lib/config.js, code-quality-metrics-3yd) -- provably
 * behaviour-preserving for every existing measurement.
 * @param {string} filename
 * @returns {boolean}
 */
function isExcludedPath(filename) {
  return matchesAnyPattern(filename, CONFIG.ANALYSIS_IGNORE_PATTERNS);
}

/**
 * Check if a filename is repo furniture: a file GitHub's own repo-creation wizard adds, or
 * that convention expects at the root of nearly every repository, carrying no production
 * signal of its own (code-quality-metrics-fex3, GitHub #71). Matched against
 * CONFIG.REPO_FURNITURE_PATTERNS -- a named, explicit list in lib/config.js, not a tuned
 * number -- so a scaffold root commit (e.g. stride-nyc/73V's actual root, LICENSE + README.md
 * only) is detected structurally under default configuration, without requiring
 * ANALYSIS_IGNORE_PATTERNS to be configured first.
 * @param {string} filename
 * @returns {boolean}
 */
function isRepoFurniture(filename) {
  return CONFIG.REPO_FURNITURE_PATTERNS.some(pattern => pattern.test(filename));
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
 * @type {RegExp} A `Co-Authored-By: <name> <email>` trailer line, matched case-insensitively.
 * Captures the value so the name portion can be tested against AI_AGENT_PATTERNS separately
 * from every other trailer (PR-URL, Reviewed-By, ...), which carry no AI-agent signal.
 */
const CO_AUTHOR_TRAILER_RE = /^co-authored-by:\s*(.+)$/i;

/**
 * Extract the value of every `Co-Authored-By:` trailer line from a commit body.
 * @param {string} [fullMessage]
 * @returns {string[]}
 */
function extractCoAuthors(fullMessage) {
  if (!fullMessage) return [];
  return fullMessage
    .split('\n')
    .map(line => line.trim())
    .map(line => line.match(CO_AUTHOR_TRAILER_RE))
    .filter(Boolean)
    .map(match => /** @type {RegExpMatchArray} */ (match)[1]);
}

/**
 * Whether a commit is attributable to an AI coding agent (Claude Code, Copilot, Cursor,
 * Devin, Aider, ...; see CONFIG.AI_AGENT_PATTERNS) by author, committer, or a
 * `Co-Authored-By:` trailer in the commit message. These commits are the *subject* this
 * toolkit's metrics exist to measure, never the noise isBotCommit below filters out --
 * see isBotCommit's own doc comment for why this function is checked first there.
 * @param {{ author?: string, committer?: string, message?: string, full_message?: string }} commit
 * @returns {boolean}
 */
function isAIAgentCommit({ author, committer, message, full_message } = {}) {
  const patterns = CONFIG.AI_AGENT_PATTERNS;
  const matchesAny = (/** @type {string} */ value) => patterns.some(pattern => pattern.test(value));

  if (author && matchesAny(author)) return true;
  if (committer && matchesAny(committer)) return true;

  const coAuthors = extractCoAuthors(full_message || message);
  return coAuthors.some(matchesAny);
}

/**
 * Whether a commit is a dependency/CI bot commit (dependabot, renovate, github-actions,
 * release/version-bump bots, other [bot] accounts; see CONFIG.BOT_ACCOUNT_PATTERNS) that
 * should be excluded from the metrics denominators (issue #62).
 *
 * isAIAgentCommit is checked FIRST and unconditionally overrides a bot match: AI coding
 * agents are the subject this toolkit measures, not noise, and a bare `/\[bot\]$/` pattern
 * in BOT_ACCOUNT_PATTERNS would otherwise also catch a "claude[bot]"-style account and
 * silently remove that signal. This ordering is the fix for exactly that failure mode, not
 * an incidental detail.
 * @param {{ author?: string, committer?: string, message?: string, full_message?: string }} commit
 * @returns {boolean}
 */
function isBotCommit(commit = {}) {
  if (isAIAgentCommit(commit)) return false;

  const { author, committer } = commit;
  const patterns = CONFIG.BOT_ACCOUNT_PATTERNS;
  const matchesAny = (/** @type {string} */ value) => patterns.some(pattern => pattern.test(value));

  return Boolean((author && matchesAny(author)) || (committer && matchesAny(committer)));
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
 * Classify a repo into a DORA-named team archetype based on summary metrics.
 * Evaluated in priority order: harmonious-high-achiever → legacy-bottleneck → foundational-challenges → mixed-signals.
 *
 * Every boundary below reads a per-metric band from THRESHOLDS directly (LARGE_COMMITS_PCT,
 * SPRAWLING_COMMITS_PCT, TEST_COVERAGE_RATE, UNCOVERED_PROD_RATE) rather than a copy of it under
 * a DORA_ARCHETYPE key, so a recalibration of any of those bands moves this classifier's
 * boundary too, instead of leaving a second, unsynced number behind to go stale
 * (code-quality-metrics-6vi: sprawling's copy had drifted to nearly half the calibrated value).
 * message_quality_pct, if present on summary, is accepted but not read: MESSAGE_QUALITY_PCT
 * carries no band in THRESHOLDS (see lib/thresholds.js's removal-site comment), and scoring
 * this archetype against an un-banded metric would reinstate the exact verdict the band's
 * removal rejected. uncovered_prod_rate is likewise only usable against .healthy: it is a
 * two-band metric with no .critical, so foundational-challenges has only a large-commit path.
 * Both LARGE_COMMITS_PCT.critical and SPRAWLING_COMMITS_PCT.critical are currently null under
 * the re-measured calibration (lib/thresholds.js), which makes legacy-bottleneck and
 * foundational-challenges both unreachable in practice right now -- correctly so, since
 * neither has a critical bound left to exceed. The critical-bound comparisons below go through
 * exceedsCritical (defined further down this file, reused from generateInsights) rather than a
 * raw `>`, so a null bound reads as "cannot be exceeded" instead of JS coercing it to 0 and
 * fabricating a critical breach for any positive value.
 * @param {{ large_commits_pct: string, sprawling_commits_pct: string, test_coverage_rate: string, uncovered_prod_rate: string, message_quality_pct?: string }} summary
 * @returns {string}
 */
function classifyDoraArchetype(summary) {
  const large = parseFloat(summary.large_commits_pct);
  const sprawling = parseFloat(summary.sprawling_commits_pct);
  const testCoverage = parseFloat(summary.test_coverage_rate);
  const uncoveredProd = parseFloat(summary.uncovered_prod_rate);

  const { LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT, TEST_COVERAGE_RATE, UNCOVERED_PROD_RATE } = THRESHOLDS;

  if (large < LARGE_COMMITS_PCT.healthy && sprawling < SPRAWLING_COMMITS_PCT.healthy && testCoverage > TEST_COVERAGE_RATE.healthy && uncoveredProd < UNCOVERED_PROD_RATE.healthy) return 'harmonious-high-achiever';
  // exceedsCritical (defined below), not a raw `>` comparison: SPRAWLING_COMMITS_PCT.critical
  // and LARGE_COMMITS_PCT.critical are both null under the current calibration (see
  // lib/thresholds.js), and `value > null` coerces null to 0, which would fabricate a critical
  // breach for any positive value -- exactly the defect exceedsCritical exists to prevent, and
  // generateInsights below already relies on it for the same reason. With both bounds null,
  // legacy-bottleneck and foundational-challenges are (correctly) unreachable: there is no
  // critical bound left for either to have exceeded.
  if (exceedsCritical(sprawling, SPRAWLING_COMMITS_PCT) && exceedsCritical(large, LARGE_COMMITS_PCT)) return 'legacy-bottleneck';
  if (exceedsCritical(large, LARGE_COMMITS_PCT)) return 'foundational-challenges';
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
 * @param {{ large_commits_pct: string, sprawling_commits_pct: string, test_coverage_rate: string, test_isolation_rate: string, uncovered_prod_rate: string }} summary
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

  // avg_lines_changed is deliberately not read here: AVG_LINES_CHANGED carries no band in
  // THRESHOLDS any more (see lib/thresholds.js's removal-site comment) because three
  // independent published fits agree commit size is heavy-tailed with no finite mean, so a
  // mean-based lines-per-commit warning would score against a statistic the population does
  // not have (code-quality-metrics-6dg).

  const possibleAICommits = metrics.filter(m =>
    m.large_commit && m.total_additions > m.total_deletions * THRESHOLDS.AI_BATCH_SHARE.additionsRatio
  ).length;

  if (possibleAICommits > metrics.length * THRESHOLDS.AI_BATCH_SHARE.share) {
    warnings.push(`🤖 High proportion of addition-heavy large commits (${possibleAICommits}/${metrics.length}) - Possible AI batch acceptance`);
  }

  // Loud-failure guard (code-quality-metrics-tde9): compares the commit count this run's own
  // git log fetch returned (summary.filtered_from) against an independent `git rev-list --count`
  // over the same resolved ref(s) (summary.window_expected_commit_count, computed by
  // getExpectedCommitCount in lib/git.js and only set when an explicit --since/--days window
  // was requested and not later widened). A report that looks complete and well-formed can
  // still be analyzing the wrong target entirely -- see the reproduction case this guards
  // against: a repo pinned to a historical repo_head selected 1 commit where git itself
  // reported 178 reachable in the same window, with nothing in the original report saying so.
  if (typeof summary.window_expected_commit_count === 'number' && summary.window_expected_commit_count > 0) {
    const selected = Number(summary.filtered_from) || 0;
    const expected = summary.window_expected_commit_count;
    if (selected < expected * CONFIG.WINDOW_COMMIT_COUNT_DISCREPANCY_RATIO) {
      warnings.push(`🚨 Commit count mismatch: the tool selected ${selected} commit(s) since the requested window, but git reports ${expected} reachable from the analyzed ref(s) - the analysis target may be misresolved (wrong ref, stale remote-tracking branch, or a broken partial clone)`);
    }
  }

  // Window span sanity check (code-quality-metrics-tde9), scoped to an explicit, non-widened
  // --since/--days request: a healthy run can easily analyze a span that starts BEFORE the
  // requested since date (author date vs. the committer-date boundary --since filters on), so
  // this only ever compares in the other direction -- the analyzed span starting well AFTER
  // what was requested, which is the signature of other branches or refs contaminating the
  // analyzed sample (see the 2026-08-01 requested / 2026-08-12 actual case this guards against).
  if (summary.window_requested_since && !summary.window_widened && summary.analyzed_span_start) {
    const requested = new Date(summary.window_requested_since);
    const spanStart = new Date(summary.analyzed_span_start);
    const lagDays = (spanStart.getTime() - requested.getTime()) / (24 * 60 * 60 * 1000);
    if (lagDays > CONFIG.WINDOW_SPAN_LAG_DAYS) {
      warnings.push(`⚠️ Requested window since ${summary.window_requested_since}, but the analyzed span starts ${Math.round(lagDays)} day(s) after that (${summary.analyzed_span_start}) - other branches or refs may be contaminating the analyzed sample`);
    }
  }

  // Collapsed-window check (code-quality-metrics-tde9): an explicit --since request spanning
  // weeks or months of real history that nonetheless analyzed a single calendar day is the
  // signature of a broken target resolution (e.g. a partial clone that silently lost most of
  // its history after `git remote remove origin`), not of a genuinely quiet single-day window --
  // scoped to an explicit, non-widened request for the same reason as the lag check above.
  if (summary.window_requested_since && !summary.window_widened
    && summary.analyzed_span_start && summary.analyzed_span_start === summary.analyzed_span_end) {
    warnings.push(`⚠️ The analyzed span collapsed to a single day (${summary.analyzed_span_start}) for a requested window since ${summary.window_requested_since} - the analysis target may be misresolved`);
  }

  return { insights, warnings, recommendations };
}

module.exports = { isTestFile, isExcludedPath, isRepoFurniture, matchesAnyPattern, isAIAgentCommit, isBotCommit, scoreMessageQuality, classifyDoraArchetype, generateInsights };
