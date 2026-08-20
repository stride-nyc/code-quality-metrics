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
  // p75 = 17.5 -> rounds to 18, max = 30 (n = 12, era: current, re-measured after
  // #76 committer-date selection, #80 bot filtering, and the reference-config
  // exclusions -- code-quality-metrics coordination task). Only curl/curl (30)
  // sits within 15% of the max. nodejs/node's old corroborating value (28) was
  // measured before bot filtering; nodejs/node's real values are now 8 and 22,
  // neither near the extreme. Two-band -- LARGE_COMMITS_PCT loses its critical
  // bound under the re-measured data; this is the notable change of this pass.
  LARGE_COMMITS_PCT: { healthy: 18, critical: null },

  // p75 = 18 exactly, max = 18 (n = 12, era: current, re-measured -- see
  // LARGE_COMMITS_PCT above). Four distinct repos sit within 15% of the max:
  // nodejs/node (18), postgres/postgres (16), django/django (18) and curl/curl
  // (18, 18). Corroboration alone would call this three-band, but the
  // corroborated critical bound equals the healthy bound exactly -- a
  // zero-width warning band that breaks lib/report.js's computeConcern, which
  // divides by (criticalBoundary - healthyBoundary): 0 in this case, sending
  // every value above healthy to Infinity/NaN instead of a graduated verdict.
  // calibration/derive-bands.js's deriveBand now treats a rounded critical
  // equal to the rounded healthy bound as degenerate and downgrades to
  // two-band regardless of corroboration, so critical is reported null.
  SPRAWLING_COMMITS_PCT: { healthy: 18, critical: null },

  // healthy: p25 = 23 exactly, min = 6 (n = 12, era: current, higher-is-better,
  // re-measured after #76/#80/reference-configs -- see LARGE_COMMITS_PCT above;
  // this band is unchanged by the re-measurement). Only emberjs/ember.js sits
  // within 15% of the extreme -- no second repo corroborates it, so no
  // critical bound is reported. Two-band.
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

  // p75 = 10 exactly, max = 20 (n = 12, era: current, re-measured -- see
  // LARGE_COMMITS_PCT above; healthy moves 13 -> 10 under the re-measured
  // data). Only emberjs/ember.js sits within 15% of the max -- no second repo
  // corroborates the extreme, so no critical bound is reported. Two-band.
  UNCOVERED_PROD_RATE: { healthy: 10, critical: null },

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

  // p75 = 252.2 -> rounds to 250, max = 352.5 (n = 12, era: current,
  // re-measured -- see LARGE_COMMITS_PCT above; healthy moves 260 -> 250
  // under the re-measured data). Only nodejs/node sits within 15% of the max
  // -- no second repo corroborates the extreme, so no critical bound is
  // reported. Two-band.
  P90_LINES_CHANGED: { healthy: 250, critical: null },

  // p75 = 8.65 -> rounds to 8.5, max = 13.1 (n = 12, era: current,
  // re-measured -- see LARGE_COMMITS_PCT above; healthy moves 8 -> 8.5 under
  // the re-measured data). Only curl/curl sits within 15% of the max (two of
  // its own windows, 13.1 and 11.5) -- no second, distinct repo corroborates
  // the extreme, so no critical bound is reported. Two-band.
  P90_FILES_CHANGED: { healthy: 8.5, critical: null },

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

  // healthy: p75 = 2.04 -> rounds to 2, max = 3.71 (n = 12, era: current,
  // re-measured -- see LARGE_COMMITS_PCT above; the healthy value is
  // unchanged by the re-measurement, still 2 after rounding). Only curl/curl
  // sits within 15% of the max (two of its own windows, 3.71 and 3.35), so no
  // critical bound is reported. Two-band.
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
  DUPLICATION_PCT: { healthy: 2, critical: null },

  // There used to be a DORA_ARCHETYPE key here holding a second, hand-copied set of
  // large/sprawling/testCoverage/uncoveredProd/messageQuality numbers for
  // classifyDoraArchetype() (lib/metrics.js) to read. Those copies went stale relative to the
  // bands above without anything catching it (code-quality-metrics-6vi: sprawling's copy had
  // drifted to nearly half the calibrated SPRAWLING_COMMITS_PCT value), and messageQuality's
  // copy kept scoring MESSAGE_QUALITY_PCT after that band was deliberately dropped above.
  // classifyDoraArchetype() now reads LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT,
  // TEST_COVERAGE_RATE and UNCOVERED_PROD_RATE directly instead, so there is nothing left for a
  // DORA_ARCHETYPE key to hold: duplicating a value here is exactly what let it go stale.

  // A second, separately named band set: quantiles of the greenfield-modern reference
  // population (calibration/observations.json, population: "greenfield-modern"), not a
  // replacement for any band above. The eight bands above describe maintenance-era work on
  // six decades-old codebases; every observation in this set instead measures a project's own
  // first several months (code-quality-metrics-4cv). Run
  // `node calibration/derive-bands.js --population greenfield-modern` to reproduce every
  // number below. Same derivation rule as the default population: healthy = p75 of observed
  // values (p25 for higher-is-better); critical = the max observed value (min for
  // higher-is-better), reported only when at least two distinct repositories produced a value
  // within 15% of that extreme.
  //
  // n = 2 for every band below (stride-nyc/remote_retro, stride-nyc/dotnetdependencytracer --
  // the only two repositories in this population; see calibration/README.md's "Greenfield
  // reference set" section for why `greenfield-historical`'s older repositories cannot
  // substitute). That is a much thinner sample than the n = 12 behind every band above, and it
  // carries its own circularity: both supporting repositories are members of the five-repo eval
  // set this toolkit's own maintainer uses day to day (calibration/observations.json's
  // `greenfield-modern-eval-circularity` reservation), so scoring either repository's own
  // commits against a band it helped define answers "does this repository resemble itself," not
  // "is this repository's practice unusual." GitHub #84 tracks growing this population past two
  // repositories; until then, treat every band below as provisional in a way the bands above are
  // not.
  GREENFIELD_MODERN: {
    // p75 = 47.6675 -> rounds to 48, max = 58.00 (n = 2). Only
    // stride-nyc/dotnetdependencytracer (58.00, its own value) sits within 15% of the max --
    // stride-nyc/remote_retro's 16.67 does not corroborate it, so no critical bound is
    // reported. Two-band.
    LARGE_COMMITS_PCT: { healthy: 48, critical: null },

    // p75 = 43.39 -> rounds to 43, max = 56.00 (n = 2). Only
    // stride-nyc/dotnetdependencytracer (56.00) sits within 15% of the max. Two-band.
    SPRAWLING_COMMITS_PCT: { healthy: 43, critical: null },

    // healthy: p25 = 22.67 -> rounds to 23, min = 5.56 (n = 2, higher-is-better). Only
    // stride-nyc/remote_retro (5.56, its own value) sits within 15% of the min. Two-band.
    TEST_COVERAGE_RATE: { healthy: 23, critical: null },

    // p75 = 11.555 -> rounds to 12, max = 12.00 (n = 2). Both repositories sit within 15% of
    // the max (11.11 and 12.00), which would normally corroborate a critical bound, but the
    // rounded critical (12) equals the rounded healthy bound (12) exactly -- the same
    // zero-width-warning-band case SPRAWLING_COMMITS_PCT hit above under the granular
    // population; deriveBand degrades it to two-band regardless of corroboration.
    UNCOVERED_PROD_RATE: { healthy: 12, critical: null },

    // p75 = 1024.0 -> rounds to 1020, max = 1056.20 -> rounds to 1060 (n = 2). Both
    // repositories sit within 15% of the max (927.40 and 1056.20 differ by about 12%), so this
    // is the one three-band metric in this population.
    P90_LINES_CHANGED: { healthy: 1020, critical: 1060 },

    // p75 = 11.075 -> rounds to 11, max = 13.10 (n = 2). Only
    // stride-nyc/dotnetdependencytracer (13.10, its own value) sits within 15% of the max.
    // Two-band.
    P90_FILES_CHANGED: { healthy: 11, critical: null },

    // p75 = 1.32 -> rounds to 1.5, max = 1.76 (n = 2). Only
    // stride-nyc/dotnetdependencytracer (1.76) sits within 15% of the max. Two-band.
    //
    // Re-derived at the same DUPLICATE_MIN_LINES/DUPLICATE_MIN_TOKENS (10/100) the granular
    // DUPLICATION_PCT band above uses -- see that band's own comment on why a duplication
    // percentage measured at a different detector sensitivity is not comparable to a band
    // derived at another.
    DUPLICATION_PCT: { healthy: 1.5, critical: null }
  }
};

module.exports = { THRESHOLDS };
