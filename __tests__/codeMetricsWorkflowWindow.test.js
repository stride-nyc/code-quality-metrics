'use strict';

// Executes the real inline scripts from .github/workflows/code-metrics.yml's "Collect Commit
// Metrics" and "Create Issue with Results" steps against mocked GitHub API responses, extracted
// via js-yaml rather than retyped, following the pattern in
// codeMetricsWorkflowMergeFilter.test.js.
//
// code-metrics.yml computes `since = today - CONFIG.ANALYSIS_DAYS` and passes it straight to the
// GitHub REST API. A repository with bursty feature-branch activity (sprints separated by gaps
// longer than ANALYSIS_DAYS) produces a recurring "no commits found" result every time the
// schedule fires between bursts, defeating the workflow's purpose. This suite proves the fix:
// when the since-filtered fetch finds zero commits across every feature branch, the script
// widens to the newest commits available on each branch regardless of date, and reports the
// span it actually covered rather than repeating "Last 30 days" (code-quality-metrics-3s0).

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.join(__dirname, '..');

function loadStepScript(workflowFile, stepName) {
  const doc = yaml.load(fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', workflowFile), 'utf8'));
  for (const job of Object.values(doc.jobs)) {
    const step = (job.steps || []).find(s => s.name === stepName);
    if (step) return step.with.script;
  }
  throw new Error(`step "${stepName}" not found in ${workflowFile}`);
}

// commitsByBranch backs any call whose params include a `since` key (the primary,
// calendar-bounded fetch). commitsByBranchWidened backs any call without one (the fallback
// fetch this suite adds, which never bounds by date). Existing since-bound tests only ever
// pass commitsByBranch, so this stays compatible with that shape.
function makeGithubMock({ branches, commitsByBranch, commitsByBranchWidened, commitDetailsBySha }) {
  return {
    rest: {
      repos: {
        get: async () => ({ data: { full_name: 'acme/widgets' } }),
        listBranches: async () => ({ data: branches }),
        listCommits: async ({ sha, since }) => {
          const source = since === undefined ? (commitsByBranchWidened || {}) : (commitsByBranch || {});
          return { data: source[sha] || [] };
        },
        getCommit: async ({ ref }) => ({ data: commitDetailsBySha[ref] })
      }
    },
    // The real workflow relies on github.paginate to walk multi-page results; every mocked
    // call here fits on one page, so paginate just forwards to the underlying call. The
    // fallback fetch this suite exercises calls listCommits directly (not through paginate),
    // matching the production script's bounded, single-page widen fetch.
    paginate: async (fn, params) => (await fn(params)).data
  };
}

async function runCollectMetrics(script, githubMock) {
  const writes = {};
  const fakeFs = { writeFileSync: (name, content) => { writes[name] = content; } };
  const fakeRequire = id => {
    if (id === 'fs') return fakeFs;
    return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
  };
  const fakeProcess = { env: { ...process.env, GITHUB_REPOSITORY: 'acme/widgets' }, stdout: { write: () => {} } };

  const occurrences = script.split('collectMetrics();').length - 1;
  if (occurrences !== 1) {
    throw new Error(`expected exactly one "collectMetrics();" invocation to capture, found ${occurrences}`);
  }
  const wrapped = script.replace('collectMetrics();', 'return collectMetrics();');

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('require', 'github', 'process', wrapped);
  await runner(fakeRequire, githubMock, fakeProcess);
  return writes;
}

async function runCreateIssue(script, summary) {
  const fakeFs = { readFileSync: () => JSON.stringify(summary) };
  const fakeRequire = id => {
    if (id === 'fs') return fakeFs;
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

describe('code-metrics.yml workflow script -- window widening (code-quality-metrics-3s0)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Collect Commit Metrics');
  });

  test('widens to the newest commits per branch when the since-filtered fetch finds zero commits across every feature branch', async () => {
    const widenedCommit = {
      sha: 'widened1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: ship during a burst after a long gap',
        author: { name: 'Dev' },
        committer: { date: '2026-01-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: {}, // since-filtered fetch: every branch returns nothing
      commitsByBranchWidened: { 'feature-x': [widenedCommit] },
      commitDetailsBySha: {
        widened1: { stats: { additions: 20, deletions: 5 }, files: [{ filename: 'src/app.js', additions: 20, deletions: 5 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics).toHaveLength(1);
    expect(commitMetrics[0].sha).toBe('widened1');

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.total_commits).toBe(1);
    expect(summary.window_widened).toBe(true);
  });

  test('does not widen when the since-filtered fetch already found commits (guard is not vacuous)', async () => {
    const recentCommit = {
      sha: 'recent1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: ship within the requested window',
        author: { name: 'Dev' },
        committer: { date: '2026-08-01T00:00:00.000Z' }
      }
    };
    const widenedCommit = {
      sha: 'widened1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: an older commit the widen path must not surface here',
        author: { name: 'Dev' },
        committer: { date: '2026-01-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [recentCommit] },
      commitsByBranchWidened: { 'feature-x': [widenedCommit] },
      commitDetailsBySha: {
        recent1: { stats: { additions: 10, deletions: 2 }, files: [{ filename: 'src/app.js', additions: 10, deletions: 2 }] },
        widened1: { stats: { additions: 20, deletions: 5 }, files: [{ filename: 'src/app.js', additions: 20, deletions: 5 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics).toHaveLength(1);
    expect(commitMetrics[0].sha).toBe('recent1');

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.window_widened).toBe(false);
  });

  test('reports window_requested_since and the actual analyzed span for a normal, non-widened run', async () => {
    const commit = {
      sha: 'recent1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: ship within the requested window',
        author: { name: 'Dev' },
        committer: { date: '2026-08-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [commit] },
      commitDetailsBySha: {
        recent1: { stats: { additions: 10, deletions: 2 }, files: [{ filename: 'src/app.js', additions: 10, deletions: 2 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);
    const summary = JSON.parse(writes['metrics_summary.json']);

    expect(typeof summary.window_requested_since).toBe('string');
    expect(summary.analyzed_span_start).toBe('2026-08-01T00:00:00.000Z');
    expect(summary.analyzed_span_end).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('code-metrics.yml workflow script -- issue body reports the actual span (code-quality-metrics-3s0)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Create Issue with Results');
  });

  // Skipped pending the next cycle's periodLine implementation in "Create Issue with
  // Results" -- unskipped in the code-quality-metrics-3s0 cycle 2 commit.
  test.skip('states the actual analyzed span instead of a hardcoded "Last 30 days" for a normal run', async () => {
    const summary = {
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
    };

    const created = await runCreateIssue(script, summary);

    expect(created.body).not.toContain('Last 30 days');
    expect(created.body).toContain('2026-08-01T00:00:00.000Z');
  });

  // Skipped pending the next cycle's periodLine implementation -- unskipped alongside the
  // test above.
  test.skip('notes that the window was widened past the requested boundary when window_widened is true', async () => {
    const summary = {
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
      window_widened: true,
      analyzed_span_start: '2026-01-01T00:00:00.000Z',
      analyzed_span_end: '2026-01-05T00:00:00.000Z'
    };

    const created = await runCreateIssue(script, summary);

    expect(created.body).toContain('widened');
    expect(created.body).toContain('2026-01-01T00:00:00.000Z');
  });
});
