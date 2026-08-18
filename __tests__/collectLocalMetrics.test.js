'use strict';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../lib/claude');
jest.mock('../lib/duplicate');

const { execSync } = require('child_process');
const fs = require('fs');
const claude = require('../lib/claude');
const duplicate = require('../lib/duplicate');
const { collectLocalMetrics } = require('../local-code-metrics');

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
    if (typeof command === 'string' && command.includes('%cn')) return '';
    // Tests predating the merge-commit double-count guard supply no value for
    // analyzeCommit's own parent-count check (`git show --no-patch --format=%P`).
    // Answer it out of band too, with a single parent -- i.e. "not a merge" --
    // so every commit under test is still analyzed rather than skipped.
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
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
    if (typeof command === 'string' && command.includes('%cn')) return '';
    // Tests predating the merge-commit double-count guard supply no value for
    // analyzeCommit's own parent-count check (`git show --no-patch --format=%P`).
    // Answer it out of band too, with a single parent -- i.e. "not a merge" --
    // so every commit under test is still analyzed rather than skipped.
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
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
    if (typeof command === 'string' && command.includes('%cn')) return committerNamesOutput;
    if (typeof command === 'string' && command.includes('%P')) return 'p'.repeat(40);
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

describe('collectLocalMetrics — early exits', () => {
  test('exits with code 1 when not in a git repository', async () => {
    mockExecSequence(''); // git rev-parse returns empty

    await expect(collectLocalMetrics()).rejects.toThrow('process.exit');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('exits with code 1 when git branch listing fails', async () => {
    mockExecSequence(
      FAKE_ROOT,    // git rev-parse --show-toplevel
      FAKE_REMOTE,  // git remote get-url origin
      ''            // git branch → empty
    );

    await expect(collectLocalMetrics()).rejects.toThrow('process.exit');
    expect(process.exit).toHaveBeenCalledWith(1);
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
    expect(typeof summary.test_coverage_rate).toBe('string');
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
