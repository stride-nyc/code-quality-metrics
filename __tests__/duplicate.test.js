'use strict';

jest.mock('child_process');
jest.mock('fs');

const { execSync } = require('child_process');
const fs = require('fs');
const { runDuplicateCheck, resolveModuleNeighbors } = require('../lib/duplicate');

const FIXTURE_DUPLICATE = {
  firstFile:  { name: 'src/lib/git.js',     start: 10, end: 25 },
  secondFile: { name: 'src/lib/metrics.js', start: 5,  end: 20 },
  lines:  15,
  tokens: 120
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
});
