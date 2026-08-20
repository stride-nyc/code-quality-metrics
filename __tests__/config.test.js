'use strict';

const { CONFIG } = require('../lib/config');

describe('CONFIG duplicate detection defaults', () => {
  // Raised from 5/50 to 10/100 (code-quality-metrics-k1g): matches SonarQube's default
  // gate minimum (100 tokens over 10 lines) instead of half of it in both dimensions.
  test('CONFIG.DUPLICATE_MIN_LINES defaults to 10', () => {
    expect(CONFIG.DUPLICATE_MIN_LINES).toBe(10);
  });

  test('CONFIG.DUPLICATE_MIN_TOKENS defaults to 100', () => {
    expect(CONFIG.DUPLICATE_MIN_TOKENS).toBe(100);
  });

  test('CONFIG.DUPLICATE_IGNORE_PATTERNS is an array', () => {
    expect(Array.isArray(CONFIG.DUPLICATE_IGNORE_PATTERNS)).toBe(true);
  });

  // DUPLICATE_SCAN_PATHS removed (code-quality-metrics-ksv): documented and shape-tested
  // but never read by lib/duplicate.js, local-code-metrics.js, or pr-metrics.yml. Both
  // callers already pass an explicit changed-file list to jscpd rather than asking it to
  // scan a tree, so there was no real semantics for it to implement without inventing an
  // unrequested feature; removed rather than wired up to something no caller needed.

  test('CONFIG.AI_DUPLICATE_MAX_FILES defaults to 40', () => {
    expect(CONFIG.AI_DUPLICATE_MAX_FILES).toBe(40);
  });

  // code-quality-metrics-wcj: '**/designs/**' was a fact about one target repo
  // (stride-nyc/flight-info-spike) sitting in defaults shared by every consumer.
  // It moves to that repo's own .codemetrics.json (see lib/repoConfig.js and
  // AGENTS.md's "Per-Repo Configuration Overrides" section for the mechanism),
  // not into this shared file.
  test('CONFIG.DUPLICATE_IGNORE_PATTERNS no longer carries the flight-info-spike-specific **/designs/** pattern', () => {
    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).not.toContain('**/designs/**');
  });

  // code-quality-metrics-w3wn: local-code-metrics.js now writes its own output into a
  // .codemetrics/ directory inside the analyzed repository. Without this entry, a second run
  // would hand jscpd local_commit_metrics.json (an array of per-commit records sharing one
  // schema -- exactly the shape a clone detector reads as duplication) and
  // local_drift_report.html (a large generated file) as if they were the codebase's own code,
  // whenever that directory is ever committed.
  test("CONFIG.DUPLICATE_IGNORE_PATTERNS excludes the tool's own .codemetrics/ output directory", () => {
    expect(CONFIG.DUPLICATE_IGNORE_PATTERNS).toContain('**/.codemetrics/**');
  });
});

// code-quality-metrics-3yd: the direct fix for code-quality-metrics-y8j. Nothing today lets a
// path count as neither test nor production; ANALYSIS_IGNORE_PATTERNS is the mechanism.
// DEFAULT WAS EMPTY, and still is except for one entry: seeding it with the vendored/generated
// patterns already in DUPLICATE_IGNORE_PATTERNS would change every existing measurement,
// including the 34 calibration observations __tests__/thresholdProvenance.test.js gates
// against CONFIG (that gate's METRIC_AFFECTING_CONFIG_KEYS does not even include this key,
// precisely because nothing was ever recorded against it before this change). The one seeded
// entry, '**/.codemetrics/**' (code-quality-metrics-w3wn), is a deliberate, narrow exception:
// this tool only began writing that directory with this change, so no repository's history
// could contain it, and the entry is provably retroactively inert -- it changes zero historical
// measurement, the same guarantee the empty default provided. See CLAUDE.md's Configuration
// section for the full reasoning.
describe('CONFIG analysis-exclusion defaults', () => {
  test("CONFIG.ANALYSIS_IGNORE_PATTERNS defaults to excluding only the tool's own .codemetrics/ output directory", () => {
    expect(CONFIG.ANALYSIS_IGNORE_PATTERNS).toEqual(['**/.codemetrics/**']);
  });

  test('CONFIG.AI_DUPLICATE_MAX_FILES defaults to 40', () => {
    expect(CONFIG.AI_DUPLICATE_MAX_FILES).toBe(40);
  });
});
