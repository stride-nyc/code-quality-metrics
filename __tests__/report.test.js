'use strict';

const { buildMetricCatalog, buildGaugeSvgParts } = require('../lib/report');

function fullSummary(overrides) {
  return Object.assign({
    analysis_date: '2026-08-17T00:00:00.000Z',
    analysis_period_days: 30,
    total_commits: 100,
    filtered_from: 100,
    workflow_type: 'feature_branch',
    branches_analyzed: ['main'],
    branch_commit_counts: { main: 100 },

    large_commits_pct: '15.00',
    sprawling_commits_pct: '8.00',
    test_coverage_rate: '55.00',
    test_isolation_rate: '5.00',
    uncovered_prod_rate: '5.00',
    avg_files_changed: '3.00',
    avg_lines_changed: '120.00',

    p50_lines_changed: 40,
    p90_lines_changed: 150,
    p95_lines_changed: 180,
    stddev_lines_changed: 30,
    p50_files_changed: 2,
    p90_files_changed: 5,
    commit_size_trend: 'stable',

    velocity_commits_per_day: 3.2,
    velocity_trend: 'stable',

    net_additions_ratio_median: 0.2,
    net_additions_ratio_p90: 0.4,

    message_quality_pct: '70.00',

    dora_archetype: 'harmonious-high-achiever',

    config: {},
    note: 'test summary'
  }, overrides);
}

describe('buildMetricCatalog', () => {
  it('returns one entry per catalog metric, 13 total', () => {
    const entries = buildMetricCatalog(fullSummary());
    expect(entries).toHaveLength(13);
  });

  it('computes concern = 1 (critical) for a higher-is-worse metric at its critical boundary', () => {
    const entries = buildMetricCatalog(fullSummary({ large_commits_pct: '40.00' }));
    const entry = entries.find(e => e.key === 'large_commits_pct');
    expect(entry.concern).toBe(1);
    expect(entry.status).toBe('critical');
  });

  it('computes concern for message_quality_pct (higher-is-better) matching hand-computed examples', () => {
    const bad = buildMetricCatalog(fullSummary({ message_quality_pct: '11.11' }))
      .find(e => e.key === 'message_quality_pct');
    expect(bad.concern).toBeCloseTo(2.44, 2);
    expect(bad.status).toBe('critical');

    const good = buildMetricCatalog(fullSummary({ message_quality_pct: '70.00' }))
      .find(e => e.key === 'message_quality_pct');
    expect(good.concern).toBeCloseTo(-0.5, 5);
    expect(good.status).toBe('good');
  });

  it('marks test_isolation_rate as good when above 10 with fixed concern -2, never critical or warning', () => {
    const high = buildMetricCatalog(fullSummary({ test_isolation_rate: '15.00' }))
      .find(e => e.key === 'test_isolation_rate');
    expect(high.status).toBe('good');
    expect(high.concern).toBe(-2);

    const low = buildMetricCatalog(fullSummary({ test_isolation_rate: '5.00' }))
      .find(e => e.key === 'test_isolation_rate');
    expect(low.status).toBe('neutral');
    expect(low.concern).toBe(-2);
  });

  it('marks velocity_commits_per_day as always neutral with fixed concern -3', () => {
    const entry = buildMetricCatalog(fullSummary({ velocity_commits_per_day: 99 }))
      .find(e => e.key === 'velocity_commits_per_day');
    expect(entry.status).toBe('neutral');
    expect(entry.concern).toBe(-3);
  });

  it('flags commit_size_trend and velocity_trend as warning only when growing AND accelerating jointly', () => {
    const joint = buildMetricCatalog(fullSummary({ commit_size_trend: 'growing', velocity_trend: 'accelerating' }));
    const sizeTrend = joint.find(e => e.key === 'commit_size_trend');
    const velTrend = joint.find(e => e.key === 'velocity_trend');
    expect(sizeTrend.status).toBe('warning');
    expect(sizeTrend.concern).toBe(0.5);
    expect(velTrend.status).toBe('warning');
    expect(velTrend.concern).toBe(0.5);

    const partial = buildMetricCatalog(fullSummary({ commit_size_trend: 'growing', velocity_trend: 'stable' }));
    expect(partial.find(e => e.key === 'commit_size_trend').status).toBe('neutral');
    expect(partial.find(e => e.key === 'commit_size_trend').concern).toBe(-3);
    expect(partial.find(e => e.key === 'velocity_trend').status).toBe('neutral');
  });

  it('sorts the returned entries by concern descending (most alarming first)', () => {
    const entries = buildMetricCatalog(fullSummary({ large_commits_pct: '40.00', message_quality_pct: '70.00' }));
    const concerns = entries.map(e => e.concern);
    const sorted = [...concerns].sort((a, b) => b - a);
    expect(concerns).toEqual(sorted);
  });

  it('sets hasGauge true only for the five bounded-percentage metrics', () => {
    const entries = buildMetricCatalog(fullSummary());
    const gaugeKeys = entries.filter(e => e.hasGauge).map(e => e.key).sort();
    expect(gaugeKeys).toEqual([
      'large_commits_pct',
      'message_quality_pct',
      'sprawling_commits_pct',
      'test_coverage_rate',
      'uncovered_prod_rate'
    ].sort());
  });

  it('sources healthy/critical boundaries for the newly-added threshold bands from lib/thresholds.js', () => {
    const entries = buildMetricCatalog(fullSummary());
    const p90Lines = entries.find(e => e.key === 'p90_lines_changed');
    expect(p90Lines.healthyBoundary).toBe(200);
    expect(p90Lines.criticalBoundary).toBe(500);

    const p90Files = entries.find(e => e.key === 'p90_files_changed');
    expect(p90Files.healthyBoundary).toBe(8);
    expect(p90Files.criticalBoundary).toBe(15);

    const netAdditions = entries.find(e => e.key === 'net_additions_ratio_median');
    expect(netAdditions.healthyBoundary).toBe(0.33);
    expect(netAdditions.criticalBoundary).toBe(0.50);
  });
});

describe('buildGaugeSvgParts', () => {
  const oracleArgs = {
    value: 51.11,
    vmax: 60,
    bands: [{ start: 0, end: 20 }, { start: 20, end: 40 }, { start: 40, end: 60 }],
    cx: 110,
    cy: 104,
    r: 82,
    r2: 64
  };

  it('produces band arc paths matching the verified geometry oracle', () => {
    const { bandPaths } = buildGaugeSvgParts(oracleArgs);
    expect(bandPaths).toEqual([
      'M 28.00 104.00 A 82 82 0 0 1 69.00 32.99',
      'M 69.00 32.99 A 82 82 0 0 1 151.00 32.99',
      'M 151.00 32.99 A 82 82 0 0 1 192.00 104.00'
    ]);
  });

  it('produces a needle endpoint matching the verified geometry oracle', () => {
    const { needleEndpoint } = buildGaugeSvgParts(oracleArgs);
    expect(needleEndpoint.x).toBeCloseTo(167.19, 2);
    expect(needleEndpoint.y).toBeCloseTo(75.27, 2);
  });

  it('produces a fixed hub at the gauge center', () => {
    const { hub } = buildGaugeSvgParts(oracleArgs);
    expect(hub).toEqual({ cx: 110, cy: 104, r: 4.5 });
  });
});
