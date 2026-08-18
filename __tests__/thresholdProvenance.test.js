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
const { CONFIG } = require('../lib/config');
const fs = require('fs');
const path = require('path');
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

// Settings that change a measured metric's value, so an observation taken at a
// different setting is not comparable to one taken at the current setting and
// must not feed a band. TEST_FILE_PATTERNS is deliberately absent: it is an
// array of RegExp, which JSON.stringify flattens to [{},{},...], so the
// recorded provenance for it carries no information to check.
const METRIC_AFFECTING_CONFIG_KEYS = [
  'MAX_COMMITS',
  'LARGE_COMMIT_THRESHOLD',
  'SPRAWLING_COMMIT_THRESHOLD',
  'MESSAGE_QUALITY_MIN_WORDS',
  'DUPLICATE_MIN_LINES',
  'DUPLICATE_MIN_TOKENS',
  'DUPLICATE_IGNORE_PATTERNS'
];

describe('observation provenance', () => {
  test('every observation used in derivation records the detector settings its metrics were measured at', () => {
    const drifted = observationData.observations
      .filter(o => o.include_in_derivation)
      .flatMap(o => METRIC_AFFECTING_CONFIG_KEYS
        .filter(key => JSON.stringify(o.config?.[key]) !== JSON.stringify(CONFIG[key]))
        .map(key => `${o.repo} ${o.window?.since ?? o.window} ${key}: recorded ${JSON.stringify(o.config?.[key])}, current ${JSON.stringify(CONFIG[key])}`));

    expect(drifted).toEqual([]);
  });
});

// CLAUDE.md's Key Metrics table is the first place a reader looks for a band, and
// it is invisible to every other test in this suite. It has gone stale twice: once
// when message_quality_pct, net_additions_ratio_median and avg_lines_changed lost
// their bands, and again the moment duplication_pct was re-derived at 10/100.
// Row label in that table -> key in lib/thresholds.js.
const CLAUDE_MD_ROW_LABELS = {
  'Large commit % (>100 prod lines)': 'LARGE_COMMITS_PCT',
  'Sprawling commit % (>5 files)': 'SPRAWLING_COMMITS_PCT',
  'Test coverage rate (test+prod co-occurrence)': 'TEST_COVERAGE_RATE',
  'Uncovered prod rate': 'UNCOVERED_PROD_RATE',
  'p90 lines changed': 'P90_LINES_CHANGED',
  'p90 files changed': 'P90_FILES_CHANGED',
  'Duplication density %': 'DUPLICATION_PCT'
};

describe('documentation provenance', () => {
  test('the CLAUDE.md threshold table states the bands lib/thresholds.js holds', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');

    /** Numbers only: the table writes boundaries as "<=19%" / ">30%" / "260". */
    const numbersIn = cell => (cell.match(/[\d.]+/g) || []).map(Number);

    const documented = {};
    const expected = {};

    for (const [label, key] of Object.entries(CLAUDE_MD_ROW_LABELS)) {
      const band = THRESHOLDS[key];
      const row = doc.split('\n').find(line => line.startsWith(`| ${label} |`));
      const cells = row ? row.split('|').map(s => s.trim()) : [];

      documented[label] = row
        ? { healthy: numbersIn(cells[2])[0], critical: numbersIn(cells[3])[0] ?? null, tier: cells[4] }
        : 'no row found in CLAUDE.md';
      expected[label] = {
        healthy: band.healthy,
        critical: band.critical ?? null,
        tier: band.critical == null ? 'two-band' : 'three-band'
      };
    }

    expect(documented).toEqual(expected);
  });
});

// ai_drift_metrics_coverage_map.html is organised by DORA metric, so one tile can
// cover several of this toolkit's metrics. Gate the tier claim rather than the
// numbers: a tile may show a Critical row only if something it covers actually has
// a critical bound, and a tile covering only informational metrics may show no
// numeric threshold at all. This catches a withdrawn band left on display, which
// is how avg_lines_changed, net_additions_ratio_median and message_quality_pct
// each survived in this file after losing their bands in lib/thresholds.js.
// Tile title -> the THRESHOLDS keys it presents. null means "informational: no band".
const COVERAGE_MAP_TILES = {
  'Mean time to recovery': ['LARGE_COMMITS_PCT'],
  'Sprawling commit %': ['SPRAWLING_COMMITS_PCT'],
  'Test discipline': ['TEST_COVERAGE_RATE', 'UNCOVERED_PROD_RATE'],
  'Commit size distribution': ['P90_LINES_CHANGED', null],
  'File scope distribution': ['P90_FILES_CHANGED'],
  'Net additions ratio': [null],
  'Commit message quality': [null],
  'Duplication density': ['DUPLICATION_PCT']
};

describe('coverage map provenance', () => {
  test('the coverage map presents a critical band only where lib/thresholds.js has one, and no band at all for informational metrics', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'ai_drift_metrics_coverage_map.html'), 'utf8');

    const presented = {};
    const expected = {};

    for (const [title, keys] of Object.entries(COVERAGE_MAP_TILES)) {
      const tile = new RegExp(`title:'${title.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}'[\\s\\S]{0,400}?thresholds:\\[([^\\]]*)\\]`).exec(html);
      const rows = tile ? tile[1] : null;

      const banded = keys.filter(Boolean);
      const anyCritical = banded.some(k => THRESHOLDS[k].critical != null);
      const allInformational = banded.length === 0;

      presented[title] = rows === null
        ? 'tile not found'
        : { showsCritical: /Critical/.test(rows), showsAnyNumber: /[\d.]/.test(rows) };
      expected[title] = { showsCritical: anyCritical, showsAnyNumber: !allInformational };
    }

    expect(presented).toEqual(expected);
  });
});
