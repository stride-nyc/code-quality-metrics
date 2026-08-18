'use strict';

const { CONFIG } = require('../lib/config');

describe('CONFIG duplicate detection defaults', () => {
  // Raised from 5/50 to 10/100 (code-quality-metrics-k1g): matches SonarQube's default
  // gate minimum (100 tokens over 10 lines) instead of half of it in both dimensions.
  test('CONFIG.DUPLICATE_MIN_LINES defaults to 10', () => {
    expect(CONFIG.DUPLICATE_MIN_LINES).toBe(10);
  });

  test('CONFIG.DUPLICATE_MIN_TOKENS defaults to 100', () => {
    expect(CONFIG.DUPLICATE_MIN_TOKENS).toBe(100);
  });

  test('CONFIG.DUPLICATE_IGNORE_PATTERNS is an array', () => {
    expect(Array.isArray(CONFIG.DUPLICATE_IGNORE_PATTERNS)).toBe(true);
  });

  // DUPLICATE_SCAN_PATHS removed (code-quality-metrics-ksv): documented and shape-tested
  // but never read by lib/duplicate.js, local-code-metrics.js, or pr-metrics.yml. Both
  // callers already pass an explicit changed-file list to jscpd rather than asking it to
  // scan a tree, so there was no real semantics for it to implement without inventing an
  // unrequested feature; removed rather than wired up to something no caller needed.

  test('CONFIG.AI_DUPLICATE_MAX_FILES defaults to 40', () => {
    expect(CONFIG.AI_DUPLICATE_MAX_FILES).toBe(40);
  });

  // code-quality-metrics-wcj: '**/designs/**' was a fact about one target repo
  // (stride-nyc/flight-info-spike) sitting in defaults shared by every consumer.
  // It moves to that repo's own .codemetrics.json (see lib/repoConfig.js and
  // AGENTS.md's "Per-Repo Configuration Overrides" section for the mechanism),
  // not into this shared file.
  test('CONFIG.DUPLICATE_IGNORE_PATTERNS no longer carries the flight-info-spike-specific **/designs/** pattern', () => {
    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).not.toContain('**/designs/**');
  });
});

// code-quality-metrics-3yd: the direct fix for code-quality-metrics-y8j. Nothing today lets a
// path count as neither test nor production; ANALYSIS_IGNORE_PATTERNS is the mechanism.
// DEFAULT MUST BE EMPTY: seeding it with the vendored/generated patterns already in
// DUPLICATE_IGNORE_PATTERNS would change every existing measurement, including the 34
// calibration observations __tests__/thresholdProvenance.test.js gates against CONFIG. An
// empty default keeps every current number identical -- this test is what makes that
// provable rather than assumed.
describe('CONFIG analysis-exclusion defaults', () => {
  test('CONFIG.ANALYSIS_IGNORE_PATTERNS defaults to an empty array', () => {
    expect(Array.isArray(CONFIG.ANALYSIS_IGNORE_PATTERNS)).toBe(true);
    expect(CONFIG.ANALYSIS_IGNORE_PATTERNS).toHaveLength(0);
  });
});
