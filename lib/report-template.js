// @ts-nocheck
'use strict';

const { buildGaugeSvgParts, topCommits, METRIC_GROUP_ORDER } = require('./report');
const { METRIC_DESCRIPTIONS } = require('./metric-descriptions');

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
 * A vendored/generated share (Analysis Scope's own vendored_generated_share, code-quality-
 * metrics-3b6) worth calling out explicitly at the very top of the report: a reader who never
 * scrolls down to Analysis Scope -- now the last section on the page, see g39's reordering --
 * would otherwise miss the one fact that reframes every other count on the page (measured:
 * flight-info-spike reports 72% of its changed volume as vendored or generated). No cited
 * source in this project gives a boundary for "high enough to call out explicitly"; a quarter
 * of changed volume is a design choice, documented as one here, not a calibrated value the way
 * the metric bands in lib/thresholds.js are.
 */
const VENDORED_SHARE_CALLOUT_THRESHOLD = 25;

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
  const { direction, healthyBoundary, criticalBoundary, tier, descriptiveNote } = entry;
  // A metric whose band was deliberately dropped (not merely two-band) still needs to say
  // why: a bare number with neither a gauge nor an explanation reads as a bug, the same
  // failure mode the two-band tier's own text below exists to avoid. entry.descriptiveNote
  // carries that per-metric reason (see lib/report.js's net_additions_ratio_median and
  // message_quality_pct entries, code-quality-metrics-a9z and code-quality-metrics-6ti).
  if (descriptiveNote) return descriptiveNote;
  if (healthyBoundary == null && criticalBoundary == null && tier !== 'two-band') return null;
  if (tier === 'two-band') {
    // No critical bound exists (a single reference repo/window produced the
    // extreme; see calibration/derive-bands.js). Stating one anyway is
    // exactly the overstatement this tier exists to avoid, so the boundary
    // that IS supported (healthy) is named and the missing one is named as
    // missing, never filled in with a number that would misrepresent it.
    return direction === 'higher-is-better'
      ? `Healthy above ${formatValue(healthyBoundary)}. No critical bound: the low end rests on a single reference repository.`
      : `Healthy below ${formatValue(healthyBoundary)}. No critical bound: the high end rests on a single reference repository.`;
  }
  if (direction === 'higher-is-worse') {
    return `Healthy below ${formatValue(healthyBoundary)}, critical above ${formatValue(criticalBoundary)}`;
  }
  if (direction === 'higher-is-better') {
    return `Healthy above ${formatValue(healthyBoundary)}, critical below ${formatValue(criticalBoundary)}`;
  }
  if (direction === 'special') {
    return `Positive signal above ${formatValue(healthyBoundary)}`;
  }
  return null;
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
 * Build the archetype block's body text: a factual, per-signal breakdown (which line each of
 * the four inputs crossed) followed by which of this toolkit's own combination rules matched.
 * Falls back to the pre-existing "could not be determined" wording for an archetype value this
 * table does not recognize (kept identical to the string the masthead used to show in the same
 * case, so this is a relocation, not a behavior change, for that one edge case).
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
  return `${phrases.join('; ')}. ${ARCHETYPE_RULE_DESCRIPTIONS[archetype]}.`;
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
 * is fixed template text this function owns, and every number either is read directly from a
 * catalog entry's own value/label/status or from summary.vendored_generated_share, or is a
 * count of catalog entries matching a status this same function already computed (criticalCount/
 * warningCount below) -- the one arithmetic step this function performs, and a provably correct
 * tally rather than new information, unlike a number an LLM might invent. There is no model call
 * and no free-form text in this function at all, so there is nothing in it that could
 * fabricate a claim the way the Findings narrative (lib/narrative.js's
 * generateFindingsNarrative, validated by validateNarrative) could and once did. This is
 * deliberate: a second prose surface at the top of the report, unvalidated, would reopen the
 * exact fabrication hole four prior tickets closed, in the most prominent position on the page
 * (code-quality-metrics-g39's own constraint). Because this function never reads the findings
 * narrative at all, its content is identical whether that narrative below was accepted or
 * rejected -- there is nothing here that depends on, or needs to react to, that outcome, and
 * the granularity it asserts (a count, and the single top-concern's label/value/status) never
 * exceeds what lib/report-template.js's own fallbackFindings already shows for the same catalog.
 * @param {Array<object>} catalog
 * @param {object} summary
 * @returns {string}
 */
function renderTopSummary(catalog, summary) {
  const concerns = catalog.filter(entry => entry.status === 'critical' || entry.status === 'warning');
  const criticalCount = concerns.filter(entry => entry.status === 'critical').length;
  const warningCount = concerns.filter(entry => entry.status === 'warning').length;

  let headline;
  if (concerns.length === 0) {
    headline = 'No measured signal in this run crossed a warning or critical threshold.';
  } else {
    const counts = [];
    if (criticalCount > 0) counts.push(`${criticalCount} critical`);
    if (warningCount > 0) counts.push(`${warningCount} warning`);
    // catalog is already sorted by concern descending (lib/report.js's buildMetricCatalog), so
    // the first entry whose status is critical/warning is, by construction, the run's single
    // highest-concern finding -- no separate re-sort or re-derivation happens here.
    const top = concerns[0];
    headline = `This run flags ${counts.join(' and ')} signal${concerns.length === 1 ? '' : 's'}, `
      + `led by ${escapeHtml(top.label)} at ${escapeHtml(formatValue(top.value))} (${escapeHtml(top.status)}).`;
  }

  const vendored = summary.vendored_generated_share;
  const vendoredPct = vendored ? parseFloat(vendored.lines_pct) : NaN;
  const vendoredNote = !Number.isNaN(vendoredPct) && vendoredPct >= VENDORED_SHARE_CALLOUT_THRESHOLD
    ? ` ${escapeHtml(formatValue(vendoredPct))}% of changed lines in this run are vendored or generated code (see Analysis Scope below), which reframes every count above.`
    : '';

  return `<section class="report-summary">
<p>${headline}${vendoredNote} See <a href="#${FINDINGS_ANCHOR_ID}">Findings</a> below for the full picture.</p>
</section>`;
}

/**
 * Render the masthead: repo/window/commit-count context. The archetype verdict that used to
 * render here moved below the "Commit messages" group (renderArchetypeSection,
 * code-quality-metrics-bmg): it classified an entire team from four commit-shape percentages
 * and headlined the report above every metric tile, which gave it far more weight than a
 * toolkit-invented, unvalidated grouping should carry.
 * @param {object} summary
 * @returns {string}
 */
function renderMasthead(summary) {
  const granularityLine = renderGranularityLine(summary);
  const lifecycleLine = renderLifecycleLine(summary);
  const windowLine = renderWindowLine(summary);
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
  // adjacent span line (renderWindowLine) does not excuse a false claim sitting next to it.
  // Summaries predating analyzed_span_start (analyzed_span_start === undefined) keep the
  // original unconditional phrasing, since those two new fields do not exist to check.
  const claimsDayWindow = summary.analyzed_span_start === undefined
    || (summary.window_requested_since != null && !summary.window_widened);
  const windowClause = claimsDayWindow
    ? ` over a ${escapeHtml(summary.analysis_period_days)}-day window`
    : ' (HEAD-anchored window)';
  return `<header class="masthead">
<h1>AI Drift Report</h1>
<p class="masthead-window">${escapeHtml(summary.workflow_type)} &middot; ${escapeHtml(summary.total_commits)} commits analyzed${windowClause}${branchSpread}</p>
${windowLine}
${granularityLine}
${lifecycleLine}
</header>`;
}

/**
 * Render the masthead's project-lifecycle line (code-quality-metrics-31w). Withholding
 * large_commits_pct, sprawling_commits_pct, p90_lines_changed, p90_files_changed and
 * duplication_density_pct leaves most of "Change size and scope" (and duplication) as
 * ungraded values, which is honest but also the point at which a reader asks what the report
 * is still for -- so this states the answer plainly (shape and trend, not a grade) rather than
 * leaving it to be inferred from a screen of ungraded tiles. Returns '' when
 * project_lifecycle is not 'initial-build' (including when the field is absent, for summaries
 * predating this feature), mirroring every other optional masthead line in this file.
 * @param {object} summary
 * @returns {string}
 */
function renderLifecycleLine(summary) {
  if (summary.project_lifecycle !== 'initial-build') return '';
  const text = "This looks like an initial build: the analyzed window includes this repository's own first commit(s). The healthy/critical bands below are quantiles of maintenance-era windows on decades-old codebases and do not transfer to an initial build, so several tiles below show a value with no verdict. This report shows shape and trend for those tiles, not a grade.";
  return `<p class="masthead-lifecycle">${text}</p>`;
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
  const archetypeSuppressed = summary.history_granularity === 'squashed' || summary.history_granularity === 'unknown';
  const bodyText = archetypeSuppressed
    ? 'Archetype suppressed: history is squashed pull requests, not granular commits, so the composite verdict has no valid inputs.'
    : describeArchetypeBody(archetype, catalog);
  const verdictStatus = archetypeSuppressed ? 'neutral' : (ARCHETYPE_STATUS[archetype] || 'neutral');
  // code-quality-metrics-rpw: no separate "<label>: " prefix here. bodyText already names the
  // archetype once on its own -- describeArchetypeBody's ARCHETYPE_RULE_DESCRIPTIONS quotes it
  // inline ('...this toolkit's rule labels that combination "legacy-bottleneck" because...'),
  // archetypeSuppressed's text opens with "Archetype suppressed:", and the "could not be
  // determined" fallback names no archetype at all. A prefix here would repeat whichever of
  // those the label already appears in.
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
  const prShare = signals && typeof signals.pr_reference_share === 'number'
    ? ` (${escapeHtml(formatValue(signals.pr_reference_share * 100))}% of analyzed commit subjects reference a pull request)`
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
 * Render a gauge card: semicircular SVG gauge plus label and value.
 * @param {object} entry
 * @returns {string}
 */
function renderGaugeCard(entry) {
  const bands = gaugeBands(entry);
  const { bandPaths, needleEndpoint, hub } = buildGaugeSvgParts({
    value: entry.value,
    vmax: GAUGE_VMAX,
    bands
  });
  const bandMarkup = bandPaths.map((d, i) => `<path d="${d}" class="gauge-band gauge-${bands[i].status}" />`).join('\n');
  const threshold = describeThreshold(entry);
  const thresholdMarkup = threshold ? `<p class="metric-threshold">${escapeHtml(threshold)}</p>` : '';
  return `<article class="metric-card" data-status="${escapeHtml(entry.status)}">
<svg class="gauge" viewBox="0 0 220 130">
${bandMarkup}
<line x1="${hub.cx}" y1="${hub.cy}" x2="${needleEndpoint.x}" y2="${needleEndpoint.y}" class="gauge-needle" />
<circle cx="${hub.cx}" cy="${hub.cy}" r="${hub.r}" class="gauge-hub" />
</svg>
<p class="metric-value">${escapeHtml(formatValue(entry.value))}</p>
<p class="metric-label">${escapeHtml(entry.label)}</p>
${thresholdMarkup}
${renderTileDescription(entry)}
</article>`;
}

/**
 * Render a plain stat card: monospace number, status chip, label.
 * @param {object} entry
 * @returns {string}
 */
function renderStatCard(entry) {
  const threshold = describeThreshold(entry);
  const thresholdMarkup = threshold ? `<p class="metric-threshold">${escapeHtml(threshold)}</p>` : '';
  return `<article class="metric-card" data-status="${escapeHtml(entry.status)}">
<p class="metric-value">${escapeHtml(formatValue(entry.value))}</p>
<span class="status-chip">${escapeHtml(entry.status)}</span>
<p class="metric-label">${escapeHtml(entry.label)}</p>
${thresholdMarkup}
${renderTileDescription(entry)}
</article>`;
}

/**
 * Render the description shown inside a card, below its threshold statement
 * (or below the label when the entry has no threshold): what the metric
 * measures and how it connects to DORA, sourced from
 * lib/metric-descriptions.js (which traces to metrics-specification.md).
 * Falls back to nothing rendered if a catalog entry somehow has no matching
 * description, rather than throwing, since a missing description should
 * not break the whole report.
 * @param {object} entry
 * @returns {string}
 */
function renderTileDescription(entry) {
  const description = METRIC_DESCRIPTIONS[entry.key];
  if (!description) return '';
  return `<div class="metric-description">
<p class="metric-description-measures">${escapeHtml(description.measures)}</p>
<p class="metric-description-dora">${escapeHtml(description.dora)}</p>
</div>`;
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
 * @param {Array<object>} catalog
 * @returns {string}
 */
function renderMetricGrid(catalog) {
  return METRIC_GROUP_ORDER
    .map(group => catalog.filter(entry => entry.group === group))
    .filter(entries => entries.length > 0)
    .map(entries => {
      const group = entries[0].group;
      const cards = entries.map(entry => (entry.hasGauge ? renderGaugeCard(entry) : renderStatCard(entry))).join('\n');
      return `<section class="metric-category">
<h2 class="metric-category-heading">${escapeHtml(group)}</h2>
<div class="metric-grid">
${cards}
</div>
</section>`;
    })
    .join('\n');
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
<td class="mono">${escapeHtml(commit.total_additions + commit.total_deletions)}</td>
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
 * Build fallback findings bullets from the catalog's top critical/warning
 * entries when no findings narrative was supplied.
 * @param {Array<object>} catalog
 * @returns {string[]}
 */
function fallbackFindings(catalog) {
  return catalog
    .filter(entry => entry.status === 'critical' || entry.status === 'warning')
    .slice(0, 3)
    .map(entry => `${entry.label}: ${formatValue(entry.value)} (${entry.status})`);
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
 * Render the Analysis Scope section: what ANALYSIS_IGNORE_PATTERNS excluded (if anything is
 * configured) and the vendored/generated default share (always, regardless of
 * configuration). A silent exclusion is the same defect class as the silent inclusion
 * code-quality-metrics-y8j fixes, so this has to be visible in the report itself, not only
 * in the summary JSON (code-quality-metrics-3b6).
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
  const branches = summary.branches_analyzed;
  const provenanceLine = renderHistoryProvenanceLine(summary);

  const bullets = [];

  if (exclusions || vendored) {
    bullets.push(exclusions && exclusions.patterns.length > 0
      ? `<li>${escapeHtml(exclusions.excluded_files_count)} file(s), ${escapeHtml(exclusions.excluded_lines_pct)}% of changed lines, excluded by ANALYSIS_IGNORE_PATTERNS: ${escapeHtml(exclusions.patterns.join(', '))}</li>`
      : '<li>No paths are configured for exclusion (ANALYSIS_IGNORE_PATTERNS is empty). Generated or vendored build output in this repository, if any, is still counted in every metric below.</li>');

    if (vendored) {
      bullets.push(`<li>${escapeHtml(vendored.files_count)} file(s), ${escapeHtml(vendored.lines_pct)}% of changed lines, match the existing vendored/generated default patterns (${escapeHtml(vendored.patterns.join(', '))}) -- reported for visibility whether or not ANALYSIS_IGNORE_PATTERNS is configured.</li>`);
    }
  }

  // code-quality-metrics-g39: the branch name list moved here from the masthead.
  // code-quality-metrics-rpw: labelled "Branches considered," not "Branches analyzed" -- this
  // lists every branch considered (branches_analyzed), a different set from the masthead's
  // "across N branches" (branches_with_analyzed_commits, only those that contributed a commit).
  // The old label used the masthead's word for a set the masthead does not count. The "N of M"
  // clause puts both counts side by side, so a thin slice (e.g. 4 of 51) is visible without a
  // reader counting the branch list by hand and cross-referencing the masthead. Guarded on
  // !== undefined (not truthiness) since a real run's count can legitimately be 0. Rendered
  // only when the branch list itself is non-empty, mirroring every other optional bullet here.
  if (branches && branches.length > 0) {
    const contributed = summary.branches_with_analyzed_commits;
    const countClause = contributed !== undefined
      ? ` (${escapeHtml(contributed)} of ${escapeHtml(branches.length)} contributed a commit to the analyzed sample)`
      : '';
    bullets.push(`<li>Branches considered${countClause}: ${branches.map(escapeHtml).join(', ')}</li>`);
  }

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
${renderTopSummary(catalog, summary)}
${renderMetricGrid(catalog)}
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
