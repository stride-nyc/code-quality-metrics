#!/usr/bin/env node
// @ts-check
'use strict';

/**
 * Derive threshold bands from recorded reference-repository observations.
 *
 * Reads calibration/observations.json and prints a proposed band for every
 * calibrated metric, together with the observations it rests on. Nothing is
 * written to lib/thresholds.js: the numbers are copied across deliberately, so
 * a threshold change is always a reviewed commit rather than a side effect of
 * re-running a script.
 *
 * Usage: node calibration/derive-bands.js [--json] [--era current|pre-ai]
 *
 * --era is optional and defaults to no filter: every observation with
 * include_in_derivation true is pooled regardless of which era it was measured in,
 * matching this script's behaviour before the era field existed. Pass --era to derive
 * bands from a single era's observations only.
 */

const fs = require('fs');
const path = require('path');

const OBSERVATIONS = path.join(__dirname, 'observations.json');

/**
 * How a band is derived from the reference distribution.
 *
 * healthy: the p75 of observed values for a higher-is-worse metric (p25 for a
 *   higher-is-better metric). Both bounds come from the data, unlike the prior
 *   rule which took the single worst observation as "healthy".
 * critical: the max observed value for a higher-is-worse metric (min for a
 *   higher-is-better one) -- but only when at least two distinct reference
 *   repositories produced an observation at or near that extreme (see
 *   NEAR_EXTREME_FRACTION below). When the extreme rests on a single
 *   repository/window, critical is reported as null rather than asserting a
 *   red boundary the data cannot support; see the tier field.
 */

/**
 * How close (as a fraction of the extreme's magnitude) an observation must be
 * to the max (or min) to count as supporting it, for tiering purposes. 0.15
 * means within 15% of the extreme value. This is a judgment call, not a
 * measurement, and is stated here explicitly so it can be revisited.
 */
const NEAR_EXTREME_FRACTION = 0.15;

/** Metrics where a higher value is worse. */
const HIGHER_IS_WORSE = [
  'large_commits_pct', 'sprawling_commits_pct', 'uncovered_prod_rate',
  'avg_lines_changed', 'p90_lines_changed', 'p90_files_changed',
  'net_additions_ratio_median', 'duplication_pct'
];

/** Metrics where a higher value is better. */
const HIGHER_IS_BETTER = ['test_coverage_rate', 'message_quality_pct'];

/**
 * Metrics with no bad direction at all -- a positive signal only. These never
 * get a healthy/critical band; there is nothing to be "critical" about.
 */
const INFORMATIONAL = ['test_isolation_rate'];

function round(n) {
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 10) return Math.round(n);
  if (n >= 1) return Math.round(n * 2) / 2;
  return Math.round(n * 100) / 100;
}

/**
 * Linear-interpolation percentile (the same method lib/statistics.js uses for
 * p50/p90/p95), so calibration bands are computed the same way the tool's own
 * runtime statistics are.
 * @param {number[]} sortedValues
 * @param {number} p - 0..1
 * @returns {number}
 */
function percentile(sortedValues, p) {
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/**
 * @param {number[]} values
 * @returns {{n:number,min:number,max:number,median:number}}
 */
function describe(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  };
}

/**
 * Whether an observed value counts as "at or near" an extreme (max or min),
 * within NEAR_EXTREME_FRACTION of its magnitude.
 * @param {number} value
 * @param {number} extreme
 * @returns {boolean}
 */
function isNearExtreme(value, extreme) {
  if (extreme === 0) return value === 0;
  return Math.abs(extreme - value) / Math.abs(extreme) <= NEAR_EXTREME_FRACTION;
}

/**
 * @param {string} metric
 * @param {Array<{repo: string, value: number}>} observations
 * @returns {object}
 */
function deriveBand(metric, observations) {
  const values = observations.map(o => o.value);
  const stats = describe(values);
  const sorted = [...values].sort((a, b) => a - b);

  if (INFORMATIONAL.includes(metric)) {
    return { ...stats, direction: 'informational', healthy: null, critical: null, tier: 'informational', supportingRepos: [] };
  }

  if (HIGHER_IS_WORSE.includes(metric)) {
    const healthy = round(percentile(sorted, 0.75));
    const extreme = stats.max;
    const supportingRepos = [...new Set(observations.filter(o => isNearExtreme(o.value, extreme)).map(o => o.repo))];
    const tier = supportingRepos.length >= 2 ? 'three-band' : 'two-band';
    return {
      ...stats,
      direction: 'higher-is-worse',
      healthy,
      critical: tier === 'three-band' ? round(extreme) : null,
      tier,
      supportingRepos
    };
  }

  if (HIGHER_IS_BETTER.includes(metric)) {
    const healthy = round(percentile(sorted, 0.25));
    const extreme = stats.min;
    const supportingRepos = [...new Set(observations.filter(o => isNearExtreme(o.value, extreme)).map(o => o.repo))];
    const tier = supportingRepos.length >= 2 ? 'three-band' : 'two-band';
    return {
      ...stats,
      direction: 'higher-is-better',
      healthy,
      critical: tier === 'three-band' ? round(extreme) : null,
      tier,
      supportingRepos
    };
  }

  return { ...stats, direction: 'informational', healthy: null, critical: null, tier: 'informational', supportingRepos: [] };
}

