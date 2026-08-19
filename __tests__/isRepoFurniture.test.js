'use strict';

const { isRepoFurniture } = require('../lib/metrics');

// code-quality-metrics-fex3, GitHub #71: a named, explicit list of repo-furniture filenames
// -- not a tuned age or commit-count number -- so a root commit that touches only these is
// structurally a scaffold. Uses default CONFIG throughout; does not mutate
// CONFIG.ANALYSIS_IGNORE_PATTERNS or any other setting.
describe('isRepoFurniture', () => {
  // --- degenerate case: a real source file is never furniture ---
  test('returns false for a plain production source file', () => {
    expect(isRepoFurniture('src/app.js')).toBe(false);
  });

  test('matches LICENSE with no extension', () => {
    expect(isRepoFurniture('LICENSE')).toBe(true);
  });

  test('matches LICENSE with an extension', () => {
    expect(isRepoFurniture('LICENSE.md')).toBe(true);
  });

  test('matches the British spelling LICENCE', () => {
    expect(isRepoFurniture('LICENCE')).toBe(true);
  });

  test('matches COPYING', () => {
    expect(isRepoFurniture('COPYING')).toBe(true);
  });

  test('matches README with an extension', () => {
    expect(isRepoFurniture('README.md')).toBe(true);
  });

  test('matches bare README', () => {
    expect(isRepoFurniture('README')).toBe(true);
  });

  test('matches .gitignore', () => {
    expect(isRepoFurniture('.gitignore')).toBe(true);
  });

  test('matches .gitattributes', () => {
    expect(isRepoFurniture('.gitattributes')).toBe(true);
  });

  test('matches CODE_OF_CONDUCT.md', () => {
    expect(isRepoFurniture('CODE_OF_CONDUCT.md')).toBe(true);
  });

  test('matches CONTRIBUTING.md', () => {
    expect(isRepoFurniture('CONTRIBUTING.md')).toBe(true);
  });

  test('matches SECURITY.md', () => {
    expect(isRepoFurniture('SECURITY.md')).toBe(true);
  });

  test('matches CHANGELOG.md', () => {
    expect(isRepoFurniture('CHANGELOG.md')).toBe(true);
  });

  test('matches any file under a repo-root .github/ directory', () => {
    expect(isRepoFurniture('.github/workflows/ci.yml')).toBe(true);
  });

  // [guard] proves a nested copy is still matched: git show emits repo-relative paths with
  // no leading slash, so a bare ^ anchor alone would miss a monorepo package's own README.
  test('matches a nested README (monorepo package)', () => {
    expect(isRepoFurniture('packages/api/README.md')).toBe(true);
  });

  // [guard] proves the false-direction branch actually runs against a name that merely
  // contains a furniture word as a substring, not as the whole filename.
  test('does not match a source file that merely contains "readme" as a substring', () => {
    expect(isRepoFurniture('src/readme-parser.js')).toBe(false);
  });
});
