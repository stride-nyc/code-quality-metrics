'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { findDefaultBranch, fetchDefaultBranchShas } = require('../lib/git');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('findDefaultBranch', () => {
  test('returns branch name from git symbolic-ref when remote HEAD is configured', () => {
    execSync.mockImplementation(cmd => {
      if (String(cmd).includes('symbolic-ref')) return 'origin/main\n';
      return '';
    });
    expect(findDefaultBranch()).toBe('main');
  });

  test('strips the remote prefix from symbolic-ref output', () => {
    execSync.mockImplementation(cmd => {
      if (String(cmd).includes('symbolic-ref')) return 'origin/master\n';
      return '';
    });
    expect(findDefaultBranch()).toBe('master');
  });

  test('falls back to main when symbolic-ref throws and main resolves', () => {
    execSync.mockImplementation(cmd => {
      if (String(cmd).includes('symbolic-ref')) throw new Error('no HEAD');
      if (String(cmd).includes('rev-parse') && String(cmd).includes('main')) return 'abc123\n';
      throw new Error('unknown');
    });
    expect(findDefaultBranch()).toBe('main');
  });

  test('falls back to master when symbolic-ref and main both fail', () => {
    execSync.mockImplementation(cmd => {
      if (String(cmd).includes('symbolic-ref')) throw new Error('no HEAD');
      if (String(cmd).includes('rev-parse') && String(cmd).includes('main')) throw new Error('no main');
      if (String(cmd).includes('rev-parse') && String(cmd).includes('master')) return 'def456\n';
      throw new Error('unknown');
    });
    expect(findDefaultBranch()).toBe('master');
  });

  test('returns null when all lookups fail', () => {
    execSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(findDefaultBranch()).toBeNull();
  });
});

describe('fetchDefaultBranchShas', () => {
  test('returns empty Set when branchName is null', () => {
    const result = fetchDefaultBranchShas(null, 250);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(execSync).not.toHaveBeenCalled();
  });

  test('returns a Set of trimmed SHAs from git rev-list output', () => {
    execSync.mockImplementation(() => 'aaa\nbbb\nccc\n');
    const result = fetchDefaultBranchShas('main', 250);
    expect(result).toEqual(new Set(['aaa', 'bbb', 'ccc']));
  });

  test('passes --max-count to git rev-list', () => {
    execSync.mockImplementation(cmd => {
      expect(String(cmd)).toContain('--max-count=250');
      return '';
    });
    fetchDefaultBranchShas('main', 250);
  });

  test('returns empty Set when git rev-list returns empty output', () => {
    execSync.mockImplementation(() => '');
    expect(fetchDefaultBranchShas('main', 250).size).toBe(0);
  });

  test('returns empty Set and logs error when git rev-list throws', () => {
    execSync.mockImplementation(() => { throw new Error('bad branch'); });
    const result = fetchDefaultBranchShas('main', 250);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
