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

  test('detects squashed history with high confidence when most commit subjects carry a trailing pull-request reference', () => {
    const commits = [
      { message: 'feat: add widget (#101)' },
      { message: 'fix: correct bug (#102)' },
      { message: 'chore: bump deps (#103)' },
      { message: 'docs: update readme' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: [], mergeCommitCount: 0 });
    expect(result).toEqual({
      value: 'squashed',
      confidence: 'high',
      signals: { pr_reference_share: 0.75, squash_committer_share: 0, merge_commit_count: 0 }
    });
  });
});
