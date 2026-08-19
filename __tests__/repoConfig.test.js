'use strict';

// Real fs and real temp directories on purpose, mirroring __tests__/loadEnv.test.js's own
// note: this module's whole job is resolving a file relative to a directory and merging its
// contents, so mocking fs would just test the mock.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveConfigOverrides } = require('../lib/repoConfig');

let tempDirs;

beforeEach(() => {
  tempDirs = [];
});

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Create a fresh temp directory, tracked for cleanup. */
function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const SAMPLE_DEFAULTS = Object.freeze({
  DUPLICATE_IGNORE_PATTERNS: ['**/deps/**', '**/vendor/**'],
  TEST_FILE_PATTERNS: [/\.(test|spec)\./i],
  DUPLICATE_MIN_LINES: 10,
  DUPLICATE_MIN_TOKENS: 100
});

/** Write a .codemetrics.json file containing `contents` (already a JSON-serializable value). */
function writeConfigFile(dir, contents) {
  fs.writeFileSync(path.join(dir, '.codemetrics.json'), JSON.stringify(contents));
}

describe('resolveConfigOverrides — class A (DUPLICATE_IGNORE_PATTERNS, TEST_FILE_PATTERNS) unions with defaults', () => {
  test('adds a repo-local pattern to DUPLICATE_IGNORE_PATTERNS without dropping the defaults', () => {
    const targetDir = makeTempDir('cqm-class-a-');
    writeConfigFile(targetDir, { DUPLICATE_IGNORE_PATTERNS: ['**/designs/**'] });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(result.effective.DUPLICATE_IGNORE_PATTERNS).toEqual(['**/deps/**', '**/vendor/**', '**/designs/**']);
    expect(result.classBOverridden).toBe(false);
    expect(result.sources).toEqual([
      { file: path.join(targetDir, '.codemetrics.json'), overrides: { DUPLICATE_IGNORE_PATTERNS: ['**/deps/**', '**/vendor/**', '**/designs/**'] } }
    ]);
  });

  test('does not duplicate a pattern already present in the defaults', () => {
    const targetDir = makeTempDir('cqm-class-a-dedup-');
    writeConfigFile(targetDir, { DUPLICATE_IGNORE_PATTERNS: ['**/deps/**'] });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(result.effective.DUPLICATE_IGNORE_PATTERNS).toEqual(['**/deps/**', '**/vendor/**']);
  });

  test('rejects a non-array value for a class A key', () => {
    const targetDir = makeTempDir('cqm-class-a-bad-');
    writeConfigFile(targetDir, { DUPLICATE_IGNORE_PATTERNS: '**/designs/**' });

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir)).toThrow(/must be an array/);
  });
});

// code-quality-metrics-3yd: ANALYSIS_IGNORE_PATTERNS is class A too -- it corrects what the
// commit-shape metrics count, not how sensitive a detector is, so the calibrated bands still
// apply to a run that configures it. SAMPLE_DEFAULTS above deliberately omits this key
// (its own real default is empty, and other tests in this file assert exact object shapes
// against SAMPLE_DEFAULTS), so this block extends it locally rather than adding a fifth key
// to every existing assertion in the file.
const SAMPLE_DEFAULTS_WITH_ANALYSIS_IGNORE = Object.freeze({
  ...SAMPLE_DEFAULTS,
  ANALYSIS_IGNORE_PATTERNS: ['**/existing/**']
});

describe('resolveConfigOverrides — ANALYSIS_IGNORE_PATTERNS is class A, unions with defaults', () => {
  test('adds a repo-local pattern to ANALYSIS_IGNORE_PATTERNS without dropping the defaults', () => {
    const targetDir = makeTempDir('cqm-analysis-ignore-');
    writeConfigFile(targetDir, { ANALYSIS_IGNORE_PATTERNS: ['**/bin/**'] });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS_WITH_ANALYSIS_IGNORE, targetDir);

    expect(result.effective.ANALYSIS_IGNORE_PATTERNS).toEqual(['**/existing/**', '**/bin/**']);
    expect(result.classBOverridden).toBe(false);
    expect(result.sources).toEqual([
      { file: path.join(targetDir, '.codemetrics.json'), overrides: { ANALYSIS_IGNORE_PATTERNS: ['**/existing/**', '**/bin/**'] } }
    ]);
  });

  test('does not duplicate a pattern already present in the defaults', () => {
    const targetDir = makeTempDir('cqm-analysis-ignore-dedup-');
    writeConfigFile(targetDir, { ANALYSIS_IGNORE_PATTERNS: ['**/existing/**'] });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS_WITH_ANALYSIS_IGNORE, targetDir);

    expect(result.effective.ANALYSIS_IGNORE_PATTERNS).toEqual(['**/existing/**']);
  });
});

