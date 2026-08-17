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
  duplicate.resolveModuleNeighbors.mockImplementation(paths => paths);
  claude.analyzeDuplicatesWithClaude.mockResolvedValue([]);
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
  execSync.mockImplementation(() => {
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
      return `${sha}|2024-01-15|Dev|commit ${i}`;
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
        `${SHA}|2024-01-14T10:00:00Z|Dev|feat: new file one`,
        `${SHA2}|2024-01-15T10:00:00Z|Dev|feat: new file two`,
        `${SHA3}|2024-01-16T10:00:00Z|Dev|feat: new file three`
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
    duplicate.runDuplicateCheck.mockReturnValue([fixtureDuplicate]);

    await collectLocalMetrics();

    expect(duplicate.runDuplicateCheck).toHaveBeenCalledWith(['src/app.js']);

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    expect(dupCall).toBeDefined();
    const output = JSON.parse(dupCall[1]);
    expect(output.static_duplicates).toEqual([fixtureDuplicate]);
  });

  test('does not call the Claude semantic layer when no ANTHROPIC_API_KEY is set', async () => {
    await collectLocalMetrics();

    expect(claude.analyzeDuplicatesWithClaude).not.toHaveBeenCalled();

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.layers_run).toEqual({ static: true, semantic: false });
  });

  test('calls the Claude semantic layer with module-neighbor-resolved files when a client is available', async () => {
    claude.getAnthropicClient.mockResolvedValue({});
    claude.selectClaudeCommits.mockReturnValue([]);
    duplicate.resolveModuleNeighbors.mockReturnValue(['src/app.js', 'src/util.js']);
    claude.analyzeDuplicatesWithClaude.mockResolvedValue([
      { file1: 'src/app.js', file2: 'src/util.js', similarity: 'high', confidence: 0.9 }
    ]);

    await collectLocalMetrics();

    expect(duplicate.resolveModuleNeighbors).toHaveBeenCalledWith(['src/app.js']);
    expect(claude.analyzeDuplicatesWithClaude).toHaveBeenCalledWith({}, ['src/app.js', 'src/util.js'], []);

    const dupCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('local_duplicate_analysis'));
    const output = JSON.parse(dupCall[1]);
    expect(output.semantic_findings).toEqual([
      { file1: 'src/app.js', file2: 'src/util.js', similarity: 'high', confidence: 0.9 }
    ]);
    expect(output.layers_run).toEqual({ static: true, semantic: true });
  });
});
