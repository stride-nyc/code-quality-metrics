// @ts-nocheck
'use strict';

const { buildGaugeSvgParts, topCommits } = require('./report');

/** All five gauge metrics in the catalog are percentages, so the gauge
 * always spans 0-100. */
const GAUGE_VMAX = 100;

/**
 * Derive the three good/warning/critical gauge bands from an entry's
 * healthy/critical boundaries, honoring its direction.
 * @param {object} entry
 * @returns {Array<{ start: number, end: number, status: string }>}
 */
function gaugeBands(entry) {
  const { healthyBoundary, criticalBoundary, direction } = entry;
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

/** @type {Record<string, string>} */
const ARCHETYPE_VERDICTS = {
  'harmonious-high-achiever': 'All key drift signals are within healthy range.',
  'legacy-bottleneck': 'High sprawl and large-commit rates point to legacy-bottleneck patterns.',
  'foundational-challenges': 'Elevated large-commit and coverage-gap signals point to foundational challenges.',
  'mixed-signals': 'No single archetype dominates; signals are mixed.'
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
 * Render the masthead: repo/window/commit-count context plus a verdict line.
 * @param {object} summary
 * @returns {string}
 */
function renderMasthead(summary) {
  const branches = (summary.branches_analyzed || []).map(escapeHtml).join(', ');
  const archetype = summary.dora_archetype;
  const verdictText = ARCHETYPE_VERDICTS[archetype] || 'No archetype could be determined from the current signals.';
  return `<header class="masthead">
<h1>AI Drift Report</h1>
<p class="masthead-scope">${escapeHtml(summary.workflow_type)} &middot; ${branches}</p>
<p class="masthead-window">${escapeHtml(summary.total_commits)} commits analyzed over a ${escapeHtml(summary.analysis_period_days)}-day window</p>
<p class="verdict">${escapeHtml(archetype)}: ${escapeHtml(verdictText)}</p>
</header>`;
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
  return `<article class="metric-card" data-status="${escapeHtml(entry.status)}">
<svg class="gauge" viewBox="0 0 220 130">
${bandMarkup}
<line x1="${hub.cx}" y1="${hub.cy}" x2="${needleEndpoint.x}" y2="${needleEndpoint.y}" class="gauge-needle" />
<circle cx="${hub.cx}" cy="${hub.cy}" r="${hub.r}" class="gauge-hub" />
</svg>
<p class="metric-value">${escapeHtml(entry.value)}</p>
<p class="metric-label">${escapeHtml(entry.label)}</p>
</article>`;
}

/**
 * Render a plain stat card: monospace number, status chip, label.
 * @param {object} entry
 * @returns {string}
 */
function renderStatCard(entry) {
  return `<article class="metric-card" data-status="${escapeHtml(entry.status)}">
<p class="metric-value">${escapeHtml(entry.value)}</p>
<span class="status-chip">${escapeHtml(entry.status)}</span>
<p class="metric-label">${escapeHtml(entry.label)}</p>
</article>`;
}

function renderMetricGrid(catalog) {
  const cards = catalog.map(entry => (entry.hasGauge ? renderGaugeCard(entry) : renderStatCard(entry))).join('\n');
  return `<section class="metric-grid">
${cards}
</section>`;
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
    .map(entry => `${entry.label}: ${entry.value} (${entry.status})`);
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
function renderReportHtml({ summary, metrics, catalog, fontData, findings }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI Drift Report</title>
<style>
${renderFontFaces(fontData)}
${DESIGN_TOKENS_CSS}
</style>
</head>
<body>
${renderMasthead(summary)}
${renderMetricGrid(catalog)}
${renderFlightLog(metrics)}
${renderFindings(findings, catalog)}
${renderFooter(summary)}
</body>
</html>`;
}

module.exports = { renderReportHtml, fallbackFindings };
