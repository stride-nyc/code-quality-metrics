'use strict';

const { detectDeploymentFrequency, findUnmatchedVersionShapedRefs } = require('../lib/metrics');

describe('detectDeploymentFrequency', () => {
  const asOf = '2026-01-31T00:00:00.000Z';

  test('returns null when events array is empty', () => {
    expect(detectDeploymentFrequency([], asOf)).toBeNull();
  });

  test('returns release_count equal to events length', () => {
    const events = [
      { name: 'v1.0.0', date: '2026-01-01T00:00:00.000Z' },
      { name: 'v1.1.0', date: '2026-01-11T00:00:00.000Z' },
      { name: 'v1.2.0', date: '2026-01-21T00:00:00.000Z' },
    ];
    const result = detectDeploymentFrequency(events, asOf);
    expect(result.release_count).toBe(3);
  });

  test('computes median_interval_days between consecutive events', () => {
    // intervals: 10, 10 days
    const events = [
      { name: 'v1.0.0', date: '2026-01-01T00:00:00.000Z' },
      { name: 'v1.1.0', date: '2026-01-11T00:00:00.000Z' },
      { name: 'v1.2.0', date: '2026-01-21T00:00:00.000Z' },
    ];
    const result = detectDeploymentFrequency(events, asOf);
    expect(result.median_interval_days).toBe(10);
  });

  test('computes mean_interval_days between consecutive events', () => {
    // intervals: 5, 15 days — mean = 10
    const events = [
      { name: 'v1.0.0', date: '2026-01-01T00:00:00.000Z' },
      { name: 'v1.1.0', date: '2026-01-06T00:00:00.000Z' },
      { name: 'v1.2.0', date: '2026-01-21T00:00:00.000Z' },
    ];
    const result = detectDeploymentFrequency(events, asOf);
    expect(result.mean_interval_days).toBe(10);
  });

  test('returns null for median_interval_days when only one event exists', () => {
    const events = [{ name: 'v1.0.0', date: '2026-01-10T00:00:00.000Z' }];
    const result = detectDeploymentFrequency(events, asOf);
    expect(result.release_count).toBe(1);
    expect(result.median_interval_days).toBeNull();
    expect(result.mean_interval_days).toBeNull();
  });

  test('computes days_since_last relative to asOf', () => {
    const events = [
      { name: 'v1.0.0', date: '2026-01-01T00:00:00.000Z' },
      { name: 'v1.1.0', date: '2026-01-21T00:00:00.000Z' }, // 10 days before asOf
    ];
    const result = detectDeploymentFrequency(events, asOf);
    expect(result.days_since_last).toBe(10);
  });
});

describe('findUnmatchedVersionShapedRefs', () => {
  test('returns empty array when releaseTagPattern is null', () => {
    const names = ['v1.0.0', 'v1.1.0', 'not-a-version'];
    expect(findUnmatchedVersionShapedRefs(names, null, null)).toEqual([]);
  });

  test('returns refs that look version-shaped but do not match releaseTagPattern', () => {
    // v2.0.0 looks like a version but does not match ^release/
    const names = ['release/1.0', 'v2.0.0', 'feature/x'];
    const result = findUnmatchedVersionShapedRefs(names, '^release/', null);
    expect(result).toContain('v2.0.0');
    expect(result).not.toContain('release/1.0');   // matches pattern
    expect(result).not.toContain('feature/x');     // not version-shaped
  });

  test('does not flag refs that are excluded by stagingTagPattern as unmatched', () => {
    // staging-v1.0.0 looks version-shaped but is excluded by stagingTagPattern -- not unmatched
    const names = ['v1.0.0', 'staging-v1.0.0'];
    const result = findUnmatchedVersionShapedRefs(names, '^v\\d+', '^staging-');
    expect(result).not.toContain('staging-v1.0.0');
    expect(result).not.toContain('v1.0.0'); // matches release pattern
  });

  // Guard: staging shape must never be counted as production
  test('[guard] a staging-prefixed version-shaped tag is never returned as unmatched when stagingTagPattern is configured', () => {
    const names = ['staging-v3.2.1'];
    const result = findUnmatchedVersionShapedRefs(names, '^v\\d+', '^staging-v\\d+');
    expect(result).toEqual([]);
  });
});
