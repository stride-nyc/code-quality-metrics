// @ts-nocheck
'use strict';

const { THRESHOLDS } = require('./thresholds');

/**
 * Compute the concern score for a metric: how far the value has moved from
 * the healthy boundary toward the critical boundary. Works for both
 * directions without branching: for "higher is worse" metrics critical is
 * greater than healthy so the denominator is positive; for "higher is
 * better" metrics critical is less than healthy so the denominator is
 * negative, flipping the sign automatically for a low (bad) value.
 * @param {number} value
 * @param {number} healthyBoundary
 * @param {number} criticalBoundary
 * @returns {number}
 */
function computeConcern(value, healthyBoundary, criticalBoundary) {
  return (value - healthyBoundary) / (criticalBoundary - healthyBoundary);
}

/**
 * Convert a concern score into a status label.
 * @param {number} concern
 * @returns {'critical'|'warning'|'good'}
 */
function statusFromConcern(concern) {
  if (concern >= 1) return 'critical';
  if (concern >= 0) return 'warning';
  return 'good';
}

/**
 * Status for a two-band metric: no critical bound exists (its extreme rests
 * on a single reference repository/window; see calibration/derive-bands.js's
 * tiering and lib/thresholds.js's comments), so only good/warning are
 * possible -- never critical, at any distance from healthy.
 * @param {number} value
 * @param {number} healthyBoundary
 * @param {'higher-is-worse'|'higher-is-better'} direction
 * @returns {'good'|'warning'}
 */
function statusForTwoBand(value, healthyBoundary, direction) {
  const isGood = direction === 'higher-is-better' ? value >= healthyBoundary : value <= healthyBoundary;
  return isGood ? 'good' : 'warning';
}

/**
 * Build a standard (concern-formula-driven) catalog entry, or a two-band
 * entry when criticalBoundary is null/undefined. A null criticalBoundary is
 * not "critical is 0" -- feeding it into computeConcern's subtraction would
 * silently coerce null to 0 and fabricate a critical/warning verdict for
 * values nowhere near either boundary (the bug this branch exists to avoid).
 * Two-band entries get a fixed concern of -1, the same fixed-ordering
 * technique the purely informational entries below already use, so they
 * never outrank a real critical/warning (three-band) finding in the
 * relevance sort.
 * @param {object} opts
 * @returns {object}
 */
function standardEntry({ key, label, value, direction, healthyBoundary, criticalBoundary, hasGauge }) {
  if (criticalBoundary === null || criticalBoundary === undefined) {
    return {
      key,
      label,
      value,
      direction,
      status: statusForTwoBand(value, healthyBoundary, direction),
      concern: -1,
      hasGauge,
      healthyBoundary,
      criticalBoundary: null,
      tier: 'two-band'
    };
  }
  const concern = computeConcern(value, healthyBoundary, criticalBoundary);
  return {
    key,
    label,
    value,
    direction,
    status: statusFromConcern(concern),
    concern,
    hasGauge,
    healthyBoundary,
    criticalBoundary,
    tier: 'three-band'
  };
}

/**
 * Whether a catalog entry carries a real verdict a reader should weigh -- true for any banded
 * (two-band/three-band) entry regardless of its own status, and for an informational or
 * special-direction entry only when that entry's status itself reached 'warning' or 'critical'
 * (the only current example: commit_size_trend/velocity_trend under the growingAndAccelerating
 * rule below). False for every other informational/special entry -- message_quality_pct,
 * avg_lines_changed, net_additions_ratio_median, the duplication line/clone/semantic-finding
 * counts, an unmeasured tile, and test_isolation_rate's own 'good'/'neutral' status -- each of
 * which reports a real number but has no construct that could support a pass/fail call.
 *
 * Mirrors buildNarrativePayload's own verdict: 'none' rule (lib/narrative.js) exactly, so the
 * model-facing payload and a reader-facing deterministic fallback (lib/report-template.js's
 * fallbackFindings, code-quality-metrics-ponf) agree on which entries are verdict-bearing rather
 * than each re-deriving its own copy of this rule.
 * @param {object} entry
 * @returns {boolean}
 */
function hasVerdict(entry) {
  return !((entry.direction === 'informational' || entry.direction === 'special') && entry.status !== 'warning' && entry.status !== 'critical');
}

/**
 * Fixed heading order the report renders under (code-quality-metrics-yte). Chosen once and
 * never re-sorted by severity: a report whose headings reshuffle between runs is not
 * scannable across runs, so this order -- not concern -- decides which heading comes first.
 * @type {string[]}
 */
const METRIC_GROUP_ORDER = [
  'Change size and scope',
  'Duplication',
  'Test practice',
  'Pace and direction',
  'Commit messages'
];

