'use strict';

// Executes the real inline script from .github/workflows/pr-metrics.yml's "Enhanced PR
// Analysis" step against mocked GitHub API responses, extracted via js-yaml -- same harness
// as prMetricsWorkflowSmallSample.test.js.
//
// Issue #62: a dependency/CI bot commit mixed into an otherwise human PR must be excluded
// from the analyzed commit metrics and counted/reported separately, without ever excluding a
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

function makeGithubMock({ files, commits, commitDetailsBySha }) {
  const createCommentCalls = [];
  return {
    githubMock: {
      rest: {
        pulls: {
          listFiles: async () => ({ data: files }),
          listCommits: async () => ({ data: commits })
        },
        repos: {
          getCommit: async ({ ref }) => ({ data: commitDetailsBySha[ref] })
        },
        issues: {
          createComment: async (args) => { createCommentCalls.push(args); return { data: {} }; }
        }
      },
      paginate: async (fn) => (await fn()).data
    },
    createCommentCalls
  };
}

async function runPrAnalysis(script, githubMock, context) {
  const fakeRequire = id => {
    if (id === './lib/duplicate') {
      return { runDuplicateCheck: () => [], resolveModuleNeighbors: () => [] };
    }
    if (id === './lib/claude') {
      return { getAnthropicClient: async () => null, analyzeDuplicatesWithClaude: async () => [] };
    }
    return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
  };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('require', 'github', 'context', script);
  await runner(fakeRequire, githubMock, context);
}

describe('pr-metrics.yml workflow script -- dependency/CI bot exclusion (issue #62)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('pr-metrics.yml', 'Enhanced PR Analysis');
  });

  test('excludes a dependabot commit mixed into the PR from the commit analysis and reports it', async () => {
    const humanCommit = {
      sha: 'human1',
      commit: {
        message: 'feat: add feature x',
        author: { name: 'Dev', date: '2026-08-01T00:00:00.000Z' },
        committer: { name: 'Dev' }
      }
    };
    const botCommit = {
      sha: 'bot1',
      commit: {
        message: 'chore(deps): bump lodash from 4.17.20 to 4.17.21',
        author: { name: 'dependabot[bot]', date: '2026-07-31T00:00:00.000Z' },
        committer: { name: 'dependabot[bot]' }
      }
    };
    const files = [{ filename: 'src/app.js', additions: 50, deletions: 10 }];
    const commitDetailsBySha = {
      human1: { stats: { additions: 50, deletions: 10 }, files },
      bot1: { stats: { additions: 1, deletions: 1 }, files: [{ filename: 'package.json', additions: 1, deletions: 1 }] }
    };
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits: [humanCommit, botCommit], commitDetailsBySha });
    const context = {
      payload: { pull_request: { additions: 50, deletions: 10, changed_files: 1 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 100 }
    };

    await runPrAnalysis(script, githubMock, context);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    expect(body).toMatch(/\*\*Total Commits:\*\* 1/);
    expect(body).toMatch(/Bot commits excluded.*1/);
  });

  test('does not exclude a commit authored by an AI coding agent, even with a bot-flavored name', async () => {
    const aiAgentCommit = {
      sha: 'ai1',
      commit: {
        message: 'feat: add widget',
        author: { name: 'claude[bot]', date: '2026-08-01T00:00:00.000Z' },
        committer: { name: 'claude[bot]' }
      }
    };
    const files = [{ filename: 'src/app.js', additions: 50, deletions: 10 }];
    const commitDetailsBySha = { ai1: { stats: { additions: 50, deletions: 10 }, files } };
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits: [aiAgentCommit], commitDetailsBySha });
    const context = {
      payload: { pull_request: { additions: 50, deletions: 10, changed_files: 1 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 101 }
    };

    await runPrAnalysis(script, githubMock, context);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    expect(body).toMatch(/\*\*Total Commits:\*\* 1/);
    expect(body).not.toMatch(/Bot commits excluded/);
  });
});
