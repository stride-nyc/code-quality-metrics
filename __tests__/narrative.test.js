'use strict';

const { buildMetricCatalog } = require('../lib/report');
const { fallbackFindings } = require('../lib/report-template');
const { generateFindingsNarrative, buildNarrativePayload, validateNarrative } = require('../lib/narrative');
const { METRIC_DESCRIPTIONS } = require('../lib/metric-descriptions');
const { CONFIG } = require('../lib/config');

function fixtureSummary(overrides) {
  return Object.assign({
    large_commits_pct: '15.00',
    sprawling_commits_pct: '8.00',
    test_coverage_rate: '55.00',
    test_isolation_rate: '5.00',
    uncovered_prod_rate: '5.00',
    avg_lines_changed: '120.00',
    p90_lines_changed: 150,
    p90_files_changed: 5,
    net_additions_ratio_median: 0.2,
    message_quality_pct: '70.00',
    commit_size_trend: 'stable',
    velocity_trend: 'stable',
    velocity_commits_per_day: 3.2
  }, overrides);
}

describe('fallbackFindings (shared deterministic helper)', () => {
  // code-quality-metrics-ponf: the 73V Findings section listed three warnings and nothing
  // else, even though four other tiles on the same page were comfortably healthy -- a reader
  // finished the section believing the repository had only problems. fallbackFindings must
  // report both halves of a mixed run: large_commits_pct is two-band (LARGE_COMMITS_PCT.critical
  // is null -- see lib/thresholds.js), so 40% -- above healthy (18) -- renders as a warning
  // bullet, and every other banded tile in this fixture is healthy, so all of them must appear
  // too, not be truncated away. test_isolation_rate, velocity_commits_per_day, commit_size_trend
  // and velocity_trend (all 'neutral' here) and message_quality_pct/net_additions_ratio_median/
  // avg_lines_changed (always informational, no verdict) must NOT appear: none of them carries a
  // real pass/fail call (see hasVerdict, lib/report.js).
  test('shows both the warning and every healthy banded entry for a mixed run, not warnings only', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const bullets = fallbackFindings(catalog);
    expect(bullets).toEqual([
      'Large commits: 40 (warning)',
      'Sprawling commits: 8 (good)',
      'Uncovered production: 5 (good)',
      'Test/prod co-change: 55 (good)',
      'Commit size, high end: 150 (good)',
      'Files changed, high end: 5 (good)'
    ]);
  });

  // GUARD, not a called-shot RED: proves a genuinely healthy run (no warning at all) reports
  // every healthy tile and no warning bullet, rather than the fair-mix fix accidentally
  // requiring at least one concern to render anything.
  test('shows every healthy banded entry and no warning bullet when nothing is a concern', () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const bullets = fallbackFindings(catalog);
    expect(bullets.some(b => b.includes('(warning)') || b.includes('(critical)'))).toBe(false);
    expect(bullets).toEqual(expect.arrayContaining(['Large commits: 15 (good)']));
  });
});

describe('generateFindingsNarrative: no client (graceful degradation, no API key)', () => {
  test('returns the same bullets as fallbackFindings when client is null', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const result = await generateFindingsNarrative(null, catalog, []);
    expect(result).toEqual(fallbackFindings(catalog));
  });
});

describe('generateFindingsNarrative: client provided', () => {
  function makeClient(responsePayload) {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(responsePayload) }]
    });
    return { messages: { create: mockCreate } };
  }

  // Golden path (test list item a): every number cited below (55, 40) appears in the fixture
  // catalog at that exact precision, so validateNarrative must let this prose through
  // unchanged rather than rejecting it.
  test("returns grouped bullets parsed from Claude's structured JSON response", async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const client = makeClient({
      positive_findings: ['Test coverage sits at 55, comfortably healthy.'],
      concerns: ['Large commits are at 40, which is critical.'],
      recommended_actions: ['Split large commits into smaller reviewable units.']
    });

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual([
      'Positive: Test coverage sits at 55, comfortably healthy.',
      'Concern: Large commits are at 40, which is critical.',
      'Recommended action: Split large commits into smaller reviewable units.'
    ]);
  });

  test('falls back to fallbackFindings and logs a single line, not a stack trace, when the API call throws', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const client = { messages: { create: jest.fn().mockRejectedValue(new Error('rate limited')) } };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual(fallbackFindings(catalog));
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/rate limited/);
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // code-quality-metrics-zuee: the 73V report's Findings section opened with this exact
  // rejection notice, quoting the model's full rejected paragraph, as the first thing a reader
  // saw -- internal consistency-check plumbing rendered as though it were report content. The
  // diagnostic still needs to exist somewhere for debugging, so it moves to console.error
  // (stderr) rather than being dropped outright; only its presence in the rendered bullets is
  // removed.
  test('falls back to plain fallbackFindings with no rejection notice in the rendered bullets, logging the reason to stderr instead, when the narrative fails validation', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const client = makeClient({
      positive_findings: [],
      concerns: ['Large commits sit at 999%, which is critical.'],
      recommended_actions: []
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual(fallbackFindings(catalog));
    expect(result.some(item => /narrative rejected/i.test(item))).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/999/);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // GUARD, not a called-shot RED: written after the try/catch already added
  // for the "API call throws" test above, since that same catch clause also
  // covers a JSON.parse failure. Locks in that malformed responses degrade
  // gracefully rather than crashing report generation.
  test('falls back to fallbackFindings when the response is not valid JSON', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const client = {
      messages: {
        create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json at all' }] })
      }
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual(fallbackFindings(catalog));
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  // GUARD, not a called-shot RED: same reasoning as above; markdown-fence
  // stripping mirrors the established convention in lib/claude.js.
  test("strips markdown code fences from the response before parsing", async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const payload = { positive_findings: [], concerns: ['Large commits are at 40, which is critical.'], recommended_actions: [] };
    const client = makeClient(payload);
    client.messages.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(payload) + '\n```' }]
    });

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual(['Concern: Large commits are at 40, which is critical.']);
  });

  // GUARD, not a called-shot RED: locks in that an empty (all-groups-empty)
  // structured response is treated the same as an error, not as "zero findings".
  test('falls back to fallbackFindings when all three groups are empty', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const client = makeClient({ positive_findings: [], concerns: [], recommended_actions: [] });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual(fallbackFindings(catalog));
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });
});

