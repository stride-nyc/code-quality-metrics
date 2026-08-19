'use strict';

const { CONFIG } = require('../lib/config');

describe('CONFIG bot/AI-agent classification defaults', () => {
  test('CONFIG.BOT_ACCOUNT_PATTERNS is an array', () => {
    expect(Array.isArray(CONFIG.BOT_ACCOUNT_PATTERNS)).toBe(true);
  });
});
