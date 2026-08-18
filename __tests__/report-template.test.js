'use strict';

const { renderReportHtml } = require('../lib/report-template');
const { METRIC_DESCRIPTIONS } = require('../lib/metric-descriptions');
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

  // The four dora_archetype values are boundaries this toolkit invented from
  // commit shape, not a DORA-validated classification (DORA derives its own
  // archetypes from survey data). foundational-challenges is the archetype a
  // naive good/warning/critical mapping would color red; it must not, since
  // that would assert a confidence the classification does not support.
  it('never renders the foundational-challenges verdict as critical (red)', () => {
    const html = renderReportHtml(fixtureArgs({ dora_archetype: 'foundational-challenges' }));
    expect(html).toMatch(/class="verdict" data-status="[^"]+"/);
    expect(html).not.toContain('class="verdict" data-status="critical"');
    expect(html).toContain('data-status="warning"');
  });

  it('renders harmonious-high-achiever as good and mixed-signals as neutral, distinct from foundational-challenges', () => {
    const good = renderReportHtml(fixtureArgs({ dora_archetype: 'harmonious-high-achiever' }));
    expect(good).toContain('class="verdict" data-status="good"');

    const neutral = renderReportHtml(fixtureArgs({ dora_archetype: 'mixed-signals' }));
    expect(neutral).toContain('class="verdict" data-status="neutral"');
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

  // Confirms lib/report-template.js's fallbackFindings (status === 'critical'
  // || 'warning' only) already keeps an unmeasured tile out of the Findings
  // prose with no extra code, even though it sorts last in the catalog
  // rather than participating in concern ranking. See code-quality-metrics-oxn.
  it('never surfaces the unmeasured duplication tile in fallback findings prose', () => {
    const summary = fixtureSummary({ large_commits_pct: '40.00' });
    const duplicateAnalysis = {
      files_scanned: 5,
      static_duplicates: [],
      semantic_findings: [],
      statistics: null,
      layers_run: { static: true, semantic: false }
    };
    const catalog = buildMetricCatalog(summary, duplicateAnalysis);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData(), duplicates: duplicateAnalysis });

    const findingsSection = html.slice(html.indexOf('<section class="findings">'), html.indexOf('</section>', html.indexOf('<section class="findings">')));
    expect(findingsSection).not.toContain('Semantic duplicates');
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
      '.metric-description-measures', '.metric-description-dora',
      '.flight-log', '.findings',
      '.duplicate-code', '.duplicate-static', '.duplicate-layer-indicator', 'footer'
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

    // large_commits_pct: higher-is-worse, healthy 23, critical 30 (from lib/thresholds.js)
    expect(html).toContain('Healthy below 23, critical above 30');
  });

  it('describes a two-band metric honestly: a healthy bound but no fabricated critical bound', () => {
    // test_coverage_rate is two-band (healthy 50, critical null): the low extreme
    // rests on a single reference repo. The card must say so, never state a
    // numeric critical boundary that does not exist.
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const coverageCard = cards.find(card => card.includes('>Test coverage</p>'));

    expect(coverageCard).toBeDefined();
    expect(coverageCard).not.toMatch(/critical (above|below) \d/);
    expect(coverageCard.toLowerCase()).toContain('no critical bound');
  });

  it('renders a two-band gauge with only good/warning color bands, never a critical (red) arc', () => {
    // test_coverage_rate is two-band. A gauge asserting a red zone it cannot
    // support would overstate what the data shows, so it must render only two
    // bands (good, warning) and no gauge-critical path at all.
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const coverageCard = cards.find(card => card.includes('>Test coverage</p>'));

    expect(coverageCard).not.toContain('gauge-critical');
    const bandCount = (coverageCard.match(/class="gauge-band /g) || []).length;
    expect(bandCount).toBe(2);
  });

  it('omits a threshold description for informational entries with no numeric boundary', () => {
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const velocityCard = cards.find(card => card.includes('>Velocity</p>'));

    expect(velocityCard).toBeDefined();
    expect(velocityCard).not.toMatch(/Healthy (above|below)/);
  });

  it('renders a description of what each metric measures and its DORA connection inside the card', () => {
    const html = renderReportHtml(fixtureArgs());

    // Sourced from lib/metric-descriptions.js rather than duplicated here, so a
    // deliberate rewording does not fail this test. What is under test is that the
    // description reaches the card, not the prose itself. large_commits_pct is
    // always present in the catalog.
    const { measures, dora } = METRIC_DESCRIPTIONS.large_commits_pct;
    expect(html).toContain(measures);
    expect(html).toContain(dora);

    const cards = html.split('<article class="metric-card"').slice(1);
    expect(cards).toHaveLength(13);
    for (const card of cards) {
      const descIndex = card.indexOf('class="metric-description"');
      expect(descIndex).toBeGreaterThanOrEqual(0);

      // Description comes after the threshold line when one is present,
      // otherwise after the label (the last thing before it).
      const thresholdIndex = card.indexOf('class="metric-threshold"');
      const labelIndex = card.indexOf('class="metric-label"');
      const precedingIndex = thresholdIndex >= 0 ? thresholdIndex : labelIndex;
      expect(precedingIndex).toBeGreaterThanOrEqual(0);
      expect(descIndex).toBeGreaterThan(precedingIndex);
    }
  });

  it('renders a Duplicate Code section with static findings, semantic findings, and a layer indicator', () => {
    const duplicates = {
      files_scanned: 3,
      static_duplicates: [
        { firstFile: { name: 'src/a.js', start: 1, end: 10 }, secondFile: { name: 'src/b.js', start: 1, end: 10 }, lines: 10, tokens: 80 }
      ],
      semantic_findings: [
        { file1: 'src/a.js', file2: 'src/c.js', similarity: 'high', confidence: 0.85 }
      ],
      layers_run: { static: true, semantic: true }
    };
    const args = fixtureArgs();
    args.duplicates = duplicates;
    const html = renderReportHtml(args);

    expect(html).toContain('Duplicate Code');
    expect(html).toContain('src/a.js');
    expect(html).toContain('src/b.js');
    expect(html).toContain('src/c.js');
    expect(html).toContain('Layer 1');
    expect(html).toContain('Layer 2');
  });

  it('shows only the Layer 1 indicator and no semantic findings when semantic did not run', () => {
    const args = fixtureArgs();
    args.duplicates = {
      files_scanned: 1,
      static_duplicates: [],
      semantic_findings: [],
      layers_run: { static: true, semantic: false }
    };
    const html = renderReportHtml(args);

    expect(html).toContain('Duplicate Code');
    expect(html).toContain('No static duplicates found');
    expect(html).not.toContain('Layer 2 (semantic) ran');
  });

  it('shows the semantic layer as not measured, not a confident zero, when layers_run.semantic is "unmeasured"', () => {
    const args = fixtureArgs();
    args.duplicates = {
      files_scanned: 5,
      static_duplicates: [],
      semantic_findings: [],
      layers_run: { static: true, semantic: 'unmeasured' }
    };
    const html = renderReportHtml(args);

    expect(html).toContain('Duplicate Code');
    expect(html).not.toContain('No semantic findings');
    expect(html.toLowerCase()).toContain('not measured');
  });

  it('omits the Duplicate Code section entirely when no duplicates data is given', () => {
    const html = renderReportHtml(fixtureArgs());
    expect(html).not.toContain('Duplicate Code');
  });

  it('includes an explicit CSS rule for the unmeasured status, not just critical/warning/good', () => {
    const html = renderReportHtml(fixtureArgs());
    const styleBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

    const pattern = /\.metric-card\[data-status="unmeasured"\]\s*(,[^{]*)?\{[^}]+\}/;
    expect(styleBlock).toMatch(pattern);
  });

  it('renders "Not measured" text and data-status="unmeasured" for a duplication tile that never ran, never a bare 0', () => {
    const duplicateAnalysis = {
      files_scanned: 5,
      static_duplicates: [],
      semantic_findings: [],
      statistics: { clones: 2, duplicatedLines: 12, duplicatedTokens: 90, lines: 1595, tokens: 6196, sources: 11, percentage: 0.75, percentageTokens: 2.07, newClones: 0, newDuplicatedLines: 0 },
      layers_run: { static: true, semantic: false }
    };
    const summary = fixtureSummary();
    const catalog = buildMetricCatalog(summary, duplicateAnalysis);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData(), duplicates: duplicateAnalysis });

    const cards = html.split('<article class="metric-card"').slice(1);
    const semanticCard = cards.find(card => card.includes('>Semantic duplicates</p>'));

    expect(semanticCard).toBeDefined();
    expect(semanticCard).toMatch(/^ data-status="unmeasured"/);
    expect(semanticCard).toContain('Not measured');
    expect(semanticCard).not.toMatch(/class="metric-value">0</);
  });

  // Guard, not a red: this wording already exists. Pinned here because naming only a
  // missing API key sends readers to check configuration that is already correct, which
  // is what happened on a run whose .env was fine.
  it('the unmeasured layer indicator names failure and truncation, not just a missing key', () => {
    const html = renderReportHtml({
      ...fixtureArgs(),
      duplicates: {
        statistics: null,
        static_duplicates: [],
        semantic_findings: [],
        layers_run: { static: true, semantic: 'unmeasured' }
      }
    });

    expect(html).toMatch(/truncat|fail/i);
  });

});
