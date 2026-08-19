'use strict';

const { CONFIG } = require('../lib/config');
const { isExcludedPath } = require('../lib/metrics');

// code-quality-metrics-1tp: isExcludedPath is the mechanism that lets a path count as
// NEITHER test nor production (isTestFile can only sort a file into one bucket or the
// other; it cannot say "neither", which is the whole defect in code-quality-metrics-y8j).
//
// Every exclusion test here configures a real pattern and asserts a matching file was
// excluded, then asserts a sibling, unmatched file was not -- an empty-pattern-list test
// alone would be a vacuous green (the ignore-list-is-empty trap this project has hit before).
describe('isExcludedPath', () => {
  // --- degenerate/zero case: establishes the API and the empty-default behavior ---
  test('returns false for any file when ANALYSIS_IGNORE_PATTERNS is empty (default)', () => {
    expect(CONFIG.ANALYSIS_IGNORE_PATTERNS).toEqual([]);
    expect(isExcludedPath('bin/Debug/App.dll')).toBe(false);
    expect(isExcludedPath('src/app.js')).toBe(false);
  });

  describe('with a configured pattern', () => {
    let original;

    beforeEach(() => {
      original = CONFIG.ANALYSIS_IGNORE_PATTERNS;
      CONFIG.ANALYSIS_IGNORE_PATTERNS = ['**/bin/**', '**/obj/**'];
    });

    afterEach(() => {
      CONFIG.ANALYSIS_IGNORE_PATTERNS = original;
    });

    // --- the real RED: a no-op stub cannot satisfy this ---
    test('returns true for a file matching a configured pattern', () => {
      expect(isExcludedPath('bin/Debug/App.dll')).toBe(true);
    });

    test('returns false for a sibling file that does not match any configured pattern', () => {
      expect(isExcludedPath('src/app.js')).toBe(false);
    });

    test('returns true for a nested match under a matched directory', () => {
      expect(isExcludedPath('MyProject/obj/Release/net8.0/App.dll')).toBe(true);
    });
  });
});
