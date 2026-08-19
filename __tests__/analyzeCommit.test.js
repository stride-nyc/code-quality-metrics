'use strict';

jest.mock('child_process');

const { execSync } = require('child_process');
const { analyzeCommit, CONFIG } = require('../local-code-metrics');

/**
 * Run fn with CONFIG.ANALYSIS_IGNORE_PATTERNS temporarily set to patterns, restoring the
 * original value afterward regardless of outcome. Mirrors __tests__/duplicate.test.js's own
 * save/set/restore pattern for CONFIG.DUPLICATE_IGNORE_PATTERNS.
 */
function withAnalysisIgnorePatterns(patterns, fn) {
  const original = CONFIG.ANALYSIS_IGNORE_PATTERNS;
  CONFIG.ANALYSIS_IGNORE_PATTERNS = patterns;
  try {
    return fn();
  } finally {
    CONFIG.ANALYSIS_IGNORE_PATTERNS = original;
  }
}

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

  // --- ANALYSIS_IGNORE_PATTERNS exclusion (code-quality-metrics-1tp) ---
  // isTestFile can only sort a file into test or production; it cannot say "neither",
  // which is the whole defect in code-quality-metrics-y8j. Every exclusion test here
  // configures a real pattern and asserts a matching file was excluded, then that an
  // unmatched sibling was not, so an empty-pattern-list state can never make this pass.
  test('excludes a matched file from prod/test classification while raw totals stay honest', () => {
    withAnalysisIgnorePatterns(['**/bin/**'], () => {
      mockNumstat([
        numstatLine(500, 0, 'bin/Debug/App.dll'),
        numstatLine(10, 2, 'src/app.js')
      ].join('\n'));

      const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

      // Classification counts only the non-excluded file.
      expect(result.prod_files_count).toBe(1);
      expect(result.test_files_count).toBe(0);
      expect(result.prod_file_paths).toEqual(['src/app.js']);
      expect(result.prod_additions).toBe(10);
      expect(result.prod_deletions).toBe(2);

      // Raw totals stay honest: the excluded file's lines and file count are still there,
      // so a reader comparing this report to `git log` sees the real commit, not a
      // silently shrunk one (the design decision code-quality-metrics-1tp calls for).
      expect(result.files_changed).toBe(2);
      expect(result.total_additions).toBe(510);
      expect(result.total_deletions).toBe(2);
    });
  });

  test('does not count an excluded file toward sprawling_commit’s file-count threshold', () => {
    withAnalysisIgnorePatterns(['**/bin/**'], () => {
      // SPRAWLING_COMMIT_THRESHOLD (5) ordinary files, plus 196 excluded bin/ files: without
      // the fix this reads as 201 files touched and trips sprawling_commit on build output
      // alone, exactly the measured dotnetdependencytracer case in code-quality-metrics-y8j.
      const ordinaryFiles = Array.from({ length: CONFIG.SPRAWLING_COMMIT_THRESHOLD }, (_, i) =>
        numstatLine(1, 0, `src/file${i}.js`)
      );
      const excludedFiles = Array.from({ length: 196 }, (_, i) =>
        numstatLine(1000, 1000, `bin/Debug/file${i}.dll`)
      );
      mockNumstat([...ordinaryFiles, ...excludedFiles].join('\n'));

      const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

      expect(result.sprawling_commit).toBe(false);
      expect(result.files_changed).toBe(CONFIG.SPRAWLING_COMMIT_THRESHOLD + 196);
      expect(result.excluded_files_count).toBe(196);
    });
  });

  test('still flags sprawling_commit true once the non-excluded file count alone exceeds the threshold', () => {
    withAnalysisIgnorePatterns(['**/bin/**'], () => {
      const ordinaryFiles = Array.from({ length: CONFIG.SPRAWLING_COMMIT_THRESHOLD + 1 }, (_, i) =>
        numstatLine(1, 0, `src/file${i}.js`)
      );
      mockNumstat([...ordinaryFiles, numstatLine(1, 0, 'bin/Debug/x.dll')].join('\n'));

      expect(analyzeCommit(MOCK_SHA, MOCK_BRANCH).sprawling_commit).toBe(true);
    });
  });

  test('reports excluded_additions and excluded_deletions summed across matched files', () => {
    withAnalysisIgnorePatterns(['**/bin/**'], () => {
      mockNumstat([
        numstatLine(500, 100, 'bin/Debug/App.dll'),
        numstatLine(20, 5, 'bin/Debug/Other.dll'),
        numstatLine(10, 2, 'src/app.js')
      ].join('\n'));

      const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

      expect(result.excluded_files_count).toBe(2);
      expect(result.excluded_additions).toBe(520);
      expect(result.excluded_deletions).toBe(105);
    });
  });

  test('an excluded file with no other production files leaves large_commit, uncovered_prod_commit, and test_prod_cochange_commit all false', () => {
    withAnalysisIgnorePatterns(['**/bin/**'], () => {
      const lines = CONFIG.LARGE_COMMIT_THRESHOLD + 1;
      mockNumstat(numstatLine(lines, 0, 'bin/Debug/App.dll'));

      const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

      expect(result.large_commit).toBe(false);
      expect(result.uncovered_prod_commit).toBe(false);
      expect(result.test_prod_cochange_commit).toBe(false);
      expect(result.prod_files_count).toBe(0);
    });
  });

  test('does not exclude any file when ANALYSIS_IGNORE_PATTERNS is empty (default)', () => {
    mockNumstat([
      numstatLine(500, 0, 'bin/Debug/App.dll'),
      numstatLine(10, 2, 'src/app.js')
    ].join('\n'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.prod_files_count).toBe(2);
    expect(result.prod_file_paths).toEqual(['bin/Debug/App.dll', 'src/app.js']);
  });

  // --- vendored/generated default share (code-quality-metrics-3b6), always-on ---
  // This is the higher-value half of step 3: it must be visible on a repo that has
  // configured nothing, using CONFIG.DUPLICATE_IGNORE_PATTERNS's existing non-empty
  // defaults (deps/, vendor/, third_party/, ...), independent of ANALYSIS_IGNORE_PATTERNS.
  test('reports vendored_default_files_count and line counts for paths matching the existing vendored/generated defaults, even when ANALYSIS_IGNORE_PATTERNS is not configured', () => {
    expect(CONFIG.ANALYSIS_IGNORE_PATTERNS).toEqual([]);
    mockNumstat([
      numstatLine(300, 50, 'vendor/lib.js'),
      numstatLine(10, 2, 'src/app.js')
    ].join('\n'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.vendored_default_files_count).toBe(1);
    expect(result.vendored_default_additions).toBe(300);
    expect(result.vendored_default_deletions).toBe(50);
    // Observational only: nothing is excluded from classification unless
    // ANALYSIS_IGNORE_PATTERNS says so, so the vendored file is still counted as production.
    expect(result.prod_files_count).toBe(2);
  });

  test('does not count an ordinary file toward vendored_default_files_count', () => {
    mockNumstat(numstatLine(10, 2, 'src/app.js'));

    const result = analyzeCommit(MOCK_SHA, MOCK_BRANCH);

    expect(result.vendored_default_files_count).toBe(0);
    expect(result.vendored_default_additions).toBe(0);
    expect(result.vendored_default_deletions).toBe(0);
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
