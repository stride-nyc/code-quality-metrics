'use strict';

// Tests the branch-level merged-PR check added to code-metrics.yml for GitHub #107.
// Each analyzed feature branch is checked via github.rest.pulls.list; merged_branches_count
// and unmerged_branches_count are added to both the normal and empty-metrics summary.

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

function makeGithubMock({ branches, commitsByBranch, commitDetailsBySha, pullsByBranch = {} }) {
  return {
    rest: {
      repos: {
        get: async () => ({ data: { full_name: 'acme/widgets' } }),
        listBranches: async () => ({ data: branches }),
        listCommits: async ({ sha }) => ({ data: commitsByBranch[sha] || [] }),
        getCommit: async ({ ref }) => ({ data: commitDetailsBySha[ref] }),
        listTags: async () => ({ data: [] })
      },
      pulls: {
        list: async ({ head }) => {
          const branch = head.split(':')[1];
          return { data: pullsByBranch[branch] || [] };
        }
      }
    },
    paginate: async (fn, params) => (await fn(params)).data
  };
}

async function runCollectMetrics(script, githubMock) {
  const writes = {};
  const fakeFs = {
    writeFileSync: (name, content) => { writes[name] = content; },
    existsSync: () => false,
    readFileSync: (p) => { throw new Error(`ENOENT: ${p}`); }
  };
  const fakeRequire = id => {
    if (id === 'fs') return fakeFs;
    return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
  };
  const fakeProcess = { env: { ...process.env, GITHUB_REPOSITORY: 'acme/widgets' }, stdout: { write: () => {} } };

  const wrapped = script.replace('collectMetrics();', 'return collectMetrics();');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('require', 'github', 'process', wrapped);
  await runner(fakeRequire, githubMock, fakeProcess);
  return writes;
}

const baseCommit = {
  sha: 'abc1',
  parents: [{ sha: 'base' }],
  commit: {
    message: 'feat: add thing',
    author: { name: 'Dev' },
    committer: { name: 'Dev', date: '2026-01-15T10:00:00.000Z' }
  }
};

const baseCommitDetail = {
  stats: { additions: 10, deletions: 5 },
  files: [{ filename: 'src/app.js', additions: 10, deletions: 5 }]
};

describe('code-metrics.yml workflow script -- shipment visibility (GitHub #107)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Collect Commit Metrics');
  });

  test('merged_branches_count and unmerged_branches_count are present in summary', async () => {
    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [baseCommit] },
      commitDetailsBySha: { 'abc1': baseCommitDetail },
      pullsByBranch: { 'feature-x': [{ merged_at: '2026-01-20T00:00:00.000Z' }] }
    });

    const writes = await runCollectMetrics(script, githubMock);
    const summary = JSON.parse(writes['metrics_summary.json']);

    expect(typeof summary.merged_branches_count).toBe('number');
    expect(typeof summary.unmerged_branches_count).toBe('number');
  });

  test('merged_branches_count counts branches with a closed merged PR', async () => {
    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-a' }, { name: 'feature-b' }],
      commitsByBranch: {
        'feature-a': [baseCommit],
        'feature-b': [{ ...baseCommit, sha: 'abc2' }]
      },
      commitDetailsBySha: {
        'abc1': baseCommitDetail,
        'abc2': baseCommitDetail
      },
      pullsByBranch: {
        'feature-a': [{ merged_at: '2026-01-20T00:00:00.000Z' }],
        'feature-b': []  // no merged PR
      }
    });

    const writes = await runCollectMetrics(script, githubMock);
    const summary = JSON.parse(writes['metrics_summary.json']);

    expect(summary.merged_branches_count).toBe(1);
    expect(summary.unmerged_branches_count).toBe(1);
  });

  test('merged_branches_count is 0 in empty-metrics summary when no commits found', async () => {
    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }],
      commitsByBranch: {},
      commitDetailsBySha: {}
    });

    const writes = await runCollectMetrics(script, githubMock);
    const summary = JSON.parse(writes['metrics_summary.json']);

    expect(summary.merged_branches_count).toBe(0);
    expect(summary.unmerged_branches_count).toBe(0);
  });
});
