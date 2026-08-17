/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Agent worktrees are checkouts of this same repo nested under .claude/. Without
  // this, jest discovers their __tests__/ too and runs every suite twice, against a
  // different branch at a different commit. The practical failure is that an agent
  // mid-TDD holds a deliberately failing test, which would block unrelated commits
  // in the main checkout. The hook still runs the full real suite.
  // Anchored to <rootDir> so this only excludes worktrees nested *inside* whichever
  // checkout is running jest, not the checkout's own path: an agent running this
  // config from inside its own worktree (whose absolute path itself contains
  // ".claude/worktrees/") must still discover its own __tests__/.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/\\.claude/worktrees/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['local-code-metrics.js'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 90
    }
  }
};
