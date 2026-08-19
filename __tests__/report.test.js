'use strict';

const { THRESHOLDS } = require('../lib/thresholds');
const { buildMetricCatalog, buildGaugeSvgParts, groupForMetricKey } = require('../lib/report');

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
  //
  // avg_lines_changed joins them here (code-quality-metrics-6dg): three independent
  // published fits agree commit size is heavy-tailed with no finite mean (Kolassa et al.'s
  // GPD shape xi = 1.4617, Arafat and Riehle's power law exponent -1.8612, Hattori and
  // Lanza's Pareto Q-Q fit), so a mean-based band scores against a statistic the population
  // does not have.
  it('builds net_additions_ratio_median, message_quality_pct and avg_lines_changed as informational entries: no verdict, no gauge, sentinel concern', () => {
    const entries = buildMetricCatalog(fullSummary());
    const netAdditions = entries.find(e => e.key === 'net_additions_ratio_median');
    const messageQuality = entries.find(e => e.key === 'message_quality_pct');
    const avgLinesChanged = entries.find(e => e.key === 'avg_lines_changed');

    for (const entry of [netAdditions, messageQuality, avgLinesChanged]) {
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

describe('buildMetricCatalog when history_granularity is squashed', () => {
  // avg_lines_changed dropped out of this list (code-quality-metrics-6dg): it is already
  // informational for an unrelated reason (no finite mean for a heavy-tailed distribution),
  // covered by the guard test below instead of being withheld a second time.
  const WITHHELD_KEYS = [
    'large_commits_pct', 'sprawling_commits_pct', 'uncovered_prod_rate', 'test_coverage_rate',
    'p90_lines_changed', 'p90_files_changed', 'test_isolation_rate',
    'commit_size_trend', 'velocity_trend'
  ];

  it('withholds every commit-unit verdict: no gauge, neutral status, sentinel concern, no boundary, and an explanation', () => {
    const entries = buildMetricCatalog(fullSummary({ history_granularity: 'squashed' }));
    for (const key of WITHHELD_KEYS) {
      const entry = entries.find(e => e.key === key);
      expect(entry.hasGauge).toBe(false);
      expect(entry.status).toBe('neutral');
      expect(entry.concern).toBe(-Infinity);
      expect(entry.healthyBoundary).toBeNull();
      expect(entry.criticalBoundary).toBeNull();
      expect(entry.descriptiveNote).toMatch(/pull request/);
    }
  });

  // [guard] duplication measures file contents, not commit shape, so it keeps its verdict
  // regardless of history_granularity (code-quality-metrics-bnq requirement #4).
  it('[guard] keeps the duplication density verdict intact when history is squashed', () => {
    // Sits past healthy, so an intact verdict is a visible one. duplication_pct is
    // two-band since its re-derivation at 10/100 (code-quality-metrics-8ad), so the
    // strongest verdict available is 'warning'; asserting 'critical' here would be
    // asserting a bound the data does not support.
    const dup = {
      statistics: { percentage: THRESHOLDS.DUPLICATION_PCT.healthy + 5, duplicatedLines: 10, lines: 1000, clones: 1, sources: 5 },
      semantic_findings: [],
      layers_run: { static: true, semantic: false }
    };
    const entries = buildMetricCatalog(fullSummary({ history_granularity: 'squashed' }), dup);
    const density = entries.find(e => e.key === 'duplication_density_pct');
    expect(density.hasGauge).toBe(true);
    expect(density.status).toBe('warning');
    expect(density.descriptiveNote).toBeUndefined();
    expect(density.criticalBoundary).toBeNull();
  });

  // [guard] message_quality_pct, net_additions_ratio_median and avg_lines_changed already had
  // their bands dropped for unrelated reasons (code-quality-metrics-6ti, code-quality-metrics-
  // a9z, code-quality-metrics-6dg) and are already informational; squashing composes with that
  // rather than adding a second note.
  it('[guard] leaves message_quality_pct, net_additions_ratio_median and avg_lines_changed unchanged, not double-annotated, when history is squashed', () => {
    const entries = buildMetricCatalog(fullSummary({ history_granularity: 'squashed' }));
    const messageQuality = entries.find(e => e.key === 'message_quality_pct');
    const netAdditions = entries.find(e => e.key === 'net_additions_ratio_median');
    const avgLinesChanged = entries.find(e => e.key === 'avg_lines_changed');
    expect(messageQuality.descriptiveNote).not.toMatch(/pull request/);
    expect(netAdditions.descriptiveNote).not.toMatch(/pull request/);
    expect(avgLinesChanged.descriptiveNote).not.toMatch(/pull request/);
  });

  it('[guard] treats unknown the same as squashed: withholds the same commit-unit entries', () => {
    const entries = buildMetricCatalog(fullSummary({ history_granularity: 'unknown' }));
    const large = entries.find(e => e.key === 'large_commits_pct');
    expect(large.status).toBe('neutral');
    expect(large.concern).toBe(-Infinity);
  });

  it('[guard] leaves entries untouched when history_granularity is granular', () => {
    const entries = buildMetricCatalog(fullSummary({ history_granularity: 'granular' }));
    const large = entries.find(e => e.key === 'large_commits_pct');
    expect(large.hasGauge).toBe(true);
    expect(large.descriptiveNote).toBeUndefined();
  });
});

describe('buildMetricCatalog when project_lifecycle is initial-build', () => {
  const WITHHELD_KEYS = ['large_commits_pct', 'sprawling_commits_pct', 'p90_lines_changed', 'p90_files_changed'];

  it('withholds the four change-size verdicts: no gauge, neutral status, sentinel concern, no boundary, and an explanation naming the initial build', () => {
    const entries = buildMetricCatalog(fullSummary({ project_lifecycle: 'initial-build' }));
    for (const key of WITHHELD_KEYS) {
      const entry = entries.find(e => e.key === key);
      expect(entry.hasGauge).toBe(false);
      expect(entry.status).toBe('neutral');
      expect(entry.concern).toBe(-Infinity);
      expect(entry.healthyBoundary).toBeNull();
      expect(entry.criticalBoundary).toBeNull();
      expect(entry.descriptiveNote).toMatch(/initial build/);
    }
  });

  it('withholds the duplication density verdict too, with the same initial-build explanation', () => {
    const dup = {
      statistics: { percentage: THRESHOLDS.DUPLICATION_PCT.healthy + 5, duplicatedLines: 10, lines: 1000, clones: 1, sources: 5 },
      semantic_findings: [],
      layers_run: { static: true, semantic: false }
    };
    const entries = buildMetricCatalog(fullSummary({ project_lifecycle: 'initial-build' }), dup);
    const density = entries.find(e => e.key === 'duplication_density_pct');
    expect(density.hasGauge).toBe(false);
    expect(density.status).toBe('neutral');
    expect(density.healthyBoundary).toBeNull();
    expect(density.criticalBoundary).toBeNull();
    expect(density.descriptiveNote).toMatch(/initial build/);
  });

  // [guard] duplication being unmeasurable for an unrelated reason (unsupported language) must
  // keep its own explanation, not be overwritten by the initial-build note -- the two reasons
  // are different claims and only one of them is true here.
  it('[guard] leaves the unsupported-language duplication note intact rather than overwriting it with the initial-build note', () => {
    const dup = { unsupported_extensions: ['.ex', '.exs'] };
    const entries = buildMetricCatalog(fullSummary({ project_lifecycle: 'initial-build' }), dup);
    const density = entries.find(e => e.key === 'duplication_density_pct');
    expect(density.descriptiveNote).toMatch(/Not measurable/);
    expect(density.descriptiveNote).not.toMatch(/initial build/);
  });

  it('[guard] leaves entries untouched when project_lifecycle is established', () => {
    const entries = buildMetricCatalog(fullSummary({ project_lifecycle: 'established' }));
    const large = entries.find(e => e.key === 'large_commits_pct');
    expect(large.hasGauge).toBe(true);
    expect(large.descriptiveNote).toBeUndefined();
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

  it('never reports critical for duplication density, however far past healthy, since it has no critical bound', () => {
    // This test previously drove percentage to THRESHOLDS.DUPLICATION_PCT.critical and
    // asserted concern 1. Reading the boundary from THRESHOLDS protected it against a
    // value change but not against a tier change: the 10/100 re-derivation
    // (code-quality-metrics-8ad) left duplication_pct two-band, so there is no critical
    // boundary to sit at. The concern-1 critical path stays covered by
    // large_commits_pct, which is genuinely three-band.
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      statistics: { clones: 40, duplicatedLines: 3239, duplicatedTokens: 0, lines: 8232, tokens: 0, sources: 0, percentage: THRESHOLDS.DUPLICATION_PCT.healthy * 20, percentageTokens: 0, newClones: 0, newDuplicatedLines: 0 }
    }));
    const density = entries.find(e => e.key === 'duplication_density_pct');
    expect(density.status).toBe('warning');
    expect(density.concern).toBe(-1);
    expect(density.criticalBoundary).toBeNull();
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

describe('buildMetricCatalog with an unsupported-language duplication scan (code-quality-metrics-tjn)', () => {
  it('reports duplication_density_pct as informational "Not measurable", naming the extensions found, instead of omitting it', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      statistics: null,
      static_duplicates: [],
      unsupported_extensions: ['.ex', '.exs']
    }));
    const density = entries.find(e => e.key === 'duplication_density_pct');

    expect(density).toBeDefined();
    expect(density.value).toBe('Not measurable');
    expect(density.status).toBe('neutral');
    expect(density.hasGauge).toBe(false);
    expect(density.concern).toBe(-Infinity);
    expect(density.healthyBoundary).toBeNull();
    expect(density.criticalBoundary).toBeNull();
    expect(density.descriptiveNote).toContain('.ex');
    expect(density.descriptiveNote).toContain('.exs');
  });

  it('says the measurement does not exist for this language, not merely that the band is inapplicable', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      statistics: null,
      static_duplicates: [],
      unsupported_extensions: ['.ex', '.exs']
    }));
    const density = entries.find(e => e.key === 'duplication_density_pct');

    // The band was derived from C, JavaScript, Python and Go repositories; for a
    // language jscpd cannot parse there is no measurement to hold a verdict at all,
    // which is a stronger and different claim than "the band does not apply here".
    expect(density.descriptiveNote).toMatch(/jscpd/i);
    expect(density.descriptiveNote.toLowerCase()).toContain('does not exist');
  });

  it('omits duplication_lines and duplication_clones (there is no per-file data to show) while still rendering duplication_density_pct', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      statistics: null,
      static_duplicates: [],
      unsupported_extensions: ['.ex', '.exs']
    }));

    expect(entries.find(e => e.key === 'duplication_lines')).toBeUndefined();
    expect(entries.find(e => e.key === 'duplication_clones')).toBeUndefined();
    expect(entries.find(e => e.key === 'duplication_density_pct')).toBeDefined();
  });

  it('[guard] leaves the normal statistics-driven density gauge intact when unsupported_extensions is absent', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    const density = entries.find(e => e.key === 'duplication_density_pct');

    expect(density.hasGauge).toBe(true);
    expect(density.descriptiveNote).toBeUndefined();
  });

  it('[guard] a genuine zero-source measurement (no unsupported_extensions field) still renders as a normal gauge, not informational', () => {
    // Distinguishes lib/duplicate.js's own genuine-zero case (every scanned file supported
    // but none met the min-lines/min-tokens floor) from the unsupported-language case: only
    // the presence of unsupported_extensions should switch this tile to informational.
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates({
      statistics: { clones: 0, duplicatedLines: 0, duplicatedTokens: 0, lines: 0, tokens: 0, sources: 0, percentage: 0, percentageTokens: 0, newClones: 0, newDuplicatedLines: 0 }
    }));
    const density = entries.find(e => e.key === 'duplication_density_pct');

    expect(density.hasGauge).toBe(true);
    expect(density.value).toBe(0);
    expect(density.status).toBe('good');
    expect(density.descriptiveNote).toBeUndefined();
  });
});

