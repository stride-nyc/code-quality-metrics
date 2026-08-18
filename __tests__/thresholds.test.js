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
describe('THRESHOLDS', () => {
  it('exports the calibrated numeric bands', () => {
    expect(THRESHOLDS).toEqual({
      LARGE_COMMITS_PCT: { healthy: 19, critical: 30 },
      SPRAWLING_COMMITS_PCT: { healthy: 18, critical: 20 },
      TEST_COVERAGE_RATE: { warning: 30, healthy: 23 },
      TEST_ISOLATION_RATE: { positive: 10 },
      UNCOVERED_PROD_RATE: { healthy: 13, critical: null },
      AVG_LINES_CHANGED: { healthy: 140, critical: 200 },
      AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },
      P90_LINES_CHANGED: { healthy: 260, critical: null },
      P90_FILES_CHANGED: { healthy: 8, critical: null },
      DUPLICATION_PCT: { healthy: 6, critical: 6.5 },
      DORA_ARCHETYPE: {
        HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
        LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
        FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
      }
    });
  });
});
