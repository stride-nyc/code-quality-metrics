'use strict';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../lib/claude');

const { execSync } = require('child_process');
const fs = require('fs');
const claude = require('../lib/claude');
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

  test('writes two output files', async () => {
    await collectLocalMetrics();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
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

    // Three files: metrics, summary, claude analysis
    expect(fs.writeFileSync).toHaveBeenCalledTimes(3);

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
