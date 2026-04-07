'use strict';

const { classifyDoraArchetype } = require('../local-code-metrics');

describe('classifyDoraArchetype', () => {
  it('returns "harmonious-high-achiever" for all-healthy metrics', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '10.00',
      sprawling_commits_pct: '5.00',
      test_coverage_rate: '70.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '80.00'
    })).toBe('harmonious-high-achiever');
  });

  it('returns "mixed-signals" (not harmonious) when uncovered_prod_rate is at or above 10', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '10.00',
      sprawling_commits_pct: '5.00',
      test_coverage_rate: '70.00',
      uncovered_prod_rate: '10.00',
      message_quality_pct: '80.00'
    })).not.toBe('harmonious-high-achiever');
  });

  it('returns "legacy-bottleneck" for high sprawl combined with high large commits', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '35.00',
      sprawling_commits_pct: '30.00',
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '50.00'
    })).toBe('legacy-bottleneck');
  });

  it('returns "foundational-challenges" when large commit rate exceeds 40%', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '45.00',
      sprawling_commits_pct: '8.00',
      test_coverage_rate: '55.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '65.00'
    })).toBe('foundational-challenges');
  });

  it('returns "foundational-challenges" when uncovered_prod_rate exceeds 20%', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '25.00',
      sprawling_commits_pct: '8.00',
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '25.00',
      message_quality_pct: '50.00'
    })).toBe('foundational-challenges');
  });

  it('returns "mixed-signals" when no archetype threshold is clearly breached', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '25.00',
      sprawling_commits_pct: '12.00',
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '55.00'
    })).toBe('mixed-signals');
  });
});
