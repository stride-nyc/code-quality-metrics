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

  // D1/D2 additions
  test('computeStatistics is exported', () => { expect(typeof mod.computeStatistics).toBe('function'); });
  test('computeVelocity is exported', () => { expect(typeof mod.computeVelocity).toBe('function'); });
  test('scoreMessageQuality is exported', () => { expect(typeof mod.scoreMessageQuality).toBe('function'); });
  test('classifyDoraArchetype is exported', () => { expect(typeof mod.classifyDoraArchetype).toBe('function'); });

  // D3 additions
  test('getAnthropicClient is exported', () => { expect(typeof mod.getAnthropicClient).toBe('function'); });
  test('selectClaudeCommits is exported', () => { expect(typeof mod.selectClaudeCommits).toBe('function'); });
  test('getCommitDiff is exported', () => { expect(typeof mod.getCommitDiff).toBe('function'); });
  test('analyzeWithClaude is exported', () => { expect(typeof mod.analyzeWithClaude).toBe('function'); });
  test('CLAUDE_SYSTEM_PROMPT is exported', () => { expect(typeof mod.CLAUDE_SYSTEM_PROMPT).toBe('string'); });
});
