'use strict';

const { buildMetricCatalog } = require('../lib/report');
const { fallbackFindings } = require('../lib/report-template');
const { generateFindingsNarrative, buildNarrativePayload } = require('../lib/narrative');

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
});
