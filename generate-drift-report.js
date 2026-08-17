// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');

const { buildMetricCatalog } = require('./lib/report');
const { renderReportHtml } = require('./lib/report-template');

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
 * Generate local_drift_report.html in dir from local_metrics_summary.json
 * and local_commit_metrics.json.
 * @param {string} [dir]
 * @returns {string} the path of the written HTML file
 */
function generateReport(dir = process.cwd()) {
  const summary = readRequiredJson(dir, 'local_metrics_summary.json');
  const metrics = readRequiredJson(dir, 'local_commit_metrics.json');

  const fontData = readFontData();
  const catalog = buildMetricCatalog(summary);
  const html = renderReportHtml({ summary, metrics, catalog, fontData });

  const outputPath = path.join(dir, 'local_drift_report.html');
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport };

if (require.main === module) {
  const targetDir = process.argv[2] || process.cwd();
  try {
    const outputPath = generateReport(targetDir);
    console.log(`Wrote ${outputPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
