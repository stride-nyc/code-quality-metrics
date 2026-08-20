// @ts-nocheck
'use strict';

const { buildGaugeSvgParts, topCommits, METRIC_GROUP_ORDER, hasVerdict } = require('./report');
const { METRIC_DESCRIPTIONS } = require('./metric-descriptions');
const { THRESHOLDS } = require('./thresholds');

/** All five gauge metrics in the catalog are percentages, so the gauge
 * always spans 0-100. */
const GAUGE_VMAX = 100;

/**
 * The Findings heading's id, and the exact fragment the top summary links to
 * (code-quality-metrics-g39). A single named constant, rather than the literal string
 * "findings" typed twice, is what keeps the two ends of the link from silently drifting apart.
 */
const FINDINGS_ANCHOR_ID = 'findings';

/**
 * Derive the gauge bands from an entry's healthy/critical boundaries,
 * honoring its direction. A two-band entry (criticalBoundary null -- its
 * extreme rests on a single reference repo/window, see
 * calibration/derive-bands.js) gets only two bands, good and warning, and
 * never a critical (red) arc: asserting one would claim a boundary the data
 * does not support. This is the gauge's own visible marker distinguishing a
 * two-band tile from a three-band one, independent of the threshold text.
 * @param {object} entry
 * @returns {Array<{ start: number, end: number, status: string }>}
 */
function gaugeBands(entry) {
  const { healthyBoundary, criticalBoundary, direction } = entry;
  if (criticalBoundary === null || criticalBoundary === undefined) {
    return direction === 'higher-is-better'
      ? [
        { start: 0, end: healthyBoundary, status: 'warning' },
        { start: healthyBoundary, end: GAUGE_VMAX, status: 'good' }
      ]
      : [
        { start: 0, end: healthyBoundary, status: 'good' },
        { start: healthyBoundary, end: GAUGE_VMAX, status: 'warning' }
      ];
  }
  if (direction === 'higher-is-better') {
    return [
      { start: 0, end: criticalBoundary, status: 'critical' },
      { start: criticalBoundary, end: healthyBoundary, status: 'warning' },
      { start: healthyBoundary, end: GAUGE_VMAX, status: 'good' }
    ];
  }
  return [
    { start: 0, end: healthyBoundary, status: 'good' },
    { start: healthyBoundary, end: criticalBoundary, status: 'warning' },
    { start: criticalBoundary, end: GAUGE_VMAX, status: 'critical' }
  ];
}

/**
 * Escape a value for safe inclusion in HTML text content.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a metric value for display: numbers are rounded to at most 2
 * decimal places (whole numbers show no decimals at all), avoiding the
 * long floating-point strings (e.g. 0.676056338028169) that raw JS numbers
 * produce and that overflow a fixed-width card. Non-numeric values (trend
 * labels like "shrinking") pass through unchanged.
 * @param {*} value
 * @returns {string}
 */
function formatValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * Describe a metric's healthy/critical boundaries in plain language, so a
 * reader can see what "critical" or "warning" actually means for this
 * metric without cross-referencing lib/thresholds.js. Returns null when the
 * entry has no numeric boundary at all (purely informational entries like
 * velocity or trend labels).
 * @param {object} entry
 * @returns {string|null}
 */
function describeThreshold(entry) {
  const { direction, healthyBoundary, criticalBoundary, tier, descriptiveNote, bandProvenance } = entry;
  // A metric whose band was deliberately dropped (not merely two-band) still needs to say
  // why: a bare number with neither a gauge nor an explanation reads as a bug, the same
  // failure mode the two-band tier's own text below exists to avoid. entry.descriptiveNote
  // carries that per-metric reason (see lib/report.js's net_additions_ratio_median and
  // message_quality_pct entries, code-quality-metrics-a9z and code-quality-metrics-6ti).
  if (descriptiveNote) return descriptiveNote;
  if (healthyBoundary == null && criticalBoundary == null && tier !== 'two-band') return null;

  let text;
  if (tier === 'two-band') {
    // No critical bound exists (a single reference repo/window produced the
    // extreme; see calibration/derive-bands.js). Stating one anyway is
    // exactly the overstatement this tier exists to avoid, so the boundary
    // that IS supported (healthy) is named and the missing one is named as
    // missing, never filled in with a number that would misrepresent it.
    text = direction === 'higher-is-better'
      ? `Healthy above ${formatValue(healthyBoundary)}. No critical bound: the low end rests on a single reference repository.`
      : `Healthy below ${formatValue(healthyBoundary)}. No critical bound: the high end rests on a single reference repository.`;
  } else if (direction === 'higher-is-worse') {
    text = `Healthy below ${formatValue(healthyBoundary)}, critical above ${formatValue(criticalBoundary)}.`;
  } else if (direction === 'higher-is-better') {
    text = `Healthy above ${formatValue(healthyBoundary)}, critical below ${formatValue(criticalBoundary)}.`;
  } else if (direction === 'special') {
    text = `Positive signal above ${formatValue(healthyBoundary)}.`;
  } else {
    return null;
  }

  // lib/report.js's substituteBand sets bandProvenance only when this verdict was scored
  // against a substituted band (currently: THRESHOLDS.GREENFIELD_MODERN under
  // project_lifecycle: initial-build) rather than the brownfield band the rest of the page
  // uses. Naming the population here, on the card itself, is deliberate: a reader comparing
  // two tiles side by side has no other way to tell a substituted band apart from the
  // brownfield one, and the two-band/three-band wording above reads identically either way.
  // See lib/report-template.js's band-chip rendering (renderGaugeCard/renderStatCard) for the
  // second, visual half of this same distinction. The sample size behind the substituted band
  // (bandProvenance.n) is deliberately NOT repeated here: it used to appear on every
  // substituted tile's chip and again in this very sentence (code-quality-metrics coordination
  // task), which is exactly the per-tile over-exposure this rewrite fixes. It now lives once,
  // in the group-level note rendered alongside "Change size and scope" (renderGreenfieldNote),
  // reading the same bandProvenance.n this sentence used to repeat.
  if (bandProvenance) {
    text += ` Scored against the ${bandProvenance.population} reference band instead of the brownfield band the rest of this page uses, because this looks like an initial build: treat this verdict as more provisional than the rest of this page.`;
  }
  return text;
}

/**
 * State, in one plain sentence, what a value means against its own healthy bar -- the fact a
 * reader actually wants and that describeThreshold's qualifier-heavy sentence never states
 * (code-quality-metrics coordination task, "restructure the tile" ask). Measured on 73V's
 * "Large commits" tile: the rendered card gave roughly 15 words to what the metric is, 3 to
 * the bar itself, and 110 to qualifiers (tiering, band substitution, provenance, a literature
 * aside) -- and never said the plain thing, that 26 against a band of 48 is comfortably inside
 * range. This function is that missing sentence, shown in the reading path; the qualifiers
 * describeThreshold already produces move into a collapsed methodology block instead (see
 * renderMethodologyDetails) rather than being deleted -- they stay true and reachable, just
 * out of the way.
 *
 * Returns null for anything with no real band to compare against: a descriptiveNote entry
 * (net_additions_ratio_median, message_quality_pct, avg_lines_changed, or anything withheld)
 * already explains why it has no verdict, and a purely informational entry (velocity,
 * commit_size_trend, velocity_trend, and the 'special'-direction test_isolation_rate) has no
 * healthyBoundary a plain-language comparison could be built from.
 * @param {object} entry
 * @returns {string|null}
 */
function describeVerdictMeaning(entry) {
  const { tier, direction, healthyBoundary, criticalBoundary, value, status, descriptiveNote } = entry;
  if (descriptiveNote) return null;
  if (tier !== 'two-band' && tier !== 'three-band') return null;
  const v = formatValue(value);
  if (status === 'critical') {
    return direction === 'higher-is-better'
      ? `${v}, well under the ${formatValue(criticalBoundary)} critical line.`
      : `${v}, well past the ${formatValue(criticalBoundary)} critical line.`;
  }
  if (status === 'good') {
    return direction === 'higher-is-better'
      ? `${v}, at or above the ${formatValue(healthyBoundary)} bar.`
      : `${v}, comfortably inside the ${formatValue(healthyBoundary)} bar.`;
  }
  // warning
  return direction === 'higher-is-better'
    ? `${v}, under the ${formatValue(healthyBoundary)} bar.`
    : `${v}, over the ${formatValue(healthyBoundary)} bar.`;
}

/**
 * Which four catalog keys feed the archetype classification (lib/metrics.js's
 * classifyDoraArchetype). Mirrored here only to describe, in the rendered block, which line
 * each signal crossed -- the classification itself is computed elsewhere and consumed only as
 * summary.dora_archetype; this list never re-derives the verdict.
 * @type {string[]}
 */
const ARCHETYPE_SIGNAL_KEYS = ['large_commits_pct', 'sprawling_commits_pct', 'test_coverage_rate', 'uncovered_prod_rate'];

/**
 * Describe a single archetype-input entry factually: which line it crossed and its own value,
 * never what that crossing "points to" or "suggests" (code-quality-metrics-bmg: the prior
 * wording asserted direction -- "point to legacy-bottleneck patterns" -- that four commit-shape
 * percentages alone cannot support). status 'good' covers both directions identically (nothing
 * to say beyond "stayed healthy"); the two non-good branches split on direction because
 * higher-is-worse metrics (large/sprawling/uncovered_prod) have both a healthy and a critical
 * line to distinguish, while the one higher-is-better, two-band input here (test_coverage_rate)
 * only ever reaches 'warning' (see lib/report.js's statusForTwoBand -- a two-band entry never
 * reaches 'critical' at any distance from healthy).
 * @param {object} entry - a buildMetricCatalog entry
 * @returns {string}
 */
function archetypeSignalPhrase(entry) {
  const v = formatValue(entry.value);
  if (entry.status === 'good') {
    return `${entry.label} stayed healthy at ${v}`;
  }
  if (entry.direction === 'higher-is-worse') {
    return entry.status === 'critical'
      ? `${entry.label} crossed the critical line at ${v} (critical above ${formatValue(entry.criticalBoundary)})`
      : `${entry.label} crossed the healthy line at ${v} (healthy at or below ${formatValue(entry.healthyBoundary)})`;
  }
  return `${entry.label} fell below the healthy line at ${v} (healthy at or above ${formatValue(entry.healthyBoundary)})`;
}

/**
 * For each dora_archetype value, the factual rule that produced it -- naming the combination
 * this toolkit's own classifier matched, not what it means for the team (code-quality-metrics-
 * bmg). classifyDoraArchetype (lib/metrics.js) is the single source of truth for the actual
 * boundary values; this text only names which of its rules fired.
 * @type {Record<string, string>}
 */
