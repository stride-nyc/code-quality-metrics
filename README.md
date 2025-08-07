# AI Code Drift Detection Toolkit

A comprehensive set of tools to detect and prevent problematic AI-assisted development patterns. Includes GitHub Actions workflows and local analysis scripts to monitor code quality before merge squashing destroys the signals.

## Overview

Research shows that AI coding tools can lead to increased batch sizes, reduced refactoring, and code quality issues that offset productivity gains. This toolkit helps teams monitor development patterns that may indicate "AI code drift."

**Key insight:** Standard Git workflows (merge squashing + branch deletion) hide the granular development patterns needed to detect AI code drift. These tools capture development behavior **before** it gets sanitized.

## Tools Included

### 1. 📊 Weekly AI Code Drift Metrics (GitHub Actions)
- **File:** `.github/workflows/ai-code-drift-metrics.yml`
- **Purpose:** Automated weekly analysis of feature branches
- **Output:** GitHub issues with trend analysis and artifacts

### 2. 🚦 Real-time PR Size Analysis (GitHub Actions)  
- **File:** `.github/workflows/pr-size-analysis.yml`
- **Purpose:** Immediate feedback on every pull request
- **Output:** PR comments with size warnings and recommendations

### 3. 🔍 Local Repository Analysis (Node.js Script)
- **File:** `local-ai-drift-analysis.js`
- **Purpose:** Immediate analysis of your local development patterns
- **Output:** Console report and JSON files with detailed metrics

## Quick Start

### Option 1: GitHub Actions (Recommended)
```bash
# 1. Copy workflows to your repository
mkdir -p .github/workflows
curl -o .github/workflows/ai-code-drift-metrics.yml https://raw.githubusercontent.com/yourrepo/toolkit/main/ai-code-drift-metrics.yml
curl -o .github/workflows/pr-size-analysis.yml https://raw.githubusercontent.com/yourrepo/toolkit/main/pr-size-analysis.yml

# 2. Ensure feature branches aren't auto-deleted
# Go to repo Settings > General > Pull Requests
# Uncheck "Automatically delete head branches"

# 3. Run manually or wait for weekly schedule
```

### Option 2: Local Analysis
```bash
# 1. Download and run the local script
curl -o local-ai-drift-analysis.js https://raw.githubusercontent.com/yourrepo/toolkit/main/local-ai-drift-analysis.js
node local-ai-drift-analysis.js

# 2. Review the generated JSON files and console output
```

## Key Metrics Tracked

| Metric | Target | Purpose |
|--------|--------|---------|
| **Large Commit %** | <20% | Detects batch AI code acceptance |
| **Sprawling Commit %** | <10% | Identifies scattered changes across files |
| **Test-First Discipline** | Trending ↗ | Monitors TDD practices with AI tools |
| **Avg Files Changed** | <5 | Measures development granularity |
| **Avg Lines Changed** | <100 | Detects wholesale AI code acceptance |

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
// Large commit threshold (lines)
large_commit: (additions + deletions) > 100,

// Sprawling commit threshold (files)  
sprawling_commit: files_changed > 5,

// Analysis period (days)
ANALYSIS_DAYS: 30,
```

## Understanding Results

### 🟢 Healthy Patterns
```
Large commits: <20%
Sprawling commits: <10%
Test-first discipline: >50%
Avg files changed: <5
Avg lines changed: <100
```

### 🟡 Warning Signs  
```
Large commits: 20-40%
Sprawling commits: 10-25%
Test-first discipline: 30-50%
Avg files changed: 5-10
Avg lines changed: 100-500
```

### 🔴 Critical Issues
```
Large commits: >40%
Sprawling commits: >25%  
Test-first discipline: <30%
Avg files changed: >10
Avg lines changed: >500
```

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
| Large Commits | 28% | <20% | ⚠️ |
| Sprawling Commits | 12% | <10% | ⚠️ |
| Test-First Discipline | 64% | Trending ↗ | ✅ |

### Interpretation
⚠️ **Large commits above 20% threshold** - Consider breaking down AI-generated code
⚠️ **Sprawling commits above 10% threshold** - Review AI suggestions for scope creep
```

### PR Size Analysis (PR Comment)
```markdown  
## 🟠 PR Size Analysis

**Size Classification:** large
**Total Changes:** 847 lines (+782, -65)
**Files Changed:** 12

### ⚠️ Concerns:
- ⚠️ **Large PR** - May indicate batch acceptance of AI-generated code
- ⚠️ **Multiple files changed** - Ensure changes are cohesive

### 💡 Recommendations:
- Review carefully for AI-generated patterns that should be broken down
- Consider splitting into focused, single-responsibility PRs
```

### Local Script Output
```bash
=== 📊 ANALYSIS RESULTS ===

📈 Total commits analyzed: 50
📏 Large commits (>100 lines): 46.00%
📁 Sprawling commits (>5 files): 20.00%
🧪 Test-first discipline: 58.00%
📂 Average files changed: 6.42
📝 Average lines changed: 9,053

=== ⚠️ CONCERNS DETECTED ===
🚨 Very high large commit rate (46%) - Strong AI drift indicators
⚠️ High sprawling commit rate (20%) - Watch for scope creep

=== 💡 RECOMMENDATIONS ===
• Consider breaking AI-generated code into smaller, focused commits
• Review if AI suggestions are causing scattered changes across files
```

## Prerequisites

### For GitHub Actions
- Repository with feature branch workflow
- Feature branches preserved after merging (disable auto-delete)
- Repository permissions for creating issues and PR comments

### For Local Script  
- Node.js (v12 or later)
- Git repository with local feature branches
- Command line access

## File Structure
```
your-repo/
├── .github/workflows/
│   ├── ai-code-drift-metrics.yml     # Weekly analysis
│   └── pr-size-analysis.yml          # Real-time PR feedback
├── local-ai-drift-analysis.js        # Local analysis script
├── local_commit_metrics.json         # Generated: detailed data
└── local_metrics_summary.json        # Generated: summary stats
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
- ✅ Faster initial coding
- ❌ Larger, harder-to-review commits  
- ❌ Reduced refactoring discipline
- ❌ Technical debt accumulation
- ❌ Net productivity loss over time

**The Solution:** Measure development patterns before they're hidden by workflow processing:
- 🔍 **Early detection** of problematic AI usage
- 📊 **Quantified feedback** for development process improvement  
- 🚦 **Real-time prevention** through PR size controls
- 📈 **Trend analysis** to track team improvement

## Related Research

This toolkit implements the methodology described in:
**"Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases"** by Ken Judy

Key findings:
- Merge squashing destroys 90%+ of AI drift signals
- Local analysis reveals 10x higher drift rates than remote analysis  
- Teams can maintain quality with proper measurement and discipline

## License

This work is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You are free to share and adapt this material for any purpose, including commercially, as long as you provide appropriate attribution.

## Contributing

Improvements welcome! Particularly valuable:
- Additional test file patterns for different languages
- Enhanced AI pattern detection algorithms  
- Better threshold recommendations for different project types
- Integration examples with other development tools

## Support

- 📖 **Documentation:** This README covers all common use cases
- 🐛 **Issues:** Report bugs or request features in the GitHub issues
- 💬 **Discussions:** Share your results and insights with the community

---

**Attribution:** Based on research by Ken Judy. Please cite when using or adapting these tools.

**Citation:** Judy, K. (2025). Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases. https://github.com/stride-nyc/code-quality-metrics