/**
 * Which of METRIC_GROUP_ORDER's five headings each catalog key belongs under. Decided with
 * the user and recorded on code-quality-metrics-yte: grouped by what each metric measures (a
 * property of the metric itself), not by DORA capability (only two of DORA's seven AI
 * capabilities are commit-observable at all) and not by verdict tier. Every key
 * buildMetricCatalog can produce must appear here exactly once; there is no "other" or
 * "miscellaneous" bucket -- an unassigned key is a bug in this table, not a legitimate
 * fallback (see groupForMetricKey below).
 *
 * net_additions_ratio_median is the one deliberate judgement call: it measures composition
 * (net-new vs. edited) rather than size, but sits under size and scope because a reader
 * asking how big the changes are also wants to know whether it is new code or rework. It
 * could defensibly stand alone or sit with duplication instead.
 *
 * message_quality_pct is a deliberate singleton: it is genuinely not size, duplication,
 * testing or pace. Padding it into another group, or inventing a sixth category, would
 * misrepresent it more than one honest one-tile heading does.
 * @type {Record<string, string>}
 */
const METRIC_GROUP_BY_KEY = {
  large_commits_pct: 'Change size and scope',
  sprawling_commits_pct: 'Change size and scope',
  avg_lines_changed: 'Change size and scope',
  p90_lines_changed: 'Change size and scope',
  p90_files_changed: 'Change size and scope',
  net_additions_ratio_median: 'Change size and scope',

  duplication_density_pct: 'Duplication',
  duplication_lines: 'Duplication',
  duplication_clones: 'Duplication',
  duplication_semantic_findings: 'Duplication',

  test_coverage_rate: 'Test practice',
  test_isolation_rate: 'Test practice',
  uncovered_prod_rate: 'Test practice',

  velocity_commits_per_day: 'Pace and direction',
  commit_size_trend: 'Pace and direction',
  velocity_trend: 'Pace and direction',

  message_quality_pct: 'Commit messages'
};

/**
 * Look up which heading a catalog key renders under. Throws rather than defaulting to an
 * "other" bucket: every tile must have a home (code-quality-metrics-yte's acceptance
 * criterion), so a key with no entry in METRIC_GROUP_BY_KEY is a bug in that table, not a
 * legitimate fallback case that should render silently as ungrouped.
 * @param {string} key
 * @returns {string}
 */
function groupForMetricKey(key) {
  const group = METRIC_GROUP_BY_KEY[key];
  if (!group) {
    throw new Error(`No metric group assigned for catalog key "${key}". Every tile must belong to one of METRIC_GROUP_ORDER (lib/report.js); see code-quality-metrics-yte.`);
  }
  return group;
}

// code-quality-metrics-tjn: jscpd exits 0 and writes a report shaped exactly like a genuine
// "0% duplication, nothing to flag" measurement when it recognizes none of the scanned files'
// languages (verified live against remote_retro, an Elixir repository: jscpd does not
// recognize .ex/.exs). lib/duplicate.js tells this apart from a real zero with a relaxed probe
// pass and reports it as unsupported_extensions rather than a statistics object, so this catalog
// can render an explicit "not measurable" tile instead of a silently omitted metric (the prior
// behavior) or, worse, a confidently wrong "0%, healthy" gauge (the underlying defect). The note
// says the measurement does not exist for this language, not merely that DUPLICATION_PCT's band
// (derived from C, JavaScript, Python and Go repositories) does not apply here -- a stronger and
// different claim, per this project's own provenance discipline for every other withheld band.
function describeUnsupportedLanguages(extensions) {
  const list = extensions.join(', ');
  return `Not measurable: none of the scanned production file(s) use a language the duplication detector (jscpd) recognizes. File extension(s) found: ${list}. DUPLICATION_PCT's band was derived from C, JavaScript, Python and Go repositories and assumes a jscpd-parseable codebase; for this language, the measurement does not exist, not merely a band that does not apply.`;
}

/**
 * Build catalog entries for the duplicate-detection layers, from a
 * local_duplicate_analysis.json-shaped object. Returns [] when duplicates is
 * not supplied at all (older analysis runs, or runs that touched no
 * production files never write that file), mirroring how
 * generate-drift-report.js already omits the whole Duplicate Code section
 * for the same reason: absence of the file is not the same thing as a layer
 * having run and found nothing.
 *
 * duplicates.unsupported_extensions (code-quality-metrics-tjn) takes priority over
 * duplicates.statistics: when lib/duplicate.js has determined that no scanned file's language
 * is one jscpd recognizes, duplication_density_pct renders as an explicit informational "not
 * measurable" tile naming the extensions found, rather than being omitted or (the underlying
 * defect this fixes) showing a fabricated 0%/healthy verdict. duplication_lines and
 * duplication_clones still have no data to show in this case and stay omitted, the same as the
 * existing null-statistics path below.
 *
 * Otherwise, the static density/lines/clones tiles are omitted (not zeroed) when
 * duplicates.statistics is null: that happens when jscpd itself failed to produce a report at
 * all, which is a distinct "no measurement" case from the unsupported-language one above.
 *
 * The semantic tile always renders when duplicates is present, using
 * layers_run.semantic to distinguish "ran and found none" (status neutral,
 * value 0) from "never ran" (status unmeasured, value a "not measured"
 * label rather than a number) -- collapsing that distinction into a bare 0
 * is the exact failure this project has already hit once.
 * @param {object} [duplicates]
 * @returns {Array<object>}
 */
