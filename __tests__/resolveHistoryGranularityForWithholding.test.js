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

  test('[guard] trunk analysis of a squash-merging repository (majority of subjects carry a PR reference) is still withheld', () => {
    // This is the case code-quality-metrics-drv's design explicitly says must not
    // regress: commits on main after a squash merge genuinely are whole pull
    // requests, so the workflow_type: feature_branch gate above must not apply
    // here. Verified non-vacuous by mutation: deleting the workflowType check
    // from resolveHistoryGranularityForWithholding turns this test red.
    const commits = [
      { message: 'feat: add widget (#101)' },
      { message: 'fix: correct bug (#102)' },
      { message: 'chore: bump deps (#103)' },
      { message: 'docs: update readme' }
    ];
    const detected = detectHistoryGranularity({ commits, committerNames: [], mergeCommitCount: 0 });
    expect(detected.value).toBe('squashed');
    expect(detected.confidence).toBe('high');

    const resolved = resolveHistoryGranularityForWithholding(detected, 'trunk');

    expect(resolved).toBe('squashed');
  });

  test('[guard] zero commits under trunk workflow still resolves to squashed for gating, preserving the code-quality-metrics-bnq default', () => {
    // code-quality-metrics-bnq: an undetermined verdict defaults to squashed, not
    // unknown -- asserting a verdict against bands that don't apply is a worse
    // error than withholding one that would have been valid. Verified non-vacuous
    // by mutation: changing the fallback to return detectedGranularity.value
    // unchanged (i.e. 'unknown') turns this test red.
    const detected = detectHistoryGranularity({ commits: [], committerNames: [], mergeCommitCount: 0 });
    expect(detected.value).toBe('unknown');

    const resolved = resolveHistoryGranularityForWithholding(detected, 'trunk');

    expect(resolved).toBe('squashed');
  });
});
