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

  test('CONFIG.DUPLICATE_SCAN_PATHS is an array', () => {
    expect(Array.isArray(CONFIG.DUPLICATE_SCAN_PATHS)).toBe(true);
  });

  test('CONFIG.AI_DUPLICATE_MAX_FILES defaults to 40', () => {
    expect(CONFIG.AI_DUPLICATE_MAX_FILES).toBe(40);
  });
});
