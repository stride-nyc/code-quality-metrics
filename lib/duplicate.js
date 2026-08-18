// @ts-nocheck
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CONFIG } = require('./config');

const JSCPD_OUTPUT_PREFIX = path.join(os.tmpdir(), 'jscpd-output-');

/**
 * Run jscpd over filePaths and return both the duplicate findings and the
 * report's aggregate statistics. Returns statistics: null (never a zeroed
 * object) for every degenerate case, so callers can distinguish "this layer
 * did not produce a measurement" from "it measured zero duplication."
 * @param {string[]} filePaths
 * @returns {{ findings: Array<object>, statistics: (object|null) }}
 */
function runDuplicateAnalysis(filePaths) {
  if (!filePaths || filePaths.length === 0) return { findings: [], statistics: null };

  const outputDir = fs.mkdtempSync(JSCPD_OUTPUT_PREFIX);
  const reportFile = path.join(outputDir, 'jscpd-report.json');

  try {
    // jscpd's -i/--ignore takes file-level globs. --ignore-pattern, used here before,
    // takes code-level regexes for skipping tokens, so every configured glob was silently
    // inert: on flight-info-spike it left duplication at 16.50 percent, byte for byte the
    // same as passing no ignore at all, where --ignore gives 1.23 percent.
    const ignoreArg = CONFIG.DUPLICATE_IGNORE_PATTERNS.length > 0
      ? `--ignore "${CONFIG.DUPLICATE_IGNORE_PATTERNS.join(',')}"` : '';

    const cmd = [
      'npx jscpd',
      `--min-lines ${CONFIG.DUPLICATE_MIN_LINES}`,
      `--min-tokens ${CONFIG.DUPLICATE_MIN_TOKENS}`,
      ignoreArg,
      '--reporters json',
      `--output "${outputDir}"`,
      ...filePaths.map(f => `"${f}"`)
    ].filter(Boolean).join(' ');

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch {
      return { findings: [], statistics: null };
    }

    if (!fs.existsSync(reportFile)) return { findings: [], statistics: null };

    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const findings = (report.duplicates || []).map(d => ({
      firstFile:  d.firstFile,
      secondFile: d.secondFile,
      lines:  d.lines,
      tokens: d.tokens
    }));
    const statistics = (report.statistics && report.statistics.total) ? report.statistics.total : null;

    return { findings, statistics };
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

/**
 * Thin wrapper over runDuplicateAnalysis kept for existing callers
 * (pr-metrics.yml, and any other consumer expecting the plain findings
 * array) that only need the duplicate findings, not the aggregate
 * statistics.
 * @param {string[]} filePaths
 * @returns {Array<object>}
 */
function runDuplicateCheck(filePaths) {
  return runDuplicateAnalysis(filePaths).findings;
}

const JS_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);
const IMPORT_RE = /(?:require|import)\s*\(\s*['"](\.[^'"]+)['"]\s*\)|import\s+.*?from\s+['"](\.[^'"]+)['"]/g;

function resolveModuleNeighbors(filePaths) {
  const neighbors = new Set();

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    neighbors.add(filePath);

    if (!JS_EXTENSIONS.has(path.extname(filePath))) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const dir = path.dirname(filePath);
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      let resolved = path.resolve(dir, importPath);
      if (!path.extname(resolved)) resolved += '.js';
      neighbors.add(resolved);
    }
  }

  return [...neighbors];
}

module.exports = { runDuplicateCheck, runDuplicateAnalysis, resolveModuleNeighbors };