describe('resolveConfigOverrides — class B (DUPLICATE_MIN_LINES, DUPLICATE_MIN_TOKENS) replaces and flags classBOverridden', () => {
  test('replaces DUPLICATE_MIN_LINES and reports classBOverridden true', () => {
    const targetDir = makeTempDir('cqm-class-b-');
    writeConfigFile(targetDir, { DUPLICATE_MIN_LINES: 5 });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(result.effective.DUPLICATE_MIN_LINES).toBe(5);
    expect(result.effective.DUPLICATE_MIN_TOKENS).toBe(100);
    expect(result.classBOverridden).toBe(true);
    expect(result.sources).toEqual([
      { file: path.join(targetDir, '.codemetrics.json'), overrides: { DUPLICATE_MIN_LINES: 5 } }
    ]);
  });

  test('rejects a non-positive value for a class B key', () => {
    const targetDir = makeTempDir('cqm-class-b-bad-');
    writeConfigFile(targetDir, { DUPLICATE_MIN_TOKENS: 0 });

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir)).toThrow(/must be a positive number/);
  });
});

describe('resolveConfigOverrides — rejected keys', () => {
  test('rejects LARGE_COMMIT_THRESHOLD with a message explaining thresholds are not overridable', () => {
    const targetDir = makeTempDir('cqm-threshold-');
    writeConfigFile(targetDir, { LARGE_COMMIT_THRESHOLD: 200 });

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir)).toThrow(/not overridable/);
  });

  test('rejects an unrecognized key', () => {
    const targetDir = makeTempDir('cqm-unknown-key-');
    writeConfigFile(targetDir, { NOT_A_REAL_KEY: true });

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir)).toThrow(/not a recognized override key/);
  });

  test('rejects invalid JSON with the file path in the message', () => {
    const targetDir = makeTempDir('cqm-invalid-json-');
    fs.writeFileSync(path.join(targetDir, '.codemetrics.json'), '{ not valid json');

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir)).toThrow(/is not valid JSON/);
  });
});

// code-quality-metrics-zkhq, GitHub #71 part 1: the project_lifecycle operator override gets
// a .codemetrics.json key too, mirroring --history's own shape. 'lifecycle' is not a CONFIG
// key (it is not merged into `effective`, which stays exactly the CONFIG-shaped object it
// always was) -- it is recognized here only so it does not trip the "not a recognized
// override key" guard when it coexists with a real CONFIG override in the same file. The
// caller (local-code-metrics.js) reads it back out of `sources`.
describe('resolveConfigOverrides — lifecycle (code-quality-metrics-zkhq)', () => {
  test('recognizes a lifecycle key, records it in sources, and does not merge it into effective', () => {
    const targetDir = makeTempDir('cqm-lifecycle-');
    writeConfigFile(targetDir, { lifecycle: 'initial-build' });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(result.effective).toEqual(SAMPLE_DEFAULTS);
    expect(result.sources).toEqual([
      { file: path.join(targetDir, '.codemetrics.json'), overrides: { lifecycle: 'initial-build' } }
    ]);
  });

  test('rejects a lifecycle value other than initial-build or established', () => {
    const targetDir = makeTempDir('cqm-lifecycle-bad-');
    writeConfigFile(targetDir, { lifecycle: 'sortof' });

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir)).toThrow(/must be 'initial-build' or 'established'/);
  });

  // [guard] proves 'lifecycle' coexists with a real CONFIG override in the same file
  // rather than tripping the unrecognized-key guard for either key.
  test('coexists with a class A override in the same file', () => {
    const targetDir = makeTempDir('cqm-lifecycle-coexist-');
    writeConfigFile(targetDir, { lifecycle: 'established', DUPLICATE_IGNORE_PATTERNS: ['**/designs/**'] });

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(result.effective.DUPLICATE_IGNORE_PATTERNS).toEqual(['**/deps/**', '**/vendor/**', '**/designs/**']);
    expect(result.sources[0].overrides.lifecycle).toBe('established');
  });
});

describe('resolveConfigOverrides — purity', () => {
  test('never mutates the defaults object passed in', () => {
    const targetDir = makeTempDir('cqm-purity-');
    writeConfigFile(targetDir, { DUPLICATE_IGNORE_PATTERNS: ['**/designs/**'] });
    const before = JSON.stringify(SAMPLE_DEFAULTS);

    resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(JSON.stringify(SAMPLE_DEFAULTS)).toBe(before);
  });
});

describe('resolveConfigOverrides — no override file present', () => {
  test('returns the given defaults unchanged and empty sources when no .codemetrics.json exists in targetDir', () => {
    const targetDir = makeTempDir('cqm-no-override-');

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir);

    expect(result.effective).toEqual({
      DUPLICATE_IGNORE_PATTERNS: ['**/deps/**', '**/vendor/**'],
      TEST_FILE_PATTERNS: [/\.(test|spec)\./i],
      DUPLICATE_MIN_LINES: 10,
      DUPLICATE_MIN_TOKENS: 100
    });
    expect(result.sources).toEqual([]);
    expect(result.classBOverridden).toBe(false);
  });
});