describe('buildMetricCatalog with a class B config override (code-quality-metrics-wcj)', () => {
  it('withholds the duplication_density_pct verdict when summary.config_sources.class_b_overridden is true', () => {
    const summary = fullSummary({
      config_sources: { files: ['/repo/.codemetrics.json'], overrides: { DUPLICATE_MIN_LINES: 5 }, class_b_overridden: true }
    });
    const entries = buildMetricCatalog(summary, fullDuplicates());
    const density = entries.find(e => e.key === 'duplication_density_pct');

    expect(density.hasGauge).toBe(false);
    expect(density.status).toBe('neutral');
    expect(density.concern).toBe(-Infinity);
    expect(density.healthyBoundary).toBeNull();
    expect(density.criticalBoundary).toBeNull();
    expect(density.descriptiveNote).toMatch(/DUPLICATE_MIN_LINES|DUPLICATE_MIN_TOKENS/);
  });

  it('[guard] leaves the duplication_density_pct verdict intact when class_b_overridden is false', () => {
    const summary = fullSummary({
      config_sources: { files: [], overrides: {}, class_b_overridden: false }
    });
    const entries = buildMetricCatalog(summary, fullDuplicates());
    const density = entries.find(e => e.key === 'duplication_density_pct');

    expect(density.hasGauge).toBe(true);
    expect(density.descriptiveNote).toBeUndefined();
  });

  it('[guard] leaves the duplication_density_pct verdict intact when config_sources is absent entirely', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    const density = entries.find(e => e.key === 'duplication_density_pct');

    expect(density.hasGauge).toBe(true);
    expect(density.descriptiveNote).toBeUndefined();
  });
});

