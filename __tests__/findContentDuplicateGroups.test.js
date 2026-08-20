'use strict';

const { findContentDuplicateGroups } = require('../lib/git');

describe('findContentDuplicateGroups', () => {
  test('groups two commits with the same subject, total_additions and total_deletions but different SHAs into one duplicate group', () => {
    const shaA = 'a'.repeat(40);
    const shaB = 'b'.repeat(40);
    const commits = [
      { full_sha: shaA, message: 'feat: add widget', total_additions: 10, total_deletions: 2 },
      { full_sha: shaB, message: 'feat: add widget', total_additions: 10, total_deletions: 2 }
    ];

    const groups = findContentDuplicateGroups(commits);

    expect(groups).toEqual([
      { subject: 'feat: add widget', total_additions: 10, total_deletions: 2, shas: [shaA, shaB] }
    ]);
  });

  test('normalizes a trailing "(#N)" PR-reference suffix before comparing subjects, so a squash commit groups with its un-suffixed original', () => {
    const shaSquash = 'a'.repeat(40);
    const shaOriginal = 'b'.repeat(40);
    const commits = [
      { full_sha: shaSquash, message: 'feat: add widget (#42)', total_additions: 10, total_deletions: 2 },
      { full_sha: shaOriginal, message: 'feat: add widget', total_additions: 10, total_deletions: 2 }
    ];

    const groups = findContentDuplicateGroups(commits);

    expect(groups).toEqual([
      { subject: 'feat: add widget', total_additions: 10, total_deletions: 2, shas: [shaSquash, shaOriginal] }
    ]);
  });

  // [guard] proves the additions/deletions comparison is real, not merely a subject-text
  // match: two commits sharing a subject but not a diff size are unrelated changes and must
  // not be reported as a content duplicate.
  test('does not group two commits with the same subject when total_additions differs', () => {
    const commits = [
      { full_sha: 'a'.repeat(40), message: 'fix: typo', total_additions: 1, total_deletions: 1 },
      { full_sha: 'b'.repeat(40), message: 'fix: typo', total_additions: 5, total_deletions: 1 }
    ];

    expect(findContentDuplicateGroups(commits)).toEqual([]);
  });

  // [guard] proves a repeated identical SHA in the input (which should not occur given the
  // existing same-SHA dedup upstream, but is cheap to guard here) is not reported as its own
  // two-way duplicate.
  test('does not report a group for a single SHA appearing more than once in the input', () => {
    const sha = 'a'.repeat(40);
    const commits = [
      { full_sha: sha, message: 'feat: add widget', total_additions: 10, total_deletions: 2 },
      { full_sha: sha, message: 'feat: add widget', total_additions: 10, total_deletions: 2 }
    ];

    expect(findContentDuplicateGroups(commits)).toEqual([]);
  });
});
