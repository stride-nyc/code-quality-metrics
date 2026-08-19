'use strict';

// Executes the real inline script from .github/workflows/pr-metrics.yml's "Enhanced PR
// Analysis" step against mocked GitHub API responses, extracted via js-yaml rather than
// retyped, closing the blind spot noted in code-quality-metrics-w9f: nothing in this suite
// otherwise reaches a workflow's inline script.
//
// THRESHOLDS.LARGE_COMMITS_PCT / SPRAWLING_COMMITS_PCT / TEST_COVERAGE_RATE are calibrated
// from 50-commit repo-window samples. Applying them unguarded to a PR's own n=1 commit sample
// means the rate can only be 0% or 100%, so a single large commit in a single-commit PR always
// trips the critical bound. This file proves the fix withholds the large/sprawling-commit
// verdict below a minimum-sample guard, and that the guard does not swallow a real verdict once
// the sample is large enough (mutation check: a fix that always suppresses the concern would
// also pass the small-sample assertions, but would fail the n=5 assertions below).

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { CONFIG } = require('../lib/config');

const REPO_ROOT = path.join(__dirname, '..');

/**
 * Run fn with CONFIG.ANALYSIS_IGNORE_PATTERNS temporarily set, restoring the original value
 * afterward. The workflow's fakeRequire below resolves './lib/config' to this same real,
 * cached module, so mutating CONFIG here is what the script under test actually sees.
 */
function withAnalysisIgnorePatterns(patterns, fn) {
  const original = CONFIG.ANALYSIS_IGNORE_PATTERNS;
  CONFIG.ANALYSIS_IGNORE_PATTERNS = patterns;
  return Promise.resolve(fn()).finally(() => {
    CONFIG.ANALYSIS_IGNORE_PATTERNS = original;
  });
}

function loadStepScript(workflowFile, stepName) {
  const doc = yaml.load(fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', workflowFile), 'utf8'));
  for (const job of Object.values(doc.jobs)) {
    const step = (job.steps || []).find(s => s.name === stepName);
    if (step) return step.with.script;
  }
  throw new Error(`step "${stepName}" not found in ${workflowFile}`);
}

// Builds `count` identical large + sprawling commits: 7 files (over the 5-file sprawling
// threshold) each with 25 production lines changed (175 total, over the 100-line large
// threshold), so at any sample size every commit is flagged both large and sprawling.
function buildLargeSprawlingCommits(count) {
  const shas = Array.from({ length: count }, (_, i) => `c${i + 1}`);
  const commits = shas.map(sha => ({
    sha,
    commit: {
      message: 'feat: add a large change',
      author: { name: 'Dev', date: '2026-08-01T00:00:00.000Z' }
    }
  }));
  const files = Array.from({ length: 7 }, (_, i) => ({ filename: `src/f${i}.js`, additions: 20, deletions: 5 }));
  const commitDetailsBySha = {};
  for (const sha of shas) {
    commitDetailsBySha[sha] = {
      stats: { additions: 140, deletions: 35 },
      files
    };
  }
  return { commits, commitDetailsBySha, files };
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
  // lib/duplicate.js and lib/claude.js do real work (spawning jscpd, calling the Anthropic
  // API) that this test has no need to exercise -- the guard under test is purely about the
  // rate-verdict gating below, not duplicate detection -- so both are stubbed out here rather
  // than left to hit the filesystem or network from inside a unit test.
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

describe('pr-metrics.yml workflow script -- minimum-sample guard (code-quality-metrics-w9f)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('pr-metrics.yml', 'Enhanced PR Analysis');
  });

  test('does not raise a large/sprawling-commit concern for a single-commit PR', async () => {
    const { commits, commitDetailsBySha, files } = buildLargeSprawlingCommits(1);
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits, commitDetailsBySha });
    const context = {
      payload: { pull_request: { additions: 175, deletions: 0, changed_files: 7 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 42 }
    };

    await runPrAnalysis(script, githubMock, context);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    // At n=1 every commit is trivially 100% large and 100% sprawling; the fix must not treat
    // that as a verdict against the 50-commit-window-calibrated critical bounds.
    expect(body).not.toMatch(/commits exceed \d+ production lines/);
    expect(body).not.toMatch(/commits touch more than \d+ files/);
    // The rate is still reported, just not verdicted: the small-sample note must say so.
    expect(body).toMatch(/1 commit\).*below the \d+-commit convention/);
  });

  test('still raises the concern at a sample size large enough for the guard to allow it', async () => {
    const { commits, commitDetailsBySha, files } = buildLargeSprawlingCommits(5);
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits, commitDetailsBySha });
    const context = {
      payload: { pull_request: { additions: 875, deletions: 0, changed_files: 7 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 43 }
    };

    await runPrAnalysis(script, githubMock, context);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    expect(body).toMatch(/commits exceed \d+ production lines/);
    expect(body).toMatch(/commits touch more than \d+ files/);
    expect(body).not.toMatch(/commit convention for a rate verdict/);
  });
});