/**
 * Filter observations to a single era ('current' or 'pre-ai'). Passing no era (the
 * default from the CLI, when --era is omitted) returns every observation unchanged,
 * so era-blind derivation -- pooling every included observation regardless of when it
 * was measured -- remains the default behaviour. See calibration/README.md for which
 * era, if any, is recommended for setting bands; this function only implements the
 * mechanism, it does not pick a side.
 * @param {Array<object>} observations
 * @param {string} [era]
 * @returns {Array<object>}
 */
function selectByEra(observations, era) {
  if (era === undefined) return observations;
  return observations.filter(o => o.era === era);
}

function main() {
  if (!fs.existsSync(OBSERVATIONS)) {
    console.error(`No observations file at ${OBSERVATIONS}. See calibration/README.md.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(OBSERVATIONS, 'utf8'));
  const eraFlagIndex = process.argv.indexOf('--era');
  const era = eraFlagIndex === -1 ? undefined : process.argv[eraFlagIndex + 1];
  const observations = selectByEra(data.observations, era);
  const usable = observations.filter(o => o.include_in_derivation);
  const excluded = observations.filter(o => !o.include_in_derivation);

  /** @type {Record<string, Array<{repo: string, value: number}>>} */
  const byMetric = {};
  for (const observation of usable) {
    for (const [metric, value] of Object.entries(observation.metrics)) {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      (byMetric[metric] ||= []).push({ repo: observation.repo, value });
    }
  }

  const bands = {};
  for (const [metric, observations] of Object.entries(byMetric)) bands[metric] = deriveBand(metric, observations);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ derived_at_tool_commit: data.tool_commit, bands }, null, 2));
    return;
  }

  console.log(`Reference observations: ${usable.length} used, ${excluded.length} excluded`);
  console.log(`Repositories: ${[...new Set(usable.map(o => o.repo))].join(', ')}`);
  console.log('Rule: healthy = p75 of observations (p25 for higher-is-better); critical = max observed (min for');
  console.log(`higher-is-better) -- but only when >=2 distinct repos produced a value within ${Math.round(NEAR_EXTREME_FRACTION * 100)}% of that extreme.\n`);
  console.log(
    'metric'.padEnd(28) + 'n'.padStart(3) + 'min'.padStart(10) + 'median'.padStart(10) + 'max'.padStart(10) +
    '  ->  healthy / critical'.padEnd(26) + 'tier'.padEnd(14) + 'supporting repos'
  );
  for (const [metric, b] of Object.entries(bands)) {
    if (b.tier === 'informational') {
      console.log(`${metric.padEnd(28)}${String(b.n).padStart(3)}${b.min.toFixed(2).padStart(10)}${b.median.toFixed(2).padStart(10)}${b.max.toFixed(2).padStart(10)}  ->  informational (no bad direction)`);
      continue;
    }
    const criticalDisplay = b.critical === null ? 'null' : String(b.critical);
    console.log(
      metric.padEnd(28) + String(b.n).padStart(3) +
      b.min.toFixed(2).padStart(10) + b.median.toFixed(2).padStart(10) + b.max.toFixed(2).padStart(10) +
      '  ->  ' + `${b.healthy} / ${criticalDisplay}`.padEnd(26) + b.tier.padEnd(14) + b.supportingRepos.join(', ')
    );
  }
  if (excluded.length) {
    console.log('\nExcluded from derivation:');
    excluded.forEach(o => console.log(`  ${o.repo} ${o.window.since}: ${o.exclusion_reason}`));
  }

  // Printed every run on purpose. These bands are only as good as the sample behind
  // them, and the high-severity reservations in particular qualify how far any of
  // these numbers can be carried.
  const high = (data.reservations || []).filter(r => r.severity === 'high');
  if (high.length) {
    console.log(`\nReservations qualifying every band above (${(data.reservations || []).length} recorded, ${high.length} high severity):`);
    high.forEach(r => console.log(`  [${r.id}] ${r.concern.split('. ')[0]}.`));
    console.log('  Full text with implications: calibration/observations.json, "reservations".');
  }
}

if (require.main === module) main();

module.exports = { deriveBand, describe, percentile, isNearExtreme, selectByEra, NEAR_EXTREME_FRACTION, HIGHER_IS_WORSE, HIGHER_IS_BETTER, INFORMATIONAL };
