'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { generateReport } = require('../generate-drift-report');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'drift-report-test-'));
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
    large_commits_pct: '15.00',
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
    dora_archetype: 'harmonious-high-achiever',
    config: {},
    note: 'test summary'
  };
  const metrics = [
    { sha: 'aaa11111', full_sha: 'aaa1111111111111111111111111111111111111', date: '2026-08-01T00:00:00.000Z', author: 'Alice', message: 'feat: add widget', total_additions: 200, total_deletions: 50, files_changed: 4 }
  ];
  fs.writeFileSync(path.join(dir, 'local_metrics_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(dir, 'local_commit_metrics.json'), JSON.stringify(metrics, null, 2));
}

describe('generateReport', () => {
  it('writes local_drift_report.html into the target directory from real summary and metrics json', () => {
    const dir = makeTmpDir();
    writeFixtureInputs(dir);

    const outputPath = generateReport(dir);

    expect(outputPath).toBe(path.join(dir, 'local_drift_report.html'));
    const html = fs.readFileSync(outputPath, 'utf8');
    expect(html.trim().toLowerCase().startsWith('<!doctype html>')).toBe(true);
  });

  it('throws a clear error mentioning the missing filename when local_metrics_summary.json is absent', () => {
    const dir = makeTmpDir();
    const metrics = [];
    fs.writeFileSync(path.join(dir, 'local_commit_metrics.json'), JSON.stringify(metrics));

    expect(() => generateReport(dir)).toThrow(/local_metrics_summary\.json/);
    expect(() => generateReport(dir)).toThrow(/Run "node local-code-metrics\.js" first/);
  });

  it('exits with status 1 and a clear stderr message, no raw stack trace, when run as a CLI against a directory missing the required json files', () => {
    const dir = makeTmpDir();
    const scriptPath = path.join(__dirname, '..', 'generate-drift-report.js');

    const result = spawnSync(process.execPath, [scriptPath, dir], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/local_metrics_summary\.json/);
    expect(result.stderr).not.toContain('at readRequiredJson');
    expect(result.stderr).not.toContain('at Object.<anonymous>');
  });
});
