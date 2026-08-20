'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
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

  // Real case (code-quality-metrics-fex3, GitHub #71): stride-nyc/73V's actual root commit
  // touches only LICENSE and README.md. Default configuration throughout -- no
  // ANALYSIS_IGNORE_PATTERNS mutation -- since a scaffold this common must be caught without
  // any operator configuration.
  test('returns false when a commit only touches repo-furniture files (LICENSE, README.md), using default configuration', () => {
    execSync.mockReturnValue('LICENSE\nREADME.md');

    const result = commitIntroducesProductionFiles('a'.repeat(40));

    expect(result).toBe(false);
  });

  // [guard] a root commit that happens to include one real source file alongside repo
  // furniture is NOT a scaffold: production presence wins.
  test('returns true when a commit mixes repo furniture with one real source file', () => {
    execSync.mockReturnValue('LICENSE\nREADME.md\nsrc/app.js');

    const result = commitIntroducesProductionFiles('a'.repeat(40));

    expect(result).toBe(true);
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
  // Default configuration throughout -- no ANALYSIS_IGNORE_PATTERNS mutation. LICENSE and
  // README.md are repo furniture (isRepoFurniture, CONFIG.REPO_FURNITURE_PATTERNS), matched
  // structurally regardless of ANALYSIS_IGNORE_PATTERNS, so this scaffold is caught with no
  // operator configuration at all -- the common case this fix exists for.
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

  // GitHub #89: this query emits one 40-character SHA per commit across every ref
  // (`git log --all --reverse --pretty=format:%H`), and execSync's ~1MB default maxBuffer
  // overflows around 24,000-25,000 commits -- measured directly on ziglang/zig's
  // 36,058-commit history, which produced ~1.48MB of output and threw ENOBUFS. Asserting the
  // option execSync itself was actually called with, not just the returned value, since a
  // buffer overflow depends on the exec call's own options, not on anything observable from
  // the return value alone.
  test('raises the forward-walk git log query\'s maxBuffer above execSync\'s ~1MB default (GitHub #89)', () => {
    const ROOT = 'a'.repeat(40);
    execSync.mockImplementation(command => {
      if (typeof command === 'string' && command.includes('--name-only')) return 'LICENSE';
      if (typeof command === 'string' && command.includes('--reverse') && command.includes('%H')) return '';
      throw new Error(`unexpected command in this test: ${command}`);
    });

    findEffectiveRootSha(ROOT);

    const forwardWalkCall = execSync.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('--reverse') && call[0].includes('%H')
    );
    expect(forwardWalkCall[1].maxBuffer).toBeGreaterThan(1024 * 1024);
  });
});
