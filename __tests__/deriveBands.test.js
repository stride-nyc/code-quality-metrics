'use strict';

const { deriveBand } = require('../calibration/derive-bands');

/** Build an observation list: [[repo, value], ...] -> [{repo, value}] */
function obs(pairs) {
  return pairs.map(([repo, value]) => ({ repo, value }));
}

describe('deriveBand', () => {
  it('marks an informational metric (no bad direction) with tier informational, healthy and critical null', () => {
    const result = deriveBand('test_isolation_rate', obs([
      ['repoA', 4], ['repoA', 22], ['repoB', 10], ['repoB', 14]
    ]));
    expect(result.tier).toBe('informational');
    expect(result.healthy).toBeNull();
    expect(result.critical).toBeNull();
  });

  it('marks a higher-is-worse metric two-band when only one repo sits near the max', () => {
    // repoA supplies both windows near the max (100, 92); repoB is far below (10, 12).
    // Only repoA is within 15% of the max (100), so the critical bound rests on one repo.
    const result = deriveBand('avg_lines_changed', obs([
      ['repoA', 100], ['repoA', 92], ['repoB', 10], ['repoB', 12]
    ]));
    expect(result.tier).toBe('two-band');
    expect(result.critical).toBeNull();
    expect(result.supportingRepos).toEqual(['repoA']);
  });

  it('marks a higher-is-worse metric three-band when two distinct repos sit near the max', () => {
    // repoA's max is 100; repoB's max is 90, which is within 15% of 100 (>= 85).
    const result = deriveBand('avg_lines_changed', obs([
      ['repoA', 100], ['repoA', 20], ['repoB', 90], ['repoB', 30]
    ]));
    expect(result.tier).toBe('three-band');
    expect(result.critical).toBe(round(100));
    expect(result.supportingRepos.sort()).toEqual(['repoA', 'repoB']);
  });

  it('computes healthy as p75 and critical as max for a higher-is-worse metric', () => {
    // 12 values, sorted: 10,20,30,40,50,60,70,80,90,100,110,120
    // p75 (linear interpolation, index 0.75*11=8.25): 90 + 0.25*(100-90) = 92.5 -> round(92.5*2)/2? no, round rule: >=10 -> Math.round -> 93 (since 92.5>=10, round(92.5) per project's `round` fn used in this file... verified against implementation below)
    const pairs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120].map((v, i) => [`repo${i % 3}`, v]);
    const result = deriveBand('avg_lines_changed', obs(pairs));
    expect(result.healthy).toBe(round(92.5));
    expect(result.critical).toBe(round(120));
  });

  it('computes healthy as p25 and critical as min for a higher-is-better metric', () => {
    // Two distinct repos (repoA, repoB) both sit near the min (10 and 10.5, 5%
    // apart), so this is a three-band case and critical should equal the min.
    const values = [10, 10.5, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    const pairs = values.map((v, i) => [i === 0 ? 'repoA' : i === 1 ? 'repoB' : 'repoC', v]);
    const result = deriveBand('test_coverage_rate', obs(pairs));
    // p25 (index 0.25*11=2.75): 20 + 0.75*(30-20) = 27.5
    expect(result.tier).toBe('three-band');
    expect(result.healthy).toBe(round(27.5));
    expect(result.critical).toBe(round(10));
  });

  it('does not export a CRITICAL_MULTIPLE convention any more', () => {
    expect(require('../calibration/derive-bands').CRITICAL_MULTIPLE).toBeUndefined();
  });
});

// Mirrors calibration/derive-bands.js's own rounding rule, so this test file does not
// need to hardcode magic numbers that would silently drift if that rule changes.
function round(n) {
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 10) return Math.round(n);
  if (n >= 1) return Math.round(n * 2) / 2;
  return Math.round(n * 100) / 100;
}
