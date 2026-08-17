/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Agent worktrees are checkouts of this same repo nested under .claude/. Without
  // this, jest discovers their __tests__/ too and runs every suite twice, against a
  // different branch at a different commit. The practical failure is that an agent
  // mid-TDD holds a deliberately failing test, which would block unrelated commits
  // in the main checkout. The hook still runs the full real suite.
  testPathIgnorePatterns: ['/node_modules/', '/\\.claude/worktrees/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['local-code-metrics.js'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 90
    }
  }
};
