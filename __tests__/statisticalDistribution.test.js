'use strict';

const { computeStatistics } = require('../local-code-metrics');

describe('computeStatistics', () => {
  it('returns zero-value result for empty array', () => {
    const result = computeStatistics([], []);
    expect(result.p50).toBe(0);
    expect(result.p90).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.mean).toBe(0);
    expect(result.stddev).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('returns correct values for single-element array', () => {
    const result = computeStatistics([100], [Date.now()]);
    expect(result.p50).toBe(100);
    expect(result.p90).toBe(100);
    expect(result.p95).toBe(100);
    expect(result.mean).toBe(100);
    expect(result.stddev).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('returns correct percentiles for known 10-element dataset', () => {
    const sizes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const now = Date.now();
    const timestamps = sizes.map((_, i) => now + i * 1000);
    const result = computeStatistics(sizes, timestamps);
    expect(result.p50).toBe(55);
    expect(result.mean).toBe(55);
    expect(result.p90).toBeGreaterThan(result.p50);
    expect(result.p95).toBeGreaterThan(result.p90);
    expect(result.stddev).toBeGreaterThan(0);
  });

  it('returns "growing" when sizes increase over time', () => {
    const sizes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const now = Date.now();
    const timestamps = sizes.map((_, i) => now + i * 86400000);
    expect(computeStatistics(sizes, timestamps).trend).toBe('growing');
  });

  it('returns "shrinking" when sizes decrease over time', () => {
    const sizes = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const now = Date.now();
    const timestamps = sizes.map((_, i) => now + i * 86400000);
    expect(computeStatistics(sizes, timestamps).trend).toBe('shrinking');
  });

  it('returns "stable" when sizes are flat', () => {
    const sizes = [50, 50, 50, 50, 50, 50];
    const now = Date.now();
    const timestamps = sizes.map((_, i) => now + i * 86400000);
    expect(computeStatistics(sizes, timestamps).trend).toBe('stable');
  });

  it('marks an extreme value as outlier when it exceeds mean + 2*stddev', () => {
    const sizes = [10, 10, 10, 10, 10, 10, 10, 10, 10, 1000];
    const now = Date.now();
    const timestamps = sizes.map((_, i) => now + i * 1000);
    const result = computeStatistics(sizes, timestamps);
    expect(result.isOutlier(1000)).toBe(true);
    expect(result.isOutlier(10)).toBe(false);
  });

  it('no values are outliers when distribution is uniform', () => {
    const sizes = [50, 50, 50, 50];
    const now = Date.now();
    const timestamps = sizes.map((_, i) => now + i * 1000);
    const result = computeStatistics(sizes, timestamps);
    expect(result.isOutlier(50)).toBe(false);
  });
});
