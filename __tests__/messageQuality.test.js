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

  it('scores the full message body when provided, crediting a short subject with an explained body', () => {
    // postgres/curl/git convention: short subject, explanation in the body. The subject
    // alone is neither conventional nor 10+ words, but the body makes the intent clear.
    const subject = 'Fix data_checksum GUC show_hook';
    const body = `${subject}\n\nThe hook was returning the wrong value when checksums were disabled\nmid-session, which confused monitoring tools reading the setting.`;
    expect(scoreMessageQuality(subject)).toBe(false);
    expect(scoreMessageQuality(subject, body)).toBe(true);
  });

  it('falls back to the subject-only message when no full message is supplied', () => {
    // .github/workflows/pr-metrics.yml calls scoreMessageQuality with only the GitHub API
    // subject line; there is no fuller field to fall back from.
    expect(scoreMessageQuality('fix issue', undefined)).toBe(false);
    expect(scoreMessageQuality('feat: add login', undefined)).toBe(true);
  });

  it('falls back to the subject when the full message is an empty string', () => {
    expect(scoreMessageQuality('feat: add login', '')).toBe(true);
  });

  it('returns false for a body consisting only of trailers', () => {
    // nodejs/node a159b570: subject alone is 6 words with no conventional prefix
    // (false alone), but the body is padded to 30 words by PR-URL/Reviewed-By
    // trailers with no prose, which must not count toward the word-count check.
    const subject = 'lib: fix typo idenity => identity';
    const body = `${subject}\n\nPR-URL: https://github.com/nodejs/node/pull/12345\nReviewed-By: Foo Bar <foo@example.com>\nReviewed-By: Baz Qux <baz@example.com>\nReviewed-By: A B <a@example.com>\nReviewed-By: C D <c@example.com>\nReviewed-By: E F <e@example.com>`;
    expect(scoreMessageQuality(subject, body)).toBe(false);
  });
});
