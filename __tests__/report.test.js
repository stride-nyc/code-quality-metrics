'use strict';

const { THRESHOLDS } = require('../lib/thresholds');
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

describe('buildMetricCatalog duplication semantic states', () => {
  const dup = semantic => ({
    statistics: { percentage: 1, duplicatedLines: 10, lines: 1000, clones: 1, sources: 5 },
    semantic_findings: [],
    layers_run: { static: true, semantic }
  });
  const tile = semantic => buildMetricCatalog(fullSummary(), dup(semantic))
    .find(e => e.key === 'duplication_semantic_findings');

  test('marks the semantic tile unmeasured when the layer ran but could not be measured', () => {
    // layers_run.semantic is 'false | true | "unmeasured"'. The string is truthy, so a
    // Boolean() check would call a failed or truncated run a confident zero.
    expect(tile('unmeasured').status).toBe('unmeasured');
    expect(tile('unmeasured').value).toBe('Not measured');
  });

  test('reports a real count only when the layer actually produced a result', () => {
    expect(tile(true).status).toBe('neutral');
    expect(tile(true).value).toBe(0);
  });

  test('marks the semantic tile unmeasured when the layer never ran', () => {
    expect(tile(false).status).toBe('unmeasured');
  });
});

describe('buildMetricCatalog', () => {
  it('returns one entry per catalog metric, 13 total', () => {
    const entries = buildMetricCatalog(fullSummary());
    expect(entries).toHaveLength(13);
  });

  // code-quality-metrics-a9z, code-quality-metrics-6ti: both bands are dropped, not
  // re-tiered, because the literature review found no defensible boundary for either
  // measure. Reported descriptively: no gauge, no good/warning/critical verdict, and a
  // concern fixed at -Infinity (never a new finite sentinel -- see
  // duplication_semantic_findings's own history, code-quality-metrics-82k, where a fixed
  // finite sentinel got outranked by a formula-computed concern once a band narrowed) so
  // neither entry ever competes with a real scored metric in the relevance sort.
  it('builds net_additions_ratio_median and message_quality_pct as informational entries: no verdict, no gauge, sentinel concern', () => {
    const entries = buildMetricCatalog(fullSummary());
    const netAdditions = entries.find(e => e.key === 'net_additions_ratio_median');
    const messageQuality = entries.find(e => e.key === 'message_quality_pct');

    for (const entry of [netAdditions, messageQuality]) {
      expect(entry.hasGauge).toBe(false);
      expect(entry.status).toBe('neutral');
      expect(entry.concern).toBe(-Infinity);
      expect(entry.healthyBoundary).toBeNull();
      expect(entry.criticalBoundary).toBeNull();
    }
  });

  it('computes concern = 1 (critical) for a higher-is-worse metric at its critical boundary', () => {
    const entries = buildMetricCatalog(fullSummary({ large_commits_pct: '30.00' }));
    const entry = entries.find(e => e.key === 'large_commits_pct');
    expect(entry.concern).toBe(1);
    expect(entry.status).toBe('critical');
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

  // message_quality_pct dropped out of the gauge set (code-quality-metrics-6ti): a gauge
  // implies a band, and this metric no longer has one.
  it('sets hasGauge true only for the four bounded-percentage metrics with a scored band', () => {
    const entries = buildMetricCatalog(fullSummary());
    const gaugeKeys = entries.filter(e => e.hasGauge).map(e => e.key).sort();
    expect(gaugeKeys).toEqual([
      'large_commits_pct',
      'sprawling_commits_pct',
      'test_coverage_rate',
      'uncovered_prod_rate'
    ].sort());
  });

  it('sources healthy/critical boundaries for the newly-added threshold bands from lib/thresholds.js', () => {
    const entries = buildMetricCatalog(fullSummary());

    // Read from THRESHOLDS rather than restating the numbers. thresholds.test.js already
    // locks the values; what matters here is that the catalog carries the configured
    // boundary through. Hardcoding it made every recalibration break this test for no
    // reason, which is what happened when this band was adopted, and again when
    // p90_files_changed's own tier changed under a later recalibration.
    const p90Files = entries.find(e => e.key === 'p90_files_changed');
    expect(p90Files.healthyBoundary).toBe(THRESHOLDS.P90_FILES_CHANGED.healthy);
    expect(p90Files.criticalBoundary).toBe(THRESHOLDS.P90_FILES_CHANGED.critical);
  });

  // code-quality-metrics-a9z: THRESHOLDS no longer has a NET_ADDITIONS_RATIO_MEDIAN key at
  // all (the band was dropped, not re-tiered), so this entry's boundaries are always null,
  // never sourced from THRESHOLDS.
  it('carries no boundary at all for net_additions_ratio_median now that its band is dropped', () => {
    const entries = buildMetricCatalog(fullSummary());
    const netAdditions = entries.find(e => e.key === 'net_additions_ratio_median');
    expect(netAdditions.healthyBoundary).toBeNull();
    expect(netAdditions.criticalBoundary).toBeNull();
  });
});

describe('buildMetricCatalog two-band metrics (no critical bound)', () => {
  it('never reports critical for a two-band metric, however far past healthy the value sits', () => {
    // p90_lines_changed is two-band (healthy 260, critical null): the extreme
    // rests on a single reference repo (see lib/thresholds.js's comment).
    const mild = buildMetricCatalog(fullSummary({ p90_lines_changed: 300 }))
      .find(e => e.key === 'p90_lines_changed');
    expect(mild.status).toBe('warning');
    expect(mild.criticalBoundary).toBeNull();

    const extreme = buildMetricCatalog(fullSummary({ p90_lines_changed: 50000 }))
      .find(e => e.key === 'p90_lines_changed');
    expect(extreme.status).toBe('warning');
    expect(extreme.status).not.toBe('critical');
  });

  it('reports good, not warning, for a two-band metric comfortably inside the healthy range', () => {
    // Regression: computeConcern treated a null criticalBoundary as 0, which
    // fabricated a "warning" for values well inside healthy (e.g.
    // p90_lines_changed at 150, healthy 260) because (150-260)/(0-260) > 0.
    // p90_lines_changed (higher-is-worse) and test_coverage_rate (higher-is-better)
    // are used here rather than sprawling_commits_pct/avg_lines_changed because
    // those two are two-band under one calibration era and three-band under
    // another (see lib/thresholds.js's comments); a stable two-band exemplar in
    // each direction keeps this test from breaking on every recalibration.
    const p90Lines = buildMetricCatalog(fullSummary({ p90_lines_changed: 150 }))
      .find(e => e.key === 'p90_lines_changed');
    expect(p90Lines.status).toBe('good');

    const testCoverage = buildMetricCatalog(fullSummary({ test_coverage_rate: '90.00' }))
      .find(e => e.key === 'test_coverage_rate');
    expect(testCoverage.status).toBe('good');
  });

  it('fixes concern at -1 for two-band metrics, keeping them out of the relevance sort against real critical/warning findings', () => {
    const entries = buildMetricCatalog(fullSummary({ p90_lines_changed: 50000 }));
    const p90Lines = entries.find(e => e.key === 'p90_lines_changed');
    expect(p90Lines.concern).toBe(-1);
  });

  it('marks a two-band entry with tier two-band and a three-band entry with tier three-band', () => {
    const entries = buildMetricCatalog(fullSummary());
    expect(entries.find(e => e.key === 'p90_lines_changed').tier).toBe('two-band');
    expect(entries.find(e => e.key === 'large_commits_pct').tier).toBe('three-band');
  });

  it('never reports critical for test_coverage_rate even far below healthy (two-band, not a fabricated critical bound)', () => {
    const entry = buildMetricCatalog(fullSummary({ test_coverage_rate: '1.00' }))
      .find(e => e.key === 'test_coverage_rate');
    expect(entry.status).toBe('warning');
    expect(entry.criticalBoundary).toBeNull();
  });

  // message_quality_pct is no longer two-band or three-band at all (code-quality-metrics-6ti
  // dropped its band, not re-tiered it): it never reports good, warning or critical,
  // however low the value, because there is no boundary left to compare it against. There is
  // currently no real higher-is-better, three-band metric left in the catalog
  // (test_coverage_rate is two-band in both eras), so the concern formula's higher-is-better
  // branch has no metric-level regression coverage right now; see code-quality-metrics-82k's
  // report for this gap.
  it('never reports a verdict for message_quality_pct however low the value (band dropped, not re-tiered)', () => {
    const entry = buildMetricCatalog(fullSummary({ message_quality_pct: '1.00' }))
      .find(e => e.key === 'message_quality_pct');
    expect(entry.status).toBe('neutral');
    expect(entry.healthyBoundary).toBeNull();
    expect(entry.criticalBoundary).toBeNull();
  });
});

function fullDuplicates(overrides) {
  return Object.assign({
    analyzed_at: '2026-08-17T00:00:00.000Z',
    files_scanned: 11,
    static_duplicates: [
      { firstFile: { name: 'lib/git.js', start: 10, end: 25 }, secondFile: { name: 'lib/metrics.js', start: 5, end: 20 }, lines: 12, tokens: 90 }
    ],
    semantic_findings: [],
    statistics: {
      clones: 2,
      duplicatedLines: 12,
      duplicatedTokens: 90,
      lines: 1595,
      tokens: 6196,
      sources: 11,
      percentage: 0.75,
      percentageTokens: 2.07,
      newClones: 0,
      newDuplicatedLines: 0
    },
    layers_run: { static: true, semantic: false }
  }, overrides);
}

describe('buildMetricCatalog with duplicates', () => {
  it('marks the semantic duplication tile as unmeasured, not zero, when layers_run.semantic is false', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    const semantic = entries.find(e => e.key === 'duplication_semantic_findings');
    expect(semantic.status).toBe('unmeasured');
    expect(semantic.value).not.toBe(0);
  });

  it('marks the semantic duplication tile neutral with a real finding count when the layer ran and found some', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      layers_run: { static: true, semantic: true },
      semantic_findings: [{ file1: 'a.js', file2: 'b.js', similarity: 'high', confidence: 0.9 }]
    }));
    const semantic = entries.find(e => e.key === 'duplication_semantic_findings');
    expect(semantic.status).toBe('neutral');
    expect(semantic.value).toBe(1);
  });

  it('marks the semantic duplication tile neutral with value 0 when the layer ran and found nothing (distinct from unmeasured)', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      layers_run: { static: true, semantic: true },
      semantic_findings: []
    }));
    const semantic = entries.find(e => e.key === 'duplication_semantic_findings');
    expect(semantic.status).toBe('neutral');
    expect(semantic.value).toBe(0);
  });

  it('renders the static duplication density tile as a gauge computed from statistics.percentage', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    const density = entries.find(e => e.key === 'duplication_density_pct');
    expect(density.hasGauge).toBe(true);
    expect(density.value).toBe(0.75);
    expect(density.status).toBe('good');
  });

  it('computes concern = 1 (critical) for duplication density at its critical boundary', () => {
    // percentage is read from THRESHOLDS rather than hardcoded so a recalibration
    // that moves DUPLICATION_PCT.critical doesn't break this test for no reason.
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      statistics: { clones: 40, duplicatedLines: 3239, duplicatedTokens: 0, lines: 8232, tokens: 0, sources: 0, percentage: THRESHOLDS.DUPLICATION_PCT.critical, percentageTokens: 0, newClones: 0, newDuplicatedLines: 0 }
    }));
    const density = entries.find(e => e.key === 'duplication_density_pct');
    expect(density.concern).toBe(1);
    expect(density.status).toBe('critical');
  });

  it('renders duplicated-lines-out-of-total and clone-count as informational stat cards', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    const lines = entries.find(e => e.key === 'duplication_lines');
    const clones = entries.find(e => e.key === 'duplication_clones');
    expect(lines.hasGauge).toBe(false);
    expect(lines.value).toBe('12 / 1595');
    expect(clones.hasGauge).toBe(false);
    expect(clones.value).toBe(2);
  });

  it('omits the three static tiles, but still renders the semantic tile, when duplicates.statistics is null', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({ statistics: null }));
    expect(entries.find(e => e.key === 'duplication_density_pct')).toBeUndefined();
    expect(entries.find(e => e.key === 'duplication_lines')).toBeUndefined();
    expect(entries.find(e => e.key === 'duplication_clones')).toBeUndefined();
    expect(entries.find(e => e.key === 'duplication_semantic_findings')).toBeDefined();
  });

  it('sorts the unmeasured semantic tile after every other entry, since concern is meaningless for it', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    expect(entries[entries.length - 1].key).toBe('duplication_semantic_findings');
  });

  it('adds no duplication entries at all when duplicates is not supplied (existing callers unaffected)', () => {
    const entries = buildMetricCatalog(fullSummary());
    expect(entries.some(e => e.key.startsWith('duplication_'))).toBe(false);
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
