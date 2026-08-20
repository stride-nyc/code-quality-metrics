'use strict';

// Executes the real inline script from .github/workflows/code-metrics.yml's "Create Issue with
// Results" step against mocked GitHub API responses, extracted via js-yaml, following the
// pattern in codeMetricsWorkflowMergeFilter.test.js and codeMetricsWorkflowWindow.test.js.
//
// code-quality-metrics-v4o: statusMark compared a value only against the healthy boundary, so
// the Status column could only ever say 'OK' or 'Warning' even though the adjacent Target
// column (formatBand) already advertises a critical bound whenever a metric has one. A value
// past the critical bound was reported identically to a value merely past healthy. This suite
// proves a three-band metric reports 'Critical' once its value passes the critical bound, and
// that a two-band metric (whose critical bound is null by design -- no second reference
// repository corroborates its extreme) never reports 'Critical', at any distance from healthy.
//
// LARGE_COMMITS_PCT and SPRAWLING_COMMITS_PCT are both two-band under the re-measured
// era:current data (calibration/derive-bands.js's degenerate-band guard and bot-filtering both
// changed what corroborates the old extremes -- see lib/thresholds.js's comments on each), so
// neither is a live three-band example any more; every currently-calibrated metric is two-band.
// The three-band 'Critical' path is still real, reachable script logic (not dead code -- a
// future re-measurement could restore a three-band metric), so it is proven here against a
// synthetic THRESHOLDS override rather than dropped along with its last real example.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { THRESHOLDS } = require('../lib/thresholds');

const REPO_ROOT = path.join(__dirname, '..');

