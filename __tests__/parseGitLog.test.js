'use strict';

const { parseGitLog } = require('../local-code-metrics');

describe('parseGitLog', () => {
  // --- degenerate / zero cases ---
  test('returns empty array for empty string', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  test('returns empty array for null', () => {
    // @ts-ignore intentional bad input test
    expect(parseGitLog(null)).toEqual([]);
  });

  // --- exception / malformed input cases ---
  test('skips lines with fewer than 4 pipe-delimited parts', () => {
    const input = 'abc|2024-01-01';
    expect(parseGitLog(input)).toEqual([]);
  });

  test('skips lines where SHA is not 40 characters', () => {
    const input = 'abc123|2024-01-01|Author|short sha commit';
    expect(parseGitLog(input)).toEqual([]);
  });

  test('skips blank lines', () => {
    const sha = 'a'.repeat(40);
    const input = `\n\n${sha}|2024-01-01|Author|message\n\n`;
    expect(parseGitLog(input)).toHaveLength(1);
  });

  // --- happy path ---
  test('parses a single valid commit line', () => {
    const sha = 'a'.repeat(40);
    const input = `${sha}|2024-01-01T00:00:00Z|Jane Dev|fix: correct logic`;

    const result = parseGitLog(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sha: 'a'.repeat(8),
      full_sha: sha,
      date: '2024-01-01T00:00:00Z',
      author: 'Jane Dev',
      message: 'fix: correct logic'
    });
  });

  test('parses multiple valid commit lines', () => {
    const sha1 = 'a'.repeat(40);
    const sha2 = 'b'.repeat(40);
    const input = [
      `${sha1}|2024-01-01|Author1|first commit`,
      `${sha2}|2024-01-02|Author2|second commit`
    ].join('\n');

    expect(parseGitLog(input)).toHaveLength(2);
  });

  // --- exception case requiring established core ---
  test('preserves pipe characters inside the commit message', () => {
    const sha = 'c'.repeat(40);
    const input = `${sha}|2024-01-01|Author|feat: merge A|B into C`;

    const result = parseGitLog(input);

    expect(result[0].message).toBe('feat: merge A|B into C');
  });
});