function buildDuplicationEntries(duplicates) {
  if (!duplicates) return [];

  const entries = [];
  const statistics = duplicates.statistics;
  // Read as unsupported_extensions (snake_case), matching what local-code-metrics.js
  // actually writes into local_duplicate_analysis.json -- buildMetricCatalog is only ever
  // called (via generate-drift-report.js) with that file's parsed JSON, never with
  // runDuplicateAnalysis's own in-memory camelCase return value directly, so a camelCase
  // read here would silently never match a real run's data (caught by running this fix
  // against remote_retro rather than only against unit-test fixtures).
  const unsupportedExtensions = duplicates.unsupported_extensions;

  if (unsupportedExtensions && unsupportedExtensions.length > 0) {
    entries.push({
      key: 'duplication_density_pct',
      label: 'Duplication density',
      value: 'Not measurable',
      direction: 'informational',
      status: 'neutral',
      concern: -Infinity,
      hasGauge: false,
      healthyBoundary: null,
      criticalBoundary: null,
      descriptiveNote: describeUnsupportedLanguages(unsupportedExtensions)
    });
  } else if (statistics) {
    entries.push(standardEntry({
      key: 'duplication_density_pct',
      label: 'Duplication density',
      value: statistics.percentage,
      direction: 'higher-is-worse',
      healthyBoundary: THRESHOLDS.DUPLICATION_PCT.healthy,
      criticalBoundary: THRESHOLDS.DUPLICATION_PCT.critical,
      hasGauge: true
    }));

    entries.push({
      key: 'duplication_lines',
      label: 'Duplicated lines',
      value: `${statistics.duplicatedLines} / ${statistics.lines}`,
      direction: 'informational',
      status: 'neutral',
      concern: -3,
      hasGauge: false,
      healthyBoundary: null,
      criticalBoundary: null
    });

    entries.push({
      key: 'duplication_clones',
      label: 'Clone count',
      value: statistics.clones,
      direction: 'informational',
      status: 'neutral',
      concern: -3,
      hasGauge: false,
      healthyBoundary: null,
      criticalBoundary: null
    });
  }

  // layers_run.semantic is false (never ran), true (produced a result), or the string
  // 'unmeasured' (attempted, but the call failed or its response was truncated). Only an
  // exact true means the count is real; Boolean() would read the truthy 'unmeasured'
  // string as a successful run and report a failed call as a confident zero.
  const semanticRan = Boolean(duplicates.layers_run) && duplicates.layers_run.semantic === true;
  entries.push({
    key: 'duplication_semantic_findings',
    label: 'Semantic duplicates',
    value: semanticRan ? (duplicates.semantic_findings || []).length : 'Not measured',
    direction: 'informational',
    status: semanticRan ? 'neutral' : 'unmeasured',
    // Sorts after every other entry, since concern is meaningless for a tile
    // that never produced a measurement at all. -Infinity rather than a fixed
    // -4: a real, formula-computed concern (duplication_density_pct included)
    // can fall below any finite sentinel once a calibrated band narrows enough
    // (DUPLICATION_PCT's era:current healthy/critical span is 0.5, versus 7
    // previously), which let a "very good" duplication reading outrank this
    // tile for last place -- found via code-quality-metrics-82k.
    concern: -Infinity,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });

  return entries;
}

// The nine catalog entries below measuring commit shape still carry a verdict under granular
// history. Three more -- message_quality_pct, net_additions_ratio_median and avg_lines_changed
// -- are already informational for unrelated reasons (see each one's own entry below), so
// withholding them again here would just duplicate, not compose with, those existing notes.
// Under squashed history each analyzed unit is a whole pull request, not a commit, so none of
// the bands below apply.
const WITHHELD_WHEN_SQUASHED_KEYS = new Set([
  'large_commits_pct', 'sprawling_commits_pct', 'uncovered_prod_rate', 'test_coverage_rate',
  'p90_lines_changed', 'p90_files_changed', 'test_isolation_rate',
  'commit_size_trend', 'velocity_trend'
]);