// code-quality-metrics-ap7: --config <path> lets a scripted run supply an override from
// outside the analysis target, for repositories the operator does not control (cannot
// commit a .codemetrics.json into someone else's repo). The explicit path is passed as a
// third argument, resolved independent of targetDir.
describe('resolveConfigOverrides — explicit config path (code-quality-metrics-ap7)', () => {
  test('applies overrides from an explicit config path when given, independent of targetDir', () => {
    const targetDir = makeTempDir('cqm-explicit-target-'); // no .codemetrics.json here
    const configDir = makeTempDir('cqm-explicit-configdir-');
    const explicitConfigPath = path.join(configDir, 'shared.json');
    fs.writeFileSync(explicitConfigPath, JSON.stringify({ DUPLICATE_MIN_LINES: 5 }));

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir, explicitConfigPath);

    expect(result.effective.DUPLICATE_MIN_LINES).toBe(5);
    expect(result.classBOverridden).toBe(true);
  });

  // GUARD: proven by removing `if (mustExist) throw ...` inside applyOverrideFile's
  // !fs.existsSync branch -- without it, a missing --config path silently returns
  // null and this test starts failing (no throw at all).
  test('throws when an explicit --config path does not exist, rather than silently falling back to targetDir or defaults', () => {
    const targetDir = makeTempDir('cqm-explicit-missing-target-');
    const missingConfigPath = path.join(targetDir, 'does-not-exist.json');

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir, missingConfigPath)).toThrow(/not found/);
  });

  // GUARD: proven by removing the `mustExist &&` guard on the isDirectory check inside
  // applyOverrideFile -- without scoping it to mustExist, or without the check at all,
  // this test either throws for the wrong reason (statSync on an implicit path) or does
  // not throw the clear "is a directory" message at all.
  test('throws a clear message when an explicit --config path is a directory, not a file', () => {
    const targetDir = makeTempDir('cqm-explicit-dir-target-');
    const configAsDir = makeTempDir('cqm-explicit-dir-config-');

    expect(() => resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir, configAsDir)).toThrow(/is a directory, not a file/);
  });

  // GUARD: proven by making resolveConfigOverrides skip the target file's own
  // applyOverrideFile call whenever explicitConfigPath is given (i.e. --config
  // REPLACES the target file instead of composing with it) -- with that mutation,
  // '**/target-only/**' is dropped from the result and this test starts failing.
  // Compose, not replace, is the deliberate design choice (AGENTS.md's "Per-Repo
  // Configuration Overrides": --config is a tier ABOVE the target file, not a
  // substitute for it) -- an operator supplying --config for a scripted run must
  // not silently lose a target repo's own already-committed .codemetrics.json
  // conventions.
  test('composes: a target-local .codemetrics.json and an explicit --config file both apply, unioning their class A patterns', () => {
    const targetDir = makeTempDir('cqm-compose-target-');
    writeConfigFile(targetDir, { DUPLICATE_IGNORE_PATTERNS: ['**/target-only/**'] });
    const configDir = makeTempDir('cqm-compose-configdir-');
    const explicitConfigPath = path.join(configDir, 'shared.json');
    fs.writeFileSync(explicitConfigPath, JSON.stringify({ DUPLICATE_IGNORE_PATTERNS: ['**/config-only/**'] }));

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir, explicitConfigPath);

    expect(result.effective.DUPLICATE_IGNORE_PATTERNS).toEqual(
      expect.arrayContaining(['**/deps/**', '**/vendor/**', '**/target-only/**', '**/config-only/**'])
    );
    expect(result.sources).toHaveLength(2);
  });

  // GUARD: proven by swapping applyOverrideFile's application order in
  // resolveConfigOverrides (explicit file first, target file second) -- with
  // that mutation the target file's DUPLICATE_MIN_LINES applies last and wins,
  // and this test starts failing (asserts 5, receives 7).
  test('a class B value from an explicit --config file wins over the same key set in the target-local file, since --config is the higher tier', () => {
    const targetDir = makeTempDir('cqm-classb-precedence-target-');
    writeConfigFile(targetDir, { DUPLICATE_MIN_LINES: 7 });
    const configDir = makeTempDir('cqm-classb-precedence-configdir-');
    const explicitConfigPath = path.join(configDir, 'shared.json');
    fs.writeFileSync(explicitConfigPath, JSON.stringify({ DUPLICATE_MIN_LINES: 5 }));

    const result = resolveConfigOverrides(SAMPLE_DEFAULTS, targetDir, explicitConfigPath);

    expect(result.effective.DUPLICATE_MIN_LINES).toBe(5);
    expect(result.classBOverridden).toBe(true);
  });
});
