// @ts-nocheck
'use strict';

// Threshold bands used to interpret computed metrics (large commit rate,
// sprawling commit rate, test coverage, etc). Grouped by metric name, not by
// which function in lib/metrics.js currently consumes them, so a future
// lib/report.js can reuse the same boundaries to draw gauge/threshold bands
// (e.g. "large_commits_pct: healthy below 20, critical above 40").
//
// Six bands below are calibrated from calibration/observations.json (12 usable
// observations across nodejs/node, emberjs/ember.js, git/git, postgres/postgres,
// django/django and curl/curl); run `node calibration/derive-bands.js` to
// reproduce. healthy = p75 of observed values (p25 for higher-is-better);
// critical = the max observed value (min for higher-is-better), reported only
// when at least two distinct repositories produced a value within 15% of that
// extreme (derive-bands.js's tiering; a single-repo extreme is reported as
// critical: null instead, a "two-band" metric -- see lib/report.js and
// calibration/README.md). A `critical: null` band is a deliberate, checked
// absence of evidence, not an omission.
const THRESHOLDS = {
  // p75 = 23, max = 30 (n = 12). Two distinct repos sit within 15% of the max:
  // nodejs/node (26, 30) and curl/curl (30). Three-band.
  LARGE_COMMITS_PCT: { healthy: 23, critical: 30 },

  // p75 = 18.5 -> rounds to 19 (n = 12). max = 24, but only nodejs/node's
  // window sits within 15% of it (the next-highest value, 20, is 16.7% below
  // the max, held by other repos) -- no second repo corroborates the extreme,
  // so no critical bound is reported. Two-band.
  SPRAWLING_COMMITS_PCT: { healthy: 19, critical: null },

  TEST_COVERAGE_RATE: { warning: 30, healthy: 50 },
  TEST_ISOLATION_RATE: { positive: 10 },

  // p75 = 16, max = 20 (n = 12). Two distinct repos sit within 15% of the max:
  // nodejs/node (18) and emberjs/ember.js (20). Three-band. Key renamed from
  // "warning" to "healthy" to match the shape of the other calibrated bands.
  UNCOVERED_PROD_RATE: { healthy: 16, critical: 20 },

  MESSAGE_QUALITY_PCT: { healthy: 60, critical: 40 },

  // p75 = 147.585 -> rounds to 150 (n = 12). max = 264.14 -> rounds to 260,
  // but only nodejs/node's window sits within 15% of it (the next-highest
  // value, 193.16 from postgres/postgres, is 26.9% below the max) -- no
  // second repo corroborates the extreme, so no critical bound is reported.
  // Two-band. Key renamed from "warning" to "healthy" to match the shape of
  // the other calibrated bands.
  AVG_LINES_CHANGED: { healthy: 150, critical: null },

  AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },

  // p75 = 255.75 -> rounds to 260 (n = 12). max = 474.5 -> rounds to 470, but
  // only nodejs/node's window sits within 15% of it (the next-highest value,
  // 285.5 from curl/curl, is 39.8% below the max) -- no second repo
  // corroborates the extreme, so no critical bound is reported. Two-band.
  P90_LINES_CHANGED: { healthy: 260, critical: null },

  // p75 = 9.625 -> rounds to 9.5, max = 13.2 -> rounds to 13 (n = 12). Two
  // distinct repos sit within 15% of the max: nodejs/node (13.2) and
  // curl/curl (13.1, 11.5). Three-band.
  P90_FILES_CHANGED: { healthy: 9.5, critical: 13 },

  // p75 = 0.5060 -> rounds to 0.51, max = 0.7865 -> rounds to 0.79 (n = 12).
  // Three distinct repos sit within 15% of the max: git/git (0.79), nodejs/node
  // (0.72) and django/django (0.68). Three-band. Was previously withheld from
  // adoption on the (incorrect, since verified against derive-bands.js) claim
  // that the extreme rested on a single window; see code-quality-metrics-acl.
  NET_ADDITIONS_RATIO_MEDIAN: { healthy: 0.51, critical: 0.79 },

  // Derived empirically (n=2 repos, 5 scopes, self-referential and
  // provisional; see code-quality-metrics-oxn). Production code clustered
  // 0.5-3.1% across both repos measured; test code reached 9.7% in the same
  // repo whose production code measured 0.75%, since repeated setup is
  // normal in tests, so this band applies to production-only scans.
  // critical sits just above where that test-code repetition landed.
  DUPLICATION_PCT: { healthy: 3, critical: 10 },

  // Boundaries used by classifyDoraArchetype(), evaluated in priority order:
  // HARMONIOUS -> LEGACY_BOTTLENECK -> FOUNDATIONAL_CHALLENGES -> mixed-signals
  DORA_ARCHETYPE: {
    HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
    LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
    FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
  }
};

module.exports = { THRESHOLDS };
