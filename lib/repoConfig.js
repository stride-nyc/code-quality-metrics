// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');

/** Filename of the repo-local override file, resolved from the analysis target's cwd. */
const CONFIG_FILENAME = '.codemetrics.json';

/**
 * Class A: corrects what a measurement counts, not how sensitive detection is.
 * Bands remain applicable to a run overriding one of these. Array-valued;
 * UNIONS with the default rather than replacing it (code-quality-metrics-wcj: a
 * team adding one vendored directory should not have to restate the defaults
 * to keep them -- forgetting one would silently inflate its own duplication
 * number).
 *
 * ANALYSIS_IGNORE_PATTERNS (code-quality-metrics-3yd) is class A for the same reason:
 * excluding a path from the commit-shape metrics changes what large_commit,
 * sprawling_commit, and the rest count, not how sensitively any detector runs, so the
 * calibrated bands still apply to a run that configures it.
 */
const CLASS_A_KEYS = new Set(['DUPLICATE_IGNORE_PATTERNS', 'TEST_FILE_PATTERNS', 'ANALYSIS_IGNORE_PATTERNS']);

/**
 * Class B: detector sensitivity. Wagner et al. (SANER 2016) measured roughly a
 * threefold difference in reported duplication on the same three systems at
 * DUPLICATE_MIN_LINES/TOKENS 5/50 versus 10/100, so a percentage measured at an
 * overridden sensitivity is not comparable to a band derived at the default
 * sensitivity. Overriding either key here is still applied to detection, but
 * the caller must withhold the duplication verdict when classBOverridden comes
 * back true -- see lib/report.js's use of summary.config_sources.
 */
const CLASS_B_KEYS = new Set(['DUPLICATE_MIN_LINES', 'DUPLICATE_MIN_TOKENS']);

/**
 * Named explicitly, not just omitted, so an attempt to override one of these
 * fails with a message that says why rather than the generic "unknown key" a
 * typo would get. They are the bars the six-repository reference set was
 * measured against (lib/thresholds.js); a repo setting its own bar is the
 * exact circularity calibration/derive-bands.js exists to escape
 * (code-quality-metrics-wcj's recorded design).
 */
const NON_OVERRIDABLE_THRESHOLD_KEYS = new Set(['LARGE_COMMIT_THRESHOLD', 'SPRAWLING_COMMIT_THRESHOLD']);

/**
 * Resolve a repo-local .codemetrics.json against a set of default values, for
 * the four CONFIG keys that may be overridden.
 *
 * PRECEDENCE (highest to lowest), the same shape lib/env.js's loadEnv documents:
 *   1. CLI flags (--since, --days) -- handled by local-code-metrics.js's own
 *      parseCliArgs, not by this module.
 *   2. .codemetrics.json in the analysis target, resolved from targetDir
 *      (normally process.cwd(); overridable here for tests).
 *   3. The `defaults` passed in -- lib/config.js's own CONFIG values.
 * Three tiers, not four: loadEnv needs a tool-local .env tier because a secret
 * has to live somewhere outside the repo under analysis; configuration does
 * not, because lib/config.js already is that tier -- there is nothing this
 * module needs to fall back to beyond the defaults already passed in.
 *
 * FORMAT: JSON, not JS. A .js file here would mean require()-ing arbitrary
 * code from the repository under analysis, which this tool is routinely
 * pointed at repos the operator does not control -- a code-execution hazard
 * for no benefit. JSON also needs no new dependency, so both GitHub workflows
 * could read the same file unchanged if they chose to (neither does today).
 *
 * Pure: never mutates `defaults`. The caller (local-code-metrics.js) applies
 * the returned `effective` values onto the live, shared CONFIG object every
 * run, which is what keeps repeated invocations in the same process (this
 * project's own test suite included) from compounding one run's override into
 * the next.
 *
 * @param {{ DUPLICATE_IGNORE_PATTERNS: Array<string>, TEST_FILE_PATTERNS: Array<RegExp>, DUPLICATE_MIN_LINES: number, DUPLICATE_MIN_TOKENS: number, ANALYSIS_IGNORE_PATTERNS?: Array<string> }} defaults
 * @param {string} [targetDir] directory to resolve .codemetrics.json from (default process.cwd())
 * @returns {{ effective: object, sources: Array<{file: string, overrides: Record<string, unknown>}>, classBOverridden: boolean }}
 */
function resolveConfigOverrides(defaults, targetDir = process.cwd()) {
  const filePath = path.join(targetDir, CONFIG_FILENAME);
  const effective = { ...defaults };

  if (!fs.existsSync(filePath)) {
    return { effective, sources: [], classBOverridden: false };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`${CONFIG_FILENAME} could not be read at ${filePath}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${filePath} is not valid JSON: ${err.message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object of CONFIG key overrides`);
  }

  const overrides = {};
  let classBOverridden = false;

  for (const [key, value] of Object.entries(parsed)) {
    if (CLASS_A_KEYS.has(key)) {
      if (!Array.isArray(value)) {
        throw new Error(`${filePath}: '${key}' must be an array (got ${typeof value})`);
      }
      // Union with the default, not replace: forgetting to restate a default
      // pattern must never silently drop it (code-quality-metrics-wcj).
      const merged = [...new Set([...effective[key], ...value])];
      effective[key] = merged;
      overrides[key] = merged;
    } else if (CLASS_B_KEYS.has(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${filePath}: '${key}' must be a positive number (got ${JSON.stringify(value)})`);
      }
      effective[key] = value;
      overrides[key] = value;
      classBOverridden = true;
    } else if (NON_OVERRIDABLE_THRESHOLD_KEYS.has(key)) {
      throw new Error(
        `${filePath}: '${key}' is not overridable. It is one of the bars the calibrated ` +
        `healthy/critical bands were measured against (see lib/thresholds.js); a repo setting ` +
        `its own bar would compare it to a bar it chose. Re-derive against your own reference ` +
        `set via calibration/derive-bands.js instead of overriding this value per repo.`
      );
    } else {
      throw new Error(`${filePath}: '${key}' is not a recognized override key. Overridable keys: ${[...CLASS_A_KEYS, ...CLASS_B_KEYS].join(', ')}`);
    }
  }

  return {
    effective,
    sources: Object.keys(overrides).length > 0 ? [{ file: filePath, overrides }] : [],
    classBOverridden
  };
}

module.exports = { resolveConfigOverrides, CONFIG_FILENAME, CLASS_A_KEYS, CLASS_B_KEYS, NON_OVERRIDABLE_THRESHOLD_KEYS };
