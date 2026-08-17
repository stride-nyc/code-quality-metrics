'use strict';

const { METRIC_DESCRIPTIONS } = require('../lib/metric-descriptions');
const { buildMetricCatalog } = require('../lib/report');

function fixtureSummary() {
  return {
    large_commits_pct: '15.00',
    sprawling_commits_pct: '8.00',
    test_coverage_rate: '55.00',
    test_isolation_rate: '5.00',
    uncovered_prod_rate: '5.00',
    avg_lines_changed: '120.00',
    p90_lines_changed: 150,
    p90_files_changed: 5,
    commit_size_trend: 'stable',
    velocity_commits_per_day: 3.2,
    velocity_trend: 'stable',
    net_additions_ratio_median: 0.2,
    message_quality_pct: '70.00'
  };
}

describe('METRIC_DESCRIPTIONS', () => {
  it('has a measures and dora entry for every key buildMetricCatalog produces', () => {
    const catalog = buildMetricCatalog(fixtureSummary());

    for (const entry of catalog) {
      const description = METRIC_DESCRIPTIONS[entry.key];
      expect(description).toBeDefined();
      expect(typeof description.measures).toBe('string');
      expect(description.measures.length).toBeGreaterThan(0);
      expect(typeof description.dora).toBe('string');
      expect(description.dora.length).toBeGreaterThan(0);
    }
  });
});
