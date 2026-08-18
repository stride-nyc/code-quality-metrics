'use strict';

const { buildMetricCatalog } = require('../lib/report');
const { fallbackFindings } = require('../lib/report-template');
const { generateFindingsNarrative, buildNarrativePayload, validateNarrative } = require('../lib/narrative');
const { METRIC_DESCRIPTIONS } = require('../lib/metric-descriptions');

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
  test('is exported from lib/report-template and returns templated bullets for critical/warning entries', () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const bullets = fallbackFindings(catalog);
    expect(bullets).toEqual(['Large commits: 40 (critical)']);
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

  test("returns grouped bullets parsed from Claude's structured JSON response", async () => {
    const catalog = buildMetricCatalog(fixtureSummary({ large_commits_pct: '40.00' }));
    const client = makeClient({
      positive_findings: ['Test coverage sits at 55.00, comfortably healthy.'],
      concerns: ['Large commits are at 40, which is critical.'],
      recommended_actions: ['Split large commits into smaller reviewable units.']
    });

    const result = await generateFindingsNarrative(client, catalog, []);

    expect(result).toEqual([
      'Positive: Test coverage sits at 55.00, comfortably healthy.',
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

describe('buildNarrativePayload', () => {
  test('strips concern, hasGauge and tier from every entry', () => {
    const catalog = buildMetricCatalog(fixtureSummary());
    const payload = buildNarrativePayload(catalog);
    const sprawling = payload.find(entry => entry.key === 'sprawling_commits_pct');

    expect(sprawling.concern).toBeUndefined();
    expect(sprawling.hasGauge).toBeUndefined();
    expect(sprawling.tier).toBeUndefined();
  });

  // GUARD, not a called-shot RED: the rounding this asserts was already added in the
  // previous cycle's implementation (formatValue is applied to value/healthyBoundary/
  // criticalBoundary in the same edit that stripped concern/hasGauge/tier), so this test
  // was green on arrival. Kept as its own case, separate from the field-stripping test
  // above, because it pins the specific measured defect (code-quality-metrics-ll1's
  // 0.4108463434675432) rather than relying on the other test to cover it incidentally.
  test('rounds a long floating-point value the same way the report cards do', () => {
    const catalog = buildMetricCatalog(fixtureSummary(), {
      statistics: { percentage: 0.4108463434675432, duplicatedLines: 15, lines: 3651, clones: 1 }
    });
    const payload = buildNarrativePayload(catalog);
    const duplication = payload.find(entry => entry.key === 'duplication_density_pct');

    expect(JSON.stringify(payload)).not.toContain('0.4108463434675432');
    expect(duplication.value).toBe('0.41');
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
});
