'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { CONFIG } = require('../lib/config');
const { commitIntroducesProductionFiles, findEffectiveRootSha } = require('../lib/git');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('commitIntroducesProductionFiles (code-quality-metrics-fex3, GitHub #71)', () => {
  test('returns false when a commit only touches a test file, introducing no production file', () => {
    execSync.mockReturnValue('src/app.test.js');

    const result = commitIntroducesProductionFiles('a'.repeat(40));

    expect(result).toBe(false);
  });

  // [guard] proves the true-direction branch actually runs: a stub that always returns false
  // (the mutation an untested true-direction would let slip through) fails this assertion.
  test('returns true when a commit touches a production file', () => {
    execSync.mockReturnValue('src/app.js');

    const result = commitIntroducesProductionFiles('a'.repeat(40));

    expect(result).toBe(true);
  });

  test('returns false when the commit has no changed files at all (a genuinely empty commit)', () => {
    execSync.mockReturnValue('');

    const result = commitIntroducesProductionFiles('a'.repeat(40));

    expect(result).toBe(false);
  });
});

describe('findEffectiveRootSha (code-quality-metrics-fex3, GitHub #71)', () => {
  // [guard] proves the no-op path: a root commit that already introduces a production file
  // must not trigger the forward walk at all, and must be returned unchanged.
  test('returns the root sha unchanged when it already introduces a production file', () => {
    const ROOT = 'a'.repeat(40);
    execSync.mockImplementation(command => {
      if (typeof command === 'string' && command.includes('--name-only')) return 'src/app.js';
      throw new Error(`unexpected command in this test: ${command}`);
    });

    const result = findEffectiveRootSha(ROOT);

    expect(result).toBe(ROOT);
  });

  // Real case (code-quality-metrics-fex3, GitHub #71): stride-nyc/73V's root commit ec1026c4
  // (2022-01-26) adds only LICENSE and README, then nothing for three years, then 2,928
  // commits in 2025. A scaffold root commit like this must not anchor the lifecycle test;
  // the first commit that DOES introduce a production file should stand in for it.
  //
  // CAVEAT this test makes visible rather than hiding: LICENSE and README.md are not
  // excluded by ANY pattern under CONFIG.ANALYSIS_IGNORE_PATTERNS' own empty default, so
  // under bare defaults they read as "production" by the same rule analyzeCommit's prodFiles
  // count uses, and this scaffold would not be caught. This test configures
  // ANALYSIS_IGNORE_PATTERNS the same way a real 73V-shaped repository's own .codemetrics.json
  // would need to (an existing, already-shipped override -- not a new default pattern this
  // change adds to lib/config.js), so the walk-forward mechanism itself is exercised against
  // the real shape. See commitIntroducesProductionFiles' own doc comment and
  // metrics-specification.md's Scaffold Root Commit Detection section for the same caveat.
  describe('with ANALYSIS_IGNORE_PATTERNS configured to exclude LICENSE/README (the 73V shape)', () => {
    let original;

    beforeEach(() => {
      original = CONFIG.ANALYSIS_IGNORE_PATTERNS;
      CONFIG.ANALYSIS_IGNORE_PATTERNS = ['LICENSE', 'README.md'];
    });

    afterEach(() => {
      CONFIG.ANALYSIS_IGNORE_PATTERNS = original;
    });

    test('walks forward to the first commit that introduces a production file when the root commit is a scaffold', () => {
      const ROOT = 'a'.repeat(40);
      const BUILD_START = 'b'.repeat(40);
      execSync.mockImplementation(command => {
        if (typeof command === 'string' && command.includes('--name-only')) {
          if (command.includes(ROOT)) return 'LICENSE\nREADME.md';
          if (command.includes(BUILD_START)) return 'src/app.js';
          throw new Error(`unexpected sha in --name-only query: ${command}`);
        }
        if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) {
          return `${ROOT}\n${BUILD_START}`;
        }
        throw new Error(`unexpected command in this test: ${command}`);
      });

      const result = findEffectiveRootSha(ROOT);

      expect(result).toBe(BUILD_START);
    });
  });

  // [guard] if every later commit is also scaffold-only (no production file anywhere in the
  // repository's history), there is nothing better to fall back to than the root itself.
  test('returns the root sha unchanged when no later commit introduces a production file either', () => {
    const ROOT = 'a'.repeat(40);
    const OTHER = 'b'.repeat(40);
    execSync.mockImplementation(command => {
      if (typeof command === 'string' && command.includes('--name-only')) return 'LICENSE';
      if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) {
        return `${ROOT}\n${OTHER}`;
      }
      throw new Error(`unexpected command in this test: ${command}`);
    });

    const result = findEffectiveRootSha(ROOT);

    expect(result).toBe(ROOT);
  });
});