const WITHHELD_WHEN_SQUASHED_NOTE = 'No verdict: history is squashed pull requests, not granular commits, so each analyzed unit is a whole pull request rather than an individual commit, and the healthy/critical bands were calibrated on repositories with granular history. The value is reported for reference only.';

// code-quality-metrics-wcj: a repo-local .codemetrics.json may override
// DUPLICATE_MIN_LINES and/or DUPLICATE_MIN_TOKENS (detector sensitivity, not
// what the measurement counts). Wagner et al. (SANER 2016) measured roughly a
// threefold difference in reported duplication on the same three systems at
// 5/50 versus 10/100, so a percentage measured at an overridden sensitivity is
// not comparable to a band derived at the default sensitivity -- the
// duplication verdict has to be withheld exactly as squashed history
// withholds the commit-unit verdicts above, just for a different reason and
// (see buildMetricCatalog below) at a different point in the pipeline.
const WITHHELD_CLASS_B_OVERRIDE_NOTE = 'No verdict: DUPLICATE_MIN_LINES and/or DUPLICATE_MIN_TOKENS were overridden by a repo-local .codemetrics.json, and the healthy/critical band was calibrated at the default detector sensitivity. Wagner et al. measured roughly a threefold difference in reported duplication on the same systems at different minimums, so a percentage measured at a different sensitivity cannot be compared to this band. The value is reported for reference only.';

// code-quality-metrics-31w: large/sprawling commit %, p90 lines/files changed and duplication
// density are biased against a genuine initial build in the same direction, toward a worse
// verdict -- large commits are disproportionately forward engineering, and initial build
// carries scaffolding, vendored dependencies and generated files (Hattori and Lanza, EVOL
// 2008); duplication density swings on a small total-lines denominator. summary.project_lifecycle
// is set by local-code-metrics.js from a purely structural fact -- whether the analyzed window
// includes the repository's own first commit(s) -- not a tuned number, so no new invented
// figure joins the six this project has already withdrawn.
const WITHHELD_WHEN_GREENFIELD_KEYS = new Set([
  'large_commits_pct', 'sprawling_commits_pct', 'p90_lines_changed', 'p90_files_changed'
]);

const WITHHELD_WHEN_GREENFIELD_NOTE = "No verdict: the bands are quantiles of maintenance-era windows on decades-old codebases (calibration/observations.json's brownfield-only-lifecycle reservation) and do not transfer to an initial build. The analyzed window includes this repository's own first commit(s), so this looks like the start of a build rather than an established codebase. The value is reported for reference only.";

// code-quality-metrics coordination task: a greenfield-modern reference band now exists
// (lib/thresholds.js's THRESHOLDS.GREENFIELD_MODERN) for these same four keys, so an
// initial-build window scores them against it instead of withholding -- see
// substituteBand below. Mapping from catalog key to its GREENFIELD_MODERN key; a key in
// WITHHELD_WHEN_GREENFIELD_KEYS with no entry here, or whose THRESHOLDS.GREENFIELD_MODERN
// band is absent, still falls through to withholdEntry below (buildMetricCatalog), keeping
// the withholding path intact for any metric the greenfield set cannot support.
const GREENFIELD_SUBSTITUTED_KEYS = {
  large_commits_pct: 'LARGE_COMMITS_PCT',
  sprawling_commits_pct: 'SPRAWLING_COMMITS_PCT',
  p90_lines_changed: 'P90_LINES_CHANGED',
  p90_files_changed: 'P90_FILES_CHANGED'
};

// duplication_density_pct is substituted too (same Hattori-and-Lanza-adjacent rationale as
// WITHHELD_WHEN_GREENFIELD_KEYS's own comment: a young codebase's small total-lines
// denominator swings on a few blocks), but it is appended to the catalog after
// buildDuplicationEntries runs, so it is handled in its own pass in buildMetricCatalog below,
// mirroring how it already gets its own separate withholding pass rather than living in
// WITHHELD_WHEN_GREENFIELD_KEYS.
//
// test_coverage_rate and uncovered_prod_rate are deliberately left out of both this map and
// WITHHELD_WHEN_GREENFIELD_KEYS: the initial-build bias this substitution exists to correct
// is specifically about change-size and duplication metrics inflated by scaffolding, vendored
// dependencies and generated files (Hattori and Lanza, EVOL 2008) -- there is no equivalent
// published or reasoned claim that test/prod co-change behaves differently in an initial
// build, so there is no basis to prefer the far thinner (n=2) greenfield-modern band over the
// brownfield one (n=12) already in use for either. Both keep scoring against the brownfield
// band unconditionally, exactly as they did before this task, regardless of project_lifecycle.
//
// Provenance recorded on every substituted entry, so the rendered report can say which band
// produced a verdict and how much evidence stands behind it: n=6 against the brownfield
// bands' n=12 (code-quality-metrics-vxr9 grew this population from its original n=2). Two of
// the six supporting repositories, stride-nyc/remote_retro and stride-nyc/dotnetdependencytracer,
// are also members of the five-repo eval set this toolkit's own maintainer uses day to day
// (calibration/observations.json's greenfield-modern-eval-circularity reservation, GitHub
// #84); the other four (ziglang/zig, denoland/deno, tiangolo/fastapi, sveltejs/svelte) have no
// connection to this toolkit or its maintainer, which materially reduces but does not
// eliminate that circularity concern. lib/report-template.js reads this to render a visibly
// different tile, not the same-looking one a silent substitution would produce.
const GREENFIELD_MODERN_PROVENANCE = { population: 'greenfield-modern', n: 6 };

