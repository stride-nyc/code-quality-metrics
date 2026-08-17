# AI Code Drift Detection Toolkit

A comprehensive set of tools to detect and prevent problematic AI-assisted development patterns. Includes GitHub Actions workflows and local analysis scripts to monitor code quality before merge squashing destroys the signals.

## Overview

Research shows that AI coding tools can lead to increased batch sizes, reduced refactoring, and code quality issues that offset productivity gains. This toolkit helps teams monitor development patterns that may indicate "AI code drift."

**Key insight:** Standard Git workflows (merge squashing + branch deletion) hide the granular development patterns needed to detect AI code drift. These tools capture development behavior **before** it gets sanitized.

## Tools Included

### 1. Weekly AI Code Drift Metrics (GitHub Actions)
- **File:** `.github/workflows/code-metrics.yml`
- **Purpose:** Automated weekly analysis of feature branches
- **Output:** GitHub issues with trend analysis and artifacts

### 2. Real-time PR Size Analysis (GitHub Actions)
- **File:** `.github/workflows/pr-metrics.yml`
- **Purpose:** Immediate feedback on every pull request
- **Output:** PR comments with size warnings and recommendations

### 3. Local Repository Analysis (Node.js Script)
- **File:** `local-code-metrics.js`
- **Purpose:** Immediate analysis of your local development patterns
- **Output:** Console report and JSON files with detailed metrics
- **Requires:** Node.js >= 18
- **Works with:** feature-branch workflows and trunk-based workflows. Repos with no feature branches fall back to analyzing the default branch directly instead of returning an empty report.

