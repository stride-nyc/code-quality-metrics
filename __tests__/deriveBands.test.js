'use strict';

const { deriveBand, selectByEra, selectByPopulation } = require('../calibration/derive-bands');

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

  // code-quality-metrics-a9z and code-quality-metrics-6ti: the literature review found no
  // defensible boundary for either metric (net_additions_ratio_median's own form is the
  // weakest relative-churn measure tested in the primary source; message_quality_pct mostly
  // measures Conventional Commits adoption, not quality). Both are now reported
  // descriptively, so derive-bands.js must stop proposing a band for them too, the same way
  // it already treats test_isolation_rate.
  it('marks net_additions_ratio_median and message_quality_pct informational now that their scored bands are dropped', () => {
    const churn = deriveBand('net_additions_ratio_median', obs([
      ['repoA', 0.5], ['repoB', 0.2]
    ]));
    expect(churn.tier).toBe('informational');
    expect(churn.healthy).toBeNull();
    expect(churn.critical).toBeNull();

    const messageQuality = deriveBand('message_quality_pct', obs([
      ['repoA', 80], ['repoB', 50]
    ]));
    expect(messageQuality.tier).toBe('informational');
    expect(messageQuality.healthy).toBeNull();
    expect(messageQuality.critical).toBeNull();
  });

  it('marks a higher-is-worse metric two-band when only one repo sits near the max', () => {
    // repoA supplies both windows near the max (100, 92); repoB is far below (10, 12).
    // Only repoA is within 15% of the max (100), so the critical bound rests on one repo.
    const result = deriveBand('p90_lines_changed', obs([
      ['repoA', 100], ['repoA', 92], ['repoB', 10], ['repoB', 12]
    ]));
    expect(result.tier).toBe('two-band');
    expect(result.critical).toBeNull();
    expect(result.supportingRepos).toEqual(['repoA']);
  });

  it('marks a higher-is-worse metric three-band when two distinct repos sit near the max', () => {
    // repoA's max is 100; repoB's max is 90, which is within 15% of 100 (>= 85).
    const result = deriveBand('p90_lines_changed', obs([
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
    const result = deriveBand('p90_lines_changed', obs(pairs));
    expect(result.healthy).toBe(round(92.5));
    expect(result.critical).toBe(round(120));
  });

  // code-quality-metrics-k1g (coordination follow-up): lib/thresholds.js dropped
  // AVG_LINES_CHANGED entirely because three independent published fits put commit size on a
  // heavy-tailed distribution (a generalized Pareto with shape 1.4617 has no finite mean), so a
  // band on the mean was unsound at any boundary. derive-bands.js must stop proposing a band for
  // avg_lines_changed too, the same way it already treats message_quality_pct and
  // net_additions_ratio_median once their scored bands were dropped.
  it('marks avg_lines_changed informational now that its scored band is dropped', () => {
    const result = deriveBand('avg_lines_changed', obs([
      ['repoA', 100], ['repoA', 92], ['repoB', 10], ['repoB', 12]
    ]));
    expect(result.tier).toBe('informational');
    expect(result.healthy).toBeNull();
    expect(result.critical).toBeNull();
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

describe('selectByEra', () => {
  it('filters to only observations matching the given era when an era is specified', () => {
    const observations = [
      { repo: 'repoA', era: 'current' },
      { repo: 'repoB', era: 'pre-ai' },
      { repo: 'repoC', era: 'current' }
    ];
    const result = selectByEra(observations, 'current');
    expect(result).toEqual([
      { repo: 'repoA', era: 'current' },
      { repo: 'repoC', era: 'current' }
    ]);
  });

  it('returns every observation unchanged when era is omitted', () => {
    const observations = [
      { repo: 'repoA', era: 'current' },
      { repo: 'repoB', era: 'pre-ai' }
    ];
    expect(selectByEra(observations)).toEqual(observations);
  });
});

// code-quality-metrics-7sk: a squash-merge reference set (one commit is a whole pull request)
// must never be pooled with the granular reference set (one commit is an individual commit) --
// the two populations describe different units. selectByPopulation defaults to 'granular' so
// that not passing --population reproduces exactly what derive-bands.js already did before any
// squash-merge observation existed: every existing observation lacks a `population` field, and
// every existing caller gets the same numbers as before this option was added.
describe('selectByPopulation', () => {
  it('defaults to granular, excluding squash-merge observations, when population is omitted', () => {
    const observations = [
      { repo: 'repoA' },
      { repo: 'repoB', population: 'squash-merge' },
      { repo: 'repoC', population: 'granular' }
    ];
    expect(selectByPopulation(observations)).toEqual([
      { repo: 'repoA' },
      { repo: 'repoC', population: 'granular' }
    ]);
  });

  it('treats an observation with no population field as granular', () => {
    const observations = [{ repo: 'repoA' }, { repo: 'repoB', population: 'squash-merge' }];
    expect(selectByPopulation(observations, 'granular')).toEqual([{ repo: 'repoA' }]);
  });

  it('returns only squash-merge observations when population is squash-merge', () => {
    const observations = [
      { repo: 'repoA' },
      { repo: 'repoB', population: 'squash-merge' },
      { repo: 'repoC', population: 'squash-merge' }
    ];
    expect(selectByPopulation(observations, 'squash-merge')).toEqual([
      { repo: 'repoB', population: 'squash-merge' },
      { repo: 'repoC', population: 'squash-merge' }
    ]);
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
