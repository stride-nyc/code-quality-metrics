'use strict';

const { parseGitLog } = require('../local-code-metrics');

// %x1e, the record separator emitted between commits by the git log format this parser
// consumes (%H|%ci|%an|%B%x1e -- committer date, not author date; code-quality-metrics-75 /
// mbiw). %B is multi-line, so newline can no longer serve as the record boundary the way it
// did when the format captured only %s (the subject line). parseGitLog itself only splits on
// '|', so these tests below use plain date strings and are unaffected by which git format
// token actually produced the second field in production.
const RS = '\x1e';

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
  test('skips records with fewer than 4 pipe-delimited fields', () => {
    const input = `abc|2024-01-01${RS}`;
    expect(parseGitLog(input)).toEqual([]);
  });

  test('skips records where SHA is not 40 characters', () => {
    const input = `abc123|2024-01-01|Author|short sha commit${RS}`;
    expect(parseGitLog(input)).toEqual([]);
  });

  test('skips blank records', () => {
    const sha = 'a'.repeat(40);
    const input = `${RS}\n${RS}${sha}|2024-01-01|Author|message${RS}\n${RS}`;
    expect(parseGitLog(input)).toHaveLength(1);
  });

  // --- happy path ---
  test('parses a single valid commit record', () => {
    const sha = 'a'.repeat(40);
    const input = `${sha}|2024-01-01T00:00:00Z|Jane Dev|fix: correct logic${RS}`;

    const result = parseGitLog(input);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sha: 'a'.repeat(8),
      full_sha: sha,
      date: '2024-01-01T00:00:00Z',
      author: 'Jane Dev',
      message: 'fix: correct logic',
      full_message: 'fix: correct logic'
    });
  });

  test('parses multiple valid commit records (git-log-style, newline between records)', () => {
    const sha1 = 'a'.repeat(40);
    const sha2 = 'b'.repeat(40);
    // Real git output separates records with RS followed by a newline, not RS alone.
    const input = `${sha1}|2024-01-01|Author1|first commit${RS}\n${sha2}|2024-01-02|Author2|second commit${RS}`;

    expect(parseGitLog(input)).toHaveLength(2);
  });

  // --- exception case requiring established core ---
  test('preserves pipe characters inside the commit message', () => {
    const sha = 'c'.repeat(40);
    const input = `${sha}|2024-01-01|Author|feat: merge A|B into C${RS}`;

    const result = parseGitLog(input);

    expect(result[0].message).toBe('feat: merge A|B into C');
    expect(result[0].full_message).toBe('feat: merge A|B into C');
  });

  // --- new behavior: subject/body split ---
  test('splits the subject from the body: message is the first line, full_message is the whole body', () => {
    const sha = 'd'.repeat(40);
    const body = 'subject line\n\nexplanation line one\nexplanation line two';
    const input = `${sha}|2024-01-01|Author|${body}${RS}`;

    const result = parseGitLog(input);

    expect(result[0].message).toBe('subject line');
    expect(result[0].full_message).toBe(body);
  });
});