/**
 * Recompute a catalog entry's verdict against a different band (e.g. greenfield-modern)
 * instead of the default one standardEntry originally scored it against, keeping its
 * value/direction/hasGauge, and record bandProvenance so a reader -- and
 * lib/report-template.js -- can tell this verdict came from a substituted band. Mirrors
 * standardEntry's own two-band/three-band branching exactly: a substituted band can land on
 * either tier independent of what tier the default band happened to be (P90_LINES_CHANGED is
 * two-band under the default population but three-band under greenfield-modern).
 * @param {object} entry
 * @param {{healthy: number, critical: (number|null|undefined)}} band
 * @param {object} provenance
 * @returns {object}
 */
function substituteBand(entry, band, provenance) {
  if (band.critical === null || band.critical === undefined) {
    return {
      ...entry,
      healthyBoundary: band.healthy,
      criticalBoundary: null,
      status: statusForTwoBand(entry.value, band.healthy, entry.direction),
      concern: -1,
      tier: 'two-band',
      bandProvenance: provenance
    };
  }
  const concern = computeConcern(entry.value, band.healthy, band.critical);
  return {
    ...entry,
    healthyBoundary: band.healthy,
    criticalBoundary: band.critical,
    status: statusFromConcern(concern),
    concern,
    tier: 'three-band',
    bandProvenance: provenance
  };
}

/**
 * Strip a catalog entry's verdict machinery down to a plain informational
 * report, the same shape lib/report.js already uses for
 * net_additions_ratio_median and message_quality_pct: no gauge, neutral
 * status, concern fixed at -Infinity (never a new finite sentinel -- see
 * duplication_semantic_findings's own history, code-quality-metrics-82k),
 * and a descriptiveNote carrying the reason in place of a boundary.
 * @param {object} entry
 * @param {string} [note] reason to report in place of the withheld boundary
 * @returns {object}
 */
function withholdEntry(entry, note = WITHHELD_WHEN_SQUASHED_NOTE) {
  return {
    ...entry,
    direction: 'informational',
    status: 'neutral',
    concern: -Infinity,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null,
    tier: undefined,
    descriptiveNote: note
  };
}

/**
 * Build a sorted metric catalog from a local_metrics_summary.json-shaped
 * object, plus optional duplicate-detection data (a
 * local_duplicate_analysis.json-shaped object). duplicates is optional so
 * existing callers passing only a summary keep working unchanged.
 * @param {object} summary
 * @param {object} [duplicates]
 * @returns {Array<object>}
 */
