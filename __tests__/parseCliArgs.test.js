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
});
