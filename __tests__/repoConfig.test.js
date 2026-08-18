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
