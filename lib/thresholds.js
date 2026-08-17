// @ts-nocheck
'use strict';

// Threshold bands used to interpret computed metrics (large commit rate,
// sprawling commit rate, test coverage, etc). Grouped by metric name, not by
// which function in lib/metrics.js currently consumes them, so a future
// lib/report.js can reuse the same boundaries to draw gauge/threshold bands
// (e.g. "large_commits_pct: healthy below 20, critical above 40").
const THRESHOLDS = {
  LARGE_COMMITS_PCT: { healthy: 20, critical: 40 },
  SPRAWLING_COMMITS_PCT: { healthy: 10, critical: 25 },
  TEST_COVERAGE_RATE: { warning: 30, healthy: 50 },
  TEST_ISOLATION_RATE: { positive: 10 },
  UNCOVERED_PROD_RATE: { warning: 10, critical: 20 },
  MESSAGE_QUALITY_PCT: { healthy: 60, critical: 40 },
  AVG_LINES_CHANGED: { warning: 500, critical: 1000 },
  AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },
  P90_LINES_CHANGED: { healthy: 200, critical: 500 },
  P90_FILES_CHANGED: { healthy: 8, critical: 15 },
  NET_ADDITIONS_RATIO_MEDIAN: { healthy: 0.33, critical: 0.50 },

  // Boundaries used by classifyDoraArchetype(), evaluated in priority order:
  // HARMONIOUS -> LEGACY_BOTTLENECK -> FOUNDATIONAL_CHALLENGES -> mixed-signals
  DORA_ARCHETYPE: {
    HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
    LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
    FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
  }
};

module.exports = { THRESHOLDS };
