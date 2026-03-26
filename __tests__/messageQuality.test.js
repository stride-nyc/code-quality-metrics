'use strict';

const { scoreMessageQuality, CONFIG } = require('../local-code-metrics');

describe('scoreMessageQuality', () => {
  it('returns false for empty string', () => {
    expect(scoreMessageQuality('')).toBe(false);
  });

  it('returns true for conventional commit prefix', () => {
    expect(scoreMessageQuality('feat: add login')).toBe(true);
    expect(scoreMessageQuality('fix: resolve null pointer')).toBe(true);
    expect(scoreMessageQuality('refactor(auth): extract token validation')).toBe(true);
  });

  it('returns true for long specific message without conventional prefix', () => {
    const long = 'update the payment processing pipeline to handle declined cards gracefully';
    expect(long.split(/\s+/).length).toBeGreaterThanOrEqual(CONFIG.MESSAGE_QUALITY_MIN_WORDS);
    expect(scoreMessageQuality(long)).toBe(true);
  });

  it('returns false for short vague message without conventional prefix', () => {
    expect(scoreMessageQuality('fix issue')).toBe(false);
    expect(scoreMessageQuality('wip')).toBe(false);
    expect(scoreMessageQuality('update stuff')).toBe(false);
  });

  it('returns true for conventional prefix regardless of word count', () => {
    expect(scoreMessageQuality('chore: x')).toBe(true);
  });

  it('is case-insensitive for conventional prefix', () => {
    expect(scoreMessageQuality('FEAT: add thing')).toBe(true);
    expect(scoreMessageQuality('Fix: resolve bug')).toBe(true);
  });
});
