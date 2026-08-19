# Measuring AI Code Drift: Working with GitHub's Available Metrics to Track LLM Impact on Existing Codebases

The productivity case for AI coding tools seems straightforward: developers write code faster, complete more tasks, and merge more pull requests. But one finding has now held across two years of DORA research [1]: delivery instability rises with AI adoption, even as throughput has turned positive. The individual gains are real, and so is the strain. The tools generate more code faster than many organizations can safely absorb it.

This article explains why standard measurement approaches miss the most important signals, what the research actually shows, and how to instrument your development workflow to detect AI code drift before it compounds.

## The Signal Destruction Problem

Most software teams measure code quality at the wrong point in the process. Post-merge analysis (scanning your main branch, reviewing GitHub's aggregate statistics) sees a sanitized view of development that conceals how the code was actually written.

The culprit is `git merge --squash`. This standard workflow collapses an entire feature branch (potentially dozens of commits representing days of iterative development) into a single merge commit on main. The granular signals that reveal AI-assisted development patterns (large individual commits, test discipline on a commit-by-commit basis, the ratio of additions to deletions) are destroyed at merge time.

The practical consequence, observed on this toolkit's own repositories rather than measured across a population [2]: local analysis of feature branches before merging surfaced roughly ten times as many flagged commits as analysis of the main branch after merging. Squash destroys the granular signals.

The fix is instrumentation at the right moment: capturing commit-level metrics from feature branches before they're squashed and deleted.

## What DORA 2025 Research Found

The DORA (DevOps Research and Assessment) program, now part of Google Cloud, has tracked software delivery performance across thousands of organizations since 2014. Their 2025 AI Capabilities Model report [1] analyzed nearly 5,000 technology professionals and produced findings that challenge the prevailing narrative about AI coding tools. Note that several figures below come from the 2024 report rather than 2025; each is cited to its own report and page, because the two disagree in one important respect. The 2024 report measured AI adoption reducing delivery throughput; the 2025 report finds throughput now improves while delivery instability persists.

### The Productivity Paradox

Teams with high AI adoption reported measurable individual gains. Per 25% increase in AI adoption, DORA measured:
- **7.5% increase in documentation quality**
- **3.4% increase in code quality**
- **3.1% increase in code review speed**

(*Accelerate State of DevOps 2024*, p. 37.)

Research evidence complicates the productivity claim rather than supporting it. METR's trial of 16 experienced open-source developers across 246 tasks (arXiv:2507.09089) reported that "allowing AI actually increases completion time by 19%", a slowdown, not a gain. The GitHub Copilot trial (Peng et al., arXiv:2302.06590) found a 55.8% speedup, but on a single scripted task with freelance developers, which is a much narrower claim than a productivity gain in ongoing work.

But one delivery metric moved against the gains, and kept moving against them across both report years:

- **7.2% increase in delivery instability** for every 25% increase in AI adoption (2024 report). The 2025 report confirms this persists: AI adoption "now improves software delivery throughput... However, it still increases delivery instability" (2025 report, p. 4).

### The AI Amplifier Effect

DORA's central finding is that AI tools don't change a team's fundamental trajectory; they accelerate it. Teams with strong foundational practices (automated testing, CI/CD, version control discipline, working in small batches) found that AI amplified their existing strengths. Teams with weak foundations used AI tools to generate technical debt faster.

The best-identified causal study of 2026 supports the amplifier reading from the code side: comparing 806 Cursor-adopting projects against 1,380 matched controls, most of the post-adoption rise in static-analysis warnings was explained by velocity (more code, produced faster) rather than by AI-authored code being intrinsically worse. However, complexity increased even after adjusting for velocity (He et al., MSR 2026).

DORA identifies seven organizational capabilities that amplify AI's positive outcomes [3]. Two of these are directly observable in commit history and form the foundation of the measurement approach described here:

- **Strong version control practices** (Capability 4): frequent commits, mature rollback capability, disciplined branching
- **Working in small batches** (Capability 5): a long-standing DORA principle that becomes even more critical in AI-assisted environments

The remaining five capabilities (organizational AI policy, data ecosystem quality, internal knowledge systems, user-centric focus, and platform quality) require organizational and infrastructure data not available in git history and requires more extensive system integration, audits, and surveys.

### Team Archetypes

DORA identifies seven team archetypes from cluster analysis of survey responses covering performance, delivery, friction, and burnout. This toolkit borrows two of the names:

**Harmonious high-achievers**: Strong foundational practices + AI tools = compounding gains. The commit-history signature this toolkit attaches to the name: small batches and consistent test/production co-change.

**Foundational challenges**: Weak practices + AI tools = compounding debt. The signature here: a large-commit rate past the critical band.

DORA derives its archetypes from how people report their working conditions, and is not directly measurable through git related measures. This toolkit attempts to read signals based on four calibrated commit-shape bands. The signal is therefore directional and not presented as provable.

## Why This Matters: GitClear's Independent Evidence

GitClear, a code intelligence platform specializing in AI drift detection, provides independent evidence pointing the same direction [4]. The two measure different quantities (DORA surveys delivery outcomes, GitClear classifies changed lines), so this is convergence, not corroboration. Their 2025 research documented that 2024 was the first year copy-pasted lines exceeded moved lines. Copy-paste at scale is a leading indicator of the kind of technical debt that compounds invisibly: code that appears to work but creates hidden coupling and increases maintenance cost over time.

GitClear's analysis also shows churn rates (code written and then rewritten within two weeks) rising over the same period. Whether AI use causes that rise is contested: GitClear has no per-commit usage traces, and two independent peer-reviewed 2026 studies (He et al., MSR 2026; Robbes et al., 2026) fault its analysis on exactly that ground. The strongest causal design available (806 Cursor-adopting projects against 1,380 matched controls) found duplicated-line density rose about 7 percent, short of statistical significance. The distributional shift GitClear documents is real; the attribution to AI is an open question, and this toolkit treats duplication as a drift signal to investigate rather than a defect-risk verdict. One boundary to respect: DORA measures rising delivery instability, GitClear measures rising churn and duplicate-block prevalence, and any causal chain connecting the two is this article's inference, not a finding of either.

## What We Can Measure (and What We Can't)

The lists below sort signals by where the data lives: in git history itself, in sources this toolkit can also reach (the checked-out source files, the GitHub API), or in systems it never touches (CI/CD pipelines, incident trackers, surveys).

**What git reveals** (DORA Capabilities 4 and 5):
- Commit size distribution and trends
- Sprawl (files changed per commit)
- Test discipline (co-occurrence of test and production changes, a descriptive pattern rather than a test-first indicator)
- Commit velocity and velocity trends
- Additions-to-deletions ratios (reported without a verdict: the churn literature tested and discarded this denominator, so the toolkit carries it as descriptive context only)
- Commit message convention adoption (also reported without a verdict: the score tracks whether a team uses Conventional Commits far more than whether its messages are informative)
- Duplication density (a companion scan rather than the log itself: jscpd runs over the production files the analyzed commits touched, at SonarQube's minimum clone size, with an optional Claude pass for duplicates rebuilt in a different shape)

**What git cannot reveal** (the data lives elsewhere):
- The four core DORA delivery metrics (deployment frequency, lead time, change failure rate, MTTR): these require CI/CD and incident data
- DORA capabilities 1, 2, 3, 6, 7: require organizational policy, data infrastructure, and product telemetry

**Measurable, not yet measured** (the data is in reach through the checkout or the GitHub API; the analysis is unbuilt or partial):
- Code review quality: reviewer count and comment depth live in the GitHub API, and the per-PR workflow already runs with API access (`code-quality-metrics-5w1`)
- Structural clone detection: duplicates rebuilt with different names or structure need AST-level analysis (GitClear's approach); token matching cannot see them, and the optional Claude pass is a partial substitute
- Architectural boundary violations: requires dependency graph analysis over source that is already checked out; the Claude API integration described below partially addresses this

A detailed breakdown of measurable signals, gaps, and the tools that address each gap is available in the companion [Metrics Specification](metrics-specification.md).

## How to Measure These Patterns

### Option 1: GitHub Actions for Pre-Merge Analysis (Recommended)

The most scalable approach uses two GitHub Actions: one workflow for ongoing monitoring and another for real-time PR feedback.

**Weekly Analysis Workflow** runs every Sunday and analyzes feature branches from the last 30 days before they're merged and squashed. The workflow enumerates all branches except main/master, processes up to 50 commits, and generates detailed metrics including file-by-file analysis to distinguish test from production code changes. It automatically creates GitHub issues with concerning patterns and uploads metrics artifacts for historical tracking.

**Real-Time PR Analysis** triggers on every pull request and provides immediate feedback on size and scope. This prevents problematic patterns from being merged while they're still visible and actionable.

### Option 2: Local Analysis Script

For teams wanting immediate analysis of existing local development patterns, a Node.js script can process the repository directly. This approach suits one job especially: discovering the gap between actual development patterns and what's visible remotely after squash-merging.

The script enumerates all local feature branches and, by default, analyzes the newest 50 commits anchored on the repository's HEAD rather than on today's date, so a repository whose latest work is months old still yields a full sample (`--since`/`--days` set an explicit calendar window instead, and the actual analyzed span is always reported). It generates detailed metrics including multi-language test file detection.

### Option 3: Claude API Diff-Level Analysis (Emerging)

Heuristics catch the shape of a problem; AI analysis attempts to interpret what's actually wrong. Sending high-risk commit diffs to a Claude API endpoint adds semantic pattern detection that rule-based metrics cannot replicate:

- **AI-generated code signature detection**: generic variable names (`data`, `result`, `item`), boilerplate CRUD without error handling, identically structured adjacent functions, absent domain language in identifiers
- **Architectural boundary violation detection**: code that crosses service or module boundaries in ways that violate established patterns in the codebase
- **Per-commit risk scoring**: a 0-100 confidence score with natural language explanation of specific concerns

The practical implementation pre-filters commits where `large_commit = true AND additions > deletions x 3` to keep API costs low (typically 3-5 commits per analysis run). An `ANTHROPIC_API_KEY` environment variable gates the feature; if absent, the analysis skips gracefully and the rest of the metrics run unchanged.

This approach works best as a second pass: heuristics flag the candidates, Claude explains the specific concern in each.

## Available Commercial Solutions

### GitClear

The most specialized solution for AI code drift detection. Goes beyond commit statistics to classify code operations including moved, copy/pasted, and duplicated blocks. This is the AST-level analysis that git heuristics cannot replicate. Their 2025 research on copy-paste exceeding code moves is the most direct quantitative evidence of structural AI drift available. Offers a free starter tier.

### DX (Developer Experience Platform)

Focuses on broader productivity impacts. Tracks code review velocity and deployment frequency to detect when AI tools create downstream bottlenecks. Strong DORA metrics integration, including the delivery metrics (change failure rate, deployment frequency) that git analysis cannot surface. Best for engineering leaders who need full lifecycle visibility.

### LinearB

Provides engineering intelligence with indirect AI drift detection. Monitors pull request sizes, cycle times, and code review bottlenecks. Good for teams that want broad delivery metrics correlating AI adoption with delivery performance, without needing to instrument their own analysis. One caution from this project's provenance work: LinearB's published benchmark figures ("AI-assisted PRs run about 2.5x larger") state no classifier and no unit. Trace any number of theirs to a method before citing it.

## Recommendations for Teams

**Classify your team's signature first.** The right intervention depends on where you are. A team showing the foundational-challenges signature needs to strengthen testing and batch discipline before scaling AI usage. A team showing the harmonious high-achiever signature can use drift metrics to fine-tune an already-healthy practice. The same metric reading means different things in different contexts. (Commit shape, not DORA's survey constructs; see the archetypes section.)

**Know what your merge process hides.** If you are only analyzing the main branch after merge, you are seeing a curated view that systematically hides the patterns that matter most.

**Implement dual tracking.** Measure both pre-merge (real development patterns, via feature branch analysis) and post-merge (workflow efficiency, via delivery metrics). The gap between what pre-merge analysis shows and what post-merge shows is itself a signal: a large gap means your merge process is obscuring problematic patterns.

**Use distributions, not averages.** A p90 commit size tells you more than a mean. An average of 65 lines that hides a p90 of 500 lines describes a fundamentally different team than one where both numbers are low. This started as an intuition and is now the best-evidenced recommendation in this article: three independent published fits agree commit size follows a heavy-tailed distribution, the best fit has no finite mean at all, and the largest published dataset (Kolassa, Riehle & Salim, 8.7 million commits) shows a mean of 466 against a median of 16, a mean sitting above its own 90th percentile. One vendored dependency import can move an average and nothing else. Averages normalize outliers; distributions expose them.

**Focus on trends, not point-in-time readings.** A jump from 10% to 30% large commits over 60 days deserves investigation even if 30% is below your threshold. Velocity combined with direction is the leading indicator; an absolute number is the lagging one. Trend within your own repository is also the layer no transferability critique touches: your history compared against your history depends on no external benchmark resembling your project.

**Read a band breach as a prompt to look, never as a verdict.** A randomised trial with experienced maintainers (METR, 2025) showed that lines of code, commit counts, and pull request counts can all move without productivity or scope changing, and every metric in this article is that kind of measure. The 2026 measurement literature also complicates this article's premise in specific ways worth knowing before you react to a reading. AI-era commits get longer, not wider; file counts barely move (Daniotti et al., *Science* 2026). Coding-agent commits touch test files more often than human commits, not less (Hora, MSR 2026). Two of three measured agents saw their commits reverted less often than humans (Khosravani & Mockus, 2026). Commit size is the dimension where the evidence runs with the premise, causally in the best-identified study. The full inventory, with citations and units, is in this project's coverage map and `calibration/research-findings.md`.

**Treat the thresholds as benchmark comparisons, not verdicts.** The bands this toolkit now ships (large commits ≤ 19%, sprawling commits ≤ 18%, test/production co-change ≥ 23%, with the full table in the [Metrics Specification](metrics-specification.md)) are quantiles of a measured six-repository reference benchmark, derived by a published method (Alves, Ypma & Visser, ICSM 2010) and carried with thirteen recorded reservations. "Healthy" means "at or below the 75th percentile of that benchmark", never "validated against a quality outcome"; no published source, research paper or industry report, supplies a boundary for any of these metrics. The numbers are this project's own. DORA measures batch size through self-reported survey responses on an ordinal scale, not from commit history. Your own history remains the strongest reference: the benchmark tells you whether you look unusual next to six disciplined open-source projects, while your trend tells you whether you are drifting.

---

## References

[1] DORA. *State of AI-Assisted Software Development 2025*. Google Cloud, 2025. Available: https://dora.dev/research/2025/dora-report/

[2] Judy, K. *AI Code Drift Local Analysis Script*. GitHub, 2025. Available: https://github.com/stride-nyc/code-quality-metrics

[3] DORA. *Introducing DORA's Inaugural AI Capabilities Model*. Google Cloud Blog, 2025. Available: https://cloud.google.com/blog/products/ai-machine-learning/introducing-doras-inaugural-ai-capabilities-model

[4] GitClear. *AI Copilot Code Quality Research 2025*. GitClear, 2025. Available: https://www.gitclear.com/coding_on_copilot_data_shows_ais_downward_pressure_on_code_quality

[5] DORA. *From Adoption to Impact: Putting the DORA AI Capabilities Model to Work*. Google Cloud Blog, 2025. Available: https://cloud.google.com/blog/products/ai-machine-learning/from-adoption-to-impact-putting-the-dora-ai-capabilities-model-to-work

[6] DORA. *DORA's Software Delivery Performance Metrics*. dora.dev, 2024. Available: https://dora.dev/guides/dora-metrics/

[7] **Do not cite.** SonarSource. *The Inevitable Rise of Poor Code Quality in AI-Accelerated
Codebases*. Sonar Blog, 2025. Available:
https://www.sonarsource.com/blog/the-inevitable-rise-of-poor-code-quality-in-ai-accelerated-codebases/
Fetched 2026-08-18. Listed only as a warning: the article states no corpus, method, tool or period
of its own, and among the third-party statistics it carries, it attributes a 9 percent climb in bug
rates, a 91 percent increase in code review time and a 154 percent increase in pull request size to
the "Google 2025 DORA Report"; all three were searched for directly in the DORA reports and appear
in none of them. Any figure it carries needs tracing to a primary source. See the "Provenance
failures checked and not found" section of metrics-specification.md.

[8] IT Revolution. *AI's Mirror Effect: How the 2025 DORA Report Reveals Your Organization's True Capabilities*. IT Revolution, 2025. Available: https://itrevolution.com/articles/ais-mirror-effect-how-the-2025-dora-report-reveals-your-organizations-true-capabilities/
