# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This toolkit detects **AI code drift** — problematic patterns that emerge when teams adopt AI coding tools. It captures metrics *before* merge squashing destroys the signals, making visible how AI tools actually affect code quality.

Key insight: Local analysis reveals 10x higher drift rates than remote analysis because `git merge --squash` and branch deletion destroy granular commit-level signals.

## Running the Tools

```bash
# Analyze the local repository (outputs JSON files + console report)
node local-code-metrics.js

# Manually trigger GitHub Actions workflows
gh workflow run code-metrics.yml
gh workflow run pr-metrics.yml
```

No build, install, or lint steps — the script has no npm dependencies and runs with Node.js v12+.

## Architecture

Three components, no shared code between them:

1. **`local-code-metrics.js`** — Standalone Node.js script. Reads local git history via shell commands, classifies files as test vs. production, computes metrics, writes `local_commit_metrics.json` + `local_metrics_summary.json`, and prints a console report with insights.

2. **`.github/workflows/code-metrics.yml`** — Weekly GitHub Actions workflow. Uses the GitHub API to analyze feature branches from the past 30 days. Outputs a JSON artifact and creates a GitHub issue with the summary.

3. **`.github/workflows/pr-metrics.yml`** — Per-PR GitHub Actions workflow. Posts a detailed comment on each PR with commit-by-commit analysis, test adequacy, and development pattern detection.

## Key Metrics and Thresholds

| Metric | Healthy Threshold |
|--------|------------------|
| Large commit % (>100 prod lines) | <20% |
| Sprawling commit % (>5 files) | <10% |
| Test-to-production ratio | 0.5–2.0:1 |
| Avg files changed per commit | <5 |

## Configuration

Thresholds are configured in the `CONFIG` object at the top of `local-code-metrics.js`. The GitHub workflows have equivalent values hard-coded in their shell/jq logic. When adjusting thresholds, update both places.

Test file detection uses patterns for JS, Python, Go, Java, and C# — extend `TEST_FILE_PATTERNS` in the script or the equivalent grep patterns in the workflows for other languages.

## Workflow Permissions

The GitHub workflows require:
- `contents: read`
- `issues: write` (code-metrics.yml)
- `pull-requests: write` (pr-metrics.yml)