const ARCHETYPE_RULE_DESCRIPTIONS = {
  'harmonious-high-achiever': 'this toolkit\'s rule labels that combination "harmonious-high-achiever" because all four signals above stayed healthy',
  'legacy-bottleneck': 'this toolkit\'s rule labels that combination "legacy-bottleneck" because sprawling commits and large commits both crossed their critical lines',
  'foundational-challenges': 'this toolkit\'s rule labels that combination "foundational-challenges" because large commits alone crossed its critical line',
  'mixed-signals': 'no combination in this toolkit\'s rule matched, so it defaults to the label "mixed-signals"'
};

/**
 * Note appended to a 'mixed-signals' body only: legacy-bottleneck and foundational-challenges
 * are both defined purely by a metric crossing its .critical bound (classifyDoraArchetype,
 * lib/metrics.js), and LARGE_COMMITS_PCT / SPRAWLING_COMMITS_PCT are each two-band metrics --
 * critical: null -- whenever no second reference repository corroborates their extreme
 * (lib/thresholds.js; both are null under the current, re-measured calibration, making both
 * archetypes currently unreachable -- see that file's comments and CLAUDE.md's DORA Archetype
 * Classification section). Read live from THRESHOLDS rather than stated as a fact about today's
 * numbers, so this note appears or disappears automatically with whichever bound a future
 * recalibration actually removes or restores. Returns '' when both bounds are present, leaving
 * 'mixed-signals' reading exactly as it always has.
 * @returns {string}
 */
function archetypeUnreachableNote() {
  const largeGone = THRESHOLDS.LARGE_COMMITS_PCT.critical === null;
  const sprawlingGone = THRESHOLDS.SPRAWLING_COMMITS_PCT.critical === null;
  if (!largeGone && !sprawlingGone) return '';
  if (largeGone && sprawlingGone) {
    return ' legacy-bottleneck and foundational-challenges both require a critical bound that neither large commits nor sprawling commits currently has, so neither can be returned right now.';
  }
  if (largeGone) {
    return ' foundational-challenges, and legacy-bottleneck\'s large-commit half, require a critical bound large commits does not currently have.';
  }
  return ' legacy-bottleneck requires a critical bound sprawling commits does not currently have.';
}

/**
 * Build the archetype block's body text: a factual, per-signal breakdown (which line each of
 * the four inputs crossed) followed by which of this toolkit's own combination rules matched.
 * Falls back to the pre-existing "could not be determined" wording for an archetype value this
 * table does not recognize (kept identical to the string the masthead used to show in the same
 * case, so this is a relocation, not a behavior change, for that one edge case). A 'mixed-signals'
 * result additionally states, when applicable, that legacy-bottleneck and/or
 * foundational-challenges are unreachable for lack of a critical bound (archetypeUnreachableNote
 * above) -- otherwise a reader cannot tell a genuine no-match result apart from a structurally
 * unreachable one, which today is every mixed-signals result: both critical bounds are null.
 * @param {string} archetype
 * @param {Array<object>} catalog
 * @returns {string}
 */
function describeArchetypeBody(archetype, catalog) {
  if (!ARCHETYPE_RULE_DESCRIPTIONS[archetype]) {
    return 'No archetype could be determined from the current signals.';
  }
  const phrases = ARCHETYPE_SIGNAL_KEYS
    .map(key => catalog.find(entry => entry.key === key))
    .filter(Boolean)
    .map(archetypeSignalPhrase);
  const note = archetype === 'mixed-signals' ? archetypeUnreachableNote() : '';
  return `${phrases.join('; ')}. ${ARCHETYPE_RULE_DESCRIPTIONS[archetype]}.${note}`;
}

/**
 * Status marker for each dora_archetype value. These four archetypes are
 * boundaries this toolkit invented from commit shape (see
 * classifyDoraArchetype in lib/metrics.js); DORA itself derives its own team
 * archetypes from burnout and friction survey data, not commit history, so
 * none of these four carry DORA's validation. critical (red) is reserved for
 * findings this toolkit can trace to a measurement; no archetype qualifies,
 * so 'critical' never appears in this map -- foundational-challenges, the
 * archetype a naive good/warning/critical mapping would color red, is capped
 * at warning. mixed-signals is genuinely neutral (no archetype dominated).
 * @type {Record<string, 'good'|'warning'|'neutral'>}
 */
const ARCHETYPE_STATUS = {
  'harmonious-high-achiever': 'good',
  'legacy-bottleneck': 'warning',
  'foundational-challenges': 'warning',
  'mixed-signals': 'neutral'
};

/**
 * Render @font-face declarations embedding each vendored font as a base64
 * data URI, so the report is a fully standalone document.
 * @param {object} fontData
 * @returns {string}
 */
function renderFontFaces(fontData) {
  return `@font-face {
  font-family: 'Shoulders';
  font-weight: 800;
  src: url(data:font/woff2;base64,${fontData['big-shoulders-display-800']}) format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-weight: 400;
  src: url(data:font/woff2;base64,${fontData['public-sans-400']}) format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-weight: 600;
  src: url(data:font/woff2;base64,${fontData['public-sans-600']}) format('woff2');
}
@font-face {
  font-family: 'Public Sans';
  font-weight: 700;
  src: url(data:font/woff2;base64,${fontData['public-sans-700']}) format('woff2');
}
@font-face {
  font-family: 'Plex Mono';
  font-weight: 400;
  src: url(data:font/woff2;base64,${fontData['ibm-plex-mono-400']}) format('woff2');
}
@font-face {
  font-family: 'Plex Mono';
  font-weight: 600;
  src: url(data:font/woff2;base64,${fontData['ibm-plex-mono-600']}) format('woff2');
}`;
}

/** Validated design tokens. Hex values must not change. */
const DESIGN_TOKENS_CSS = `:root {
  --bg: #F5F8FA; --surface: #FFFFFF; --surface-2: #EDF2F5; --border: #DEE5EA;
  --ink: #1B222C; --ink-muted: #5B6675; --ink-faint: #6B7785;
  --accent: #0E7C86; --accent-ink: #FFFFFF;
  --good: #27784C; --warn: #8E6119; --critical: #B73F28;
  --good-soft: #E3F3E9; --warn-soft: #F7ECD9; --critical-soft: #F8E4DE;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0F141B; --surface: #171D26; --surface-2: #1D2531; --border: #2A323E;
    --ink: #E8ECF1; --ink-muted: #9AA5B4; --ink-faint: #7A8593;
    --accent: #5BDCE3; --accent-ink: #0B2226;
    --good: #5FC488; --warn: #E0A73D; --critical: #EE7256;
    --good-soft: #16301F; --warn-soft: #33280F; --critical-soft: #351A13;
  }
}
:root[data-theme="dark"] {
  --bg: #0F141B; --surface: #171D26; --surface-2: #1D2531; --border: #2A323E;
  --ink: #E8ECF1; --ink-muted: #9AA5B4; --ink-faint: #7A8593;
  --accent: #5BDCE3; --accent-ink: #0B2226;
  --good: #5FC488; --warn: #E0A73D; --critical: #EE7256;
  --good-soft: #16301F; --warn-soft: #33280F; --critical-soft: #351A13;
}`;

/**
 * Component CSS consuming the design tokens above. Font-face and :root
 * token declarations alone style nothing on their own, every class the
 * markup below actually emits needs a real selector here.
 */
const COMPONENT_CSS = `body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Public Sans', -apple-system, sans-serif;
  padding: 32px 20px 64px;
}
.masthead h1 {
  font-family: 'Shoulders', 'Public Sans', sans-serif;
  font-size: 40px;
  margin: 0 0 8px;
}
.masthead-window {
  font-family: 'Plex Mono', monospace;
  color: var(--ink-muted);
  margin: 2px 0;
}
.report-summary {
  margin: 20px 0 28px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 15px;
}
.report-summary a { color: var(--accent); }
.verdict {
  margin-top: 10px;
  padding: 8px 14px;
  border-radius: 6px;
  background: var(--surface-2);
  display: inline-block;
}
.verdict[data-status="good"] { background: var(--good-soft); color: var(--good); }
.verdict[data-status="warning"] { background: var(--warn-soft); color: var(--warn); }
.archetype-note {
  margin: 28px 0;
}
.archetype-note .under-development {
  font-size: 13px;
  font-weight: 400;
  color: var(--ink-faint);
}
.archetype-disclaimer {
  font-size: 13px;
  color: var(--ink-muted);
  max-width: 640px;
}
.metric-category {
  margin: 28px 0;
}
.metric-category-heading {
  font-family: 'Shoulders', 'Public Sans', sans-serif;
  font-size: 20px;
  margin: 0 0 14px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}
.metric-description {
  text-align: left;
  width: 100%;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.metric-description-measures {
  font-size: 12.5px;
  color: var(--ink-muted);
  margin: 0 0 4px;
  line-height: 1.4;
}
.metric-description-dora {
  font-size: 11.5px;
  color: var(--accent);
  margin: 0;
  line-height: 1.4;
}
.metric-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 22px 20px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}
.metric-card[data-status="critical"] { border-color: var(--critical); }
.metric-card[data-status="warning"] { border-color: var(--warn); }
.metric-card[data-status="good"] { border-color: var(--good); }
.metric-card[data-status="unmeasured"] { border-color: var(--ink-faint); border-style: dashed; }
.gauge {
  width: 100%;
  max-width: 210px;
  height: auto;
}
.gauge-band {
  fill: none;
  stroke-width: 14;
}
.gauge-band.gauge-critical { stroke: var(--critical); }
.gauge-band.gauge-warning { stroke: var(--warn); }
.gauge-band.gauge-good { stroke: var(--good); }
.gauge-needle {
  stroke: var(--ink);
  stroke-width: 2.5;
}
.gauge-hub { fill: var(--ink); }
.metric-value {
  font-family: 'Plex Mono', monospace;
  font-weight: 600;
  font-size: 22px;
  margin: 4px 0 0;
}
.metric-label {
  font-size: 12px;
  color: var(--ink-muted);
  margin: 0;
}
.metric-threshold {
  font-size: 11px;
  color: var(--ink-faint);
  margin: 2px 0 0;
}
.status-chip {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--ink-muted);
}
.metric-card[data-status="critical"] .status-chip { background: var(--critical-soft); color: var(--critical); }
.metric-card[data-status="warning"] .status-chip { background: var(--warn-soft); color: var(--warn); }
.metric-card[data-status="good"] .status-chip { background: var(--good-soft); color: var(--good); }
.metric-card[data-status="unmeasured"] .status-chip { background: var(--surface-2); color: var(--ink-faint); }
.band-chip {
  font-size: 10.5px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 3px;
  border: 1px dashed var(--accent);
  color: var(--accent);
  background: transparent;
}
.metric-card[data-band] {
  border-style: dashed;
}
.metric-meaning {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin: 4px 0 0;
}
.metric-what-is {
  font-size: 12px;
  color: var(--ink-muted);
  margin: 6px 0 0;
  line-height: 1.4;
}
.metric-methodology {
  width: 100%;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  text-align: left;
}
.metric-methodology summary {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-faint);
  cursor: pointer;
  text-align: center;
}
.metric-methodology .metric-threshold {
  margin-top: 8px;
}
.greenfield-note {
  font-size: 13px;
  color: var(--ink-muted);
  margin: 0 0 16px;
  line-height: 1.5;
}
.flight-log, .findings {
  margin: 28px 0;
}
.flight-log table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.flight-log th, .flight-log td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.flight-log .mono { font-family: 'Plex Mono', monospace; }
.findings ul {
  padding-left: 20px;
}
.findings li {
  margin: 6px 0;
}
.duplicate-code {
  margin: 28px 0;
}
.duplicate-static, .duplicate-semantic {
  padding-left: 20px;
  font-size: 14px;
}
.duplicate-static li, .duplicate-semantic li {
  margin: 6px 0;
}
.duplicate-static code, .duplicate-semantic code {
  font-family: 'Plex Mono', monospace;
}
.duplicate-layer-indicator {
  font-size: 12.5px;
  color: var(--ink-faint);
  margin-top: 10px;
}
footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--ink-faint);
  font-size: 12.5px;
}`;

