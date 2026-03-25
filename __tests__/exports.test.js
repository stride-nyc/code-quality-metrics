/**
 * Verifies that all testable functions are exported from local-code-metrics.js
 */
'use strict';

const mod = require('../local-code-metrics');

describe('module exports', () => {
  test('parseGitLog is exported', () => {
    expect(typeof mod.parseGitLog).toBe('function');
  });

  test('isTestFile is exported', () => {
    expect(typeof mod.isTestFile).toBe('function');
  });

  test('analyzeCommit is exported', () => {
    expect(typeof mod.analyzeCommit).toBe('function');
  });

  test('generateInsights is exported', () => {
    expect(typeof mod.generateInsights).toBe('function');
  });

  test('CONFIG is exported', () => {
    expect(typeof mod.CONFIG).toBe('object');
  });

  test('collectLocalMetrics is exported', () => {
    expect(typeof mod.collectLocalMetrics).toBe('function');
  });
});
