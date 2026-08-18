// @ts-nocheck
'use strict';

// Threshold bands used to interpret computed metrics (large commit rate,
// sprawling commit rate, test coverage, etc). Grouped by metric name, not by
// which function in lib/metrics.js currently consumes them, so a future
// lib/report.js can reuse the same boundaries to draw gauge/threshold bands
// (e.g. "large_commits_pct: healthy below 20, critical above 40").
//
// All eleven bands below (all but TEST_ISOLATION_RATE, which is structurally
// informational -- see its own comment) are calibrated from
// calibration/observations.json, restricted to era: "current" (12 usable
// observations across nodejs/node, emberjs/ember.js, git/git,
// postgres/postgres, django/django and curl/curl); run
// `node calibration/derive-bands.js --era current` to reproduce. The pre-AI
// (2019-2020) era observations stay in the dataset as validation of this
// baseline, not as its source -- see calibration/README.md's "Eras" section
// and code-quality-metrics-82k. healthy = p75 of observed values (p25 for
// higher-is-better); critical = the max observed value (min for
// higher-is-better), reported only when at least two distinct repositories
// produced a value within 15% of that extreme (derive-bands.js's tiering; a
// single-repo extreme is reported as critical: null instead, a "two-band"
// metric -- see lib/report.js and calibration/README.md). A `critical: null`
// band is a deliberate, checked absence of evidence, not an omission.
const THRESHOLDS = {
  // p75 = 19.2775 -> rounds to 19, max = 30 (n = 12, era: current). Two
  // distinct repos sit within 15% of the max: nodejs/node (28) and curl/curl
  // (30). Three-band.
  LARGE_COMMITS_PCT: { healthy: 19, critical: 30 },

  // p75 = 18 exactly, max = 20 (n = 12, era: current). Three distinct repos
  // sit within 15% of the max: nodejs/node (20), django/django (18) and
  // curl/curl (18, 18.37). Three-band.
  SPRAWLING_COMMITS_PCT: { healthy: 18, critical: 20 },

  // healthy: p25 = 23 exactly, min = 6 (n = 12, era: current, higher-is-better).
  // Only emberjs/ember.js sits within 15% of the extreme -- no second repo
  // corroborates it, so no critical bound is reported. Two-band.
  // warning: 30 is not calibration-derived (calibration/derive-bands.js
  // computes a single boundary for a two-band metric); it is the pre-existing
  // lower cutoff generateInsights() used before this metric had any observed
  // basis, kept because report.js never reads it (it explicitly forces
  // criticalBoundary: null instead, see lib/report.js) and no test pins a
  // value that depends on warning and healthy being in a particular order.
  TEST_COVERAGE_RATE: { warning: 30, healthy: 23 },

  // test_isolation_rate has no bad direction (calibration/derive-bands.js's
  // INFORMATIONAL list), so derive-bands.js computes healthy: null,
  // critical: null for it -- there is no boundary to adopt. era: current
  // observations: n = 12, min = 0, median = 11, max = 18 (near-max repo:
  // django/django at 18), recorded here for context only. `positive: 10` is
  // therefore not calibration-derived; it is the pre-existing display cutoff,
  // unchanged.
  TEST_ISOLATION_RATE: { positive: 10 },

  // p75 = 12.68 -> rounds to 13, max = 20 (n = 12, era: current). Only
  // emberjs/ember.js sits within 15% of the max -- no second repo
  // corroborates the extreme, so no critical bound is reported. Two-band.
  // Previously three-band (16/20) under the pooled (all-era) derivation;
  // era: current alone loses the second corroborating repo at the extreme.
  UNCOVERED_PROD_RATE: { healthy: 13, critical: null },

  // healthy: p25 = 65.5 -> rounds to 66, min = 18.37 (n = 12, era: current,
  // higher-is-better). Only emberjs/ember.js sits within 15% of the extreme --
  // no second repo corroborates it, so no critical bound is reported.
  // Two-band. Newly adopted from calibration/observations.json; the prior
  // {healthy: 60, critical: 40} pair had no recorded basis.
  MESSAGE_QUALITY_PCT: { healthy: 66, critical: null },

  // p75 = 139.335 -> rounds to 140, max = 203.76 -> rounds to 200 (n = 12,
  // era: current). Two distinct repos sit within 15% of the max: nodejs/node
  // (191.42) and postgres/postgres (203.76). Three-band. Previously two-band
  // (150/null) under the pooled derivation; era: current gains a second
  // corroborating repo at the extreme.
  AVG_LINES_CHANGED: { healthy: 140, critical: 200 },

  AI_BATCH_SHARE: { additionsRatio: 3, share: 0.3 },

  // p75 = 255.75 -> rounds to 260, max = 408.3 (n = 12, era: current). Only
  // nodejs/node sits within 15% of the max -- no second repo corroborates the
  // extreme, so no critical bound is reported. Two-band.
  P90_LINES_CHANGED: { healthy: 260, critical: null },

  // p75 = 8.125 -> rounds to 8, max = 13.1 (n = 12, era: current). Only
  // curl/curl sits within 15% of the max (two of its own windows, 13.1 and
  // 12.0) -- no second, distinct repo corroborates the extreme, so no
  // critical bound is reported. Two-band. Previously three-band (9.5/13)
  // under the pooled derivation; era: current data alone does not carry a
  // second repo's support at the extreme -- the tiering rule working as
  // intended, not a regression (code-quality-metrics-82k).
  P90_FILES_CHANGED: { healthy: 8, critical: null },

  // p75 = 0.625026 -> rounds to 0.63, max = 0.786474 -> rounds to 0.79
  // (n = 12, era: current). Two distinct repos sit within 15% of the max:
  // git/git (0.786474) and django/django (0.675325). Three-band.
  NET_ADDITIONS_RATIO_MEDIAN: { healthy: 0.63, critical: 0.79 },

  // p75 = 5.753678 -> rounds to 6, max = 6.466044 -> rounds to 6.5 (n = 12,
  // era: current). Three distinct repos sit within 15% of the max:
  // nodejs/node (5.598432), postgres/postgres (6.466044) and curl/curl
  // (6.318784, 6.219417). Three-band. Replaces the prior n=2-repo,
  // self-referential derivation (code-quality-metrics-oxn) with the standard
  // calibration/observations.json-based band.
  DUPLICATION_PCT: { healthy: 6, critical: 6.5 },

  // Boundaries used by classifyDoraArchetype(), evaluated in priority order:
  // HARMONIOUS -> LEGACY_BOTTLENECK -> FOUNDATIONAL_CHALLENGES -> mixed-signals
  DORA_ARCHETYPE: {
    HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
    LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
    FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
  }
};

module.exports = { THRESHOLDS };
