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

  it('marks a value far above the rest of the distribution as an outlier', () => {
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

  it('keeps a commit flagged after a larger commit joins the window (monotonicity)', () => {
    // code-quality-metrics-496: the old mean + 2*stddev cutoff moves toward a newly
    // added extreme value, which can push previously-flagged commits back under the
    // cutoff. Reproduces that shape (a body of ordinary commits plus a few already-large
    // ones), then adds one commit larger than everything already in the window.
    const baseline = [
      30, 45, 60, 25, 80, 120, 55, 40, 35, 90, 70, 60, 50, 45, 38, 42, 65, 72,
      58, 48, 36, 44, 53, 61, 39, 47, 68, 59, 41, 46, 63, 55, 49, 37, 52, 44
    ];
    const now = Date.now();
    const windowBefore = [...baseline, 1800, 2200, 2925];
    const windowAfter = [...windowBefore, 6518];
    const timestampsBefore = windowBefore.map((_, i) => now + i * 1000);
    const timestampsAfter = windowAfter.map((_, i) => now + i * 1000);

    const statsBefore = computeStatistics(windowBefore, timestampsBefore);
    const flaggedBefore = windowBefore.filter(v => statsBefore.isOutlier(v));

    // Sanity: the scenario must actually discriminate (something flagged, but not
    // everything), otherwise the assertions below would hold vacuously.
    expect(flaggedBefore.length).toBeGreaterThan(0);
    expect(flaggedBefore.length).toBeLessThan(windowBefore.length);

    const statsAfter = computeStatistics(windowAfter, timestampsAfter);

    // Property under test: adding a larger commit to the window must never un-flag
    // a commit that was already flagged. Expected behaviour here is the invariant
    // itself (still flagged), not a recomputed cutoff value from the production formula.
    flaggedBefore.forEach(v => {
      expect(statsAfter.isOutlier(v)).toBe(true);
    });

    // Discriminating power must persist too: an ordinary baseline commit must still
    // read as non-outlier, so the property above isn't satisfied by flagging everything.
    expect(statsAfter.isOutlier(baseline[0])).toBe(false);
  });
});
