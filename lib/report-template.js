// @ts-nocheck
'use strict';

const { buildGaugeSvgParts, topCommits, METRIC_GROUP_ORDER } = require('./report');
const { METRIC_DESCRIPTIONS } = require('./metric-descriptions');

/** All five gauge metrics in the catalog are percentages, so the gauge
 * always spans 0-100. */
const GAUGE_VMAX = 100;

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

/** @type {Record<string, string>} */
const ARCHETYPE_VERDICTS = {
  'harmonious-high-achiever': 'All key drift signals are within healthy range.',
  'legacy-bottleneck': 'High sprawl and large-commit rates point to legacy-bottleneck patterns.',
  'foundational-challenges': 'An elevated large-commit rate alone points to foundational challenges.',
  'mixed-signals': 'No single archetype dominates; signals are mixed.'
};

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
.masthead-scope, .masthead-window {
  font-family: 'Plex Mono', monospace;
  color: var(--ink-muted);
  margin: 2px 0;
}
.verdict {
  margin-top: 10px;
  padding: 8px 14px;
  border-radius: 6px;
  background: var(--surface-2);
  display: inline-block;
}
.verdict[data-status="good"] { background: var(--good-soft); color: var(--good); }
.verdict[data-status="warning"] { background: var(--warn-soft); color: var(--warn); }
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
 * Render the masthead: repo/window/commit-count context plus a verdict line.
 * @param {object} summary
 * @returns {string}
 */
function renderMasthead(summary) {
  const branches = (summary.branches_analyzed || []).map(escapeHtml).join(', ');
  const archetype = summary.dora_archetype;
  // The archetype is a composite of the commit-unit metrics lib/report.js's buildMetricCatalog
  // withholds under squashed/unknown history, so it is suppressed entirely rather than shown
  // without a verdict (code-quality-metrics-bnq requirement #5) -- collectLocalMetrics.js never
  // computes dora_archetype in that case, so archetype is undefined here, not a real value.
  const archetypeSuppressed = summary.history_granularity === 'squashed' || summary.history_granularity === 'unknown';
  const verdictText = archetypeSuppressed
    ? 'Archetype suppressed: history is squashed pull requests, not granular commits, so the composite verdict has no valid inputs.'
    : (ARCHETYPE_VERDICTS[archetype] || 'No archetype could be determined from the current signals.');
  const verdictStatus = archetypeSuppressed ? 'neutral' : (ARCHETYPE_STATUS[archetype] || 'neutral');
  // archetypeSuppressed's verdictText already opens with "Archetype suppressed:", so no
  // separate label prefix is added here -- a label of "suppressed" would double the word.
  const verdictLabel = archetypeSuppressed ? null : archetype;
  const verdictLine = verdictLabel ? `${escapeHtml(verdictLabel)}: ${escapeHtml(verdictText)}` : escapeHtml(verdictText);
  const granularityLine = renderGranularityLine(summary);
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
<p class="masthead-scope">${escapeHtml(summary.workflow_type)} &middot; ${branches}</p>
<p class="masthead-window">${escapeHtml(summary.total_commits)} commits analyzed${windowClause}${branchSpread}</p>
${windowLine}
${granularityLine}
<p class="verdict" data-status="${escapeHtml(verdictStatus)}">${verdictLine}</p>
</header>`;
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
 * Render the masthead's history-granularity line: the value driving the
 * withholding decision, and the heuristic's own confidence, so a reader can
 * see the basis for every withheld verdict elsewhere on the page
 * (code-quality-metrics-bnq requirement #1). When a human supplied
 * --history, that value is what drives withholding (summary.history_granularity),
 * but the line also names what detection itself found
 * (summary.history_granularity_detected), so a reader can tell a heuristic
 * result from an assertion (requirement #2's override note).
 * @param {object} summary
 * @returns {string}
 */
function renderGranularityLine(summary) {
  const granularity = summary.history_granularity;
  if (!granularity) return '';
  const base = `History: ${escapeHtml(granularity)} (${escapeHtml(summary.history_granularity_confidence)} confidence)`;
  const text = summary.history_granularity_override
    ? `${base}, overridden by --history (detection itself found ${escapeHtml(summary.history_granularity_detected)})`
    : base;
  return `<p class="masthead-granularity">${text}</p>`;
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
<h2>Findings</h2>
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
  if (!exclusions && !vendored) return '';

  const exclusionLine = exclusions && exclusions.patterns.length > 0
    ? `<li>${escapeHtml(exclusions.excluded_files_count)} file(s), ${escapeHtml(exclusions.excluded_lines_pct)}% of changed lines, excluded by ANALYSIS_IGNORE_PATTERNS: ${escapeHtml(exclusions.patterns.join(', '))}</li>`
    : '<li>No paths are configured for exclusion (ANALYSIS_IGNORE_PATTERNS is empty). Generated or vendored build output in this repository, if any, is still counted in every metric below.</li>';

  const vendoredLine = vendored
    ? `<li>${escapeHtml(vendored.files_count)} file(s), ${escapeHtml(vendored.lines_pct)}% of changed lines, match the existing vendored/generated default patterns (${escapeHtml(vendored.patterns.join(', '))}) -- reported for visibility whether or not ANALYSIS_IGNORE_PATTERNS is configured.</li>`
    : '';

  return `<section class="analysis-scope">
<h2>Analysis Scope</h2>
<ul>
${exclusionLine}
${vendoredLine}
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
${renderExclusionsSection(summary)}
${renderMetricGrid(catalog)}
${renderFlightLog(metrics)}
${renderDuplicateSection(duplicates)}
${renderFindings(findings, catalog)}
${renderFooter(summary)}
</body>
</html>`;
}

module.exports = { renderReportHtml, fallbackFindings, formatValue };
