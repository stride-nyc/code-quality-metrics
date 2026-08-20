// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');

// Load .env file if present — allows ANTHROPIC_API_KEY to be set without exporting to the
// shell. Resolved relative to this script's own directory (not process.cwd()), since this
// tool is routinely invoked against another repository's working directory. See
// lib/env.js for the full precedence order.
require('./lib/env').loadEnv(__dirname);

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
 *
 * code-quality-metrics-w3wn: local-code-metrics.js now writes into a .codemetrics/ directory
 * rather than the target repository's root. When dir is that .codemetrics/ directory (the
 * normal case -- see generateReport's own default) and the file is missing there, but a
 * legacy root-level copy sits one directory up (from before this tool moved its output, or
 * from a local-code-metrics.js run against an older tool version), this refuses to read it
 * rather than silently falling back: a stale pre-move file rendering as if it were current
 * data is exactly the kind of confusing failure this project has hit before with a path
 * mismatch masquerading as a stale-file error (see CLAUDE.md's readReportInputs discussion).
 * The operator is told the legacy file exists and pointed at the fix (re-run
 * local-code-metrics.js) rather than left to guess why the report predates their latest work.
 * @param {string} dir
 * @param {string} filename
 * @returns {object}
 */
function readRequiredJson(dir, filename) {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    const legacyPath = path.join(path.dirname(dir), filename);
    if (path.basename(dir) === '.codemetrics' && fs.existsSync(legacyPath)) {
      throw new Error(
        `Missing ${filePath}. Found a legacy ${filename} at ${legacyPath} instead, from before ` +
        'local-code-metrics.js began writing to .codemetrics/. This tool does not read that ' +
        `older location automatically. Re-run "node local-code-metrics.js" to regenerate ${filename} in .codemetrics/.`
      );
    }
    throw new Error(`Missing ${filePath}. Run "node local-code-metrics.js" first to generate it.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Read local_duplicate_analysis.json from dir if it exists, returning
 * undefined otherwise (older local-code-metrics.js runs, or runs that
 * touched no production files, will not have written this file; the
 * report renders unchanged without a Duplicate Code section in that case).
 * @param {string} dir
 * @returns {object|undefined}
 */
function readOptionalDuplicateAnalysis(dir) {
  const filePath = path.join(dir, 'local_duplicate_analysis.json');
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Validate that every commit record read from local_commit_metrics.json carries the
 * counted_additions/counted_deletions fields lib/report.js's topCommits ranks on
 * (code-quality-metrics-2byz). A file written before PR #94 lacks those fields; the
 * comparator's subtraction then evaluates to NaN, and Array.prototype.sort treats NaN as
 * "leave this pair alone", so topCommits silently returns the input order instead of a
 * ranking. Two consumers rely on that ranking without checking it themselves (the Flight
 * Log table and the narrative's example commits), so untrusted disk data is rejected here,
 * at the file-read boundary, rather than inside topCommits itself: that function is a pure
 * helper called from both lib/report-template.js and generate-drift-report.js, and the
 * actual defect is a stale file entering the pipeline, not the ranking logic. Throwing
 * (never falling back to total_additions/total_deletions) matches
 * CONFIG.MAX_COMMITS_SAFETY_LIMIT's own choice to fail loudly rather than silently
 * substitute a different basis than the one requested.
 * @param {Array<object>} metrics
 * @returns {void}
 */
function assertCountedFieldsPresent(metrics) {
  for (const commit of metrics) {
    if (typeof commit.counted_additions !== 'number' || typeof commit.counted_deletions !== 'number') {
      const sha = commit.sha || commit.full_sha || '(unknown sha)';
      throw new Error(
        `local_commit_metrics.json commit ${sha} is missing counted_additions/counted_deletions. ` +
        'This file was written before PR #94 added those fields. Re-run "node local-code-metrics.js" to regenerate it.'
      );
    }
  }
}

/**
 * Read and compute everything generateReport and generateReportWithNarrative
 * both need: the two required JSON inputs, the vendored fonts, and the
 * deterministic metric catalog. Kept in one place so both entry points stay
 * in sync on how inputs are read.
 * @param {string} dir
 * @returns {{ summary: object, metrics: Array<object>, fontData: object, catalog: Array<object>, duplicates: (object|undefined) }}
 */
function readReportInputs(dir) {
  const summary = readRequiredJson(dir, 'local_metrics_summary.json');
  const metrics = readRequiredJson(dir, 'local_commit_metrics.json');
  assertCountedFieldsPresent(metrics);
  const fontData = readFontData();
  const duplicates = readOptionalDuplicateAnalysis(dir);
  const catalog = buildMetricCatalog(summary, duplicates);
  return { summary, metrics, fontData, catalog, duplicates };
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
  const { summary, metrics, fontData, catalog, duplicates } = readReportInputs(dir);
  const html = renderReportHtml({ summary, metrics, catalog, fontData, duplicates });

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
  const { summary, metrics, fontData, catalog, duplicates } = readReportInputs(dir);

  const client = await getAnthropicClient();
  const findings = await generateFindingsNarrative(client, catalog, topCommits(metrics));

  const html = renderReportHtml({ summary, metrics, catalog, fontData, findings, duplicates });

  const outputPath = path.join(dir, 'local_drift_report.html');
  fs.writeFileSync(outputPath, html);
  return outputPath;
}

module.exports = { generateReport, generateReportWithNarrative };

if (require.main === module) {
  // code-quality-metrics-w3wn: local-code-metrics.js's own default output location moved to
  // .codemetrics/ under the analyzed repository's root, so this CLI's own no-argument default
  // must resolve to the same place -- otherwise the write and this later read disagree about
  // where the pipeline's data lives. An explicit directory argument still overrides this
  // entirely (unchanged), for a run whose local-code-metrics.js invocation used --output-dir.
  const targetDir = process.argv[2] || path.join(process.cwd(), '.codemetrics');
  generateReportWithNarrative(targetDir)
    .then(outputPath => console.log(`Wrote ${outputPath}`))
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}
