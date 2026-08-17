'use strict';

const { topCommits } = require('../lib/report');

function commit(sha, additions, deletions) {
  return { sha, total_additions: additions, total_deletions: deletions };
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
});