function buildMetricCatalog(summary, duplicates) {
  const entries = [];

  entries.push(standardEntry({
    key: 'large_commits_pct',
    label: 'Large commits',
    value: parseFloat(summary.large_commits_pct),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.LARGE_COMMITS_PCT.healthy,
    criticalBoundary: THRESHOLDS.LARGE_COMMITS_PCT.critical,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'sprawling_commits_pct',
    label: 'Sprawling commits',
    value: parseFloat(summary.sprawling_commits_pct),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.SPRAWLING_COMMITS_PCT.healthy,
    criticalBoundary: THRESHOLDS.SPRAWLING_COMMITS_PCT.critical,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'uncovered_prod_rate',
    // code-quality-metrics-4er: "prod" is an abbreviation the reader has no reason to know.
    label: 'Uncovered production',
    value: parseFloat(summary.uncovered_prod_rate),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.UNCOVERED_PROD_RATE.healthy,
    criticalBoundary: THRESHOLDS.UNCOVERED_PROD_RATE.critical,
    hasGauge: true
  }));

  // code-quality-metrics-6ti: reported descriptively, no verdict. Li and Ahmed's
  // 185,026-commit comparison found semantic What/Why quality beats word count at every
  // window size, and the metric is bimodal on Conventional Commits adoption in a way a
  // band cannot capture -- the rate mostly answers whether the project uses the format, not
  // whether messages are good. concern is fixed at -Infinity, not a new finite sentinel: a
  // formula-computed concern for a real scored metric can fall arbitrarily low once its band
  // narrows (the exact failure duplication_semantic_findings's own -Infinity already guards
  // against, code-quality-metrics-82k), so only -Infinity guarantees this entry never
  // outranks one.
  entries.push({
    key: 'message_quality_pct',
    label: 'Message quality',
    value: parseFloat(summary.message_quality_pct),
    direction: 'informational',
    status: 'neutral',
    concern: -Infinity,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null,
    descriptiveNote: 'No healthy/critical band: this rate mostly reflects Conventional Commits adoption, not message quality, and no cited study validates a threshold for it.'
  });

  entries.push(standardEntry({
    key: 'test_coverage_rate',
    // code-quality-metrics-4er: "Test coverage" reads as line/branch coverage from a coverage
    // tool. It is not -- see the label rename note below. Renaming the label only; the
    // underlying summary field test_coverage_rate is untouched to avoid rippling into the
    // calibration record and the provenance gates.
    label: 'Test/prod co-change',
    value: parseFloat(summary.test_coverage_rate),
    direction: 'higher-is-better',
    healthyBoundary: THRESHOLDS.TEST_COVERAGE_RATE.healthy,
    // THRESHOLDS.TEST_COVERAGE_RATE.warning is not a validated critical bound
    // (calibration/derive-bands.js tiers this metric two-band: the extreme
    // rests on a single reference repo, emberjs/ember.js) -- treating it as
    // one previously fabricated a "critical" verdict statusFromConcern never
    // earned. Passing null here makes this a two-band entry: good/warning
    // only.
    criticalBoundary: null,
    hasGauge: true
  }));

  // code-quality-metrics-a9z: reported descriptively, no verdict. Nagappan and Ball tested
  // this exact additions-over-churn form as their M7, found it tied weakest of eight
  // relative-churn measures (rho .288), and stepwise regression dropped it; Shin et al.
  // found the additions-only form met their prediction criterion in 0 of 80 runs against 76
  // of 80 for total churn. Scoring against a boundary on a measure the literature
  // specifically discarded is not defensible. concern is fixed at -Infinity for the same
  // sentinel reason as message_quality_pct's entry above.
  entries.push({
    key: 'net_additions_ratio_median',
    label: 'Net-new ratio (median)',
    value: summary.net_additions_ratio_median,
    direction: 'informational',
    status: 'neutral',
    concern: -Infinity,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null,
    descriptiveNote: "No healthy/critical band: the literature's own test of this additions-over-churn form ranks it the weakest relative-churn measure, dropped by stepwise regression."
  });

  // code-quality-metrics-6dg: reported descriptively, no verdict. Three independent
  // published fits agree the per-commit line-count population is heavy-tailed with no
  // finite mean: Kolassa, Riehle and Salim fit a Generalized Pareto Distribution with shape
  // xi = 1.4617 (a GPD has no finite mean above xi = 1, no finite variance above xi = 0.5);
  // Arafat and Riehle independently fit a power law with exponent -1.8612; Hattori and Lanza
  // confirm a Pareto fit by Q-Q plot across nine projects. Kolassa's own empirical table
  // shows the practical consequence: mean 465.72 sits above the reported 90th percentile
  // (261) of the same distribution, against a median of 16 -- the mean is not a stable
  // center, so scoring a repository against a boundary on it is not defensible. concern is
  // fixed at -Infinity for the same sentinel reason as message_quality_pct's and
  // net_additions_ratio_median's entries above.
  entries.push({
    key: 'avg_lines_changed',
    label: 'Avg. lines changed',
    value: parseFloat(summary.avg_lines_changed),
    direction: 'informational',
    status: 'neutral',
    concern: -Infinity,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null,
    descriptiveNote: "No healthy/critical band: three independent published fits agree commit size is heavy-tailed with no finite mean (Kolassa et al.'s own data has the mean sitting above the 90th percentile of the same distribution), so a boundary on the average is not statistically defensible. See the commit-size percentile below for the statistic that carries this signal."
  });

  entries.push(standardEntry({
    key: 'p90_lines_changed',
    // code-quality-metrics-4er: "p90" is jargon the description already explains in plain
    // words below ("nine out of ten commits are smaller than this"); the label should say the
    // same thing.
    label: 'Commit size, high end',
    value: summary.p90_lines_changed,
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.P90_LINES_CHANGED.healthy,
    criticalBoundary: THRESHOLDS.P90_LINES_CHANGED.critical,
    hasGauge: false
  }));

  entries.push(standardEntry({
    key: 'p90_files_changed',
    label: 'Files changed, high end',
    value: summary.p90_files_changed,
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.P90_FILES_CHANGED.healthy,
    criticalBoundary: THRESHOLDS.P90_FILES_CHANGED.critical,
    hasGauge: false
  }));

  const testIsolationValue = parseFloat(summary.test_isolation_rate);
  entries.push({
    key: 'test_isolation_rate',
    label: 'Test isolation',
    value: testIsolationValue,
    direction: 'special',
    status: testIsolationValue > THRESHOLDS.TEST_ISOLATION_RATE.positive ? 'good' : 'neutral',
    concern: -2,
    hasGauge: false,
    healthyBoundary: THRESHOLDS.TEST_ISOLATION_RATE.positive,
    criticalBoundary: null
  });

  entries.push({
    key: 'velocity_commits_per_day',
    label: 'Velocity',
    value: summary.velocity_commits_per_day,
    direction: 'informational',
    status: 'neutral',
    concern: -3,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });

  // Growing commit size combined with accelerating velocity: this toolkit's own untested
  // hypothesis (metrics-specification.md, Metric 4's risk-signal note), not a DORA finding.
  // The phrase "volume without discipline" that used to name this signal was withdrawn from
  // the specification because it appears in no DORA publication (see the same note); this
  // variable no longer borrows that phrase, though the signal itself is unchanged.
  const growingAndAccelerating = summary.commit_size_trend === 'growing' && summary.velocity_trend === 'accelerating';
  entries.push({
    key: 'commit_size_trend',
    label: 'Commit size trend',
    value: summary.commit_size_trend,
    direction: 'informational',
    status: growingAndAccelerating ? 'warning' : 'neutral',
    concern: growingAndAccelerating ? 0.5 : -3,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });
  entries.push({
    key: 'velocity_trend',
    label: 'Velocity trend',
    value: summary.velocity_trend,
    direction: 'informational',
    status: growingAndAccelerating ? 'warning' : 'neutral',
    concern: growingAndAccelerating ? 0.5 : -3,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });

  const squashWithheld = summary.history_granularity === 'squashed' || summary.history_granularity === 'unknown'
    ? entries.map(entry => (WITHHELD_WHEN_SQUASHED_KEYS.has(entry.key) ? withholdEntry(entry) : entry))
    : entries;

  // code-quality-metrics-31w, extended by the code-quality-metrics coordination task: a
  // separate pass, after squash withholding, not composed into the same map -- the two
  // conditions are independent and a window could in principle trip both. Guarded on
  // !entry.descriptiveNote so a key already withheld for the squashed-history reason keeps
  // that note rather than being overwritten. Each of the four keys now substitutes the
  // greenfield-modern band (substituteBand) rather than withholding, when
  // THRESHOLDS.GREENFIELD_MODERN holds a band for it; a key this map or that threshold object
  // does not cover still falls through to the original withholding behavior.
  const isGreenfieldWindow = summary.project_lifecycle === 'initial-build';
  const withheldEntries = isGreenfieldWindow
    ? squashWithheld.map(entry => {
      if (!WITHHELD_WHEN_GREENFIELD_KEYS.has(entry.key) || entry.descriptiveNote) return entry;
      const greenfieldKey = GREENFIELD_SUBSTITUTED_KEYS[entry.key];
      const band = greenfieldKey && THRESHOLDS.GREENFIELD_MODERN && THRESHOLDS.GREENFIELD_MODERN[greenfieldKey];
      return band
        ? substituteBand(entry, band, GREENFIELD_MODERN_PROVENANCE)
        : withholdEntry(entry, WITHHELD_WHEN_GREENFIELD_NOTE);
    })
    : squashWithheld;

  withheldEntries.push(...buildDuplicationEntries(duplicates));

  // Same reasoning as the class B override check below: duplication_density_pct is appended by
  // buildDuplicationEntries above, after the per-key maps run, so gating it needs its own pass.
  // The direction !== 'informational' guard skips the unsupported-language case (already
  // informational with its own descriptiveNote) -- that tile's real reason is jscpd not
  // recognizing the language, not the project's lifecycle, and the two must not be conflated.
  if (isGreenfieldWindow) {
    const densityIndex = withheldEntries.findIndex(entry => entry.key === 'duplication_density_pct');
    if (densityIndex !== -1 && withheldEntries[densityIndex].direction !== 'informational') {
      const band = THRESHOLDS.GREENFIELD_MODERN && THRESHOLDS.GREENFIELD_MODERN.DUPLICATION_PCT;
      withheldEntries[densityIndex] = band
        ? substituteBand(withheldEntries[densityIndex], band, GREENFIELD_MODERN_PROVENANCE)
        : withholdEntry(withheldEntries[densityIndex], WITHHELD_WHEN_GREENFIELD_NOTE);
    }
  }

  // code-quality-metrics-wcj: a class B config override (DUPLICATE_MIN_LINES
  // and/or DUPLICATE_MIN_TOKENS) withholds only the duplication verdict, not
  // any commit-unit metric, so this pass has to run after
  // buildDuplicationEntries is pushed above, not inside the squash-withholding
  // map before it -- that map runs before duplication_density_pct exists at
  // all. Reported via summary.config_sources.class_b_overridden rather than a
  // separate parameter, so a caller that already has the summary (every
  // caller does) gets this for free the moment local-code-metrics.js starts
  // writing config_sources into it.
  if (summary.config_sources && summary.config_sources.class_b_overridden) {
    const densityIndex = withheldEntries.findIndex(entry => entry.key === 'duplication_density_pct');
    if (densityIndex !== -1) {
      withheldEntries[densityIndex] = withholdEntry(withheldEntries[densityIndex], WITHHELD_CLASS_B_OVERRIDE_NOTE);
    }
  }

  // Duplication is a codebase-snapshot signal rather than a per-commit one,
  // but it stays in this single concern sort rather than a separate sort
  // pass: the catalog already mixes commit-level metrics (large_commits_pct)
  // with repo-wide, non-per-commit signals (velocity_commits_per_day,
  // commit_size_trend) in the same sort, using a fixed low concern for the
  // ones with no meaningful threshold. Duplication density fits the same
  // pattern as the percentage gauges it sits alongside (0-100 range,
  // higher-is-worse, real healthy/critical bounds), so a second sort would
  // separate a metric that behaves like its neighbors from them for no
  // reader-facing benefit. (It does get its own report heading -- see
  // groupForMetricKey -- but that is a rendering grouping, not a re-sort.)
  //
  // group is attached last, after every push/withhold/override pass above,
  // so it is set exactly once per entry regardless of which path produced
  // that entry (a fresh three-band push, a withheld/informational rewrite,
  // or a duplication entry appended afterward).
  for (const entry of withheldEntries) {
    entry.group = groupForMetricKey(entry.key);
  }

  return withheldEntries.sort((a, b) => b.concern - a.concern);
}

