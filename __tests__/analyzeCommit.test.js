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

/**
 * Answers analyzeCommit's parent-count check (`git show --no-patch --format=%P`) with a
 * single parent -- i.e. "not a merge" -- out of band, so tests written before that check
 * existed don't need their own positional value for it. `numstatValue` answers every other
 * call (the actual `git show --numstat` query under test).
 */
function mockNumstat(numstatValue) {
  execSync.mockImplementation(command => {
    if (typeof command === 'string' && command.includes('%P')) {
      return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    }
    return numstatValue;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('analyzeCommit', () => {
  // --- degenerate / zero case ---
  test('returns null when git show returns empty string', () => {
    mockNumstat('');
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH)).toBeNull();
  });

  // --- exception cases ---
  test('returns null when execSync throws', () => {
    execSync.mockImplementation(() => { throw new Error('not a git repo'); });
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH)).toBeNull();
  });

  test('skips a two-parent merge commit entirely, returning null', () => {
    // git show --numstat diffs a merge against its first parent, so a conflict-free
    // two-parent merge (GitHub's "Merge pull request" button) reproduces one of its
    // children's diffs exactly. If that diff were parsed here, the same change would
    // be counted twice. The parent-count check must reject it before any numstat
    // line is parsed, so the mocked numstat below (a plausible, non-merge-looking
    // diff) must never surface in the result.
    execSync.mockImplementation(command => {
      if (typeof command === 'string' && command.includes('%P')) {
        return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      }
      return numstatLine(10, 2, 'src/app.js');
    });
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH)).toBeNull();
  });

  test('counts binary files (additions and deletions are "-") without adding to line totals', () => {
    mockNumstat('-\t-\timage.png\n');
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result).not.toBeNull();
    expect(result.binary_files).toBe(1);
    expect(result.total_additions).toBe(0);
    expect(result.total_deletions).toBe(0);
  });

  // --- happy path ---
  test('correctly classifies test vs production files', () => {
    mockNumstat([
      numstatLine(10, 2, 'src/app.js'),
      numstatLine(5, 1, 'src/app.test.js')
    ].join('\n'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.prod_files_count).toBe(1);
    expect(result.test_files_count).toBe(1);
    expect(result.test_prod_cochange_commit).toBe(true);
    expect(result.test_first_indicator).toBeUndefined();
  });

  test('sets test_prod_cochange_commit false when only production files changed', () => {
    mockNumstat(numstatLine(20, 5, 'src/app.js'));
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result.test_prod_cochange_commit).toBe(false);
    expect(result.test_first_indicator).toBeUndefined();
  });

  test('marks large_commit true when total lines exceed threshold', () => {
    const lines = CONFIG.LARGE_COMMIT_THRESHOLD + 1;
    mockNumstat(numstatLine(lines, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).large_commit).toBe(true);
  });

  test('marks large_commit false when total lines are at threshold', () => {
    mockNumstat(numstatLine(CONFIG.LARGE_COMMIT_THRESHOLD, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).large_commit).toBe(false);
  });

  test('does not flag a commit as large when its production lines are under the threshold', () => {
    // Tests accompanying a change must not be what pushes it over. Counting them made
    // the metric penalise the practice this toolkit identifies as protective, and
    // uncovered_prod_rate already covers the untested case separately.
    const prod = CONFIG.LARGE_COMMIT_THRESHOLD - 10;
    mockNumstat(
      numstatLine(prod, 0, 'src/app.js') + '\n' + numstatLine(30, 0, 'src/app.test.js')
    );
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.large_commit).toBe(false);
    expect(result.total_additions).toBe(prod + 30);
  });

  test('still flags a commit as large on production lines alone', () => {
    mockNumstat(numstatLine(CONFIG.LARGE_COMMIT_THRESHOLD + 1, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).large_commit).toBe(true);
  });

  test('marks sprawling_commit true when files changed exceed threshold', () => {
    const manyFiles = Array.from({ length: CONFIG.SPRAWLING_COMMIT_THRESHOLD + 1 }, (_, i) =>
      numstatLine(1, 0, `src/file${i}.js`)
    ).join('\n');
    mockNumstat(manyFiles);
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).sprawling_commit).toBe(true);
  });

  test('marks sprawling_commit false when files changed are at threshold', () => {
    const atThreshold = Array.from({ length: CONFIG.SPRAWLING_COMMIT_THRESHOLD }, (_, i) =>
      numstatLine(1, 0, `src/file${i}.js`)
    ).join('\n');
    mockNumstat(atThreshold);
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).sprawling_commit).toBe(false);
  });

  test('sets change_ratio to "inf" when there are no deletions', () => {
    mockNumstat(numstatLine(10, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).change_ratio).toBe('inf');
  });

  test('calculates change_ratio when deletions exist', () => {
    mockNumstat(numstatLine(10, 5, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).change_ratio).toBe('2.00');
  });

  test('attaches source_branch to result', () => {
    mockNumstat(numstatLine(5, 2, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).source_branch).toBe(MOCK_BRANCH);
  });

  // --- test_only_commit ---
  test('sets test_only_commit true when only test files changed', () => {
    mockNumstat(numstatLine(10, 2, 'src/app.test.js'));
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result.test_only_commit).toBe(true);
  });

  test('sets test_only_commit false when both test and prod files changed', () => {
    mockNumstat([
      numstatLine(10, 2, 'src/app.js'),
      numstatLine(5, 1, 'src/app.test.js')
    ].join('\n'));
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result.test_only_commit).toBe(false);
  });

  test('sets test_only_commit false when only prod files changed', () => {
    mockNumstat(numstatLine(20, 5, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).test_only_commit).toBe(false);
  });

  // --- uncovered_prod_commit ---
  test('sets uncovered_prod_commit true when only large prod commit with no tests', () => {
    const lines = CONFIG.LARGE_COMMIT_THRESHOLD + 1;
    mockNumstat(numstatLine(lines, 0, 'src/app.js'));
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result.uncovered_prod_commit).toBe(true);
  });

  test('sets uncovered_prod_commit false when prod-only commit is not large', () => {
    mockNumstat(numstatLine(10, 0, 'src/app.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).uncovered_prod_commit).toBe(false);
  });

  test('sets uncovered_prod_commit false when large commit includes test files', () => {
    const lines = CONFIG.LARGE_COMMIT_THRESHOLD + 1;
    mockNumstat([
      numstatLine(lines, 0, 'src/app.js'),
      numstatLine(5, 0, 'src/app.test.js')
    ].join('\n'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).uncovered_prod_commit).toBe(false);
  });

  test('sets uncovered_prod_commit false when large commit is test-only', () => {
    const lines = CONFIG.LARGE_COMMIT_THRESHOLD + 1;
    mockNumstat(numstatLine(lines, 0, 'src/app.test.js'));
    expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).uncovered_prod_commit).toBe(false);
  });

  // --- prod_file_paths (duplicate-detection input) ---
  test('includes the list of production file paths touched, excluding test files', () => {
    mockNumstat([
      numstatLine(10, 2, 'src/app.js'),
      numstatLine(5, 1, 'src/app.test.js'),
      numstatLine(3, 0, 'src/util.js')
    ].join('\n'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.prod_file_paths).toEqual(['src/app.js', 'src/util.js']);
  });

  test('excludes binary files from prod_file_paths', () => {
    mockNumstat([
      numstatLine(10, 2, 'src/app.js'),
      '-\t-\timage.png'
    ].join('\n'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.prod_file_paths).toEqual(['src/app.js']);
  });

  // --- outlier (withdrawn, code-quality-metrics-496) ---
  test('does not include an outlier field in its result', () => {
    // The per-commit outlier flag used mean + 2*stddev on a distribution with no finite
    // mean and was non-monotonic (a sweep of six candidate rules over 3000 randomised
    // heavy-tailed windows found every window-relative rule violates monotonicity 45-70%
    // of the time). It was withdrawn entirely; analyzeCommit must not resurrect a
    // hardcoded placeholder for it.
    mockNumstat(numstatLine(5, 2, 'src/app.js'));
    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);
    expect(result).not.toHaveProperty('outlier');
  });
});
