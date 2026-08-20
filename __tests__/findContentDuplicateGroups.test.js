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
});
