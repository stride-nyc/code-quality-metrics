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
 * Meta keys: recognized here, but not part of the CONFIG object this module builds (they are
 * never merged into `effective`). 'lifecycle' is the project_lifecycle operator override
 * (code-quality-metrics-zkhq, GitHub #71 part 1), mirroring the shape of the existing
 * --history CLI override -- which has no .codemetrics.json key of its own, so there is
 * nothing to conflict with here. Recognizing the key here only means it does not trip the
 * "not a recognized override key" guard below when it coexists with a real CONFIG override
 * in the same file; local-code-metrics.js reads the actual value back out of the `sources`
 * this function returns, since `effective` has no field to hold it.
 *
 * Release pattern keys (GitHub #65): opt-in deployment frequency detection. All three are
 * strings (used as RegExp sources) or null to disable. releaseTagPattern selects production
 * release tags; stagingTagPattern excludes staging tags from the production count;
 * releaseCommitSubjectPattern is the commit-subject fallback when no tags match.
 */
const META_KEYS = new Set(['lifecycle', 'releaseTagPattern', 'stagingTagPattern', 'releaseCommitSubjectPattern']);

/**
 * Read and parse one override file, applying its keys onto `effective` in place
 * (mutating the object the caller passed in) and returning the overrides this
 * file itself contributed, or `null` if the file does not exist.
 *
 * `mustExist: true` is what makes an explicit --config path fail loudly instead
 * of silently falling back (code-quality-metrics-ap7): a missing or non-file
 * --config path is an operator error in a scripted run nobody is watching, so
 * it throws rather than degrading to the target's own .codemetrics.json or to
 * defaults. A target-local .codemetrics.json (`mustExist: false`) is allowed to
 * be absent -- that is the normal, unconfigured case.
 *
 * @param {string} filePath
 * @param {object} effective mutated in place with this file's overrides applied
 * @param {{ mustExist: boolean }} opts
 * @returns {Record<string, unknown>|null} this file's own overrides, or null if absent
 */
function applyOverrideFile(filePath, effective, { mustExist }) {
  if (!fs.existsSync(filePath)) {
    if (mustExist) {
      throw new Error(`--config path not found: ${filePath}`);
    }
    return null;
  }

  // Directory check is scoped to the explicit --config route: the implicit
  // target-file route's behavior on a directory (fs.readFileSync throwing
  // EISDIR, wrapped below into "could not be read") is pre-existing and left
  // untouched; --config gets its own clearer message because a scripted run
  // hitting a directory here is an operator error nobody is watching for.
  if (mustExist && fs.statSync(filePath).isDirectory()) {
    throw new Error(`--config path is a directory, not a file: ${filePath}`);
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`${filePath} could not be read: ${err.message}`);
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

  for (const [key, value] of Object.entries(parsed)) {
    if (CLASS_A_KEYS.has(key)) {
      if (!Array.isArray(value)) {
        throw new Error(`${filePath}: '${key}' must be an array (got ${typeof value})`);
      }
      // Union with whatever is already effective (defaults, plus any earlier
      // file's own contribution), not replace: forgetting to restate a default
      // pattern must never silently drop it (code-quality-metrics-wcj), and the
      // same holds when a --config file unions on top of a target file's own
      // patterns (code-quality-metrics-ap7).
      const merged = [...new Set([...effective[key], ...value])];
      effective[key] = merged;
      overrides[key] = merged;
    } else if (CLASS_B_KEYS.has(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${filePath}: '${key}' must be a positive number (got ${JSON.stringify(value)})`);
      }
      effective[key] = value;
      overrides[key] = value;
    } else if (NON_OVERRIDABLE_THRESHOLD_KEYS.has(key)) {
      throw new Error(
        `${filePath}: '${key}' is not overridable. It is one of the bars the calibrated ` +
        `healthy/critical bands were measured against (see lib/thresholds.js); a repo setting ` +
        `its own bar would compare it to a bar it chose. Re-derive against your own reference ` +
        `set via calibration/derive-bands.js instead of overriding this value per repo.`
      );
    } else if (META_KEYS.has(key)) {
      if (key === 'lifecycle' && value !== 'initial-build' && value !== 'established') {
        throw new Error(`${filePath}: 'lifecycle' must be 'initial-build' or 'established' (got ${JSON.stringify(value)})`);
      }
      if (['releaseTagPattern', 'stagingTagPattern', 'releaseCommitSubjectPattern'].includes(key)) {
        if (value !== null && typeof value !== 'string') {
          throw new Error(`${filePath}: '${key}' must be a string (a RegExp source) or null (got ${typeof value})`);
        }
      }
      // Not merged into `effective` -- see META_KEYS' own comment for why. Recorded in
      // `overrides` only, so the caller can read it back out of `sources`.
      overrides[key] = value;
    } else {
      throw new Error(`${filePath}: '${key}' is not a recognized override key. Overridable keys: ${[...CLASS_A_KEYS, ...CLASS_B_KEYS].join(', ')}`);
    }
  }

  return overrides;
}

/**
 * Resolve a repo-local .codemetrics.json, and optionally an explicit --config
 * file, against a set of default values, for the CONFIG keys that may be
 * overridden.
 *
 * PRECEDENCE (highest to lowest), the same shape lib/env.js's loadEnv documents:
 *   1. CLI flags (--since, --days) -- handled by local-code-metrics.js's own
 *      parseCliArgs, not by this module.
 *   2. An explicit --config <path>, resolved as given (code-quality-metrics-ap7)
 *      -- for a scripted run against a repository the operator does not
 *      control, where committing a .codemetrics.json into that repo is not an
 *      option. COMPOSES with tier 3 rather than replacing it: both are applied,
 *      in order, so a target repo's own .codemetrics.json conventions are not
 *      silently dropped just because the operator also passed --config. Array
 *      (class A) keys union across all three tiers for the same reason the
 *      union already holds within one file -- forgetting to restate a pattern
 *      must never silently drop it. A scalar (class B) key from --config wins
 *      over the same key from the target file, since --config is the higher
 *      tier.
 *   3. .codemetrics.json in the analysis target, resolved from targetDir
 *      (normally process.cwd(); overridable here for tests).
 *   4. The `defaults` passed in -- lib/config.js's own CONFIG values.
 * Four tiers only when --config is supplied; three otherwise. loadEnv needs a
 * tool-local .env tier because a secret has to live somewhere outside the repo
 * under analysis; configuration does not, because lib/config.js already is
 * that tier for the no-flag case -- there is nothing this module needs to fall
 * back to beyond the defaults already passed in.
 *
 * A missing or non-file --config path throws rather than silently falling back
 * to the target file or to defaults: in a scripted run nobody is watching it
 * run, so a typo'd path must be loud, not swallowed. A missing target-local
 * .codemetrics.json is not an error -- that is the ordinary unconfigured case.
 *
 * FORMAT: JSON, not JS, for both tiers. A .js file here would mean
 * require()-ing arbitrary code from the repository under analysis, which this
 * tool is routinely pointed at repos the operator does not control -- a
 * code-execution hazard for no benefit. JSON also needs no new dependency, so
 * both GitHub workflows could read the same file unchanged if they chose to
 * (neither does today).
 *
 * Pure: never mutates `defaults`. The caller (local-code-metrics.js) applies
 * the returned `effective` values onto the live, shared CONFIG object every
 * run, which is what keeps repeated invocations in the same process (this
 * project's own test suite included) from compounding one run's override into
 * the next.
 *
 * @param {{ DUPLICATE_IGNORE_PATTERNS: Array<string>, TEST_FILE_PATTERNS: Array<RegExp>, DUPLICATE_MIN_LINES: number, DUPLICATE_MIN_TOKENS: number, ANALYSIS_IGNORE_PATTERNS?: Array<string> }} defaults
 * @param {string} [targetDir] directory to resolve .codemetrics.json from (default process.cwd())
 * @param {string} [explicitConfigPath] an explicit --config <path>, applied on top of targetDir's own .codemetrics.json
 * @returns {{ effective: object, sources: Array<{file: string, overrides: Record<string, unknown>}>, classBOverridden: boolean }}
 */
function resolveConfigOverrides(defaults, targetDir = process.cwd(), explicitConfigPath) {
  const targetFilePath = path.join(targetDir, CONFIG_FILENAME);
  const effective = { ...defaults };
  const sources = [];
  let classBOverridden = false;

  const targetOverrides = applyOverrideFile(targetFilePath, effective, { mustExist: false });
  if (targetOverrides && Object.keys(targetOverrides).length > 0) {
    sources.push({ file: targetFilePath, overrides: targetOverrides });
    if (Object.keys(targetOverrides).some(key => CLASS_B_KEYS.has(key))) classBOverridden = true;
  }

  if (explicitConfigPath) {
    const explicitOverrides = applyOverrideFile(explicitConfigPath, effective, { mustExist: true });
    if (explicitOverrides && Object.keys(explicitOverrides).length > 0) {
      sources.push({ file: explicitConfigPath, overrides: explicitOverrides });
      if (Object.keys(explicitOverrides).some(key => CLASS_B_KEYS.has(key))) classBOverridden = true;
    }
  }

  return { effective, sources, classBOverridden };
}

module.exports = { resolveConfigOverrides, CONFIG_FILENAME, CLASS_A_KEYS, CLASS_B_KEYS, NON_OVERRIDABLE_THRESHOLD_KEYS, META_KEYS };
