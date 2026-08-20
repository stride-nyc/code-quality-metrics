'use strict';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../lib/claude');
jest.mock('../lib/duplicate');

const { execSync } = require('child_process');
const fs = require('fs');
const claude = require('../lib/claude');
const duplicate = require('../lib/duplicate');
const { collectLocalMetrics, CONFIG } = require('../local-code-metrics');
const { buildMetricCatalog } = require('../lib/report');
const { THRESHOLDS } = require('../lib/thresholds');

const FAKE_ROOT = '/fake/repo';
const FAKE_REMOTE = 'git@github.com:org/repo.git';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Default: Claude skipped — overridden only in Claude-active tests
  claude.getAnthropicClient.mockResolvedValue(null);
  // Default: no static/semantic duplicate findings — overridden only in duplicate-detection tests
  duplicate.runDuplicateCheck.mockReturnValue([]);
  duplicate.runDuplicateAnalysis.mockReturnValue({ findings: [], statistics: null });
  duplicate.resolveModuleNeighbors.mockImplementation(paths => paths);
  claude.runSemanticDuplicateAnalysis.mockResolvedValue({ status: 'skipped', findings: [] });
  // Default: no repo-local .codemetrics.json — overridden only in the
  // config-override tests below. jest.clearAllMocks() above clears call
  // history but not a prior test's mockImplementation, so this has to be
  // reasserted every test to avoid one test's override leaking into the next.
  fs.existsSync.mockReturnValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Build a sequence of execSync return values.
 * Each call to execSync consumes the next value in the array.
 */
function mockExecSequence(...values) {
  let i = 0;
  execSync.mockImplementation(command => {
    // Tests predating the merged-branch filter supply no value for the
    // `git branch -a --merged` query. Answer it out of band so it never consumes
    // a positional value, and return empty so nothing is filtered.
    if (typeof command === 'string' && command.includes('--merged')) return '';
    // Tests predating history-granularity detection supply no value for its two
    // queries (true merge-commit count, committer names). Answer them out of band
    // the same way, defaulting to "no merges, no committer names" so detection
    // still runs (as granular) without every prior test needing a positional value.
    if (typeof command === 'string' && command.includes('--merges')) return '';
    if (typeof command === 'string' && command.includes('format:"%cn"')) return '';
    // Tests predating the merge-commit double-count guard supply no value for
    // analyzeCommit's own parent-count check (`git show --no-patch --format=%P`).
    // Answer it out of band too, with a single parent -- i.e. "not a merge" --
    // so every commit under test is still analyzed rather than skipped.
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
    // Tests predating project-lifecycle detection supply no value for the
    // repository-root-commit query (`git rev-list --max-parents=0 --all`). Answer it out of
    // band too, defaulting to "no root commit found" (project_lifecycle: established) so
    // every prior test's positional values still line up.
    if (typeof command === 'string' && command.includes('--max-parents=0')) return '';
    // Tests predating scaffold-root detection (code-quality-metrics-fex3) supply no value
    // for its two queries (per-commit --name-only, whole-history --reverse log). Answer them
    // out of band too: a production file present by default, so findEffectiveRootSha's walk
    // never fires and every prior test's positional values still line up.
    if (typeof command === 'string' && command.includes('--name-only')) return 'src/app.js';
    if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) return '';
    // Tests predating the window reproducibility guard (code-quality-metrics-tde9) supply
    // no value for the independent `git rev-list --count [--since=...]` cross-check (used both
    // by that guard's dated-window comparison and by the --max-commits unbounded safety
    // pre-flight check, which omits --since entirely for a HEAD-anchored run). Answer it out of
    // band too, defaulting to empty (getExpectedCommitCount treats an unparseable count as 0,
    // which reads as "unknown"/"under the safety limit" and never triggers a mismatch warning
    // or the safety-limit error) so it never consumes a positional value meant for the numstat
    // call that follows it. Matched on `rev-list` together with `--count` (not `rev-list`
    // alone), so this does not also swallow the project-lifecycle root-commit query above,
    // which is also a `rev-list` call but carries no `--count`.
    if (typeof command === 'string' && command.includes('rev-list') && command.includes('--count')) return '';
    const val = values[i] ?? '';
    i++;
    return val;
  });
}

/**
 * Like mockExecSequence, but answers the `git branch -a --merged` query with
 * mergedOutput instead of empty. Positional values cover every other command.
 */
function mockExecSequenceWithMerged(mergedOutput, ...values) {
  let i = 0;
  execSync.mockImplementation(command => {
    if (typeof command === 'string' && command.includes('--merged')) return mergedOutput;
    if (typeof command === 'string' && command.includes('--merges')) return '';
    if (typeof command === 'string' && command.includes('format:"%cn"')) return '';
    // Tests predating the merge-commit double-count guard supply no value for
    // analyzeCommit's own parent-count check (`git show --no-patch --format=%P`).
    // Answer it out of band too, with a single parent -- i.e. "not a merge" --
    // so every commit under test is still analyzed rather than skipped.
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
    if (typeof command === 'string' && command.includes('--max-parents=0')) return '';
    // Tests predating scaffold-root detection (code-quality-metrics-fex3) supply no value
    // for its two queries (per-commit --name-only, whole-history --reverse log). Answer them
    // out of band too: a production file present by default, so findEffectiveRootSha's walk
    // never fires and every prior test's positional values still line up.
    if (typeof command === 'string' && command.includes('--name-only')) return 'src/app.js';
    if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) return '';
    if (typeof command === 'string' && command.includes('rev-list') && command.includes('--count')) return '';
    const val = values[i] ?? '';
    i++;
    return val;
  });
}

/**
 * Like mockExecSequence, but answers the history-granularity queries (true
 * merge-commit count, committer names) with the given values instead of the
 * "no signal" default. Positional values cover every other command.
 */
function mockExecSequenceWithHistorySignals(mergesOutput, committerNamesOutput, ...values) {
  let i = 0;
  execSync.mockImplementation(command => {
    if (typeof command === 'string' && command.includes('--merged')) return '';
    if (typeof command === 'string' && command.includes('--merges')) return mergesOutput;
    if (typeof command === 'string' && command.includes('format:"%cn"')) return committerNamesOutput;
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
    if (typeof command === 'string' && command.includes('--max-parents=0')) return '';
    // Tests predating scaffold-root detection (code-quality-metrics-fex3) supply no value
    // for its two queries (per-commit --name-only, whole-history --reverse log). Answer them
    // out of band too: a production file present by default, so findEffectiveRootSha's walk
    // never fires and every prior test's positional values still line up.
    if (typeof command === 'string' && command.includes('--name-only')) return 'src/app.js';
    if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) return '';
    const val = values[i] ?? '';
    i++;
    return val;
  });
}

/**
 * Like mockExecSequence, but answers the repository-root-commit query (`git rev-list
 * --max-parents=0 --all`) with rootCommitsOutput instead of the "no root commit found"
 * default. Positional values cover every other command.
 */
function mockExecSequenceWithRootCommits(rootCommitsOutput, ...values) {
  let i = 0;
  execSync.mockImplementation(command => {
    if (typeof command === 'string' && command.includes('--merged')) return '';
    if (typeof command === 'string' && command.includes('--merges')) return '';
    if (typeof command === 'string' && command.includes('format:"%cn"')) return '';
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
    if (typeof command === 'string' && command.includes('--max-parents=0')) return rootCommitsOutput;
    // Answered out of band, defaulting to a production file present, so findEffectiveRootSha's
    // walk-forward never fires unless a test overrides execSync itself for a scaffold scenario
    // (code-quality-metrics-fex3).
    if (typeof command === 'string' && command.includes('--name-only')) return 'src/app.js';
    if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) return '';
    const val = values[i] ?? '';
    i++;
    return val;
  });
}

/**
 * Like mockExecSequence, but the repository-root-commit query (`git rev-list
 * --max-parents=0 --all`) throws instead of returning a string -- a genuine command
 * failure, distinct from a command that succeeds with empty stdout (code-quality-metrics-dqri).
 * Positional values cover every other command.
 */
function mockExecSequenceWithRootCommitFailure(...values) {
  let i = 0;
  execSync.mockImplementation(command => {
    if (typeof command === 'string' && command.includes('--merged')) return '';
    if (typeof command === 'string' && command.includes('--merges')) return '';
    if (typeof command === 'string' && command.includes('format:"%cn"')) return '';
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
    if (typeof command === 'string' && command.includes('--max-parents=0')) {
      throw new Error('fatal: unable to read tree');
    }
    if (typeof command === 'string' && command.includes('--name-only')) return 'src/app.js';
    if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) return '';
    const val = values[i] ?? '';
    i++;
    return val;
  });
}

