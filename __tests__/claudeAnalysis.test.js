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
const fs = require('fs');
const {
  getAnthropicClient,
  selectClaudeCommits,
  getCommitDiff,
  analyzeWithClaude,
  CONFIG,
} = require('../local-code-metrics');
const { analyzeDuplicatesWithClaude, runSemanticDuplicateAnalysis } = require('../lib/claude');

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

// ---------------------------------------------------------------------------
// analyzeDuplicatesWithClaude
// ---------------------------------------------------------------------------

describe('analyzeDuplicatesWithClaude', () => {
  const FIXTURE_FINDING = {
    file1: 'src/lib/git.js',
    file2: 'src/lib/metrics.js',
    similarity: 'both parse line-delimited data with the same loop structure',
    concern: 'copy-paste risk in parsing logic',
    confidence: 'high'
  };

  function makeClient(responsePayload) {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(responsePayload || [FIXTURE_FINDING]) }]
    });
    return { messages: { create: mockCreate } };
  }

  test('returns empty array when client is null', async () => {
    const result = await analyzeDuplicatesWithClaude(null, ['src/lib/git.js'], []);
    expect(result).toEqual([]);
  });

  test('calls messages.create with file contents and staticFindings count', async () => {
    const client = makeClient();
    fs.readFileSync.mockReturnValue('function parse(line) {}');
    await analyzeDuplicatesWithClaude(client, ['src/lib/git.js'], [{ lines: 10 }]);
    expect(client.messages.create).toHaveBeenCalled();
    const call = client.messages.create.mock.calls[0][0];
    expect(call.messages[0].content).toContain('src/lib/git.js');
    expect(call.messages[0].content).toContain('1 static finding');
  });

  test('parses structured response into file1/file2/similarity/concern/confidence', async () => {
    const client = makeClient();
    fs.readFileSync.mockReturnValue('function parse(line) {}');
    const result = await analyzeDuplicatesWithClaude(client, ['src/lib/git.js'], []);
    expect(result).toHaveLength(1);
    expect(result[0].file1).toBe('src/lib/git.js');
    expect(result[0].confidence).toBe('high');
  });

  test('returns empty array when API response is malformed', async () => {
    const client = makeClient('not-json-array');
    client.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all {{{' }]
    });
    fs.readFileSync.mockReturnValue('function parse(line) {}');
    const result = await analyzeDuplicatesWithClaude(client, ['src/lib/git.js'], []);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runSemanticDuplicateAnalysis
// ---------------------------------------------------------------------------

describe('runSemanticDuplicateAnalysis', () => {
  function makeClient(response) {
    const mockCreate = jest.fn().mockResolvedValue(response);
    return { messages: { create: mockCreate } };
  }

  beforeEach(() => {
    fs.readFileSync.mockReturnValue('function parse(line) {}');
  });

  // Reproduced against a real repo: 74911 input tokens, 1024 output tokens
  // (equal to max_tokens), stop_reason max_tokens, body begins with valid
  // findings JSON before being cut off. See code-quality-metrics-all.
  test('returns status "unmeasured" when the response is truncated at max_tokens', async () => {
    const client = makeClient({
      stop_reason: 'max_tokens',
      usage: { input_tokens: 74911, output_tokens: 1024 },
      content: [{ type: 'text', text: '[{"file1": "src/context/useSidebarCollapsed.ts", "file2": "src/context/useUpcomingShipments.ts", "similarity": "identical custom hook factories' }]
    });

    const result = await runSemanticDuplicateAnalysis(client, ['src/lib/git.js'], []);

    expect(result.status).toBe('unmeasured');
    expect(result.findings).toEqual([]);
    expect(result.error).toBeDefined();
  });

  // The following four lock in behavior already implemented alongside the
  // truncation branch above (written together as one function body rather
  // than driven test-by-test) -- guards confirming existing behavior, not
  // fresh RED/GREEN cycles. Documented honestly per process discipline.

  test('returns status "skipped" and empty findings when client is null', async () => {
    const result = await runSemanticDuplicateAnalysis(null, ['src/lib/git.js'], []);
    expect(result).toEqual({ status: 'skipped', findings: [] });
  });

  test('returns status "unmeasured" with the error message when the API call throws', async () => {
    const client = { messages: { create: jest.fn().mockRejectedValue(new Error('rate limited')) } };
    const result = await runSemanticDuplicateAnalysis(client, ['src/lib/git.js'], []);
    expect(result.status).toBe('unmeasured');
    expect(result.findings).toEqual([]);
    expect(result.error).toMatch(/rate limited/);
  });

  test('returns status "unmeasured" when the response is not valid JSON (no truncation)', async () => {
    const client = makeClient({ content: [{ type: 'text', text: 'not valid json at all {{{' }] });
    const result = await runSemanticDuplicateAnalysis(client, ['src/lib/git.js'], []);
    expect(result.status).toBe('unmeasured');
    expect(result.findings).toEqual([]);
    expect(result.error).toBeDefined();
  });

  test('returns status "ok" with parsed findings on a successful response', async () => {
    const finding = { file1: 'a.js', file2: 'b.js', similarity: 'same shape', concern: 'copy-paste', confidence: 'high' };
    const client = makeClient({ content: [{ type: 'text', text: JSON.stringify([finding]) }] });
    const result = await runSemanticDuplicateAnalysis(client, ['src/lib/git.js'], []);
    expect(result.status).toBe('ok');
    expect(result.findings).toEqual([finding]);
    expect(result.error).toBeUndefined();
  });

  test('bounds the file set sent to Claude to CONFIG.AI_DUPLICATE_MAX_FILES', async () => {
    const client = makeClient({ content: [{ type: 'text', text: '[]' }] });
    const manyFiles = Array.from({ length: CONFIG.AI_DUPLICATE_MAX_FILES + 5 }, (_, i) => `src/file${i}.js`);

    await runSemanticDuplicateAnalysis(client, manyFiles, []);

    expect(fs.readFileSync).toHaveBeenCalledTimes(CONFIG.AI_DUPLICATE_MAX_FILES);
  });
});

describe('semantic duplicate output budget', () => {
  test('requests enough output tokens to hold a complete findings array', async () => {
    // A real 40-file response measured ~1000 output tokens against the old 1024 cap, so
    // completion was a coin flip: one run finished at 969, another hit 1024 and truncated.
    // Asserting the request parameter because the cap only manifests API-side; there is no
    // local observable for "the response was not cut off".
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '[]' }]
    });
    await runSemanticDuplicateAnalysis({ messages: { create } }, ['a.js'], []);

    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(4096);
  });
});