describe('narrative output budget', () => {
  // code-quality-metrics-ll1 follow-up item 1: measured against a real fresh run (a scratch
  // clone of this repo, current schema, METRIC_DESCRIPTIONS included) with 10 live API calls
  // sending the full catalog-with-descriptions payload plus 10 real top commits: 0/10 responses
  // were truncated at the old 1024 cap, but output usage ranged from 609 to 855 tokens -- up to
  // 83% of that budget already, with no headroom for a more verbose response. A second batch of
  // 8 calls against an older, smaller catalog (no top commits) used 630-766 tokens against the
  // same cap. Neither batch reproduced an actual truncation, but the margin was thin enough that
  // one is plausible under normal response-length variance, consistent with the ticket's report
  // of frequent parse failures. Mirrors the assertion style already used for the comparable
  // AI_DUPLICATE_MAX_OUTPUT_TOKENS budget in __tests__/claudeAnalysis.test.js: the cap only
  // manifests API-side, so there is no local observable for "the response was not cut off" --
  // asserting the request parameter is what is testable.
  test('requests enough output tokens to hold a complete three-group findings response', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ positive_findings: [], concerns: [], recommended_actions: [] }) }]
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await generateFindingsNarrative({ messages: { create } }, catalog, []);

    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(4096);

    logSpy.mockRestore();
  });

  test('reads the output token cap from CONFIG.NARRATIVE_MAX_OUTPUT_TOKENS rather than a second hardcoded literal', async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ positive_findings: [], concerns: [], recommended_actions: [] }) }]
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await generateFindingsNarrative({ messages: { create } }, catalog, []);

    expect(create.mock.calls[0][0].max_tokens).toBe(CONFIG.NARRATIVE_MAX_OUTPUT_TOKENS);

    logSpy.mockRestore();
  });
});

