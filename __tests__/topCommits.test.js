'use strict';

const { topCommits } = require('../lib/report');

function commit(sha, additions, deletions, countedAdditions, countedDeletions) {
  return {
    sha,
    total_additions: additions,
    total_deletions: deletions,
    counted_additions: countedAdditions !== undefined ? countedAdditions : additions,
    counted_deletions: countedDeletions !== undefined ? countedDeletions : deletions
  };
}

describe('topCommits', () => {
  it('returns the top N commits sorted descending by total lines changed', () => {
    const metrics = [
      commit('aaa', 10, 5),   // 15
      commit('bbb', 100, 50), // 150
      commit('ccc', 1, 1),    // 2
      commit('ddd', 40, 10)   // 50
    ];

    const result = topCommits(metrics, 2);

    expect(result.map(c => c.sha)).toEqual(['bbb', 'ddd']);
  });

  it('defaults to the top 10 commits when n is not provided', () => {
    const metrics = Array.from({ length: 15 }, (_, i) => commit(`sha${i}`, i, 0));

    const result = topCommits(metrics);

    expect(result).toHaveLength(10);
  });

  // A commit whose diff is mostly ANALYSIS_IGNORE_PATTERNS-excluded content (a vendored sync,
  // a generated-file dump) can have a huge total_additions + total_deletions while its
  // counted_additions + counted_deletions (the exclusion-aware basis lib/claude.js, lib/metrics.js
  // and net_additions_ratio already rank on, per PR #100) is small. Ranking "top commits" on the
  // raw total put exactly this kind of commit at the top of 73V's Flight Log ahead of commits
  // with genuinely larger production changes. topCommits must rank on counted_*, matching those
  // four sites, not on the raw whole-diff total.
  it('ranks by counted lines changed, not the raw whole-diff total, when they diverge', () => {
    const metrics = [
      commit('mostlyExcluded', 14679, 0, 216, 0),
      commit('genuine', 300, 0, 300, 0)
    ];

    const result = topCommits(metrics, 2);

    expect(result.map(c => c.sha)).toEqual(['genuine', 'mostlyExcluded']);
  });
});
