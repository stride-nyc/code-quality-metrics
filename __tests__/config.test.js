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

  test('CONFIG.AI_DUPLICATE_MAX_FILES defaults to 40', () => {
    expect(CONFIG.AI_DUPLICATE_MAX_FILES).toBe(40);
  });
});
