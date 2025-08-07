# Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases

As teams rapidly adopt AI coding tools, research suggests that perceived productivity gains from code generation may be offset by slowdowns elsewhere in the software delivery lifecycle, resulting in little to no net productivity improvement. Proposed causes are increased batch sizes, reduced refactoring and increased code cloning and their impact on deployment, support and maintenance.

So, we need to measure the impact of adoption on code quality, batch size, and delivery not just the rate of adoption itself. To get a quick start on this, teams can use GitHub's API to create early warning systems for problematic development patterns.

## Five Metrics for Tracking AI Code Drift

Here are the metrics I'm using, with findings an analysis from 50 commits across four feature branches in my current project:
### 1. **Large Commit Percentage** (Target: <20%)

GitHub provides `additions + deletions` from commit stats, from which we can infer that commits with >100 lines of changes are worth investigating. Large commits often indicate developers accepting substantial AI-generated code blocks without proper decomposition, though they can also result from refactoring, clean up, or data updates. This metric serves as an early warning signal for wholesale AI code acceptance patterns.

46% of my commits contained large line count changes.

### 2. **Sprawling Commit Percentage** (Target: <10%)

GitHub provides the `changed_files` count from commit details, allowing us to identify commits touching >5 files simultaneously. While not definitive, this pattern often correlates with AI-suggested "fixes" that ripple through unrelated components, though legitimate architectural changes can also cause this pattern. Sprawling commits may indicate "shotgun" problem-solving approaches that AI tools sometimes encourage.

20% of my commits were sprawling across multiple files.

### 3. **Test-First Discipline Rate** (Target: Trending upward)

GitHub provides file paths and change types, from which we can infer the percentage of commits modifying both test and production files. This serves as a rough proxy for TDD practices, though it's imperfect since it can't distinguish between test-first and test-after approaches. This metric is particularly valuable because test discipline often declines when developers rely heavily on AI tools for rapid code generation.

58% of commits showed test-first discipline, indicating good testing practices despite AI assistance.

### 4. **Average Files Changed Per Commit** (Target: <5)

GitHub provides the count of modified files per commit, which helps us understand development granularity and change scope. High counts may indicate "shotgun" problem-solving often encouraged by AI tools, where developers make scattered changes across multiple components rather than focused, atomic modifications. However, legitimate cross-cutting changes can also produce this pattern.

6.42 files changed per commit on average, above the target threshold.

### 5. **Average Lines Changed Per Commit** (Target: <100)

GitHub provides total additions and deletions, giving us insight into development work granularity. Massive changes often correlate with accepting large AI generations wholesale, though they can also indicate data migrations, major refactoring efforts, or significant feature implementations. This metric helps identify when AI assistance is leading to batch-style development rather than incremental progress.

9,053 lines changed per commit on average, indicating heavy AI-assisted batch coding.

 **Note**. The standard github merge/squash workflow can delete feature branches unless "Automatically delete head branches" is turned off. This removes the history of individual commits that we want to analyze. We can set this analysis up as a git action, running against remote repos that retain feature branches -- or -- as a local node.js script.

## How to Measure These Patterns

### Option 1: GitHub Actions for Pre-Merge Analysis (Recommended)

The most scalable approach uses a dual GitHub Actions: one workflow for ongoing monitoring and another for real-time PR feedback.

**Weekly Analysis Workflow** runs every Sunday and analyzes feature branches from the last 30 days before they're merged and squashed. This workflow enumerates all branches except main/master, processes up to 50 commits, and generates detailed metrics including file-by-file analysis to distinguish between test and production code changes.

The workflow automatically creates GitHub issues with concerning patterns and uploads detailed metrics as artifacts for historical tracking.

**Real-Time PR Analysis** triggers on every pull request and provides immediate feedback on size and scope. This prevents problematic patterns from being merged while they're still visible and actionable.
### Option 2: Local Analysis Script

For teams wanting immediate analysis of their existing local development patterns, a Node.js script can process your local repository directly. This approach is particularly valuable for discovering the gap between your actual development patterns and what's visible remotely.

The script enumerates all local feature branches, analyzes commits from the last 30 days, and generates detailed metrics including corrected test file detection patterns for various project types.

## Available Commercial Solutions

### **GitClear**

The most specialized solution for AI code drift detection. Goes beyond basic git stats to classify code operations including moved, copy/pasted, and duplicated blocks. Their 2025 research shows copy/paste frequency now exceeds code moves for the first time—a clear AI drift indicator. Offers free starter tier.

### **DX (Developer Experience Platform)**

Focuses on broader productivity impacts. Tracks code review velocity and deployment frequency to detect when AI tools create downstream bottlenecks. Strong DORA metrics integration. Best for engineering leaders wanting full lifecycle visibility.

### **LinearB**

Provides engineering intelligence with indirect AI drift detection. Monitors pull request sizes, cycle times, and code review bottlenecks. Good for teams wanting comprehensive metrics that correlate AI adoption with delivery performance.

## Recommendations for Teams

**Start with awareness:** Understand that your current measurement approach may be missing critical signals if you're only analyzing the main branch.

**Implement dual tracking:** Measure both pre-merge (real development patterns) and post-merge (workflow efficiency) metrics.

**Calibrate thresholds:** My 46% large commits would be concerning for most teams, but context matters. Establish baselines for your specific development patterns.

**Focus on trends:** Look for degradation over time rather than absolute numbers. A jump from 10% to 30% large commits deserves investigation.

## Conclusion

AI coding tools offer genuine productivity benefits, but they require careful monitoring to prevent drift toward unmaintainable code patterns. The key insight from my analysis is that **we can't manage what we can't measure accurately**.

Teams serious about sustainable AI adoption need measurement strategies that capture actual development behavior, not just the sanitized view that emerges after workflow processing. Whether through enhanced GitHub Actions, commercial tools, or local analysis scripts, the goal is maintaining visibility into the development patterns that determine long-term codebase health.

The choice isn't between using AI tools or not—it's between using them thoughtfully with proper measurement, or blindly and discovering the consequences later.

By implementing these measures, I've created a baseline and can monitor how my code quality and batch size improve as I get more disciplined about applying a structured Plan-Do-Check-Act approach with AI tools. Future articles will compare these interaction styles using the same metrics framework.
