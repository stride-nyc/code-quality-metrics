'use strict';

const { looksLikeTestPath } = require('../lib/metrics');

describe('looksLikeTestPath', () => {
  // --- paths that SHOULD flag (test-segment present, isTestFile missed them) ---
  test('flags src/test/utils.js -- test as a directory segment', () => {
    expect(looksLikeTestPath('src/test/utils.js')).toBe(true);
  });

  test('flags src/tests/utils.js -- tests as a directory segment', () => {
    expect(looksLikeTestPath('src/tests/utils.js')).toBe(true);
  });

  test('flags src/spec/utils.js -- spec as a directory segment', () => {
    expect(looksLikeTestPath('src/spec/utils.js')).toBe(true);
  });

  test('flags src/specs/utils.js -- specs as a directory segment', () => {
    expect(looksLikeTestPath('src/specs/utils.js')).toBe(true);
  });

  test('flags src/__tests__/utils.js -- __tests__ as a directory segment', () => {
    expect(looksLikeTestPath('src/__tests__/utils.js')).toBe(true);
  });

  test('flags test/utils.js -- test at repo root', () => {
    expect(looksLikeTestPath('test/utils.js')).toBe(true);
  });

  test('flags deep/nested/test/utils.js -- test segment not at root', () => {
    expect(looksLikeTestPath('deep/nested/test/utils.js')).toBe(true);
  });

  test('is case-insensitive: TEST/utils.js', () => {
    expect(looksLikeTestPath('TEST/utils.js')).toBe(true);
  });

  // --- paths that should NOT flag ---
  test('does not flag src/app.js -- plain production file', () => {
    expect(looksLikeTestPath('src/app.js')).toBe(false);
  });

  test('does not flag src/contest/rules.js -- "contest" contains "test" but is not a segment', () => {
    expect(looksLikeTestPath('src/contest/rules.js')).toBe(false);
  });

  test('does not flag src/latest/app.js -- "latest" contains "test" but is not a segment', () => {
    expect(looksLikeTestPath('src/latest/app.js')).toBe(false);
  });

  test('does not flag src/app.test.js -- already caught by isTestFile, but looksLikeTestPath checks segments only', () => {
    // app.test.js has no test/ segment -- the .test. is in the filename, not a path segment
    expect(looksLikeTestPath('src/app.test.js')).toBe(false);
  });
});
