'use strict';

// Executes the real inline script from .github/workflows/code-metrics.yml's "Collect Commit
// Metrics" step against mocked GitHub API responses to verify deployment_frequency_floor
// integration (GitHub #65).

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

function makeGithubMock({ branches, commitsByBranch, commitDetailsBySha, tagsByName = {} }) {
  return {
    rest: {
      repos: {
        get: async () => ({ data: { full_name: 'acme/widgets' } }),
        listBranches: async () => ({ data: branches }),
        listCommits: async ({ sha }) => ({ data: commitsByBranch[sha] || [] }),
        getCommit: async ({ ref }) => ({ data: commitDetailsBySha[ref] }),
        listTags: async () => ({ data: Object.keys(tagsByName).map(name => ({ name, commit: { sha: name + '-sha' } })) })
      }
    },
    paginate: async (fn, params) => (await fn(params)).data
  };
}

async function runCollectMetrics(script, githubMock, repoConfigJson = null) {
  const writes = {};
  const fakeFs = {
    writeFileSync: (name, content) => { writes[name] = content; },
    existsSync: (p) => repoConfigJson !== null && String(p).endsWith('.codemetrics.json'),
    readFileSync: (p) => {
      if (repoConfigJson !== null && String(p).endsWith('.codemetrics.json')) return repoConfigJson;
      throw new Error(`ENOENT: no such file or directory, open '${p}'`);
    }
  };
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

describe('code-metrics.yml workflow script -- deployment frequency (GitHub #65)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Collect Commit Metrics');
  });

  test('deployment_frequency_floor is null when no release patterns configured', async () => {
    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [baseCommit] },
      commitDetailsBySha: { 'abc1': baseCommitDetail }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.deployment_frequency_floor).toBeNull();
  });

  test('deployment_frequency_floor is computed from tags when releaseTagPattern is configured', async () => {
    // Tags: v1.0.0 and v1.1.0 match '^v\\d+'; docs-update does not
    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [baseCommit] },
      commitDetailsBySha: {
        'abc1': baseCommitDetail,
        'v1.0.0-sha': { stats: { additions: 0, deletions: 0 }, files: [], commit: { committer: { date: '2026-01-01T00:00:00.000Z' } } },
        'v1.1.0-sha': { stats: { additions: 0, deletions: 0 }, files: [], commit: { committer: { date: '2026-01-10T00:00:00.000Z' } } },
      },
      tagsByName: { 'v1.0.0': true, 'v1.1.0': true, 'docs-update': true }
    });

    const repoConfig = JSON.stringify({ releaseTagPattern: '^v\\d+' });
    const writes = await runCollectMetrics(script, githubMock, repoConfig);

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.deployment_frequency_floor).not.toBeNull();
    expect(summary.deployment_frequency_floor.release_count).toBe(2);
    expect(typeof summary.deployment_frequency_floor.median_interval_days).toBe('number');
  });
});