/**
 * Render the top-of-report findings summary (code-quality-metrics-g39): a short paragraph,
 * right after the masthead, that leads with a count of concerns and links down to the detailed
 * Findings section, so a reader is not required to scroll past two screens of metric tiles to
 * reach a conclusion.
 *
 * Assembled deterministically from the already-computed catalog, not generated: every word here
 * is fixed template text this function owns, and every number is read directly from a catalog
 * entry's own value/label/status/healthyBoundary, or is a count of catalog entries matching a
 * status this same function already computed (criticalCount/warningCount/bandedGoodCount below)
 * -- the one arithmetic step this function performs, and a provably correct tally rather than
 * new information, unlike a number an LLM might invent. There is no model call and no free-form
 * text in this function at all, so there is nothing in it that could fabricate a claim the way
 * the Findings narrative (lib/narrative.js's generateFindingsNarrative, validated by
 * validateNarrative) could and once did. This is deliberate: a second prose surface at the top
 * of the report, unvalidated, would reopen the exact fabrication hole four prior tickets closed,
 * in the most prominent position on the page (code-quality-metrics-g39's own constraint).
 * Because this function never reads the findings narrative at all, its content is identical
 * whether that narrative below was accepted or rejected -- there is nothing here that depends
 * on, or needs to react to, that outcome, and the granularity it asserts (a count, and the
 * single top concern's or a healthy run's own signals' label/value/status) never exceeds what
 * lib/report-template.js's own fallbackFindings already shows for the same catalog. Takes only
 * the catalog (code-quality-metrics-nnla): it used to also read summary.vendored_generated_share
 * for a callout that duplicated Analysis Scope and asserted a false "reframes every count above"
 * claim; that callout is gone, and this function has no remaining use for summary at all.
 * @param {Array<object>} catalog
 * @returns {string}
 */

/**
 * Describe the directional-trend concerns (commit_size_trend/velocity_trend when triggered)
 * in subject-verb prose ("Commit size is growing"), not the gauge template's "<metric> at
 * <value>", which reads ungrammatically for a categorical value ("Commit size trend at
 * growing"). Each entry's label ends in " trend" (see lib/report.js's catalog entries); that
 * suffix is stripped to get the subject, so this reuses the label already assigned there
 * rather than a separate hardcoded phrase per key.
 * @param {Array<object>} directionalConcerns
 * @returns {string}
 */
function describeDirectionalConcerns(directionalConcerns) {
  const phrases = directionalConcerns.map((entry, index) => {
    const subject = escapeHtml(entry.label).replace(/ trend$/i, '');
    const phrase = `${subject} is ${escapeHtml(formatValue(entry.value))}`;
    return index === 0 ? phrase : phrase.charAt(0).toLowerCase() + phrase.slice(1);
  });
  const plural = directionalConcerns.length === 1 ? '' : 's';
  return `${phrases.join(' and ')}: directional signal${plural} worth watching, with no calibrated threshold behind ${directionalConcerns.length === 1 ? 'it' : 'them'} yet.`;
}

// A banded entry carries a real calibrated threshold: standardEntry/substituteBand stamp
// tier 'two-band' or 'three-band' on it. Everything else -- purely informational entries,
// the withheld/withholdEntry rewrite (tier: undefined), and test_isolation_rate's 'special'
// direction (a healthyBoundary but never a pass/fail verdict a reader should weigh the same
// way) -- is not evidence with the same standing, whatever its own status happens to read.
function isBandedEntry(entry) {
  return entry.tier === 'two-band' || entry.tier === 'three-band';
}

/**
 * State, for a single banded entry scored 'good', what its value shows against its own
 * healthy bar, in the label-carrying form the top summary's affirmative path needs
 * (code-quality-metrics-rub1). describeVerdictMeaning (used on the tile itself) produces the
 * same comparison but deliberately omits the label, since the tile already shows it separately
 * as its own heading -- the summary paragraph has no such heading per entry, so the label is
 * folded into the phrase here instead of duplicating describeVerdictMeaning's own logic with a
 * label prepended.
 * @param {object} entry
 * @returns {string}
 */
function describeGoodSignalPhrase(entry) {
  const v = escapeHtml(formatValue(entry.value));
  const bound = escapeHtml(formatValue(entry.healthyBoundary));
  const label = escapeHtml(entry.label);
  return entry.direction === 'higher-is-better'
    ? `${label} at ${v} (healthy at or above ${bound})`
    : `${label} at ${v} (healthy at or below ${bound})`;
}

/**
 * How far a 'good' banded entry sits inside its own healthy band, as a fraction of the healthy
 * boundary itself (code-quality-metrics-11ib): the natural symmetry to how the concern side is
 * already ranked. bandedConcerns is ordered by computeConcern, "how far past healthy toward
 * critical, scaled by the healthy-critical span" -- but that scaling is unusable here, since
 * every currently-calibrated metric is two-band (concern fixed at -1 regardless of the actual
 * value; see lib/report.js's standardEntry) and a three-band entry's own critical-scaled concern
 * has no meaning for a value on the healthy side at all. Scaling by the healthy boundary instead
 * needs no critical bound, works identically for two-band and three-band entries, and reads as
 * "how far past the bar, as a fraction of the bar" -- a plain, dimensionless margin, not a new
 * verdict or tier: it decides only which good signals get named in prose, never whether the run
 * is healthy, mixed, or concerning (that stays entirely bandedGoodCount/bandedConcerns.length).
 * @param {object} entry
 * @returns {number}
 */
function goodSignalMargin(entry) {
  const { direction, healthyBoundary, value } = entry;
  const denominator = Math.abs(healthyBoundary) || 1;
  return direction === 'higher-is-better'
    ? (value - healthyBoundary) / denominator
    : (healthyBoundary - value) / denominator;
}

/**
 * Join 2-3 phrases in plain English: "A and B" for two, "A, B and C" for three (Oxford comma
 * omitted to match this file's existing prose style elsewhere, e.g. describeDirectionalConcerns).
 * @param {string[]} phrases
 * @returns {string}
 */
