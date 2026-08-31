'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { getExpectedCommitCount } = require('../local-code-metrics');

describe('getExpectedCommitCount', () => {
  // Verify that all refs appear in one command so git deduplicates shared ancestry.
  // With the old per-ref loop, the mock throws on the first single-ref command.
  test('issues a single rev-list call with all refs to avoid double-counting shared history', () => {
    execSync.mockImplementation(command => {
      const cmd = String(command);
      if (cmd.includes('main') && cmd.includes('origin/release')) return '200';
      throw new Error(`unexpected command: ${cmd}`);
    });

    const result = getExpectedCommitCount(['main', 'origin/release'], '2026-08-01');

    expect(result).toBe(200);
  });

  test('issues a single rev-list call across multiple refs without a --since clause', () => {
    execSync.mockImplementation(command => {
      const cmd = String(command);
      if (cmd.includes('--since')) throw new Error(`should not include --since: ${cmd}`);
      if (cmd.includes('main') && cmd.includes('origin/release')) return '400000';
      throw new Error(`unexpected command: ${cmd}`);
    });

    const result = getExpectedCommitCount(['main', 'origin/release']);

    expect(result).toBe(400000);
  });

  // Single-ref case: no deduplication needed, but the command shape is the same.
  test('counts total ref history with no --since clause when sinceStr is not given', () => {
    execSync.mockImplementation(command => {
      const cmd = String(command);
      if (cmd.includes('--since')) throw new Error(`should not include --since: ${cmd}`);
      if (cmd.includes('main')) return '400000';
      throw new Error(`unexpected command: ${cmd}`);
    });

    const result = getExpectedCommitCount(['main']);

    expect(result).toBe(400000);
  });
});
