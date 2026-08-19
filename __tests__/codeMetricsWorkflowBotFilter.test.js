'use strict';

// Executes the real inline script from .github/workflows/code-metrics.yml's "Collect Commit
// Metrics" step against mocked GitHub API responses, extracted via js-yaml rather than
// retyped -- same harness as codeMetricsWorkflowMergeFilter.test.js.
//
// Issue #62: dependency/CI bot commits (dependabot, renovate, github-actions, ...) must be
// excluded from the analyzed window and counted/reported separately, without ever excluding a
// commit attributable to an AI coding agent.

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

describe('code-metrics.yml workflow script -- dependency/CI bot exclusion (issue #62)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('code-metrics.yml', 'Collect Commit Metrics');
  });

  test('excludes a dependabot-authored commit from commit_metrics.json and counts it in the summary', async () => {
    const humanCommit = {
      sha: 'human1',
      parents: [{ sha: 'base' }],
      commit: {
        message: 'feat: add feature x',
        author: { name: 'Dev' },
        committer: { name: 'Dev', date: '2026-08-01T00:00:00.000Z' }
      }
    };
    const botCommit = {
      sha: 'bot1',
      parents: [{ sha: 'base' }],
      commit: {
        message: 'chore(deps): bump lodash from 4.17.20 to 4.17.21',
        author: { name: 'dependabot[bot]' },
        committer: { name: 'dependabot[bot]', date: '2026-07-31T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [humanCommit, botCommit] },
      commitDetailsBySha: {
        human1: { stats: { additions: 50, deletions: 10 }, files: [{ filename: 'src/app.js', additions: 50, deletions: 10 }] },
        bot1: { stats: { additions: 1, deletions: 1 }, files: [{ filename: 'package.json', additions: 1, deletions: 1 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics).toHaveLength(1);
    expect(commitMetrics[0].sha).toBe('human1');

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.total_commits).toBe(1);
    expect(summary.bot_commits_count).toBe(1);
  });

  test('does not exclude a commit authored by an AI coding agent, even with a bot-flavored name', async () => {
    const aiAgentCommit = {
      sha: 'ai1',
      parents: [{ sha: 'base' }],
      commit: {
        message: 'feat: add widget',
        author: { name: 'claude[bot]' },
        committer: { name: 'claude[bot]', date: '2026-08-01T00:00:00.000Z' }
      }
    };

    const githubMock = makeGithubMock({
      branches: [{ name: 'main' }, { name: 'feature-x' }],
      commitsByBranch: { 'feature-x': [aiAgentCommit] },
      commitDetailsBySha: {
        ai1: { stats: { additions: 50, deletions: 10 }, files: [{ filename: 'src/app.js', additions: 50, deletions: 10 }] }
      }
    });

    const writes = await runCollectMetrics(script, githubMock);

    const commitMetrics = JSON.parse(writes['commit_metrics.json']);
    expect(commitMetrics).toHaveLength(1);
    expect(commitMetrics[0].sha).toBe('ai1');

    const summary = JSON.parse(writes['metrics_summary.json']);
    expect(summary.total_commits).toBe(1);
    expect(summary.bot_commits_count).toBe(0);
  });
});
