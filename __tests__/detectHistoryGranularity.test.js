'use strict';

const { detectHistoryGranularity } = require('../lib/git');

describe('detectHistoryGranularity', () => {
  test('returns unknown with low confidence when there are no commits to evaluate', () => {
    const result = detectHistoryGranularity({ commits: [], committerNames: [], mergeCommitCount: 0 });
    expect(result).toEqual({
      value: 'unknown',
      confidence: 'low',
      signals: { pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: 0 }
    });
  });
});
