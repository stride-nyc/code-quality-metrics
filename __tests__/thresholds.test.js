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
//
// GREENFIELD_MODERN is a second, separately named band set (adopting
// code-quality-metrics-4cv's greenfield-modern reference population): its own bands are
// derived from a project's own first several months, not maintenance-era work, and must never
// be pooled into the flat keys above. Grown from n = 2 to n = 6 by code-quality-metrics-vxr9
// (stride-nyc/remote_retro, stride-nyc/dotnetdependencytracer, ziglang/zig, denoland/deno,
// tiangolo/fastapi, sveltejs/svelte); LARGE_COMMITS_PCT and P90_LINES_CHANGED are three-band
// under this population (P90_LINES_CHANGED already was at n = 2). TEST_COVERAGE_RATE and
// UNCOVERED_PROD_RATE are recorded here for provenance but are never read by
// GREENFIELD_SUBSTITUTED_KEYS (lib/report.js) -- see lib/thresholds.js's own comment at each
// key for the full derivation and the eval-circularity limitation that remains at n = 6.
describe('THRESHOLDS', () => {
  it('exports the calibrated numeric bands', () => {
    expect(THRESHOLDS).toEqual({
      LARGE_COMMITS_PCT: { healthy: 18, critical: null },
      SPRAWLING_COMMITS_PCT: { healthy: 18, critical: null },
      TEST_COVERAGE_RATE: { warning: 30, healthy: 23 },
      TEST_ISOLATION_RATE: { positive: 10 },
      UNCOVERED_PROD_RATE: { healthy: 10, critical: null },
      AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },
      P90_LINES_CHANGED: { healthy: 250, critical: null },
      P90_FILES_CHANGED: { healthy: 8.5, critical: null },
      DUPLICATION_PCT: { healthy: 2, critical: null },
      GREENFIELD_MODERN: {
        LARGE_COMMITS_PCT: { healthy: 45, critical: 58 },
        SPRAWLING_COMMITS_PCT: { healthy: 30, critical: null },
        TEST_COVERAGE_RATE: { healthy: 6, critical: null },
        UNCOVERED_PROD_RATE: { healthy: 22, critical: null },
        P90_LINES_CHANGED: { healthy: 820, critical: 1060 },
        P90_FILES_CHANGED: { healthy: 10, critical: null },
        DUPLICATION_PCT: { healthy: 1.5, critical: null }
      }
    });
  });
});
