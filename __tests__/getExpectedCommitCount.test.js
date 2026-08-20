'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { getExpectedCommitCount } = require('../local-code-metrics');

describe('getExpectedCommitCount', () => {
  test('sums rev-list counts across multiple refs', () => {
    execSync.mockImplementation(command => {
      if (typeof command === 'string' && command.includes('main')) return '178';
      if (typeof command === 'string' && command.includes('origin/release')) return '50';
      throw new Error(`unexpected command: ${command}`);
    });

    const result = getExpectedCommitCount(['main', 'origin/release'], '2026-08-01');

    expect(result).toBe(228);
  });

  // Needed for the --max-commits unbounded safety pre-flight check (local-code-metrics.js),
  // which must count a ref's whole reachable history when no --since boundary was requested.
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
