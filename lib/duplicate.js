// @ts-nocheck
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CONFIG } = require('./config');

const JSCPD_OUTPUT_PREFIX = path.join(os.tmpdir(), 'jscpd-output-');

/**
 * Run a single jscpd pass over filePaths at the given min-lines/min-tokens and return the
 * findings plus the report's aggregate statistics. Returns statistics: null (never a zeroed
 * object) for every degenerate case, so callers can distinguish "this pass did not produce a
 * measurement" from "it measured zero duplication."
 * @param {string[]} filePaths
 * @param {number} minLines
 * @param {number} minTokens
 * @returns {{ findings: Array<object>, statistics: (object|null) }}
 */
function runJscpdPass(filePaths, minLines, minTokens) {
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
      `--min-lines ${minLines}`,
      `--min-tokens ${minTokens}`,
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
 * Run jscpd over filePaths at the configured detector sensitivity and return both the
 * duplicate findings and the report's aggregate statistics (code-quality-metrics-tjn).
 *
 * jscpd does not recognize every language (Elixir's .ex/.exs among them, verified live
 * against remote_retro): when none of the given files' languages are recognized, it still
 * exits 0 and writes a report shaped exactly like a real "0% duplication, nothing to flag"
 * measurement (statistics.total.sources: 0, percentage: 0). Passing that through unchanged
 * would report a language jscpd cannot parse as a confidently healthy 0%.
 *
 * `statistics.sources === 0` alone does not distinguish "unsupported language" from "every
 * scanned file happens to fall under the configured min-lines/min-tokens floor" -- both
 * produce the identical zeroed report (verified: a 1-line supported-language file and a
 * 30-line unsupported-language file both report sources: 0 at the default 10/100 floor). A
 * second, cheap probe pass with min-lines/min-tokens relaxed to 1 tells them apart without
 * this project maintaining its own copy of jscpd's ~223-language support list: a genuinely
 * supported language registers at least one source at that floor; an unsupported one still
 * won't (verified: two 30-line, obviously-duplicated .ex files still report sources: 0 even
 * at 1/1). The probe only runs when the real scan already came back at zero sources, so a
 * normal successful scan costs exactly one jscpd invocation, as before.
 * @param {string[]} filePaths
 * @returns {{ findings: Array<object>, statistics: (object|null), unsupportedExtensions?: string[] }}
 */
function runDuplicateAnalysis(filePaths) {
  if (!filePaths || filePaths.length === 0) return { findings: [], statistics: null };

  const primary = runJscpdPass(filePaths, CONFIG.DUPLICATE_MIN_LINES, CONFIG.DUPLICATE_MIN_TOKENS);

  if (primary.statistics && primary.statistics.sources === 0) {
    const probe = runJscpdPass(filePaths, 1, 1);
    if (!probe.statistics || probe.statistics.sources === 0) {
      const unsupportedExtensions = [...new Set(
        filePaths.map(f => path.extname(f) || '(no extension)')
      )].sort();
      return { findings: [], statistics: null, unsupportedExtensions };
    }
  }

  return primary;
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

/**
 * Normalizes a path to a form relative to `root` regardless of whether it was already
 * relative or already absolute. Every path entering the neighbor set goes through this
 * so the same real file always produces the same string, whichever form it arrived in
 * (code-quality-metrics-34fu): without it, a file passed in directly under its original
 * relative spelling and reached again as a resolved import target (always absolute,
 * since path.resolve() returns one) entered the Set twice under two different strings,
 * and was later paired with itself by the semantic-duplicate layer.
 * @param {string} candidatePath
 * @param {string} root
 * @returns {string}
 */
function toRepoRelative(candidatePath, root) {
  return path.relative(root, path.resolve(root, candidatePath));
}

/**
 * @param {string[]} filePaths
 * @param {string} [root] - base every candidate path is normalized relative to;
 *   defaults to process.cwd(), which is the analyzed repository's root in every
 *   real caller (local-code-metrics.js, pr-metrics.yml both run from there).
 */
function resolveModuleNeighbors(filePaths, root = process.cwd()) {
  const neighbors = new Set();

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    neighbors.add(toRepoRelative(filePath, root));

    if (!JS_EXTENSIONS.has(path.extname(filePath))) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const dir = path.dirname(filePath);
    let match;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      let resolved = path.resolve(dir, importPath);
      if (!path.extname(resolved)) resolved += '.js';
      neighbors.add(toRepoRelative(resolved, root));
    }
  }

  return [...neighbors];
}

module.exports = { runDuplicateCheck, runDuplicateAnalysis, resolveModuleNeighbors };
