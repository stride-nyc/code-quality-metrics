// @ts-nocheck
'use strict';

// Threshold bands used to interpret computed metrics (large commit rate,
// sprawling commit rate, test coverage, etc). Grouped by metric name, not by
// which function in lib/metrics.js currently consumes them, so a future
// lib/report.js can reuse the same boundaries to draw gauge/threshold bands
// (e.g. "large_commits_pct: healthy below 20, critical above 40").
//
// All eight bands below (all but TEST_ISOLATION_RATE, MESSAGE_QUALITY_PCT,
// NET_ADDITIONS_RATIO_MEDIAN and AVG_LINES_CHANGED, which are structurally
// informational -- see each one's own comment, the latter three at their
// removal site) are calibrated from calibration/observations.json, restricted
// to era: "current" (12 usable
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

  // MESSAGE_QUALITY_PCT had no key here (code-quality-metrics-6ti): band dropped, not
  // re-tiered. Li and Ahmed's 185,026-commit comparison found semantic What/Why quality
  // beats word count at every window size (GLM coefficients differ by roughly two orders of
  // magnitude), and CommitBench's 23M-commit median of 11 T5 subword tokens sits below this
  // metric's 10-word bar even though T5 tokens run higher than words for the same text. The
  // metric is also bimodal on Conventional Commits adoption in a way a band cannot capture:
  // without the format the word branch fails most commits; with it the format branch passes
  // nearly all of them regardless of content. calibration/derive-bands.js now classifies
  // message_quality_pct informational (its INFORMATIONAL list), the same treatment
  // TEST_ISOLATION_RATE already gets below, so it stops proposing a band this file would
  // then disagree with. The rate is still reported, without a verdict; see lib/report.js's
  // catalog entry and metrics-specification.md's Metric 8 section.

  // AVG_LINES_CHANGED had no key here (code-quality-metrics-6dg): band dropped, not
  // re-tiered, even though the era:current data would still support a three-band pair (p75
  // 139.335 -> 140, max 203.76 -> 200, corroborated by nodejs/node at 191.42 and
  // postgres/postgres at 203.76). Three independent published fits agree the per-commit
  // line-count population is heavy-tailed with no finite mean: Kolassa, Riehle and Salim fit
  // a Generalized Pareto Distribution with shape xi = 1.4617 (a GPD has no finite mean above
  // xi = 1, no finite variance above xi = 0.5); Arafat and Riehle independently fit a power
  // law with exponent -1.8612 on the same underlying population; Hattori and Lanza confirm a
  // Pareto fit by Q-Q plot for files per commit across nine projects. Kolassa's own empirical
  // table shows the practical consequence: mean 465.72 sits above the reported 90th
  // percentile (261) of the same distribution, against a median of 16 -- the mean is not a
  // stable center for this population, so a boundary drawn on it (this one, or its critical
  // partner) is not a statistic the population reliably has. calibration/derive-bands.js does
  // not yet classify avg_lines_changed informational, so it still proposes a band this file
  // now disagrees with; that divergence is a known, tracked gap, not something this change
  // fixes (calibration/ is out of scope here). The average is still reported, without a
  // verdict; see lib/report.js's catalog entry and metrics-specification.md's Metric 4
  // section. p50/p90/p95 (P90_LINES_CHANGED below) carry the load this band used to carry.

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

  // NET_ADDITIONS_RATIO_MEDIAN had no key here (code-quality-metrics-a9z): band dropped, not
  // re-tiered, even though the era:current data would still support a three-band pair (p75
  // 0.63, max 0.79, corroborated by git/git and django/django). Nagappan and Ball tested
  // this exact additions-over-churn form as their M7, found it tied weakest of eight
  // relative-churn measures (rho .288), and stepwise regression dropped it from the model;
  // Shin et al. found the additions-only form met their prediction criterion in 0 of 80 runs
  // against 76 of 80 for total churn. Scoring a repository against a boundary on a measure
  // the literature specifically discarded is not defensible. calibration/derive-bands.js now
  // classifies net_additions_ratio_median informational (its INFORMATIONAL list), so it
  // stops proposing a band this file would then disagree with. The ratio is still reported,
  // without a verdict; see lib/report.js's catalog entry and metrics-specification.md's
  // Metric 7 section.

  // healthy: p75 = 1.90 -> rounds to 2, max = 3.712084 (n = 12, era: current).
  // Only curl/curl sits within 15% of the max, so no critical bound is
  // reported. Two-band.
  //
  // Re-derived at DUPLICATE_MIN_LINES/DUPLICATE_MIN_TOKENS 10/100
  // (code-quality-metrics-8ad). The prior band, healthy 6 / critical 6.5
  // three-band, was derived at 5/50 and left in place when the detector was
  // raised, so for a time this file scored duplication roughly three times
  // more permissively than its own reference set warranted, and claimed a
  // critical bound the re-measured data does not support. Wagner et al.
  // measured the same three systems at both settings and found roughly a
  // threefold difference, which is what the re-measurement found at the median
  // (3.24x across 24 windows), though not uniformly: curl, with the highest
  // baseline duplication, moved only about 1.7x while the sparsest windows
  // moved 6 to 10x.
  //
  // A band on this metric is only ever comparable at the detector settings it
  // was derived at. __tests__/thresholdProvenance.test.js now fails if this
  // file and calibration/derive-bands.js disagree, which is the gate that was
  // missing when the settings changed.
  DUPLICATION_PCT: { healthy: 2, critical: null }

  // There used to be a DORA_ARCHETYPE key here holding a second, hand-copied set of
  // large/sprawling/testCoverage/uncoveredProd/messageQuality numbers for
  // classifyDoraArchetype() (lib/metrics.js) to read. Those copies went stale relative to the
  // bands above without anything catching it (code-quality-metrics-6vi: sprawling's copy had
  // drifted to nearly half the calibrated SPRAWLING_COMMITS_PCT value), and messageQuality's
  // copy kept scoring MESSAGE_QUALITY_PCT after that band was deliberately dropped above.
  // classifyDoraArchetype() now reads LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT,
  // TEST_COVERAGE_RATE and UNCOVERED_PROD_RATE directly instead, so there is nothing left for a
  // DORA_ARCHETYPE key to hold: duplicating a value here is exactly what let it go stale.
};

module.exports = { THRESHOLDS };
