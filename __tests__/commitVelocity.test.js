'use strict';

const { computeVelocity } = require('../local-code-metrics');

describe('computeVelocity', () => {
  it('returns stable trend and zero rate for empty array', () => {
    const result = computeVelocity([]);
    expect(result.commits_per_day).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('returns stable trend for single commit', () => {
    const result = computeVelocity([new Date('2024-01-15T10:00:00Z').toISOString()]);
    expect(result.commits_per_day).toBeGreaterThanOrEqual(0);
    expect(result.trend).toBe('stable');
  });

  it('returns "accelerating" when second half has proportionally more commits', () => {
    // 10 days: 2 commits in first 5 days, 8 in second 5 days
    const base = new Date('2024-01-01T00:00:00Z').getTime();
    const dates = [
      new Date(base + 1 * 86400000).toISOString(),
      new Date(base + 2 * 86400000).toISOString(),
      new Date(base + 6 * 86400000).toISOString(),
      new Date(base + 7 * 86400000).toISOString(),
      new Date(base + 8 * 86400000).toISOString(),
      new Date(base + 9 * 86400000).toISOString(),
    ];
    expect(computeVelocity(dates).trend).toBe('accelerating');
  });

  it('returns "decelerating" when second half has proportionally fewer commits', () => {
    const base = new Date('2024-01-01T00:00:00Z').getTime();
    const dates = [
      new Date(base + 1 * 86400000).toISOString(),
      new Date(base + 2 * 86400000).toISOString(),
      new Date(base + 3 * 86400000).toISOString(),
      new Date(base + 4 * 86400000).toISOString(),
      new Date(base + 9 * 86400000).toISOString(),
    ];
    expect(computeVelocity(dates).trend).toBe('decelerating');
  });

  it('returns "stable" when commit rate is roughly even across both halves', () => {
    const base = new Date('2024-01-01T00:00:00Z').getTime();
    const dates = [
      new Date(base + 1 * 86400000).toISOString(),
      new Date(base + 2 * 86400000).toISOString(),
      new Date(base + 8 * 86400000).toISOString(),
      new Date(base + 9 * 86400000).toISOString(),
    ];
    expect(computeVelocity(dates).trend).toBe('stable');
  });

  it('returns positive commits_per_day when dates arrive newest-first (git log order)', () => {
    // git log outputs commits newest-first; velocity must still be positive
    const base = new Date('2024-01-01T00:00:00Z').getTime();
    const datesOldestFirst = [
      new Date(base + 1 * 86400000).toISOString(),
      new Date(base + 3 * 86400000).toISOString(),
      new Date(base + 5 * 86400000).toISOString(),
      new Date(base + 7 * 86400000).toISOString(),
    ];
    const datesNewestFirst = [...datesOldestFirst].reverse();
    const result = computeVelocity(datesNewestFirst);
    expect(result.commits_per_day).toBeGreaterThan(0);
  });
});