/**
 * Convert a center point, radius and angle (degrees) into a cartesian point.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} angleDeg
 * @returns {[number, number]}
 */
function polar(cx, cy, r, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

/**
 * Build an SVG arc path `d` string sweeping from angleStart to angleEnd.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} angleStart
 * @param {number} angleEnd
 * @returns {string}
 */
function arcPath(cx, cy, r, angleStart, angleEnd) {
  const [x1, y1] = polar(cx, cy, r, angleStart);
  const [x2, y2] = polar(cx, cy, r, angleEnd);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Map a value in [0, vmax] to an angle in degrees, 180 (value 0) down to 0
 * (value vmax), sweeping through the top of the semicircle.
 * @param {number} value
 * @param {number} vmax
 * @returns {number}
 */
function valueToAngle(value, vmax) {
  const v = Math.max(0, Math.min(value, vmax));
  return 180 - (v / vmax) * 180;
}

/**
 * Round a number to 2 decimal places.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute pure gauge geometry (SVG path data) for a semicircular gauge.
 * @param {{ value: number, vmax: number, bands: Array<{start: number, end: number}>, cx?: number, cy?: number, r?: number, r2?: number }} opts
 * @returns {{ bandPaths: string[], needleEndpoint: {x: number, y: number}, hub: {cx: number, cy: number, r: number} }}
 */
function buildGaugeSvgParts({ value, vmax, bands, cx = 110, cy = 104, r = 82, r2 = 64 }) {
  const bandPaths = bands.map(band => arcPath(
    cx, cy, r,
    valueToAngle(band.start, vmax),
    valueToAngle(band.end, vmax)
  ));

  const needleAngle = valueToAngle(value, vmax);
  const [needleX, needleY] = polar(cx, cy, r2, needleAngle);

  return {
    bandPaths,
    needleEndpoint: { x: round2(needleX), y: round2(needleY) },
    hub: { cx, cy, r: 4.5 }
  };
}

/**
 * Return the top N commits by total lines changed (additions + deletions),
 * sorted descending. Does not mutate the input array.
 * @param {Array<{total_additions: number, total_deletions: number}>} metrics
 * @param {number} [n]
 * @returns {Array<object>}
 */
function topCommits(metrics, n = 10) {
  return [...metrics]
    .sort((a, b) => (b.total_additions + b.total_deletions) - (a.total_additions + a.total_deletions))
    .slice(0, n);
}

module.exports = { buildMetricCatalog, buildGaugeSvgParts, topCommits, METRIC_GROUP_ORDER, groupForMetricKey, hasVerdict };
