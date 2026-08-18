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
 * Usage: node calibration/derive-bands.js [--json]
 */

const fs = require('fs');
const path = require('path');

const OBSERVATIONS = path.join(__dirname, 'observations.json');

/**
 * How a band is derived from the reference distribution.
 *
 * healthy: the worst value any reference repository produced. A project doing
 *   no worse than the references is healthy by construction, which is the whole
 *   claim being made and the only one the data supports.
 * critical: healthy times CRITICAL_MULTIPLE. This multiple is a stated
 *   convention, not a measurement. No reference repository approached it, so
 *   the data cannot locate this boundary; it marks "clearly outside the range
 *   disciplined projects occupy" and is labelled as convention wherever it is
 *   reported.
 */
const CRITICAL_MULTIPLE = 2;

/** Metrics where a higher value is worse. */
const HIGHER_IS_WORSE = [
  'large_commits_pct', 'sprawling_commits_pct', 'uncovered_prod_rate',
  'avg_lines_changed', 'p90_lines_changed', 'p90_files_changed',
  'net_additions_ratio_median', 'duplication_pct'
];

/** Metrics where a higher value is better. */
const HIGHER_IS_BETTER = ['test_coverage_rate', 'message_quality_pct', 'test_isolation_rate'];

function round(n) {
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 10) return Math.round(n);
  if (n >= 1) return Math.round(n * 2) / 2;
  return Math.round(n * 100) / 100;
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

function deriveBand(metric, values) {
  const stats = describe(values);
  if (HIGHER_IS_WORSE.includes(metric)) {
    const healthy = round(stats.max);
    return { ...stats, direction: 'higher-is-worse', healthy, critical: round(healthy * CRITICAL_MULTIPLE) };
  }
  if (HIGHER_IS_BETTER.includes(metric)) {
    const healthy = round(stats.min);
    return { ...stats, direction: 'higher-is-better', healthy, critical: round(healthy / CRITICAL_MULTIPLE) };
  }
  return { ...stats, direction: 'informational', healthy: null, critical: null };
}

function main() {
  if (!fs.existsSync(OBSERVATIONS)) {
    console.error(`No observations file at ${OBSERVATIONS}. See calibration/README.md.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(OBSERVATIONS, 'utf8'));
  const usable = data.observations.filter(o => o.include_in_derivation);
  const excluded = data.observations.filter(o => !o.include_in_derivation);

  const byMetric = {};
  for (const obs of usable) {
    for (const [metric, value] of Object.entries(obs.metrics)) {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      (byMetric[metric] ||= []).push(value);
    }
  }

  const bands = {};
  for (const [metric, values] of Object.entries(byMetric)) bands[metric] = deriveBand(metric, values);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ derived_at_tool_commit: data.tool_commit, bands }, null, 2));
    return;
  }

  console.log(`Reference observations: ${usable.length} used, ${excluded.length} excluded`);
  console.log(`Repositories: ${[...new Set(usable.map(o => o.repo))].join(', ')}`);
  console.log(`Rule: healthy = worst reference value; critical = healthy x ${CRITICAL_MULTIPLE} (stated convention, not measured)\n`);
  console.log('metric'.padEnd(28) + 'n'.padStart(3) + 'min'.padStart(10) + 'median'.padStart(10) + 'max'.padStart(10) + '  ->  healthy / critical');
  for (const [metric, b] of Object.entries(bands)) {
    if (b.healthy === null) continue;
    console.log(
      metric.padEnd(28) + String(b.n).padStart(3) +
      b.min.toFixed(2).padStart(10) + b.median.toFixed(2).padStart(10) + b.max.toFixed(2).padStart(10) +
      '  ->  ' + b.healthy + ' / ' + b.critical
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

module.exports = { deriveBand, describe, CRITICAL_MULTIPLE, HIGHER_IS_WORSE, HIGHER_IS_BETTER };
