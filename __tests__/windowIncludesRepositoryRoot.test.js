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
});
