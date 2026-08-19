'use strict';

const { windowIncludesRepositoryRoot } = require('../lib/git');

describe('windowIncludesRepositoryRoot', () => {
  test("returns false when none of the analyzed commits match the repository's root commit(s)", () => {
    const result = windowIncludesRepositoryRoot({
      analyzedShas: ['aaa1111111111111111111111111111111111111'],
      rootShas: ['zzz9999999999999999999999999999999999999']
    });
    expect(result).toBe(false);
  });

  // [guard] proves the true-direction branch actually runs: a stub that always returns false
  // (the mutation an untested true-direction would let slip through) fails this assertion.
  test("returns true when one of the analyzed commits is the repository's root commit", () => {
    const root = 'zzz9999999999999999999999999999999999999';
    const result = windowIncludesRepositoryRoot({
      analyzedShas: ['aaa1111111111111111111111111111111111111', root],
      rootShas: [root]
    });
    expect(result).toBe(true);
  });
});
