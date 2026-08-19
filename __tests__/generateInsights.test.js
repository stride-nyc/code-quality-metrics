'use strict';

const { generateInsights } = require('../local-code-metrics');
const { THRESHOLDS } = require('../lib/thresholds');

/** Build a minimal summary object with overridable fields */
function makeSummary(overrides = {}) {
  return {
    large_commits_pct: '0.00',
    sprawling_commits_pct: '0.00',
    test_coverage_rate: '60.00',
    test_isolation_rate: '10.00',
    uncovered_prod_rate: '0.00',
    avg_lines_changed: '50.00',
    ...overrides
  };
}

/** Build a minimal CommitMetric-like object */
function makeMetric(overrides = {}) {
  return {
    large_commit: false,
    total_additions: 10,
    total_deletions: 10,
    files_changed: 2,
    test_files_count: 1,
    prod_files_count: 1,
    test_prod_cochange_commit: true,
    sprawling_commit: false,
    source_branch: 'feature/x',
    binary_files: 0,
    change_ratio: '1.00',
    sha: 'abc12345',
    full_sha: 'abc12345'.padEnd(40, '0'),
    date: '2024-01-01',
    author: 'Dev',
    message: 'chore: update',
    commit_type: 'feature_branch',
    ...overrides
  };
}

describe('generateInsights', () => {
  // --- degenerate / zero case ---
  test('returns empty arrays when metrics list is empty and values are zero', () => {
    const { insights, warnings, recommendations } = generateInsights(
      makeSummary({ large_commits_pct: '0.00', sprawling_commits_pct: '0.00', test_coverage_rate: '60.00', uncovered_prod_rate: '0.00' }),
      []
    );
    expect(warnings).toEqual([]);
    expect(recommendations).toEqual([]);
    expect(insights).toHaveLength(3); // healthy large + healthy sprawling + strong test coverage (60% > THRESHOLDS.TEST_COVERAGE_RATE.healthy)
  });

  // --- healthy thresholds produce positive insights, no warnings ---
  test('emits healthy insight for large_commits_pct below healthy', () => {
    const value = THRESHOLDS.LARGE_COMMITS_PCT.healthy - 4;
    const { insights, warnings } = generateInsights(makeSummary({ large_commits_pct: String(value) }), []);
    expect(warnings.some(w => w.includes('large commit'))).toBe(false);
    expect(insights.some(i => i.includes('Healthy large commit rate'))).toBe(true);
  });

  test('emits healthy insight for sprawling_commits_pct below healthy', () => {
    const value = THRESHOLDS.SPRAWLING_COMMITS_PCT.healthy - 13;
    const { insights, warnings } = generateInsights(makeSummary({ sprawling_commits_pct: String(value) }), []);
    expect(warnings.some(w => w.includes('sprawling'))).toBe(false);
    expect(insights.some(i => i.includes('Good sprawling commit control'))).toBe(true);
  });

  test('emits positive insight for test_coverage_rate above healthy', () => {
    const value = THRESHOLDS.TEST_COVERAGE_RATE.healthy + 5;
    const { insights } = generateInsights(makeSummary({ test_coverage_rate: String(value) }), []);
    expect(insights.some(i => i.includes('Strong test coverage'))).toBe(true);
  });

  // --- warning thresholds ---
  test('emits warning (not critical) for large_commits_pct between healthy and critical', () => {
    const band = THRESHOLDS.LARGE_COMMITS_PCT;
    const value = (band.healthy + band.critical) / 2;
    const { warnings } = generateInsights(makeSummary({ large_commits_pct: value.toFixed(2) }), []);
    expect(warnings.some(w => w.includes('High large commit rate'))).toBe(true);
    expect(warnings.some(w => w.includes('Very high'))).toBe(false);
  });

  test('emits critical warning for large_commits_pct above critical', () => {
    const value = THRESHOLDS.LARGE_COMMITS_PCT.critical + 5;
    const { warnings, recommendations } = generateInsights(makeSummary({ large_commits_pct: String(value) }), []);
    expect(warnings.some(w => w.includes('Very high large commit rate'))).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  test('emits warning (not critical) for sprawling_commits_pct between healthy and critical', () => {
    const band = THRESHOLDS.SPRAWLING_COMMITS_PCT;
    const value = (band.healthy + band.critical) / 2;
    const { warnings } = generateInsights(makeSummary({ sprawling_commits_pct: value.toFixed(2) }), []);
    expect(warnings.some(w => w.includes('High sprawling commit rate'))).toBe(true);
    expect(warnings.some(w => w.includes('Very high'))).toBe(false);
  });

  // sprawling_commits_pct is three-band under era:current (calibration/derive-bands.js:
  // two distinct repos corroborate the max, nodejs/node and curl/curl) -- unlike the
  // prior pooled-derivation band, where it was two-band, a value above its critical
  // bound must now read as critical, the same as any other three-band metric.
  test('emits critical warning for sprawling_commits_pct above critical', () => {
    const value = THRESHOLDS.SPRAWLING_COMMITS_PCT.critical + 5;
    const { warnings, recommendations } = generateInsights(makeSummary({ sprawling_commits_pct: String(value) }), []);
    expect(warnings.some(w => w.includes('Very high sprawling commit rate'))).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  test('emits warning for test_coverage_rate below the low-coverage cutoff', () => {
    // Gated by THRESHOLDS.TEST_COVERAGE_RATE.warning, not .healthy -- see
    // lib/thresholds.js's comment on why the two can differ. Using the smaller
    // of the two keeps this test correct regardless of which one moves.
    const value = Math.min(THRESHOLDS.TEST_COVERAGE_RATE.healthy, THRESHOLDS.TEST_COVERAGE_RATE.warning) - 5;
    const { warnings } = generateInsights(makeSummary({ test_coverage_rate: String(value) }), []);
    expect(warnings.some(w => w.includes('Low test coverage'))).toBe(true);
  });

  // --- uncovered_prod_rate ---
  // uncovered_prod_rate is two-band under era:current (calibration/derive-bands.js:
  // only emberjs/ember.js corroborates the extreme) -- unlike the prior
  // pooled-derivation band, where it was three-band, THRESHOLDS now reports
  // critical: null for it, so no value, however high, should ever read as
  // "critical". Same null-coercion bug class the sprawling/avg_lines guard
  // tests below already cover for their own (still two-band) metrics.
  test('never emits a critical warning for uncovered_prod_rate, however high (two-band: no critical bound)', () => {
    const { warnings, recommendations } = generateInsights(makeSummary({ uncovered_prod_rate: '90.00' }), []);
    expect(warnings.some(w => w.includes('🚨'))).toBe(false);
    expect(warnings.some(w => w.includes('uncovered production commits'))).toBe(true);
    expect(recommendations).toEqual([]);
  });

  test('emits warning (not critical) for uncovered_prod_rate above healthy', () => {
    const value = THRESHOLDS.UNCOVERED_PROD_RATE.healthy + 5;
    const { warnings } = generateInsights(makeSummary({ uncovered_prod_rate: String(value) }), []);
    expect(warnings.some(w => w.includes('uncovered production commits'))).toBe(true);
    expect(warnings.some(w => w.includes('🚨'))).toBe(false);
  });

  test('emits no uncovered_prod warning when rate is below healthy', () => {
    const value = Math.max(THRESHOLDS.UNCOVERED_PROD_RATE.healthy - 8, 0);
    const { warnings } = generateInsights(makeSummary({ uncovered_prod_rate: String(value) }), []);
    expect(warnings.some(w => w.includes('uncovered production commits'))).toBe(false);
  });

  // --- test_isolation_rate ---
  test('emits positive insight for test_isolation_rate above the positive threshold', () => {
    const value = THRESHOLDS.TEST_ISOLATION_RATE.positive + 5;
    const { insights } = generateInsights(makeSummary({ test_isolation_rate: String(value) }), []);
    expect(insights.some(i => i.includes('test-only commits'))).toBe(true);
  });

  test('emits no test isolation insight when rate is below the positive threshold', () => {
    const value = Math.max(THRESHOLDS.TEST_ISOLATION_RATE.positive - 5, 0);
    const { insights } = generateInsights(makeSummary({ test_isolation_rate: String(value) }), []);
    expect(insights.some(i => i.includes('test-only commits'))).toBe(false);
  });

  // AVG_LINES_CHANGED lost its band (code-quality-metrics-6dg): three independent published
  // fits agree per-commit line count is heavy-tailed with no finite mean, so a mean-based
  // warning would score against a statistic the population does not have. generateInsights()
  // no longer reads avg_lines_changed at all, however extreme the value.
  test('never emits a lines-per-commit warning for avg_lines_changed, however extreme the value (band dropped, not re-tiered)', () => {
    const { warnings } = generateInsights(makeSummary({ avg_lines_changed: '999999.00' }), []);
    expect(warnings.some(w => w.includes('lines per commit'))).toBe(false);
  });

  // --- AI pattern detection ---
  // --- window reproducibility guard (code-quality-metrics-tde9) ---
  test('emits a commit-count mismatch warning when the tool selected far fewer commits than git rev-list reports for the resolved window', () => {
    const { warnings } = generateInsights(makeSummary({
      filtered_from: 1,
      window_expected_commit_count: 178,
      window_requested_since: '2026-08-01',
      window_widened: false
    }), []);
    expect(warnings.some(w => w.includes('mismatch'))).toBe(true);
  });

  test('does not emit a commit-count mismatch warning when the selected count is close to the expected rev-list count', () => {
    const { warnings } = generateInsights(makeSummary({
      filtered_from: 48,
      window_expected_commit_count: 50,
      window_requested_since: '2026-08-01',
      window_widened: false
    }), []);
    expect(warnings.some(w => w.includes('mismatch'))).toBe(false);
  });

  test('does not emit a commit-count mismatch warning when window_expected_commit_count is absent (HEAD-anchored run)', () => {
    const { warnings } = generateInsights(makeSummary({
      filtered_from: 1
    }), []);
    expect(warnings.some(w => w.includes('mismatch'))).toBe(false);
  });

  test('emits a warning when the analyzed span starts well after the requested --since date', () => {
    const { warnings } = generateInsights(makeSummary({
      window_requested_since: '2026-08-01',
      window_widened: false,
      analyzed_span_start: '2026-08-12',
      analyzed_span_end: '2026-08-16'
    }), []);
    expect(warnings.some(w => w.includes('starts') && w.includes('after'))).toBe(true);
  });

  // Regression guard for the reproduction case verified against nodejs/node and curl/curl
  // (code-quality-metrics-tde9). A healthy, correctly-reproduced window can legitimately have
  // an analyzed span that starts BEFORE the requested --since boundary -- this held under the
  // original author-date selection (pre-#76), and remains possible under committer-date
  // selection too (a low-velocity repository whose newest commits since the boundary still
  // span back past it). This must never warn.
  test('does not warn when the analyzed span starts before the requested --since date', () => {
    const { warnings } = generateInsights(makeSummary({
      window_requested_since: '2026-08-01',
      window_widened: false,
      analyzed_span_start: '2026-07-15',
      analyzed_span_end: '2026-08-11'
    }), []);
    expect(warnings.some(w => w.includes('starts') && w.includes('after'))).toBe(false);
  });

  test('does not warn about span lag when window_requested_since is absent (HEAD-anchored run)', () => {
    const { warnings } = generateInsights(makeSummary({
      analyzed_span_start: '2026-08-12',
      analyzed_span_end: '2026-08-16'
    }), []);
    expect(warnings.some(w => w.includes('starts') && w.includes('after'))).toBe(false);
  });

  // Regression guard (code-quality-metrics-tde9), re-verified after #76 switched commit
  // selection from author date to committer date: reproducing the recorded nodejs/node
  // observation (repo_head cb9bb667, --since 2026-08-01) against a real blobless clone at
  // current HEAD now reports analyzed_span_start 2026-08-08 -- a 7-day lag purely from that
  // repository's commit velocity exhausting MAX_COMMITS, not from contamination. Neither the
  // span-lag nor the count-mismatch check must fire on this real, healthy run.
  test('does not warn on the real, re-verified nodejs/node reproduction (7-day span lag, exact count match)', () => {
    const { warnings } = generateInsights(makeSummary({
      window_requested_since: '2026-08-01',
      window_widened: false,
      analyzed_span_start: '2026-08-08',
      analyzed_span_end: '2026-08-11',
      filtered_from: 178,
      window_expected_commit_count: 178
    }), []);
    expect(warnings.some(w => w.includes('starts') && w.includes('after'))).toBe(false);
    expect(warnings.some(w => w.includes('mismatch'))).toBe(false);
  });

  test('emits a warning when the analyzed span collapses to a single day', () => {
    const { warnings } = generateInsights(makeSummary({
      window_requested_since: '2026-08-01',
      window_widened: false,
      analyzed_span_start: '2026-08-09',
      analyzed_span_end: '2026-08-09'
    }), []);
    expect(warnings.some(w => w.includes('single day'))).toBe(true);
  });

  test('does not warn about a single-day span when window_requested_since is absent (HEAD-anchored run)', () => {
    const { warnings } = generateInsights(makeSummary({
      analyzed_span_start: '2026-08-09',
      analyzed_span_end: '2026-08-09'
    }), []);
    expect(warnings.some(w => w.includes('single day'))).toBe(false);
  });

  test('does not emit AI pattern warning when fewer than 30% of commits are addition-heavy large commits', () => {
    const metrics = [
      makeMetric({ large_commit: true, total_additions: 300, total_deletions: 10 }),
      makeMetric(), makeMetric(), makeMetric() // 1 of 4 = 25% — below 30% threshold
    ];
    const { warnings } = generateInsights(makeSummary(), metrics);
    expect(warnings.some(w => w.includes('addition-heavy'))).toBe(false);
  });

  test('emits AI pattern warning when more than 30% of commits are addition-heavy large commits', () => {
    // 2 of 3 commits = 67% — above 30%
    const metrics = [
      makeMetric({ large_commit: true, total_additions: 300, total_deletions: 10 }),
      makeMetric({ large_commit: true, total_additions: 400, total_deletions: 5 }),
      makeMetric()
    ];
    const { warnings } = generateInsights(makeSummary(), metrics);
    expect(warnings.some(w => w.includes('addition-heavy'))).toBe(true);
  });
});
