# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This toolkit detects **AI code drift**: problematic patterns that emerge when teams adopt AI coding tools. It captures metrics *before* merge squashing destroys the signals, making visible how AI tools actually affect code quality.

Key insight: Local analysis reveals 10x higher drift rates than remote analysis because `git merge --squash` and branch deletion destroy granular commit-level signals.

## Running the Tools

```bash
# Analyze the local repository (outputs JSON files + console report)
node local-code-metrics.js

# Manually trigger GitHub Actions workflows
gh workflow run code-metrics.yml
gh workflow run pr-metrics.yml
```

## Testing and Linting

```bash
npm test                 # run all tests
npm run test:coverage    # tests with coverage report (thresholds: 80% lines, 90% functions)
npm run test:watch       # watch mode
npx jest __tests__/parseGitLog.test.js   # run a single test file
npm run lint             # ESLint (flat config, globals.node required; already configured)
npm run typecheck        # tsc --noEmit (checks local-code-metrics.js via @ts-check + tsconfig.json)
```

All tests mock `child_process` and `fs`. No git repository is required to run the suite.

A pre-commit hook runs lint, typecheck, and test automatically. After cloning, activate it with:

```bash
npm install   # triggers `prepare`, which sets core.hooksPath to .githooks
```

## Architecture

Three public components sharing pure-computation logic via `lib/`:

1. **`local-code-metrics.js`**: Standalone Node.js script (requires Node ≥18). Orchestration entry point that delegates to focused modules in `lib/`. Reads local git history via shell commands, classifies files as test vs. production, computes metrics, writes `local_commit_metrics.json` + `local_metrics_summary.json` + (optionally) `local_claude_analysis.json`, and prints a console report with insights.

   The `lib/` directory contains the internal modules:
   - `lib/config.js` — CONFIG object; detector and analysis settings (large/sprawling commit cutoffs, message-quality word count, AI pre-filter and duplicate-detector tuning, test-file patterns), the single source of truth for those settings (**shared with workflows**)
   - `lib/thresholds.js` — THRESHOLDS object; the calibrated healthy/critical verdict bands each metric is scored against, the single source of truth for those bands (**shared with workflows**)
   - `lib/statistics.js` — statistical distributions (p50/p90/p95/stddev), velocity and trend (**shared with workflows**)
   - `lib/metrics.js` — message quality scoring, DORA archetype classification, test file detection, insights generation (**shared with workflows**)
   - `lib/git.js` — git shell commands, log parsing, per-commit analysis, diff extraction (local only — workflows use REST API)
   - `lib/claude.js` — Anthropic client setup, commit pre-filtering, diff-level API analysis (local only — workflows use GitHub-managed auth)

2. **`.github/workflows/code-metrics.yml`**: Weekly GitHub Actions workflow. Uses the GitHub API to analyze feature branches from the past 30 days. Requires `lib/config.js`, `lib/statistics.js`, `lib/metrics.js`, and `lib/thresholds.js` via `require()`. Outputs a JSON artifact and creates a GitHub issue with the summary.

3. **`.github/workflows/pr-metrics.yml`**: Per-PR GitHub Actions workflow. Requires `lib/config.js`, `lib/thresholds.js`, `lib/metrics.js`, `lib/duplicate.js`, and `lib/claude.js` via `require()`. Posts a detailed comment on each PR with commit-by-commit analysis, test adequacy, development pattern detection, and two-layer duplicate code detection (Layer 1 jscpd always-on; Layer 2 semantic via Claude when `ANTHROPIC_API_KEY` is set).

## Key Metrics and Thresholds

Bands are quantiles of a six-repository benchmark (nodejs/node, emberjs/ember.js, git/git,
postgres/postgres, django/django, curl/curl), derived by `calibration/derive-bands.js` from
`calibration/observations.json` — the same published-method framing Alves, Ypma and Visser use
in "Deriving Metric Thresholds from Benchmark Data" (ICSM 2010, DOI 10.1109/ICSM.2010.5609747).
**"Healthy" below means "at or below the 75th percentile of this benchmark," not "validated
against a quality outcome."** No cited source publishes a boundary number for any of these
metrics: DORA scores batch size from self-reported ordinal survey answers and never converts
them to a line count, and GitClear reports trends and prevalence rather than a healthy line.
Values below are current as of `node calibration/derive-bands.js --era current`; a metric marked
two-band has no critical bound because its extreme rests on a single reference repository with
no second repository corroborating it within 15% (`lib/report.js`'s `statusForTwoBand`
enforces this at runtime — never reads a `null` critical bound as zero).

