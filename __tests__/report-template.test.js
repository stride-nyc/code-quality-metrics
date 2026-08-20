'use strict';

const { renderReportHtml } = require('../lib/report-template');
const { METRIC_DESCRIPTIONS } = require('../lib/metric-descriptions');
const { buildMetricCatalog, METRIC_GROUP_ORDER } = require('../lib/report');
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

// Scopes an assertion to the Duplicate Code detail section only, so a match against the
// unrelated "Not measurable" metric tile elsewhere in the document can never make a
// duplicate-section assertion pass for the wrong reason (the vacuous-green trap this ticket
// warns about: a fixture that produces no duplicates for an unrelated reason).
function duplicateSection(html) {
  const start = html.indexOf('<section class="duplicate-code">');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('</section>', start) + '</section>'.length;
  return html.slice(start, end);
}

// Scopes an assertion to the masthead only (code-quality-metrics-g39): the branch list moved
// out of it into Analysis Scope, so a test asserting the masthead does NOT carry the branch
// list would pass vacuously against the whole page (the names still appear further down) if it
// were not scoped to just this element.
function mastheadSection(html) {
  const start = html.indexOf('<header class="masthead">');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('</header>', start) + '</header>'.length;
  return html.slice(start, end);
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

  it('renders workflow type and commit counts in the masthead', () => {
    const html = renderReportHtml(fixtureArgs());
    const masthead = mastheadSection(html);

    expect(masthead).toContain('feature_branch');
    expect(masthead).toContain('42');
    expect(masthead).toContain('30');
  });

  // code-quality-metrics-g39: a reader on a many-branch repository (measured: remote_retro,
  // 30 branch names before a single number) met a wall of branch names before the commit count
  // or the span. The names move to Analysis Scope; the masthead keeps only the count of
  // contributing branches ("across N branches"), already covered by the test below.
  it('does not render the branch name list in the masthead', () => {
    const html = renderReportHtml(fixtureArgs({ branches_analyzed: ['main', 'feature/foo', 'feature/a-third-branch'] }));
    const masthead = mastheadSection(html);

    expect(masthead).not.toContain('feature/foo');
    expect(masthead).not.toContain('feature/a-third-branch');
  });

  // code-quality-metrics-g10 hard requirement: a HEAD-anchored run never applied a day-based
  // boundary at all, so the primary masthead line claiming "a 30-day window" would itself be
  // false, not merely incomplete -- the adjacent span line (tested below) does not fix a false
  // statement sitting right next to it.
  it('does not claim a day-count window in the masthead when the analysis was HEAD-anchored', () => {
    const html = renderReportHtml(fixtureArgs({
      analyzed_span_start: '2025-10-12',
      analyzed_span_end: '2025-10-20',
      window_requested_since: null,
      window_widened: false
    }));

    expect(html).not.toContain('30-day window');
  });

  // code-quality-metrics-g10 hard requirement: the actual analyzed span must appear in the
  // HTML, not only in the summary JSON, so a report is never presentable as covering recent
  // activity when the analyzed commits are actually old (e.g. a HEAD-anchored window on a
  // repository whose newest commit is 300 days old).
  it('renders the actual analyzed span in the masthead, not just the requested day count', () => {
    const html = renderReportHtml(fixtureArgs({
      analyzed_span_start: '2025-10-12',
      analyzed_span_end: '2025-10-20',
      window_requested_since: null,
      window_widened: false
    }));

    expect(html).toContain('2025-10-12');
    expect(html).toContain('2025-10-20');
  });

  // code-quality-metrics-8sq acceptance criteria: a report makes clear when its sample is
  // spread thinly across many branches (measured: remote_retro, 29 commits across 30
  // branches; dotnetdependencytracer, 50 across 49). Recommended fix is visibility, not a
  // filter, so this has to show up in the masthead a reader actually looks at.
  it('renders how many branches contributed to the analyzed sample, next to the commit count', () => {
    const html = renderReportHtml(fixtureArgs({
      total_commits: 50,
      branches_with_analyzed_commits: 7
    }));

    // An exact multi-token phrase, not a bare digit: a bare "7" or "branch" would already be
    // present elsewhere in the rendered page (base64 font data, the existing branches list)
    // regardless of whether this feature exists, which would make a weaker assertion pass
    // vacuously.
    expect(html).toContain('across 7 branch');
  });

  it('states that the window was widened, and from what requested boundary, when window_widened is true', () => {
    const html = renderReportHtml(fixtureArgs({
      analyzed_span_start: '2026-07-30',
      analyzed_span_end: '2026-08-05',
      window_requested_since: '2020-01-01',
      window_widened: true
    }));

    expect(html).toContain('2026-07-30');
    expect(html).toContain('2026-08-05');
    expect(html).toContain('2020-01-01');
    expect(html).toMatch(/widened/i);
  });

  // code-quality-metrics-aoo state 1 (4 of 5 repositories analysed: 73V, remote_retro,
  // daloopa, dotnetdependencytracer): workflow_type feature_branch settles the unit
  // structurally regardless of what the raw detector guessed, so the line must state the
  // resolved fact in plain words and must not pair it with the confidence of the discarded
  // guess (the exact bug: "History: granular (low confidence)" reads as unsure about a
  // value that was never actually in doubt).
  it('states individual commits with no confidence hedge when workflow_type settles the unit structurally (state 1)', () => {
    const html = renderReportHtml(fixtureArgs({
      workflow_type: 'feature_branch',
      history_granularity: 'granular',
      history_granularity_detected: 'squashed',
      history_granularity_confidence: 'low',
      history_granularity_override: null
    }));
    const line = html.slice(html.indexOf('<p class="masthead-granularity">'), html.indexOf('</p>', html.indexOf('<p class="masthead-granularity">')));

    expect(line).toContain('Comparing individual commits');
    expect(line).toContain('unmerged branches');
    expect(line).not.toContain('confidence');
  });

  // [guard] not a called-shot RED: resolveGranularitySentence's full five-state switch was
  // written in one pass alongside state 1 above, so states 2-5 below pin down behavior that
  // already existed rather than driving new production code. Proven by mutation: swapping the
  // 'high' branch's return for the 'low' branch's text (so a high-confidence trunk-granular
  // result reads "though the signal is weak") failed this test, expecting "keeps them intact"
  // but receiving "though the signal is weak: a few subjects reference pull requests" -- reverted
  // after confirming.
  it('[guard] states individual commits with no hedge when trunk detection settles granular at high confidence (state 2)', () => {
    const html = renderReportHtml(fixtureArgs({
      workflow_type: 'trunk',
      history_granularity: 'granular',
      history_granularity_detected: 'granular',
      history_granularity_confidence: 'high'
    }));
    const line = html.slice(html.indexOf('<p class="masthead-granularity">'), html.indexOf('</p>', html.indexOf('<p class="masthead-granularity">')));

    expect(line).toContain('Comparing individual commits');
    expect(line).toContain('keeps them intact');
  });

  // [guard] proven by mutation: swapping the 'low' branch's text for the 'high' branch's
  // ("keeps them intact rather than squashing on merge") failed this test, expecting "the signal
  // is weak" but receiving the high-confidence wording -- reverted after confirming.
  it('[guard] names the signal as weak when trunk detection settles granular at low confidence (state 3)', () => {
    const html = renderReportHtml(fixtureArgs({
      workflow_type: 'trunk',
      history_granularity: 'granular',
      history_granularity_detected: 'granular',
      history_granularity_confidence: 'low'
    }));
    const line = html.slice(html.indexOf('<p class="masthead-granularity">'), html.indexOf('</p>', html.indexOf('<p class="masthead-granularity">')));

    expect(line).toContain('the signal is weak');
  });

  // [guard] proven by mutation: dropping state 4's trailing withholding-consequence clause
  // (leaving only 'Comparing squashed pull requests, not individual commits.') failed this test's
  // /withheld/ assertion -- reverted after confirming.
  it('[guard] states squashed pull requests and names the withholding consequence when trunk detection settles squashed (state 4)', () => {
    const html = renderReportHtml(fixtureArgs({
      workflow_type: 'trunk',
      history_granularity: 'squashed',
      history_granularity_detected: 'squashed',
      history_granularity_confidence: 'high'
    }));
    const line = html.slice(html.indexOf('<p class="masthead-granularity">'), html.indexOf('</p>', html.indexOf('<p class="masthead-granularity">')));

    expect(line).toContain('squashed pull requests, not individual commits');
    expect(line).toMatch(/withheld/);
  });

  // [guard] proven by mutation: deleting the `history_granularity_detected === 'unknown'` check
  // (falling through to the state-4 text unconditionally) failed this test, expecting "The unit
  // could not be determined" but receiving the state-4 "squashed pull requests, not individual
  // commits" wording -- reverted after confirming.
  it('[guard] states the unit could not be determined when trunk detection itself returns unknown (state 5)', () => {
    const html = renderReportHtml(fixtureArgs({
      workflow_type: 'trunk',
      history_granularity: 'squashed',
      history_granularity_detected: 'unknown',
      history_granularity_confidence: 'low'
    }));
    const line = html.slice(html.indexOf('<p class="masthead-granularity">'), html.indexOf('</p>', html.indexOf('<p class="masthead-granularity">')));

    expect(line).toContain('The unit could not be determined');
    expect(line).toMatch(/withheld/);
  });

  it('records that a human overrode the heuristic, and what the heuristic itself found, in the masthead', () => {
    const html = renderReportHtml(fixtureArgs({
      history_granularity: 'granular',
      history_granularity_detected: 'squashed',
      history_granularity_confidence: 'low',
      history_granularity_override: 'granular'
    }));

    expect(html).toContain('overridden');
    expect(html).toContain('squashed');
  });

  // code-quality-metrics-31w: flight-info-spike, a three-week greenfield spike, is currently
  // graded against bands calibrated on maintenance-era windows of decades-old codebases and
  // comes out labelled legacy-bottleneck. Withholding four-of-six change-size tiles plus
  // duplication leaves most of a group as ungraded numbers; the masthead has to say plainly
  // what the report is still for in that state, rather than leaving a reader to infer it from a
  // screen of ungraded tiles.
  it('states plainly, in the masthead, that the report shows shape and trend rather than a grade when project_lifecycle is initial-build', () => {
    const html = renderReportHtml(fixtureArgs({ project_lifecycle: 'initial-build' }));
    const masthead = mastheadSection(html);

    expect(masthead).toMatch(/initial build/);
    expect(masthead).toMatch(/shape and trend/);
  });

  // [guard] an established repository's masthead must not carry the initial-build sentence at
  // all -- proven by mutation: see the production-code cycle for this line.
  it('[guard] says nothing about an initial build in the masthead when project_lifecycle is established', () => {
    const html = renderReportHtml(fixtureArgs({ project_lifecycle: 'established' }));
    const masthead = mastheadSection(html);

    expect(masthead).not.toMatch(/initial build/);
  });

  // code-quality-metrics-bmg: the archetype verdict headlined the report, above every metric
  // tile, classifying an entire team from four commit-shape percentages (measured absurdity:
  // a three-week-old greenfield spike labelled legacy-bottleneck). It moves below the "Commit
  // messages" group, in a block marked under development, and out of the masthead entirely.
  it('moves the archetype verdict out of the masthead, into a section after Commit messages marked under development', () => {
    const html = renderReportHtml(fixtureArgs({ dora_archetype: 'harmonious-high-achiever' }));
    const masthead = mastheadSection(html);
    expect(masthead).not.toContain('class="verdict"');

    const commitMessagesHeading = html.indexOf('<h2 class="metric-category-heading">Commit messages</h2>');
    const flightLogHeading = html.indexOf('<h2>Flight Log</h2>');
    const verdictPosition = html.indexOf('class="verdict"');
    expect(commitMessagesHeading).toBeGreaterThanOrEqual(0);
    expect(flightLogHeading).toBeGreaterThan(commitMessagesHeading);
    expect(verdictPosition).toBeGreaterThan(commitMessagesHeading);
    expect(verdictPosition).toBeLessThan(flightLogHeading);
    expect(html).toMatch(/under development/i);
  });

  // [guard] proven by mutation: reintroducing the old ARCHETYPE_VERDICTS-style string
  // ('High sprawl and large-commit rates point to legacy-bottleneck patterns.') in place of
  // describeArchetypeBody's factual per-signal breakdown made this test's "not to contain
  // 'point to'" assertion fail, and its "crossed the critical line" assertion also fail since
  // the old string names no line at all -- reverted after confirming both failures.
  // large_commits_pct and sprawling_commits_pct are both two-band under the current
  // calibration (their .critical is null -- see lib/thresholds.js), so a real catalog entry
  // for either can never reach status 'critical' any more, and classifyDoraArchetype itself
  // can no longer produce 'legacy-bottleneck' (see __tests__/doraArchetype.test.js). This
  // renderer path is still live, decoupled logic (archetypeSignalPhrase/describeArchetypeBody
  // consume summary.dora_archetype and the catalog as given, never re-deriving the verdict --
  // see lib/report-template.js's own comment), so it is proven here against synthetic,
  // restored critical bounds rather than left with no coverage now that no real combination
  // reaches it.
  it('[guard] describes which archetype signals crossed which line, and states the grouping is this toolkit\'s own invention', () => {
    const originalLarge = THRESHOLDS.LARGE_COMMITS_PCT;
    const originalSprawling = THRESHOLDS.SPRAWLING_COMMITS_PCT;
    THRESHOLDS.LARGE_COMMITS_PCT = { healthy: 19, critical: 30 };
    THRESHOLDS.SPRAWLING_COMMITS_PCT = { healthy: 18, critical: 20 };
    let html;
    try {
      html = renderReportHtml(fixtureArgs({
        large_commits_pct: '45.00',
        sprawling_commits_pct: '25.00',
        dora_archetype: 'legacy-bottleneck'
      }));
    } finally {
      THRESHOLDS.LARGE_COMMITS_PCT = originalLarge;
      THRESHOLDS.SPRAWLING_COMMITS_PCT = originalSprawling;
    }
    const archetypeStart = html.indexOf('<section class="archetype-note">');
    const section = html.slice(archetypeStart, html.indexOf('</section>', archetypeStart));

    expect(section).not.toMatch(/points? to/i);
    expect(section).toContain('crossed the critical line');
    expect(section.toLowerCase()).toContain("toolkit's own");
    expect(section).toMatch(/DORA/);
    expect(section).toMatch(/does not publish|no such grouping|not from commit shape/i);
  });

  it('renders a verdict line derived from summary.dora_archetype', () => {
    const harmonious = renderReportHtml(fixtureArgs({ dora_archetype: 'harmonious-high-achiever' }));
    expect(harmonious).toMatch(/class="verdict"/);
    expect(harmonious).toContain('harmonious-high-achiever');

    const bottleneck = renderReportHtml(fixtureArgs({ dora_archetype: 'legacy-bottleneck' }));
    expect(bottleneck).toContain('legacy-bottleneck');
  });

  // code-quality-metrics-rpw: the verdict line named its own archetype twice -- once as a
  // "label: " prefix and again inside describeArchetypeBody's explanatory sentence ('...this
  // toolkit's rule labels that combination "legacy-bottleneck" because...'). Redundant, not
  // incorrect, but a single occurrence reads as clean prose. Scoped to the verdict paragraph
  // alone (not the whole page) so a second, unrelated mention elsewhere in the report can never
  // make this assertion pass for the wrong reason.
  it('[guard] names the archetype label only once in the verdict line, not as a repeated prefix', () => {
    const html = renderReportHtml(fixtureArgs({ dora_archetype: 'legacy-bottleneck' }));
    const verdictStart = html.indexOf('class="verdict"');
    const verdictEnd = html.indexOf('</p>', verdictStart);
    const verdict = html.slice(verdictStart, verdictEnd);

    const occurrences = verdict.split('legacy-bottleneck').length - 1;
    expect(occurrences).toBe(1);
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

  // classifyDoraArchetype (lib/metrics.js) dropped the uncovered_prod_rate arm from
  // foundational-challenges: UNCOVERED_PROD_RATE is two-band with no critical bound to
  // compare against, so the archetype is large-commit only now. The verdict string must
  // not keep describing the dropped arm.
  it('does not describe foundational-challenges as a coverage-gap signal, since the condition no longer tests uncovered_prod_rate', () => {
    const html = renderReportHtml(fixtureArgs({ dora_archetype: 'foundational-challenges' }));
    expect(html).not.toContain('coverage-gap');
  });

  it('renders harmonious-high-achiever as good and mixed-signals as neutral, distinct from foundational-challenges', () => {
    const good = renderReportHtml(fixtureArgs({ dora_archetype: 'harmonious-high-achiever' }));
    expect(good).toContain('class="verdict" data-status="good"');

    const neutral = renderReportHtml(fixtureArgs({ dora_archetype: 'mixed-signals' }));
    expect(neutral).toContain('class="verdict" data-status="neutral"');
  });

  it('suppresses the archetype verdict and explains why when history_granularity is squashed', () => {
    const html = renderReportHtml(fixtureArgs({ history_granularity: 'squashed', dora_archetype: undefined }));
    expect(html).toContain('class="verdict" data-status="neutral"');
    expect(html).toMatch(/pull request/);
    expect(html).not.toContain('No archetype could be determined from the current signals.');
  });

  it('does not double the word "suppressed" in the verdict line', () => {
    const html = renderReportHtml(fixtureArgs({ history_granularity: 'squashed', dora_archetype: undefined }));
    expect(html).not.toContain('suppressed: Archetype suppressed');
  });

  // code-quality-metrics-m7kt: measured live in flight-info-spike, a greenfield window. Its
  // large_commits_pct (48.89) and sprawling_commits_pct (42.22) entries are withheld by
  // buildMetricCatalog for project_lifecycle: initial-build (WITHHELD_WHEN_GREENFIELD_KEYS),
  // which nulls their healthyBoundary/criticalBoundary. describeArchetypeBody consumed that
  // withheld catalog directly: a withheld entry's direction is rewritten to 'informational', so
  // archetypeSignalPhrase's higher-is-worse branch never matched and it fell through to the
  // higher-is-better return, printing "fell below the healthy line at 48.89 (healthy at or
  // above null)" -- wrong verb (48.89 is far above the healthy line), the literal string
  // "null" as a boundary, and (from ARCHETYPE_RULE_DESCRIPTIONS) a claimed critical-line
  // crossing for a signal whose critical band was withheld, not evaluated. The archetype is a
  // classification built from withheld inputs, so it must be suppressed entirely (matching the
  // squashed-history precedent above) rather than rendered with a fabricated boundary.
  // [guard] regression: an established target (project_lifecycle not 'initial-build') has real,
  // non-withheld bands and must keep rendering the correct verb, bound and direction -- the
  // exact sentence confirmed correct on remote_retro before this fix ("Large commits crossed
  // the healthy line at 28 (healthy at or below 19)"). This is the byte-identical-for-
  // established-targets half of code-quality-metrics-m7kt's acceptance criteria: the greenfield
  // fix above must not touch this path at all.
  // large_commits_pct is two-band under the current calibration (LARGE_COMMITS_PCT.critical
  // is null) and classifyDoraArchetype can no longer produce 'foundational-challenges' (see
  // __tests__/doraArchetype.test.js) -- same reasoning as the legacy-bottleneck test above.
  it('[guard] still names the real bound and correct direction for an established target, not "null"', () => {
    const original = THRESHOLDS.LARGE_COMMITS_PCT;
    THRESHOLDS.LARGE_COMMITS_PCT = { healthy: 19, critical: 30 };
    let html;
    try {
      html = renderReportHtml(fixtureArgs({
        large_commits_pct: '28.00',
        sprawling_commits_pct: '8.00',
        dora_archetype: 'foundational-challenges'
      }));
    } finally {
      THRESHOLDS.LARGE_COMMITS_PCT = original;
    }
    const archetypeStart = html.indexOf('<section class="archetype-note">');
    const section = html.slice(archetypeStart, html.indexOf('</section>', archetypeStart));

    expect(section).toContain('Large commits crossed the healthy line at 28 (healthy at or below 19)');
    expect(section).not.toMatch(/null/);
  });

  it('suppresses the archetype verdict and explains why when project_lifecycle is initial-build, instead of printing a withheld boundary as null', () => {
    const html = renderReportHtml(fixtureArgs({
      project_lifecycle: 'initial-build',
      large_commits_pct: '48.89',
      sprawling_commits_pct: '42.22',
      dora_archetype: 'legacy-bottleneck'
    }));
    const archetypeStart = html.indexOf('<section class="archetype-note">');
    const section = html.slice(archetypeStart, html.indexOf('</section>', archetypeStart));

    expect(section).not.toMatch(/null/);
    expect(section).not.toMatch(/crossed (their|the) critical/i);
    expect(section).not.toMatch(/fell below the healthy line/);
    expect(section).toContain('class="verdict" data-status="neutral"');
    expect(section).toMatch(/initial build/i);
  });

  it('renders every entry in the catalog, not a filtered subset, in fixed-group order with concern order preserved inside each group', () => {
    // code-quality-metrics-yte: the page groups tiles under fixed headings, so the catalog's
    // own concern-descending order no longer holds across the whole page -- only within a
    // group. Expected order is therefore METRIC_GROUP_ORDER's groups in sequence, each
    // group's own members left in the order they already arrive in (buildMetricCatalog's
    // concern sort, unchanged by grouping -- see report.test.js's own coverage of that).
    const args = fixtureArgs();
    const html = renderReportHtml(args);

    expect(args.catalog).toHaveLength(13);
    for (const entry of args.catalog) {
      expect(html).toContain(entry.label);
    }

    const expectedOrder = METRIC_GROUP_ORDER.flatMap(group => args.catalog.filter(entry => entry.group === group));
    expect(expectedOrder).toHaveLength(args.catalog.length);
    const indices = expectedOrder.map(entry => html.indexOf(entry.label));
    const sortedIndices = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sortedIndices);
  });

  // message_quality_pct dropped out of the gauge set (code-quality-metrics-6ti): a gauge
  // implies a band, and this metric no longer has one.
  it('renders a semicircular gauge svg for each catalog entry with hasGauge true', () => {
    const args = fixtureArgs();
    const html = renderReportHtml(args);

    const gaugeCount = (html.match(/<svg class="gauge"/g) || []).length;
    const expectedCount = args.catalog.filter(entry => entry.hasGauge).length;

    expect(expectedCount).toBe(4);
    expect(gaugeCount).toBe(expectedCount);
  });

  // code-quality-metrics-a9z: net_additions_ratio_median no longer has any band, so it never
  // reports warning/critical/good, however the value moves -- only the fixed 'neutral'
  // status this metric now always carries.
  it('renders a status chip for plain stat cards with hasGauge false', () => {
    const args = fixtureArgs({ net_additions_ratio_median: 0.9 });
    const html = renderReportHtml(args);
    const entry = args.catalog.find(e => e.key === 'net_additions_ratio_median');

    expect(entry.hasGauge).toBe(false);
    expect(entry.status).toBe('neutral');
    expect(html).toContain('<span class="status-chip">neutral</span>');
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

  // large_commits_pct is two-band under the current calibration (LARGE_COMMITS_PCT.critical
  // is null -- see lib/thresholds.js), so 40% now renders as a warning bullet, not a critical
  // one (no real metric can currently reach 'critical' -- every calibrated band is two-band).
  // The critical-entry fallback path is still live rendering logic, so it is proven here
  // against a synthetic, restored critical bound rather than left uncovered.
  it("falls back to templated bullets from the catalog's top critical entries when findings is not given", () => {
    const original = THRESHOLDS.LARGE_COMMITS_PCT;
    THRESHOLDS.LARGE_COMMITS_PCT = { healthy: 19, critical: 30 };
    let html;
    try {
      const args = fixtureArgs({ large_commits_pct: '40.00' });
      html = renderReportHtml(args);
    } finally {
      THRESHOLDS.LARGE_COMMITS_PCT = original;
    }

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

  // code-quality-metrics-3b6: a silent exclusion is the same defect class as the silent
  // inclusion code-quality-metrics-y8j fixes, so the report must say what was excluded, not
  // only the summary JSON. Both assertions below configure real, non-trivial values (not an
  // empty pattern list) so a stub returning static markup could not satisfy them.
  it('renders the configured ANALYSIS_IGNORE_PATTERNS exclusion: count, line share, and patterns', () => {
    const html = renderReportHtml(fixtureArgs({
      analysis_exclusions: {
        patterns: ['**/bin/**', '**/obj/**'],
        excluded_files_count: 3,
        excluded_lines_count: 1500,
        excluded_lines_pct: '42.00'
      },
      vendored_generated_share: {
        patterns: ['**/deps/**'],
        files_count: 0,
        lines_count: 0,
        lines_pct: '0.00'
      }
    }));

    expect(html).toContain('3');
    expect(html).toContain('42.00');
    expect(html).toContain('**/bin/**');
  });

  // The higher-value half (code-quality-metrics-3b6): visible even when nothing is
  // configured -- analysis_exclusions.patterns is empty here, but vendored_generated_share
  // still has to show up because its own patterns (CONFIG.DUPLICATE_IGNORE_PATTERNS) are
  // never empty by default.
  it('renders the vendored/generated default share even when ANALYSIS_IGNORE_PATTERNS is not configured', () => {
    const html = renderReportHtml(fixtureArgs({
      analysis_exclusions: { patterns: [], excluded_files_count: 0, excluded_lines_count: 0, excluded_lines_pct: '0.00' },
      vendored_generated_share: {
        patterns: ['**/deps/**', '**/vendor/**'],
        files_count: 12,
        lines_count: 8000,
        lines_pct: '61.50'
      }
    }));

    expect(html).toContain('12');
    expect(html).toContain('61.50');
    expect(html).toContain('**/vendor/**');
  });

  // code-quality-metrics-g39: the branch name list moved out of the masthead (see the masthead
  // tests above) into Analysis Scope, which already answers "what was measured" rather than
  // "what was found" and already carries branches_with_analyzed_commits.
  it('renders the branch names in Analysis Scope', () => {
    const html = renderReportHtml(fixtureArgs({ branches_analyzed: ['main', 'feature/foo', 'release/9'] }));
    const scopeStart = html.indexOf('<section class="analysis-scope">');
    expect(scopeStart).toBeGreaterThanOrEqual(0);
    const scope = html.slice(scopeStart, html.indexOf('</section>', scopeStart));

    expect(scope).toContain('main');
    expect(scope).toContain('feature/foo');
    expect(scope).toContain('release/9');
  });

  // code-quality-metrics-rpw: "Branches analyzed" here and "across N branches" in the masthead
  // used the same word for two different sets -- this bullet lists branches_analyzed (every
  // branch considered, measured 51 on 73V), the masthead counts
  // branches_with_analyzed_commits (only those that contributed a commit, measured 4). Asserts
  // both halves: the new label naming the actual set is present, and the old label implying
  // the masthead's set is gone -- the first alone would pass even if the old, misleading label
  // were left standing alongside it.
  it('labels the Analysis Scope branch bullet with the set it lists, not the masthead\'s contributing-branch wording', () => {
    const html = renderReportHtml(fixtureArgs({ branches_analyzed: ['main', 'feature/foo', 'release/9'] }));
    const scopeStart = html.indexOf('<section class="analysis-scope">');
    const scope = html.slice(scopeStart, html.indexOf('</section>', scopeStart));

    expect(scope).toContain('Branches considered');
    expect(scope).not.toContain('Branches analyzed:');
  });

  // code-quality-metrics-rpw: the two counts (branches considered vs. branches that actually
  // contributed a commit) sat on the same page with no way to see them together -- a reader had
  // to count the branch list by hand and separately recall the masthead's "across N branches" to
  // notice a thin slice (code-quality-metrics-8sq). Putting "N of M" in the bullet itself makes
  // the gap visible without that arithmetic.
  it('shows how many of the considered branches contributed a commit to the analyzed sample, next to the branch list', () => {
    const html = renderReportHtml(fixtureArgs({
      branches_analyzed: ['main', 'feature/foo', 'release/9', 'stale/old'],
      branches_with_analyzed_commits: 2
    }));
    const scopeStart = html.indexOf('<section class="analysis-scope">');
    const scope = html.slice(scopeStart, html.indexOf('</section>', scopeStart));

    expect(scope).toContain('2 of 4');
  });

  // code-quality-metrics-aoo: the masthead history line states only the resolved fact (state
  // 1), with no room left for the raw guess it overrode. That guess is not lost -- it moves to
  // Analysis Scope as provenance, so the audit trail survives even though the masthead no
  // longer contradicts itself.
  it('surfaces the discarded raw detection in Analysis Scope as provenance when workflow_type structurally overrode it', () => {
    const html = renderReportHtml(fixtureArgs({
      workflow_type: 'feature_branch',
      history_granularity: 'granular',
      history_granularity_detected: 'squashed',
      history_granularity_confidence: 'low',
      history_granularity_signals: { pr_reference_share: 0.0345, squash_committer_share: 0, merge_commit_count: 0 },
      analysis_exclusions: { patterns: [], excluded_files_count: 0, excluded_lines_count: 0, excluded_lines_pct: '0.00' },
      vendored_generated_share: { patterns: ['**/deps/**'], files_count: 0, lines_count: 0, lines_pct: '0.00' }
    }));
    const scopeStart = html.indexOf('<section class="analysis-scope">');
    const scope = html.slice(scopeStart, html.indexOf('</section>', scopeStart));

    expect(scope).toContain('Detection guessed');
    expect(scope).toContain('squashed pull requests');
    expect(scope).toContain('unmerged branches');
  });

  // code-quality-metrics-g39 changed what "nothing to show" means: Analysis Scope now also
  // carries the branch list, so a real run (which always has branches_analyzed) always has
  // something to show. The section is omitted, without throwing, only when a summary carries
  // none of the four things it can render: exclusions, vendored share, branches, or a discarded
  // history-granularity detection -- the genuinely oldest-vintage case.
  it('omits the Analysis Scope section entirely, without throwing, when the summary has nothing to show', () => {
    const args = fixtureArgs({ branches_analyzed: undefined });
    expect(() => renderReportHtml(args)).not.toThrow();
    const html = renderReportHtml(args);
    expect(html).not.toContain('Analysis Scope');
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

  // large_commits_pct is two-band under the current calibration (LARGE_COMMITS_PCT.critical
  // is null -- see lib/thresholds.js), so it can no longer demonstrate a card describing both
  // a healthy AND a critical boundary. That three-band card description is still live
  // rendering logic (a future re-measurement could restore a three-band metric -- see the
  // two-band card test right below, which already covers the no-critical-bound wording), so it
  // is proven here against a synthetic, restored critical bound rather than left uncovered.
  it('renders a threshold description for each metric card describing its healthy and critical boundaries', () => {
    const original = THRESHOLDS.LARGE_COMMITS_PCT;
    THRESHOLDS.LARGE_COMMITS_PCT = { healthy: 19, critical: 30 };
    let html;
    try {
      html = renderReportHtml(fixtureArgs());
    } finally {
      THRESHOLDS.LARGE_COMMITS_PCT = original;
    }

    expect(html).toContain('Healthy below 19, critical above 30');
  });

  it('describes a two-band metric honestly: a healthy bound but no fabricated critical bound', () => {
    // test_coverage_rate is two-band (critical: null, per lib/thresholds.js's own
    // comment for the current healthy value and its provenance): the low extreme
    // rests on a single reference repo. The card must say so, never state a
    // numeric critical boundary that does not exist.
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const coverageCard = cards.find(card => card.includes('>Test/prod co-change</p>'));

    expect(coverageCard).toBeDefined();
    expect(coverageCard).not.toMatch(/critical (above|below) \d/);
    expect(coverageCard.toLowerCase()).toContain('no critical bound');
  });

  // code-quality-metrics-a9z, code-quality-metrics-6ti: both bands are dropped entirely
  // (no gauge, no verdict), which is exactly the situation this project has already flagged
  // as a bug risk for the two-band tier -- a bare number with no explanation reads as broken.
  // The card must say why, briefly, the same way the two-band tile above says "No critical
  // bound: the high end rests on a single reference repository."
  it('renders a brief reason for the missing verdict on net_additions_ratio_median and message_quality_pct cards', () => {
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');

    const netAdditionsCard = cards.find(card => card.includes('>Net-new ratio (median)</p>'));
    expect(netAdditionsCard).toBeDefined();
    expect(netAdditionsCard).toContain('class="metric-threshold"');
    expect(netAdditionsCard.toLowerCase()).toContain('no healthy/critical band');

    const messageQualityCard = cards.find(card => card.includes('>Message quality</p>'));
    expect(messageQualityCard).toBeDefined();
    expect(messageQualityCard).toContain('class="metric-threshold"');
    expect(messageQualityCard.toLowerCase()).toContain('no healthy/critical band');
  });

  it('renders a two-band gauge with only good/warning color bands, never a critical (red) arc', () => {
    // test_coverage_rate is two-band. A gauge asserting a red zone it cannot
    // support would overstate what the data shows, so it must render only two
    // bands (good, warning) and no gauge-critical path at all.
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const coverageCard = cards.find(card => card.includes('>Test/prod co-change</p>'));

    expect(coverageCard).not.toContain('gauge-critical');
    const bandCount = (coverageCard.match(/class="gauge-band /g) || []).length;
    expect(bandCount).toBe(2);
  });

  // code-quality-metrics-4er: "Test coverage" reads as line/branch coverage from a coverage
  // tool. It is not -- it is commits that touched tests and production code together. Renaming
  // the user-facing label only; the underlying summary field test_coverage_rate is untouched.
  it('labels the test-coverage tile so it does not read as coverage-tool output', () => {
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const coverageCard = cards.find(card => card.includes('>Test/prod co-change</p>'));

    expect(coverageCard).toBeDefined();
    expect(html).not.toContain('>Test coverage</p>');
  });

  // code-quality-metrics-4er: "prod" is an abbreviation the reader has no reason to know.
  it('labels the uncovered-prod tile without the unexplained "prod" abbreviation', () => {
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const uncoveredCard = cards.find(card => card.includes('>Uncovered production</p>'));

    expect(uncoveredCard).toBeDefined();
    expect(html).not.toContain('>Uncovered prod</p>');
  });

  // code-quality-metrics-4er: "Commit size, p90" puts the jargon "p90" in the label while its
  // own description already explains it in plain words ("nine out of ten commits are smaller
  // than this"). The label should say the same thing the description does.
  it('labels the files-changed percentile tile without the "p90" jargon, matching its sibling', () => {
    // Its own description already says "Nine out of ten commits touch fewer files than this",
    // so repeating p90 in the label adds jargon without information. Paired with
    // "Commit size, high end" (code-quality-metrics-4er): leaving one of the two fixed and the
    // other not is a worse state than either.
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const filesCard = cards.find(card => card.includes('>Files changed, high end</p>'));

    expect(filesCard).toBeDefined();
    expect(html).not.toContain('>Files changed, p90</p>');
  });

  it('labels the commit-size percentile tile without the "p90" jargon', () => {
    const html = renderReportHtml(fixtureArgs());
    const cards = html.split('<article class="metric-card"');
    const sizeCard = cards.find(card => card.includes('>Commit size, high end</p>'));

    expect(sizeCard).toBeDefined();
    expect(html).not.toContain('>Commit size, p90</p>');
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

  // code-quality-metrics-4er: test_coverage_rate's description called co-changing tests and
  // production "what healthy work usually looks like". That penalises landing a failing test
  // and its implementation as two atomic commits -- the discipline this project's own working
  // agreement requires -- and Sun et al. (TOSEM 2023) report pervasive noise in exactly this
  // heuristic. The description should say what the metric counts and that it cannot tell
  // test-first from test-after, not call one pattern healthy.
  it('describes test-coverage co-change plainly, without calling it what healthy work looks like', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('a team that deliberately lands a failing test and its implementation as two separate commits looks identical, by this count, to a team that never wrote the test');
    expect(html).not.toContain('what healthy work usually looks like');
  });

  // code-quality-metrics-4er: uncovered_prod_rate's description called itself "the strongest
  // drift signal in the report", a ranking claim with nothing behind it -- no study cited
  // anywhere in this project ranks these signals against each other. The description should
  // say what the metric counts, and that it inherits the large-commit and test-coverage
  // checks' own open questions, instead of ranking it above the other tiles.
  it('describes uncovered-prod plainly, without ranking it above the other tiles', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('It is built from the large-commit check and the test/prod co-change check above');
    expect(html).not.toContain('the strongest drift signal in the report');
  });

  // code-quality-metrics-4er: large_commits_pct's description called large commits "the
  // clearest sign of code accepted wholesale rather than reviewed" -- an unranked superlative.
  // The direction (harder to review) is supported, but the boundary is a selectivity choice
  // and the tail is confounded by vendoring, which this project's own calibration data hit.
  it('describes large commits plainly, without calling them the clearest sign of anything', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('where the line falls is a selectivity choice, not a validated health boundary');
    expect(html).not.toContain('the clearest sign of code accepted wholesale rather than reviewed');
  });

  // code-quality-metrics-4er: test_isolation_rate carries direction 'special' and no verdict
  // (lib/report.js never assigns it a calibrated healthy/critical band), but its description
  // flatly asserted "This is a good sign", and offered only two explanations for a test-only
  // commit as though they were the only ones -- it can equally be a test deleted or disabled.
  it('describes test-isolation commits without calling them a good sign', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('it can just as easily mean a test was deleted or disabled');
    expect(html).not.toContain('This is a good sign');
  });

  // code-quality-metrics-4er (spotted separately, not in the issue's own quoted text):
  // message_quality_pct's description claimed "Vague messages pile up when suggested text is
  // accepted without editing it", a causal claim about AI tools with nothing behind it. The
  // metric's own descriptiveNote (lib/report.js) already says this rate mostly reflects
  // Conventional Commits adoption, not message quality; the description should say the same
  // supported thing rather than an unsupported causal story.
  it('describes commit-message quality without an unsupported causal claim about AI tools', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('mostly tracks whether the project has adopted the Conventional Commits format');
    expect(html).not.toContain('Vague messages pile up when suggested text is accepted without editing it');
  });

  // code-quality-metrics-4er (found during the sweep for the same pattern, not in the issue's
  // own quoted text): sprawling_commits_pct claimed a change that ripples through unrelated
  // files "usually means it was applied by pattern rather than understood" -- an unsupported
  // causal claim contradicted by metrics-specification.md's own Metric 2 section, which
  // reports the threshold sits close to automatic for most commits regardless of practice and
  // that the largest, most file-spanning commits are dominated by license sweeps, generated
  // documentation, and merges rather than drift.
  it('describes sprawling commits as a proxy, without asserting what caused them', () => {
    const html = renderReportHtml(fixtureArgs());

    expect(html).toContain('used as a proxy for a fix rippling through unrelated files');
    expect(html).not.toContain('usually means it was applied by pattern rather than understood');
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

  it('makes no claim that Layer 1 ran or that no static duplicates were found when layers_run.static is "unmeasured"', () => {
    const args = fixtureArgs();
    args.duplicates = {
      files_scanned: 2,
      static_duplicates: [],
      semantic_findings: [],
      unsupported_extensions: ['.ex', '.exs'],
      layers_run: { static: 'unmeasured', semantic: false }
    };
    const html = renderReportHtml(args);
    const section = duplicateSection(html);

    expect(section).not.toContain('Layer 1 (static) ran');
    expect(section).not.toContain('No static duplicates found');
  });

  it('names the unsupported extensions and states the measurement does not exist when layers_run.static is "unmeasured", matching the metric tile\'s own wording', () => {
    const args = fixtureArgs();
    args.duplicates = {
      files_scanned: 2,
      static_duplicates: [],
      semantic_findings: [],
      unsupported_extensions: ['.ex', '.exs'],
      layers_run: { static: 'unmeasured', semantic: false }
    };
    const html = renderReportHtml(args);
    const section = duplicateSection(html);

    expect(section.toLowerCase()).toContain('not measurable');
    expect(section).toContain('.ex');
    expect(section).toContain('.exs');
  });

  it('GUARD: still reports a genuine zero as "No static duplicates found" and "Layer 1 (static) ran" when layers_run.static is true (a supported language with no duplication)', () => {
    const args = fixtureArgs();
    args.duplicates = {
      files_scanned: 4,
      static_duplicates: [],
      semantic_findings: [],
      statistics: { clones: 0, duplicatedLines: 0, duplicatedTokens: 0, lines: 900, tokens: 4200, sources: 4, percentage: 0, percentageTokens: 0, newClones: 0, newDuplicatedLines: 0 },
      layers_run: { static: true, semantic: false }
    };
    const html = renderReportHtml(args);
    const section = duplicateSection(html);

    expect(section).toContain('No static duplicates found');
    expect(section).toContain('Layer 1 (static) ran');
    expect(section.toLowerCase()).not.toContain('not measurable');
  });

  it('states Layer 1 did not run, with no "ran", "no static duplicates found", or "not measurable" claim, when layers_run.static is false', () => {
    const args = fixtureArgs();
    args.duplicates = {
      files_scanned: 0,
      static_duplicates: [],
      semantic_findings: [],
      layers_run: { static: false, semantic: false }
    };
    const html = renderReportHtml(args);
    const section = duplicateSection(html);

    expect(section).toContain('did not run');
    expect(section).not.toContain('Layer 1 (static) ran');
    expect(section).not.toContain('No static duplicates found');
    expect(section.toLowerCase()).not.toContain('not measurable');
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

  // code-quality-metrics-g39: Analysis Scope answers "what was measured", which matters once a
  // reader questions a number, not before they have seen one. It moves to the end of the
  // content (still above the footer), after Findings rather than right after the masthead.
  it('renders Analysis Scope after Findings, as the final content section before the footer', () => {
    const html = renderReportHtml(fixtureArgs({
      analysis_exclusions: { patterns: ['**/bin/**'], excluded_files_count: 1, excluded_lines_count: 10, excluded_lines_pct: '1.00' }
    }));

    const findingsPosition = html.indexOf('<section class="findings">');
    const scopePosition = html.indexOf('<section class="analysis-scope">');
    const footerPosition = html.indexOf('<footer>');

    expect(findingsPosition).toBeGreaterThanOrEqual(0);
    expect(scopePosition).toBeGreaterThan(findingsPosition);
    expect(footerPosition).toBeGreaterThan(scopePosition);
  });

  // code-quality-metrics-g39 full rendered order, top to bottom: masthead, the new top summary,
  // the metric groups, the archetype (under development), Flight Log, Duplicate Code, Findings,
  // then Analysis Scope last, before the footer. Asserts relative position, not just presence --
  // a heading existing somewhere on the page proves nothing about where it sits.
  it('renders every top-level section in the documented order', () => {
    const html = renderReportHtml(fixtureArgs({
      analysis_exclusions: { patterns: ['**/bin/**'], excluded_files_count: 1, excluded_lines_count: 10, excluded_lines_pct: '1.00' }
    }));

    const positions = {
      masthead: html.indexOf('<header class="masthead">'),
      summary: html.indexOf('<section class="report-summary">'),
      metricGrid: html.indexOf('<h2 class="metric-category-heading">'),
      archetype: html.indexOf('<section class="archetype-note">'),
      flightLog: html.indexOf('<h2>Flight Log</h2>'),
      findings: html.indexOf('<section class="findings">'),
      analysisScope: html.indexOf('<section class="analysis-scope">'),
      footer: html.indexOf('<footer>')
    };

    for (const position of Object.values(positions)) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    const order = ['masthead', 'summary', 'metricGrid', 'archetype', 'flightLog', 'findings', 'analysisScope', 'footer'];
    const orderedPositions = order.map(name => positions[name]);
    const sorted = [...orderedPositions].sort((a, b) => a - b);
    expect(orderedPositions).toEqual(sorted);
  });

  function summarySection(html) {
    const start = html.indexOf('<section class="report-summary">');
    expect(start).toBeGreaterThanOrEqual(0);
    return html.slice(start, html.indexOf('</section>', start));
  }

  // [guard] not a called-shot RED: renderTopSummary already counted concerns and named the top
  // one when it was written in the prior commit. Proven by mutation: shadowing criticalCount
  // and warningCount to 0 inside the concerns branch (so neither count is ever pushed) failed
  // this test's /\d+ critical/ assertion, rendering "This run flags  signal, led by Large
  // commits at 40 (critical)." with an empty count clause -- reverted after confirming.
  // large_commits_pct is two-band under the current calibration (LARGE_COMMITS_PCT.critical
  // is null), so this proves the "N critical" summary phrasing against a synthetic, restored
  // critical bound -- see the identical reasoning on the fallback-bullets test above.
  it('[guard] states the count of concerns and names the top one by label and value', () => {
    const original = THRESHOLDS.LARGE_COMMITS_PCT;
    THRESHOLDS.LARGE_COMMITS_PCT = { healthy: 19, critical: 30 };
    let summary;
    try {
      const html = renderReportHtml(fixtureArgs({ large_commits_pct: '40.00' }));
      summary = summarySection(html);
    } finally {
      THRESHOLDS.LARGE_COMMITS_PCT = original;
    }

    expect(summary).toMatch(/\d+ critical/);
    expect(summary).toContain('Large commits');
    expect(summary).toContain('40');
  });

  // [guard] proven by mutation: forcing the `concerns.length === 0` branch condition to `false`
  // (so the "no measured signal" branch can never be taken, even when concerns is actually
  // empty) failed this test with a thrown TypeError ("Cannot read properties of undefined
  // (reading 'label')") from `concerns[0]` being undefined -- reverted after confirming.
  it('[guard] states no signal crossed a threshold when the catalog has no concerns', () => {
    const html = renderReportHtml(fixtureArgs({
      large_commits_pct: '5.00', sprawling_commits_pct: '5.00', uncovered_prod_rate: '1.00', test_coverage_rate: '90.00'
    }));
    const summary = summarySection(html);

    expect(summary).toContain('No measured signal in this run crossed a warning or critical threshold.');
  });

  // code-quality-metrics-g39: "Consider whether the top summary should mention a high vendored
  // share explicitly, since a reader who never scrolls would otherwise miss the one fact that
  // changes how everything else reads" -- measured: flight-info-spike at 72%.
  it('calls out a high vendored/generated share explicitly in the top summary', () => {
    const html = renderReportHtml(fixtureArgs({
      vendored_generated_share: { patterns: ['**/deps/**'], files_count: 40, lines_count: 9000, lines_pct: '72.00' }
    }));
    const summary = summarySection(html);

    expect(summary).toContain('72');
    expect(summary).toMatch(/vendored|generated/);
    expect(summary).toMatch(/Analysis Scope/);
  });

  // [guard] proven by mutation: lowering VENDORED_SHARE_CALLOUT_THRESHOLD to 0 (so any nonzero
  // share triggers the callout) failed this test, which found the callout text present for an
  // 8% share it expects to be silent about -- reverted after confirming.
  it('[guard] does not call out a vendored share below the callout threshold', () => {
    const html = renderReportHtml(fixtureArgs({
      vendored_generated_share: { patterns: ['**/deps/**'], files_count: 2, lines_count: 100, lines_pct: '8.00' }
    }));
    const summary = summarySection(html);

    expect(summary).not.toMatch(/vendored|generated/);
  });

  // The anchor mechanism a file:// page actually uses is fragment-to-id matching: the browser
  // finds the element whose id exactly equals the URL fragment. This is what would break if the
  // href and the id text drifted apart (e.g. a rename on one side only) even though "the markup
  // contains an href" would still be true -- the failure mode this test targets, not just
  // presence of an anchor tag.
  it('the anchor from the summary to Findings resolves to the Findings heading, uniquely, the way a file:// fragment link would', () => {
    const html = renderReportHtml(fixtureArgs());
    const summary = summarySection(html);

    const hrefMatch = summary.match(/<a href="#([^"]+)">/);
    expect(hrefMatch).not.toBeNull();
    const fragment = hrefMatch[1];

    const idPattern = new RegExp(`id="${fragment}"`, 'g');
    const idMatches = html.match(idPattern) || [];
    // A file:// page resolves a fragment link by finding the element whose id equals the
    // fragment, per the HTML living-standard fragment-navigation algorithm -- the same
    // mechanism plain http:// pages use, unaffected by the file: scheme. Uniqueness matters:
    // if two elements shared this id, the target would be ambiguous depending on which one a
    // real browser's tree-order search reaches first, an ambiguity this report must not have.
    expect(idMatches).toHaveLength(1);

    const idIndex = html.indexOf(`id="${fragment}"`);
    const headingStart = html.lastIndexOf('<h2', idIndex);
    const headingText = html.slice(headingStart, html.indexOf('</h2>', headingStart));
    expect(headingText).toContain('Findings');

    // Exercises the exact same URL-fragment resolution a browser performs when the report is
    // opened from disk (a file: URL), rather than only inspecting the markup as strings: the
    // WHATWG URL parser resolves the fragment component identically regardless of scheme, so
    // constructing a file: URL with this href and reading its .hash back out proves the
    // fragment round-trips exactly, with no percent-encoding surprise from special characters.
    const fileUrl = new URL(`report.html#${fragment}`, 'file:///Users/example/repo/');
    expect(fileUrl.hash).toBe(`#${fragment}`);
  });

  // Non-fabrication proof (code-quality-metrics-g39's central constraint): every numeral the
  // top summary prints must be traceable to the catalog it was built from, or to
  // vendored_generated_share -- the same number-presence discipline lib/narrative.js's
  // validateNarrative applies to the LLM-generated Findings narrative, applied here to prove
  // the deterministic summary cannot fabricate a number even by accident, not just that it
  // currently does not.
  it('never prints a number in the top summary that does not trace to the catalog or the vendored share', () => {
    const summary = fixtureSummary({
      large_commits_pct: '37.50',
      sprawling_commits_pct: '22.00',
      vendored_generated_share: { patterns: ['**/deps/**'], files_count: 9, lines_count: 500, lines_pct: '31.00' }
    });
    const catalog = buildMetricCatalog(summary);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData() });
    const summaryHtml = summarySection(html);

    // Same allowed-number universe validateNarrative builds for the LLM narrative: every
    // number appearing anywhere in the catalog's own values/boundaries, or in
    // vendored_generated_share, canonicalized (percent sign and thousands separators
    // stripped) the same way a number written into prose would be.
    const numberPattern = /-?\d+(?:\.\d+)?/g;
    const payloadText = JSON.stringify(catalog) + JSON.stringify(summary.vendored_generated_share);
    const rawTokens = payloadText.match(numberPattern) || [];
    // renderTopSummary reads vendored_generated_share.lines_pct through parseFloat then
    // formatValue (the same "40.00" -> "40" trailing-zero trim every metric card already
    // performs -- see the "formats metric values by rounding..." test above), so a raw
    // payload token like "31.00" and the printed "31" are the same number reformatted, not two
    // different numbers. The allowed set has to include both spellings for the same reason
    // lib/narrative.js's own payload-building step (narrativeValue) exists: comparing prose
    // against a payload's raw string precision would reject a legitimate reformat as fabricated.
    const allowed = new Set(rawTokens);
    for (const token of rawTokens) {
      const parsed = parseFloat(token);
      if (!Number.isNaN(parsed)) allowed.add(String(Math.round(parsed * 100) / 100));
    }
    // renderTopSummary performs exactly one arithmetic derivation beyond echoing a payload
    // field verbatim: counting how many catalog entries carry status 'critical' or 'warning'.
    // That count is not a fabrication risk the way a free-form-prose number is -- it is a
    // provably correct tally over data already in the catalog, not new information -- so it is
    // added to the allowed set explicitly, by the same counting rule, rather than expected to
    // appear as a literal elsewhere in the payload by coincidence.
    const criticalCount = catalog.filter(entry => entry.status === 'critical').length;
    const warningCount = catalog.filter(entry => entry.status === 'warning').length;
    allowed.add(String(criticalCount));
    allowed.add(String(warningCount));

    const printed = summaryHtml.match(numberPattern) || [];
    for (const token of printed) {
      expect(allowed.has(token)).toBe(true);
    }
  });

});

// code-quality-metrics-yte: the flat, single concern-sorted grid becomes five headed groups.
// fullDuplicates supplies real data for every duplication tile so the "Duplication" heading
// (otherwise absent when no duplicate analysis was supplied at all) is present in every test
// below, letting these tests assert all five headings render together.
function fullDuplicatesForGrouping() {
  return {
    files_scanned: 11,
    static_duplicates: [],
    semantic_findings: [],
    statistics: { clones: 2, duplicatedLines: 12, duplicatedTokens: 90, lines: 1595, tokens: 6196, sources: 11, percentage: 0.75, percentageTokens: 2.07, newClones: 0, newDuplicatedLines: 0 },
    layers_run: { static: true, semantic: true }
  };
}

describe('renderReportHtml metric group headings (code-quality-metrics-yte)', () => {
  // [guard] not a called-shot RED: renderMetricGrid already groups by entry.group alone, so
  // a withheld (concern -Infinity, informational) entry keeps its heading with no extra
  // code. Proven by mutation: filtering `entry.concern !== -Infinity` into the group filter
  // (the exact mistake this guard exists to catch -- conflating "withheld/informational"
  // with "should be hidden") made the entire "Change size and scope" heading vanish under
  // squashed history, since every one of its members is informational in that state; the
  // test failed on the missing heading itself before the fix was reverted.
  it('[guard] keeps a withheld tile (squashed history) under its documented heading, in the "Change size and scope" section, rather than moving or dropping it', () => {
    const summary = fixtureSummary({ history_granularity: 'squashed', dora_archetype: undefined });
    const catalog = buildMetricCatalog(summary);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData() });

    const sizeHeadingStart = html.indexOf('<h2 class="metric-category-heading">Change size and scope</h2>');
    expect(sizeHeadingStart).toBeGreaterThanOrEqual(0);
    const nextHeadingStart = html.indexOf('<h2 class="metric-category-heading">', sizeHeadingStart + 1);
    const sizeSection = html.slice(sizeHeadingStart, nextHeadingStart === -1 ? html.length : nextHeadingStart);

    // large_commits_pct is withheld under squashed history (no verdict, informational), but
    // it still measures commit size and must stay under this heading, not move to an
    // "other"/withheld section or vanish.
    expect(sizeSection).toContain('>Large commits</p>');
    expect(sizeSection.toLowerCase()).toContain('no verdict');
  });

  // [guard] not a called-shot RED, same mechanism as the squashed-history guard above (group
  // is keyed on entry.key alone, independent of any withheld/informational state a tile is
  // in): a duplication tile marked "Not measurable" (jscpd cannot parse the scanned
  // language, code-quality-metrics-tjn) still measures duplication and must stay under that
  // heading rather than being omitted or filed elsewhere.
  it('[guard] keeps the "Not measurable" duplication tile under the "Duplication" heading', () => {
    const summary = fixtureSummary();
    const duplicates = { files_scanned: 3, static_duplicates: [], semantic_findings: [], statistics: null, unsupported_extensions: ['.ex', '.exs'], layers_run: { static: 'unmeasured', semantic: false } };
    const catalog = buildMetricCatalog(summary, duplicates);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData(), duplicates });

    const dupHeadingStart = html.indexOf('<h2 class="metric-category-heading">Duplication</h2>');
    expect(dupHeadingStart).toBeGreaterThanOrEqual(0);
    const nextHeadingStart = html.indexOf('<h2 class="metric-category-heading">', dupHeadingStart + 1);
    const dupSection = html.slice(dupHeadingStart, nextHeadingStart === -1 ? html.length : nextHeadingStart);

    expect(dupSection).toContain('>Duplication density</p>');
    expect(dupSection).toContain('Not measurable');
  });

  // [guard] not a called-shot RED: closes the loop between report.test.js's catalog-level
  // membership assertion and the actual markup, so a mismatch introduced only in
  // rendering (not in the group-assignment table) would still be caught here. Proven by
  // mutation: reassigning avg_lines_changed to 'Pace and direction' in
  // lib/report.js's METRIC_GROUP_BY_KEY changed the distribution to [6, 3, 3, 4, 1] and
  // failed this test (also would have failed report.test.js's own membership test, since
  // the mutation was upstream of both).
  it('renders exactly seventeen metric cards distributed 6/4/3/3/1 across the five headings, with no extra heading anywhere in the page', () => {
    const summary = fixtureSummary();
    const duplicates = fullDuplicatesForGrouping();
    const catalog = buildMetricCatalog(summary, duplicates);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData(), duplicates });

    expect(catalog).toHaveLength(17);

    const headingRegex = /<h2 class="metric-category-heading">([^<]+)<\/h2>/g;
    const renderedHeadings = [...html.matchAll(headingRegex)].map(m => m[1]);
    expect(renderedHeadings).toEqual(METRIC_GROUP_ORDER);

    const sections = html.split('<section class="metric-category">').slice(1);
    expect(sections).toHaveLength(5);
    const cardCounts = sections.map(section => (section.match(/<article class="metric-card"/g) || []).length);
    expect(cardCounts).toEqual([6, 4, 3, 3, 1]);
    expect(cardCounts.reduce((a, b) => a + b, 0)).toBe(17);
  });

  it('renders all five documented group headings, in the fixed order, even when a later group carries the highest concern this run', () => {
    // test_coverage_rate (Test practice) is driven to its critical-ish low end so a
    // concern-only sort would put the "Test practice" group first; the fixed group order
    // must win over that anyway.
    const summary = fixtureSummary({ test_coverage_rate: '1.00', large_commits_pct: '5.00', sprawling_commits_pct: '5.00' });
    const duplicates = fullDuplicatesForGrouping();
    const catalog = buildMetricCatalog(summary, duplicates);
    const html = renderReportHtml({ summary, metrics: fixtureMetrics(), catalog, fontData: fixtureFontData(), duplicates });

    const positions = METRIC_GROUP_ORDER.map(group => html.indexOf(`<h2 class="metric-category-heading">${group}</h2>`));
    for (const position of positions) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    const sortedPositions = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sortedPositions);
  });
});
