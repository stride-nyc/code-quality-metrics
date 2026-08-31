'use strict';

// Verifies that GitHub #124's CFP approximation surfaces in the PR comment when
// an Anthropic client is available, and is omitted when the client is null.
// Pattern mirrors prMetricsWorkflowSmallSample.test.js.

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

function makePrFiles() {
  return [
    { filename: 'src/api/users.js', additions: 40, deletions: 5, patch: '+async function createUser(data) { await db.insert(data); return { id: 1 }; }' },
    { filename: 'src/routes/users.js', additions: 20, deletions: 2, patch: '+router.post("/users", createUser);' },
  ];
}

function makeCommits() {
  return [
    { sha: 'c1', commit: { message: 'feat: add user creation', author: { name: 'Dev', date: '2026-08-01T00:00:00.000Z' } } }
  ];
}

function makeGithubMock({ files, commits }) {
  const createCommentCalls = [];
  return {
    githubMock: {
      rest: {
        pulls: {
          listFiles: async () => ({ data: files }),
          listCommits: async () => ({ data: commits })
        },
        repos: {
          getCommit: async () => ({ data: { stats: { additions: 60, deletions: 7 }, files } })
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

const CFP_RESULT = { estimated_cfp_delta: 6, estimated_cfp_breakdown: { entries: 2, exits: 2, reads: 1, writes: 1 } };

async function runPrAnalysis(script, githubMock, context, cfpResult) {
  const fakeRequire = id => {
    if (id === './lib/duplicate') {
      return { runDuplicateCheck: () => [], resolveModuleNeighbors: () => [] };
    }
    if (id === './lib/claude') {
      const mockClient = cfpResult !== null ? {} : null;
      return {
        getAnthropicClient: async () => mockClient,
        analyzeDuplicatesWithClaude: async () => [],
        analyzeCfpWithClaude: async () => cfpResult
      };
    }
    return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
  };

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('require', 'github', 'context', script);
  await runner(fakeRequire, githubMock, context);
}

describe('pr-metrics.yml — COSMIC FP approximation (GitHub #124)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('pr-metrics.yml', 'Enhanced PR Analysis');
  });

  test('includes estimated functional size in PR comment when Anthropic client is available', async () => {
    const files = makePrFiles();
    const commits = makeCommits();
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits });
    const context = {
      payload: { pull_request: { additions: 60, deletions: 7, changed_files: 2 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 51 }
    };

    await runPrAnalysis(script, githubMock, context, CFP_RESULT);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    expect(body).toMatch(/functional size|estimated.*cfp|COSMIC/i);
    expect(body).toContain('6');
  });

  test('omits CFP section when Anthropic client is null', async () => {
    const files = makePrFiles();
    const commits = makeCommits();
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits });
    const context = {
      payload: { pull_request: { additions: 60, deletions: 7, changed_files: 2 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 52 }
    };

    await runPrAnalysis(script, githubMock, context, null);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    expect(body).not.toMatch(/functional size|COSMIC/i);
  });

  test('omits CFP section when analyzeCfpWithClaude returns null', async () => {
    const files = makePrFiles();
    const commits = makeCommits();
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits });
    const context = {
      payload: { pull_request: { additions: 60, deletions: 7, changed_files: 2 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 53 }
    };

    const fakeRequire = id => {
      if (id === './lib/duplicate') {
        return { runDuplicateCheck: () => [], resolveModuleNeighbors: () => [] };
      }
      if (id === './lib/claude') {
        return {
          getAnthropicClient: async () => ({}),
          analyzeDuplicatesWithClaude: async () => [],
          analyzeCfpWithClaude: async () => null
        };
      }
      return id.startsWith('./lib/') ? require(path.join(REPO_ROOT, id)) : require(id);
    };

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const runner = new AsyncFunction('require', 'github', 'context', script);
    await runner(fakeRequire, githubMock, context);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    expect(body).not.toMatch(/functional size|COSMIC/i);
  });
});
