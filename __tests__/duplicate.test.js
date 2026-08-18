'use strict';

jest.mock('child_process');
jest.mock('fs');

const { execSync } = require('child_process');
const fs = require('fs');
const { runDuplicateCheck, runDuplicateAnalysis, resolveModuleNeighbors } = require('../lib/duplicate');
const { CONFIG } = require('../lib/config');

const FIXTURE_DUPLICATE = {
  firstFile:  { name: 'src/lib/git.js',     start: 10, end: 25 },
  secondFile: { name: 'src/lib/metrics.js', start: 5,  end: 20 },
  lines:  15,
  tokens: 120
};

// Shape validated live against this repo's own lib/ (see beads issue
// code-quality-metrics-549): jscpd's report.statistics.total.
const FIXTURE_STATISTICS_TOTAL = {
  clones: 2,
  duplicatedLines: 12,
  duplicatedTokens: 90,
  lines: 1595,
  tokens: 6196,
  sources: 11,
  percentage: 0.75,
  percentageTokens: 2.07,
  newClones: 0,
  newDuplicatedLines: 0
};

beforeEach(() => {
  jest.clearAllMocks();
  execSync.mockReturnValue('');
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue(JSON.stringify({ duplicates: [FIXTURE_DUPLICATE] }));
});

describe('runDuplicateCheck', () => {
  test('returns empty array when filePaths is empty without calling jscpd', () => {
    const result = runDuplicateCheck([]);
    expect(result).toEqual([]);
    expect(execSync).not.toHaveBeenCalled();
  });

  test('returns empty array when jscpd output file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const result = runDuplicateCheck(['src/lib/git.js']);
    expect(result).toEqual([]);
  });

  test('parses jscpd JSON and returns firstFile/secondFile/lines/tokens for each duplicate', () => {
    const result = runDuplicateCheck(['src/lib/git.js', 'src/lib/metrics.js']);
    expect(result).toHaveLength(1);
    expect(result[0].firstFile).toEqual(FIXTURE_DUPLICATE.firstFile);
    expect(result[0].secondFile).toEqual(FIXTURE_DUPLICATE.secondFile);
    expect(result[0].lines).toBe(15);
    expect(result[0].tokens).toBe(120);
  });

  test('returns empty array when jscpd exits non-zero', () => {
    execSync.mockImplementation(() => { throw new Error('exit code 1'); });
    const result = runDuplicateCheck(['src/lib/git.js']);
    expect(result).toEqual([]);
  });

  test('excludes vendored dependency trees by default', () => {
    // No CONFIG override here: this exercises the actual shipped default, the
    // same one pr-metrics.yml relies on. nodejs/node vendors npm in-tree under
    // deps/, which had no matching ignore pattern and inflated duplication
    // from 5.12 percent to 15.09 percent on a pure vendored dependency sync.
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('**/deps/**');
    expect(command).toContain('**/vendor/**');
    expect(command).toContain('**/third_party/**');
    expect(command).toContain('**/node_modules/**');
  });

  test('excludes generated-code trees by default', () => {
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('**/generated/**');
  });

  test('excludes lock files by default', () => {
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('**/package-lock.json');
    expect(command).toContain('**/yarn.lock');
    expect(command).toContain('**/pnpm-lock.yaml');
    expect(command).toContain('**/*.lock');
  });
});

