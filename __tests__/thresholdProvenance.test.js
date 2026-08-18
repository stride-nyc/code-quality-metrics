'use strict';

// Integrity gates tying lib/thresholds.js back to the data and settings that
// produced it. Every defect these catch shares one shape: a derived value
// outliving the thing it was derived from. That shape produced the stale
// DUPLICATION_PCT band (derived at DUPLICATE_MIN_LINES/TOKENS 5/50, still
// scored against after the detector moved to 10/100), the avg_lines_changed
// band derive-bands.js kept proposing after lib/thresholds.js dropped it, and
// eight workflow references to threshold keys another change had removed. None
// was visible to a test that only checks code against code.
const { THRESHOLDS } = require('../lib/thresholds');
const {
  deriveBand, selectByEra, selectByPopulation, INFORMATIONAL
} = require('../calibration/derive-bands');
const observationData = require('../calibration/observations.json');

// lib/thresholds.js documents its own provenance: era "current", granular
// population, which is derive-bands.js's default. Keep these in step with that
// header comment; if the derivation basis changes, this is the one place to say so.
const DERIVED_FROM_ERA = 'current';
const DERIVED_FROM_POPULATION = 'granular';

/**
 * Re-derive every band from the observations exactly as derive-bands.js's
 * main() does: select by era and population, keep the usable observations,
 * group each metric's values by repo, then band each metric.
 * @returns {Record<string, {healthy: number|null, critical: number|null, tier: string}>}
 */
function deriveBandsFromObservations() {
  const selected = selectByPopulation(
    selectByEra(observationData.observations, DERIVED_FROM_ERA),
    DERIVED_FROM_POPULATION
  );
  const usable = selected.filter(o => o.include_in_derivation);

  /** @type {Record<string, Array<{repo: string, value: number}>>} */
  const byMetric = {};
  for (const observation of usable) {
    for (const [metric, value] of Object.entries(observation.metrics)) {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      (byMetric[metric] ||= []).push({ repo: observation.repo, value });
    }
  }

  const bands = {};
  for (const [metric, values] of Object.entries(byMetric)) {
    bands[metric] = deriveBand(metric, values);
  }
  return bands;
}

/** metric name in observations.json -> key in lib/thresholds.js */
const thresholdKeyFor = metric => metric.toUpperCase();

describe('threshold provenance', () => {
  const derived = deriveBandsFromObservations();

  test('every derived band in THRESHOLDS matches what derive-bands.js produces from the current observations and CONFIG', () => {
    /** @type {Record<string, {healthy: number|null, critical: number|null}>} */
    const held = {};
    /** @type {Record<string, {healthy: number|null, critical: number|null}>} */
    const expected = {};

    for (const [metric, band] of Object.entries(derived)) {
      if (INFORMATIONAL.includes(metric)) continue;
      if (band.tier === 'informational') continue;
      const key = thresholdKeyFor(metric);
      // A metric that derive-bands.js bands but lib/thresholds.js does not hold
      // is reported here too: absence is as much a drift as a wrong value.
      held[key] = THRESHOLDS[key]
        ? { healthy: THRESHOLDS[key].healthy, critical: THRESHOLDS[key].critical ?? null }
        : undefined;
      expected[key] = { healthy: band.healthy, critical: band.critical ?? null };
    }

    expect(held).toEqual(expected);
  });
});