// code-quality-metrics-yte: five fixed headings, seventeen tiles, no remainder. The mapping
// below is copied from the issue's own table (decided with the user, not re-derived here) so
// this test can assert membership directly against it rather than merely asserting the
// headings exist -- a test that only checks "five headings render" proves nothing about which
// tile sits under which one, and a test that checks the total proves nothing about any single
// tile having the right home.
describe('buildMetricCatalog metric groups (code-quality-metrics-yte)', () => {
  const EXPECTED_GROUP_BY_KEY = {
    large_commits_pct: 'Change size and scope',
    sprawling_commits_pct: 'Change size and scope',
    avg_lines_changed: 'Change size and scope',
    p90_lines_changed: 'Change size and scope',
    p90_files_changed: 'Change size and scope',
    net_additions_ratio_median: 'Change size and scope',

    duplication_density_pct: 'Duplication',
    duplication_lines: 'Duplication',
    duplication_clones: 'Duplication',
    duplication_semantic_findings: 'Duplication',

    test_coverage_rate: 'Test practice',
    test_isolation_rate: 'Test practice',
    uncovered_prod_rate: 'Test practice',

    velocity_commits_per_day: 'Pace and direction',
    commit_size_trend: 'Pace and direction',
    velocity_trend: 'Pace and direction',

    message_quality_pct: 'Commit messages'
  };

  it('assigns every one of the seventeen tiles to its documented group, with no tile left ungrouped and no group beyond the five documented headings', () => {
    const entries = buildMetricCatalog(fullSummary(), fullDuplicates());
    expect(entries).toHaveLength(17);

    for (const [key, expectedGroup] of Object.entries(EXPECTED_GROUP_BY_KEY)) {
      const entry = entries.find(e => e.key === key);
      expect(entry).toBeDefined();
      expect(entry.group).toBe(expectedGroup);
    }

    const distinctGroups = new Set(entries.map(e => e.group));
    expect(distinctGroups).toEqual(new Set(Object.values(EXPECTED_GROUP_BY_KEY)));
  });

  // [guard] not a called-shot RED: this test was already green on arrival, since
  // groupForMetricKey's throw was written as part of the previous cycle's implementation
  // (needed to keep buildMetricCatalog itself from silently producing an ungrouped entry).
  // Kept as its own case so removing the throw -- letting an unrecognized key fall through
  // to `undefined` and render with no heading, the "other" bucket this ticket forbids -- is
  // caught here directly rather than only incidentally by the membership test above.
  it('[guard] throws rather than silently omitting a group for an unrecognized catalog key', () => {
    expect(() => groupForMetricKey('totally_unknown_key')).toThrow(/totally_unknown_key/);
  });

  // [guard] not a called-shot RED: grouping is a post-hoc filter over an array
  // buildMetricCatalog already sorts by concern (pre-existing behavior, covered by "sorts the
  // returned entries by concern descending" above); attaching `.group` does not touch that
  // sort. Kept as its own case to pin the specific concern this ticket is required to
  // preserve within one named group, rather than relying on the generic sort test to cover it
  // incidentally.
  it('[guard] preserves concern order inside a group after grouping: "Change size and scope" keeps its concern-sorted order', () => {
    const entries = buildMetricCatalog(fullSummary({
      large_commits_pct: '35.00',
      sprawling_commits_pct: '19.00'
    }));
    const groupKeys = entries.filter(e => e.group === 'Change size and scope').map(e => e.key);
    expect(groupKeys).toEqual([
      'large_commits_pct',
      'sprawling_commits_pct',
      'p90_lines_changed',
      'p90_files_changed',
      'net_additions_ratio_median',
      'avg_lines_changed'
    ]);
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