describe('collectLocalMetrics — trunk fallback', () => {
  test('falls back to trunk analysis when no feature branches exist', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',                                              // git branch — only main, no feature branches
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,   // git log against the resolved default branch
      `10\t5\tsrc/app.js`                                   // git show numstat
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    expect(fs.writeFileSync).toHaveBeenCalled();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.workflow_type).toBe('trunk');
    expect(summary.branches_analyzed).toEqual(['main']);

    const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
    const metrics = JSON.parse(metricsCall[1]);
    expect(metrics[0].commit_type).toBe('trunk');
  });

  test('falls back to trunk when feature branches exist but yield no commits in analysis period', async () => {
    const SHA = 'c'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '* main\n  remotes/origin/pl/alerts-history', // feature branch present, but...
      '',                                            // git log alerts-history → no commits in period
      `${SHA}|2026-05-01T10:00:00Z|Dev|squash: feature work`, // git log main → has commits
      `10\t5\tsrc/app.js`                            // git show numstat
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    expect(fs.writeFileSync).toHaveBeenCalled();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.workflow_type).toBe('trunk');
  });

  // GUARD, not a called-shot RED: nothing in the trunk fallback path suppresses
  // or nulls any rate. Written after the real implementation as an explicit
  // regression guard against parseFloat(undefined) -> NaN silently forcing
  // every trunk-mode repo to classify as mixed-signals (see plan critique #4).
  test('trunk fallback still reports all five metric rates as measured', async () => {
    const SHA = 'f'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-20T10:00:00Z|Dev|feat: trunk commit`,
      `10\t5\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.workflow_type).toBe('trunk');
    for (const field of [
      'test_coverage_rate',
      'test_isolation_rate',
      'uncovered_prod_rate',
      'large_commits_pct',
      'sprawling_commits_pct',
      'message_quality_pct'
    ]) {
      expect(typeof summary[field]).toBe('string');
      expect(Number.isNaN(parseFloat(summary[field]))).toBe(false);
    }
    expect(['harmonious-high-achiever', 'foundational-challenges', 'legacy-bottleneck', 'mixed-signals'])
      .toContain(summary.dora_archetype);
  });

  test('resolves default branch to master when the repo has no main', async () => {
    const SHA = 'b'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'master',                                             // git branch — only master, no main, no feature branches
      `${SHA}|2024-02-01T10:00:00Z|Dev|feat: add other thing`,
      `4\t2\tsrc/other.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.branches_analyzed).toEqual(['master']);
    expect(summary.total_commits).toBe(1);
  });
});

describe('collectLocalMetrics — remote branch listing', () => {
  test('excludes the remotes/origin/HEAD pointer line from branch counts', async () => {
    const SHA = 'c'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '* main\n  remotes/origin/HEAD -> origin/main\n  feature/x', // git branch -a
      `${SHA}|2024-03-01T10:00:00Z|Dev|feat: real branch commit`,
      `2\t1\tsrc/real.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.branches_analyzed).toEqual(['feature/x']);
  });

  test('includes and normalizes a remote-only feature branch not present locally', async () => {
    const SHA = 'd'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      // git branch -a: local main, a local/remote pair for feature/x (should
      // dedupe to one entry), and a remote-only feature-y with no local branch
      '* main\n  feature/x\n  remotes/origin/feature/x\n  remotes/origin/feature-y',
      '', // git log feature/x — no commits
      `${SHA}|2024-04-01T10:00:00Z|Dev|feat: remote-only work`, // git log feature-y
      `1\t0\tsrc/remote.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    // A remote-only branch keeps its remote qualifier (origin/feature-y), not the
    // bare stripped name: without a local branch of that name, "feature-y" alone
    // is not a resolvable git ref (confirmed against flight-info-spike, where
    // "pl/alerts-history" fails with "fatal: ambiguous argument" but
    // "origin/pl/alerts-history" resolves).
    expect(summary.branches_analyzed).toEqual(['feature/x', 'origin/feature-y']);
  });
});

describe('collectLocalMetrics — CLI window override', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('applies a --days override to widen the analysis window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00Z'));
    const SHA = 'e'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x', // git branch -a
      `${SHA}|2026-03-20T10:00:00Z|Dev|feat: old commit outside the default 30-day window`,
      `3\t0\tsrc/old.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ days: 90 });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.analysis_period_days).toBe(90);
  });

  test('applies a --since override directly as the git log boundary date', async () => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x', // git branch -a
      ''             // git log — no commits, short-circuits before deeper processing
    );

    await collectLocalMetrics({ since: '2026-04-01' });

    const sawExplicitSince = execSync.mock.calls.some(call => String(call[0]).includes('2026-04-01'));
    expect(sawExplicitSince).toBe(true);
  });
});

describe('collectLocalMetrics — window reproducibility guard (code-quality-metrics-tde9)', () => {
  test('sets window_expected_commit_count from an independent git rev-list count, and warns on a large discrepancy against the selected count', async () => {
    const SHA = 'a'.repeat(40);
    execSync.mockImplementation(command => {
      const cmd = String(command);
      if (cmd.includes('rev-parse')) return FAKE_ROOT;
      if (cmd.includes('remote get-url')) return FAKE_REMOTE;
      if (cmd.includes('--merged')) return '';
      if (cmd.includes('--merges')) return '';
      if (cmd.includes('format:"%cn"')) return '';
      if (cmd.includes('%P')) return 'p'.repeat(40);
      // Independent cross-check under test: git itself reports far more commits reachable in
      // the window than the tool's own git log fetch below will return (1). Matched together
      // with `--since` so this does not also answer the unrelated project-lifecycle
      // `git rev-list --max-parents=0 --all` root-commit query, which falls through to the
      // default '' below (project_lifecycle is not under test here).
      if (cmd.includes('rev-list') && cmd.includes('--since')) return '178';
      if (cmd.includes('branch -a')) return 'main';
      if (cmd.includes('git log') && cmd.includes('--since')) {
        return `${SHA}|2026-08-09T10:00:00Z|Dev|feat: only commit in window`;
      }
      if (cmd.includes('numstat')) return '10\t5\tsrc/app.js';
      return '';
    });
    fs.writeFileSync.mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await collectLocalMetrics({ since: '2026-08-01' });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.window_expected_commit_count).toBe(178);
    expect(summary.filtered_from).toBe(1);

    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toMatch(/mismatch/);
  });

  test('leaves window_expected_commit_count null for a HEAD-anchored run (no explicit --since/--days)', async () => {
    const SHA = 'b'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t5\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.window_expected_commit_count).toBeNull();
  });
});

