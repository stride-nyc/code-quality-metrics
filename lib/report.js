// @ts-nocheck
'use strict';

const { THRESHOLDS } = require('./thresholds');

/**
 * Compute the concern score for a metric: how far the value has moved from
 * the healthy boundary toward the critical boundary. Works for both
 * directions without branching: for "higher is worse" metrics critical is
 * greater than healthy so the denominator is positive; for "higher is
 * better" metrics critical is less than healthy so the denominator is
 * negative, flipping the sign automatically for a low (bad) value.
 * @param {number} value
 * @param {number} healthyBoundary
 * @param {number} criticalBoundary
 * @returns {number}
 */
function computeConcern(value, healthyBoundary, criticalBoundary) {
  return (value - healthyBoundary) / (criticalBoundary - healthyBoundary);
}

/**
 * Convert a concern score into a status label.
 * @param {number} concern
 * @returns {'critical'|'warning'|'good'}
 */
function statusFromConcern(concern) {
  if (concern >= 1) return 'critical';
  if (concern >= 0) return 'warning';
  return 'good';
}

/**
 * Build a standard (concern-formula-driven) catalog entry.
 * @param {object} opts
 * @returns {object}
 */
function standardEntry({ key, label, value, direction, healthyBoundary, criticalBoundary, hasGauge }) {
  const concern = computeConcern(value, healthyBoundary, criticalBoundary);
  return {
    key,
    label,
    value,
    direction,
    status: statusFromConcern(concern),
    concern,
    hasGauge,
    healthyBoundary,
    criticalBoundary
  };
}

/**
 * Build catalog entries for the duplicate-detection layers, from a
 * local_duplicate_analysis.json-shaped object. Returns [] when duplicates is
 * not supplied at all (older analysis runs, or runs that touched no
 * production files never write that file), mirroring how
 * generate-drift-report.js already omits the whole Duplicate Code section
 * for the same reason: absence of the file is not the same thing as a layer
 * having run and found nothing.
 *
 * The static density/lines/clones tiles are likewise omitted (not zeroed)
 * when duplicates.statistics is null: that only happens when jscpd itself
 * failed to produce a report, which is exactly the "no measurement" case
 * this catalog otherwise represents with the unmeasured status below.
 *
 * The semantic tile always renders when duplicates is present, using
 * layers_run.semantic to distinguish "ran and found none" (status neutral,
 * value 0) from "never ran" (status unmeasured, value a "not measured"
 * label rather than a number) -- collapsing that distinction into a bare 0
 * is the exact failure this project has already hit once.
 * @param {object} [duplicates]
 * @returns {Array<object>}
 */
function buildDuplicationEntries(duplicates) {
  if (!duplicates) return [];

  const entries = [];
  const statistics = duplicates.statistics;

  if (statistics) {
    entries.push(standardEntry({
      key: 'duplication_density_pct',
      label: 'Duplication density',
      value: statistics.percentage,
      direction: 'higher-is-worse',
      healthyBoundary: THRESHOLDS.DUPLICATION_PCT.healthy,
      criticalBoundary: THRESHOLDS.DUPLICATION_PCT.critical,
      hasGauge: true
    }));

    entries.push({
      key: 'duplication_lines',
      label: 'Duplicated lines',
      value: `${statistics.duplicatedLines} / ${statistics.lines}`,
      direction: 'informational',
      status: 'neutral',
      concern: -3,
      hasGauge: false,
      healthyBoundary: null,
      criticalBoundary: null
    });

    entries.push({
      key: 'duplication_clones',
      label: 'Clone count',
      value: statistics.clones,
      direction: 'informational',
      status: 'neutral',
      concern: -3,
      hasGauge: false,
      healthyBoundary: null,
      criticalBoundary: null
    });
  }

  // layers_run.semantic is false (never ran), true (produced a result), or the string
  // 'unmeasured' (attempted, but the call failed or its response was truncated). Only an
  // exact true means the count is real; Boolean() would read the truthy 'unmeasured'
  // string as a successful run and report a failed call as a confident zero.
  const semanticRan = Boolean(duplicates.layers_run) && duplicates.layers_run.semantic === true;
  entries.push({
    key: 'duplication_semantic_findings',
    label: 'Semantic duplicates',
    value: semanticRan ? (duplicates.semantic_findings || []).length : 'Not measured',
    direction: 'informational',
    status: semanticRan ? 'neutral' : 'unmeasured',
    // Sorts after every other informational entry (-3), since concern is
    // meaningless for a tile that never produced a measurement at all.
    concern: -4,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });

  return entries;
}

