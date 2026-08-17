'use strict';

const { renderReportHtml } = require('../lib/report-template');
const { buildMetricCatalog } = require('../lib/report');

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

    dora_archetype: 'harmonious-high-achiever',

    config: {},
    note: 'test summary'
  }, overrides);
}

function fixtureMetrics() {
  return [
    { sha: 'aaa11111', full_sha: 'aaa11111111111111111111111111111111111', date: '2026-08-01T00:00:00.000Z', author: 'Alice', message: 'feat: add widget', total_additions: 200, total_deletions: 50, files_changed: 4 },
    { sha: 'bbb22222', full_sha: 'bbb22222222222222222222222222222222222', date: '2026-08-02T00:00:00.000Z', author: 'Bob', message: 'fix: bug', total_additions: 10, total_deletions: 5, files_changed: 1 }
  ];
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
  const metrics = fixtureMetrics();
  const catalog = buildMetricCatalog(summary);
  const fontData = fixtureFontData();
  return { summary, metrics, catalog, fontData };
}

describe('renderReportHtml', () => {
  it('renders a complete HTML document from doctype to closing html tag', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html.trim().toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(html.trim().toLowerCase().endsWith('</html>')).toBe(true);
  });

  it('includes a title element identifying the report in the head', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it('renders masthead context from the summary: branches, workflow type, and commit counts', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('feature_branch');
    expect(html).toContain('main');
    expect(html).toContain('feature/foo');
    expect(html).toContain('42');
    expect(html).toContain('30');
  });

  it('renders a verdict line derived from summary.dora_archetype', () => {
    const harmonious = renderReportHtml(fixtureArgs({ dora_archetype: 'harmonious-high-achiever' }));
    expect(harmonious).toMatch(/class="verdict"/);
    expect(harmonious).toContain('harmonious-high-achiever');

    const bottleneck = renderReportHtml(fixtureArgs({ dora_archetype: 'legacy-bottleneck' }));
    expect(bottleneck).toContain('legacy-bottleneck');
  });

  it('renders every entry in the catalog, in the given order, not a filtered subset', () => {
    const args = fixtureArgs();
    const html = renderReportHtml(args);

    expect(args.catalog).toHaveLength(13);
    for (const entry of args.catalog) {
      expect(html).toContain(entry.label);
    }

    const indices = args.catalog.map(entry => html.indexOf(entry.label));
    const sortedIndices = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sortedIndices);
  });

  it('renders a semicircular gauge svg for each catalog entry with hasGauge true', () => {
    const args = fixtureArgs();
    const html = renderReportHtml(args);

    const gaugeCount = (html.match(/<svg class="gauge"/g) || []).length;
    const expectedCount = args.catalog.filter(entry => entry.hasGauge).length;

    expect(expectedCount).toBe(5);
    expect(gaugeCount).toBe(expectedCount);
  });

  it('renders a status chip for plain stat cards with hasGauge false', () => {
    const args = fixtureArgs({ net_additions_ratio_median: 0.45 });
    const html = renderReportHtml(args);
    const entry = args.catalog.find(e => e.key === 'net_additions_ratio_median');

    expect(entry.hasGauge).toBe(false);
    expect(entry.status).toBe('warning');
    expect(html).toContain('<span class="status-chip">warning</span>');
  });

  it('embeds all six vendored fonts via @font-face base64 data URIs', () => {
    const args = fixtureArgs();
    const html = renderReportHtml(args);

    const dataUriCount = (html.match(/data:font\/woff2;base64,/g) || []).length;
    expect(dataUriCount).toBe(6);
    for (const base64 of Object.values(args.fontData)) {
      expect(html).toContain(base64);
    }
  });

  it('includes the exact validated design tokens for light and dark themes', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('--bg: #F5F8FA');
    expect(html).toContain('--accent: #0E7C86');
    expect(html).toContain('--critical: #B73F28');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain(':root:not([data-theme="light"])');
    expect(html).toContain('--bg: #0F141B');
    expect(html).toContain(':root[data-theme="dark"]');
  });

  it('renders a Flight Log table of the top 10 commits by lines changed', () => {
    const manyMetrics = Array.from({ length: 12 }, (_, i) => ({
      sha: `sha${i}`,
      full_sha: `sha${i}full`,
      date: '2026-08-01T00:00:00.000Z',
      author: 'Dev',
      message: `commit number ${i}`,
      total_additions: i,
      total_deletions: 0,
      files_changed: 1
    }));
    const args = fixtureArgs();
    args.metrics = manyMetrics;
    const html = renderReportHtml(args);

    expect(html).toContain('Flight Log');
    expect(html).toContain('commit number 11');
    expect(html).toContain('commit number 2');
    expect(html).not.toContain('commit number 1<');
    expect(html).not.toContain('commit number 0<');
  });

  it('renders findings bullets from an array of strings when findings is provided', () => {
    const args = fixtureArgs();
    args.findings = ['Finding one', 'Finding two'];
    const html = renderReportHtml(args);

    expect(html).toContain('<li>Finding one</li>');
    expect(html).toContain('<li>Finding two</li>');
  });

  it("falls back to templated bullets from the catalog's top critical entries when findings is not given", () => {
    const args = fixtureArgs({ large_commits_pct: '40.00' });
    const html = renderReportHtml(args);

    expect(html).toContain('<li>Large commits: 40 (critical)</li>');
  });

  it('renders a footer', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toMatch(/<footer[^>]*>[\s\S]*<\/footer>/);
  });

  it('includes functional CSS rules for the component classes it emits, not just font-face and token declarations', () => {
    const html = renderReportHtml(fixtureArgs());
    const styleBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

    // The markup emits these classes/elements on every render (masthead,
    // metric-grid, gauge and stat cards, flight log, findings, footer).
    // Each one needs an actual selector plus declarations, a bare :root
    // token definition does not style anything that references it.
    for (const selector of [
      'body', '.metric-grid', '.metric-card', '.gauge',
      '.gauge-band', '.gauge-needle', '.gauge-hub',
      '.status-chip', '.metric-value', '.metric-label', '.metric-threshold',
      '.flight-log', '.findings', 'footer'
    ]) {
      const pattern = new RegExp(selector.replace(/\./g, '\\.') + '\\s*(,[^{]*)?\\{[^}]+\\}');
      expect(styleBlock).toMatch(pattern);
    }
  });

  it('formats metric values by rounding to at most 2 decimal places, avoiding floating point overflow', () => {
    const args = fixtureArgs({ net_additions_ratio_median: 0.676056338028169 });
    const html = renderReportHtml(args);

    expect(html).not.toContain('0.676056338028169');
    expect(html).toContain('0.68');
  });

  it('renders a threshold description for each metric card describing its healthy and critical boundaries', () => {
    const html = renderReportHtml(fixtureArgs());

    // large_commits_pct: higher-is-worse, healthy 20, critical 40 (from lib/thresholds.js)
    expect(html).toContain('Healthy below 20, critical above 40');
    // test_coverage_rate: higher-is-better, healthy 50, critical (warning) 30
    expect(html).toContain('Healthy above 50, critical below 30');
  });

  it('omits a threshold description for informational entries with no numeric boundary', () => {
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const velocityCard = cards.find(card => card.includes('>Velocity</p>'));

    expect(velocityCard).toBeDefined();
    expect(velocityCard).not.toMatch(/Healthy (above|below)/);
  });
});
