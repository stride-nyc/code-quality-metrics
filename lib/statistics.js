// @ts-nocheck
'use strict';

/**
 * Compute commit velocity and trend from an array of ISO 8601 date strings.
 * Input order does not matter — dates are sorted internally.
 * @param {string[]} dates
 * @returns {{ commits_per_day: number, trend: string }}
 */
function computeVelocity(dates) {
  if (dates.length < 2) return { commits_per_day: dates.length, trend: 'stable' };

  const ms = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const spanDays = (ms[ms.length - 1] - ms[0]) / 86400000 || 1;
  const commits_per_day = dates.length / spanDays;

  // Split commits at time midpoint; compare first-half vs second-half rate
  const midMs = (ms[0] + ms[ms.length - 1]) / 2;
  const firstHalf = ms.filter(t => t <= midMs);
  const secondHalf = ms.filter(t => t > midMs);
  const halfSpan = spanDays / 2 || 1;
  const firstRate = firstHalf.length / halfSpan;
  const secondRate = secondHalf.length / halfSpan;

  let trend = 'stable';
  if (secondRate > firstRate * 1.25) trend = 'accelerating';
  else if (secondRate < firstRate * 0.75) trend = 'decelerating';

  return { commits_per_day, trend };
}

/**
 * Linear-interpolation quantile of an already-sorted numeric array. Used by `computeStatistics`
 * for p50/p90/p95.
 * @param {number[]} sortedValues
 * @param {number} p - 0..1
 * @returns {number}
 */
function interpolatedQuantile(sortedValues, p) {
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/**
 * Compute statistical distribution of a numeric array.
 *
 * `mean` and `stddev` are not meaningful population summary statistics for commit-size data
 * (code-quality-metrics-6dg). Three independent published fits agree the per-commit size
 * population is heavy-tailed with no finite mean and no finite variance: Kolassa, Riehle and
 * Salim (SOFSEM 2013, Table 2) fit a Generalized Pareto Distribution with shape xi = 1.4617 (a
 * GPD has a finite mean only when xi < 1 and finite variance only when xi < 0.5); Arafat and
 * Riehle (HICSS 2009, Table 4) independently fit a power law with exponent -1.8612 on the same
 * underlying database; Hattori and Lanza (EVOL 2008, Section 3) confirm a Pareto fit by Q-Q plot
 * across nine projects. Kolassa's own empirical table shows the consequence directly: mean
 * 465.72 sits above the reported 90th percentile (261) of the same distribution, against a
 * median of 16 -- the sample mean is not a stable center, and a standard deviation built on it
 * is not a meaningful dispersion measure. Both fields are kept in this return value only because
 * a caller outside this module's scope still depends on them: local-code-metrics.js still writes
 * `stddev_lines_changed` into the summary JSON for backwards compatibility. Do not add a
 * healthy/critical band keyed on either field; see lib/thresholds.js's AVG_LINES_CHANGED
 * removal-site comment and metrics-specification.md's Metric 4 section. p50/p90/p95 are the
 * statistics that should carry any scored signal for this distribution.
 *
 * This function previously also returned an `isOutlier` predicate, a per-commit outlier flag
 * built on a window-relative cutoff. It was withdrawn (code-quality-metrics-496), not re-tuned:
 * every cutoff measured -- mean + 2*stddev, a bare p95, and a log-scale Tukey fence at several
 * multipliers -- either un-flagged a commit that was already flagged when a larger commit joined
 * the window (a monotonicity violation measured at 45-70% across 3000 randomized heavy-tailed
 * windows), or went inert once the window's own body spanned orders of magnitude, exactly the
 * case the flag existed to catch. See metrics-specification.md's Per-Commit Outlier Flag section
 * for the measurements and why no absolute alternative was adopted either. Do not reintroduce a
 * window-relative outlier predicate on this return value without addressing that finding first.
 * @param {number[]} sizes
 * @param {number[]} timestamps - epoch ms values, same length as sizes, time-ordered oldest first
 * @returns {{ p50: number, p90: number, p95: number, mean: number, stddev: number, trend: string }}
 */
function computeStatistics(sizes, timestamps) {
  if (sizes.length === 0) {
    return { p50: 0, p90: 0, p95: 0, mean: 0, stddev: 0, trend: 'stable' };
  }

  // Percentile (linear interpolation). Note the same distribution shape makes any single
  // p90/p95 estimate unstable on a small window (as small as 50 commits in this toolkit's own
  // usage, where p90 is the 45th order statistic) -- no published method reviewed for
  // code-quality-metrics-6dg estimates that sampling variance; see metrics-specification.md's
  // Metric 4 and Metric 5 sections for the limitation stated in full.
  const sorted = [...sizes].sort((a, b) => a - b);
  /** @param {number} p - 0..1 */
  function quantile(p) {
    return interpolatedQuantile(sorted, p);
  }

  // mean/stddev: retained for backwards-compatible JSON output only (isOutlier below no longer
  // reads either) -- see this function's own JSDoc above for why neither is a valid population
  // summary statistic for this distribution.
  const mean = sizes.reduce((s, v) => s + v, 0) / sizes.length;
  const variance = sizes.reduce((s, v) => s + (v - mean) ** 2, 0) / sizes.length;
  const stddev = Math.sqrt(variance);

  // Trend: linear regression slope of size over time index
  const n = sizes.length;
  let trend = 'stable';
  if (n >= 2) {
    // Normalize timestamps to [0..1] to avoid floating-point magnitude issues
    const t0 = timestamps[0];
    const tRange = (timestamps[n - 1] - t0) || 1;
    const xs = timestamps.map(t => (t - t0) / tRange);
    const xMean = xs.reduce((s, v) => s + v, 0) / n;
    const yMean = mean;
    const num = xs.reduce((s, x, i) => s + (x - xMean) * (sizes[i] - yMean), 0);
    const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
    const slope = den === 0 ? 0 : num / den;
    // Threshold: slope relative to mean — ignore noise below 5% of mean per unit
    const threshold = yMean * 0.05;
    if (slope > threshold) trend = 'growing';
    else if (slope < -threshold) trend = 'shrinking';
  }

  return {
    p50: quantile(0.5),
    p90: quantile(0.9),
    p95: quantile(0.95),
    mean,
    stddev,
    trend
  };
}

module.exports = { computeVelocity, computeStatistics };
