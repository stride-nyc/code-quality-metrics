# Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases

The productivity case for AI coding tools seems straightforward: developers write code faster, complete more tasks, and merge more pull requests. But a growing body of research — most recently the DORA 2025 AI Capabilities Model report [1] — is documenting a troubling paradox. The same teams reporting individual productivity gains are simultaneously experiencing slower delivery, more bugs, and longer code reviews. The tools are generating more code faster than organizations can safely absorb it.

This article explains why standard measurement approaches miss the most important signals, what the research actually shows, and how to instrument your development workflow to detect AI code drift before it compounds.

## The Signal Destruction Problem

Most software teams measure code quality at the wrong point in the process. Post-merge analysis — scanning your main branch, reviewing GitHub's aggregate statistics — sees a sanitized view of development that conceals how the code was actually written.

The culprit is `git merge --squash`. This standard workflow collapses an entire feature branch — potentially dozens of commits representing days of iterative development — into a single merge commit on main. The granular signals that reveal AI-assisted development patterns (large individual commits, test discipline on a commit-by-commit basis, the ratio of additions to deletions) are destroyed at merge time.

The practical consequence: local analysis of feature branches before merging consistently reveals 10x higher AI drift rates than analysis of the main branch after merging [2]. By the time the problem is visible in your standard metrics, it's embedded across your codebase.

The fix is instrumentation at the right moment: capturing commit-level metrics from feature branches before they're squashed and deleted.

## What DORA 2025 Research Found

The DORA (DevOps Research and Assessment) program, now part of Google Cloud, has tracked software delivery performance across thousands of organizations since 2014. Their 2025 AI Capabilities Model report [1] analyzed nearly 5,000 technology professionals and produced findings that challenge the prevailing narrative about AI coding tools.

### The Productivity Paradox

Teams with high AI adoption reported measurable individual productivity gains:
- 98% more pull requests merged per developer
- 21% more tasks completed
- Reported improvements in documentation quality, code quality, and review speed

But when DORA looked at team-level delivery metrics — the ones that actually reflect whether software is reaching users reliably — the picture reversed:

- **154% increase in pull request size** — AI-generated code arrives in larger batches
- **91% increase in code review time** — reviewers struggle with the volume and size of AI-generated changes
- **9% increase in bug rates** — more code, reviewed faster, with higher confidence in AI output, means more defects escape
- **7.2% reduction in delivery stability** — change failure rates increased initially with high AI adoption
- **1.5% decrease in overall delivery throughput** — despite individual productivity gains, teams delivered less

More code is being produced and merged more quickly, reviewed more slowly, and breaking more often.

### The AI Amplifier Effect

DORA's central finding is that AI tools don't change a team's fundamental trajectory — they accelerate it. Teams with strong foundational practices (automated testing, CI/CD, version control discipline, working in small batches) found that AI amplified their existing strengths. Teams with weak foundations used AI tools to generate technical debt faster.

DORA identifies seven organizational capabilities that amplify AI's positive outcomes [3]. Two of these are directly observable in commit history and form the foundation of the measurement approach described here:

- **Strong version control practices** (Capability 4): frequent commits, mature rollback capability, disciplined branching
- **Working in small batches** (Capability 5): a long-standing DORA principle that becomes even more critical in AI-assisted environments

The remaining five capabilities — organizational AI policy, data ecosystem quality, internal knowledge systems, user-centric focus, and platform quality — require organizational and infrastructure data not available in git history.

### Team Archetypes

DORA describes seven team archetypes based on the intersection of performance, stability, and AI adoption. Two are most relevant to code drift measurement:

**Harmonious high-achievers**: Strong foundational practices + AI tools = compounding gains. In commit history: small batches, consistent test discipline, stable and measured velocity, high commit message specificity.

**Foundational challenges**: Weak practices + AI tools = compounding debt. In commit history: large commits, low test-first discipline, erratic or accelerating velocity, vague commit messages.

Identifying which archetype describes your team helps calibrate which signals to prioritize first.

## Why This Matters: GitClear's Independent Evidence