describe('collectLocalMetrics — early exits', () => {
  test('exits with code 1 when not in a git repository', async () => {
    mockExecSequence(''); // git rev-parse returns empty

    await expect(collectLocalMetrics()).rejects.toThrow('process.exit');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  // code-quality-metrics-wzy2: `git branch -a` succeeds with empty stdout on a freshly
  // initialised repository that has no branches yet -- there is nothing wrong with the git
  // command. That must not be reported as the command having failed.
  test('does not report a git failure, and continues to the trunk fallback, when git branch -a succeeds with empty output', async () => {
    mockExecSequence(
      FAKE_ROOT,    // git rev-parse --show-toplevel
      FAKE_REMOTE,  // git remote get-url origin
      '',           // git branch -a → succeeds, no branches exist yet
      ''            // git log HEAD (trunk fallback) → no commits (unborn HEAD)
    );

    await collectLocalMetrics();

    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Unable to list Git branches'));
    expect(process.exit).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  // [guard] proven by mutation: changing the catch block below to swallow the error (e.g.
  // `branchesOutput = '';` instead of reporting and exiting) makes this test fail --
  // process.exit is never called and no "Unable to list Git branches" message is printed,
  // because the genuine failure then reads identically to the success-with-empty-output case
  // the test above covers. Confirmed live: with that mutation applied, this test fails with
  // "Resolved to value: undefined" instead of rejecting with 'process.exit'.
  test('[guard] still exits with code 1 and reports the git failure when git branch -a genuinely fails', async () => {
    execSync.mockImplementation(command => {
      const cmd = typeof command === 'string' ? command : String(command);
      if (cmd.includes('rev-parse --show-toplevel')) return FAKE_ROOT;
      if (cmd.includes('remote get-url')) return FAKE_REMOTE;
      if (cmd === 'git branch -a') {
        throw new Error('fatal: not a git repository (or any of the parent directories)');
      }
      return '';
    });

    await expect(collectLocalMetrics()).rejects.toThrow('process.exit');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unable to list Git branches'));
  });

  test('returns without writing files when no feature branches exist', async () => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main'  // git branch — only main, filtered out
    );

    await collectLocalMetrics();

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('returns without writing files when no commits found in analysis period', async () => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x\n  feature/y',  // git branch
      '',                           // git log for feature/x → no commits
      ''                            // git log for feature/y → no commits
    );

    await collectLocalMetrics();

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  // code-quality-metrics-1g6j: uniqueCommits (git log) is non-empty here -- one commit on
  // feature/x -- but every commit's `git show --numstat` genuinely fails, so analyzeCommit
  // (lib/git.js) returns null for each one and `metrics` ends up empty even though commits
  // were found. That gap is not covered by the uniqueCommits.length === 0 guard above.
  test('returns without writing files (rather than throwing) when every commit in the window fails analysis', async () => {
    const SHA = 'a'.repeat(40);
    execSync.mockImplementation(command => {
      const cmd = typeof command === 'string' ? command : String(command);
      if (cmd.includes('rev-parse --show-toplevel')) return FAKE_ROOT;
      if (cmd.includes('remote get-url')) return FAKE_REMOTE;
      if (cmd === 'git branch -a') return '  feature/x';
      if (cmd.includes('--merged')) return '';
      if (cmd.includes('--merges')) return '';
      if (cmd.includes('format:"%cn"')) return '';
      if (cmd.includes('%P')) return 'p'.repeat(40); // single parent: not a merge commit
      if (cmd.includes('--max-parents=0')) return '';
      if (cmd.includes('%H|%ci')) return `${SHA}|2026-08-10T10:00:00Z|Dev|feat: add thing`;
      if (cmd.includes('--numstat')) {
        throw new Error(`fatal: bad object ${SHA}`);
      }
      return '';
    });
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No commits found in the analysis period'));
  });
});

describe('collectLocalMetrics — successful run', () => {
  const SHA = 'a'.repeat(40);
  const NUMSTAT = `10\t5\tsrc/app.js\n3\t1\tsrc/app.test.js`;

  beforeEach(() => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',                                     // git branch
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`, // git log feature/x
      NUMSTAT                                             // git show for SHA
    );
    fs.writeFileSync.mockImplementation(() => {});
  });

  test('writes three output files: metrics, summary, and duplicate analysis', async () => {
    // Layer 1 (jscpd, static) duplicate detection always runs when the
    // analyzed commits touch production files, adding a third output file
    // alongside the metrics and summary JSON.
    await collectLocalMetrics();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
  });

  test('writes local_commit_metrics.json with array of commit metrics', async () => {
    await collectLocalMetrics();

    const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
    expect(metricsCall).toBeDefined();
    const written = JSON.parse(metricsCall[1]);
    expect(Array.isArray(written)).toBe(true);
    expect(written[0]).toMatchObject({
      full_sha: SHA,
      source_branch: 'feature/x',
      commit_type: 'feature_branch'
    });
  });

  test('does not write an outlier field on commit metrics (withdrawn — code-quality-metrics-496)', async () => {
    // No window-relative cutoff (mean+stddev, raw p95, or a log-scale Tukey fence at several
    // multipliers) can satisfy monotonicity on this toolkit's heavy-tailed commit-size data:
    // every one measured either un-flags a previously-flagged commit when a larger one joins
    // the window, or goes inert (never fires) once the window's own body spans orders of
    // magnitude -- exactly the case this flag was meant to catch. The field is withdrawn
    // rather than re-tuned, matching how this project handled message_quality_pct and
    // net_additions_ratio_median. This assertion is deliberately construct-agnostic: it fails
    // on any implementation that keeps the field, whether monotonic, inverted, or inert.
    await collectLocalMetrics();

    const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
    const written = JSON.parse(metricsCall[1]);
    expect(written[0]).not.toHaveProperty('outlier');
  });

  test('writes local_metrics_summary.json with expected shape', async () => {
    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    expect(summaryCall).toBeDefined();
    const summary = JSON.parse(summaryCall[1]);
    expect(summary).toMatchObject({
      total_commits: 1,
      branches_analyzed: ['feature/x']
    });
    expect(typeof summary.large_commits_pct).toBe('string');
    expect(typeof summary.avg_lines_changed).toBe('string');
  });

  test('writes local_metrics_summary.json with DORA metric fields', async () => {
    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(typeof summary.velocity_commits_per_day).toBe('number');
    expect(['accelerating', 'stable', 'decelerating']).toContain(summary.velocity_trend);
    expect(typeof summary.net_additions_ratio_median).toBe('number');
    expect(typeof summary.net_additions_ratio_p90).toBe('number');
    expect(typeof summary.message_quality_pct).toBe('string');
    expect(['harmonious-high-achiever', 'foundational-challenges', 'legacy-bottleneck', 'mixed-signals'])
      .toContain(summary.dora_archetype);
  });

  test('writes local_metrics_summary.json with project_lifecycle detected as initial-build when the analyzed window includes the repository\'s root commit (code-quality-metrics-31w)', async () => {
    // SHA is the sole analyzed commit (this describe block's default fixture). Answering
    // `git rev-list --max-parents=0 --all` with that same SHA is the structural fact this
    // toolkit's greenfield detection acts on: the analyzed window includes the repository's
    // own first commit.
    mockExecSequenceWithRootCommits(
      SHA,
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      NUMSTAT
    );

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('initial-build');
  });

  // code-quality-metrics-m7kt: dora_archetype is a composite of large_commits_pct,
  // sprawling_commits_pct, test_coverage_rate and uncovered_prod_rate -- two of which
  // (large/sprawling) have their own verdicts withheld for an initial build (lib/report.js's
  // WITHHELD_WHEN_GREENFIELD_KEYS). Computing a confident archetype from inputs this same
  // report declares inapplicable is the defect measured live in flight-info-spike (large
  // commits at 48.89%, far above the healthy line, rendered as "legacy-bottleneck" with no
  // caveat in the JSON). Mirrors the precedent already set for squashed history, where
  // dora_archetype is omitted entirely (JSON.stringify drops an undefined value) rather than
  // computed and shown without a verdict -- see local-code-metrics.js's comment on that key.
  test('omits dora_archetype from local_metrics_summary.json when project_lifecycle is initial-build (code-quality-metrics-m7kt)', async () => {
    mockExecSequenceWithRootCommits(
      SHA,
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      NUMSTAT
    );

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('initial-build');
    expect(summary).not.toHaveProperty('dora_archetype');
  });

  // [guard] proven by mutation: reverting analyzeCommit's empty-commit fix in lib/git.js
  // (code-quality-metrics-p4c) so the numstat command's empty stdout is again treated as
  // a dropped commit fails this test -- not with 'established' as might be guessed, but
  // with `RangeError: Invalid time value` from local-code-metrics.js's
  // `new Date(Math.min(...timestamps)).toISOString()`, since the sole analyzed commit is
  // now dropped, `metrics` is empty, and `Math.min()` over an empty array is `Infinity`.
  // Reverted after confirming. django's actual root commit is an empty SVN-import
  // artifact with a zero-byte numstat, which is why this case matters beyond a synthetic
  // --allow-empty commit: without the fix, the root commit vanishes from `metrics`
  // entirely, windowIncludesRepositoryRoot never sees its sha, and (on a repository with
  // more than one analyzed commit, so this particular crash does not mask it) a
  // genuinely greenfield window reads as established.
  test('[guard] detects initial-build when the repository\'s root commit is itself empty, not only when it carries changes (code-quality-metrics-p4c)', async () => {
    mockExecSequenceWithRootCommits(
      SHA,
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      ''   // empty numstat: a genuinely empty commit (e.g. an SVN-import root), not a
           // failed git command
    );

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.total_commits).toBe(1);
    expect(summary.project_lifecycle).toBe('initial-build');
  });

  // [guard] proven by mutation: hardcoding includesRepositoryRoot to true in
  // local-code-metrics.js fails this test, expecting 'established' but receiving
  // 'initial-build' -- reverted after confirming.
  test('[guard] writes project_lifecycle as established when the root-commit query matches none of the analyzed commits (default fixture)', async () => {
    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('established');
    expect(summary.project_lifecycle_signals).toEqual({
      window_includes_repository_root: false,
      repository_root_commit_count: 0,
      root_commit_detection_failed: false,
      effective_root_detection_failed: false,
      scaffold_root_detected: false
    });
  });

  // A genuine `git rev-list --max-parents=0 --all` failure (bad ref, git unavailable,
  // corrupt repo) previously returned '' through runGitCommand -- indistinguishable from
  // the command succeeding with no root commits, the exact case the guard above covers.
  // project_lifecycle then read as 'established' with no visible sign anything had gone
  // wrong, silently defeating the greenfield detection this field exists for on exactly
  // the repository it is supposed to protect: a real initial build whose root-commit query
  // happens to fail. project_lifecycle must instead read as 'undetermined', distinct from
  // both 'established' and 'initial-build', with the failure visible in
  // project_lifecycle_signals (code-quality-metrics-dqri).
  test('records project_lifecycle as undetermined, not established, when the repository-root-commit query fails (code-quality-metrics-dqri)', async () => {
    mockExecSequenceWithRootCommitFailure(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      NUMSTAT
    );

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('undetermined');
    expect(summary.project_lifecycle_signals).toEqual({
      window_includes_repository_root: false,
      repository_root_commit_count: 0,
      root_commit_detection_failed: true,
      effective_root_detection_failed: false,
      scaffold_root_detected: false
    });
  });

  // Real case (code-quality-metrics-fex3, GitHub #71): stride-nyc/73V's root commit ec1026c4
  // (2022-01-26) adds only LICENSE and README, then nothing for three years, then 2,928
  // commits in 2025. That root commit is a GitHub repo-reservation scaffold, not the start of
  // the build: windowIncludesRepositoryRoot must be checked against the first commit that DOES
  // introduce a production file, not the literal (scaffold) root sha, or this repository
  // classifies established forever and is graded against maintenance-era bands it never earned.
  //
  // DEFAULT configuration throughout -- no .codemetrics.json, no ANALYSIS_IGNORE_PATTERNS
  // override. LICENSE and README.md are repo furniture (isRepoFurniture,
  // CONFIG.REPO_FURNITURE_PATTERNS in lib/config.js), matched structurally regardless of any
  // operator configuration, so this is the common case caught automatically.
  test('classifies project_lifecycle as initial-build when the repository\'s root commit is a scaffold, using the first production-bearing commit as the effective start of history (code-quality-metrics-fex3, GitHub #71)', async () => {
    const ROOT_SHA = 'c'.repeat(40); // stands in for 73V's ec1026c4 (LICENSE + README only)

    execSync.mockImplementation(command => {
      if (typeof command !== 'string') return '';
      if (command.includes('--merged')) return '';
      if (command.includes('--merges')) return '';
      if (command.includes('format:"%cn"')) return '';
      if (command.includes('%P')) return 'p'.repeat(40);
      if (command.includes('--max-parents=0')) return ROOT_SHA;
      if (command.includes('--name-only')) {
        if (command.includes(ROOT_SHA)) return 'LICENSE\nREADME.md';
        if (command.includes(SHA)) return 'src/app.js\nsrc/app.test.js';
        throw new Error(`unexpected sha in --name-only query: ${command}`);
      }
      if (command.includes('--reverse') && command.includes('%H')) {
        return `${ROOT_SHA}\n${SHA}`;
      }
      if (command.includes('rev-parse')) return FAKE_ROOT;
      if (command.includes('remote get-url')) return FAKE_REMOTE;
      if (command === 'git branch -a') return '  feature/x';
      if (command.includes('git log --no-merges') && command.includes('feature/x')) {
        return `${SHA}|2025-01-24T10:00:00Z|Dev|feat: add thing`;
      }
      if (command.includes('--numstat')) return NUMSTAT;
      return '';
    });

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('initial-build');
    expect(summary.project_lifecycle_signals.scaffold_root_detected).toBe(true);
  });

  // GitHub #89: when the root commit is a scaffold and the forward-walk query itself fails
  // (ENOBUFS on a large history, or any other git failure), that failure must not read as "no
  // later production-bearing commit found" -- the same collapse root_commit_detection_failed
  // above already guards against for the repository-root query. project_lifecycle must read
  // 'undetermined', not a confident 'established', with the failure visible in
  // project_lifecycle_signals.
  test('records project_lifecycle as undetermined, not established, when the scaffold forward-walk query itself fails (GitHub #89)', async () => {
    const ROOT_SHA = 'c'.repeat(40); // stands in for 73V's ec1026c4 (LICENSE + README only)

    execSync.mockImplementation(command => {
      if (typeof command !== 'string') return '';
      if (command.includes('--merged')) return '';
      if (command.includes('--merges')) return '';
      if (command.includes('format:"%cn"')) return '';
      if (command.includes('%P')) return 'p'.repeat(40);
      if (command.includes('--max-parents=0')) return ROOT_SHA;
      if (command.includes('--name-only')) {
        if (command.includes(ROOT_SHA)) return 'LICENSE\nREADME.md';
        if (command.includes(SHA)) return 'src/app.js\nsrc/app.test.js';
        throw new Error(`unexpected sha in --name-only query: ${command}`);
      }
      if (command.includes('--reverse') && command.includes('%H')) {
        throw new Error('ENOBUFS: stdout maxBuffer exceeded');
      }
      if (command.includes('rev-parse')) return FAKE_ROOT;
      if (command.includes('remote get-url')) return FAKE_REMOTE;
      if (command === 'git branch -a') return '  feature/x';
      if (command.includes('git log --no-merges') && command.includes('feature/x')) {
        return `${SHA}|2025-01-24T10:00:00Z|Dev|feat: add thing`;
      }
      if (command.includes('--numstat')) return NUMSTAT;
      return '';
    });

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('undetermined');
    expect(summary.project_lifecycle_signals.effective_root_detection_failed).toBe(true);
  });

  // [guard] proves the scaffold walk-forward path does not fire, and existing behavior is
  // unchanged, when the repository's root commit already carries a production file itself.
  test('[guard] does not report a scaffold root when the root commit already carries a production file', async () => {
    mockExecSequenceWithRootCommits(
      SHA,
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      NUMSTAT
    );

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.project_lifecycle).toBe('initial-build');
    expect(summary.project_lifecycle_signals.scaffold_root_detected).toBe(false);
  });

  // code-quality-metrics-zkhq, GitHub #71 part 1: mirrors the --history override test above
  // exactly. Detection alone would say established (default fixture: no root commit found);
  // the override forces initial-build for this invocation without changing what detection
  // itself reported.
  test('a --lifecycle override forces project_lifecycle, recording both the override and what detection actually found', async () => {
    const summary = await collectLocalMetrics({ lifecycle: 'initial-build' }).then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });

    expect(summary.project_lifecycle).toBe('initial-build');
    expect(summary.project_lifecycle_detected).toBe('established');
    expect(summary.project_lifecycle_override).toBe('initial-build');
  });

  test('a repo-local .codemetrics.json lifecycle key overrides project_lifecycle when no CLI flag is given', async () => {
    fs.existsSync.mockImplementation(p => typeof p === 'string' && p.endsWith('.codemetrics.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ lifecycle: 'initial-build' }));

    const summary = await collectLocalMetrics().then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });

    expect(summary.project_lifecycle).toBe('initial-build');
    expect(summary.project_lifecycle_detected).toBe('established');
    expect(summary.project_lifecycle_override).toBe('initial-build');
  });

  // [guard] proves CLI wins over the config-file key rather than the file silently taking
  // precedence, mirroring the CLI-over-config-file precedence every other override in this
  // tool already follows.
  test('[guard] a --lifecycle CLI flag takes precedence over a conflicting .codemetrics.json lifecycle key', async () => {
    fs.existsSync.mockImplementation(p => typeof p === 'string' && p.endsWith('.codemetrics.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ lifecycle: 'established' }));

    const summary = await collectLocalMetrics({ lifecycle: 'initial-build' }).then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });

    expect(summary.project_lifecycle).toBe('initial-build');
    expect(summary.project_lifecycle_override).toBe('initial-build');
  });

  // [guard] proves the no-override case still reports project_lifecycle_detected equal to
  // project_lifecycle and a null override, matching history_granularity's own shape.
  test('[guard] reports project_lifecycle_override as null and project_lifecycle_detected equal to project_lifecycle when no override is given', async () => {
    const summary = await collectLocalMetrics().then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });

    expect(summary.project_lifecycle).toBe('established');
    expect(summary.project_lifecycle_detected).toBe('established');
    expect(summary.project_lifecycle_override).toBeNull();
  });

  test('writes local_metrics_summary.json with history_granularity detected as granular when no squash signals are present', () => {
    return collectLocalMetrics().then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      const summary = JSON.parse(summaryCall[1]);
      expect(summary.history_granularity).toBe('granular');
      expect(summary.history_granularity_detected).toBe('granular');
      expect(summary.history_granularity_confidence).toBe('high');
      expect(summary.history_granularity_override).toBeNull();
      expect(summary.history_granularity_signals).toEqual({
        pr_reference_share: 0, squash_committer_share: 0, merge_commit_count: 0
      });
    });
  });

  test('wires resolveHistoryGranularityForWithholding into the pipeline: a feature-branch sample with a low-confidence squashed detection resolves history_granularity to granular while preserving the raw detected value (code-quality-metrics-drv)', async () => {
    // A feature-branch sample (workflow_type: feature_branch, the default branch
    // setup in this describe block's beforeEach) where one of three commits
    // carries a trailing PR reference: pr_reference_share 1/3, below the 0.5
    // threshold, so detectHistoryGranularity alone reports squashed/low. This
    // mirrors the measured remote_retro trigger (1 of 29 commits) that used to
    // silence every commit-unit verdict for the whole repository -- commits
    // unique to an unmerged feature branch are granular by construction,
    // whatever one subject line says.
    const SHA_A = 'a'.repeat(40);
    const SHA_B = 'b'.repeat(40);
    const SHA_C = 'c'.repeat(40);
    const gitLog = [
      `${SHA_A}|2024-01-15T10:00:00Z|Dev|feat: dev container (#660)`,
      `${SHA_B}|2024-01-14T10:00:00Z|Dev|feat: change one`,
      `${SHA_C}|2024-01-13T10:00:00Z|Dev|feat: change two`
    ].join('\x1e');
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',   // git branch
      gitLog,          // git log feature/x — three commits, one PR-referenced
      NUMSTAT, NUMSTAT, NUMSTAT // git show numstat, one per commit
    );

    const summary = await collectLocalMetrics().then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });

    expect(summary.workflow_type).toBe('feature_branch');
    expect(summary.history_granularity_detected).toBe('squashed');
    expect(summary.history_granularity_confidence).toBe('low');
    expect(summary.history_granularity).toBe('granular');
  });

  test('threads the workflow_type gate through to the metric catalog: a feature-branch sample with low-confidence squashed detection shows a real large_commits_pct verdict, not merely a present one (code-quality-metrics-drv)', async () => {
    // Vacuous-green warning from the design: do not assert only that a verdict
    // appears. This asserts the specific entry (large_commits_pct, a
    // WITHHELD_WHEN_SQUASHED_KEYS member in lib/report.js) carries a real gauge,
    // a real status, and the actual THRESHOLDS boundaries -- not the withheld
    // shape (hasGauge: false, status: 'neutral', boundaries: null).
    const SHA_A = 'a'.repeat(40);
    const SHA_B = 'b'.repeat(40);
    const SHA_C = 'c'.repeat(40);
    const gitLog = [
      `${SHA_A}|2024-01-15T10:00:00Z|Dev|feat: dev container (#660)`,
      `${SHA_B}|2024-01-14T10:00:00Z|Dev|feat: change one`,
      `${SHA_C}|2024-01-13T10:00:00Z|Dev|feat: change two`
    ].join('\x1e');
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      gitLog,
      NUMSTAT, NUMSTAT, NUMSTAT
    );

    const summary = await collectLocalMetrics().then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });
    expect(summary.history_granularity).toBe('granular');

    const entries = buildMetricCatalog(summary);
    const largeCommits = entries.find(e => e.key === 'large_commits_pct');

    expect(largeCommits.hasGauge).toBe(true);
    expect(largeCommits.status).not.toBe('neutral');
    expect(largeCommits.descriptiveNote).toBeUndefined();
    expect(largeCommits.healthyBoundary).toBe(THRESHOLDS.LARGE_COMMITS_PCT.healthy);
    expect(largeCommits.criticalBoundary).toBe(THRESHOLDS.LARGE_COMMITS_PCT.critical);
  });

  test('a --history override forces history_granularity, recording both the override and what detection actually found', async () => {
    // Detection alone would say squashed (majority PR-referenced subjects); the
    // override forces granular for this invocation without changing what detection
    // itself reported.
    mockExecSequenceWithHistorySignals(
      '', 'Dev',
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing (#101)`,
      NUMSTAT
    );

    const summary = await collectLocalMetrics({ history: 'granular' }).then(() => {
      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      return JSON.parse(summaryCall[1]);
    });

    expect(summary.history_granularity).toBe('granular');
    expect(summary.history_granularity_detected).toBe('squashed');
    expect(summary.history_granularity_override).toBe('granular');
  });

  test('writes local_metrics_summary.json with three-way test classification rates', async () => {
    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    // The fixture's one commit touches both src/app.js (prod) and src/app.test.js
    // (test) in the same commit, so test_coverage_rate must read 100.00 -- a value
    // check, not just a type check, so a dangling reference to the old field name
    // (which would silently compute 0.00 instead of throwing) cannot pass this test.
    expect(summary.test_coverage_rate).toBe('100.00');
    expect(typeof summary.test_isolation_rate).toBe('string');
    expect(typeof summary.uncovered_prod_rate).toBe('string');
    expect(summary.test_first_pct).toBeUndefined();
  });

  test('writes local_metrics_summary.json with statistical distribution fields', async () => {
    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(typeof summary.p50_lines_changed).toBe('number');
    expect(typeof summary.p90_lines_changed).toBe('number');
    expect(typeof summary.p95_lines_changed).toBe('number');
    expect(typeof summary.stddev_lines_changed).toBe('number');
    expect(typeof summary.p50_files_changed).toBe('number');
    expect(typeof summary.p90_files_changed).toBe('number');
    expect(['growing', 'stable', 'shrinking']).toContain(summary.commit_size_trend);
  });

  test('logs warnings and recommendations when commits are large', async () => {
    // 101 added lines → 100% large commit rate → critical warning + recommendation
    const bigNumstat = `101\t0\tsrc/app.js`;
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15|Dev|feat: big change`,
      bigNumstat
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await collectLocalMetrics();

    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toMatch(/CONCERNS DETECTED/);
    expect(allLogs).toMatch(/RECOMMENDATIONS/);
  });

  test('logs truncation message when more than 10 commits exist', async () => {
    // 11 unique commits — triggers the "... and N more" branch
    const commits = Array.from({ length: 11 }, (_, i) => {
      const sha = String(i).padStart(40, `${i}`);
      return `${sha}|2024-01-15|Dev|commit ${i}\x1e`;
    }).join('\n');

    const numstat = `1\t0\tsrc/file.js`;
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      commits,
      ...Array(11).fill(numstat)
    );
    fs.writeFileSync.mockImplementation(() => {});

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await collectLocalMetrics();

    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toMatch(/and \d+ more commits/);
  });

  test('logs Claude-skipped message when ANTHROPIC_API_KEY is absent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await collectLocalMetrics();
    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toMatch(/Claude analysis skipped/);
  });

  test('net_additions_ratio_median is bounded to 1.0 for all-new-file commits', async () => {
    // Regression test for formula bug: additions / max(deletions, 1) inflates ratio to ~500
    // for commits with zero deletions (net-new files). The correct bounded formula is:
    // (additions - deletions) / (additions + deletions) = (500 - 0) / (500 + 0) = 1.0
    const SHA2 = 'b'.repeat(40);
    const SHA3 = 'c'.repeat(40);
    const newFileNumstat = `500\t0\tsrc/newfile.js`;
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      [
        `${SHA}|2024-01-14T10:00:00Z|Dev|feat: new file one\x1e`,
        `${SHA2}|2024-01-15T10:00:00Z|Dev|feat: new file two\x1e`,
        `${SHA3}|2024-01-16T10:00:00Z|Dev|feat: new file three\x1e`
      ].join('\n'),
      newFileNumstat,
      newFileNumstat,
      newFileNumstat
    );

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    // New field name: net_additions_ratio_median
    expect(summary.net_additions_ratio_median).toBeDefined();
    // Must be bounded: 1.0 means 100% net-new code, not 500 (the broken formula's result)
    expect(summary.net_additions_ratio_median).toBeCloseTo(1.0, 5);
    expect(summary.net_additions_ratio_median).toBeLessThanOrEqual(1.0);
    expect(summary.net_additions_ratio_p90).toBeLessThanOrEqual(1.0);
  });

  test('deduplicates commits with the same SHA across branches', async () => {
    // Two branches both surface the same commit SHA
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x\n  feature/y',
      `${SHA}|2024-01-15|Dev|feat: thing`,  // git log feature/x
      `${SHA}|2024-01-15|Dev|feat: thing`,  // git log feature/y — same SHA
      NUMSTAT                                // git show (only called once after dedup)
    );

    await collectLocalMetrics();

    const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
    const written = JSON.parse(metricsCall[1]);
    expect(written).toHaveLength(1);
  });
});

describe('collectLocalMetrics — Claude API active', () => {
  const SHA = 'a'.repeat(40);
  const NUMSTAT = `110\t5\tsrc/app.js`;  // 115 prod lines → large_commit = true, additions >> deletions

  beforeEach(() => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      NUMSTAT
    );
    fs.writeFileSync.mockImplementation(() => {});
    claude.selectClaudeCommits.mockReturnValue([{
      sha: SHA.substring(0, 8),
      full_sha: SHA,
      message: 'feat: add thing',
      author: 'Dev',
      date: '2024-01-15T10:00:00Z',
      source_branch: 'feature/x'
    }]);
    claude.analyzeWithClaude.mockResolvedValue([{
      sha: SHA.substring(0, 8),
      ai_confidence: 75,
      risk_score: 80,
      patterns: ['generic variable names'],
      architectural_concerns: [],
      summary: 'Possible AI-generated code'
    }]);
  });

  test('annotates metrics and writes local_claude_analysis.json when Claude returns results', async () => {
    claude.getAnthropicClient.mockResolvedValue({});

    await collectLocalMetrics();

    // Four files: metrics, summary, claude analysis, and duplicate analysis
    // (Layer 1 always runs when the analyzed commits touch production files).
    expect(fs.writeFileSync).toHaveBeenCalledTimes(4);

    const claudeCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_claude_analysis'));
    expect(claudeCall).toBeDefined();
    const claudeOutput = JSON.parse(claudeCall[1]);
    expect(claudeOutput.model).toBe('claude-sonnet-4-6');
    expect(claudeOutput.commits_analyzed).toBe(1);
    expect(claudeOutput.results).toHaveLength(1);

    // Metric should be annotated with Claude fields
    const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
    const metrics = JSON.parse(metricsCall[1]);
    expect(metrics[0].ai_confidence).toBe(75);
    expect(metrics[0].risk_score).toBe(80);
    expect(metrics[0].patterns).toEqual(['generic variable names']);
  });

  test('logs Claude analysis section to console when metrics are annotated', async () => {
    claude.getAnthropicClient.mockResolvedValue({});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await collectLocalMetrics();

    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).toMatch(/CLAUDE AI ANALYSIS/);
    expect(allLogs).toMatch(/confidence=75%/);
    expect(allLogs).toMatch(/risk=80%/);
  });
});

describe('collectLocalMetrics — merged branch exclusion', () => {
  test('excludes a fully-merged remnant branch and falls back to trunk', async () => {
    const SHA = 'e'.repeat(40);
    mockExecSequenceWithMerged(
      '* main\n  remotes/origin/pl/alerts-history',        // git branch -a --merged main
      FAKE_ROOT,
      FAKE_REMOTE,
      '* main\n  remotes/origin/pl/alerts-history',        // git branch -a
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,   // git log against resolved default branch
      `10\t5\tsrc/app.js`                                  // git show numstat
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.workflow_type).toBe('trunk');
    expect(summary.branches_analyzed).toEqual(['main']);
  });

  test('retains a branch that is not fully merged', async () => {
    const SHA = 'f'.repeat(40);
    mockExecSequenceWithMerged(
      '* main',                                             // git branch -a --merged main: feature/x absent
      FAKE_ROOT,
      FAKE_REMOTE,
      '* main\n  feature/x',                                // git branch -a
      `${SHA}|2024-02-10T10:00:00Z|Dev|feat: unmerged work`, // git log feature/x
      `4\t1\tsrc/thing.js`                                   // git show numstat
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.workflow_type).toBe('feature_branch');
    expect(summary.branches_analyzed).toEqual(['feature/x']);
  });

  test('analyzes only the unmerged branch when both merged and unmerged exist', async () => {
    const SHA_UNMERGED = 'b'.repeat(40);
    mockExecSequenceWithMerged(
      '* main\n  feature/merged-remnant',                    // git branch -a --merged main
      FAKE_ROOT,
      FAKE_REMOTE,
      '* main\n  feature/merged-remnant\n  feature/unmerged', // git branch -a
      `${SHA_UNMERGED}|2024-03-05T10:00:00Z|Dev|feat: still open work`, // git log feature/unmerged
      `2\t0\tsrc/open.js`                                     // git show numstat
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.branches_analyzed).toEqual(['feature/unmerged']);
  });

  // GUARD, not a called-shot RED: the current code already returns early with
  // `allBranches` unfiltered when mergedOutput is empty (the `if (mergedOutput)`
  // guard never runs). Written to lock in that degradation path explicitly.
  test('filters nothing when the merged branch listing is unavailable', async () => {
    const SHA = 'c'.repeat(40);
    mockExecSequenceWithMerged(
      '',                                                    // git branch -a --merged main unavailable
      FAKE_ROOT,
      FAKE_REMOTE,
      '* main\n  feature/x',                                 // git branch -a
      `${SHA}|2024-04-12T10:00:00Z|Dev|feat: normal work`,   // git log feature/x
      `3\t2\tsrc/normal.js`                                   // git show numstat
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.workflow_type).toBe('feature_branch');
    expect(summary.branches_analyzed).toEqual(['feature/x']);
  });
});

describe('collectLocalMetrics — duplicate detection', () => {
  const SHA = 'a'.repeat(40);
  const NUMSTAT = `10\t5\tsrc/app.js\n3\t1\tsrc/app.test.js`;

  beforeEach(() => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      NUMSTAT
    );
    fs.writeFileSync.mockImplementation(() => {});
  });

  test("writes local_duplicate_analysis.json with static duplicates found across analyzed commits' production files", async () => {
    const fixtureDuplicate = { firstFile: { name: 'src/app.js', start: 1, end: 5 }, secondFile: { name: 'src/other.js', start: 1, end: 5 }, lines: 5, tokens: 60 };
    duplicate.runDuplicateAnalysis.mockReturnValue({ findings: [fixtureDuplicate], statistics: null });

    await collectLocalMetrics();

    expect(duplicate.runDuplicateAnalysis).toHaveBeenCalledWith(['src/app.js']);

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    expect(dupCall).toBeDefined();
    const output = JSON.parse(dupCall[1]);
    expect(output.static_duplicates).toEqual([fixtureDuplicate]);
  });

  test('excludes merge commits so their changes are not counted twice', async () => {
    // git show --numstat diffs a merge against its first parent, so merging a
    // single-commit branch reproduces that commit's diff exactly and the same change
    // is counted twice. Verified on flight-info-spike: merge 7126d5c and its child
    // dacea2c both reported 9 files and 943 lines. Asserting the git command because
    // which commits git emits is not observable locally.
    await collectLocalMetrics();

    const logCalls = execSync.mock.calls.map(c => c[0]).filter(c => String(c).includes('git log'));
    // The history-granularity merge-commit count query (`git log --merges ...`) is a
    // deliberate exception: its whole purpose is to count the true merges --no-merges
    // strips from every other git log call, so it is excluded from this assertion rather
    // than failing it.
    const analysisLogCalls = logCalls.filter(c => !String(c).includes('--merges '));
    expect(analysisLogCalls.length).toBeGreaterThan(0);
    analysisLogCalls.forEach(c => expect(c).toMatch(/--no-merges/));
  });

  test('scans for duplicates once, not once per consumer', async () => {
    duplicate.runDuplicateAnalysis.mockReturnValue({ findings: [], statistics: null });

    await collectLocalMetrics();

    // jscpd is the expensive part of a run. Findings and statistics come from one
    // combined call, so the findings-only wrapper must not be invoked as well.
    expect(duplicate.runDuplicateAnalysis).toHaveBeenCalledTimes(1);
    expect(duplicate.runDuplicateCheck).not.toHaveBeenCalled();
  });

  test('writes local_duplicate_analysis.json with statistics captured from runDuplicateAnalysis', async () => {
    const fixtureStatistics = { clones: 2, duplicatedLines: 12, lines: 1595, sources: 11, percentage: 0.75 };
    duplicate.runDuplicateAnalysis.mockReturnValue({ findings: [], statistics: fixtureStatistics });

    await collectLocalMetrics();

    expect(duplicate.runDuplicateAnalysis).toHaveBeenCalledWith(['src/app.js']);

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.statistics).toEqual(fixtureStatistics);
  });

  test('reads the semantic outcome from the analysis result, not a hidden marker', async () => {
    claude.getAnthropicClient.mockResolvedValue({});
    claude.selectClaudeCommits.mockReturnValue([]);
    duplicate.resolveModuleNeighbors.mockReturnValue(['src/app.js']);
    claude.runSemanticDuplicateAnalysis.mockResolvedValue({ status: 'ok', findings: [] });

    await collectLocalMetrics();

    // The outcome travels as a plain field on the result. Smuggling it back as a
    // concealed property on the returned array would make this fail.
    expect(claude.runSemanticDuplicateAnalysis).toHaveBeenCalled();
    expect(claude.analyzeDuplicatesWithClaude).not.toHaveBeenCalled();
  });

  test('does not call the Claude semantic layer when no ANTHROPIC_API_KEY is set', async () => {
    await collectLocalMetrics();

    expect(claude.runSemanticDuplicateAnalysis).not.toHaveBeenCalled();

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.layers_run).toEqual({ static: true, semantic: false });
  });

  test('calls the Claude semantic layer with module-neighbor-resolved files when a client is available', async () => {
    claude.getAnthropicClient.mockResolvedValue({});
    claude.selectClaudeCommits.mockReturnValue([]);
    duplicate.resolveModuleNeighbors.mockReturnValue(['src/app.js', 'src/util.js']);
    claude.runSemanticDuplicateAnalysis.mockResolvedValue({
      status: 'ok',
      findings: [{ file1: 'src/app.js', file2: 'src/util.js', similarity: 'high', confidence: 0.9 }]
    });

    await collectLocalMetrics();

    expect(duplicate.resolveModuleNeighbors).toHaveBeenCalledWith(['src/app.js']);
    expect(claude.runSemanticDuplicateAnalysis).toHaveBeenCalledWith({}, ['src/app.js', 'src/util.js'], []);

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.semantic_findings).toEqual([
      { file1: 'src/app.js', file2: 'src/util.js', similarity: 'high', confidence: 0.9 }
    ]);
    expect(output.layers_run).toEqual({ static: true, semantic: true });
  });

  test('writes layers_run.semantic as "unmeasured" when the Claude semantic call fails or truncates, never a confident true', async () => {
    claude.getAnthropicClient.mockResolvedValue({});
    claude.selectClaudeCommits.mockReturnValue([]);
    duplicate.resolveModuleNeighbors.mockReturnValue(['src/app.js']);
    claude.runSemanticDuplicateAnalysis.mockResolvedValue({ status: 'unmeasured', findings: [], error: 'response truncated at max_tokens' });

    await collectLocalMetrics();

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.semantic_findings).toEqual([]);
    expect(output.layers_run).toEqual({ static: true, semantic: 'unmeasured' });
  });

  // code-quality-metrics-tjn: lib/duplicate.js reports unsupportedExtensions rather than a
  // statistics object when jscpd recognizes none of the scanned files' languages (verified
  // live against remote_retro, Elixir). local-code-metrics.js must carry that through to
  // local_duplicate_analysis.json rather than silently dropping it, and must not claim Layer 1
  // produced a real measurement when it did not.
  test('writes unsupported_extensions and marks layers_run.static "unmeasured" when the duplicate scan reports an unsupported language', async () => {
    duplicate.runDuplicateAnalysis.mockReturnValue({
      findings: [],
      statistics: null,
      unsupportedExtensions: ['.ex', '.exs']
    });

    await collectLocalMetrics();

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.unsupported_extensions).toEqual(['.ex', '.exs']);
    expect(output.layers_run).toEqual({ static: 'unmeasured', semantic: false });
  });

  test('GUARD: omits unsupported_extensions and keeps layers_run.static true when the duplicate scan found no unsupported language', async () => {
    duplicate.runDuplicateAnalysis.mockReturnValue({ findings: [], statistics: null });

    await collectLocalMetrics();

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.unsupported_extensions).toBeUndefined();
    expect(output.layers_run).toEqual({ static: true, semantic: false });
  });

  // Locks in the guard in local-code-metrics.js (`if (prodFilePaths.length > 0)`):
  // when every analyzed commit is test-only, there is nothing for jscpd to scan,
  // so local_duplicate_analysis.json is omitted entirely rather than written
  // with empty arrays. This mirrors generate-drift-report.js's graceful handling
  // of a missing file, so a test-only analysis run still renders a clean report.
  test('does not write local_duplicate_analysis.json when the analyzed commits touch no production files', async () => {
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      '3\t1\tsrc/app.test.js' // test-only commit: no production files touched
    );

    await collectLocalMetrics();

    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    expect(dupCall).toBeUndefined();
  });
});

describe('collectLocalMetrics — repo-local .codemetrics.json override (code-quality-metrics-wcj)', () => {
  test('unions a class A override into CONFIG and records it in the summary config_sources', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t5\tsrc/app.js`
    );
    fs.existsSync.mockImplementation(p => typeof p === 'string' && p.endsWith('.codemetrics.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ DUPLICATE_IGNORE_PATTERNS: ['**/flight-info-spike-example/**'] }));
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.config_sources.overrides.DUPLICATE_IGNORE_PATTERNS).toContain('**/flight-info-spike-example/**');
    expect(summary.config_sources.overrides.DUPLICATE_IGNORE_PATTERNS).toContain('**/deps/**');
    expect(summary.config_sources.class_b_overridden).toBe(false);
    expect(summary.config_sources.files).toHaveLength(1);
    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).toContain('**/flight-info-spike-example/**');
  });

  // code-quality-metrics-3yd/1tp: ANALYSIS_IGNORE_PATTERNS must be reset-then-applied the
  // same way DUPLICATE_IGNORE_PATTERNS already is above, or CONFIG_OVERRIDABLE_DEFAULTS
  // lacking the key makes resolveConfigOverrides's union spread `[...effective[key], ...]`
  // spread `undefined` the moment a repo actually configures it.
  test('unions a repo-local ANALYSIS_IGNORE_PATTERNS override into CONFIG and records it in the summary config_sources', async () => {
    const SHA = 'f'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t5\tsrc/app.js`
    );
    fs.existsSync.mockImplementation(p => typeof p === 'string' && p.endsWith('.codemetrics.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ ANALYSIS_IGNORE_PATTERNS: ['**/bin/**'] }));
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.config_sources.overrides.ANALYSIS_IGNORE_PATTERNS).toEqual(['**/bin/**']);
    expect(CONFIG.ANALYSIS_IGNORE_PATTERNS).toEqual(['**/bin/**']);
  });

  // GUARD: proves resolveConfigOverrides is re-applied to CONFIG fresh on every
  // run rather than accumulating, since CONFIG is a shared, mutated singleton
  // across every invocation in this same process (this test file included).
  // Written to catch the exact "reads its own expectation back out of the
  // code under test" shape called out for this work: without a reset step,
  // this run would still see the previous run's override and pass for the
  // wrong reason.
  test('[guard] resets CONFIG to the true defaults on a run with no override, after a previous run applied one', async () => {
    const SHA_ONE = 'b'.repeat(40);
    mockExecSequence(
      FAKE_ROOT, FAKE_REMOTE, 'main',
      `${SHA_ONE}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t5\tsrc/app.js`
    );
    fs.existsSync.mockImplementation(p => typeof p === 'string' && p.endsWith('.codemetrics.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ DUPLICATE_IGNORE_PATTERNS: ['**/flight-info-spike-example/**'] }));
    fs.writeFileSync.mockImplementation(() => {});
    await collectLocalMetrics();
    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).toContain('**/flight-info-spike-example/**');

    const SHA_TWO = 'e'.repeat(40);
    mockExecSequence(
      FAKE_ROOT, FAKE_REMOTE, 'main',
      `${SHA_TWO}|2024-01-16T10:00:00Z|Dev|feat: add another thing`,
      `10\t5\tsrc/app2.js`
    );
    fs.existsSync.mockReturnValue(false);

    await collectLocalMetrics();

    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).not.toContain('**/flight-info-spike-example/**');
    const secondSummaryCall = fs.writeFileSync.mock.calls
      .filter(c => c[0].includes('local_metrics_summary'))
      .pop();
    expect(JSON.parse(secondSummaryCall[1]).config_sources.files).toEqual([]);
  });
});

// code-quality-metrics-ap7: --config <path> lets a scripted run against a repository the
// operator does not control supply an override from outside the analysis target, since it
// cannot commit a .codemetrics.json into that repo.
describe('collectLocalMetrics — explicit --config path override (code-quality-metrics-ap7)', () => {
  test('applies an override from an explicit --config path and records it in config_sources.files', async () => {
    const SHA = 'c'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t5\tsrc/app.js`
    );
    const explicitConfigPath = '/shared/outside-repo/.codemetrics.json';
    // No .codemetrics.json in the analysis target itself -- only the explicit path exists.
    fs.existsSync.mockImplementation(p => p === explicitConfigPath);
    fs.statSync.mockReturnValue({ isDirectory: () => false });
    fs.readFileSync.mockReturnValue(JSON.stringify({ DUPLICATE_IGNORE_PATTERNS: ['**/flight-info-spike-example/**'] }));
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ config: explicitConfigPath });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.config_sources.files).toContain(explicitConfigPath);
    expect(summary.config_sources.overrides.DUPLICATE_IGNORE_PATTERNS).toContain('**/flight-info-spike-example/**');
    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).toContain('**/flight-info-spike-example/**');
  });

  // GUARD: proven by making applyOverrideFile never set classBOverridden for the
  // explicit-path branch specifically (hardcode the explicit-file contribution to
  // bypass the CLASS_B_KEYS check) -- with that mutation config_sources.class_b_overridden
  // comes back false even though DUPLICATE_MIN_LINES was overridden, and this test starts
  // failing. This is the direct proof that a class B override supplied by --config
  // withholds the duplication verdict identically to one supplied by the target file's own
  // .codemetrics.json (AGENTS.md's "Per-Repo Configuration Overrides", lib/report.js's
  // buildMetricCatalog reads only this boolean, never which route produced it).
  test('a class B override supplied via --config alone sets config_sources.class_b_overridden true, the same as the file route', async () => {
    const SHA = 'd'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t5\tsrc/app.js`
    );
    const explicitConfigPath = '/shared/outside-repo/.codemetrics.json';
    fs.existsSync.mockImplementation(p => p === explicitConfigPath);
    fs.statSync.mockReturnValue({ isDirectory: () => false });
    fs.readFileSync.mockReturnValue(JSON.stringify({ DUPLICATE_MIN_LINES: 5 }));
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ config: explicitConfigPath });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.config_sources.class_b_overridden).toBe(true);
    expect(CONFIG.DUPLICATE_MIN_LINES).toBe(5);
  });
});

describe('collectLocalMetrics — analysis exclusions and vendored-default share (code-quality-metrics-3b6)', () => {
  test('writes local_metrics_summary.json with an analysis_exclusions block reporting excluded file/line counts and share', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      // 500 lines in an excluded bin/ file, 10 lines in an ordinary file: 510 total.
      `500\t0\tbin/Debug/App.dll\n10\t0\tsrc/app.js`
    );
    fs.existsSync.mockImplementation(p => typeof p === 'string' && p.endsWith('.codemetrics.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ ANALYSIS_IGNORE_PATTERNS: ['**/bin/**'] }));
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.analysis_exclusions.patterns).toContain('**/bin/**');
    expect(summary.analysis_exclusions.excluded_files_count).toBe(1);
    expect(summary.analysis_exclusions.excluded_lines_count).toBe(500);
    // 500 of 510 total lines analyzed excluded.
    expect(summary.analysis_exclusions.excluded_lines_pct).toBe('98.04');
  });

  test('reports zero excluded volume when ANALYSIS_IGNORE_PATTERNS is not configured (default)', async () => {
    const SHA = 'b'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.analysis_exclusions.patterns).toEqual([]);
    expect(summary.analysis_exclusions.excluded_files_count).toBe(0);
    expect(summary.analysis_exclusions.excluded_lines_pct).toBe('0.00');
  });

  // The higher-value half (code-quality-metrics-3b6): visible even when nothing is
  // configured, since CONFIG.DUPLICATE_IGNORE_PATTERNS's defaults are not empty.
  test('reports vendored_generated_share even when ANALYSIS_IGNORE_PATTERNS is not configured', async () => {
    const SHA = 'c'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `300\t0\tvendor/lib.js\n10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.vendored_generated_share.files_count).toBe(1);
    expect(summary.vendored_generated_share.lines_count).toBe(300);
    // 300 of 310 total lines.
    expect(summary.vendored_generated_share.lines_pct).toBe('96.77');
  });
});

describe('collectLocalMetrics — HEAD-anchored window (code-quality-metrics-g10)', () => {
  test('uses --max-count instead of --since when no CLI window flag is given', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const branchLogCommand = execSync.mock.calls
      .map(call => String(call[0]))
      .find(cmd => cmd.startsWith('git log --no-merges') && cmd.includes('feature/x'));
    expect(branchLogCommand).toBeDefined();
    expect(branchLogCommand).not.toMatch(/--since=/);
    expect(branchLogCommand).toMatch(new RegExp(`--max-count=${CONFIG.MAX_COMMITS}`));
  });

  test('selects the globally newest MAX_COMMITS commits across branches, not the first ones encountered in branch order', async () => {
    const originalMaxCommits = CONFIG.MAX_COMMITS;
    CONFIG.MAX_COMMITS = 2;
    try {
      const SHA_OLDEST = 'a'.repeat(40);
      const SHA_MIDDLE = 'b'.repeat(40);
      const SHA_NEWEST = 'c'.repeat(40);
      // Branch order (a, b, c) matches commit-age order (oldest, middle, newest): if the
      // implementation slices the first MAX_COMMITS commits in encounter order instead of
      // sorting by date first, it keeps the oldest two (a, b) and drops the actual newest (c).
      // All three branch `git log` calls happen first, in the branch loop; `git show
      // --numstat` calls happen afterward, once per commit that survives selection into
      // commitsToAnalyze, in that array's (post-sort) order. SHA_OLDEST is dropped by
      // selection, so it never reaches a numstat call.
      mockExecSequence(
        FAKE_ROOT,
        FAKE_REMOTE,
        '  feature/a\n  feature/b\n  feature/c',
        `${SHA_OLDEST}|2020-01-01T10:00:00Z|Dev|feat: oldest`,  // git log feature/a
        `${SHA_MIDDLE}|2026-08-01T10:00:00Z|Dev|feat: middle`,  // git log feature/b
        `${SHA_NEWEST}|2026-08-10T10:00:00Z|Dev|feat: newest`,  // git log feature/c
        `1\t0\tsrc/b.js`,  // numstat for SHA_MIDDLE (analyzed first: oldest of the selected two)
        `1\t0\tsrc/c.js`   // numstat for SHA_NEWEST (analyzed second)
      );
      fs.writeFileSync.mockImplementation(() => {});

      await collectLocalMetrics();

      const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
      const commitMetrics = JSON.parse(metricsCall[1]);
      const shas = commitMetrics.map(m => m.full_sha);

      expect(shas).toContain(SHA_NEWEST);
      expect(shas).toContain(SHA_MIDDLE);
      expect(shas).not.toContain(SHA_OLDEST);
    } finally {
      CONFIG.MAX_COMMITS = originalMaxCommits;
    }
  });

  test('reports analyzed_span_start/analyzed_span_end matching the real oldest and newest analyzed commit dates, not the requested window', async () => {
    const SHA1 = 'a'.repeat(40);
    const SHA2 = 'b'.repeat(40);
    // Both commits are ~300 days before "now" (well outside the old default 30-day window),
    // matching the measured daloopa shape cited in code-quality-metrics-g10.
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      [
        `${SHA1}|2025-10-12T10:00:00Z|Dev|feat: old work one\x1e`,
        `${SHA2}|2025-10-20T10:00:00Z|Dev|feat: old work two\x1e`
      ].join('\n'),
      `1\t0\tsrc/one.js`,
      `1\t0\tsrc/two.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.total_commits).toBe(2);
    expect(summary.analyzed_span_start).toBe('2025-10-12');
    expect(summary.analyzed_span_end).toBe('2025-10-20');
    expect(summary.window_widened).toBe(false);
  });

  test('widens an explicit --since window that returns zero commits to the newest MAX_COMMITS, and reports window_widened', async () => {
    const SHA1 = 'd'.repeat(40);
    const SHA2 = 'e'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',   // git branch -a — no main/master, so defaultBranch is null, fallbackRef is 'HEAD'
      '',              // git log feature/x --since=2020-01-01 — zero commits
      '',              // git log HEAD --since=2020-01-01 (existing trunk fallback) — zero commits
      [                // git log HEAD --max-count (the widen fallback) — real commits, ignoring the date
        `${SHA1}|2026-07-30T10:00:00Z|Dev|feat: widened one\x1e`,
        `${SHA2}|2026-08-05T10:00:00Z|Dev|feat: widened two\x1e`
      ].join('\n'),
      `1\t0\tsrc/one.js`,
      `1\t0\tsrc/two.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ since: '2020-01-01' });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    expect(summaryCall).toBeDefined();
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.total_commits).toBe(2);
    expect(summary.window_widened).toBe(true);
    expect(summary.window_requested_since).toBe('2020-01-01');
    expect(summary.analyzed_span_start).toBe('2026-07-30');
    expect(summary.analyzed_span_end).toBe('2026-08-05');
  });
});

describe('collectLocalMetrics — committer-date selection (code-quality-metrics-mbiw)', () => {
  test('requests committer date (%ci) from git log rather than author date (%ai), so commit selection sorts on the same clock --since filters by', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2026-08-10T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const branchLogCommand = execSync.mock.calls
      .map(call => String(call[0]))
      .find(cmd => cmd.startsWith('git log --no-merges') && cmd.includes('feature/x'));
    expect(branchLogCommand).toBeDefined();
    expect(branchLogCommand).toContain('%ci');
    expect(branchLogCommand).not.toContain('%ai');
  });
});

describe('collectLocalMetrics — branch spread visibility (code-quality-metrics-8sq)', () => {
  test('reports how many distinct branches actually contributed to the analyzed commit set, alongside the raw commit count', async () => {
    const SHA_A1 = 'a'.repeat(40);
    const SHA_A2 = 'b'.repeat(40);
    const SHA_B1 = 'c'.repeat(40);
    // All branch `git log` calls happen first, in the branch loop; `git show --numstat` calls
    // happen afterward, once per analyzed commit, in commitsToAnalyze's date-ascending order.
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/a\n  feature/b',
      [
        `${SHA_A1}|2026-08-01T10:00:00Z|Dev|feat: a one\x1e`,
        `${SHA_A2}|2026-08-02T10:00:00Z|Dev|feat: a two\x1e`
      ].join('\n'),                        // git log feature/a
      `${SHA_B1}|2026-08-03T10:00:00Z|Dev|feat: b one`,  // git log feature/b
      `1\t0\tsrc/a1.js`,  // numstat SHA_A1 (2026-08-01, analyzed first)
      `1\t0\tsrc/a2.js`,  // numstat SHA_A2 (2026-08-02)
      `1\t0\tsrc/b1.js`   // numstat SHA_B1 (2026-08-03, analyzed last)
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);

    expect(summary.total_commits).toBe(3);
    expect(summary.analyzed_branch_commit_counts).toEqual({ 'feature/a': 2, 'feature/b': 1 });
    expect(summary.branches_with_analyzed_commits).toBe(2);
  });
});

describe('collectLocalMetrics — bot commit exclusion (issue #62)', () => {
  test('excludes a dependabot commit from the analyzed metrics and reports it separately in the summary', async () => {
    const SHA_HUMAN = 'a'.repeat(40);
    const SHA_BOT = 'b'.repeat(40);
    // commitsToAnalyze is re-sorted oldest-first before analysis, so the bot commit (older)
    // would be processed first if it were not filtered out before the analyzeCommit loop --
    // it must never reach `git show --numstat` at all, so only one numstat value is supplied.
    const gitLog = [
      `${SHA_BOT}|2024-01-14T10:00:00Z|dependabot[bot]|chore(deps): bump lodash from 4.17.20 to 4.17.21`,
      `${SHA_HUMAN}|2024-01-15T10:00:00Z|Dev|feat: add thing`
    ].join('\x1e');
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      'main',
      gitLog,
      `10\t5\tsrc/app.js` // numstat for the human commit only
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const metricsCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_commit_metrics'));
    const metrics = JSON.parse(metricsCall[1]);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].sha).toBe(SHA_HUMAN.substring(0, 8));

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.total_commits).toBe(1);
    expect(summary.bot_commits_count).toBe(1);
    expect(summary.bot_commits_pct).toBe('50.00');
  });
});

describe('collectLocalMetrics — --max-commits override', () => {
  test('uses the --max-commits override instead of the default MAX_COMMITS for the per-branch --max-count when no --since is given', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ maxCommits: 5 });

    const branchLogCommand = execSync.mock.calls
      .map(call => String(call[0]))
      .find(cmd => cmd.startsWith('git log --no-merges') && cmd.includes('feature/x'));
    expect(branchLogCommand).toBeDefined();
    expect(branchLogCommand).toMatch(/--max-count=5\b/);
  });

  test('omits --max-count entirely for the unbounded sentinel when no --since is given', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ maxCommits: 'unbounded' });

    const branchLogCommand = execSync.mock.calls
      .map(call => String(call[0]))
      .find(cmd => cmd.startsWith('git log --no-merges') && cmd.includes('feature/x'));
    expect(branchLogCommand).toBeDefined();
    expect(branchLogCommand).not.toMatch(/--max-count=/);

    // Also confirms the safety pre-flight rev-list call did not shift a positional value onto
    // this git log call: the real commit was parsed, not the pre-flight's own mocked output.
    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.total_commits).toBe(1);
  });

  test('raises the final analyzed-commit cap above the default MAX_COMMITS when combined with --since', async () => {
    // fetchBranchCommits does not apply any --max-count when sinceStr is set (it never has --
    // see fetchBranchCommits' own comment), so the per-branch git log already returns every
    // commit in the dated window; only the final global slice enforces a count cap in that
    // mode. Lowering CONFIG.MAX_COMMITS to 2 makes a 3-commit window prove the cap: without the
    // override, the default would truncate to 2; --max-commits 3 must let all 3 through.
    const originalMaxCommits = CONFIG.MAX_COMMITS;
    CONFIG.MAX_COMMITS = 2;
    try {
      const SHA1 = 'a'.repeat(40);
      const SHA2 = 'b'.repeat(40);
      const SHA3 = 'c'.repeat(40);
      mockExecSequence(
        FAKE_ROOT,
        FAKE_REMOTE,
        '  feature/x',
        [
          `${SHA1}|2026-08-01T10:00:00Z|Dev|feat: one\x1e`,
          `${SHA2}|2026-08-02T10:00:00Z|Dev|feat: two\x1e`,
          `${SHA3}|2026-08-03T10:00:00Z|Dev|feat: three\x1e`
        ].join('\n'),
        `1\t0\tsrc/one.js`,
        `1\t0\tsrc/two.js`,
        `1\t0\tsrc/three.js`
      );
      fs.writeFileSync.mockImplementation(() => {});

      await collectLocalMetrics({ since: '2020-01-01', maxCommits: 3 });

      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      const summary = JSON.parse(summaryCall[1]);
      expect(summary.total_commits).toBe(3);
    } finally {
      CONFIG.MAX_COMMITS = originalMaxCommits;
    }
  });

  test('the unbounded sentinel combined with --since analyzes every commit found, with no cap', async () => {
    const originalMaxCommits = CONFIG.MAX_COMMITS;
    CONFIG.MAX_COMMITS = 2;
    try {
      const SHA1 = 'a'.repeat(40);
      const SHA2 = 'b'.repeat(40);
      const SHA3 = 'c'.repeat(40);
      mockExecSequence(
        FAKE_ROOT,
        FAKE_REMOTE,
        '  feature/x',
        [
          `${SHA1}|2026-08-01T10:00:00Z|Dev|feat: one\x1e`,
          `${SHA2}|2026-08-02T10:00:00Z|Dev|feat: two\x1e`,
          `${SHA3}|2026-08-03T10:00:00Z|Dev|feat: three\x1e`
        ].join('\n'),
        `1\t0\tsrc/one.js`,
        `1\t0\tsrc/two.js`,
        `1\t0\tsrc/three.js`
      );
      fs.writeFileSync.mockImplementation(() => {});

      await collectLocalMetrics({ since: '2020-01-01', maxCommits: 'unbounded' });

      const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
      const summary = JSON.parse(summaryCall[1]);
      expect(summary.total_commits).toBe(3);
    } finally {
      CONFIG.MAX_COMMITS = originalMaxCommits;
    }
  });

  // Interaction case: an explicit --since window that returns zero commits still widens
  // (code-quality-metrics-g10's existing fallback), but the widen fetch itself must keep using
  // the true default CONFIG.MAX_COMMITS regardless of --max-commits -- a widen is a substitute
  // default-shaped HEAD-anchored sample, not "the requested window", and an unbounded or
  // oversized override reaching it would defeat the safety this project's own default provides.
  // The override still governs the final analyzed-commit count, the same as any other run.
  test('the widen fallback fetch keeps the true default MAX_COMMITS regardless of --max-commits, but the override still caps the final analyzed count', async () => {
    const SHA1 = 'a'.repeat(40);
    const SHA2 = 'b'.repeat(40);
    const SHA3 = 'c'.repeat(40);
    const SHA4 = 'd'.repeat(40);
    const SHA5 = 'e'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',   // git branch -a — no main/master, so defaultBranch is null, fallbackRef is 'HEAD'
      '',              // git log feature/x --since=2020-01-01 — zero commits
      '',              // git log HEAD --since=2020-01-01 (existing trunk fallback) — zero commits
      [                // git log HEAD --max-count (the widen fallback) — 5 real commits
        `${SHA1}|2026-08-01T10:00:00Z|Dev|feat: one\x1e`,
        `${SHA2}|2026-08-02T10:00:00Z|Dev|feat: two\x1e`,
        `${SHA3}|2026-08-03T10:00:00Z|Dev|feat: three\x1e`,
        `${SHA4}|2026-08-04T10:00:00Z|Dev|feat: four\x1e`,
        `${SHA5}|2026-08-05T10:00:00Z|Dev|feat: five\x1e`
      ].join('\n'),
      `1\t0\tsrc/three.js`, // numstat for the newest 3 kept by the --max-commits 3 override
      `1\t0\tsrc/four.js`,
      `1\t0\tsrc/five.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ since: '2020-01-01', maxCommits: 3 });

    const widenCommand = execSync.mock.calls
      .map(call => String(call[0]))
      .find(cmd => cmd.startsWith('git log --no-merges') && cmd.includes('--max-count'));
    expect(widenCommand).toBeDefined();
    expect(widenCommand).toMatch(new RegExp(`--max-count=${CONFIG.MAX_COMMITS}\\b`));

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.total_commits).toBe(3);
    expect(summary.window_widened).toBe(true);
  });

  // GitHub #89: an unbounded git log fetch over a very large history can throw ENOBUFS, an
  // error runGitCommand's own catch swallows into an empty result -- reading as "zero commits
  // found" rather than surfacing the real problem. The safety pre-flight must stop the run
  // before that fetch is ever attempted, not after.
  test('throws a loud error before fetching the full log when an unbounded run would exceed the safety limit', async () => {
    execSync.mockImplementation(command => {
      const cmd = String(command);
      if (cmd === 'git rev-parse --show-toplevel') return FAKE_ROOT;
      if (cmd === 'git remote get-url origin') return FAKE_REMOTE;
      if (cmd === 'git branch -a') return '  feature/x';
      if (cmd.includes('--merged')) return '';
      if (cmd.includes('rev-list') && cmd.includes('--count')) return String(CONFIG.MAX_COMMITS_SAFETY_LIMIT + 1);
      throw new Error(`unexpected command reached after the safety check should have stopped the run: ${cmd}`);
    });
    fs.writeFileSync.mockImplementation(() => {});

    await expect(collectLocalMetrics({ maxCommits: 'unbounded' }))
      .rejects.toThrow(new RegExp(String(CONFIG.MAX_COMMITS_SAFETY_LIMIT)));

    const fullFetchAttempted = execSync.mock.calls.some(call => String(call[0]).includes('--pretty=format'));
    expect(fullFetchAttempted).toBe(false);
  });

  // Visibility (the task's own requirement): an analysis run over hundreds of commits is not
  // comparable to one over the default 50, and a reader comparing two reports must be able to
  // tell that an override was requested, the same way history_granularity_override and
  // project_lifecycle_override already record their own overrides alongside the effective
  // value they produced.
  test('records max_commits_override in the summary: null by default, echoing whatever was requested otherwise', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics();

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.max_commits_override).toBeNull();
  });

  test('records a numeric max_commits_override in the summary when --max-commits <n> is given', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ maxCommits: 5 });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.max_commits_override).toBe(5);
  });

  test('records max_commits_override as "unbounded" when the unbounded sentinel is given', async () => {
    const SHA = 'a'.repeat(40);
    mockExecSequence(
      FAKE_ROOT,
      FAKE_REMOTE,
      '  feature/x',
      `${SHA}|2024-01-15T10:00:00Z|Dev|feat: add thing`,
      `10\t0\tsrc/app.js`
    );
    fs.writeFileSync.mockImplementation(() => {});

    await collectLocalMetrics({ maxCommits: 'unbounded' });

    const summaryCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_metrics_summary'));
    const summary = JSON.parse(summaryCall[1]);
    expect(summary.max_commits_override).toBe('unbounded');
  });
});
