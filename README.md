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

## Quick Start

### Option 1: GitHub Actions (Recommended)

**Step 1 — Copy the workflow files into your repository**
```bash
mkdir -p .github/workflows
curl -o .github/workflows/code-metrics.yml \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/.github/workflows/code-metrics.yml
curl -o .github/workflows/pr-metrics.yml \
  https://raw.githubusercontent.com/stride-nyc/code-quality-metrics/main/.github/workflows/pr-metrics.yml
```

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
- Git repository with local feature branches
- Command line access
- Optional: `ANTHROPIC_API_KEY` for Claude diff-level analysis

## File Structure
```
your-repo/
├── .github/workflows/
│   ├── code-metrics.yml              # Weekly analysis
│   └── pr-metrics.yml               # Real-time PR feedback
├── local-code-metrics.js            # Local analysis script
├── local_commit_metrics.json        # Generated: detailed data
├── local_metrics_summary.json       # Generated: summary stats
└── local_claude_analysis.json       # Generated: Claude analysis (optional)
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
- Ensure feature branches exist locally/remotely
- Check that branches haven't been auto-deleted
- Verify 30-day analysis period includes your activity

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
