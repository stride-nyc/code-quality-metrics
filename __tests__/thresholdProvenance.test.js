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

/**
 * Re-derive every band for a named non-granular population (e.g. 'greenfield-modern'),
 * the same way deriveBandsFromObservations() does for the granular default above, but
 * without filtering by era: neither greenfield population has more than one era recorded
 * (code-quality-metrics-4cv), so an era filter here would just be a no-op with an extra
 * knob to keep in sync.
 * @param {string} population
 * @returns {Record<string, object>}
 */
function deriveBandsForPopulation(population) {
  const selected = selectByPopulation(observationData.observations, population);
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

// GREENFIELD_MODERN (lib/thresholds.js) is a second, separately named band set -- adopted
// via `derive-bands.js --population greenfield-modern`, per calibration/README.md's
// "Greenfield reference set" section -- and must never be pooled with the granular default
// the gate above checks. This mirrors that gate's shape exactly, scoped to the
// greenfield-modern population instead.
describe('threshold provenance (greenfield-modern population)', () => {
  const derived = deriveBandsForPopulation('greenfield-modern');

  test('every derived band for the greenfield-modern population matches what THRESHOLDS.GREENFIELD_MODERN holds', () => {
    /** @type {Record<string, {healthy: number|null, critical: number|null}>} */
    const held = {};
    /** @type {Record<string, {healthy: number|null, critical: number|null}>} */
    const expected = {};

    for (const [metric, band] of Object.entries(derived)) {
      if (INFORMATIONAL.includes(metric)) continue;
      if (band.tier === 'informational') continue;
      const key = thresholdKeyFor(metric);
      // A metric derive-bands.js bands for this population but THRESHOLDS.GREENFIELD_MODERN
      // does not hold is reported here too: absence is as much a drift as a wrong value.
      held[key] = THRESHOLDS.GREENFIELD_MODERN && THRESHOLDS.GREENFIELD_MODERN[key]
        ? { healthy: THRESHOLDS.GREENFIELD_MODERN[key].healthy, critical: THRESHOLDS.GREENFIELD_MODERN[key].critical ?? null }
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

describe('tool_commit provenance', () => {
  // The observation-provenance gate above checks that every observation records the
  // detector CONFIG a band is derived from, but nothing checked the tool_commit an
  // observation was measured at -- the exact gap a re-measurement (code-quality-metrics-pke,
  // code-quality-metrics-8ad) could fall into: fix a defect, re-measure some observations
  // and not others, and the dataset silently pools two tool versions with nothing failing.
  //
  // Grouped by (era, population) rather than population alone. This check used to pool every
  // era within a population, reasoning that a population-level check was strictly stronger:
  // if the whole population sat behind one tool_commit, every era-restricted subset of it
  // necessarily did too. That reasoning assumed both eras always advance together, which
  // calibration/README.md's "Eras" section says is not the design: era: "current" tracks
  // today's tool version and is expected to be re-measured as the tool changes; era: "pre-ai"
  // is a frozen 2019-2020 snapshot kept "to check the baseline for validity, not to replace
  // it", and README explicitly recommends deriving bands from era: current alone, never from
  // the pooled (no --era) default. A scoped re-measurement of era: current only (this file's
  // own remeasure-era-current task) is exactly that design working as intended, not the defect
  // this guard exists to catch -- but the old population-level grouping could not tell the two
  // apart, and flagged the intended case as a violation. Grouping by (era, population) checks
  // the invariant that actually matters: every derivation the CLI's --era flag can actually
  // produce (including "no --era", i.e. one era per population, since that pools exactly the
  // groups checked here) rests on one tool version, while still catching the original defect --
  // a partial re-measurement that leaves some, but not all, observations *within one era* on
  // the old tool_commit.
  //
  // Deliberately internal-consistency only, not a comparison against the current git HEAD.
  // Comparing to HEAD would fail on every unrelated commit to this repository (a version bump,
  // an unrelated lib/ change, a docs fix), which is exactly the shape of gate people learn to
  // ignore rather than act on. What must never happen is a derivation silently pooling two tool
  // versions within the same era; it is fine, and expected, for different eras to sit behind
  // different tool commits once one has been re-measured and the other deliberately has not.
  test('[guard] every (era, population) group pools observations measured at a single tool_commit', () => {
    const usable = observationData.observations.filter(o => o.include_in_derivation);

    /** @type {Record<string, Set<string>>} */
    const toolCommitsByGroup = {};
    for (const o of usable) {
      const population = o.population ?? 'granular';
      const group = `${o.era}|${population}`;
      (toolCommitsByGroup[group] ||= new Set()).add(o.tool_commit);
    }

    // Guards against the filter/grouping silently matching nothing, which would make this
    // test pass by measuring an empty set rather than by the tool commits being consistent.
    expect(Object.keys(toolCommitsByGroup).length).toBeGreaterThan(0);

    const mixed = Object.entries(toolCommitsByGroup)
      .filter(([, commits]) => commits.size > 1)
      .map(([group, commits]) => `${group}: ${[...commits].sort().join(', ')}`);

    expect(mixed).toEqual([]);
  });
});

// A commits_analyzed short of MAX_COMMITS is either a small repository, a filtered merge, or a
// defect -- the first two are recordable facts, the third is not (code-quality-metrics-dxl).
// Three of the four short-count observations found in this dataset were annotated by whoever
// happened to notice; nothing required it. This gate requires an explanation for every included
// observation going forward, without demanding one already-recorded shape: an observation can
// either carry a dedicated short_count_explanation field (used going forward), or its notes can
// already state the exact shortfall count in prose (the shape microsoft/playwright's and
// stride-nyc/remote_retro's pre-existing records already use, and which this gate must recognize
// without editing either record).
/**
 * @param {Array<any>} observations
 * @returns {string[]}
 */
function findUnexplainedShortCounts(observations) {
  return observations
    .filter(o => o.include_in_derivation)
    .filter(o => typeof o.commits_analyzed === 'number'
      && o.commits_analyzed < (o.config?.MAX_COMMITS ?? CONFIG.MAX_COMMITS))
    .filter(o => {
      const hasField = typeof o.short_count_explanation === 'string' && o.short_count_explanation.trim() !== '';
      const notesStateTheCount = typeof o.notes === 'string' && new RegExp(`\\b${o.commits_analyzed}\\b`).test(o.notes);
      return !hasField && !notesStateTheCount;
    })
    .map(o => `${o.repo} ${o.window?.since ?? o.window}: commits_analyzed ${o.commits_analyzed} short of ${o.config?.MAX_COMMITS ?? CONFIG.MAX_COMMITS} with no explanation`);
}

describe('short count provenance', () => {
  // [guard] Proves the checker is not vacuous: a fixture observation short of MAX_COMMITS with
  // no short_count_explanation and notes that never mention the shortfall must be flagged. Every
  // observation in the real dataset currently happens to have an explanation, so a check that
  // only ran against real data could pass by measuring a dataset with nothing wrong in it, the
  // same trap the tool_commit and CONFIG gates above avoid by asserting their grouping is
  // non-empty.
  test('[guard] flags an included short-count observation that carries no explanation', () => {
    const fixture = [{
      repo: 'fixture/short-no-explanation',
      include_in_derivation: true,
      commits_analyzed: 40,
      config: { MAX_COMMITS: 50 },
      window: { since: '2026-01-01' },
      notes: 'An ordinary window with nothing unusual about it.'
    }];

    expect(findUnexplainedShortCounts(fixture)).toEqual([
      'fixture/short-no-explanation 2026-01-01: commits_analyzed 40 short of 50 with no explanation'
    ]);
  });

  // [guard] microsoft/playwright and stride-nyc/remote_retro were already explained before this
  // gate existed, by prose in notes stating the exact shortfall count -- and this task must not
  // edit either record. Without this exemption the gate would newly fail on two records nobody
  // asked to have touched, the same shape of false alarm the tool_commit gate's own comments warn
  // against ("exactly the shape of gate people learn to ignore rather than act on").
  test('[guard] does not flag a short-count observation whose notes already state the exact shortfall count', () => {
    const fixture = [{
      repo: 'fixture/notes-state-the-count',
      include_in_derivation: true,
      commits_analyzed: 18,
      config: { MAX_COMMITS: 50 },
      window: { since: '2015-07-17' },
      notes: 'Only 18 commits total in this repository\'s whole first six months.'
    }];

    expect(findUnexplainedShortCounts(fixture)).toEqual([]);
  });

  // [guard] emberjs/ember.js and curl/curl (code-quality-metrics-dxl) use a dedicated field
  // rather than folding their explanation into notes prose, since their notes already discuss
  // other things (top-commit dominance, duplication) unrelated to the shortfall. Proven by
  // mutation: deleting the `!hasField` arm of the filter below turns this fixture back into a
  // reported violation, the same failure the first guard test in this file exists to catch.
  test('[guard] does not flag a short-count observation that carries a short_count_explanation field', () => {
    const fixture = [{
      repo: 'fixture/field-explains-it',
      include_in_derivation: true,
      commits_analyzed: 49,
      config: { MAX_COMMITS: 50 },
      window: { since: '2026-04-16' },
      notes: 'Top commit is 40% of window volume, an ordinary refactor.',
      short_count_explanation: 'One commit failed to fetch its blob and was dropped; reproduced.'
    }];

    expect(findUnexplainedShortCounts(fixture)).toEqual([]);
  });

  // [guard] The gate above only checks observations with include_in_derivation: true, matching
  // every other gate in this file (e.g. tool_commit provenance, observation provenance): an
  // excluded observation feeds no band, and most excluded short counts already carry an
  // exclusion_reason rather than this field. Proven by mutation: deleting the
  // `.filter(o => o.include_in_derivation)` line turns this fixture back into a reported
  // violation.
  test('[guard] does not flag an excluded short-count observation', () => {
    const fixture = [{
      repo: 'fixture/excluded-short-count',
      include_in_derivation: false,
      commits_analyzed: 20,
      config: { MAX_COMMITS: 50 },
      window: { since: '2026-01-01' },
      notes: 'Superseded window, kept per the append-only convention.'
    }];

    expect(findUnexplainedShortCounts(fixture)).toEqual([]);
  });

  // [guard] The actual gate: applies the checker proven against fixtures above to the real
  // dataset. This is the check that would have caught all four of code-quality-metrics-dxl's
  // short counts at the time they were recorded, and catches a fifth one the same way. It is
  // deliberately not the only test of this behavior -- see the fixture-based guards above -- a
  // dataset where every current observation happens to be explained would make this test pass
  // for the wrong reason on its own.
  test('[guard] every included observation short of MAX_COMMITS in the current dataset carries an explanation', () => {
    expect(findUnexplainedShortCounts(observationData.observations)).toEqual([]);
  });
});

describe('workflow provenance', () => {
  // [guard] This passes today. It is here because the class of defect it catches once
  // shipped silently: eight references to MESSAGE_QUALITY_PCT and
  // NET_ADDITIONS_RATIO_MEDIAN survived in the workflow YAML after another change
  // removed both keys, producing "Cannot read properties of undefined" on every
  // scheduled run, while this suite stayed green at 305 tests. Nothing in jest reaches
  // a workflow's inline script, so the only reference to a threshold key that no test
  // could see was the one that broke in production.
  test('[guard] every THRESHOLDS path referenced in a workflow resolves to a defined value', () => {
    const workflows = ['code-metrics.yml', 'pr-metrics.yml'];
    const unresolved = [];
    let referenceCount = 0;

    for (const file of workflows) {
      const src = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', file), 'utf8');
      for (const match of src.matchAll(/THRESHOLDS\.([A-Z_0-9]+)\.([A-Za-z_0-9]+)/g)) {
        referenceCount += 1;
        const [, key, subKey] = match;
        if (THRESHOLDS[key]?.[subKey] === undefined) {
          unresolved.push(`${file}: THRESHOLDS.${key}.${subKey}`);
        }
      }
    }

    // Guards against the regex silently matching nothing, which would make this test
    // pass by measuring an empty set rather than by the references being sound.
    expect(referenceCount).toBeGreaterThan(0);
    expect([...new Set(unresolved)]).toEqual([]);
  });

  // [guard] Extends the THRESHOLDS guard above to CONFIG. code-quality-metrics-vom's fix wired
  // CONFIG.LARGE_COMMIT_THRESHOLD/SPRAWLING_COMMIT_THRESHOLD into workflow labels and messages
  // that used to be literal text ("(>100 prod lines)", "(>5 files)"), and nothing checked those
  // resolve. A CONFIG.MISSPELLED_KEY would render "undefined" in a published PR comment or
  // scheduled issue with every test in this suite green, the same shape of defect the THRESHOLDS
  // guard above exists to catch. CONFIG entries are flat scalars/arrays (unlike THRESHOLDS,
  // there is no `.subKey` to resolve), so this matches `CONFIG.KEY` rather than `CONFIG.KEY.sub`.
  test('[guard] every CONFIG path referenced in a workflow resolves to a defined value', () => {
    const workflows = ['code-metrics.yml', 'pr-metrics.yml'];
    const unresolved = [];
    let referenceCount = 0;

    for (const file of workflows) {
      const src = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', file), 'utf8');
      for (const match of src.matchAll(/CONFIG\.([A-Z_0-9]+)/g)) {
        referenceCount += 1;
        const [, key] = match;
        if (CONFIG[key] === undefined) {
          unresolved.push(`${file}: CONFIG.${key}`);
        }
      }
    }

    // Guards against the regex silently matching nothing, which would make this test
    // pass by measuring an empty set rather than by the references being sound.
    expect(referenceCount).toBeGreaterThan(0);
    expect([...new Set(unresolved)]).toEqual([]);
  });
});

// CLAUDE.md's Configuration table documents lib/config.js's defaults, and the band
// gate above does not cover it: bands live in lib/thresholds.js, these are CONFIG
// values. It went stale the way everything else here does, a derived value
// outliving its source. DUPLICATE_IGNORE_PATTERNS was documented as an empty array
// long after it grew nine entries, and a reader tuning duplication would have
// concluded nothing was excluded by default.
const CLAUDE_MD_CONFIG_ROWS = [
  'LARGE_COMMIT_THRESHOLD', 'SPRAWLING_COMMIT_THRESHOLD', 'MESSAGE_QUALITY_MIN_WORDS',
  'AI_ANALYSIS_MAX_COMMITS', 'AI_DIFF_MAX_CHARS', 'AI_RISK_ADDITIONS_RATIO',
  'DUPLICATE_MIN_LINES', 'DUPLICATE_MIN_TOKENS', 'DUPLICATE_IGNORE_PATTERNS',
  'ANALYSIS_IGNORE_PATTERNS'
];

describe('configuration table provenance', () => {
  test('the CLAUDE.md configuration table states the defaults lib/config.js holds', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const lines = doc.split('\n');

    const documented = {};
    const expected = {};

    for (const key of CLAUDE_MD_CONFIG_ROWS) {
      const row = lines.find(line => line.startsWith(`| \`${key}\` |`));
      const cell = row ? row.split('|')[2].trim() : null;
      const actual = CONFIG[key];

      // An array default is documented by its entry count rather than by restating
      // nine globs in a table cell; a scalar is documented by its value.
      if (Array.isArray(actual)) {
        const stated = cell === null ? null : Number((cell.match(/\d+/) || [])[0]);
        documented[key] = stated;
        expected[key] = actual.length;
      } else {
        documented[key] = cell === null ? null : Number((cell.match(/[\d.]+/) || [])[0]);
        expected[key] = actual;
      }
    }

    expect(documented).toEqual(expected);
  });
});
