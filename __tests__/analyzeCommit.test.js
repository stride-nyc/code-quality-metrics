'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { analyzeCommit, CONFIG } = require('../local-code-metrics');

const MOCK_SHA = 'abc12345';
const MOCK_BRANCH = 'feature/test';

/** Build a git numstat line: additions\tdeletions\tfilename */
function numstatLine(additions, deletions, filename) {
  return `${additions}\t${deletions}\t${filename}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('analyzeCommit', () => {
  // --- degenerate / zero case ---
  test('returns null when git show returns empty string', () => {
    execSync.mockReturnValue('');
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH)).toBeNull();
  });

  // --- exception cases ---
  test('returns null when execSync throws', () => {
    execSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH)).toBeNull();
  });

  test('counts binary files (additions and deletions are "-") without adding to line totals', () => {
    execSync.mockReturnValue('-\t-\timage.png\n');
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result).not.toBeNull();
    expect(result.binary_files).toBe(1);
    expect(result.total_additions).toBe(0);
    expect(result.total_deletions).toBe(0);
  });

  // --- happy path ---
  test('correctly classifies test vs production files', () => {
    execSync.mockReturnValue([
      numstatLine(10, 2, 'src/app.js'),
      numstatLine(5, 1, 'src/app.test.js')
    ].join('\n'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.prod_files_count).toBe(1);
    expect(result.test_files_count).toBe(1);
    expect(result.test_first_indicator).toBe(true);
  });

  test('sets test_first_indicator false when only production files changed', () => {
    execSync.mockReturnValue(numstatLine(20, 5, 'src/app.js'));
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result.test_first_indicator).toBe(false);
  });

  test('marks large_commit true when total lines exceed threshold', () => {
    const lines = CONFIG.LARGE_COMMIT_THRESHOLD + 1;
    execSync.mockReturnValue(numstatLine(lines, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).large_commit).toBe(true);
  });

  test('marks large_commit false when total lines are at threshold', () => {
    execSync.mockReturnValue(numstatLine(CONFIG.LARGE_COMMIT_THRESHOLD, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).large_commit).toBe(false);
  });

  test('marks sprawling_commit true when files changed exceed threshold', () => {
    const manyFiles = Array.from({ length: CONFIG.SPRAWLING_COMMIT_THRESHOLD + 1 }, (_, i) =>
      numstatLine(1, 0, `src/file${i}.js`)
    ).join('\n');
    execSync.mockReturnValue(manyFiles);
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).sprawling_commit).toBe(true);
  });

  test('marks sprawling_commit false when files changed are at threshold', () => {
    const atThreshold = Array.from({ length: CONFIG.SPRAWLING_COMMIT_THRESHOLD }, (_, i) =>
      numstatLine(1, 0, `src/file${i}.js`)
    ).join('\n');
    execSync.mockReturnValue(atThreshold);
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).sprawling_commit).toBe(false);
  });

  test('sets change_ratio to "inf" when there are no deletions', () => {
    execSync.mockReturnValue(numstatLine(10, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).change_ratio).toBe('inf');
  });

  test('calculates change_ratio when deletions exist', () => {
    execSync.mockReturnValue(numstatLine(10, 5, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).change_ratio).toBe('2.00');
  });

  test('attaches source_branch to result', () => {
    execSync.mockReturnValue(numstatLine(5, 2, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).source_branch).toBe(MOCK_BRANCH);
  });
});
