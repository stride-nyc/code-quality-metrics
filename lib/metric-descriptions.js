// @ts-nocheck
'use strict';

// What each tile means, written for someone reading the report who does not
// have metrics-specification.md open beside them.
//
// These are deliberately plain. They avoid section numbers, capability numbers,
// internal layer names, and implementation history, all of which were present
// here before and told the reader nothing they could act on. metrics-specification.md
// remains the authority on how each metric is computed; this file is the
// explanation, not the definition. Keep both in step when a metric's meaning
// changes, but do not reintroduce cross references a reader cannot follow.
//
// Failure modes belong where the failure is shown, not here. The report itself
// says why a value reads "Not measured"; see renderDuplicateSection in
// lib/report-template.js.
const METRIC_DESCRIPTIONS = {
  large_commits_pct: {
    measures: 'How often a commit is big enough that nobody realistically read it line by line. Large commits are the clearest sign of code accepted wholesale rather than reviewed.',
    dora: 'Working in small batches is one of the practices DORA ties most directly to healthy delivery.'
  },
  sprawling_commits_pct: {
    measures: 'How often a single commit touches a lot of files at once. A change that ripples through unrelated files usually means it was applied by pattern rather than understood.',
    dora: 'DORA measured a 7.2% increase in delivery instability for every 25% increase in AI adoption, and its 2025 report finds instability persists even as throughput improves. Sprawl is one commit-level mechanism that could produce that; DORA does not measure files per commit itself.'
  },
  uncovered_prod_rate: {
    measures: 'Large changes to production code that shipped without touching a single test. This is the strongest drift signal in the report.',
    dora: 'Automated testing is not one of the seven capabilities in DORA\'s AI model, so this metric rests on general engineering practice rather than a DORA finding. The DORA capabilities this toolkit can observe are strong version control and working in small batches.'
  },
  message_quality_pct: {
    measures: 'How many commit messages actually say what changed. Vague messages pile up when suggested text is accepted without editing it.',
    dora: 'One of the version control signals DORA tracks.'
  },
  test_coverage_rate: {
    measures: 'Commits that changed tests and production code together, which is what healthy work usually looks like.',
    dora: 'Automated testing is not one of the seven capabilities in DORA\'s AI model, so this metric rests on general engineering practice rather than a DORA finding. The DORA capabilities this toolkit can observe are strong version control and working in small batches.'
  },
  net_additions_ratio_median: {
    measures: 'Of everything a typical commit changes, how much is brand new code rather than edited or deleted code. Consistently high means the codebase only ever grows.',
    dora: 'Adding steadily without refactoring is how architectural debt builds up.'
  },
  avg_lines_changed: {
    measures: 'The average commit size. Useful for scale, though an average hides the common pattern of mostly small commits with occasional huge ones. The percentile below shows that better.',
    dora: 'Feeds the same small batches picture.'
  },
  p90_lines_changed: {
    measures: 'Nine out of ten commits are smaller than this. It shows how big the routinely large commits get, without one freak commit distorting it.',
    dora: 'DORA names working in small batches as one of seven capabilities that amplify the benefits of AI adoption. Rising p90 alongside faster commits is this toolkit\'s own inference, not a DORA finding.'
  },
  p90_files_changed: {
    measures: 'Nine out of ten commits touch fewer files than this. Shows the shape of the spread, not just how many crossed the line.',
    dora: 'Small batches.'
  },
  test_isolation_rate: {
    measures: 'Commits that changed only tests. This is a good sign: writing a failing test first, or going back to improve coverage.',
    dora: 'Automated testing is not one of the seven capabilities in DORA\'s AI model, so this metric rests on general engineering practice rather than a DORA finding. The DORA capabilities this toolkit can observe are strong version control and working in small batches.'
  },
  velocity_commits_per_day: {
    measures: 'How many commits land per day. On its own this says nothing; it only matters next to whether commits are getting bigger.',
    dora: 'One of the version control signals DORA tracks.'
  },
  commit_size_trend: {
    measures: 'Whether commits have been getting bigger or smaller over the period measured.',
    dora: 'Commits growing while landing faster is this toolkit\'s own drift hypothesis. DORA does not measure commit size from git history, so this is an inference from its small batches capability rather than a DORA result.'
  },
  velocity_trend: {
    measures: 'Whether commits are landing faster or slower, comparing the first half of the period against the second.',
    dora: 'Speeding up while commits also grow is this toolkit\'s own drift hypothesis, inferred from DORA\'s small batches capability rather than measured by DORA.'
  },
  duplication_density_pct: {
    measures: 'The share of scanned production code that is copy pasted. Text identical blocks only.',
    dora: 'Duplication that never gets refactored is how architectural debt accumulates.'
  },
  duplication_lines: {
    measures: 'The same duplication as a raw count instead of a percentage, so the scale is visible.',
    dora: 'Same signal as duplication density, in absolute terms.'
  },
  duplication_clones: {
    measures: 'How many separate duplicated blocks were found, whatever their size. Shows whether duplication is concentrated in a few places or spread thin across many.',
    dora: 'Same signal as duplication density; this shows how widely it is spread.'
  },
  duplication_semantic_findings: {
    measures: 'Files that do the same thing in different words. The tiles above match text, so they miss logic that was rebuilt with different names or structure; this finds that. Each finding names the two files and why they resemble each other.',
    dora: 'Catches architectural debt that text matching alone cannot see.'
  }
};

module.exports = { METRIC_DESCRIPTIONS };
