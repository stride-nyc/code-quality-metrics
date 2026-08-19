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
});
