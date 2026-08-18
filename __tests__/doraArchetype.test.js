'use strict';

const { classifyDoraArchetype } = require('../local-code-metrics');
const { THRESHOLDS } = require('../lib/thresholds');

describe('classifyDoraArchetype', () => {
  it('returns "harmonious-high-achiever" even when message quality is poor', () => {
    const { HARMONIOUS } = THRESHOLDS.DORA_ARCHETYPE;
    expect(classifyDoraArchetype({
      large_commits_pct: String(HARMONIOUS.large - 15),
      sprawling_commits_pct: String(HARMONIOUS.sprawling - 8),
      test_coverage_rate: String(HARMONIOUS.testCoverage + 40),
      uncovered_prod_rate: String(HARMONIOUS.uncoveredProd - 9),
      message_quality_pct: String(HARMONIOUS.messageQuality - 59)
    })).toBe('harmonious-high-achiever');
  });

  it('returns "harmonious-high-achiever" for all-healthy metrics', () => {
    expect(classifyDoraArchetype({
      large_commits_pct: '10.00',
      sprawling_commits_pct: '5.00',
      test_coverage_rate: '70.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '80.00'
    })).toBe('harmonious-high-achiever');
  });

  it('treats sprawling commit rate as harmonious once it clears the calibrated healthy band, not the stale duplicated one', () => {
    const { SPRAWLING_COMMITS_PCT, LARGE_COMMITS_PCT, TEST_COVERAGE_RATE, UNCOVERED_PROD_RATE } = THRESHOLDS;
    const { HARMONIOUS } = THRESHOLDS.DORA_ARCHETYPE;
    // Below the calibrated SPRAWLING_COMMITS_PCT.healthy band but above the stale,
    // duplicated HARMONIOUS.sprawling value it used to be compared against.
    expect(SPRAWLING_COMMITS_PCT.healthy).toBeGreaterThan(HARMONIOUS.sprawling);
    const sprawlingValue = (HARMONIOUS.sprawling + SPRAWLING_COMMITS_PCT.healthy) / 2;
    expect(classifyDoraArchetype({
      large_commits_pct: String(LARGE_COMMITS_PCT.healthy - 10),
      sprawling_commits_pct: String(sprawlingValue),
      test_coverage_rate: String(TEST_COVERAGE_RATE.healthy + 20),
      uncovered_prod_rate: String(UNCOVERED_PROD_RATE.healthy - 5)
    })).toBe('harmonious-high-achiever');
  });

  it('returns "mixed-signals" (not harmonious) when uncovered_prod_rate is at or above the calibrated healthy band', () => {
    const { UNCOVERED_PROD_RATE, LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT, TEST_COVERAGE_RATE } = THRESHOLDS;
    expect(classifyDoraArchetype({
      large_commits_pct: String(LARGE_COMMITS_PCT.healthy - 10),
      sprawling_commits_pct: String(SPRAWLING_COMMITS_PCT.healthy - 10),
      test_coverage_rate: String(TEST_COVERAGE_RATE.healthy + 20),
      uncovered_prod_rate: String(UNCOVERED_PROD_RATE.healthy)
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

  it('returns "legacy-bottleneck" once sprawling clears the calibrated critical band, not the stale duplicated one', () => {
    const { SPRAWLING_COMMITS_PCT, LARGE_COMMITS_PCT } = THRESHOLDS;
    const { LEGACY_BOTTLENECK } = THRESHOLDS.DORA_ARCHETYPE;
    // Above the calibrated SPRAWLING_COMMITS_PCT.critical band but below the stale,
    // duplicated LEGACY_BOTTLENECK.sprawling value it used to be compared against.
    expect(LEGACY_BOTTLENECK.sprawling).toBeGreaterThan(SPRAWLING_COMMITS_PCT.critical);
    const sprawlingValue = (LEGACY_BOTTLENECK.sprawling + SPRAWLING_COMMITS_PCT.critical) / 2;
    expect(classifyDoraArchetype({
      large_commits_pct: String(LARGE_COMMITS_PCT.critical + 5),
      sprawling_commits_pct: String(sprawlingValue),
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00'
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

  it('returns "foundational-challenges" once large clears the calibrated critical band, not the stale duplicated one', () => {
    const { LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT } = THRESHOLDS;
    const { FOUNDATIONAL_CHALLENGES } = THRESHOLDS.DORA_ARCHETYPE;
    // Above the calibrated LARGE_COMMITS_PCT.critical band but below the stale,
    // duplicated FOUNDATIONAL_CHALLENGES.large value it used to be compared against.
    expect(FOUNDATIONAL_CHALLENGES.large).toBeGreaterThan(LARGE_COMMITS_PCT.critical);
    const largeValue = (FOUNDATIONAL_CHALLENGES.large + LARGE_COMMITS_PCT.critical) / 2;
    expect(classifyDoraArchetype({
      large_commits_pct: String(largeValue),
      // Kept below SPRAWLING_COMMITS_PCT.critical so legacy-bottleneck (checked first) does
      // not also match.
      sprawling_commits_pct: String(SPRAWLING_COMMITS_PCT.critical - 5),
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00'
    })).toBe('foundational-challenges');
  });

  // Guard, not a new red: UNCOVERED_PROD_RATE is two-band (no .critical -- see
  // lib/thresholds.js), so there is no calibrated bound left for FOUNDATIONAL_CHALLENGES to
  // reference for uncovered_prod_rate. The condition is dropped rather than left reading a
  // stale, un-derivable copy; a high uncovered_prod_rate alone no longer classifies as
  // foundational-challenges. This already passes after the large-bound fix above.
  it('does not return "foundational-challenges" for a high uncovered_prod_rate alone (no critical band exists for it)', () => {
    const { LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT } = THRESHOLDS;
    expect(classifyDoraArchetype({
      large_commits_pct: String(LARGE_COMMITS_PCT.critical - 5),
      sprawling_commits_pct: String(SPRAWLING_COMMITS_PCT.critical - 12),
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '25.00'
    })).not.toBe('foundational-challenges');
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