| Metric | Healthy | Critical | Tier |
|--------|---------|----------|------|
| Large commit % (>100 prod lines) | ≤19% | >30% | three-band |
| Sprawling commit % (>5 files) | ≤18% | >20% | three-band |
| Test coverage rate (test+prod co-occurrence) | ≥23% | — | two-band |
| Uncovered prod rate | ≤13% | — | two-band |
| Commit message quality % | — | — | informational |
| Avg lines changed | — | — | informational |
| p90 lines changed | ≤260 | — | two-band |
| p90 files changed | ≤8 | — | two-band |
| Net additions ratio (median) | — | — | informational |
| Duplication density % | ≤2% | — | two-band |

Three rows read informational because their bands were withdrawn on evidence, not because
they are unmeasured: each value is still computed and reported, with no verdict attached.
Message quality was found to measure Conventional Commits adoption rather than informativeness.
Net additions ratio used a churn denominator the source literature discards. Avg lines changed
has no finite mean to band: three independent published fits put commit size on a heavy-tailed
distribution, and a generalized Pareto with shape above 1 has no finite mean at all. Seven
metrics carry a band; three of those have a critical bound.

Statistical distributions (p50/p90/p95/stddev) are computed for lines changed and files changed. Commit velocity trend and a practice archetype are included in the summary.

Two bands have corroboration from outside this project's own six repositories, as a *position*
rather than a *boundary*: p90 lines changed (260) against Kolassa, Riehle & Salim's published p90
of 261 LoC/commit over 8.7M commits (SOFSEM 2013), and p90 files changed (8) against Sadowski et
al.'s ~90% of Google changes touching fewer than 10 files (ICSE-SEIP 2018) and Alali et al.'s gcc
p90 of ~8 files (ICPC 2008). Thirteen reservations qualify every band, three of them high
severity, including that a fitted, multi-feature just-in-time defect model already fails to
transfer across projects (down to 0.38 AUC, worse than random — Kamei et al., EMSE 2016), which
bears directly on how far an unfitted scalar band like these can be carried to a project unlike
the six references. See `calibration/README.md` and the Threshold Provenance section of
`metrics-specification.md` for the full derivation rule, the external anchors, and all thirteen
reservations. Do not cite these numbers as validated outcome thresholds.

### DORA Archetype Classification

The summary includes a `dora_archetype` field classifying the repository into one of four archetypes. **The names are borrowed from DORA, the method is not.** DORA derives seven archetypes from cluster analysis of survey responses covering burnout, friction and delivery instability; this derives four from commit shape. `classifyDoraArchetype` (`lib/metrics.js`) reads its boundaries directly from the calibrated bands in `lib/thresholds.js` rather than a separate hand-copied set, so every boundary value it compares against (large-commit healthy and critical, sprawling-commit healthy and critical, test-coverage healthy, uncovered-prod healthy) traces to the same calibration as the Key Metrics table above, and the function holds no hardcoded numeric literal at all. Only the *grouping* of those signals into four named archetypes is this toolkit's own invention; DORA does not publish this grouping, and message-quality no longer plays any part in it (its own band was demoted to informational — see below). Do not read the field as a DORA classification.

It classifies the repository based on large commit %, sprawling commit %, test coverage rate, and uncovered prod rate, evaluated in this order:

| Archetype | Signal |
|-----------|--------|
| `harmonious-high-achiever` | large commits below `LARGE_COMMITS_PCT.healthy` AND sprawling commits below `SPRAWLING_COMMITS_PCT.healthy` AND test coverage above `TEST_COVERAGE_RATE.healthy` AND uncovered prod below `UNCOVERED_PROD_RATE.healthy` (currently ≤19%, ≤18%, ≥23%, ≤13%) |
| `legacy-bottleneck` | sprawling commits above `SPRAWLING_COMMITS_PCT.critical` AND large commits above `LARGE_COMMITS_PCT.critical` (currently >20%, >30%) |
| `foundational-challenges` | large commits above `LARGE_COMMITS_PCT.critical` (currently >30%) alone — `uncovered_prod_rate` has no critical bound to add a second path |
| `mixed-signals` | none of the above |

### Claude API Integration (Optional)

