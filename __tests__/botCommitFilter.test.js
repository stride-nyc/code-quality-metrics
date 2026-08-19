'use strict';

const { CONFIG } = require('../lib/config');

describe('CONFIG bot/AI-agent classification defaults', () => {
  test('CONFIG.BOT_ACCOUNT_PATTERNS is an array', () => {
    expect(Array.isArray(CONFIG.BOT_ACCOUNT_PATTERNS)).toBe(true);
  });
});

// THE POINT OF THIS CHANGE (issue #62): an AI coding agent's commit must survive the bot
// filter no matter which of the three attribution channels carries the signal. Filtering
// these out would remove the exact signal this toolkit exists to detect.
describe('isBotCommit: AI coding agents are never classified as bots', () => {
  test('a commit authored by Claude is not a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'Claude', committer: 'Jane Dev', message: 'feat: add widget' })).toBe(false);
  });

  test('a commit committed by an AI agent account is not a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'Jane Dev', committer: 'Copilot', message: 'feat: add widget' })).toBe(false);
  });

  test('a commit with a Co-Authored-By trailer naming an AI agent is not a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    const full_message = 'feat: add widget\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
    expect(isBotCommit({ author: 'Jane Dev', committer: 'Jane Dev', full_message })).toBe(false);
  });

  // THE TRAP (issue #62): a bare /\[bot\]$/ pattern -- the naive implementation -- would also
  // match a hypothetical AI-agent bot account. The AI-agent exemption must win regardless of
  // how bot-flavored the account name looks.
  test('an AI-agent bot-flavored account name ("claude[bot]") is not a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'claude[bot]', committer: 'claude[bot]', message: 'chore: automated commit' })).toBe(false);
  });
});

describe('isBotCommit: dependency and CI bots are filtered', () => {
  test('a dependabot[bot]-authored commit is a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'dependabot[bot]', committer: 'dependabot[bot]', message: 'chore(deps): bump lodash from 4.17.20 to 4.17.21' })).toBe(true);
  });

  test('a renovate[bot]-authored commit is a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'renovate[bot]', committer: 'renovate[bot]', message: 'chore(deps): update dependency foo to v2' })).toBe(true);
  });

  test('a github-actions[bot]-authored commit is a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'github-actions[bot]', committer: 'github-actions[bot]', message: 'chore: release v1.2.3' })).toBe(true);
  });

  test('a generic [bot] account not matching any AI-agent pattern is a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'some-ci-tool[bot]', committer: 'some-ci-tool[bot]', message: 'chore: automated commit' })).toBe(true);
  });

  test('a human-authored commit with no bot signal is not a bot commit', () => {
    const { isBotCommit } = require('../lib/metrics');
    expect(isBotCommit({ author: 'Jane Dev', committer: 'Jane Dev', message: 'fix: correct off-by-one error' })).toBe(false);
  });
});
