'use strict';

const { THRESHOLDS } = require('../lib/thresholds');

// Values-lock test: pins the exact numeric bands lib/thresholds.js exports. This
// is intentionally an equality assertion on data, not on behavior -- when the
// calibrated bands change deliberately (as they do here, moving six bands from
// invented multiples to calibration/observations.json-derived p75/max values,
// three of them two-band with critical: null per calibration/derive-bands.js's
// tiering), this test is updated to match, not weakened or deleted. See
// calibration/README.md and lib/thresholds.js's own comments for provenance.
describe('THRESHOLDS', () => {
  it('exports the calibrated numeric bands', () => {
    expect(THRESHOLDS).toEqual({
      LARGE_COMMITS_PCT: { healthy: 23, critical: 30 },
      SPRAWLING_COMMITS_PCT: { healthy: 19, critical: null },
      TEST_COVERAGE_RATE: { warning: 30, healthy: 50 },
      TEST_ISOLATION_RATE: { positive: 10 },
      UNCOVERED_PROD_RATE: { healthy: 16, critical: 20 },
      MESSAGE_QUALITY_PCT: { healthy: 60, critical: 40 },
      AVG_LINES_CHANGED: { healthy: 150, critical: null },
      AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },
      P90_LINES_CHANGED: { healthy: 260, critical: null },
      P90_FILES_CHANGED: { healthy: 9.5, critical: 13 },
      NET_ADDITIONS_RATIO_MEDIAN: { healthy: 0.33, critical: 0.50 },
      DUPLICATION_PCT: { healthy: 3, critical: 10 },
      DORA_ARCHETYPE: {
        HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
        LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
        FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
      }
    });
  });
});