GitClear, a code intelligence platform specializing in AI drift detection, provides independent evidence that corroborates DORA's findings [4]. Their 2025 research on code churn patterns documented a threshold crossed for the first time: copy-paste operations now exceed code moves in repositories with high AI adoption. This is significant because copy-paste at scale is a leading indicator of the kind of technical debt that compounds invisibly — code that appears to work but creates hidden coupling and increases maintenance cost over time.

GitClear's analysis also shows that churn rates (code written and then rewritten within two weeks) have increased alongside AI adoption, suggesting that AI-generated code requires more downstream rework than human-written code, offsetting the speed gains from generation.

These findings are consistent with what DORA describes as the rework paradox: individual developers write code faster, but the downstream effects — larger reviews, more bugs, more rework — push net team productivity below the pre-AI baseline for teams without strong foundations.

## What We Can Measure (and What We Can't)

Git commit history is a rich data source for two of DORA's seven capabilities. It is silent on the other five.

**What git reveals** (DORA Capabilities 4 and 5):
- Commit size distribution and trends
- Sprawl (files changed per commit)
- Test discipline (co-occurrence of test and production changes)
- Commit velocity and velocity trends
- Additions-to-deletions ratios (the batch-acceptance signature)
- Commit message specificity

**What git cannot reveal**:
- The four core DORA delivery metrics (deployment frequency, lead time, change failure rate, MTTR) — these require CI/CD and incident data
- Copy-paste and code cloning detection — requires AST-level diff analysis (GitClear's approach)
- Code review quality — reviewer count and comment depth require GitHub API data
- Architectural boundary violations — requires dependency graph analysis; the Claude API integration described below partially addresses this
- DORA capabilities 1, 2, 3, 6, 7 — require organizational policy, data infrastructure, and product telemetry

A detailed breakdown of measurable signals, gaps, and the tools that address each gap is available in the companion [Metrics Specification](metrics-specification.md).

## How to Measure These Patterns

### Option 1: GitHub Actions for Pre-Merge Analysis (Recommended)

The most scalable approach uses two GitHub Actions: one workflow for ongoing monitoring and another for real-time PR feedback.

**Weekly Analysis Workflow** runs every Sunday and analyzes feature branches from the last 30 days before they're merged and squashed. The workflow enumerates all branches except main/master, processes up to 50 commits, and generates detailed metrics including file-by-file analysis to distinguish test from production code changes. It automatically creates GitHub issues with concerning patterns and uploads metrics artifacts for historical tracking.

**Real-Time PR Analysis** triggers on every pull request and provides immediate feedback on size and scope. This prevents problematic patterns from being merged while they're still visible and actionable.

### Option 2: Local Analysis Script

For teams wanting immediate analysis of existing local development patterns, a Node.js script can process the repository directly. This approach is particularly valuable for discovering the gap between actual development patterns and what's visible remotely after squash-merging.

The script enumerates all local feature branches, analyzes commits from the last 30 days, and generates detailed metrics including multi-language test file detection.

### Option 3: Claude API Diff-Level Analysis (Emerging)

Heuristics catch the shape of a problem; AI analysis can explain what's actually wrong. Sending high-risk commit diffs to a Claude API endpoint adds semantic pattern detection that rule-based metrics cannot replicate:

- **AI-generated code signature detection**: generic variable names (`data`, `result`, `item`), boilerplate CRUD without error handling, identically structured adjacent functions, absent domain language in identifiers
- **Architectural boundary violation detection**: code that crosses service or module boundaries in ways that violate established patterns in the codebase
- **Per-commit risk scoring**: a 0–100 confidence score with natural language explanation of specific concerns

The practical implementation pre-filters commits where `large_commit = true AND additions > deletions × 3` to keep API costs low — typically 3–5 commits per analysis run. An `ANTHROPIC_API_KEY` environment variable gates the feature; if absent, the analysis skips gracefully and the rest of the metrics run unchanged.

This approach works best as a second pass: heuristics flag the candidates, Claude explains what's actually problematic about them.

## Available Commercial Solutions

### GitClear

The most specialized solution for AI code drift detection. Goes beyond commit statistics to classify code operations including moved, copy/pasted, and duplicated blocks — the AST-level analysis that git heuristics cannot replicate. Their 2025 research on copy-paste exceeding code moves is the most direct quantitative evidence of structural AI drift available. Offers a free starter tier.

### DX (Developer Experience Platform)

Focuses on broader productivity impacts. Tracks code review velocity and deployment frequency to detect when AI tools create downstream bottlenecks. Strong DORA metrics integration, including the delivery metrics (change failure rate, deployment frequency) that git analysis cannot surface. Best for engineering leaders who need full lifecycle visibility.

### LinearB

Provides engineering intelligence with indirect AI drift detection. Monitors pull request sizes, cycle times, and code review bottlenecks. Good for teams that want comprehensive metrics correlating AI adoption with delivery performance, without needing to instrument their own analysis.

## Recommendations for Teams

**Classify your team archetype first.** DORA's research shows the right intervention depends on where you are. A team in "foundational challenges" needs to strengthen testing and batch discipline before scaling AI usage. A "harmonious high-achiever" team can use drift metrics to fine-tune an already-healthy practice. The same metric reading means different things in different contexts.

**Start with awareness of the signal destruction problem.** Understand that if you are only analyzing the main branch after merge, you are seeing a curated view that systematically hides the patterns that matter most.

**Implement dual tracking.** Measure both pre-merge (real development patterns, via feature branch analysis) and post-merge (workflow efficiency, via delivery metrics). The gap between what pre-merge analysis shows and what post-merge shows is itself a signal: a large gap means your merge process is obscuring problematic patterns.

**Use distributions, not averages.** A p90 commit size tells you more than a mean. An average of 65 lines that hides a p90 of 500 lines describes a fundamentally different team than one where both numbers are low. Averages normalize outliers; distributions expose them.

**Focus on trends, not point-in-time readings.** A jump from 10% to 30% large commits over 60 days deserves investigation even if 30% is below your threshold. Velocity combined with direction is the leading indicator; an absolute number is the lagging one.

**Calibrate thresholds to DORA capabilities.** The thresholds in this toolkit (large commit < 20%, sprawling commit < 10%, test discipline > 50%) correspond to the boundaries DORA found separating teams that benefit from AI tools from teams that are harmed by them. They are not arbitrary.

---

## References

[1] DORA. *State of AI-Assisted Software Development 2025*. Google Cloud, 2025. Available: https://dora.dev/research/2025/dora-report/

[2] Judy, K. *AI Code Drift Local Analysis Script*. GitHub, 2025. Available: https://github.com/stride-nyc/code-quality-metrics

[3] DORA. *Introducing DORA's Inaugural AI Capabilities Model*. Google Cloud Blog, 2025. Available: https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model

[4] GitClear. *AI Copilot Code Quality Research 2025*. GitClear, 2025. Available: https://www.gitclear.com/coding_on_copilot_data_shows_ais_downward_pressure_on_code_quality

[5] DORA. *From Adoption to Impact: Putting the DORA AI Capabilities Model to Work*. Google Cloud Blog, 2025. Available: https://cloud.google.com/blog/products/ai-machine-learning/from-adoption-to-impact-putting-the-dora-ai-capabilities-model-to-work

[6] DORA. *DORA's Software Delivery Performance Metrics*. dora.dev, 2024. Available: https://dora.dev/guides/dora-metrics/

[7] SonarSource. *The Inevitable Rise of Poor Code Quality in AI-Accelerated Codebases*. Sonar Blog, 2025. Available: https://www.sonarsource.com/blog/the-inevitable-rise-of-poor-code-quality-in-ai-accelerated-codebases/

[8] IT Revolution. *AI's Mirror Effect: How the 2025 DORA Report Reveals Your Organization's True Capabilities*. IT Revolution, 2025. Available: https://itrevolution.com/articles/ais-mirror-effect-how-the-2025-dora-report-reveals-your-organizations-true-capabilities/
