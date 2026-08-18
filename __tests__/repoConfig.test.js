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
