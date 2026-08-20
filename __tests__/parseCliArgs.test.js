'use strict';

const { parseCliArgs } = require('../local-code-metrics');

describe('parseCliArgs', () => {
  test('rejects a non-numeric --days value', () => {
    expect(() => parseCliArgs(['--days', 'abc'])).toThrow(/--days/);
  });

  test('accepts a valid --days value', () => {
    expect(parseCliArgs(['--days', '90'])).toEqual({ days: 90 });
  });

  test('rejects a non-positive --days value', () => {
    expect(() => parseCliArgs(['--days', '-5'])).toThrow(/--days/);
    expect(() => parseCliArgs(['--days', '0'])).toThrow(/--days/);
  });

  test('rejects a --since value that is not an ISO date', () => {
    expect(() => parseCliArgs(['--since', 'notadate'])).toThrow(/--since/);
  });

  test('rejects a flag given without a value', () => {
    expect(() => parseCliArgs(['--days'])).toThrow(/--days/);
    expect(() => parseCliArgs(['--since'])).toThrow(/--since/);
  });

  // Guard, not a red: the validation added above already admits this input.
  // Present so a future tightening of the date check cannot silently reject
  // the format the script itself generates.
  test('accepts a valid --since date and ignores unrelated arguments', () => {
    expect(parseCliArgs(['--since', '2026-04-01'])).toEqual({ since: '2026-04-01' });
    expect(parseCliArgs([])).toEqual({});
  });

  test('rejects a --history value other than granular or squashed', () => {
    expect(() => parseCliArgs(['--history', 'sortof'])).toThrow(/--history/);
  });

  test('accepts a valid --history value', () => {
    expect(parseCliArgs(['--history', 'squashed'])).toEqual({ history: 'squashed' });
    expect(parseCliArgs(['--history', 'granular'])).toEqual({ history: 'granular' });
  });

  test('rejects --history given without a value', () => {
    expect(() => parseCliArgs(['--history'])).toThrow(/--history/);
  });

  test('accepts a valid --config value', () => {
    expect(parseCliArgs(['--config', '/tmp/shared/.codemetrics.json'])).toEqual({ config: '/tmp/shared/.codemetrics.json' });
  });

  // GUARD: proven by removing the `if (!argv[i + 1]) throw` guard on the --config
  // branch in local-code-metrics.js -- without it, options.config is silently set to
  // undefined and the loop continues, so this test starts failing.
  test('rejects --config given without a value', () => {
    expect(() => parseCliArgs(['--config'])).toThrow(/--config/);
  });

  // code-quality-metrics-zkhq, GitHub #71 part 1: --lifecycle mirrors --history's own shape.
  test('rejects a --lifecycle value other than initial-build or established', () => {
    expect(() => parseCliArgs(['--lifecycle', 'sortof'])).toThrow(/--lifecycle/);
  });

  test('accepts a valid --lifecycle value', () => {
    expect(parseCliArgs(['--lifecycle', 'initial-build'])).toEqual({ lifecycle: 'initial-build' });
    expect(parseCliArgs(['--lifecycle', 'established'])).toEqual({ lifecycle: 'established' });
  });

  test('rejects --lifecycle given without a value', () => {
    expect(() => parseCliArgs(['--lifecycle'])).toThrow(/--lifecycle/);
  });

  // code-quality-metrics: per-run override of CONFIG.MAX_COMMITS, for a reference measurement
  // spanning a repository's first twelve months rather than the newest 50 commits.
  test('rejects a non-numeric, non-unbounded --max-commits value', () => {
    expect(() => parseCliArgs(['--max-commits', 'abc'])).toThrow(/--max-commits/);
  });

  // Guards, not reds: the implementation added for the RED above already admits every case
  // below (numeric accept, non-positive reject, missing-value reject, unbounded accept), the
  // same way this file's own "accepts a valid --since date" guard documents behavior a prior
  // cycle's implementation already covers, rather than driving new code.
  test('accepts a valid --max-commits value', () => {
    expect(parseCliArgs(['--max-commits', '400'])).toEqual({ maxCommits: 400 });
  });

  test('rejects a non-positive --max-commits value', () => {
    expect(() => parseCliArgs(['--max-commits', '-5'])).toThrow(/--max-commits/);
    expect(() => parseCliArgs(['--max-commits', '0'])).toThrow(/--max-commits/);
  });

  test('rejects --max-commits given without a value', () => {
    expect(() => parseCliArgs(['--max-commits'])).toThrow(/--max-commits/);
  });

  test('accepts the unbounded sentinel for --max-commits', () => {
    expect(parseCliArgs(['--max-commits', 'unbounded'])).toEqual({ maxCommits: 'unbounded' });
  });
});
