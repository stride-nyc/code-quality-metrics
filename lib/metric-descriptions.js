// @ts-nocheck
'use strict';

// Plain-language description of what each metric catalog entry measures and
// how it connects to DORA's AI-amplifying capabilities. Sourced from
// metrics-specification.md: the "measures" text paraphrases that file's
// "What it measures" line for the corresponding Metric N section, and the
// "dora" text paraphrases either that section's explicit "DORA connection"
// line, its "Risk signal" note, or (when a metric has no dedicated DORA
// connection line of its own) the DORA Capability Coverage Map at the top
// of the file. If metrics-specification.md's wording changes materially,
// update this file to match; it is meant to stay traceable to that
// document, not to drift into its own independent copy.
const METRIC_DESCRIPTIONS = {
  large_commits_pct: {
    measures: 'The share of commits exceeding a line-change threshold, used as a proxy for wholesale AI code acceptance (Metric 1).',
    dora: 'DORA capability #5, Working in Small Batches: staying under this threshold is what that capability means in practice.'
  },
  sprawling_commits_pct: {
    measures: 'The share of commits touching more files than the threshold, a proxy for shotgun problem-solving where AI-suggested fixes ripple through unrelated components (Metric 2).',
    dora: "DORA's research documents a 154% increase in pull request size with high AI adoption; sprawling commits are the commit-level precursor to oversized PRs."
  },
  uncovered_prod_rate: {
    measures: 'Large commits that touch only production files, no tests at all, the clearest AI drift signal in this toolkit: accepting a large AI-generated code block without writing any tests (Metric 3).',
    dora: 'DORA identifies automated testing as the single strongest predictor of whether AI tools help or hurt a team.'
  },
  message_quality_pct: {
    measures: 'The share of commit messages meeting a minimum quality bar (conventional format, or specific enough by word count); quality tends to decline with AI over-reliance as vague AI-suggested descriptions get accepted (Metric 8).',
    dora: 'DORA capability #4, Strong Version Control Practices, lists message quality score explicitly as one of its measurable signals.'
  },
  test_coverage_rate: {
    measures: 'Commits that include both test and production files together, the healthy pairing in the three-way test classification (Metric 3).',
    dora: 'DORA identifies automated testing as the single strongest predictor of whether AI tools help or hurt a team.'
  },
  net_additions_ratio_median: {
    measures: "The median share of a commit's churn that is net-new code rather than balanced editing; a high ratio means code is being added without commensurate refactoring or removal (Metric 7).",
    dora: 'The systematic batch-acceptance pattern DORA associates with architectural debt accumulation.'
  },
  avg_lines_changed: {
    measures: "The mean commit size in lines, kept alongside the fuller size distribution for backwards compatibility; an average alone conceals the 'mostly disciplined with occasional explosions' pattern the distribution reveals (Metric 4).",
    dora: 'Feeds DORA capability #5, Working in Small Batches.'
  },
  p90_lines_changed: {
    measures: 'The 90th percentile commit size in lines: how large the biggest routine commits get, distinct from rare outliers (Metric 4).',
    dora: "DORA capability #5, Working in Small Batches; paired with an accelerating velocity trend this is DORA's 'volume without discipline' signal."
  },
  p90_files_changed: {
    measures: 'The 90th percentile number of files touched per commit, complementing the sprawling-commit percentage by showing the shape of the distribution, not just the share above threshold (Metric 5).',
    dora: 'DORA capability #5, Working in Small Batches.'
  },
  test_isolation_rate: {
    measures: 'Commits that touch only test files: a positive signal, TDD red-phase work or deliberate test improvements, which the older binary test-first metric incorrectly classified as bad (Metric 3).',
    dora: 'DORA identifies automated testing as the single strongest predictor of whether AI tools help or hurt a team.'
  },
  velocity_commits_per_day: {
    measures: 'How quickly commits are being produced. Velocity alone is neutral; it only becomes a signal combined with the commit size trend (Metric 6).',
    dora: 'DORA capability #4, Strong Version Control Practices, lists commit velocity explicitly as one of its measurable signals.'
  },
  commit_size_trend: {
    measures: 'Whether commit sizes are growing, stable, or shrinking over the analysis window, fit by linear regression against commit order (Metric 4).',
    dora: "Growing commit size combined with accelerating velocity is DORA's 'volume without discipline' signal, the leading indicator of drift toward the foundational-challenges archetype."
  },
  velocity_trend: {
    measures: 'Whether the rate of commits is accelerating, stable, or decelerating, comparing the first and second half of the analysis window (Metric 6).',
    dora: "DORA capability #4, Strong Version Control Practices; combined with a growing commit-size trend this is DORA's 'volume without discipline' signal."
  },
  duplication_density_pct: {
    measures: 'The share of scanned production lines jscpd flags as duplicated (Layer 1, static detection), a proxy for AI-generated code being pasted rather than reused or refactored.',
    dora: "Feeds DORA capability #5, Working in Small Batches, and the broader architectural-debt signal DORA associates with unrefactored, systematically batch-accepted code."
  },
  duplication_lines: {
    measures: 'The absolute count of duplicated lines out of the total lines jscpd scanned, giving the density percentage above concrete scale.',
    dora: 'Same architectural-debt signal as duplication density, expressed as raw counts rather than a percentage.'
  },
  duplication_clones: {
    measures: 'The number of distinct duplicate code blocks jscpd found (Layer 1, static detection), independent of how many lines each one spans.',
    dora: 'Same architectural-debt signal as duplication density; clone count shows how spread out the duplication is, not just how large.'
  },
  duplication_semantic_findings: {
    measures: 'Duplicate logic Claude identifies (Layer 2, semantic detection) that static line-matching misses, such as the same behavior implemented with different variable names or structure. Reports "Not measured" rather than 0 when this layer never ran (no ANTHROPIC_API_KEY set), since a missing measurement is not the same thing as a real zero-findings result.',
    dora: 'Extends the same architectural-debt signal past what static detection alone can see.'
  }
};

module.exports = { METRIC_DESCRIPTIONS };