Set `ANTHROPIC_API_KEY` to enable diff-level analysis of high-risk commits. When active:
- Up to 5 commits are selected (large commits with additions > deletions × 3)
- Each commit is analyzed for AI-generated code patterns and architectural concerns
- Results are written to `local_claude_analysis.json`
- Commit metrics are annotated with `ai_confidence`, `risk_score`, `patterns`, and `architectural_concerns`

The script degrades gracefully when the key is absent. No SDK install is required to run.

## Configuration

Two files hold configuration, each the single source of truth for a different kind of value, both shared across all three components. `CONFIG` in `lib/config.js` holds detector and analysis settings: what counts as a large or sprawling commit, the message-quality word count, the AI pre-filter and duplicate-detector tuning, and test-file patterns. `THRESHOLDS` in `lib/thresholds.js` holds the calibrated healthy/critical verdict bands described in Key Metrics and Thresholds above. Both GitHub Actions workflows `require('./lib/config')` and `require('./lib/thresholds')` directly, so a change to either file propagates automatically to the local script and both workflows with no manual synchronization — but the workflows do not surface a target for every band `THRESHOLDS` holds. Between them, `code-metrics.yml` and `pr-metrics.yml` display a target for large-commit %, sprawling-commit %, test-coverage rate, test-isolation rate, and uncovered-prod rate; `avg_lines_changed`, `p90_lines_changed`, `p90_files_changed`, and `duplication_pct` are computed and included in the summary JSON but shown without a target in either workflow. Key `CONFIG` values:

| Key | Default | Description |
|-----|---------|-------------|
| `LARGE_COMMIT_THRESHOLD` | 100 | Prod lines changed to flag as large |
| `SPRAWLING_COMMIT_THRESHOLD` | 5 | Files changed to flag as sprawling |
| `MESSAGE_QUALITY_MIN_WORDS` | 10 | Word count threshold for non-conventional messages |
| `AI_ANALYSIS_MAX_COMMITS` | 5 | Max commits sent to Claude per run |
| `AI_DIFF_MAX_CHARS` | 4000 | Diff truncation limit for Claude API calls |
| `AI_RISK_ADDITIONS_RATIO` | 3 | Additions/deletions multiplier for Claude pre-filter |
| `DUPLICATE_MIN_LINES` | 10 | Minimum lines for jscpd to flag a duplicate block |
| `DUPLICATE_MIN_TOKENS` | 100 | Minimum tokens for jscpd to flag a duplicate block |
| `DUPLICATE_IGNORE_PATTERNS` | `[]` | Glob patterns for jscpd to ignore (e.g. generated files) |

Test file detection uses patterns for JS, Python, Go, Java, and C#. Extend `TEST_FILE_PATTERNS` in `lib/config.js` — the change propagates automatically to all three components.

### Duplicate Detection Tuning

The defaults (`DUPLICATE_MIN_LINES: 10`, `DUPLICATE_MIN_TOKENS: 100`) match what SonarQube uses for its own duplicated-lines gate, so the measured percentage is comparable to the roughly 3 to 23 percent range published across clone studies with stated methods. They were previously 5 and 50, half of Sonar's minimum in both dimensions; Wagner et al. measured the same three systems at both settings and found roughly a threefold difference, so position in that published range depends more on detector settings than on the codebase. Raising them lost the one alignment this toolkit had with a primary source, since 5 lines matched GitClear's definition of a duplicate block. The trade is deliberate: GitClear's floor is for detecting a clone, Sonar's is for calling one a quality problem, and this toolkit reports a rate rather than a clone list.

The examples below predate the change and one is now moot: the Java row recommends exactly the new global default. Other languages may still need higher values to suppress boilerplate:

```js
// Java — longer method signatures and boilerplate
DUPLICATE_MIN_LINES: 10,
DUPLICATE_MIN_TOKENS: 100,
DUPLICATE_IGNORE_PATTERNS: ['**/*Test.java', '**/generated/**'],

// Python — decorators and docstrings inflate token counts
DUPLICATE_MIN_LINES: 8,
DUPLICATE_MIN_TOKENS: 80,
DUPLICATE_IGNORE_PATTERNS: ['**/migrations/**', '**/__pycache__/**'],

// Go — interface implementations repeat predictably
DUPLICATE_MIN_LINES: 8,
DUPLICATE_MIN_TOKENS: 75,
DUPLICATE_IGNORE_PATTERNS: ['**/*_test.go', '**/vendor/**'],
```

## Workflow Permissions

The GitHub workflows require:
- `contents: read`
- `issues: write` (code-metrics.yml)
- `pull-requests: write` (pr-metrics.yml)