describe('buildNarrativePayload', () => {
  test('strips concern, hasGauge and tier from every entry', () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const payload = buildNarrativePayload(catalog);
    const sprawling = payload.find(entry => entry.key === 'sprawling_commits_pct');

    expect(sprawling.concern).toBeUndefined();
    expect(sprawling.hasGauge).toBeUndefined();
    expect(sprawling.tier).toBeUndefined();
  });

  // GUARD, not a called-shot RED: pins the original measured defect (code-quality-metrics-ll1's
  // raw 0.4108463434675432 reaching the model) rather than relying on the field-stripping test
  // above to catch it incidentally. Since code-quality-metrics-5qn, the rounding rule is two
  // significant figures rather than formatValue's fixed two decimal places (see the next test),
  // but 0.4108463434675432 already has only two significant figures once rounded ("0.41"), so
  // this specific value is green under both rules and the assertion is unchanged.
  test('rounds a long floating-point value down to two significant figures', () => {
    const catalog = buildMetricCatalog(fixtureSummary(), {
      statistics: { percentage: 0.4108463434675432, duplicatedLines: 15, lines: 3651, clones: 1 }
    });
    const payload = buildNarrativePayload(catalog);
    const duplication = payload.find(entry => entry.key === 'duplication_density_pct');

    expect(JSON.stringify(payload)).not.toContain('0.4108463434675432');
    expect(duplication.value).toBe('0.41');
  });

  // CALLED SHOT (code-quality-metrics-5qn, RED 1): a rate this small a sample cannot support two
  // decimal places -- "62.22%" reads as more precise than a 45-commit sample can back up (the
  // issue's own quoted example). formatValue alone (Math.round(value*100)/100) would keep
  // "62.22" unchanged, since it is already at 2 decimal places; this test pins the payload
  // rounding to two SIGNIFICANT figures instead, so a large rate collapses to a whole number
  // while a genuinely small value (see the ratio test below) keeps its meaningful digits.
  // Predicted failure before implementing: toBe('62') fails with Received: "62.22", because
  // buildNarrativePayload currently calls formatValue directly with no further rounding.
  test('rounds a percentage-scale value to two significant figures rather than two decimal places', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ test_coverage_rate: '62.22' }));
    const payload = buildNarrativePayload(catalog);
    const testCoverage = payload.find(entry => entry.key === 'test_coverage_rate');

    expect(testCoverage.value).toBe('62');
  });

  // CALLED SHOT (code-quality-metrics-5qn, RED 2): a p90 line count is itself an interpolated
  // statistic, not a whole line -- "578.5" (a real quoted issue example) implies more precision
  // than the underlying 45-commit sample supports. Two significant figures rounds it to the
  // nearest ten (580) instead of reporting a fractional line. Predicted failure before
  // implementing: toBe('580') fails with Received: "578.5", since formatValue's own rounding
  // (2 decimal places) leaves a value already at 1 decimal place untouched.
  test('rounds a p90 lines-changed value to two significant figures', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ p90_lines_changed: 578.5 }));
    const payload = buildNarrativePayload(catalog);
    const p90Lines = payload.find(entry => entry.key === 'p90_lines_changed');

    expect(p90Lines.value).toBe('580');
  });

  // GUARD: two significant figures must not erase a ratio metric that is naturally below 1 --
  // net_additions_ratio_median's own healthy/critical boundaries (0.63/0.79) are meaningless if
  // rounded to a whole number. 0.2 already has one significant figure short of the rounding
  // point, so this proves the same rule that collapses 62.22 to 62 leaves a small value's
  // information intact rather than always dropping to an integer.
  test('does not collapse a sub-1 ratio value to a whole number', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ net_additions_ratio_median: 0.2 }));
    const payload = buildNarrativePayload(catalog);
    const netAdditions = payload.find(entry => entry.key === 'net_additions_ratio_median');

    expect(netAdditions.value).toBe('0.2');
  });

  // GUARD: a non-numeric value (a trend label, or duplication_lines' composite "15 / 3651"
  // string) must keep passing through unrounded, exactly as before -- two-significant-figure
  // rounding only ever applies to a genuine number.
  test('leaves a non-numeric value untouched by the significant-figure rounding', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ commit_size_trend: 'growing' }));
    const payload = buildNarrativePayload(catalog);
    const trend = payload.find(entry => entry.key === 'commit_size_trend');

    expect(trend.value).toBe('growing');
  });

  test("includes the metric's own explanatory prose from METRIC_DESCRIPTIONS", () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const payload = buildNarrativePayload(catalog);
    const sprawling = payload.find(entry => entry.key === 'sprawling_commits_pct');

    expect(sprawling.description.measures).toBe(METRIC_DESCRIPTIONS.sprawling_commits_pct.measures);
  });

  test('marks an informational entry as carrying no verdict, and leaves a scored entry unmarked', () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const payload = buildNarrativePayload(catalog);
    const messageQuality = payload.find(entry => entry.key === 'message_quality_pct');
    const sprawling = payload.find(entry => entry.key === 'sprawling_commits_pct');

    expect(messageQuality.direction).toBe('informational');
    expect(messageQuality.verdict).toBe('none');
    expect(sprawling.verdict).toBeUndefined();
  });

  // code-quality-metrics-ll1 follow-up item 4: test_isolation_rate (lib/report.js) carries
  // direction: 'special' and status: 'good'/'neutral' -- it can never legitimately be a
  // "Concern" (lib/report.js never assigns it 'warning' or 'critical'), but the marking
  // condition above only checked direction === 'informational', so it fell through unmarked
  // and could still be quoted as a Concern without validateNarrative's informational-label
  // check ever seeing it.
  test("marks a special-direction entry (test_isolation_rate) as carrying no verdict, matching informational", () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const payload = buildNarrativePayload(catalog);
    const testIsolation = payload.find(entry => entry.key === 'test_isolation_rate');

    expect(testIsolation.direction).toBe('special');
    expect(testIsolation.verdict).toBe('none');
  });

  // code-quality-metrics-i39: commit_size_trend and velocity_trend are direction: 'informational'
  // even when lib/report.js's growingAndAccelerating rule has just scored them 'warning' -- a
  // construct whose band was withdrawn on evidence (message_quality_pct, net_additions_ratio_median,
  // avg_lines_changed -- always status 'neutral') is a different thing from a composite rule that
  // reached a real status this run. Measured on 5 real repository runs, marking verdict from
  // direction alone rejected the toolkit's own named drift signal in 4 of 5. The verdict mark must
  // key on the entry's own status instead: 'warning'/'critical' leaves it unmarked (presentable),
  // whatever its direction, while an entry whose status never leaves 'neutral' stays marked
  // verdict: 'none' exactly as before.
  test('keys the verdict mark on status, not direction: commit_size_trend and velocity_trend at warning status carry no verdict mark', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ commit_size_trend: 'growing', velocity_trend: 'accelerating' }));
    const payload = buildNarrativePayload(catalog);
    const commitSizeTrend = payload.find(entry => entry.key === 'commit_size_trend');
    const velocityTrend = payload.find(entry => entry.key === 'velocity_trend');

    expect(commitSizeTrend.status).toBe('warning');
    expect(commitSizeTrend.verdict).toBeUndefined();
    expect(velocityTrend.status).toBe('warning');
    expect(velocityTrend.verdict).toBeUndefined();
  });

  // GUARD, not a called-shot RED: same status-keyed rule, checked from the other side -- an
  // entry whose construct cannot support a verdict at all (message_quality_pct: status is fixed
  // 'neutral' regardless of value, see lib/report.js) must stay marked verdict: 'none' even
  // though it shares direction: 'informational' with commit_size_trend/velocity_trend above.
  test('still marks message_quality_pct verdict: none, since its status never leaves neutral', () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const payload = buildNarrativePayload(catalog);
    const messageQuality = payload.find(entry => entry.key === 'message_quality_pct');

    expect(messageQuality.status).toBe('neutral');
    expect(messageQuality.verdict).toBe('none');
  });
});

