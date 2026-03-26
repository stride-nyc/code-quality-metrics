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

Three public components with no shared code between them:

1. **`local-code-metrics.js`**: Standalone Node.js script (requires Node ≥18). Orchestration entry point that delegates to focused modules in `lib/`. Reads local git history via shell commands, classifies files as test vs. production, computes metrics, writes `local_commit_metrics.json` + `local_metrics_summary.json` + (optionally) `local_claude_analysis.json`, and prints a console report with insights.

   The `lib/` directory contains the internal modules (not shared with workflows):
   - `lib/config.js` — CONFIG object; single source of truth for all thresholds
   - `lib/git.js` — git shell commands, log parsing, per-commit analysis, diff extraction
   - `lib/statistics.js` — statistical distributions (p50/p90/p95/stddev), velocity and trend
   - `lib/metrics.js` — message quality scoring, DORA archetype classification, insights generation
   - `lib/claude.js` — Anthropic client setup, commit pre-filtering, diff-level API analysis

2. **`.github/workflows/code-metrics.yml`**: Weekly GitHub Actions workflow. Uses the GitHub API to analyze feature branches from the past 30 days. Outputs a JSON artifact and creates a GitHub issue with the summary.

3. **`.github/workflows/pr-metrics.yml`**: Per-PR GitHub Actions workflow. Posts a detailed comment on each PR with commit-by-commit analysis, test adequacy, and development pattern detection.

## Key Metrics and Thresholds

| Metric | Healthy Threshold |
|--------|------------------|
| Large commit % (>100 prod lines) | <20% |
| Sprawling commit % (>5 files) | <10% |
| Test-to-production ratio | 0.5–2.0:1 |
| Avg files changed per commit | <5 |
| Commit message quality % | >60% |
| Additions-to-deletions ratio (median) | <3.0 |

Statistical distributions (p50/p90/p95/stddev) are computed for lines changed and files changed. Commit velocity trend and DORA team archetype are included in the summary.

### DORA Archetype Classification

The summary includes a `dora_archetype` field classifying the repository into one of four team archetypes based on large commit %, sprawling commit %, test-first %, and message quality %:

| Archetype | Signal |
|-----------|--------|
| `harmonious-high-achiever` | All four metrics in healthy range |
| `legacy-bottleneck` | High sprawl (>25%) + high large commits (>30%) |
| `foundational-challenges` | Large commits >40%, or low test discipline + elevated large commits |
| `mixed-signals` | No clear archetype threshold breached |

### Claude API Integration (Optional)

Set `ANTHROPIC_API_KEY` to enable diff-level analysis of high-risk commits. When active:
- Up to 5 commits are selected (large commits with additions > deletions × 3)
- Each commit is analyzed for AI-generated code patterns and architectural concerns
- Results are written to `local_claude_analysis.json`
- Commit metrics are annotated with `ai_confidence`, `risk_score`, `patterns`, and `architectural_concerns`

The script degrades gracefully when the key is absent. No SDK install is required to run.

## Configuration

Thresholds are configured in the `CONFIG` object in `lib/config.js`, which is the single source of truth for the local script. Key values:

| Key | Default | Description |
|-----|---------|-------------|
| `LARGE_COMMIT_THRESHOLD` | 100 | Prod lines changed to flag as large |
| `SPRAWLING_COMMIT_THRESHOLD` | 5 | Files changed to flag as sprawling |
| `MESSAGE_QUALITY_MIN_WORDS` | 10 | Word count threshold for non-conventional messages |
| `AI_ANALYSIS_MAX_COMMITS` | 5 | Max commits sent to Claude per run |
| `AI_DIFF_MAX_CHARS` | 4000 | Diff truncation limit for Claude API calls |
| `AI_RISK_ADDITIONS_RATIO` | 3 | Additions/deletions multiplier for Claude pre-filter |

The GitHub workflows have equivalent values hard-coded in their shell/jq logic. When adjusting thresholds, update both places.

Test file detection uses patterns for JS, Python, Go, Java, and C#. Extend `TEST_FILE_PATTERNS` in `lib/config.js` or the equivalent grep patterns in the workflows for other languages.

## Workflow Permissions

The GitHub workflows require:
- `contents: read`
- `issues: write` (code-metrics.yml)
- `pull-requests: write` (pr-metrics.yml)
