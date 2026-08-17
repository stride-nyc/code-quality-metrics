// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');

const { buildMetricCatalog, topCommits } = require('./lib/report');
const { renderReportHtml } = require('./lib/report-template');
const { getAnthropicClient } = require('./lib/claude');
const { generateFindingsNarrative } = require('./lib/narrative');

/** Vendored font files, keyed by basename (without extension). */
const FONT_FILES = [
  'big-shoulders-display-800',
  'public-sans-400',
  'public-sans-600',
  'public-sans-700',
  'ibm-plex-mono-400',
  'ibm-plex-mono-600'
];

/**
 * Read and base64-encode the vendored fonts from assets/fonts/, resolved
 * relative to this script's own location (the fonts live in this repo
 * regardless of which repo's output is being reported on).
 * @returns {object}
 */
function readFontData() {
  const fontsDir = path.join(__dirname, 'assets', 'fonts');
  const fontData = {};
  for (const name of FONT_FILES) {
    const filePath = path.join(fontsDir, `${name}.woff2`);
    fontData[name] = fs.readFileSync(filePath).toString('base64');
  }
  return fontData;
}

/**
 * Read a required JSON input file from dir, throwing a clear error if missing.
 * @param {string} dir
 * @param {string} filename
 * @returns {object}
 */
function readRequiredJson(dir, filename) {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Run "node local-code-metrics.js" first to generate it.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Read and compute everything generateReport and generateReportWithNarrative
 * both need: the two required JSON inputs, the vendored fonts, and the
 * deterministic metric catalog. Kept in one place so both entry points stay
 * in sync on how inputs are read.
 * @param {string} dir
 * @returns {{ summary: object, metrics: Array<object>, fontData: object, catalog: Array<object> }}
 */
function readReportInputs(dir) {
  const summary = readRequiredJson(dir, 'local_metrics_summary.json');
  const metrics = readRequiredJson(dir, 'local_commit_metrics.json');
  const fontData = readFontData();
  const catalog = buildMetricCatalog(summary);
  return { summary, metrics, fontData, catalog };
}

/**
 * Generate local_drift_report.html in dir from local_metrics_summary.json
 * and local_commit_metrics.json. The Findings section uses the plain
 * templated fallback bullets; see generateReportWithNarrative for the
 * variant that can optionally enhance it with an LLM-generated narrative.
 * @param {string} [dir]
 * @returns {string} the path of the written HTML file
 */
function generateReport(dir = process.cwd()) {
  const { summary, metrics, fontData, catalog } = readReportInputs(dir);
  const html = renderReportHtml({ summary, metrics, catalog, fontData });

  const outputPath = path.join(dir, 'local_drift_report.html');
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

/**
 * Generate local_drift_report.html in dir, additionally attempting an
 * optional LLM-generated Findings narrative (see lib/narrative.js). Every
 * number in the report still comes only from the deterministic catalog
 * built here; the narrative call may only add connecting prose over those
 * already-computed values. When ANTHROPIC_API_KEY is not set, or the API
 * call fails for any reason, this produces output identical to
 * generateReport, since generateFindingsNarrative falls back to the same
 * deterministic bullets in both cases.
 * @param {string} [dir]
 * @returns {Promise<string>} the path of the written HTML file
 */
async function generateReportWithNarrative(dir = process.cwd()) {
  const { summary, metrics, fontData, catalog } = readReportInputs(dir);

  const client = await getAnthropicClient();
  const findings = await generateFindingsNarrative(client, catalog, topCommits(metrics));

  const html = renderReportHtml({ summary, metrics, catalog, fontData, findings });

  const outputPath = path.join(dir, 'local_drift_report.html');
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport, generateReportWithNarrative };

if (require.main === module) {
  const targetDir = process.argv[2] || process.cwd();
  generateReportWithNarrative(targetDir)
    .then(outputPath => console.log(`Wrote ${outputPath}`))
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
