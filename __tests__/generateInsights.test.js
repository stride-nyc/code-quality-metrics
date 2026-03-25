'use strict';

const { generateInsights } = require('../local-code-metrics');

/** Build a minimal summary object with overridable fields */
function makeSummary(overrides = {}) {
  return {
    large_commits_pct: '0.00',
    sprawling_commits_pct: '0.00',
    test_first_pct: '60.00',
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
    test_first_indicator: true,
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
      makeSummary({ large_commits_pct: '0.00', sprawling_commits_pct: '0.00', test_first_pct: '60.00' }),
      []
    );
    expect(warnings).toEqual([]);
    expect(recommendations).toEqual([]);
    expect(insights).toHaveLength(3); // healthy large + healthy sprawling + strong test-first (60% > 50)
  });

  // --- healthy thresholds produce positive insights, no warnings ---
  test('emits healthy insight for large_commits_pct below 20', () => {
    const { insights, warnings } = generateInsights(makeSummary({ large_commits_pct: '15.00' }), []);
    expect(warnings.some(w => w.includes('large commit'))).toBe(false);
    expect(insights.some(i => i.includes('Healthy large commit rate'))).toBe(true);
  });

  test('emits healthy insight for sprawling_commits_pct below 10', () => {
    const { insights, warnings } = generateInsights(makeSummary({ sprawling_commits_pct: '5.00' }), []);
    expect(warnings.some(w => w.includes('sprawling'))).toBe(false);
    expect(insights.some(i => i.includes('Good sprawling commit control'))).toBe(true);
  });

  test('emits positive insight for test_first_pct above 50', () => {
    const { insights } = generateInsights(makeSummary({ test_first_pct: '55.00' }), []);
    expect(insights.some(i => i.includes('Strong test-first discipline'))).toBe(true);
  });

  // --- warning thresholds ---
  test('emits warning (not critical) for large_commits_pct between 20 and 40', () => {
    const { warnings } = generateInsights(makeSummary({ large_commits_pct: '30.00' }), []);
    expect(warnings.some(w => w.includes('High large commit rate'))).toBe(true);
    expect(warnings.some(w => w.includes('Very high'))).toBe(false);
  });

  test('emits critical warning for large_commits_pct above 40', () => {
    const { warnings, recommendations } = generateInsights(makeSummary({ large_commits_pct: '45.00' }), []);
    expect(warnings.some(w => w.includes('Very high large commit rate'))).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  test('emits warning (not critical) for sprawling_commits_pct between 10 and 25', () => {
    const { warnings } = generateInsights(makeSummary({ sprawling_commits_pct: '15.00' }), []);
    expect(warnings.some(w => w.includes('High sprawling commit rate'))).toBe(true);
    expect(warnings.some(w => w.includes('Very high'))).toBe(false);
  });

  test('emits critical warning for sprawling_commits_pct above 25', () => {
    const { warnings, recommendations } = generateInsights(makeSummary({ sprawling_commits_pct: '30.00' }), []);
    expect(warnings.some(w => w.includes('Very high sprawling commit rate'))).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  test('emits warning for test_first_pct below 30', () => {
    const { warnings } = generateInsights(makeSummary({ test_first_pct: '20.00' }), []);
    expect(warnings.some(w => w.includes('Low test-first discipline'))).toBe(true);
  });

  test('emits warning for avg_lines_changed above 500', () => {
    const { warnings } = generateInsights(makeSummary({ avg_lines_changed: '600.00' }), []);
    expect(warnings.some(w => w.includes('High average lines per commit'))).toBe(true);
  });

  test('emits critical warning for avg_lines_changed above 1000', () => {
    const { warnings } = generateInsights(makeSummary({ avg_lines_changed: '1200.00' }), []);
    expect(warnings.some(w => w.includes('Very high average lines per commit'))).toBe(true);
  });

  // --- AI pattern detection ---
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