describe('validateNarrative', () => {
  // This is the measured defect from code-quality-metrics-ll1: the report generated against
  // flight-info-spike claimed "well below the healthy boundary of 6%" when the catalog's real
  // healthyBoundary for duplication_density_pct was 2 -- 6 appeared nowhere in the data. This
  // fixture reproduces that exact shape (real healthyBoundary 2, prose claiming 6) rather than
  // an arbitrary mismatch.
  test('rejects a bullet citing a healthy boundary the payload does not hold', () => {
    const payload = [{
      key: 'duplication_density_pct',
      label: 'Duplication density',
      value: '0.41',
      direction: 'higher-is-worse',
      status: 'good',
      healthyBoundary: '2',
      criticalBoundary: '2.5'
    }];
    const bullets = ['Positive: Duplication density is 0.41%, well below the healthy boundary of 6%.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/6/);
  });

  // GUARD, not a called-shot RED: validateNarrative already exists from the cycle above; this
  // pins a second measured defect (the concern sentinel, -11.178307313064913, quoted as if it
  // were a reader-facing score) rather than exercising new production code. concern is no
  // longer in the payload at all (buildNarrativePayload strips it), so any concern-shaped
  // number the model still cites necessarily fails the same "not in payload" check as test g.
  // Mutation-proven: reverting validateNarrative's number check to `return { valid: true,
  // reason: null }` (as in the prior cycle's manual check) makes this fail the same way.
  test('rejects a bullet citing a concern score, an internal sentinel absent from the payload', () => {
    const payload = [{
      key: 'duplication_density_pct',
      label: 'Duplication density',
      value: '0.41',
      direction: 'higher-is-worse',
      status: 'good',
      healthyBoundary: '2',
      criticalBoundary: '2.5'
    }];
    const bullets = ['Positive: Duplication density is 0.41%, with a concern score of -11.178307313064913.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/-11\.178307313064913/);
  });

  // GUARD, not a called-shot RED: pins the third measured defect (message_quality_pct, an
  // informational entry, restored to a verdict under "Concern"). The bullet below cites only
  // the number 20, which IS present in the payload (value: '20') -- deliberately, so this
  // fails (if it fails) only via the informational-as-Concern check, never via the number
  // check test g/h already cover. An earlier draft of this test used "1 in 5 commits" phrasing
  // and passed even with the informational check fully disabled, caught instead by the number
  // check on the stray "1" and "5" -- exactly the vacuous-green trap the ticket warns about.
  // Verified by mutation: with the informationalLabels block removed, this fails with
  // "Expected: false, Received: true" while the number-check tests above still pass.
  test('rejects a Concern bullet naming a metric the payload marked verdict: none', () => {
    const payload = [{
      key: 'message_quality_pct',
      label: 'Message quality',
      value: '20',
      direction: 'informational',
      status: 'neutral',
      healthyBoundary: null,
      criticalBoundary: null,
      verdict: 'none'
    }];
    const bullets = ['Concern: Message quality stands at 20%, which this tool does not score.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/message quality/i);
  });

  // Found running a real scratchpad repro against flight-info-spike (code-quality-metrics-ll1's
  // "verify the defect yourself" step), not from the test list: duplication_lines' value is a
  // composite string ("15 / 3651", built from statistics.duplicatedLines/lines in lib/report.js),
  // not a bare numeral. A model correctly citing either embedded number was being rejected as
  // fabricated. Real production output: 'Positive: Duplication density stands at 0.41%, ... with
  // only 1 clone block and 15 duplicated lines across 3651 scanned ...' -> rejected with
  // 'cites "15", which does not appear in the metric catalog or top-commit payload'.
  test('accepts a number embedded in a composite string value, not only a whole-string numeral', () => {
    const payload = [{
      key: 'duplication_lines',
      label: 'Duplicated lines',
      value: '15 / 3651',
      direction: 'informational',
      status: 'neutral',
      healthyBoundary: null,
      criticalBoundary: null,
      verdict: 'none'
    }];
    const bullets = ['Positive: 15 duplicated lines were found across 3651 scanned lines.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // code-quality-metrics-ll1 follow-up item 3: the original fabrication report's third claim
  // was that the model wrote "a test_first_indicator of true" -- a field name that was real at
  // report-generation time but had since been renamed to test_prod_cochange_commit (see the
  // issue's own CORRECTION note). The number check can never catch this class of defect,
  // because a snake_case identifier is not a number; it needs its own check. entry.key values
  // are internal identifiers a reader has no use for -- entry.label is what a reader should see
  // -- so any bullet quoting one verbatim is always wrong, independent of whether the digits (if
  // any) elsewhere in the same bullet are correct.
  test("rejects a bullet that quotes a payload entry's internal key verbatim instead of its label", () => {
    const payload = [{
      key: 'test_prod_cochange_commit',
      label: 'Test coverage',
      value: '55',
      direction: 'higher-is-better',
      status: 'good',
      healthyBoundary: '23',
      criticalBoundary: null
    }];
    const bullets = ['Positive: The report shows a test_prod_cochange_commit of true, indicating healthy co-change practice.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/test_prod_cochange_commit/);
  });

  // GUARD, not a called-shot RED: proves the check fires on the metric's own key, not on any
  // snake_case-looking substring a bullet happens to contain -- an unrelated key from a
  // different entry must not cause a false rejection.
  test('does not reject a bullet that mentions no internal key at all, only labels and numbers', () => {
    const payload = [{
      key: 'test_prod_cochange_commit',
      label: 'Test coverage',
      value: '55',
      direction: 'higher-is-better',
      status: 'good',
      healthyBoundary: '23',
      criticalBoundary: null
    }];
    const bullets = ['Positive: Test coverage sits at 55, comfortably above the healthy boundary of 23.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // code-quality-metrics-ll1 follow-up item 2: the original report's second claim was a real
  // value (18) mislabeled as a "healthy boundary" when 18 was p90_files_changed's own value and
  // 8 was its actual healthy boundary. A presence-only check passes this, because 18 genuinely
  // appears in the payload -- just not in the role the model claimed. This checks the role a
  // number is given: when a bullet names a specific metric (by label) and attributes a number to
  // that metric's "healthy boundary", the number must match THAT metric's own healthyBoundary
  // field, not merely appear anywhere in the payload (e.g. as the same metric's value, or
  // another metric's boundary).
  test("rejects a bullet that cites a metric's own value as though it were its healthy boundary", () => {
    const payload = [{
      key: 'p90_files_changed',
      label: 'Files changed, p90',
      value: '18',
      direction: 'higher-is-worse',
      status: 'warning',
      healthyBoundary: '8',
      criticalBoundary: null
    }];
    const bullets = ['Concern: Files changed, p90 sits at 18, above the healthy boundary of 18.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/18/);
  });

  // GUARD, not a called-shot RED: proves the check does not fire when the cited boundary
  // matches the correct field for the named metric -- a bullet correctly quoting its own
  // healthyBoundary must still pass, even though the metric's value (18) is a different number
  // present elsewhere in the same payload.
  test('does not reject a bullet that correctly cites its own healthy boundary', () => {
    const payload = [{
      key: 'p90_files_changed',
      label: 'Files changed, p90',
      value: '18',
      direction: 'higher-is-worse',
      status: 'warning',
      healthyBoundary: '8',
      criticalBoundary: null
    }];
    const bullets = ['Concern: Files changed, p90 sits at 18, above the healthy boundary of 8.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // Found running generate-drift-report.js against a fresh scratch clone of this repo (ll1's
  // own "verify by running" step, after implementing the item-2 check above), not from a
  // written test list: real production output was 'Positive: Commit size at the 90th
  // percentile is 164.9 lines, below the healthy boundary of 260, so even the routinely large
  // commits stay within a readable range.' -- a correct citation of p90_lines_changed's real
  // healthyBoundary (260). The label-match step picked "Large commits" as the sole candidate,
  // because that label's text happens to appear later in the sentence as ordinary English (the
  // routinely large commits), not as a reference to the large_commits_pct metric, and then
  // compared 260 against Large commits' own healthyBoundary (19) instead -- a false rejection of
  // correct prose. p90_lines_changed's own label ("Commit size, p90") never literally appears in
  // the bullet at all (the model paraphrased it), so no entry actually names itself before the
  // phrase; the fix is to only credit a label match that appears BEFORE the boundary phrase it
  // is being checked against, mirroring how the phrase is normally written (name the metric,
  // then state its boundary), rather than anywhere in the bullet.
  test('does not attribute a boundary phrase to a metric whose label only appears after the phrase, as incidental English rather than a citation', () => {
    const payload = [
      { key: 'p90_lines_changed', label: 'Commit size, p90', value: '164.9', direction: 'higher-is-worse', status: 'good', healthyBoundary: '260', criticalBoundary: null },
      { key: 'large_commits_pct', label: 'Large commits', value: '15', direction: 'higher-is-worse', status: 'good', healthyBoundary: '19', criticalBoundary: '30' }
    ];
    const bullets = ['Positive: Commit size at the 90th percentile is 164.9 lines, below the healthy boundary of 260, so even the routinely large commits stay within a readable range.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // code-quality-metrics-6gu: found running generate-drift-report.js against a fresh scratch
  // clone of this repo (code-quality-metrics-ll1's "verify by running" step). Real generated
  // bullet: 'Concern: Duplication density is 6.27%, above the healthy boundary of 2%, with 924
  // duplicated lines out of 14740 scanned and 24 separate clone blocks identified across the
  // codebase.' This correctly names duplication_density_pct (a real scored metric) as the
  // bullet's subject and states its real healthy boundary. The informational-label check
  // rejected it anyway because duplication_lines' label "Duplicated lines" appears later in the
  // same sentence as supporting detail ("924 duplicated lines"), and the check only tested
  // whether an informational label appeared ANYWHERE in a Concern bullet, never whether the
  // bullet was actually about it. The fix: skip the informational check entirely for a bullet
  // that also names a real (verdict-bearing) scored metric by label -- a bullet naming a scored
  // metric is about that metric, and an informational label found elsewhere in it is supporting
  // detail, not the bullet's subject.
  test('does not reject a Concern bullet naming a real scored metric, when an informational label appears later only as supporting detail', () => {
    const payload = [
      { key: 'duplication_density_pct', label: 'Duplication density', value: '6.27', direction: 'higher-is-worse', status: 'critical', healthyBoundary: '2', criticalBoundary: '6.5' },
      { key: 'duplication_lines', label: 'Duplicated lines', value: '924 / 14740', direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' },
      { key: 'duplication_clones', label: 'Clone count', value: 24, direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' }
    ];
    const bullets = ['Concern: Duplication density is 6.27%, above the healthy boundary of 2%, with 924 duplicated lines out of 14740 scanned and 24 separate clone blocks identified across the codebase.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // code-quality-metrics-zuee: measured against a real 73V run. Real rejected bullet: 'Concern:
  // Copy-pasted code has accumulated to 4.1% of scanned production lines - 655 duplicated lines
  // across 19 separate blocks out of 16,106 scanned - which sits above the benchmark's upper
  // boundary of 1.5% ...'. This correctly cites duplication_density_pct's own value (4.1) and
  // healthy boundary (1.5) -- it is genuinely about that scored metric -- but never uses its
  // label "Duplication density" anywhere in the sentence, so the scoredLabels text-match above
  // finds no match, and duplication_lines' own label ("Duplicated lines") matches instead as
  // supporting detail ("655 duplicated lines"), producing a false rejection. Unlike the 6gu case
  // above, naming the scored label is not the only way a bullet can prove it is about a scored
  // metric: citing that metric's own value AND healthy/critical boundary together is at least as
  // strong evidence, and is exactly what the model actually did here.
  test('does not reject a Concern bullet that cites a scored metric\'s own value and healthy boundary, even when its label never appears and an unrelated informational label does', () => {
    const payload = [
      { key: 'duplication_density_pct', label: 'Duplication density', value: '4.1', direction: 'higher-is-worse', status: 'warning', healthyBoundary: '1.5', criticalBoundary: null },
      { key: 'duplication_lines', label: 'Duplicated lines', value: '655 / 16106', direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' },
      { key: 'duplication_clones', label: 'Clone count', value: 19, direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' },
      { key: 'duplication_semantic_findings', label: 'Semantic duplicates', value: 6, direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' }
    ];
    const bullets = ["Concern: Copy-pasted code has accumulated to 4.1% of scanned production lines - 655 duplicated lines across 19 separate blocks out of 16106 scanned - which sits above the benchmark's upper boundary of 1.5% and signals architectural debt that tends to compound if not refactored; the 6 semantic duplicates suggest the duplication has already spread beyond text-identical repetition."];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // code-quality-metrics-38h: found in the same session. Real generated bullet: '...with 924
  // duplicated lines out of 14,803 scanned...'. The payload's duplication_lines value is the
  // composite string "924 / 14803" (no thousands separator). NUMBER_PATTERN requires a digit run
  // bordered by non-word characters on both sides, so "14,803" tokenizes as two separate numbers,
  // "14" and "803", neither of which appears standalone in the payload -- the correctly-cited
  // figure is rejected as fabricated because of formatting, not content. Uses "Positive:" rather
  // than "Concern:" to isolate the number-matching defect from the informational-label check
  // above (mirrors the existing composite-string-value test's structure).
  test('canonicalizes a thousands-separator comma before comparing a cited number against the payload', () => {
    const payload = [{
      key: 'duplication_lines',
      label: 'Duplicated lines',
      value: '924 / 14803',
      direction: 'informational',
      status: 'neutral',
      healthyBoundary: null,
      criticalBoundary: null,
      verdict: 'none'
    }];
    const bullets = ['Positive: 924 duplicated lines were found across 14,803 scanned lines.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // code-quality-metrics-i39: measured against real flight-info-spike and dotnetdependencytracer
  // runs, both rejected with 'presents "velocity" as a Concern'. velocity_commits_per_day (label
  // "Velocity") never carries a verdict -- it is a raw rate with no calibrated band, like
  // message_quality_pct. velocity_trend (label "Velocity trend") is a different entry that CAN
  // be scored 'warning' (lib/report.js's growingAndAccelerating rule) once the prior cycle's
  // status-keyed verdict mark is in place. "Velocity" is a strict text prefix of "Velocity
  // trend", so a bullet that names the scored entry using the bare word "velocity" (without
  // "trend") -- natural, since a model is not required to echo the label back verbatim --
  // matches the informational entry's own label by substring and gets rejected as though it
  // named the wrong metric, even though it is correctly reporting the composite entry's real
  // warning status.
  test('accepts a Concern bullet about velocity_trend written as bare "velocity", even though a separate always-informational entry shares that word as its whole label', () => {
    const payload = [
      { key: 'velocity_trend', label: 'Velocity trend', value: 'accelerating', direction: 'informational', status: 'warning', healthyBoundary: null, criticalBoundary: null },
      { key: 'velocity_commits_per_day', label: 'Velocity', value: '3.2', direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' }
    ];
    const bullets = ['Concern: Velocity is accelerating while commit size stays flat, compounding review pressure.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // GUARD, not a called-shot RED: the substring-exclusion above only fires while velocity_trend
  // is actually scored (verdict !== 'none'). When it is not -- both entries stay informational,
  // as in most runs -- a Concern bullet naming "velocity" is still correctly rejected. Proves the
  // fix narrows the check rather than disabling it: mutating the exclusion's `.some(...)` guard
  // to always-true (as if velocity_trend were unconditionally exempt) would make this test pass
  // when it should fail, so this is what pins the "only when currently scored" half of the rule.
  test('still rejects a Concern bullet naming bare "velocity" when velocity_trend is not currently scored either', () => {
    const payload = [
      { key: 'velocity_trend', label: 'Velocity trend', value: 'stable', direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' },
      { key: 'velocity_commits_per_day', label: 'Velocity', value: '3.2', direction: 'informational', status: 'neutral', healthyBoundary: null, criticalBoundary: null, verdict: 'none' }
    ];
    const bullets = ['Concern: Velocity is unusually high this period.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/velocity/i);
  });

  // code-quality-metrics-i39, shape 2: measured against a real daloopa run, rejected with
  // 'cites a healthy boundary of 260 for "Commit size trend", but the payload's healthyBoundary
  // for that metric is absent'. commit_size_trend has no boundary of any kind (it is a
  // composite-rule status, not a threshold), but its label is the only one that literally
  // precedes the boundary phrase -- the model paraphrased p90_lines_changed as "p90 lines
  // changed" rather than echoing its exact label "Commit size, p90". The role check credited
  // commit_size_trend as the phrase's sole subject purely because its label happened to appear
  // first, without asking whether commit_size_trend could ever legitimately own a healthy
  // boundary at all. 260 is p90_lines_changed's real healthyBoundary and genuinely appears in
  // the payload, so the correct behavior is to accept this bullet.
  test('does not attribute a healthy-boundary phrase to a preceding metric that has no healthy boundary of its own, when the true subject is only paraphrased', () => {
    const payload = [
      { key: 'commit_size_trend', label: 'Commit size trend', value: 'growing', direction: 'informational', status: 'warning', healthyBoundary: null, criticalBoundary: null },
      { key: 'p90_lines_changed', label: 'Commit size, p90', value: '578.5', direction: 'higher-is-worse', status: 'critical', healthyBoundary: '260', criticalBoundary: null }
    ];
    const bullets = ['Concern: Commit size trend is growing, and p90 lines changed sits at 578.5, above the healthy boundary of 260.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // Also a called-shot RED, not a guard: before the fix, BOTH labels precede the phrase here (the
  // case above has only one), so the pre-fix check finds 2 candidates, treats that as ambiguous,
  // and skips -- letting 578.5 (p90_lines_changed's own value) slide through uncaught as though it
  // were that metric's healthy boundary (really 260). Filtering by boundary existence removes
  // commit_size_trend (no healthy boundary to be eligible with) from the candidate pool, leaving
  // exactly one -- p90_lines_changed -- so the check newly becomes able to catch this
  // misattribution instead of treating it as unresolvable ambiguity. Predicted and verified RED
  // against the pre-fix code: Expected: false, Received: true.
  test('still rejects a metric\'s own value cited as its healthy boundary, even when a second, boundary-less metric also precedes the phrase', () => {
    const payload = [
      { key: 'commit_size_trend', label: 'Commit size trend', value: 'growing', direction: 'informational', status: 'warning', healthyBoundary: null, criticalBoundary: null },
      { key: 'p90_lines_changed', label: 'Commit size, p90', value: '578.5', direction: 'higher-is-worse', status: 'critical', healthyBoundary: '260', criticalBoundary: null }
    ];
    const bullets = ['Concern: Commit size trend is growing, and commit size, p90 sits at 578.5, above the healthy boundary of 578.5.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/578\.5/);
  });

  // GUARD, not a called-shot RED: code-quality-metrics-i39's third measured shape-1 rejection was
  // a real remote_retro run, rejected with 'presents "test isolation" as a Concern'.
  // test_isolation_rate (direction: 'special') is scored 'good' or 'neutral' only -- lib/report.js
  // never assigns it 'warning' or 'critical', so unlike commit_size_trend/velocity_trend it can
  // never legitimately be presented as a Concern, whatever its value. Unlike the "velocity"
  // collision, "test isolation" is not a substring of any other payload label, so this was
  // already a correct rejection before this ticket's fixes and remains one after: the acceptance
  // criteria's "still rejected" half, for the third metric the ticket names alongside
  // commit_size_trend and velocity_trend.
  test('still rejects a Concern bullet naming test_isolation_rate, which can never reach warning/critical status', () => {
    const payload = [{
      key: 'test_isolation_rate',
      label: 'Test isolation',
      value: '0',
      direction: 'special',
      status: 'neutral',
      healthyBoundary: '10',
      criticalBoundary: null,
      verdict: 'none'
    }];
    const bullets = ['Concern: Test isolation sits at 0%, meaning no commits show a red-then-green test pattern.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/test isolation/i);
  });

  // CALLED SHOT (code-quality-metrics-top7, RED 1): measured on a real five-repo
  // regeneration on 2026-08-19, 73V's narrative was rejected with 'cites "500", which does
  // not appear in the metric catalog or top-commit payload'. '500 errors' names an HTTP
  // status code, not a metric measurement -- nothing was fabricated, and 500 has no reason
  // to appear anywhere in an (here, deliberately empty) payload. Predicted failure before
  // implementing: expect(result.valid).toBe(true) fails with Received: false, since the
  // presence check currently treats every numeral as a claimed citation and 500 is absent
  // from the empty payload/topCommits.
  test('accepts a Concern bullet whose only number is an HTTP status code, not a metric citation (73V false positive)', () => {
    const bullets = ['Concern: The largest commit, 8722054b, touches the authentication and user-management code where a missing IAM policy was causing 500 errors, elevating review risk for that change.'];

    const result = validateNarrative(bullets, [], []);

    expect(result.valid).toBe(true);
  });

  // CALLED SHOT (code-quality-metrics-top7, RED 2): measured on the same regeneration,
  // dotnetdependencytracer was rejected with 'cites "300", which does not appear in the
  // metric catalog or top-commit payload'. 300 is a ceiling the recommendation itself
  // proposes ("exceeds roughly 300 lines"), not a report of an existing catalog figure --
  // the two numbers the same bullet DOES cite as measurements, p90 580 and healthy boundary
  // 260, are both real and must still be checked (this fixture would also fail today if
  // either were wrong, since only the exemption for 300 is new). Predicted failure before
  // implementing: expect(result.valid).toBe(true) fails with Received: false, reason
  // matching cites "300", which does not appear in the metric catalog or top-commit
  // payload.
  test('accepts a Recommended action bullet proposing a new ceiling alongside two correctly-cited catalog numbers (dotnetdependencytracer false positive)', () => {
    const payload = [{
      key: 'p90_lines_changed',
      label: 'Commit size, p90',
      value: '580',
      direction: 'higher-is-worse',
      status: 'critical',
      healthyBoundary: '260',
      criticalBoundary: null
    }];
    const bullets = ['Recommended action: Pausing when a branch exceeds roughly 300 lines of net change would bring the p90 of 580 closer to the healthy boundary of 260.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(true);
  });

  // REGRESSION GUARD (code-quality-metrics-top7): the same five-repo regeneration produced
  // two rejections that were CORRECT and must stay rejected, so a fix aimed at the two false
  // positives above cannot be tuned by loosening this check in general. daloopa presented
  // "commit size trend" as a Concern even though the metric layer marked it informational
  // (status neutral, no verdict) this run -- not a called-shot RED, since neither exemption
  // added above touches the informational-label check this exercises; confirmed still green
  // after both fixes.
  test('still rejects a Concern bullet presenting commit size trend as a Concern when it carries no verdict (daloopa correct rejection)', () => {
    const payload = [{
      key: 'commit_size_trend',
      label: 'Commit size trend',
      value: 'stable',
      direction: 'informational',
      status: 'neutral',
      healthyBoundary: null,
      criticalBoundary: null,
      verdict: 'none'
    }];
    const bullets = ['Concern: Commit size trend is worth watching as the team continues shipping AI-assisted changes.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/commit size trend/i);
  });

  // REGRESSION GUARD (code-quality-metrics-top7): flight-info-spike's correct rejection,
  // held alongside daloopa's above. It presented "velocity" as a Concern and went further,
  // claiming "a combination the tool flags as a drift risk" -- a verdict the tool does not
  // actually raise (velocity_commits_per_day is always informational). No number appears in
  // this bullet at all, so neither presence-check exemption added above is even reached; the
  // rejection still comes from the informational-label check alone.
  test('still rejects a Concern bullet presenting velocity, and a claimed drift risk the tool does not flag, as a Concern (flight-info-spike correct rejection)', () => {
    const payload = [{
      key: 'velocity_commits_per_day',
      label: 'Velocity',
      value: '3.2',
      direction: 'informational',
      status: 'neutral',
      healthyBoundary: null,
      criticalBoundary: null,
      verdict: 'none'
    }];
    const bullets = ['Concern: Velocity is elevated alongside growing commit size, a combination the tool flags as a drift risk.'];

    const result = validateNarrative(bullets, payload, []);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/velocity/i);
  });
});