function joinPhrases(phrases) {
  if (phrases.length <= 2) return phrases.join(' and ');
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

/**
 * Name the strongest `count` banded-good signals, furthest inside their own band first
 * (goodSignalMargin above), in the same label/value/bar phrasing describeGoodSignalPhrase
 * already produces for the all-healthy sentence -- reused here rather than duplicated so the
 * two branches describe a healthy signal identically.
 * @param {Array<object>} bandedGoodEntries
 * @param {number} count
 * @returns {string}
 */
function describeStrongestHealthySignals(bandedGoodEntries, count) {
  const ranked = [...bandedGoodEntries].sort((a, b) => goodSignalMargin(b) - goodSignalMargin(a));
  return joinPhrases(ranked.slice(0, count).map(describeGoodSignalPhrase));
}

/**
 * Build the affirmative headline for a run with zero banded concerns and at least one banded
 * good result (code-quality-metrics-rub1): the case the prior wording collapsed into "No
 * measured signal in this run crossed a warning or critical threshold," a sentence that
 * describes what did NOT happen and carries none of the real positive evidence a run like
 * dotnetdependencytracer has (8 positive findings, zero warnings). Names every banded good
 * signal by label and value, the way the concern branch already names its single worst finding
 * via ledByPhrase -- the maintainer's own framing, 'All signals are positive, indicating ...',
 * completed with a factual description of what the values show relative to the reference
 * population, never a quality-outcome claim: these bands are benchmark quantiles, not
 * validated outcome thresholds (see CLAUDE.md's Key Metrics table), so this states the
 * comparison and stops rather than congratulating.
 *
 * code-quality-metrics-11ib: used to name every banded good signal, one clause per metric --
 * honest, but unbounded, and the fix for the mixed branch's own "Most"/"still" asymmetry
 * flagged this as the same scaling problem, just not yet triggered (six clauses today; a
 * seventh or eighth calibrated metric would make this sentence as long as this whole
 * paragraph). Re-pointed at the same describeStrongestHealthySignals(bandedGoodEntries, 2)
 * selection the mixed branch uses (furthest inside its own band, by goodSignalMargin), so both
 * branches apply one consistent rule rather than one enumerating everything and the other
 * naming a fixed few. The total count is still stated, so a reader who wants to know how much
 * evidence exists ("every calibrated metric measured") is not left to count semicolons.
 * @param {Array<object>} bandedGoodEntries
 * @returns {string}
 */
function describeAllHealthy(bandedGoodEntries) {
  const total = bandedGoodEntries.length;
  return `All signals are positive, indicating this run's commits sit within the healthy range of the reference benchmark on every calibrated metric measured (${total} metric${total === 1 ? '' : 's'}): led by ${describeStrongestHealthySignals(bandedGoodEntries, 2)}.`;
}

function renderTopSummary(catalog) {
  const concerns = catalog.filter(entry => entry.status === 'critical' || entry.status === 'warning');
  // commit_size_trend/velocity_trend are the only informational-direction keys that can ever
  // reach 'warning' (the growingAndAccelerating hack in buildMetricCatalog, concern 0.5) --
  // a directional hypothesis with no calibrated threshold behind it at all. That concern
  // value sorts ahead of every two-band entry's fixed -1, which would otherwise let an
  // unvalidated trend outrank a real calibrated finding in "led by" -- so this pick is
  // re-derived from bandedConcerns only, rather than trusting concerns[0] from the full
  // concern-descending sort.
  const bandedConcerns = concerns.filter(isBandedEntry);
  const directionalConcerns = concerns.filter(entry => !isBandedEntry(entry));
  const criticalCount = bandedConcerns.filter(entry => entry.status === 'critical').length;
  const warningCount = bandedConcerns.filter(entry => entry.status === 'warning').length;
  // Computed once, ahead of the branch below, so both the affirmative path (bandedConcerns
  // empty) and the majority-healthy concern path (bandedConcerns non-empty) read the same
  // already-computed tally rather than two separate derivations of "how many banded metrics
  // are good this run" (code-quality-metrics-rub1). No new score or tier: this is exactly the
  // per-entry status the catalog already carries, counted.
  const bandedGoodEntries = catalog.filter(entry => isBandedEntry(entry) && entry.status === 'good');
  const bandedGoodCount = bandedGoodEntries.length;

  let headline;
  if (bandedConcerns.length === 0) {
    if (concerns.length === 0) {
      // Two genuinely different cases collapsed into one sentence before this fix
      // (code-quality-metrics-rub1): a run with real positive evidence (bandedGoodCount > 0,
      // e.g. dotnetdependencytracer's 8 positive findings) versus a run with NO evidence at
      // all (bandedGoodCount === 0, e.g. squashed history withholding every commit-unit
      // metric). Only the second is honestly described as "no measured signal crossed a
      // threshold" -- the first has something to say and now says it.
      headline = bandedGoodCount > 0
        ? describeAllHealthy(bandedGoodEntries)
        : 'No measured signal in this run crossed a warning or critical threshold.';
    } else {
      headline = 'Every metric scored against a calibrated threshold in this run is healthy.';
    }
  } else {
    const counts = [];
    if (criticalCount > 0) counts.push(`${criticalCount} critical`);
    if (warningCount > 0) counts.push(`${warningCount} warning`);
    // bandedConcerns preserves catalog's own concern-descending order (Array.filter keeps
    // relative order), so the first entry here is, by construction, the highest-concern
    // finding among those with a real calibrated threshold behind it.
    const top = bandedConcerns[0];
    const signalPhrase = `${counts.join(' and ')} signal${bandedConcerns.length === 1 ? '' : 's'}`;
    const ledByPhrase = `led by ${escapeHtml(top.label)} at ${escapeHtml(formatValue(top.value))} (${escapeHtml(top.status)}).`;
    // Characterize the whole before naming the exception: a run where more banded metrics
    // are healthy than are flagged is a fundamentally sound codebase with something to
    // watch, not a troubled one, and opening with the single worst reading (the prior
    // wording, unconditionally) inverts that. bandedGoodCount and bandedConcerns.length are
    // both already-computed catalog tallies -- a majority comparison, not a new tuned score.
    // "against a calibrated threshold" is said once either way -- in the healthy-first
    // sentence when it fires, otherwise in the concern sentence itself -- rather than
    // stuttering the same qualifier twice in one paragraph.
    //
    // code-quality-metrics-11ib: "Most metrics ... are healthy" used to stop there, collapsing
    // every healthy finding into the word "Most" while the concern clause right next to it
    // names its worst finding by label, value and bar. bandedGoodCount > bandedConcerns.length
    // here guarantees at least 2 banded-good entries exist (goodCount > concernCount >= 1), so
    // naming the top 2 by describeStrongestHealthySignals always has material to work with.
    // Two, not more: this sentence already carries the concern clause too, and the all-healthy
    // sentence below (describeAllHealthy) uses the same count of 2 for the same reason -- one
    // selection rule, applied consistently, rather than one branch enumerating everything and
    // the other naming a fixed few.
    headline = bandedGoodCount > bandedConcerns.length
      ? `${bandedGoodCount} metrics scored against a calibrated threshold in this run are healthy, led by ${describeStrongestHealthySignals(bandedGoodEntries, 2)}. It also flags ${signalPhrase}, ${ledByPhrase}`
      : `This run flags ${signalPhrase} against a calibrated threshold, ${ledByPhrase}`;
  }

  // Directional trends read "<label> at <value>" ungrammatically for a categorical value
  // ("Commit size trend at growing"): they get their own phrasing, subject-verb rather than
  // the gauge template's "<metric> at <number>", and are named separately from the banded
  // count above -- an unvalidated hypothesis is a prompt to look, not evidence with the same
  // weight as a calibrated finding.
  const directionalNote = directionalConcerns.length > 0
    ? ` ${describeDirectionalConcerns(directionalConcerns)}`
    : '';

  // code-quality-metrics-nnla: the vendored/generated share used to be restated here a second
  // time (after the masthead line, removed separately), with a false clause on top ("which
  // reframes every count above") -- every banded metric above already excludes vendored/
  // generated content before computing (large_commits_pct counts production lines, the line/
  // file distributions read counted_* since PR #94, sprawling_commits_pct counts non-excluded
  // files, test rates treat an excluded path as neither test nor production), so there was
  // nothing left for a second discount to reframe. The fact now lives exactly once, in
  // Analysis Scope (renderExclusionsSection), regardless of the share's size.
  return `<section class="report-summary">
<p>${headline}${directionalNote} See <a href="#${FINDINGS_ANCHOR_ID}">Findings</a> below.</p>
</section>`;
}

/**
 * Whole days between two parseable date/datetime strings, rounded to the nearest day. Returns
 * null when either input fails to parse, so callers can render nothing rather than "NaN days."
 * @param {string} earlierIso
 * @param {string} laterIso
 * @returns {number|null}
 */
function daysBetween(earlierIso, laterIso) {
  const earlier = Date.parse(earlierIso);
  const later = Date.parse(laterIso);
  if (Number.isNaN(earlier) || Number.isNaN(later)) return null;
  return Math.round((later - earlier) / 86400000);
}

/**
 * The two informational, direction-only catalog keys a trend verdict with no calibrated
 * threshold behind it (commit_size_trend, velocity_trend) needs its computed span stated on:
 * a bare "growing"/"accelerating" carries no magnitude or window on its own, and this project
 * has already measured commit_size_trend flip from "growing" to "shrinking" on the same
 * repository purely because the analyzed window changed (code-quality-metrics-2l1x).
 * @type {Set<string>}
 */
const TREND_SPAN_KEYS = new Set(['commit_size_trend', 'velocity_trend']);

/**
 * Render the visible span note for the two trend tiles above: the exact dates and day count
 * the trend was computed over, read from the same analyzed_span_start/end the masthead's own
 * span line already reports. Returns '' for every other entry, or when the span cannot be
 * computed (missing fields, backward compat).
 * @param {object} entry
 * @param {object} [summary]
 * @returns {string}
 */
function renderTrendSpanNote(entry, summary) {
  if (!summary || !TREND_SPAN_KEYS.has(entry.key)) return '';
  if (!summary.analyzed_span_start || !summary.analyzed_span_end) return '';
  const spanDays = daysBetween(`${summary.analyzed_span_start}T00:00:00.000Z`, `${summary.analyzed_span_end}T00:00:00.000Z`);
  if (spanDays === null) return '';
  // Inclusive of both boundary dates (a span from day 1 to day 17 covers 17 calendar days),
  // matching how this span is described in prose elsewhere (code-quality-metrics-2l1x).
  const inclusiveDays = spanDays + 1;
  const text = `Computed over ${summary.analyzed_span_start} to ${summary.analyzed_span_end} (${inclusiveDays} days).`;
  return `<p class="metric-span">${escapeHtml(text)}</p>`;
}

/**
 * Render the masthead's staleness line (code-quality-metrics-bb29, replacing an earlier version
 * from code-quality-metrics-2l1x that compared analyzed_span_end against the report's own
 * generation date). That comparison asked the wrong question: it hedged ("this window may not
 * reflect current activity") from how old the window looked *today*, which read as a real
 * measurement gap even when the window reached essentially every commit that exists -- measured
 * on dotnetdependencytracer, missing exactly 1 day out of a 275-day-old report, and on two of
 * five evaluation repositories where the true gap was 0 and the hedge still rendered regardless.
 *
 * This compares analyzed_span_end against repository_newest_commit_date instead -- the
 * repository's own newest commit across the same refs the run analyzed (findNewestCommitDate,
 * lib/git.js), independent of the report's generation date entirely. Zero versus non-zero is
 * the whole signal, so there is no tuned boundary here: a zero-or-negative gap (the window
 * reached the tip; negative should not occur but is treated the same as zero rather than as a
 * larger, nonsensical "gap") renders nothing, since analyzed_span_end (renderWindowLine) already
 * states that same date and there is no real gap left to name. A positive gap states its exact
 * size as a plain fact, not a hedge: "ends N days before the repository's most recent commit".
 * Returns '' when either date is missing (backward compat) or unparseable.
 * @param {object} summary
 * @returns {string}
 */
function renderStaleWindowLine(summary) {
  if (!summary.analyzed_span_end || !summary.repository_newest_commit_date) return '';
  const gapDays = daysBetween(`${summary.analyzed_span_end}T00:00:00.000Z`, `${summary.repository_newest_commit_date}T00:00:00.000Z`);
  if (gapDays === null || gapDays <= 0) return '';
  const text = `The analyzed window ends ${gapDays} day${gapDays === 1 ? '' : 's'} before the repository's most recent commit.`;
  return `<p class="masthead-staleness">${escapeHtml(text)}</p>`;
}

/**
 * Render the masthead: just enough identity to orient a reader before the finding they came
 * for -- workflow type, commit count, the analysis window's own basic shape. The archetype
 * verdict that used to render here moved below the "Commit messages" group
 * (renderArchetypeSection, code-quality-metrics-bmg): it classified an entire team from four
 * commit-shape percentages and headlined the report above every metric tile, which gave it far
 * more weight than a toolkit-invented, unvalidated grouping should carry.
 *
 * code-quality-metrics-rub1: this used to also carry the analyzed-span, staleness and
 * granularity lines, which meant a reader met four methodology lines (commit count with
 * filtered_from, the analyzed span with a HEAD-anchored parenthetical repeating the previous
 * line, a staleness note, a granularity note) before ever reaching the summary's own finding --
 * on a real run, the headline was the seventh line on the page. Those three lines now render in
 * renderMastheadDetail, called after renderTopSummary in renderReportHtml, so the finding
 * precedes the methodology that qualifies it. Only the short identity line stays here: a reader
 * needs to know at a glance what was analyzed (which kind of history, how many commits) before
 * weighing a verdict about it, and that one line is not the qualifier-heavy methodology this
 * move is about.
 * @param {object} summary
 * @returns {string}
 */
function renderMasthead(summary) {
  // code-quality-metrics-8sq: a sample drawn from many long-abandoned branches (measured:
  // remote_retro, 29 commits across 30 branches; dotnetdependencytracer, 50 across 49) holds
  // no shipped-practice signal, but reads identically to a concentrated sample unless the
  // branch count sits right next to the commit count a reader already looks at. No filter, no
  // invented recency bound -- just visibility. '' when the summary predates this field
  // (undefined, not just falsy 0, since a genuinely single-branch trunk run reports 1).
  const branchSpread = summary.branches_with_analyzed_commits !== undefined
    ? `, across ${escapeHtml(summary.branches_with_analyzed_commits)} branch${summary.branches_with_analyzed_commits === 1 ? '' : 'es'}`
    : '';
  // code-quality-metrics-g10: "a 30-day window" is a false statement, not merely an
  // incomplete one, when the run was HEAD-anchored (window_requested_since null) or widened
  // (window_widened true) -- analysis_period_days was never the boundary actually used in
  // either case, only the CONFIG default carried along for backward compatibility. The
  // detail section's own span line (renderWindowLine) does not excuse a false claim sitting
  // next to it. Summaries predating analyzed_span_start (analyzed_span_start === undefined)
  // keep the original unconditional phrasing, since those two new fields do not exist to check.
  const claimsDayWindow = summary.analyzed_span_start === undefined
    || (summary.window_requested_since != null && !summary.window_widened);
  const windowClause = claimsDayWindow
    ? ` over a ${escapeHtml(summary.analysis_period_days)}-day window`
    : ' (HEAD-anchored window)';
  // code-quality-metrics-kprr: filtered_from is the fetched history's own commit count before
  // MAX_COMMITS (or the analyzed window) narrowed it down to total_commits. Stated right next
  // to the sample size it qualifies, not left to a reader who happens to open the JSON.
  const filteredFromClause = summary.filtered_from !== undefined
    && Number(summary.filtered_from) > Number(summary.total_commits)
    ? ` (filtered from ${escapeHtml(summary.filtered_from)} fetched)`
    : '';
  return `<header class="masthead">
<h1>AI Drift Report</h1>
<p class="masthead-window">${escapeHtml(summary.workflow_type)} &middot; ${escapeHtml(summary.total_commits)} commits analyzed${filteredFromClause}${windowClause}${branchSpread}</p>
</header>`;
}

/**
 * Render the masthead's detail lines: the actual analyzed span (and whether the window was
 * widened past what was requested), the staleness gap against the repository's own newest
 * commit, and the history-granularity resolution. Rendered after renderTopSummary
 * (code-quality-metrics-rub1), not inside the masthead header above: these are the methodology
 * qualifiers a reader needs to properly weigh the finding, not the finding itself, and PR #95's
 * own tile-level precedent (verdict and meaning first, methodology collapsed/deferred) is the
 * reading order this follows one level up.
 * @param {object} summary
 * @returns {string}
 */
function renderMastheadDetail(summary) {
  const granularityLine = renderGranularityLine(summary);
  const windowLine = renderWindowLine(summary);
  const staleWindowLine = renderStaleWindowLine(summary);
  return `<div class="masthead-detail">
${windowLine}
${staleWindowLine}
${granularityLine}
</div>`;
}

/**
 * Render the archetype block: which of the four commit-shape signals crossed which line, and
 * this toolkit's own rule for combining them into one of four named labels -- never what that
 * combination "points to" or "suggests" (code-quality-metrics-bmg). Rendered below the "Commit
 * messages" group, in a block marked under development: measured absurdity that motivated the
 * move, a three-week-old greenfield spike (flight-info-spike) was labelled legacy-bottleneck
 * while this block headlined the masthead.
 * @param {object} summary
 * @param {Array<object>} catalog
 * @returns {string}
 */
function renderArchetypeSection(summary, catalog) {
  const archetype = summary.dora_archetype;
  // The archetype is a composite of the commit-unit metrics lib/report.js's buildMetricCatalog
  // withholds under squashed/unknown history, so it is suppressed entirely rather than shown
  // without a verdict (code-quality-metrics-bnq requirement #5) -- collectLocalMetrics.js never
  // computes dora_archetype in that case, so archetype is undefined here, not a real value.
  const historySuppressed = summary.history_granularity === 'squashed' || summary.history_granularity === 'unknown';
  // code-quality-metrics-m7kt, updated by the code-quality-metrics coordination task:
  // project_lifecycle: initial-build no longer withholds large_commits_pct and
  // sprawling_commits_pct (lib/report.js's buildMetricCatalog now substitutes
  // THRESHOLDS.GREENFIELD_MODERN for them instead -- see GREENFIELD_SUBSTITUTED_KEYS), so
  // anyInputWithheld below is never true for that reason any more. The archetype is still
  // suppressed for an initial-build window (isGreenfieldWindow below), but for a different
  // reason than before: classifyDoraArchetype (lib/metrics.js) is unmodified by this task and
  // still compares every signal against the brownfield bands regardless of project_lifecycle,
  // so summary.dora_archetype's own critical/healthy crossings do not agree with what the two
  // substituted catalog entries now show (a greenfield-modern crossing). Composing the two
  // would produce one "verdict" built from two incompatible band sources, not the coherent
  // classification a reader would assume it to be from the label alone -- so it is suppressed,
  // not shown as if it were one.
  const anyInputWithheld = ARCHETYPE_SIGNAL_KEYS.some(key => {
    const entry = catalog.find(e => e.key === key);
    return entry && entry.direction === 'informational';
  });
  const isGreenfieldWindow = summary.project_lifecycle === 'initial-build';
  const archetypeSuppressed = historySuppressed || anyInputWithheld || isGreenfieldWindow;

  // code-quality-metrics-wo8q: a suppressed run displays no real content (no verdict, no
  // signal breakdown), so it does not earn the DORA-disclaimer paragraph either -- that
  // paragraph exists to caveat a real archetype label, and there is none here. One short
  // sentence states the fact and moves on, rather than spending roughly 110 words (the
  // disclaimer plus a multi-sentence suppression rationale) to say "nothing to show."
  if (archetypeSuppressed) {
    const suppressedText = historySuppressed
      ? 'Archetype suppressed: history is squashed pull requests, not granular commits, so the composite verdict has no valid inputs.'
      : isGreenfieldWindow
        ? 'Archetype suppressed: this looks like an initial build, and two of its four input signals now use the greenfield-modern band instead of the brownfield band this archetype\'s own rule assumes, so composing them would not be one coherent verdict.'
        : 'Archetype suppressed: one or more of its four input signals has a withheld verdict for this window, so the composite verdict has no valid inputs.';
    return `<section class="archetype-note">
<h2>Team archetype <span class="under-development">(under development)</span></h2>
<p class="verdict" data-status="neutral">${escapeHtml(suppressedText)}</p>
</section>`;
  }

  const bodyText = describeArchetypeBody(archetype, catalog);
  const verdictStatus = ARCHETYPE_STATUS[archetype] || 'neutral';
  // code-quality-metrics-rpw: no separate "<label>: " prefix here. bodyText already names the
  // archetype once on its own -- describeArchetypeBody's ARCHETYPE_RULE_DESCRIPTIONS quotes it
  // inline ('...this toolkit's rule labels that combination "legacy-bottleneck" because...'),
  // and the "could not be determined" fallback names no archetype at all. A prefix here would
  // repeat whichever of those the label already appears in.
  const verdictLine = escapeHtml(bodyText);
  return `<section class="archetype-note">
<h2>Team archetype <span class="under-development">(under development)</span></h2>
<p class="archetype-disclaimer">The names are borrowed from DORA; this four-way grouping is this toolkit's own invention, not DORA's. DORA derives its own team archetypes from cluster analysis of survey responses covering burnout, friction and delivery instability, not from commit shape, and publishes no such grouping from commit data.</p>
<p class="verdict" data-status="${escapeHtml(verdictStatus)}">${verdictLine}</p>
</section>`;
}

/**
 * Render the masthead's actual-span line: the real oldest/newest analyzed commit dates
 * (code-quality-metrics-g10 hard requirement), so a report is never presentable as covering
 * recent activity when the analyzed commits are not recent. Also states plainly when the
 * window was widened past what was requested, and from what boundary, rather than only
 * recording that fact in the JSON. Returns '' when analyzed_span_start is absent, mirroring
 * renderGranularityLine's own backward-compat handling: a summary from before this feature
 * shipped has neither field, and the report must render unchanged rather than throw.
 * @param {object} summary
 * @returns {string}
 */
function renderWindowLine(summary) {
  if (!summary.analyzed_span_start) return '';
  const span = `Actual span analyzed: ${escapeHtml(summary.analyzed_span_start)} to ${escapeHtml(summary.analyzed_span_end)}`;
  const text = summary.window_widened
    ? `${span} (requested since ${escapeHtml(summary.window_requested_since)} returned no commits; widened to the newest commits available instead)`
    : summary.window_requested_since
      ? `${span} (requested since ${escapeHtml(summary.window_requested_since)})`
      : `${span} (HEAD-anchored: newest commits, no date filter requested)`;
  return `<p class="masthead-span">${text}</p>`;
}

/**
 * Resolve the masthead history-granularity sentence for the five states
 * code-quality-metrics-aoo's design agreed on wording for. Reports the
 * confidence of the decision actually made, never of a detection that was
 * structurally overridden and discarded: when workflow_type: feature_branch
 * settles the unit (state 1 -- 4 of the 5 repositories analysed for this
 * ticket: 73V, remote_retro, daloopa, dotnetdependencytracer), there is no
 * uncertainty left to report, so no confidence wording appears at all. The
 * remaining four states cover workflow_type: trunk, where the raw detector's
 * own verdict (history_granularity_detected/_confidence) is what actually
 * decided the resolved value, so its confidence is worth naming, or -- for
 * squashed/unknown -- naming is redundant with just stating the unit and the
 * withholding consequence directly. CLI --history overrides (a human
 * decision, not a detection question) are handled by the caller before this
 * function is ever reached; workflow_type/history_granularity_detected here
 * always reflect what detection itself found, per lib/git.js's
 * detectHistoryGranularity and local-code-metrics.js's
 * resolveHistoryGranularityForWithholding.
 * @param {object} summary
 * @returns {string}
 */
function resolveGranularitySentence(summary) {
  if (summary.workflow_type === 'feature_branch') {
    // State 1: settled structurally. Commits unique to an unmerged branch cannot yet be the
    // squashed result of a merge, whatever a raw PR-reference signal on one subject guessed --
    // so that guess is not reported here as a confidence at all (see renderHistoryProvenanceLine
    // for where the discarded guess itself is surfaced, as provenance, in Analysis Scope).
    return "Comparing individual commits. These come from unmerged branches, so each is one developer's commit rather than a squashed pull request.";
  }

  // States 2-5: workflow_type: trunk, where the raw detector's own verdict is what actually
  // decided the resolved value.
  if (summary.history_granularity === 'granular') {
    return summary.history_granularity_confidence === 'high'
      // State 2: trunk, detected granular at high confidence.
      ? 'Comparing individual commits. This project keeps them intact rather than squashing on merge.'
      // State 3: trunk, detected granular at low confidence.
      : 'Comparing individual commits, though the signal is weak: a few subjects reference pull requests.';
  }

  // State 5: trunk, detection returned unknown, resolved to squashed for gating.
  if (summary.history_granularity_detected === 'unknown') {
    return 'The unit could not be determined, so it is treated as squashed pull requests and the comparisons below are withheld.';
  }

  // State 4: trunk, detected squashed at either confidence.
  return 'Comparing squashed pull requests, not individual commits. The comparisons below are withheld, because a band derived from individual commits does not apply to a whole pull request.';
}

/**
 * Render the masthead's history-granularity line. A human-supplied --history override (a
 * decision, not a detection question) is reported as its own case, unchanged from before this
 * rewrite: it always names what the override forced, and what detection itself found for
 * provenance. Absent an override, the sentence is resolveGranularitySentence's plain-language
 * resolution for the five states code-quality-metrics-aoo's design covers.
 * @param {object} summary
 * @returns {string}
 */
function renderGranularityLine(summary) {
  const granularity = summary.history_granularity;
  if (!granularity) return '';
  if (summary.history_granularity_override) {
    const unit = granularity === 'granular' ? 'individual commits' : 'squashed pull requests';
    const text = `Comparing ${unit}, overridden by --history (detection itself found ${escapeHtml(summary.history_granularity_detected)} at ${escapeHtml(summary.history_granularity_confidence)} confidence)`;
    return `<p class="masthead-granularity">${text}</p>`;
  }
  return `<p class="masthead-granularity">${escapeHtml(resolveGranularitySentence(summary))}</p>`;
}

/**
 * Render, for Analysis Scope, the provenance of a discarded raw detection: when
 * workflow_type: feature_branch structurally overrode a detector guess of anything other than
 * granular (code-quality-metrics-aoo), the masthead line above states only the resolved fact,
 * with no room for the discarded guess -- this is where that guess is kept, as an audit trail,
 * rather than lost. Returns '' when there is nothing discarded to report: workflow_type is not
 * feature_branch, detection agreed with the resolved value (detected granular already), or the
 * summary predates history_granularity_detected (backward compat, mirroring every other
 * granularity/window helper's own '' fallback in this file).
 * @param {object} summary
 * @returns {string}
 */
function renderHistoryProvenanceLine(summary) {
  if (summary.workflow_type !== 'feature_branch') return '';
  const detected = summary.history_granularity_detected;
  if (!detected || detected === 'granular') return '';
  const signals = summary.history_granularity_signals;
  // code-quality-metrics-66oo: a bare percentage with no stated denominator ("4.82% of
  // analyzed commit subjects") let this sentence understate its own population once
  // (the true share of the actual analyzed population was 42%, not 4.82%) with no way for a
  // reader to sanity-check it. signals.sample_size (lib/git.js's detectHistoryGranularity)
  // names the exact denominator the share was computed over; naming it here when present,
  // and falling back to the un-denominated phrasing when it is not (backward compat: an older
  // summary's signals object predates this field).
  const sampleSize = signals && typeof signals.sample_size === 'number' ? signals.sample_size : null;
  const prShare = signals && typeof signals.pr_reference_share === 'number'
    ? ` (${escapeHtml(formatValue(signals.pr_reference_share * 100))}% of ${sampleSize !== null ? `the ${escapeHtml(sampleSize)} ` : ''}analyzed commit subjects reference a pull request)`
    : '';
  const detectedLabel = detected === 'squashed' ? 'squashed pull requests' : 'an undetermined unit';
  return `<li>Detection guessed ${escapeHtml(detectedLabel)}${prShare}; overridden because the analyzed commits are unique to unmerged branches, which cannot yet be the squashed result of a merge.</li>`;
}

/**
 * Render the unified, sorted metric-card grid. Every catalog entry is
 * rendered, in the order given, gauge and plain-stat cards interleaved.
 * @param {Array<object>} catalog
 * @returns {string}
 */
/**
 * Render the band-provenance chip and its data-band attribute for a card whose verdict was
 * scored against a substituted band (entry.bandProvenance, set by lib/report.js's
 * substituteBand). A prose sentence in the threshold description (describeThreshold) already
 * says this; this is the second, visual half of the same distinction -- a marker a reader's
 * eye catches without reading the threshold sentence, the same reason status already gets
 * both a border color and a text chip rather than relying on prose alone. Returns both empty
 * when the entry carries no bandProvenance, so an unsubstituted card (and every card before
 * this field existed) renders exactly as it did before.
 *
 * The chip names only the population, never its sample size (entry.bandProvenance.n):
 * methodology, not the local "this tile used a substituted band" signal the chip exists to
 * carry (code-quality-metrics coordination task). The sample size lives once, in the
 * group-level note (renderGreenfieldNote) rendered alongside "Change size and scope" -- a
 * reader who wants it can find it there rather than on every tile's chip.
 * @param {object} entry
 * @returns {{ dataAttr: string, chipMarkup: string }}
 */
function renderBandProvenance(entry) {
  if (!entry.bandProvenance) return { dataAttr: '', chipMarkup: '' };
  const { population } = entry.bandProvenance;
  return {
    dataAttr: ` data-band="${escapeHtml(population)}"`,
    chipMarkup: `<span class="band-chip">${escapeHtml(population)} band</span>`
  };
}

/**
 * Render a gauge card: semicircular SVG gauge plus label and value.
 * @param {object} entry
 * @param {boolean} [suppressDora] - when true, omit the DORA-connection sentence from this
 * tile's Methodology disclosure because an earlier tile in the same section already stated the
 * identical sentence (renderMetricGrid; code-quality-metrics-wo8q).
 * @returns {string}
 */
function renderGaugeCard(entry, suppressDora) {
  const bands = gaugeBands(entry);
  const { bandPaths, needleEndpoint, hub } = buildGaugeSvgParts({
    value: entry.value,
    vmax: GAUGE_VMAX,
    bands
  });
  const bandMarkup = bandPaths.map((d, i) => `<path d="${d}" class="gauge-band gauge-${bands[i].status}" />`).join('\n');
  const threshold = describeThreshold(entry);
  const { dataAttr, chipMarkup } = renderBandProvenance(entry);
  const meaning = describeVerdictMeaning(entry);
  const meaningMarkup = meaning ? `<p class="metric-meaning">${escapeHtml(meaning)}</p>` : '';
  return `<article class="metric-card" data-status="${escapeHtml(entry.status)}"${dataAttr}>
<svg class="gauge" viewBox="0 0 220 130">
${bandMarkup}
<line x1="${hub.cx}" y1="${hub.cy}" x2="${needleEndpoint.x}" y2="${needleEndpoint.y}" class="gauge-needle" />
<circle cx="${hub.cx}" cy="${hub.cy}" r="${hub.r}" class="gauge-hub" />
</svg>
<p class="metric-value">${escapeHtml(formatValue(entry.value))}</p>
<span class="status-chip">${escapeHtml(entry.status)}</span>
<p class="metric-label">${escapeHtml(entry.label)}</p>
${chipMarkup}
${meaningMarkup}
${renderWhatIs(entry)}
${renderMethodologyDetails(entry, threshold, suppressDora)}
</article>`;
}

/**
 * Render a plain stat card: monospace number, status chip, label.
 * @param {object} entry
 * @param {object} [summary]
 * @param {boolean} [suppressDora] - see renderGaugeCard's own doc for what this suppresses and
 * why.
 * @returns {string}
 */
function renderStatCard(entry, summary, suppressDora) {
  const threshold = describeThreshold(entry);
  const { dataAttr, chipMarkup } = renderBandProvenance(entry);
  const meaning = describeVerdictMeaning(entry);
  const meaningMarkup = meaning ? `<p class="metric-meaning">${escapeHtml(meaning)}</p>` : '';
  const spanMarkup = renderTrendSpanNote(entry, summary);
  return `<article class="metric-card" data-status="${escapeHtml(entry.status)}"${dataAttr}>
<p class="metric-value">${escapeHtml(formatValue(entry.value))}</p>
<span class="status-chip">${escapeHtml(entry.status)}</span>
<p class="metric-label">${escapeHtml(entry.label)}</p>
${chipMarkup}
${meaningMarkup}
${spanMarkup}
${renderWhatIs(entry)}
${renderMethodologyDetails(entry, threshold, suppressDora)}
</article>`;
}

/**
 * Split a description's `measures` text at its first sentence boundary. The first sentence is
 * the plain "what this metric is" statement -- kept visible, in the reading path (see
 * renderWhatIs); anything after it is a caveat or literature aside that reads as methodology
 * and moves into the collapsed Methodology disclosure instead (renderMethodologyDetails).
 * code-quality-metrics coordination task: measured on 73V's "Large commits" tile, the rendered
 * card gave roughly 15 words to what the metric is and 110 to qualifiers -- the literature
 * aside inside `measures` (the largest single piece of that 110) is exactly what this split
 * moves out of the reading path. Every lib/metric-descriptions.js `measures` string starts
 * with a genuine sentence (a period, question mark, or exclamation point, then whitespace or
 * end of string, with no abbreviation or decimal number before it), so one plain, non-greedy
 * split needs no per-metric special casing.
 * @param {string} text
 * @returns {{ primary: string, rest: string }}
 */
function splitFirstSentence(text) {
  const match = text.match(/^([\s\S]*?[.!?])(\s+([\s\S]*))?$/);
  if (!match) return { primary: text, rest: '' };
  return { primary: match[1], rest: match[3] || '' };
}

/**
 * Render the visible "what this metric is" line: just the first sentence of its
 * lib/metric-descriptions.js `measures` text -- the one piece of tile prose the coordination
 * task's own review called "genuinely good, keep that voice." Returns '' when the entry has no
 * matching description, mirroring the fallback renderMethodologyDetails also uses.
 * @param {object} entry
 * @returns {string}
 */
function renderWhatIs(entry) {
  const description = METRIC_DESCRIPTIONS[entry.key];
  if (!description) return '';
  const { primary } = splitFirstSentence(description.measures);
  return `<p class="metric-what-is">${escapeHtml(primary)}</p>`;
}

/**
 * Render the collapsed Methodology disclosure: the threshold/tiering sentence
 * (describeThreshold's output, already including the band-provenance clause when a band was
 * substituted), the remainder of the metric's `measures` text after its first sentence (the
 * literature/caveat aside split off by splitFirstSentence), and the DORA-connection sentence.
 * All of this is true and stays reachable; none of it belongs in the reading path for every
 * tile (code-quality-metrics coordination task) -- see describeVerdictMeaning's own comment
 * for the measured ratio this exists to fix. `<details>` closed by default: a reader who wants
 * the mechanism can open it, but it does not compete with the value/meaning line above it.
 * suppressDora (code-quality-metrics-wo8q) omits the DORA-connection sentence when an earlier
 * tile in the same rendered section already stated the identical text: test_coverage_rate,
 * test_isolation_rate and uncovered_prod_rate (lib/metric-descriptions.js) share one verbatim
 * DORA footnote, and all three sit under the "Test practice" heading, so it used to render
 * three times in one section. renderMetricGrid computes this per group, keeping the first
 * occurrence of each distinct dora text visible and suppressing the rest.
 * @param {object} entry
 * @param {string|null} threshold
 * @param {boolean} [suppressDora]
 * @returns {string}
 */
function renderMethodologyDetails(entry, threshold, suppressDora) {
  const thresholdMarkup = threshold ? `<p class="metric-threshold">${escapeHtml(threshold)}</p>` : '';
  const description = METRIC_DESCRIPTIONS[entry.key];
  if (!description) {
    return thresholdMarkup
      ? `<details class="metric-methodology">\n<summary>Methodology</summary>\n${thresholdMarkup}\n</details>`
      : '';
  }
  const { rest } = splitFirstSentence(description.measures);
  const restMarkup = rest ? `<p class="metric-description-measures">${escapeHtml(rest)}</p>` : '';
  const doraMarkup = suppressDora ? '' : `<p class="metric-description-dora">${escapeHtml(description.dora)}</p>`;
  return `<details class="metric-methodology">
<summary>Methodology</summary>
${thresholdMarkup}
<div class="metric-description">
${restMarkup}
${doraMarkup}
</div>
</details>`;
}

/**
 * Render the short early-stage/mature-codebase comparison note (code-quality-metrics-31w,
 * rewritten by the code-quality-metrics coordination task). Replaces a ~110-word, three-
 * sentence masthead paragraph that led with what does not apply ("do not transfer", "much
 * thinner sample", jargon like "brownfield" and "quantiles of maintenance-era windows") ahead
 * of the reader's own findings in renderTopSummary. Three facts, plainly: this project is
 * early-stage so it is compared against other early-stage projects; that comparison rests on
 * a small number of reference projects, so the bars are rough; two metrics still use the
 * mature-project bar. Placed beside "Change size and scope" (renderMetricGrid), the group
 * whose tiles this actually governs, rather than the masthead -- a reader's own findings
 * (renderTopSummary's headline) still come first either way, but a run-shape fact that governs
 * five specific tiles reads better next to them than above everything on the page.
 *
 * Reads the substituted band's own sample size from the first entry in the catalog carrying a
 * bandProvenance (lib/report.js's substituteBand) rather than a hardcoded literal, so this
 * stays true as GitHub #84 grows the greenfield-modern population past two repositories.
 * Returns '' when no entry in this run was substituted (project_lifecycle is not
 * 'initial-build', or the greenfield-modern band could not support a given key).
 * @param {Array<object>} catalog
 * @returns {string}
 */
function renderGreenfieldNote(catalog) {
  const substituted = catalog.find(entry => entry.bandProvenance);
  if (!substituted) return '';
  const { n } = substituted.bandProvenance;
  const text = `This looks like an early-stage project, so tiles here (and duplication density, below) are compared against other early-stage projects, not mature ones. That rests on just ${escapeHtml(n)} reference project${n === 1 ? '' : 's'}, so treat it as rough. Test/prod co-change and uncovered production still use the mature-project bar.`;
  return `<p class="greenfield-note">${text}</p>`;
}

/**
 * Render the metric catalog grouped under fixed headings (code-quality-metrics-yte). Walks
 * METRIC_GROUP_ORDER (lib/report.js) in that literal order rather than re-deriving an order
 * from the entries' own concern -- a report whose headings reshuffle between runs is not
 * scannable, so group order is fixed independent of which group happens to carry the most
 * alarming finding this run. Within a heading, entries keep the relative order they arrive
 * in: catalog is already sorted by concern descending, and grouping filters that array rather
 * than re-sorting it, so a group's own internal concern ordering survives. A group with no
 * entries this run (e.g. no duplicate-detection data supplied at all) renders no heading and
 * no grid, rather than an empty one.
 *
 * summary is threaded through to renderStatCard purely so the two trend tiles
 * (renderTrendSpanNote) can state the analyzed span they were computed over
 * (code-quality-metrics-2l1x); nothing else in this function reads it.
 *
 * Within each group, a repeated DORA footnote (two or more entries sharing the exact same
 * METRIC_DESCRIPTIONS[key].dora text) is kept visible only on the first tile that carries it;
 * later tiles in the same group suppress their own copy (code-quality-metrics-wo8q) rather than
 * repeating the identical sentence once per tile.
 * @param {Array<object>} catalog
 * @param {object} [summary]
 * @returns {string}
 */
function renderMetricGrid(catalog, summary) {
  const greenfieldNote = renderGreenfieldNote(catalog);
  return METRIC_GROUP_ORDER
    .map(group => catalog.filter(entry => entry.group === group))
    .filter(entries => entries.length > 0)
    .map(entries => {
      const group = entries[0].group;
      const seenDoraText = new Set();
      const cards = entries.map(entry => {
        const description = METRIC_DESCRIPTIONS[entry.key];
        let suppressDora = false;
        if (description && description.dora) {
          if (seenDoraText.has(description.dora)) {
            suppressDora = true;
          } else {
            seenDoraText.add(description.dora);
          }
        }
        return entry.hasGauge ? renderGaugeCard(entry, suppressDora) : renderStatCard(entry, summary, suppressDora);
      }).join('\n');
      const noteMarkup = group === 'Change size and scope' ? greenfieldNote : '';
      return `<section class="metric-category">
<h2 class="metric-category-heading">${escapeHtml(group)}</h2>
${noteMarkup}
<div class="metric-grid">
${cards}
</div>
</section>`;
    })
    .join('\n');
}

/**
 * Format a commit's "Lines changed" cell: the whole-diff total
 * (total_additions + total_deletions), unchanged, plus a visible excluded-share
 * suffix when any of that total was excluded by ANALYSIS_IGNORE_PATTERNS.
 *
 * lib/git.js:179/:219 keep total_additions/total_deletions/files_changed whole-diff
 * deliberately, so a reader comparing the Flight Log to `git log` sees the real
 * commit rather than a number already shrunk by configuration they may not know
 * about -- that reasoning holds here too, so this does not switch the basis to
 * counted_additions/counted_deletions. The defect this fixes is different: a row
 * almost entirely excluded content (code-quality-metrics-cqdb, measured on 73V:
 * cc7c77aa rendered 14,679 lines with 14,410 excluded and only 216 production)
 * gave no hint of that, reading as a 14,000-line commit. The excluded share is
 * shown alongside the unchanged total instead of replacing it, and only when
 * there is anything excluded to report, so an ordinary row stays uncluttered.
 * @param {{total_additions: number, total_deletions: number, excluded_additions?: number, excluded_deletions?: number}} commit
 * @returns {string}
 */
function formatFlightLogLines(commit) {
  const total = commit.total_additions + commit.total_deletions;
  const excluded = (commit.excluded_additions || 0) + (commit.excluded_deletions || 0);
  if (excluded <= 0) return escapeHtml(total);
  const excludedPct = ((excluded / total) * 100).toFixed(2);
  return `${escapeHtml(total)} (${escapeHtml(excludedPct)}% excluded)`;
}

/**
 * Render the Flight Log: a table of the top 10 commits by lines changed.
 * @param {Array<object>} metrics
 * @returns {string}
 */
function renderFlightLog(metrics) {
  const rows = topCommits(metrics, 10).map(commit => `<tr>
<td class="mono">${escapeHtml(commit.sha)}</td>
<td>${escapeHtml(commit.message)}</td>
<td>${escapeHtml(commit.author)}</td>
<td class="mono">${formatFlightLogLines(commit)}</td>
<td class="mono">${escapeHtml(commit.files_changed)}</td>
</tr>`).join('\n');
  return `<section class="flight-log">
<h2>Flight Log</h2>
<table>
<thead>
<tr><th>SHA</th><th>Message</th><th>Author</th><th>Lines changed</th><th>Files changed</th></tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
}

/**
 * Build fallback findings bullets from the catalog when no findings narrative was supplied (or
 * one was rejected -- see lib/narrative.js's generateFindingsNarrative). code-quality-metrics-ponf:
 * a prior version showed only the top 3 critical/warning entries, which both truncated away a
 * genuine warning that happened to sort after two others (measured: a real run where the
 * truncation dropped duplication_density_pct, a real banded warning, in favor of two
 * lower-standing directional entries) and never showed a single healthy result, so a mixed run
 * read as "nothing but problems." Every verdict-bearing entry (hasVerdict, lib/report.js) now
 * appears, concerns first, then healthy results -- both in the catalog's own concern-descending
 * order -- with no truncation and no entry hidden or softened. A purely informational/special
 * entry (message quality, avg lines changed, an unmeasured tile, test_isolation_rate's own
 * status) never carries a real pass/fail call and stays excluded, exactly as before.
 * @param {Array<object>} catalog
 * @returns {string[]}
 */
function fallbackFindings(catalog) {
  const verdictEntries = catalog.filter(hasVerdict);
  const concerns = verdictEntries.filter(entry => entry.status === 'critical' || entry.status === 'warning');
  const healthy = verdictEntries.filter(entry => entry.status === 'good');
  return [...concerns, ...healthy].map(entry => `${entry.label}: ${formatValue(entry.value)} (${entry.status})`);
}

/**
 * Render the Findings section. `findings` may be a string, an array of
 * strings, or omitted; when omitted it falls back to plain templated
 * bullets built from the catalog's top critical/warning entries. Kept
 * generic so a later task can swap in LLM-generated prose through the
 * same slot.
 * @param {(string|string[]|undefined)} findings
 * @param {Array<object>} catalog
 * @returns {string}
 */
function renderFindings(findings, catalog) {
  let items;
  if (findings === undefined) {
    items = fallbackFindings(catalog);
  } else {
    items = Array.isArray(findings) ? findings : [findings];
  }
  const bullets = items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n');
  return `<section class="findings">
<h2 id="${FINDINGS_ANCHOR_ID}">Findings</h2>
<ul>
${bullets}
</ul>
</section>`;
}

/**
 * Render the Duplicate Code section: Layer 1 (jscpd, static) findings,
 * Layer 2 (Claude, semantic) findings when that layer ran, and a plain
 * indicator of which layers ran. Mirrors the "## Duplicate Code" section
 * pr-metrics.yml already posts on every PR, so the same signal is visible
 * locally. Returns an empty string when no duplicate data was supplied
 * (e.g. the analysis run predates this feature, or touched no production
 * files), so older reports keep rendering unchanged.
 * @param {object} [duplicates]
 * @returns {string}
 */
function renderDuplicateSection(duplicates) {
  if (!duplicates) return '';

  const staticDuplicates = duplicates.static_duplicates || [];
  const semanticFindings = duplicates.semantic_findings || [];
  const staticStatus = duplicates.layers_run && duplicates.layers_run.static;
  const semanticStatus = duplicates.layers_run && duplicates.layers_run.semantic;
  // layers_run.static is a three-state field, exactly like layers_run.semantic below:
  // true (ran and produced a usable result -- findings may genuinely be empty, and that empty
  // list is itself a real, meaningful "0% duplication" result), 'unmeasured' (jscpd could not
  // parse any scanned file's language -- code-quality-metrics-tjn), or false (did not run at
  // all). Only an exact true means the static findings are real; treating 'unmeasured' as
  // truthy would silently report "no duplicates found" for a scan that never looked, which is
  // the defect code-quality-metrics-4ne fixes.
  const staticRan = staticStatus === true;
  const staticUnmeasured = staticStatus === 'unmeasured';
  // true: ran and produced a usable result (findings may genuinely be empty).
  // 'unmeasured': attempted but the call failed or its response was truncated —
  // must render distinctly from a real 0, never silently fall through to it.
  const semanticRan = semanticStatus === true;
  const semanticUnmeasured = semanticStatus === 'unmeasured';

  let staticBlock;
  if (staticUnmeasured) {
    // Mirrors the wording of the "Not measurable" duplication-density tile (lib/report.js's
    // describeUnsupportedLanguages) so the tile and this detail section agree instead of one
    // saying the measurement does not exist while the other claims a result.
    const extensions = duplicates.unsupported_extensions || [];
    const list = extensions.length > 0 ? extensions.join(', ') : 'unknown';
    staticBlock = `<li>Not measurable: none of the scanned production file(s) use a language the duplication detector (jscpd) recognizes. File extension(s) found: ${escapeHtml(list)}.</li>`;
  } else if (staticRan) {
    staticBlock = staticDuplicates.length > 0
      ? staticDuplicates.map(d => `<li>${escapeHtml(`${d.firstFile.name}:${d.firstFile.start}-${d.firstFile.end}`)} duplicates ${escapeHtml(`${d.secondFile.name}:${d.secondFile.start}-${d.secondFile.end}`)} (${escapeHtml(d.lines)} lines, ${escapeHtml(d.tokens)} tokens)</li>`).join('\n')
      : '<li>No static duplicates found.</li>';
  } else {
    staticBlock = '<li>Layer 1 (static) did not run.</li>';
  }

  const semanticBlock = semanticRan
    ? (semanticFindings.length > 0
      ? semanticFindings.map(f => `<li>${escapeHtml(f.file1)} / ${escapeHtml(f.file2)}: ${escapeHtml(f.similarity)} (confidence: ${escapeHtml(f.confidence)})</li>`).join('\n')
      : '<li>No semantic findings.</li>')
    : '';

  let staticPhrase;
  if (staticRan) {
    staticPhrase = 'Layer 1 (static) ran.';
  } else if (staticUnmeasured) {
    staticPhrase = 'Layer 1 (static) was not measured: the scanned file(s) use a language jscpd does not recognize.';
  } else {
    staticPhrase = 'Layer 1 (static) did not run.';
  }

  let semanticPhrase;
  if (semanticRan) {
    semanticPhrase = 'Layer 2 (semantic) ran.';
  } else if (semanticUnmeasured) {
    semanticPhrase = 'Layer 2 (semantic) was attempted but not measured: the Claude call failed or its response was truncated.';
  } else {
    semanticPhrase = 'Set ANTHROPIC_API_KEY to enable Layer 2 (semantic) analysis.';
  }

  const layerIndicator = `${staticPhrase} ${semanticPhrase}`;

  return `<section class="duplicate-code">
<h2>Duplicate Code</h2>
<ul class="duplicate-static">
${staticBlock}
</ul>
${semanticRan ? `<h3>Semantic Similarity</h3>\n<ul class="duplicate-semantic">\n${semanticBlock}\n</ul>` : ''}
<p class="duplicate-layer-indicator">${escapeHtml(layerIndicator)}</p>
</section>`;
}

/**
 * Render the Analysis Scope branch bullet (code-quality-metrics-ai6y). 73V's report named
 * "Branches considered (4 of 51 ...)" and then listed all 51 names in one run-on paragraph
 * with no indication which 4 actually contributed -- unusable as rendered, and in a client
 * context the branch names themselves (ticket ids, vendor names, feature intent) are the
 * leakiest content on the page.
 *
 * When summary.analyzed_branch_commit_counts is present, it identifies the contributing set
 * directly: those branches render by name with their own analyzed commit count, and the
 * non-contributing remainder is summarized by count rather than enumerated. When that field is
 * absent (an analysis run from before it existed), this falls back to the prior behavior --
 * every considered branch listed by name -- since there is no way to identify which branches
 * contributed without it.
 * @param {object} summary
 * @returns {string}
 */
function renderBranchesBullet(summary) {
  const branches = summary.branches_analyzed;
  if (!branches || branches.length === 0) return '';
  const counts = summary.analyzed_branch_commit_counts;
  if (!counts) {
    const contributed = summary.branches_with_analyzed_commits;
    const countClause = contributed !== undefined
      ? ` (${escapeHtml(contributed)} of ${escapeHtml(branches.length)} contributed a commit to the analyzed sample)`
      : '';
    return `<li>Branches considered${countClause}: ${branches.map(escapeHtml).join(', ')}</li>`;
  }
  const contributingNames = Object.keys(counts);
  const contributingList = contributingNames
    .map(name => `${escapeHtml(name)} (${escapeHtml(counts[name])})`)
    .join(', ');
  const nonContributingCount = branches.length - contributingNames.length;
  const remainderClause = nonContributingCount > 0
    ? ` ${escapeHtml(nonContributingCount)} other branch${nonContributingCount === 1 ? '' : 'es'} contributed no commits to the analyzed sample.`
    : '';
  return `<li>Branches considered (${escapeHtml(contributingNames.length)} of ${escapeHtml(branches.length)} contributed a commit to the analyzed sample): ${contributingList}.${remainderClause}</li>`;
}

/**
 * Render the Analysis Scope section: what ANALYSIS_IGNORE_PATTERNS excluded (if anything is
 * configured) and the vendored/generated default share (always, regardless of
 * configuration). A silent exclusion is the same defect class as the silent inclusion
 * code-quality-metrics-y8j fixes, so this has to be visible in the report itself, not only
 * in the summary JSON (code-quality-metrics-3b6).
 *
 * These two facts always render as two separate bullets now (code-quality-metrics-q8zp): a
 * prior version merged them into one bullet whenever their counts happened to coincide, and
 * that merged bullet's own text embedded vendored.patterns -- CONFIG.DUPLICATE_IGNORE_PATTERNS,
 * a duplication-detector setting -- inside a sentence otherwise about ANALYSIS_IGNORE_PATTERNS
 * and the commit-shape metrics. Demonstrated by accident: adding a duplication-only pattern to
 * a repository's DUPLICATE_IGNORE_PATTERNS moved that merged callout's file count and printed
 * pattern list, even though nothing about ANALYSIS_IGNORE_PATTERNS or the commit-shape metrics
 * had changed. The ANALYSIS_IGNORE_PATTERNS bullet below reads only from summary.
 * analysis_exclusions -- never summary.vendored_generated_share -- so nothing about the
 * vendored/generated share's own value can reach its text, whether or not the two facts
 * happen to describe the same files this run. The vendored/generated bullet, in turn, states
 * plainly that it is scoped by CONFIG.DUPLICATE_IGNORE_PATTERNS (what the duplicate detector
 * ignores), a smaller and different claim than a commit-shape exclusion, and that it does not
 * describe or affect the metrics above.
 *
 * Returns '' when both fields are absent, mirroring renderDuplicateSection's own
 * backward-compat handling: an analysis run from before this feature shipped has neither
 * field on its summary, and the report must render unchanged rather than throw.
 * @param {object} summary
 * @returns {string}
 */
function renderExclusionsSection(summary) {
  const exclusions = summary.analysis_exclusions;
  const vendored = summary.vendored_generated_share;
  const provenanceLine = renderHistoryProvenanceLine(summary);

  const bullets = [];

  if (exclusions || vendored) {
    bullets.push(exclusions && exclusions.patterns.length > 0
      ? `<li>${escapeHtml(exclusions.excluded_files_count)} file(s), ${escapeHtml(exclusions.excluded_lines_pct)}% of changed lines, excluded from the commit-shape metrics by ANALYSIS_IGNORE_PATTERNS: ${escapeHtml(exclusions.patterns.join(', '))}</li>`
      : '<li>No paths are configured for exclusion (ANALYSIS_IGNORE_PATTERNS is empty). Generated or vendored build output in this repository, if any, is still counted in every metric below.</li>');

    if (vendored) {
      bullets.push(`<li>${escapeHtml(vendored.files_count)} file(s), ${escapeHtml(vendored.lines_pct)}% of changed lines, match CONFIG.DUPLICATE_IGNORE_PATTERNS (${escapeHtml(vendored.patterns.join(', '))}): the same default patterns the duplicate detector (jscpd) ignores, not this run's ANALYSIS_IGNORE_PATTERNS configuration. Reported for visibility only; it does not describe or affect the commit-shape metrics above.</li>`);
    }
  }

  // code-quality-metrics-g39: the branch name list moved here from the masthead.
  // code-quality-metrics-rpw: labelled "Branches considered," not "Branches analyzed" -- this
  // lists every branch considered (branches_analyzed), a different set from the masthead's
  // "across N branches" (branches_with_analyzed_commits, only those that contributed a commit).
  // code-quality-metrics-ai6y: renderBranchesBullet now identifies which of those branches
  // actually contributed, listing only that set by name (with counts) rather than every
  // considered branch -- see its own comment for why.
  const branchBullet = renderBranchesBullet(summary);
  if (branchBullet) bullets.push(branchBullet);

  if (provenanceLine) bullets.push(provenanceLine);

  if (bullets.length === 0) return '';

  return `<section class="analysis-scope">
<h2>Analysis Scope</h2>
<ul>
${bullets.join('\n')}
</ul>
</section>`;
}