// Builds `count` commits that each touch one production file and one test file, so every
// commit co-occurs test and production changes in the same commit (100% co-change rate).
function buildCochangeCommits(count) {
  const shas = Array.from({ length: count }, (_, i) => `d${i + 1}`);
  const commits = shas.map(sha => ({
    sha,
    commit: {
      message: 'feat: add a change with its test',
      author: { name: 'Dev', date: '2026-08-01T00:00:00.000Z' }
    }
  }));
  const commitFiles = [
    { filename: 'src/app.js', additions: 10, deletions: 2 },
    { filename: 'src/app.test.js', additions: 5, deletions: 1 }
  ];
  const commitDetailsBySha = {};
  for (const sha of shas) {
    commitDetailsBySha[sha] = { stats: { additions: 15, deletions: 3 }, files: commitFiles };
  }
  return { commits, commitDetailsBySha, files: commitFiles };
}

describe('pr-metrics.yml workflow script -- test/prod co-change field (code-quality-metrics-36d)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('pr-metrics.yml', 'Enhanced PR Analysis');
  });

  test('flags co-occurring commits with the renamed field and labels the PR comment as co-change, not test-first', async () => {
    const { commits, commitDetailsBySha, files } = buildCochangeCommits(5);
    const { githubMock, createCommentCalls } = makeGithubMock({ files, commits, commitDetailsBySha });
    const context = {
      payload: { pull_request: { additions: 75, deletions: 15, changed_files: 2 } },
      repo: { owner: 'acme', repo: 'widgets' },
      issue: { number: 44 }
    };

    await runPrAnalysis(script, githubMock, context);

    expect(createCommentCalls).toHaveLength(1);
    const body = createCommentCalls[0].body;
    // Every one of the 5 commits touches both a prod and a test file, so the co-change rate
    // is 100% -- proves the renamed field actually drives the computed rate, not just that
    // the label text changed.
    expect(body).toMatch(/5\/5 \(100%\)/);
    expect(body).toMatch(/co-change/i);
    expect(body).not.toMatch(/test-first/i);
  });
});

describe('pr-metrics.yml workflow script -- ANALYSIS_IGNORE_PATTERNS exclusion (code-quality-metrics-4fc)', () => {
  let script;

  beforeAll(() => {
    script = loadStepScript('pr-metrics.yml', 'Enhanced PR Analysis');
  });

  test('excludes matched files from the Production Code breakdown and from a commit’s sprawling flag', async () => {
    // 5 ordinary files (at, not over, the sprawling threshold) plus 6 excluded bin/ files.
    // Raw count is 11 (over threshold, would flag sprawling without the fix); the
    // non-excluded count is 5 (at the threshold, not sprawling).
    const ordinaryFiles = Array.from({ length: 5 }, (_, i) => ({ filename: `src/f${i}.js`, additions: 10, deletions: 0 }));
    const excludedFiles = Array.from({ length: 6 }, (_, i) => ({ filename: `bin/Debug/f${i}.dll`, additions: 500, deletions: 0 }));
    const allFiles = [...ordinaryFiles, ...excludedFiles];

    const commit = {
      sha: 'e1',
      commit: { message: 'feat: add a change', author: { name: 'Dev', date: '2026-08-01T00:00:00.000Z' } }
    };
    const commitDetailsBySha = { e1: { stats: { additions: 3050, deletions: 0 }, files: allFiles } };

    await withAnalysisIgnorePatterns(['**/bin/**'], async () => {
      const { githubMock, createCommentCalls } = makeGithubMock({ files: allFiles, commits: [commit], commitDetailsBySha });
      const context = {
        payload: { pull_request: { additions: 3050, deletions: 0, changed_files: 11 } },
        repo: { owner: 'acme', repo: 'widgets' },
        issue: { number: 50 }
      };

      await runPrAnalysis(script, githubMock, context);

      expect(createCommentCalls).toHaveLength(1);
      const body = createCommentCalls[0].body;
      // 5 non-excluded production files, not 11 raw files.
      expect(body).toMatch(/Production Code:\*\* 50 lines \(5 files\)/);
      // The Commit Details row's own flag bracket must not carry [sprawling] once excluded
      // files are removed from the count it is judged against (files_changed itself stays
      // the raw 11, so the flag -- not the raw count -- is what proves the exclusion).
      expect(body).toMatch(/50 prod lines, 11 files\n/);
      expect(body).not.toMatch(/files \[.*sprawling.*\]/);
      // The DORA/Commit Analysis tables' own rate rows report 0/1, confirming the aggregate
      // sprawling_commit flag itself (not just its display) came back false.
      expect(body).toMatch(/Sprawling commits \(>5 files\) \| 0\/1 \(0%\)/);
    });
  });
});