function loadStepScript(workflowFile, stepName) {
  const doc = yaml.load(fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', workflowFile), 'utf8'));
  for (const job of Object.values(doc.jobs)) {
    const step = (job.steps || []).find(s => s.name === stepName);
    if (step) return step.with.script;
  }
  throw new Error(`step "${stepName}" not found in ${workflowFile}`);
}

async function runCreateIssue(script, summary, thresholdsOverride) {
  const fakeFs = { readFileSync: () => JSON.stringify(summary) };
  const fakeRequire = id => {
    if (id === 'fs') return fakeFs;
    if (thresholdsOverride && id === './lib/thresholds') return { THRESHOLDS: thresholdsOverride };
    return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
  };
  let created = null;
  const githubMock = { rest: { issues: { create: async params => { created = params; } } } };
  const contextMock = { repo: { owner: 'acme', repo: 'widgets' } };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('require', 'github', 'context', script);
  await runner(fakeRequire, githubMock, contextMock);
  return created;
}

// Pulls the Status cell (4th column) out of the "| Metric | Value | Target | Status |" table
// for the row whose Metric column starts with `label`.
function statusCellFor(body, label) {
  const line = body.split('\n').find(l => l.startsWith(`| ${label}`));
  if (!line) throw new Error(`row not found for label "${label}" in body:\n${body}`);
  const cells = line.split('|').map(c => c.trim());
  return cells[4];
}

function baseSummary(overrides) {
  return Object.assign({
    total_commits: 1,
    branches_analyzed: ['feature-x'],
    branch_commit_counts: { 'feature-x': 1 },
    large_commits_pct: '0.00',
    sprawling_commits_pct: '0.00',
    test_coverage_rate: '0.00',
    test_isolation_rate: '0.00',
    uncovered_prod_rate: '0.00',
    message_quality_pct: '0.00',
    net_additions_ratio_median: 0,
    p50_lines_changed: 0,
    p90_lines_changed: 0,
    p95_lines_changed: 0,
    stddev_lines_changed: 0,
    velocity_trend: 'stable',
    dora_archetype: 'mixed-signals',
    window_requested_since: '2026-07-01T00:00:00.000Z',
    window_widened: false,
    analyzed_span_start: '2026-08-01T00:00:00.000Z',
    analyzed_span_end: '2026-08-01T00:00:00.000Z'
  }, overrides);
}

describe('code-metrics.yml workflow script -- three-band Critical status (code-quality-metrics-v4o)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Create Issue with Results');
  });

  describe('Large Commits (healthy 18, two-band: no critical bound)', () => {
    test('reports OK below the healthy bound', async () => {
      const summary = baseSummary({ large_commits_pct: '12.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Large Commits')).toBe('OK');
    });

    test('reports Warning above the healthy bound', async () => {
      const summary = baseSummary({ large_commits_pct: '22.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Large Commits')).toBe('Warning');
    });

    test('never reports Critical, however far above healthy (two-band: LARGE_COMMITS_PCT.critical is null)', async () => {
      expect(THRESHOLDS.LARGE_COMMITS_PCT.critical).toBeNull();
      const summary = baseSummary({ large_commits_pct: '90.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Large Commits')).toBe('Warning');
    });
  });

  describe('Sprawling Commits (healthy 18, two-band: no critical bound)', () => {
    test('reports OK below the healthy bound', async () => {
      const summary = baseSummary({ sprawling_commits_pct: '12.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Sprawling Commits')).toBe('OK');
    });

    test('reports Warning above the healthy bound', async () => {
      const summary = baseSummary({ sprawling_commits_pct: '19.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Sprawling Commits')).toBe('Warning');
    });

    test('never reports Critical, however far above healthy (two-band: SPRAWLING_COMMITS_PCT.critical is null)', async () => {
      expect(THRESHOLDS.SPRAWLING_COMMITS_PCT.critical).toBeNull();
      const summary = baseSummary({ sprawling_commits_pct: '90.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Sprawling Commits')).toBe('Warning');
    });
  });

  describe('two-band metrics never report Critical', () => {
    test('the Test Coverage row stays Warning, however far below healthy', async () => {
      const summary = baseSummary({ test_coverage_rate: '0.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Test Coverage')).toBe('Warning');
    });

    test('Uncovered Prod stays Warning, however far above healthy', async () => {
      const summary = baseSummary({ uncovered_prod_rate: '99.00' });
      const created = await runCreateIssue(script, summary);
      expect(statusCellFor(created.body, 'Uncovered Prod')).toBe('Warning');
    });
  });

  // Every currently-calibrated metric is two-band (see the describe blocks above), so nothing
  // in the real THRESHOLDS module can currently drive the Status column to 'Critical'. That
  // three-band branch of statusMark is still live script logic, not dead code -- a future
  // re-measurement could restore a three-band metric -- so it is proven here against a
  // synthetic THRESHOLDS override (a real critical bound on LARGE_COMMITS_PCT/
  // SPRAWLING_COMMITS_PCT) rather than left with no coverage at all once the real data stopped
  // exercising it.
  describe('three-band Critical status, proven against a synthetic override (no real metric is three-band right now)', () => {
    const syntheticThresholds = {
      ...THRESHOLDS,
      LARGE_COMMITS_PCT: { healthy: 19, critical: 30 },
      SPRAWLING_COMMITS_PCT: { healthy: 18, critical: 20 }
    };

    test('reports Critical past a synthetic critical bound for Large Commits', async () => {
      const summary = baseSummary({ large_commits_pct: '35.00' });
      const created = await runCreateIssue(script, summary, syntheticThresholds);
      expect(statusCellFor(created.body, 'Large Commits')).toBe('Critical');
    });

    test('reports Warning (not Critical) between the synthetic healthy and critical bounds for Large Commits', async () => {
      const summary = baseSummary({ large_commits_pct: '22.00' });
      const created = await runCreateIssue(script, summary, syntheticThresholds);
      expect(statusCellFor(created.body, 'Large Commits')).toBe('Warning');
    });

    test('reports Critical past a synthetic critical bound for Sprawling Commits', async () => {
      const summary = baseSummary({ sprawling_commits_pct: '50.00' });
      const created = await runCreateIssue(script, summary, syntheticThresholds);
      expect(statusCellFor(created.body, 'Sprawling Commits')).toBe('Critical');
    });

    test('reports Warning (not Critical) between the synthetic healthy and critical bounds for Sprawling Commits', async () => {
      const summary = baseSummary({ sprawling_commits_pct: '19.00' });
      const created = await runCreateIssue(script, summary, syntheticThresholds);
      expect(statusCellFor(created.body, 'Sprawling Commits')).toBe('Warning');
    });
  });
});