/**
 * Build a sorted metric catalog from a local_metrics_summary.json-shaped
 * object, plus optional duplicate-detection data (a
 * local_duplicate_analysis.json-shaped object). duplicates is optional so
 * existing callers passing only a summary keep working unchanged.
 * @param {object} summary
 * @param {object} [duplicates]
 * @returns {Array<object>}
 */
function buildMetricCatalog(summary, duplicates) {
  const entries = [];

  entries.push(standardEntry({
    key: 'large_commits_pct',
    label: 'Large commits',
    value: parseFloat(summary.large_commits_pct),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.LARGE_COMMITS_PCT.healthy,
    criticalBoundary: THRESHOLDS.LARGE_COMMITS_PCT.critical,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'sprawling_commits_pct',
    label: 'Sprawling commits',
    value: parseFloat(summary.sprawling_commits_pct),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.SPRAWLING_COMMITS_PCT.healthy,
    criticalBoundary: THRESHOLDS.SPRAWLING_COMMITS_PCT.critical,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'uncovered_prod_rate',
    label: 'Uncovered prod',
    value: parseFloat(summary.uncovered_prod_rate),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.UNCOVERED_PROD_RATE.warning,
    criticalBoundary: THRESHOLDS.UNCOVERED_PROD_RATE.critical,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'message_quality_pct',
    label: 'Message quality',
    value: parseFloat(summary.message_quality_pct),
    direction: 'higher-is-better',
    healthyBoundary: THRESHOLDS.MESSAGE_QUALITY_PCT.healthy,
    criticalBoundary: THRESHOLDS.MESSAGE_QUALITY_PCT.critical,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'test_coverage_rate',
    label: 'Test coverage',
    value: parseFloat(summary.test_coverage_rate),
    direction: 'higher-is-better',
    healthyBoundary: THRESHOLDS.TEST_COVERAGE_RATE.healthy,
    criticalBoundary: THRESHOLDS.TEST_COVERAGE_RATE.warning,
    hasGauge: true
  }));

  entries.push(standardEntry({
    key: 'net_additions_ratio_median',
    label: 'Net-new ratio (median)',
    value: summary.net_additions_ratio_median,
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.NET_ADDITIONS_RATIO_MEDIAN.healthy,
    criticalBoundary: THRESHOLDS.NET_ADDITIONS_RATIO_MEDIAN.critical,
    hasGauge: false
  }));

  entries.push(standardEntry({
    key: 'avg_lines_changed',
    label: 'Avg. lines changed',
    value: parseFloat(summary.avg_lines_changed),
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.AVG_LINES_CHANGED.warning,
    criticalBoundary: THRESHOLDS.AVG_LINES_CHANGED.critical,
    hasGauge: false
  }));

  entries.push(standardEntry({
    key: 'p90_lines_changed',
    label: 'Commit size, p90',
    value: summary.p90_lines_changed,
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.P90_LINES_CHANGED.healthy,
    criticalBoundary: THRESHOLDS.P90_LINES_CHANGED.critical,
    hasGauge: false
  }));

  entries.push(standardEntry({
    key: 'p90_files_changed',
    label: 'Files changed, p90',
    value: summary.p90_files_changed,
    direction: 'higher-is-worse',
    healthyBoundary: THRESHOLDS.P90_FILES_CHANGED.healthy,
    criticalBoundary: THRESHOLDS.P90_FILES_CHANGED.critical,
    hasGauge: false
  }));

  const testIsolationValue = parseFloat(summary.test_isolation_rate);
  entries.push({
    key: 'test_isolation_rate',
    label: 'Test isolation',
    value: testIsolationValue,
    direction: 'special',
    status: testIsolationValue > THRESHOLDS.TEST_ISOLATION_RATE.positive ? 'good' : 'neutral',
    concern: -2,
    hasGauge: false,
    healthyBoundary: THRESHOLDS.TEST_ISOLATION_RATE.positive,
    criticalBoundary: null
  });

  entries.push({
    key: 'velocity_commits_per_day',
    label: 'Velocity',
    value: summary.velocity_commits_per_day,
    direction: 'informational',
    status: 'neutral',
    concern: -3,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });

  const volumeWithoutDiscipline = summary.commit_size_trend === 'growing' && summary.velocity_trend === 'accelerating';
  entries.push({
    key: 'commit_size_trend',
    label: 'Commit size trend',
    value: summary.commit_size_trend,
    direction: 'informational',
    status: volumeWithoutDiscipline ? 'warning' : 'neutral',
    concern: volumeWithoutDiscipline ? 0.5 : -3,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });
  entries.push({
    key: 'velocity_trend',
    label: 'Velocity trend',
    value: summary.velocity_trend,
    direction: 'informational',
    status: volumeWithoutDiscipline ? 'warning' : 'neutral',
    concern: volumeWithoutDiscipline ? 0.5 : -3,
    hasGauge: false,
    healthyBoundary: null,
    criticalBoundary: null
  });

  entries.push(...buildDuplicationEntries(duplicates));

  // Duplication is a codebase-snapshot signal rather than a per-commit one,
  // but it stays in this single concern sort rather than a separate group:
  // the catalog already mixes commit-level metrics (large_commits_pct) with
  // repo-wide, non-per-commit signals (velocity_commits_per_day,
  // commit_size_trend) in the same sort, using a fixed low concern for the
  // ones with no meaningful threshold. Duplication density fits the same
  // pattern as the percentage gauges it sits alongside (0-100 range,
  // higher-is-worse, real healthy/critical bounds), so a second grid would
  // separate a metric that behaves like its neighbors from them for no
  // reader-facing benefit.
  return entries.sort((a, b) => b.concern - a.concern);
}

