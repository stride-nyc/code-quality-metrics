'use strict';

jest.mock('child_process');
jest.mock('fs');

const { execSync } = require('child_process');
const fs = require('fs');
const { runDuplicateCheck } = require('../lib/duplicate');

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