/**
 * Render the footer.
 * @param {object} summary
 * @returns {string}
 */
function renderFooter(summary) {
  return `<footer>
<p>Generated ${escapeHtml(summary.analysis_date)} &middot; ${escapeHtml(summary.note || '')}</p>
</footer>`;
}

/**
 * Render a complete standalone HTML document for the drift report.
 * Pure function: no fs, no network. Caller supplies fontData as base64
 * strings so this module stays unit-testable with fake inputs.
 * @param {{ summary: object, metrics: Array<object>, catalog: Array<object>, fontData: object, findings?: (string|string[]) }} args
 * @returns {string}
 */
function renderReportHtml({ summary, metrics, catalog, fontData, findings, duplicates }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI Drift Report</title>
<style>
${renderFontFaces(fontData)}
${DESIGN_TOKENS_CSS}
${COMPONENT_CSS}
</style>
</head>
<body>
${renderMasthead(summary)}
${renderTopSummary(catalog)}
${renderMastheadDetail(summary)}
${renderMetricGrid(catalog, summary)}
${renderArchetypeSection(summary, catalog)}
${renderFlightLog(metrics)}
${renderDuplicateSection(duplicates)}
${renderFindings(findings, catalog)}
${renderExclusionsSection(summary)}
${renderFooter(summary)}
</body>
</html>`;
}

module.exports = { renderReportHtml, fallbackFindings, formatValue };