### 4. Drift Report Generator (Node.js Script)
- **File:** `generate-drift-report.js`
- **Purpose:** Render a standalone HTML report from a completed local analysis run
- **Output:** `local_drift_report.html`
- **Requires:** `local_metrics_summary.json` and `local_commit_metrics.json` already present in the target directory (produced by `local-code-metrics.js`, see [Drift Report](#drift-report))

## Quick Start

### Option 1: GitHub Actions (Recommended)

**Step 1 — Copy the workflow files and shared lib modules into your repository**
```bash
mkdir -p .github/workflows lib
curl -o .github/workflows/code-metrics.yml \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/.github/workflows/code-metrics.yml
curl -o .github/workflows/pr-metrics.yml \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/.github/workflows/pr-metrics.yml
curl -o lib/config.js \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/lib/config.js
curl -o lib/statistics.js \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/lib/statistics.js
curl -o lib/metrics.js \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/lib/metrics.js
```

> The workflows use `require('./lib/config')`, `require('./lib/statistics')`, and `require('./lib/metrics')` at runtime. These three files must be committed alongside the workflow files.

**Step 2 — Create the required issue labels** (used by the weekly report)
```bash
gh label create metrics --color 0075ca --description "Code metrics reports"
gh label create automated --color e4e669 --description "Automated workflow output"
```

**Step 3 — Ensure feature branches are not auto-deleted**

Go to your repo **Settings → General → Pull Requests** and uncheck  
"Automatically delete head branches" — the weekly workflow needs branches to exist to analyze them.

**Step 4 — Set workflow permissions**

Go to **Settings → Actions → General → Workflow permissions** and select  
"Read and write permissions" (required for creating issues and PR comments).

**Step 5 — Trigger the first run**
```bash
gh workflow run code-metrics.yml
gh run watch   # follow the run live
```

The PR analysis workflow (`pr-metrics.yml`) triggers automatically on every new or updated pull request — no manual step needed.

### Option 2: Local Analysis
```bash
# 1. Clone and run
npm install
node local-code-metrics.js

# 2. Review the generated JSON files and console output
# Optional: set ANTHROPIC_API_KEY for Claude diff analysis
```

Override the analysis window per run with `--days` or `--since` (no config edit needed):
```bash
node local-code-metrics.js --days 90          # look back 90 days instead of the CONFIG default (30)
node local-code-metrics.js --since 2026-04-01 # use an explicit boundary date instead of a day count
```

Repos with no feature branches (trunk-based repos, or a merge-without-delete
workflow where everything effectively lives on `main`) are analyzed
automatically: the script resolves the default branch (`main` or `master`,
falling back to `HEAD` if neither is found), analyzes it directly, and
labels the run `workflow_type: 'trunk'` in `local_metrics_summary.json`
instead of returning an empty report.

## Key Metrics Tracked

| Metric | Target | Purpose |
|--------|--------|---------|
| **Large Commit %** | <20% | Detects batch AI code acceptance |
| **Sprawling Commit %** | <10% | Identifies scattered changes across files |
| **Test-First Discipline** | >50% | Monitors TDD practices with AI tools |
| **Message Quality %** | >60% | Conventional commits or descriptive messages |
| **Net Additions Ratio (median)** | <0.50 | Flags batch-acceptance pattern (bounded 0–1: 1.0 = entirely net-new code) |
| **Avg Files Changed** | <5 | Measures development granularity |

## Real-World Example

**Remote Repository Analysis (misleading):**
- 4 commits over 30 days
- 0% large commits
- 8 lines average per commit

**Local Repository Analysis (reality):**
- 50 commits across 4 feature branches
- **46% large commits**
- **9,053 lines average per commit**
- Clear AI drift patterns hidden by merge squashing

## Trunk vs. Feature-Branch Analysis

The local script auto-detects which mode applies to your repo and records it
as `workflow_type` in `local_metrics_summary.json`:

| `workflow_type` | When it applies | `branches_analyzed` |
|---|---|---|
| `feature_branch` | At least one branch other than `main`/`master` exists, local or remote | The feature branches found |
| `trunk` | No feature branches exist | The resolved default branch (`main`, `master`, or `HEAD` if neither is found) |

Branch discovery uses `git branch -a`, so feature branches that exist only on
the remote (never checked out locally) are included, deduplicated against
local branches of the same name.

**Known limitation:** branch discovery only checks whether a branch *exists*,
not whether it has been fully merged. A repo using a merge-without-delete
workflow, where a branch's PR merged into `main` long ago but the branch ref
was never deleted, is still classified as `feature_branch`, even though that
branch contributes no commits beyond what is already on `main`. If your repo
has stale, fully-merged branches lying around, drop the local
remote-tracking ref with `git branch -dr <remote>/<branch>` (reversible with
`git fetch`) before running the script for an accurate `workflow_type`.

## Drift Report

Once `node local-code-metrics.js` has written `local_metrics_summary.json` and
`local_commit_metrics.json` into a directory, turn that run into a standalone
HTML report:

```bash
npm run report                        # reads/writes in the current directory
node generate-drift-report.js [dir]   # or target a specific directory directly
```

This writes `local_drift_report.html` into that directory. The generator does
not run git or recompute any metric itself; it only reads the two JSON files
a prior `local-code-metrics.js` run already produced, and exits with a clear
error naming whichever file is missing if either one is absent.

Every number and gauge in the report (large commits, sprawling commits, test
coverage, message quality, net-new ratio, and the rest) is deterministic,
computed from the same healthy/critical boundaries defined once in
`lib/thresholds.js` and shared with the console report's classification
logic. The one optional, LLM-assisted part of the report is the connecting
prose in the Findings section: when `ANTHROPIC_API_KEY` is set, Claude is
asked to write short paragraphs of positive findings, concerns, and
recommended actions over the already-computed metrics and top commits, never
to compute or alter a number. Without the key, or if the API call fails or
returns something unusable, the Findings section falls back to plain
templated bullets built from the metric catalog, degrading gracefully exactly
like the rest of this tool already does without `ANTHROPIC_API_KEY`.

The report embeds its own fonts (Big Shoulders Display, Public Sans, and IBM
Plex Mono) as base64 data so the resulting HTML file is fully standalone and
viewable offline. Those fonts are vendored under `assets/fonts/` and licensed
under the SIL Open Font License, Version 1.1; see `assets/fonts/ATTRIBUTION.md`
for the full attribution.

## Configuration

### Test File Detection
Customize test file patterns for your language:

```javascript
// In workflows or local script CONFIG
TEST_FILE_PATTERNS: [
  /\.(test|spec)\./i,              // JavaScript/TypeScript
  /Tests?\.cs$/i,                  // C# (FileTests.cs)
  /Test\.java$/i,                  // Java (FileTest.java)
  /_test\.py$/i,                   // Python (file_test.py)
  /_test\.go$/i,                   // Go (file_test.go)
  /__tests__/i,                    // Jest directory
  /\/tests?\//i                    // General test directories
]
```

### Thresholds
Adjust warning thresholds based on your team:

```javascript
LARGE_COMMIT_THRESHOLD: 100,       // lines changed
SPRAWLING_COMMIT_THRESHOLD: 5,     // files changed
ANALYSIS_DAYS: 30,                 // lookback window
MESSAGE_QUALITY_MIN_WORDS: 10,     // words for non-conventional messages
AI_RISK_ADDITIONS_RATIO: 3,        // additions/deletions multiplier for Claude pre-filter
AI_ANALYSIS_MAX_COMMITS: 5,        // max commits sent to Claude per run
```

## Understanding Results

### Healthy Patterns
```
Large commits: <20%
Sprawling commits: <10%
Test-first discipline: >50%
Message quality: >60%
Net additions ratio (median): <0.33
```

### Warning Signs
```
Large commits: 20-40%
Sprawling commits: 10-25%
Test-first discipline: 30-50%
Net additions ratio (median): 0.33-0.50
```

### Critical Issues
```
Large commits: >40%
Sprawling commits: >25%
Test-first discipline: <30%
Net additions ratio (median): >0.50
```

## DORA Archetype Classification

The summary includes a `dora_archetype` field:

| Archetype | Signal |
|-----------|--------|
| `harmonious-high-achiever` | All metrics in healthy range |
| `legacy-bottleneck` | High sprawl + high large commits |
| `foundational-challenges` | Large commits >40% or low test discipline |
| `mixed-signals` | No clear threshold breached |

## Workflow Outputs

### Weekly Metrics Report (GitHub Issue)
```markdown
## AI Code Drift Metrics Report

**Analysis Period:** Last 30 days
**Commits Analyzed:** 42 (from 45 total)
**Branches Analyzed:** feature/new-api, bugfix/memory-leak

### Key Metrics
| Metric | Value | Target | Status |
|--------|-------|--------|---------|
| Large Commits | 28% | <20% | Warning |
| Sprawling Commits | 12% | <10% | Warning |
| Test-First Discipline | 64% | >50% | OK |

### Interpretation
**Large commits above 20% threshold** - Consider breaking down AI-generated code
**Sprawling commits above 10% threshold** - Review AI suggestions for scope creep
```

### PR Size Analysis (PR Comment)
```markdown
## PR Size Analysis

**Size Classification:** large
**Total Changes:** 847 lines (+782, -65)
**Files Changed:** 12

### Concerns:
- **Large PR** - May indicate batch acceptance of AI-generated code
- **Multiple files changed** - Ensure changes are cohesive

### Recommendations:
- Review carefully for AI-generated patterns that should be broken down
- Consider splitting into focused, single-responsibility PRs
```

### Local Script Output
```
=== ANALYSIS RESULTS ===

Total commits analyzed: 50
Large commits (>100 lines): 46.00%
Sprawling commits (>5 files): 20.00%
Test-first discipline: 58.00%
Average files changed: 6.42
Average lines changed: 9,053

=== CONCERNS DETECTED ===
[CRITICAL] Very high large commit rate (46%) - Strong AI drift indicators
[WARNING] High sprawling commit rate (20%) - Watch for scope creep

=== RECOMMENDATIONS ===
- Consider breaking AI-generated code into smaller, focused commits
- Review if AI suggestions are causing scattered changes across files
```

## Prerequisites

### For GitHub Actions
- Repository with feature branch workflow
- Feature branches preserved after merging (disable auto-delete)
- Repository permissions for creating issues and PR comments

### For Local Script
- Node.js >= 18
- A Git repository. Feature branches (local or remote) are analyzed if present; repos with none fall back to analyzing the default branch directly (see [Trunk vs. Feature-Branch Analysis](#trunk-vs-feature-branch-analysis))
- Command line access
- Optional: `ANTHROPIC_API_KEY` for Claude diff-level analysis

## File Structure
```
your-repo/
├── .github/workflows/
│   ├── code-metrics.yml              # Weekly analysis
│   └── pr-metrics.yml               # Real-time PR feedback
├── local-code-metrics.js            # Local analysis script
├── generate-drift-report.js         # Drift report generator (reads the JSON below)
├── local_commit_metrics.json        # Generated: detailed data
├── local_metrics_summary.json       # Generated: summary stats
├── local_claude_analysis.json       # Generated: Claude analysis (optional)
└── local_drift_report.html          # Generated: standalone HTML drift report
```

## Integration Examples

### With Other Actions
```yaml
- name: Check if metrics are concerning
  if: steps.analyze.outputs.has-concerns == 'true'
  run: echo "High AI drift detected - review required"
```

### With CI/CD
```yaml
- name: Block merge on large PRs
  if: steps.pr-size.outputs.size-label == 'extra-large'
  run: exit 1
```

## Troubleshooting

**No commits found?**
- Verify the analysis window includes your activity; widen it with `--days <n>` or set an explicit boundary with `--since <date>` (see [Option 2: Local Analysis](#option-2-local-analysis))
- If you expected feature-branch analysis, check that branches haven't been auto-deleted and that remote branches have been fetched (`git fetch`)
- A repo with no feature branches still gets analyzed via the `trunk` fallback (see [Trunk vs. Feature-Branch Analysis](#trunk-vs-feature-branch-analysis)), so an empty report now means no commits at all in the window, not a missing-branch problem

**Wrong test file counts?**
- Adjust `TEST_FILE_PATTERNS` for your project conventions
- Check that test files match expected naming patterns

**GitHub Actions not running?**
- Verify repository permissions: `contents: read`, `issues: write`, `pull-requests: write`
- Check workflow triggers and branch filters

**API rate limiting?**
- Workflows include built-in rate limiting delays
- For very active repos, consider reducing analysis period

## Why This Matters

**The Problem:** Teams adopting AI tools often see:
- Faster initial coding
- Larger, harder-to-review commits
- Reduced refactoring discipline
- Technical debt accumulation
- Net productivity loss over time

**The Solution:** Measure development patterns before they're hidden by workflow processing:
- **Early detection** of problematic AI usage
- **Quantified feedback** for development process improvement
- **Real-time prevention** through PR size controls
- **Trend analysis** to track team improvement

## Related Research

This toolkit implements the methodology described in:
**"Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases"** by Ken Judy

Key findings:
- Merge squashing destroys 90%+ of AI drift signals
- Local analysis reveals 10x higher drift rates than remote analysis
- Teams can maintain quality with proper measurement and discipline

See also: [metrics-specification.md](metrics-specification.md) for the full technical reference.

## License

This work is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You are free to share and adapt this material for any purpose, including commercially, as long as you provide appropriate attribution.

## Contributing

Improvements welcome. Particularly valuable:
- Additional test file patterns for different languages
- Enhanced AI pattern detection algorithms
- Better threshold recommendations for different project types
- Integration examples with other development tools

## Support

- **Documentation:** This README and [metrics-specification.md](metrics-specification.md) cover all common use cases
- **Issues:** Report bugs or request features in the GitHub issues
- **Discussions:** Share your results and insights with the community

---

**Attribution:** Based on research by Ken Judy. Please cite when using or adapting these tools.

**Citation:** Judy, K. (2025). Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases. https://github.com/stride-nyc/code-quality-metrics
