'use strict';

const { detectHistoryGranularity } = require('../lib/git');
const { resolveHistoryGranularityForWithholding } = require('../local-code-metrics');

describe('resolveHistoryGranularityForWithholding', () => {
  test('gates on workflow_type: a feature-branch sample with a single (#N)-suffixed subject (the measured remote_retro shape, 1 of 29) is not withheld', () => {
    // Mirrors the measured remote_retro trigger: 29 commits unique to an unmerged
    // feature branch, exactly one of them titled with a trailing PR reference
    // ('Dev container (#660)'). detectHistoryGranularity alone reports this as
    // squashed/low, which is technically correct about the subject-line signal
    // but not about the commits, which are granular by construction: they have
    // not been squashed into anything yet, being unique to an unmerged branch.
    const commits = [
      { message: 'feat: dev container (#660)' },
      ...Array.from({ length: 28 }, (_, i) => ({ message: `feat: change ${i}` }))
    ];
    const detected = detectHistoryGranularity({ commits, committerNames: [], mergeCommitCount: 0 });
    expect(detected.value).toBe('squashed');
    expect(detected.confidence).toBe('low');
    expect(detected.signals.pr_reference_share).toBeCloseTo(1 / 29, 5);

    const resolved = resolveHistoryGranularityForWithholding(detected, 'feature_branch');

    expect(resolved).toBe('granular');
  });
});
