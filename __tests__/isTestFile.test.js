'use strict';

const { isTestFile } = require('../local-code-metrics');

// isTestFile must also be available directly from lib/metrics (for workflow require() calls)
describe('isTestFile available from lib/metrics', () => {
  test('isTestFile is exported from lib/metrics.js', () => {
    const { isTestFile: isTestFileFromMetrics } = require('../lib/metrics');
    expect(typeof isTestFileFromMetrics).toBe('function');
  });

  test('isTestFile from lib/metrics behaves identically to the one from local-code-metrics', () => {
    const { isTestFile: isTestFileFromMetrics } = require('../lib/metrics');
    expect(isTestFileFromMetrics('src/app.test.js')).toBe(true);
    expect(isTestFileFromMetrics('src/app.js')).toBe(false);
  });
});

describe('isTestFile', () => {
  // --- degenerate case ---
  test('returns false for a plain production source file', () => {
    expect(isTestFile('src/app.js')).toBe(false);
  });

  // --- each TEST_FILE_PATTERN matched ---
  test('matches .test. pattern (JavaScript/TypeScript)', () => {
    expect(isTestFile('src/utils.test.js')).toBe(true);
  });

  test('matches .spec. pattern', () => {
    expect(isTestFile('src/utils.spec.ts')).toBe(true);
  });

  test('matches C# Tests suffix (FileTests.cs)', () => {
    expect(isTestFile('MyServiceTests.cs')).toBe(true);
  });

  test('matches C# Test suffix (FileTest.cs)', () => {
    expect(isTestFile('MyServiceTest.cs')).toBe(true);
  });

  test('matches Java Test suffix (FileTest.java)', () => {
    expect(isTestFile('UserRepositoryTest.java')).toBe(true);
  });

  test('matches Python _test.py suffix', () => {
    expect(isTestFile('auth_test.py')).toBe(true);
  });

  test('matches Python test_.py prefix', () => {
    expect(isTestFile('test_auth.py')).toBe(true);
  });

  test('matches Go _test.go suffix', () => {
    expect(isTestFile('handler_test.go')).toBe(true);
  });

  test('matches __tests__ directory', () => {
    expect(isTestFile('src/__tests__/helpers.js')).toBe(true);
  });

  test('matches /tests/ directory', () => {
    expect(isTestFile('src/tests/helpers.js')).toBe(true);
  });

  test('matches /test/ directory', () => {
    expect(isTestFile('src/test/helpers.js')).toBe(true);
  });

  // --- exception: partial matches that should NOT trigger ---
  test('does not match a file with "test" only in a parent dir name (not /test/)', () => {
    // "contest/app.js" — "contest" contains "test" but is not /test/ or /tests/
    expect(isTestFile('contest/app.js')).toBe(false);
  });

  test('does not match .cs file that merely contains "Test" mid-name without suffix', () => {
    expect(isTestFile('TestableService.cs')).toBe(false);
  });

  test('classifies a repo-root test directory as test files', () => {
    // git show --numstat emits repo-relative paths with no leading slash, so a pattern
    // requiring one can never match a top-level test directory. Node, ESLint and most
    // Python, Go and Ruby projects put tests exactly there.
    expect(isTestFile('test/parallel/test-foo.js')).toBe(true);
    expect(isTestFile('tests/lib/rules/no-var.js')).toBe(true);
    expect(isTestFile('test/fixtures/wpt/worker.js')).toBe(true);
  });

  test('does not treat a production file merely named like a test as a test file', () => {
    expect(isTestFile('src/test-helper.js')).toBe(false);
    expect(isTestFile('src/latest/index.js')).toBe(false);
  });

});
