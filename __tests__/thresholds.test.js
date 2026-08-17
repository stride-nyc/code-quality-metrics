'use strict';

const { THRESHOLDS } = require('../lib/thresholds');

describe('THRESHOLDS', () => {
  it('exports the exact numeric bands currently hardcoded in lib/metrics.js', () => {
    expect(THRESHOLDS).toEqual({
      LARGE_COMMITS_PCT: { healthy: 20, critical: 40 },
      SPRAWLING_COMMITS_PCT: { healthy: 10, critical: 25 },
      TEST_COVERAGE_RATE: { warning: 30, healthy: 50 },
      TEST_ISOLATION_RATE: { positive: 10 },
      UNCOVERED_PROD_RATE: { warning: 10, critical: 20 },
      MESSAGE_QUALITY_PCT: { healthy: 60 },
      AVG_LINES_CHANGED: { warning: 500, critical: 1000 },
      AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },
      DORA_ARCHETYPE: {
        HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
        LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
        FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
      }
    });
  });
});