/**
 * Convert a center point, radius and angle (degrees) into a cartesian point.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} angleDeg
 * @returns {[number, number]}
 */
function polar(cx, cy, r, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

/**
 * Build an SVG arc path `d` string sweeping from angleStart to angleEnd.
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} angleStart
 * @param {number} angleEnd
 * @returns {string}
 */
function arcPath(cx, cy, r, angleStart, angleEnd) {
  const [x1, y1] = polar(cx, cy, r, angleStart);
  const [x2, y2] = polar(cx, cy, r, angleEnd);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Map a value in [0, vmax] to an angle in degrees, 180 (value 0) down to 0
 * (value vmax), sweeping through the top of the semicircle.
 * @param {number} value
 * @param {number} vmax
 * @returns {number}
 */
function valueToAngle(value, vmax) {
  const v = Math.max(0, Math.min(value, vmax));
  return 180 - (v / vmax) * 180;
}

/**
 * Round a number to 2 decimal places.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute pure gauge geometry (SVG path data) for a semicircular gauge.
 * @param {{ value: number, vmax: number, bands: Array<{start: number, end: number}>, cx?: number, cy?: number, r?: number, r2?: number }} opts
 * @returns {{ bandPaths: string[], needleEndpoint: {x: number, y: number}, hub: {cx: number, cy: number, r: number} }}
 */
function buildGaugeSvgParts({ value, vmax, bands, cx = 110, cy = 104, r = 82, r2 = 64 }) {
  const bandPaths = bands.map(band => arcPath(
    cx, cy, r,
    valueToAngle(band.start, vmax),
    valueToAngle(band.end, vmax)
  ));

  const needleAngle = valueToAngle(value, vmax);
  const [needleX, needleY] = polar(cx, cy, r2, needleAngle);

  return {
    bandPaths,
    needleEndpoint: { x: round2(needleX), y: round2(needleY) },
    hub: { cx, cy, r: 4.5 }
  };
}

/**
 * Return the top N commits by total lines changed (additions + deletions),
 * sorted descending. Does not mutate the input array.
 * @param {Array<{total_additions: number, total_deletions: number}>} metrics
 * @param {number} [n]
 * @returns {Array<object>}
 */
function topCommits(metrics, n = 10) {
  return [...metrics]
    .sort((a, b) => (b.total_additions + b.total_deletions) - (a.total_additions + a.total_deletions))
    .slice(0, n);
}

module.exports = { buildMetricCatalog, buildGaugeSvgParts, topCommits };
