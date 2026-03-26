'use strict';

jest.mock('@anthropic-ai/sdk', () => ({
  Anthropic: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({
          ai_confidence: 75,
          risk_score: 80,
          patterns: ['generic variable names'],
          architectural_concerns: [],
          summary: 'Test summary'
        }) }]
      })
    }
  }))
}), { virtual: true });

jest.mock('child_process');
jest.mock('fs');

const { execSync } = require('child_process');
const {
  getAnthropicClient,
  selectClaudeCommits,
  getCommitDiff,
  analyzeWithClaude,
  CONFIG,
} = require('../local-code-metrics');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

// ---------------------------------------------------------------------------
// getAnthropicClient
// ---------------------------------------------------------------------------

describe('getAnthropicClient', () => {
  test('returns null when ANTHROPIC_API_KEY is not set', async () => {
    const client = await getAnthropicClient();
    expect(client).toBeNull();
  });

  test('returns a client object when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const client = await getAnthropicClient();
    expect(client).not.toBeNull();
    expect(typeof client.messages.create).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// getCommitDiff
// ---------------------------------------------------------------------------

describe('getCommitDiff', () => {
  test('combines stat and diff output into a single string', () => {
    execSync
      .mockReturnValueOnce('src/app.js | 10 ++++')  // git show --stat
      .mockReturnValueOnce('+const x = 1;');          // git show diff

    const result = getCommitDiff('abc123');
    expect(result).toContain('File Summary');
    expect(result).toContain('src/app.js | 10 ++++');
    expect(result).toContain('Diff');
    expect(result).toContain('+const x = 1;');
  });

  test('truncates output to AI_DIFF_MAX_CHARS', () => {
    const bigOutput = 'x'.repeat(CONFIG.AI_DIFF_MAX_CHARS + 1000);
    execSync
      .mockReturnValueOnce(bigOutput)
      .mockReturnValueOnce(bigOutput);

    const result = getCommitDiff('abc123');
    expect(result.length).toBeLessThanOrEqual(CONFIG.AI_DIFF_MAX_CHARS);
  });

  test('returns valid string even when git commands return empty', () => {
    execSync.mockReturnValue('');
    const result = getCommitDiff('abc123');
    expect(typeof result).toBe('string');
    expect(result).toContain('File Summary');
  });
});

// ---------------------------------------------------------------------------
// analyzeWithClaude
// ---------------------------------------------------------------------------

describe('analyzeWithClaude', () => {
  const { Anthropic } = require('@anthropic-ai/sdk');

  function makeClient() {
    return new Anthropic();
  }

  const COMMIT = {
    sha: 'abc1234',
    full_sha: 'abc1234' + '0'.repeat(33),
    message: 'feat: add thing',
    author: 'Dev',
    date: '2024-01-15T10:00:00Z',
    source_branch: 'feature/x',
  };

  beforeEach(() => {
    // getCommitDiff calls execSync twice per commit
    execSync.mockReturnValue('mock diff content');
  });

  test('returns result with ai_confidence and risk_score for a qualifying commit', async () => {
    const client = makeClient();
    const results = await analyzeWithClaude(client, [COMMIT]);
    expect(results).toHaveLength(1);
    expect(results[0].sha).toBe(COMMIT.sha);
    expect(results[0].ai_confidence).toBe(75);
    expect(results[0].risk_score).toBe(80);
  });

  test('returns result with patterns and architectural_concerns arrays', async () => {
    const client = makeClient();
    const results = await analyzeWithClaude(client, [COMMIT]);
    expect(Array.isArray(results[0].patterns)).toBe(true);
    expect(Array.isArray(results[0].architectural_concerns)).toBe(true);
  });

  test('records error and continues when API call throws', async () => {
    const client = makeClient();
    client.messages.create.mockRejectedValueOnce(new Error('rate limited'));

    const results = await analyzeWithClaude(client, [COMMIT]);
    expect(results).toHaveLength(1);
    expect(results[0].error).toMatch(/rate limited/);
  });

  test('records error when response is not valid JSON', async () => {
    const client = makeClient();
    client.messages.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }]
    });

    const results = await analyzeWithClaude(client, [COMMIT]);
    expect(results).toHaveLength(1);
    expect(results[0].error).toBeDefined();
  });

  test('strips markdown code fences from response before parsing', async () => {
    const client = makeClient();
    const payload = { ai_confidence: 50, risk_score: 60, patterns: [], architectural_concerns: [], summary: 'ok' };
    client.messages.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(payload) + '\n```' }]
    });

    const results = await analyzeWithClaude(client, [COMMIT]);
    expect(results[0].ai_confidence).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// selectClaudeCommits
// ---------------------------------------------------------------------------

describe('selectClaudeCommits', () => {
  function makeMetric(overrides) {
    return {
      sha: 'abc123',
      large_commit: false,
      total_additions: 10,
      total_deletions: 10,
      ...overrides
    };
  }

  test('returns only large commits where additions exceed deletions * AI_RISK_ADDITIONS_RATIO', () => {
    const metrics = [
      makeMetric({ sha: 'aaa', large_commit: true,  total_additions: 400, total_deletions: 10 }), // qualifies
      makeMetric({ sha: 'bbb', large_commit: false, total_additions: 400, total_deletions: 10 }), // not large
      makeMetric({ sha: 'ccc', large_commit: true,  total_additions: 10,  total_deletions: 10 }), // ratio too low
    ];
    const result = selectClaudeCommits(metrics);
    expect(result).toHaveLength(1);
    expect(result[0].sha).toBe('aaa');
  });

  test('caps results at AI_ANALYSIS_MAX_COMMITS', () => {
    const metrics = Array.from({ length: CONFIG.AI_ANALYSIS_MAX_COMMITS + 3 }, (_, i) => (
      makeMetric({ sha: `sha${i}`, large_commit: true, total_additions: 500, total_deletions: 10 })
    ));
    const result = selectClaudeCommits(metrics);
    expect(result).toHaveLength(CONFIG.AI_ANALYSIS_MAX_COMMITS);
  });

  test('returns empty array when no commits qualify', () => {
    const metrics = [
      makeMetric({ sha: 'zzz', large_commit: false, total_additions: 10, total_deletions: 10 }),
    ];
    expect(selectClaudeCommits(metrics)).toHaveLength(0);
  });

  test('sorts by total churn descending before capping', () => {
    const metrics = [
      makeMetric({ sha: 'small', large_commit: true, total_additions: 150, total_deletions: 10 }),
      makeMetric({ sha: 'large', large_commit: true, total_additions: 900, total_deletions: 10 }),
    ];
    const result = selectClaudeCommits(metrics);
    expect(result[0].sha).toBe('large');
  });
});
