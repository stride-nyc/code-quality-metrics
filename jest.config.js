/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['local-code-metrics.js'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 90
    }
  }
};
