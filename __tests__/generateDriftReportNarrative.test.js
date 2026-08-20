'use strict';

jest.mock('../lib/claude');

const fs = require('fs');
const os = require('os');
const path = require('path');

const claude = require('../lib/claude');
const { generateReport, generateReportWithNarrative } = require('../generate-drift-report');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'drift-report-narrative-test-'));
}

function writeFixtureInputs(dir) {
  const summary = {
    analysis_date: '2026-08-17T00:00:00.000Z',
    analysis_period_days: 30,
    total_commits: 2,
    filtered_from: 2,
    workflow_type: 'feature_branch',
    branches_analyzed: ['main'],
    branch_commit_counts: { main: 2 },
    large_commits_pct: '40.00',
    sprawling_commits_pct: '8.00',
    test_coverage_rate: '55.00',
    test_isolation_rate: '5.00',
    uncovered_prod_rate: '5.00',
    avg_files_changed: '3.00',
    avg_lines_changed: '120.00',
    p50_lines_changed: 40,
    p90_lines_changed: 150,
    p95_lines_changed: 180,
    stddev_lines_changed: 30,
    p50_files_changed: 2,
    p90_files_changed: 5,
    commit_size_trend: 'stable',
    velocity_commits_per_day: 3.2,
    velocity_trend: 'stable',
    net_additions_ratio_median: 0.2,
    net_additions_ratio_p90: 0.4,
    message_quality_pct: '70.00',
    dora_archetype: 'foundational-challenges',
    config: {},
    note: 'test summary'
  };
  const metrics = [
    { sha: 'aaa11111', full_sha: 'aaa1111111111111111111111111111111111111', date: '2026-08-01T00:00:00.000Z', author: 'Alice', message: 'feat: add widget', total_additions: 200, total_deletions: 50, files_changed: 4, counted_additions: 200, counted_deletions: 50 }
  ];
  fs.writeFileSync(path.join(dir, 'local_metrics_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(dir, 'local_commit_metrics.json'), JSON.stringify(metrics, null, 2));
}

beforeEach(() => {
  jest.clearAllMocks();
  claude.getAnthropicClient.mockResolvedValue(null);
});

describe('generateReportWithNarrative: no API key (called-shot, output must be unchanged)', () => {
  it('produces HTML identical to generateReport when no anthropic client is available', async () => {
    const dir = makeTmpDir();
    writeFixtureInputs(dir);

    const syncPath = generateReport(dir);
    const syncHtml = fs.readFileSync(syncPath, 'utf8');

    const asyncPath = await generateReportWithNarrative(dir);
    const asyncHtml = fs.readFileSync(asyncPath, 'utf8');

    expect(claude.getAnthropicClient).toHaveBeenCalledTimes(1);
    expect(asyncPath).toBe(syncPath);
    expect(asyncHtml).toBe(syncHtml);
  });
});
