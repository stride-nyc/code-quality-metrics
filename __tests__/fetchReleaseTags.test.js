'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { fetchReleaseTags } = require('../lib/git');

function mockForEachRef(output) {
  execSync.mockImplementation(command => {
    if (String(command).includes('for-each-ref')) return output;
    return '';
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchReleaseTags', () => {
  test('returns empty array when releaseTagPattern is null (feature off)', () => {
    expect(fetchReleaseTags(null, null)).toEqual([]);
    expect(execSync).not.toHaveBeenCalled();
  });

  test('parses for-each-ref output into name+date objects', () => {
    mockForEachRef([
      'v1.0.0\t2026-01-10 10:00:00 +0000',
      'v1.1.0\t2026-01-20 10:00:00 +0000',
    ].join('\n'));

    const result = fetchReleaseTags('^v\\d+', null);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('v1.0.0');
    expect(result[1].name).toBe('v1.1.0');
  });

  test('filters tags that do not match releaseTagPattern', () => {
    mockForEachRef([
      'v1.0.0\t2026-01-10 10:00:00 +0000',
      'docs-update\t2026-01-15 10:00:00 +0000',
      'v1.1.0\t2026-01-20 10:00:00 +0000',
    ].join('\n'));

    const result = fetchReleaseTags('^v\\d+', null);

    expect(result.map(e => e.name)).toEqual(['v1.0.0', 'v1.1.0']);
  });

  test('excludes tags matching stagingTagPattern from production events', () => {
    mockForEachRef([
      'v1.0.0\t2026-01-10 10:00:00 +0000',
      'staging-v1.0.0\t2026-01-10 11:00:00 +0000',
      'v1.1.0\t2026-01-20 10:00:00 +0000',
    ].join('\n'));

    const result = fetchReleaseTags('^v\\d+', '^staging-');

    expect(result.map(e => e.name)).toEqual(['v1.0.0', 'v1.1.0']);
  });

  // Guard: a tag matching staging pattern is never counted as production
  test('[guard] a tag matching stagingTagPattern is never in the returned production events', () => {
    mockForEachRef('staging-v2.0.0\t2026-01-10 10:00:00 +0000\nv2.0.0\t2026-01-11 10:00:00 +0000\n');

    const result = fetchReleaseTags('^v\\d+', '^staging-v\\d+');

    expect(result.every(e => !e.name.startsWith('staging-'))).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('v2.0.0');
  });

  test('returns events sorted ascending by date', () => {
    mockForEachRef([
      'v1.2.0\t2026-01-20 10:00:00 +0000',
      'v1.0.0\t2026-01-01 10:00:00 +0000',
      'v1.1.0\t2026-01-10 10:00:00 +0000',
    ].join('\n'));

    const result = fetchReleaseTags('^v\\d+', null);

    expect(result.map(e => e.name)).toEqual(['v1.0.0', 'v1.1.0', 'v1.2.0']);
  });

  test('returns empty array when git for-each-ref throws', () => {
    execSync.mockImplementation(() => { throw new Error('not a git repo'); });

    const result = fetchReleaseTags('^v\\d+', null);

    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('fetchReleaseTags'));
  });

  test('skips lines with missing date field', () => {
    mockForEachRef('v1.0.0\t\nv1.1.0\t2026-01-20 10:00:00 +0000');

    const result = fetchReleaseTags('^v\\d+', null);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('v1.1.0');
  });
});
