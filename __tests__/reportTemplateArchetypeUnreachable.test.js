'use strict';

// lib/report-template.js's describeArchetypeBody renders 'mixed-signals' with only "no
// combination matched", which is accurate but leaves a reader unable to tell a genuine
// mixed-signals result apart from legacy-bottleneck/foundational-challenges being structurally
// unreachable because LARGE_COMMITS_PCT.critical / SPRAWLING_COMMITS_PCT.critical carry no
// critical bound (lib/thresholds.js -- both are null under the current, re-measured
// calibration: no second reference repository corroborates either extreme). This suite proves
// the archetype section states that plainly, read live from THRESHOLDS rather than hardcoded, so
// the note appears or disappears automatically with whichever bound a future recalibration
// actually removes or restores.
//
// No mocking needed: both critical bounds are genuinely null in the real, currently-calibrated
// THRESHOLDS module (see lib/thresholds.js), so this exercises production behavior directly.
const { renderReportHtml } = require('../lib/report-template');
const { buildMetricCatalog } = require('../lib/report');
const { THRESHOLDS } = require('../lib/thresholds');

function fixtureSummary(overrides) {
  return Object.assign({
    analysis_date: '2026-08-17T00:00:00.000Z',
    analysis_period_days: 30,
    total_commits: 42,
    filtered_from: 50,
    workflow_type: 'feature_branch',
    branches_analyzed: ['main', 'feature/foo'],
    branch_commit_counts: { main: 20, 'feature/foo': 22 },

    large_commits_pct: '15.00',
    sprawling_commits_pct: '8.00',
    test_coverage_rate: '55.00',
    test_isolation_rate: '5.00',
    uncovered_prod_rate: '5.00',
    avg_files_changed: '3.00',
    avg_lines_changed: '120.00',

    p50_lines_changed: 40,
    p90_lines_changed: 150,
    p95_lines_changed: 180,
    stddev_lines_changed: 30,
    p50_files_changed: 2,
    p90_files_changed: 5,
    commit_size_trend: 'stable',

    velocity_commits_per_day: 3.2,
    velocity_trend: 'stable',

    net_additions_ratio_median: 0.2,
    net_additions_ratio_p90: 0.4,

    message_quality_pct: '70.00',

    dora_archetype: 'mixed-signals',

    config: {},
    note: 'test summary'
  }, overrides);
}

function fixtureFontData() {
  return {
    'big-shoulders-display-800': 'ZmFrZS1iaWctc2hvdWxkZXJz',
    'public-sans-400': 'ZmFrZS1wdWJsaWMtc2Fucy00MDA=',
    'public-sans-600': 'ZmFrZS1wdWJsaWMtc2Fucy02MDA=',
    'public-sans-700': 'ZmFrZS1wdWJsaWMtc2Fucy03MDA=',
    'ibm-plex-mono-400': 'ZmFrZS1pYm0tcGxleC1tb25vLTQwMA==',
    'ibm-plex-mono-600': 'ZmFrZS1pYm0tcGxleC1tb25vLTYwMA=='
  };
}

function fixtureArgs(summaryOverrides) {
  const summary = fixtureSummary(summaryOverrides);
  const metrics = [];
  const catalog = buildMetricCatalog(summary);
  const fontData = fixtureFontData();
  return { summary, metrics, catalog, fontData };
}

function archetypeSection(html) {
  const start = html.indexOf('<section class="archetype-note">');
  return html.slice(start, html.indexOf('</section>', start));
}

describe('archetype output states unreachability when a critical bound is null', () => {
  it('confirms the real, currently-calibrated bounds this suite depends on', () => {
    expect(THRESHOLDS.LARGE_COMMITS_PCT.critical).toBeNull();
    expect(THRESHOLDS.SPRAWLING_COMMITS_PCT.critical).toBeNull();
  });

  it('names legacy-bottleneck and foundational-challenges as requiring a critical bound neither large nor sprawling commits currently has', () => {
    const html = renderReportHtml(fixtureArgs({ dora_archetype: 'mixed-signals' }));
    const section = archetypeSection(html);
    expect(section).toContain('legacy-bottleneck');
    expect(section).toContain('foundational-challenges');
    expect(section).toContain('critical bound');
  });
});
