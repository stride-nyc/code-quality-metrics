'use strict';

// Executes the real inline script from .github/workflows/code-metrics.yml's "Collect Commit
// Metrics" step against mocked GitHub API responses, extracted via js-yaml rather than
// retyped, so this test breaks if the workflow file's behaviour regresses even though
// nothing else in this suite reaches a workflow's inline script (code-quality-metrics-9vg).
//
// A two-parent merge commit's stats (fetched via github.rest.repos.getCommit) are computed
// against its first parent only. For a conflict-free two-parent merge, that reproduces one of
// the merged children's diff exactly, so before the fix the merge and its child both appeared
// in uniqueCommits with identical (additions, deletions, files_changed) and the same real
// change was counted twice. This file proves the fix excludes the merge and counts the child
// once, and that an ordinary single-parent commit is unaffected.

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

function makeGithubMock({ branches, commitsByBranch, commitDetailsBySha }) {
  return {
    rest: {
      repos: {
        get: async () => ({ data: { full_name: 'acme/widgets' } }),
        listBranches: async () => ({ data: branches }),
        listCommits: async ({ sha }) => ({ data: commitsByBranch[sha] || [] }),
        getCommit: async ({ ref }) => ({ data: commitDetailsBySha[ref] })
      }
    },
    // The real workflow relies on github.paginate to walk multi-page results; every mocked
    // call here fits on one page, so paginate just forwards to the underlying call.
    paginate: async (fn, params) => (await fn(params)).data
  };
}

async function runCollectMetrics(script, githubMock) {
  const writes = {};
  const fakeFs = { writeFileSync: (name, content) => { writes[name] = content; } };
  // The script itself does `const fs = require('fs')` and `const { CONFIG } =
  // require('./lib/config')`, so fs is intercepted here rather than injected as a
  // parameter -- passing it as a parameter name would collide with the script's own
  // top-level `const fs = ...` declaration.
  const fakeRequire = id => {
    if (id === 'fs') return fakeFs;
    return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
  };
  const fakeProcess = { env: { ...process.env, GITHUB_REPOSITORY: 'acme/widgets' }, stdout: { write: () => {} } };

  // The script's trailing `collectMetrics();` isn't awaited at the script's own top level
  // (github-script doesn't require it to be); capture the promise here so the test can await
  // completion before reading `writes`.
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

describe('code-metrics.yml workflow script -- merge commit filter (code-quality-metrics-9vg)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Collect Commit Metrics');
  });

  test('excludes a two-parent merge whose stats duplicate its child, counting the child once', async () => {
    const mergeCommit = {
      sha: 'merge1',
      parents: [{ sha: 'parentbase' }, { sha: 'child1' }],
      commit: {
        message: 'Merge pull request #1 from acme/feature-x',
        author: { name: 'Dev' },
        committer: { date: '2026-08-01T00:05:00.000Z' }
      }
    };
    const childCommit = {
      sha: 'child1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: add feature x',
        author: { name: 'Dev' },
        committer: { date: '2026-08-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [mergeCommit, childCommit] },
      commitDetailsBySha: {
        // Both show the identical (additions, deletions, files) signature described in the
        // bug report: getCommit diffs a merge against its first parent, reproducing the
        // child's diff exactly.
        merge1: { stats: { additions: 50, deletions: 10 }, files: [{ filename: 'src/app.js', additions: 50, deletions: 10 }] },
        child1: { stats: { additions: 50, deletions: 10 }, files: [{ filename: 'src/app.js', additions: 50, deletions: 10 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics).toHaveLength(1);
    expect(commitMetrics[0].sha).toBe('child1');

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.total_commits).toBe(1);
    // filtered_from is read straight off the post-merge-filter pool, so a reader can see the
    // merge never entered the analyzed set at all (not merely that it was later deduped away).
    expect(summary.filtered_from).toBe(1);
  });

  test('does not exclude an ordinary single-parent commit (guard is not vacuous)', async () => {
    const ordinaryCommit = {
      sha: 'child1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: add feature x',
        author: { name: 'Dev' },
        committer: { date: '2026-08-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [ordinaryCommit] },
      commitDetailsBySha: {
        child1: { stats: { additions: 50, deletions: 10 }, files: [{ filename: 'src/app.js', additions: 50, deletions: 10 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics).toHaveLength(1);
    expect(commitMetrics[0].sha).toBe('child1');

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.total_commits).toBe(1);
    expect(summary.filtered_from).toBe(1);
  });
});

describe('code-metrics.yml workflow script -- test/prod co-change field (code-quality-metrics-36d)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Collect Commit Metrics');
  });

  test('computes test_coverage_rate from the renamed co-change field for a commit touching both test and prod files', async () => {
    const commit = {
      sha: 'child1',
      parents: [{ sha: 'parentbase' }],
      commit: {
        message: 'feat: add feature with test',
        author: { name: 'Dev' },
        committer: { date: '2026-08-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [commit] },
      commitDetailsBySha: {
        child1: {
          stats: { additions: 15, deletions: 6 },
          files: [
            { filename: 'src/app.js', additions: 10, deletions: 5 },
            { filename: 'src/app.test.js', additions: 5, deletions: 1 }
          ]
        }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics[0].test_prod_cochange_commit).toBe(true);
    expect(commitMetrics[0].test_first_indicator).toBeUndefined();

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.test_coverage_rate).toBe('100.00');
  });
});