describe('runDuplicateAnalysis', () => {
  test('returns empty findings and null statistics without calling jscpd when filePaths is empty', () => {
    const result = runDuplicateAnalysis([]);
    expect(result).toEqual({ findings: [], statistics: null });
    expect(execSync).not.toHaveBeenCalled();
  });

  test('returns findings and the full statistics.total object from a real jscpd report', () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({
      duplicates: [FIXTURE_DUPLICATE],
      statistics: { total: FIXTURE_STATISTICS_TOTAL }
    }));

    const result = runDuplicateAnalysis(['src/lib/git.js', 'src/lib/metrics.js']);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].firstFile).toEqual(FIXTURE_DUPLICATE.firstFile);
    expect(result.findings[0].secondFile).toEqual(FIXTURE_DUPLICATE.secondFile);
    expect(result.findings[0].lines).toBe(15);
    expect(result.findings[0].tokens).toBe(120);
    expect(result.statistics).toEqual(FIXTURE_STATISTICS_TOTAL);
  });

  // GUARDs: these degenerate cases are already covered behaviorally by the
  // runDuplicateCheck tests above (same underlying execSync/fs code path,
  // extracted into runDuplicateAnalysis rather than rewritten), so they pass
  // against the current implementation without a fresh red. Recorded here to
  // pin the null-statistics contract on the new return shape specifically.
  test('GUARD: returns null statistics when jscpd exits non-zero', () => {
    execSync.mockImplementation(() => { throw new Error('exit code 1'); });
    const result = runDuplicateAnalysis(['src/lib/git.js']);
    expect(result).toEqual({ findings: [], statistics: null });
  });

  test('GUARD: returns null statistics when the jscpd report file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const result = runDuplicateAnalysis(['src/lib/git.js']);
    expect(result).toEqual({ findings: [], statistics: null });
  });
});

describe('resolveModuleNeighbors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
  });

  test('returns only the input files when they have no local imports', () => {
    fs.readFileSync.mockReturnValue('const x = 1;');
    const input = ['/project/src/lib/git.js'];
    const result = resolveModuleNeighbors(input);
    expect(result).toContain('/project/src/lib/git.js');
    expect(result).toHaveLength(1);
  });

  test('returns changed files plus resolved local imports', () => {
    fs.readFileSync.mockReturnValue("const { CONFIG } = require('./config');");
    const input = ['/project/src/lib/git.js'];
    const result = resolveModuleNeighbors(input);
    expect(result).toContain('/project/src/lib/git.js');
    expect(result).toContain('/project/src/lib/config.js');
    expect(result).toHaveLength(2);
  });

  test('skips import resolution for non-JS files and includes them as-is', () => {
    const input = ['/project/.github/workflows/pr-metrics.yml'];
    const result = resolveModuleNeighbors(input);
    expect(result).toContain('/project/.github/workflows/pr-metrics.yml');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  test('skips files that do not exist on disk', () => {
    fs.existsSync.mockReturnValue(false);
    const input = ['/project/src/deleted.js'];
    const result = resolveModuleNeighbors(input);
    expect(result).toEqual([]);
  });

  test('ignores external and node_modules imports', () => {
    fs.readFileSync.mockReturnValue(
      "const fs = require('fs');\nconst x = require('lodash');\nconst y = require('./local');"
    );
    const input = ['/project/src/lib/git.js'];
    const result = resolveModuleNeighbors(input);
    expect(result).toContain('/project/src/lib/local.js');
    expect(result.some(p => p.includes('lodash'))).toBe(false);
    expect(result.some(p => p.includes('node_modules'))).toBe(false);
  });

  test('passes ignore patterns as file globs, not code-level regexes', () => {
    // jscpd's -i/--ignore takes file globs; --ignore-pattern takes code-level regexes
    // for skipping tokens. Asserting the command because the shell invocation is the
    // contract with jscpd, and there is no local observable for "the right files were
    // excluded". Verified live: on flight-info-spike, --ignore-pattern left duplication
    // at 16.50 percent, identical to passing nothing, while --ignore gave 1.23 percent.
    const original = CONFIG.DUPLICATE_IGNORE_PATTERNS;
    CONFIG.DUPLICATE_IGNORE_PATTERNS = ['**/designs/**'];
    try {
      fs.existsSync.mockReturnValue(false);
      runDuplicateCheck(['src/app.js']);
      const command = execSync.mock.calls[0][0];
      expect(command).toMatch(/--ignore\s+"/);
      expect(command).toContain('**/designs/**');
    } finally {
      CONFIG.DUPLICATE_IGNORE_PATTERNS = original;
    }
  });

});
