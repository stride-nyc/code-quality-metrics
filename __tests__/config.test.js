'use strict';

const { CONFIG } = require('../lib/config');

describe('CONFIG duplicate detection defaults', () => {
  test('CONFIG.DUPLICATE_MIN_LINES defaults to 5', () => {
    expect(CONFIG.DUPLICATE_MIN_LINES).toBe(5);
  });

  test('CONFIG.DUPLICATE_MIN_TOKENS defaults to 50', () => {
    expect(CONFIG.DUPLICATE_MIN_TOKENS).toBe(50);
  });

  test('CONFIG.DUPLICATE_IGNORE_PATTERNS is an array', () => {
    expect(Array.isArray(CONFIG.DUPLICATE_IGNORE_PATTERNS)).toBe(true);
  });

  test('CONFIG.DUPLICATE_SCAN_PATHS is an array', () => {
    expect(Array.isArray(CONFIG.DUPLICATE_SCAN_PATHS)).toBe(true);
  });
});
