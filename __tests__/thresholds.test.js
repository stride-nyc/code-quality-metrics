'use strict';

const { THRESHOLDS } = require('../lib/thresholds');

// Values-lock test: pins the exact numeric bands lib/thresholds.js exports. This
// is intentionally an equality assertion on data, not on behavior -- when the
// calibrated bands change deliberately (as they do here: every band is
// re-derived from `node calibration/derive-bands.js --era current` (n=12),
// per code-quality-metrics-82k, rather than the pooled default. Seven
// previously-adopted bands move, and test_coverage_rate and duplication_pct
// gain a real, observation-derived band for the first time. test_isolation_rate
// stays informational: derive-bands.js computes no healthy/critical for it, so
// its `positive` value is not calibration-derived), this test is updated to
// match, not weakened or deleted. See calibration/README.md and
// lib/thresholds.js's own comments for provenance.
//
// MESSAGE_QUALITY_PCT and NET_ADDITIONS_RATIO_MEDIAN are deliberately absent
// (code-quality-metrics-a9z, code-quality-metrics-6ti): both bands are dropped
// because the literature review found no defensible boundary for either
// measure, so both metrics are now reported descriptively with no band at
// all -- not merely re-tiered, removed. See lib/thresholds.js's own comment
// at the removal site for the full rationale.
//
// AVG_LINES_CHANGED is likewise deliberately absent (code-quality-metrics-6dg): three
// independent published fits (Kolassa et al.'s Generalized Pareto shape xi = 1.4617, Arafat
// and Riehle's power law exponent -1.8612, Hattori and Lanza's Pareto Q-Q fit) agree the
// per-commit line-count population is heavy-tailed with no finite mean, so a mean-based
// band is not a statistic the population has. See lib/thresholds.js's own comment at the
// removal site for the full rationale.
//
// DORA_ARCHETYPE is also deliberately absent (code-quality-metrics-6vi): it used to hold a
// second, hand-copied set of large/sprawling/testCoverage/uncoveredProd/messageQuality numbers
// for classifyDoraArchetype() to read, and those copies went stale relative to the bands above
// (sprawling drifted to nearly half the calibrated value) without anything catching it.
// classifyDoraArchetype() in lib/metrics.js now reads LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT,
// TEST_COVERAGE_RATE and UNCOVERED_PROD_RATE above directly, so there is nothing left for a
// DORA_ARCHETYPE key to hold: duplicating a value here is exactly what let it go stale.
describe('THRESHOLDS', () => {
  it('exports the calibrated numeric bands', () => {
    expect(THRESHOLDS).toEqual({
      LARGE_COMMITS_PCT: { healthy: 19, critical: 30 },
      SPRAWLING_COMMITS_PCT: { healthy: 18, critical: 20 },
      TEST_COVERAGE_RATE: { warning: 30, healthy: 23 },
      TEST_ISOLATION_RATE: { positive: 10 },
      UNCOVERED_PROD_RATE: { healthy: 13, critical: null },
      AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },
      P90_LINES_CHANGED: { healthy: 260, critical: null },
      P90_FILES_CHANGED: { healthy: 8, critical: null },
      DUPLICATION_PCT: { healthy: 6, critical: 6.5 }
    });
  });
});
