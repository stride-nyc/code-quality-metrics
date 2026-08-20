'use strict';

const { detectHistoryGranularity } = require('../lib/git');

describe('detectHistoryGranularity', () => {
  test('returns unknown with low confidence when there are no commits to evaluate', () => {
    const result = detectHistoryGranularity({ commits: [], committerNames: [], mergeCommitCount: 0 });
    expect(result).toEqual({
      value: 'unknown',
      confidence: 'low',
      signals: { pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: 0, sample_size: 0 }
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
      signals: { pr_reference_share: 0.75, squash_committer_share: 0, merge_commit_count: 0, sample_size: 4 }
    });
  });

  test("recognizes GitHub's (GH-N) backport-merge suffix the same as (#N)", () => {
    // cpython-style: half the sample uses the (#N) squash suffix, half uses the
    // (GH-N) backport suffix GitHub also writes for backported commits. Counting
    // only (#N) gives a share (2/5 = 0.4) just under the 0.5 confidence cutoff, so
    // the correct 'squashed' verdict was reached at 'low' confidence for no reason
    // -- the pattern simply could not see the other half of the evidence.
    const commits = [
      { message: 'feat: add widget (#101)' },
      { message: 'fix: correct bug (#102)' },
      { message: 'chore: backport fix (GH-201)' },
      { message: 'chore: backport fix (GH-202)' },
      { message: 'chore: backport fix (GH-203)' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: [], mergeCommitCount: 0 });
    expect(result).toEqual({
      value: 'squashed',
      confidence: 'high',
      signals: { pr_reference_share: 1, squash_committer_share: 0, merge_commit_count: 0, sample_size: 5 }
    });
  });

  // Guards below: the branching implementation added for the test above already
  // handles these cases correctly. Each is verified by replaying it against the
  // parent commit (before that implementation existed), where it fails.

  test('[guard] defaults to squashed with low confidence for a mixed workflow where only some subjects carry a PR reference', () => {
    // microsoft/vscode-style mixed workflow: some PRs squashed, some merged, some
    // pushed directly. Ambiguous, and per code-quality-metrics-bnq's notes this
    // defaults to squashed (the more common workflow, and the safer error to make)
    // rather than unknown.
    const commits = [
      { message: 'feat: add widget (#101)' },
      { message: 'fix: correct bug' },
      { message: 'chore: bump deps' },
      { message: 'docs: update readme' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: [], mergeCommitCount: 0 });
    expect(result.value).toBe('squashed');
    expect(result.confidence).toBe('low');
  });

  test('[guard] detects granular history with high confidence when true merge commits exist and no subject carries a PR reference', () => {
    // emberjs-style true two-parent merge-button workflow: individual commits are
    // preserved, so merge-commit presence is evidence FOR granular, not squashed.
    const commits = [
      { message: 'feat: add widget' },
      { message: 'fix: correct bug' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: ['Jane Dev'], mergeCommitCount: 3 });
    expect(result).toEqual({
      value: 'granular',
      confidence: 'high',
      signals: { pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: 3, sample_size: 2 }
    });
  });

  test('[guard] detects granular history with high confidence for a clean direct-push workflow (no PR references, no merges, no bot committer)', () => {
    // git/postgres-style mailing-list/direct-push workflow.
    const commits = [
      { message: 'feat: add widget' },
      { message: 'fix: correct bug' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: ['Jane Dev', 'Jane Dev'], mergeCommitCount: 0 });
    expect(result).toEqual({
      value: 'granular',
      confidence: 'high',
      signals: { pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: 0, sample_size: 2 }
    });
  });

  test('reports sample_size in signals, naming the population pr_reference_share was computed over (code-quality-metrics-66oo)', () => {
    // The 73V run's report stated a PR-reference share with no denominator attached, and the
    // share itself turned out to be computed over a different population (1246 pre-slice
    // candidates) than the one the report described (50 analyzed commits) -- a mismatch a
    // reader had no way to catch from the JSON alone, since nothing named which population
    // the percentage was a share of. sample_size makes that population explicit going forward.
    const commits = [
      { message: 'feat: add widget (#101)' },
      { message: 'fix: correct bug (#102)' },
      { message: 'chore: bump deps (#103)' },
      { message: 'docs: update readme' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: [], mergeCommitCount: 0 });
    expect(result.signals.sample_size).toBe(4);
  });

  test('[guard] detects granular history with only low confidence when a bot committer is present but no PR reference or merge commit corroborates squashing', () => {
    // node.js-style rebase-and-land: committer is a bot ("GitHub"), but subjects
    // never carry a PR reference and there are no true merge commits. Still
    // granular, but the committer signal alone is not decisive evidence, so
    // confidence is lower than the clean case above.
    const commits = [
      { message: 'feat: add widget' },
      { message: 'fix: correct bug' }
    ];
    const result = detectHistoryGranularity({ commits, committerNames: ['GitHub', 'GitHub'], mergeCommitCount: 0 });
    expect(result).toEqual({
      value: 'granular',
      confidence: 'low',
      signals: { pr_reference_share: 0, squash_committer_share: 1, merge_commit_count: 0, sample_size: 2 }
    });
  });
});
