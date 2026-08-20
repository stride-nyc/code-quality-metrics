'use strict';

const { classifyDoraArchetype } = require('../local-code-metrics');
const { THRESHOLDS } = require('../lib/thresholds');

// The exact numbers DORA_ARCHETYPE used to duplicate under THRESHOLDS before
// code-quality-metrics-6vi removed it (see lib/thresholds.js's removal-site comment). Kept
// here, not in production, only so the tests below can prove the classifier no longer reads a
// boundary anywhere in this stale range.
const RETIRED_STALE_BOUNDS = {
  HARMONIOUS: { large: 20, sprawling: 10, testCoverage: 50, uncoveredProd: 10, messageQuality: 60 },
  LEGACY_BOTTLENECK: { sprawling: 25, large: 30 },
  FOUNDATIONAL_CHALLENGES: { large: 40, uncoveredProd: 20 }
};

describe('classifyDoraArchetype', () => {
  it('returns "harmonious-high-achiever" even when message quality is poor', () => {
    const { HARMONIOUS } = RETIRED_STALE_BOUNDS;
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
    const { HARMONIOUS } = RETIRED_STALE_BOUNDS;
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

  // LARGE_COMMITS_PCT.critical and SPRAWLING_COMMITS_PCT.critical are both null under the
  // current (re-measured) calibration -- see lib/thresholds.js. legacy-bottleneck's whole
  // definition is "both metrics exceed their critical bound"; with neither bound present there
  // is nothing left to exceed, so the archetype is unreachable. This must not be masked by
  // JS's `value > null` coercing null to 0 and fabricating a critical breach for any positive
  // value -- the exact defect exceedsCritical (used elsewhere in lib/metrics.js) exists to
  // prevent, which classifyDoraArchetype must now use too.
  it('does not return "legacy-bottleneck" for high sprawl combined with high large commits now that neither critical bound exists', () => {
    const { LARGE_COMMITS_PCT, SPRAWLING_COMMITS_PCT } = THRESHOLDS;
    expect(LARGE_COMMITS_PCT.critical).toBeNull();
    expect(SPRAWLING_COMMITS_PCT.critical).toBeNull();
    expect(classifyDoraArchetype({
      large_commits_pct: '35.00',
      sprawling_commits_pct: '30.00',
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '50.00'
    })).toBe('mixed-signals');
  });

  it('does not return "legacy-bottleneck" for any sprawling/large combination while SPRAWLING_COMMITS_PCT.critical is null', () => {
    const { SPRAWLING_COMMITS_PCT } = THRESHOLDS;
    expect(SPRAWLING_COMMITS_PCT.critical).toBeNull();
    expect(classifyDoraArchetype({
      large_commits_pct: '99.00',
      sprawling_commits_pct: '99.00',
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00'
    })).not.toBe('legacy-bottleneck');
  });

  // Same reasoning as the legacy-bottleneck tests above: foundational-challenges' only
  // remaining path (large-commit rate alone, see this function's own docstring) is also gone
  // now that LARGE_COMMITS_PCT.critical is null, so the archetype is unreachable entirely.
  it('does not return "foundational-challenges" for a large commit rate of 45% now that LARGE_COMMITS_PCT has no critical bound', () => {
    const { LARGE_COMMITS_PCT } = THRESHOLDS;
    expect(LARGE_COMMITS_PCT.critical).toBeNull();
    expect(classifyDoraArchetype({
      large_commits_pct: '45.00',
      sprawling_commits_pct: '0.00',
      test_coverage_rate: '55.00',
      uncovered_prod_rate: '5.00',
      message_quality_pct: '65.00'
    })).toBe('mixed-signals');
  });

  it('does not return "foundational-challenges" for any large commit rate while LARGE_COMMITS_PCT.critical is null', () => {
    const { LARGE_COMMITS_PCT } = THRESHOLDS;
    expect(LARGE_COMMITS_PCT.critical).toBeNull();
    expect(classifyDoraArchetype({
      large_commits_pct: '99.00',
      sprawling_commits_pct: '0.00',
      test_coverage_rate: '40.00',
      uncovered_prod_rate: '5.00'
    })).not.toBe('foundational-challenges');
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
