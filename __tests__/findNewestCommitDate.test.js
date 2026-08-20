'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { findNewestCommitDate } = require('../lib/git');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findNewestCommitDate (code-quality-metrics-bb29)', () => {
  test('returns the committer date of the newest commit reachable from the given refs', () => {
    execSync.mockImplementation(command => {
      const cmd = String(command);
      if (cmd.includes('-1') && cmd.includes('%cs') && cmd.includes('main') && cmd.includes('feature/x')) {
        return '2025-11-19';
      }
      throw new Error(`unexpected command: ${cmd}`);
    });

    const result = findNewestCommitDate(['main', 'feature/x']);

    expect(result).toBe('2025-11-19');
  });
});
