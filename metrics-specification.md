# Code Drift Metrics Specification

Technical reference for the AI Code Drift analysis toolkit. Covers what is measured, how each metric is computed, what the thresholds mean, what cannot be measured with this approach, and how the implementation is configured.

For the research background and practitioner recommendations behind this specification, see [Measuring AI Code Drift](measuring-ai-code-drift-using-github-metrics.md).

**Runtime requirement**: Node.js ≥ 18 (required for the optional `@anthropic-ai/sdk` Claude API integration).

---

## DORA Capability Coverage Map

This toolkit directly addresses two of DORA's seven AI-amplifying capabilities, which DORA research identifies as the most directly measurable predictors of AI tool outcomes.

### Capabilities Covered by This Toolkit

| DORA Capability | Coverage | Metrics |
|-----------------|----------|---------|
| #4 Strong Version Control Practices | Full | Message quality score, commit velocity, branch discipline |
| #5 Working in Small Batches | Full | Large commit %, sprawling commit %, lines/files distributions, velocity trend |

### Capabilities Not Addressable via Git History

| DORA Capability | Why Not Measurable | Gap |
|-----------------|-------------------|-----|
| #1 Clear and Communicated AI Stance | Organizational policy | Out of scope |
| #2 Healthy Data Ecosystems | Data infrastructure quality | Out of scope |
| #3 AI-Accessible Internal Data | Internal knowledge systems | Out of scope |
| #6 User-Centric Focus | Product and UX decisions | Out of scope |
| #7 Quality Internal Platforms | CI/CD and tooling quality | Partially visible in workflow file complexity; not commit patterns |

### DORA Delivery Metrics Not Measurable from Git

| DORA Metric | Data Required | Gap |
|-------------|--------------|-----|
| Deployment Frequency | CI/CD pipeline data | Use DX or LinearB for full lifecycle visibility |
| Lead Time for Changes | Commit → production timestamps | Partial proxy: branch lifetime (creation → merge) |
| Change Failure Rate | Incident / rollback data | Not addressable without incident tracking integration |
| Mean Time to Recovery (MTTR) | Incident duration data | Not addressable without incident tracking integration |

---

## Metrics Reference

### Metric 1: Large Commit Percentage

**What it measures**: The proportion of commits that exceed a line-change threshold, used as a proxy for wholesale AI code acceptance.

**Formula**:
```
large_commit_pct = (commits where additions + deletions > LARGE_COMMIT_THRESHOLD) / total_commits × 100
```

**Per-commit flag**: `large_commit: boolean`

**Data source**: `git show --numstat {sha}` (additions and deletions per file, summed across all files)

**CONFIG key**: `LARGE_COMMIT_THRESHOLD` (default: 100 lines)

**Thresholds**:
| Range | Signal |
|-------|--------|
| < 20% | Healthy: consistent with DORA "small batches" capability |
| 20–40% | Warning: elevated AI batch-acceptance risk |
| > 40% | Critical: strong AI drift indicators |

**False positives**: Legitimate large commits include data migrations, bulk refactoring, large file additions (assets, generated code), and one-time cleanup. Context from `large_commit AND additions > deletions × 3` narrows to the AI-specific pattern.

---

### Metric 2: Sprawling Commit Percentage

**What it measures**: The proportion of commits that touch more files than the threshold, used as a proxy for "shotgun" problem-solving where AI-suggested fixes ripple through unrelated components.

**Formula**:
```
sprawling_commit_pct = (commits where files_changed > SPRAWLING_COMMIT_THRESHOLD) / total_commits × 100
```

**Per-commit flag**: `sprawling_commit: boolean`

**Data source**: `git show --numstat {sha}` (count of file entries)

**CONFIG key**: `SPRAWLING_COMMIT_THRESHOLD` (default: 5 files)

**Thresholds**:
| Range | Signal |
|-------|--------|
| < 10% | Healthy |
| 10–25% | Warning: watch for scope creep |
| > 25% | Critical: possible shotgun surgery |

**DORA connection**: DORA's research documents a 154% increase in pull request size with high AI adoption. Sprawling commits are the commit-level precursor to oversized PRs.

---

### Metric 3: Test-First Discipline Rate

**What it measures**: The proportion of commits that modify both test files and production files in the same commit, used as a proxy for test discipline under AI-assisted development.

**Formula**:
```
test_first_pct = (commits where test_files_count > 0 AND prod_files_count > 0) / total_commits × 100
```

**Per-commit flag**: `test_first_indicator: boolean`

**Data source**: `git show --numstat {sha}` (file paths matched against `TEST_FILE_PATTERNS`)

**CONFIG key**: `TEST_FILE_PATTERNS` (array of 8 regex patterns; covers JS/TS, Python, Go, Java, C#)

**Thresholds**:
| Range | Signal |
|-------|--------|
| > 50% | Healthy: strong test discipline |
| 30–50% | Warning: monitor AI tool usage patterns |
| < 30% | Critical: AI tools may be bypassing TDD practices |

**Limitations**: This metric cannot distinguish test-first (TDD) from test-after. It measures co-occurrence, not ordering. A commit that adds production code and test code written afterward scores the same as one where tests were written first.

**DORA connection**: DORA's research identifies automated testing as the single strongest predictor of whether AI tools help or hurt a team. Teams without it when they adopt AI see the fastest debt accumulation.

---

### Metric 4: Lines Changed Per Commit (Distribution)

**What it measures**: The statistical distribution of commit sizes by line count. Distributions reveal patterns that averages conceal: a p90 of 500 lines with a p50 of 30 lines describes a "mostly disciplined with occasional explosions" pattern that an average of 65 lines hides entirely.

**Fields**:
```
p50_lines_changed    : median commit size (lines)
p90_lines_changed    : 90th percentile commit size
p95_lines_changed    : 95th percentile commit size
stddev_lines_changed : standard deviation
avg_lines_changed    : mean (kept for backwards compatibility)
commit_size_trend    : "growing" | "stable" | "shrinking"
```

**Formula** (commit size trend):
```
Fit linear regression: commit_size ~ commit_index (time-ordered)
slope > 0: "growing"
slope < 0: "shrinking"
|slope| < threshold: "stable"
```

**Implementation**: `simple-statistics` library: `quantile()`, `mean()`, `standardDeviation()`, `linearRegression()`

**Risk signal**: `commit_size_trend: "growing"` combined with `velocity_trend: "accelerating"` is the joint indicator DORA describes as "volume without discipline."

**Thresholds** (p90 guidance):
| Range | Signal |
|-------|--------|
| p90 < 200 lines | Healthy |
| p90 200–500 lines | Monitor |
| p90 > 500 lines | Investigate: high review burden |

---

### Metric 5: Files Changed Per Commit (Distribution)

**What it measures**: The statistical distribution of commit scope by file count. Complements Metric 2 by showing the shape of the distribution, not just the percentage above threshold.

**Fields**:
```
p50_files_changed   : median files per commit
p90_files_changed   : 90th percentile files per commit
avg_files_changed   : mean (kept for backwards compatibility)
```

**Implementation**: `simple-statistics` library: `quantile()`, `mean()`

**Thresholds** (p90 guidance):
| Range | Signal |
|-------|--------|
| p90 < 8 files | Healthy |
| p90 8–15 files | Monitor |
| p90 > 15 files | Investigate: architectural scatter |

---

### Metric 6: Commit Velocity Trend

**What it measures**: How quickly commits are being produced, and whether that rate is accelerating or decelerating over the analysis window. Velocity alone is neutral; velocity combined with commit size trend is the meaningful signal.

**Formulas**:
```
velocity_commits_per_day = total_commits / (last_commit_date - first_commit_date) in days

Velocity trend:
  Split commits at time midpoint into first_half and second_half
  first_half_rate = first_half_count / half_window_days
  second_half_rate = second_half_count / half_window_days

  Accelerating:  second_half_rate > first_half_rate × 1.25
  Decelerating:  second_half_rate < first_half_rate × 0.75
  Stable:        otherwise
```

**Fields**:
```
velocity_commits_per_day  : float
velocity_trend            : "accelerating" | "stable" | "decelerating"
```

**Data source**: `date` field from `git log --pretty=format:"%ai"`. Already collected in the existing analysis loop; no new git calls required.

**Risk signal**: `velocity_trend: "accelerating"` combined with `commit_size_trend: "growing"`. DORA research identifies this combination as the leading indicator of team archetype drift toward "foundational challenges."

**Note**: A single-day analysis window (all commits on one day) yields `velocity_commits_per_day` but `velocity_trend: "stable"` by convention.

---

### Metric 7: Additions-to-Deletions Ratio Distribution

**What it measures**: The median and 90th percentile of the per-commit ratio of lines added to lines deleted. High ratios indicate that new code is being added without commensurate refactoring or removal of replaced code. This is the systematic batch-acceptance pattern DORA associates with architectural debt accumulation.

**Formula**:
```
per-commit ratio = total_additions / max(total_deletions, 1)
additions_ratio_median = quantile(all_ratios, 0.5)
additions_ratio_p90    = quantile(all_ratios, 0.9)
```

**Fields**:
```
additions_ratio_median  : float (median ratio across all commits)
additions_ratio_p90     : float (90th percentile ratio)
```

**Data source**: `total_additions` and `total_deletions` already collected per commit; no new git calls required

**Thresholds**:
| Range (median) | Signal |
|----------------|--------|
| < 2.0 | Healthy: balanced additions and deletions |
| 2.0–3.0 | Monitor: additions outpacing deletions |
| > 3.0 | Warning: systematic batch-acceptance pattern |

**Relationship to existing heuristic**: The existing `generateInsights()` function counts commits where `large_commit AND additions > deletions × 3` as "possible AI commits." This metric expresses the same pattern at the aggregate level with a distribution, so outlier commits don't distort the reading.

---

### Metric 8: Commit Message Quality Score

**What it measures**: The proportion of commit messages that meet a minimum quality bar: following conventional commit format, or containing enough words to be considered specific. Message quality declines with AI over-reliance as developers accept AI-suggested vague descriptions ("update stuff", "fix issue", "wip").

**Formula**:
```
For each commit message:
  conventional = /^(feat|fix|refactor|test|chore|docs|perf|ci|build|revert)(\(.+\))?:/i.test(message)
  specific     = message.split(' ').filter(Boolean).length >= MESSAGE_QUALITY_MIN_WORDS
  quality      = conventional OR specific

message_quality_pct = (quality commits / total commits) × 100
```

**Fields**:
```
message_quality_pct  : float (percentage of quality commits)
```

**CONFIG key**: `MESSAGE_QUALITY_MIN_WORDS` (default: 10)

**Thresholds**:
| Range | Signal |
|-------|--------|
| > 60% | Healthy: good commit message discipline |
| 40–60% | Monitor |
| < 40% | Warning: messaging discipline issues |

**Design decision: why not NLP**: Conventional commit classification requires a 3-line regex. Word count requires one line. Adding a 200KB+ NLP library (`compromise`, `wink-nlp`) for these two signals is unjustified. The regex approach is zero-dependency, faster, more maintainable, and easier to test.

**Limitations**: This metric cannot assess semantic quality. A message that says "feat: add user authentication for all supported OAuth providers" scores the same as "feat: a." The word-count threshold partially compensates, but it cannot detect technically-compliant messages that are still vague.

---

## Derived Metrics

### Per-Commit Outlier Flag

**What it measures**: Whether an individual commit is a statistical outlier relative to the rest of the analysis window.

**Formula**:
```
mean_lines   = mean(all commit sizes)
stddev_lines = standardDeviation(all commit sizes)
outlier      = (total_additions + total_deletions) > (mean_lines + 2 × stddev_lines)
```

**Per-commit field**: `outlier: boolean`

**Use**: Displayed in the sample commits table in console output. Useful for manual investigation: outlier commits are the ones most likely to warrant direct review.

---

### DORA Archetype Classification

**What it measures**: Which of four DORA team archetypes best describes the commit patterns in the analysis window. This is a heuristic classification based on the composite of all eight metrics, intended to contextualize threshold readings rather than replace them.

**Classification logic** (evaluated in order):

```
harmonious-high-achiever:
  large_commits_pct < 20
  AND sprawling_commits_pct < 10
  AND test_first_pct > 50
  AND message_quality_pct > 60

legacy-bottleneck:
  sprawling_commits_pct > 25
  AND large_commits_pct > 30

foundational-challenges:
  large_commits_pct > 40
  OR (test_first_pct < 30 AND large_commits_pct > 20)

mixed-signals:
  (all other combinations)
```

**Field**: `dora_archetype: "harmonious-high-achiever" | "foundational-challenges" | "legacy-bottleneck" | "mixed-signals"`

**Interpretation**:

| Archetype | What It Suggests |
|-----------|-----------------|
| `harmonious-high-achiever` | Strong foundation; AI tools likely amplifying positive outcomes |
| `foundational-challenges` | Weak testing/batch discipline; AI tools likely accelerating debt |
| `legacy-bottleneck` | Architectural scatter; AI making cross-cutting changes worse |
| `mixed-signals` | Inconsistent patterns; investigate specific outliers |

**Limitation**: This classification is based on a 30-day window of at most 50 commits. It is a directional signal, not a definitive assessment. Teams near archetype boundaries should look at individual metric thresholds, not just the archetype label.

---

## Claude API Integration (Optional)

When `ANTHROPIC_API_KEY` is set in the environment, the toolkit performs a supplementary AI-powered analysis of the highest-risk commits. This feature is completely optional. All eight metrics above run with zero external dependencies when the key is absent.

### Pre-Filter Logic

To limit API costs, only a subset of commits are sent for analysis:

```
Candidates = commits where:
  large_commit = true
  AND total_additions > total_deletions × AI_RISK_ADDITIONS_RATIO

Sort candidates by (total_additions + total_deletions) descending
Take top AI_ANALYSIS_MAX_COMMITS
```

**CONFIG keys**:
- `AI_ANALYSIS_MAX_COMMITS` (default: 5)
- `AI_RISK_ADDITIONS_RATIO` (default: 3; also used in the `generateInsights()` heuristic)

### Diff Extraction

For each selected commit:
```bash
git show --stat {sha}              # file summary
git diff {sha}^ {sha} --          # full diff
```

Combined output truncated at `AI_DIFF_MAX_CHARS` characters (default: 4000). Truncation drops from the end of the diff, preserving file headers and early hunks.

### Structured Output (claude-sonnet-4-6)

The diff is sent with a system prompt describing AI code patterns to detect. The model responds with structured JSON:

```json
{
  "ai_confidence": 0-100,
  "risk_score": 0-100,
  "patterns": ["string", ...],
  "architectural_concerns": ["string", ...],
  "summary": "string"
}
```

**Pattern categories detected**:
- Generic variable names (`data`, `result`, `item`, `temp`)
- Boilerplate CRUD without error handling
- Identically structured adjacent functions (copy-paste with variable substitution)
- Absent domain language in identifiers
- Imports that don't match the rest of the file's dependency patterns

**Architectural concerns detected** (Claude infers these from diff context):
- Code crossing service/module boundaries in ways inconsistent with established patterns
- New dependencies on modules that aren't imported elsewhere in the changed files
- Structural patterns inconsistent with the existing file's approach

### Output File

Results are written to `local_claude_analysis.json`:

```json
{
  "analyzed_at": "ISO 8601 timestamp",
  "model": "claude-sonnet-4-6",
  "commits_analyzed": 5,
  "results": [
    {
      "sha": "abc12345",
      "ai_confidence": 78,
      "risk_score": 82,
      "patterns": ["generic variable names", "boilerplate CRUD without error handling"],
      "architectural_concerns": ["crosses auth/billing service boundary"],
      "summary": "High probability AI-generated boilerplate. Three functions have identical structure with variable substitution. No domain-specific error handling."
    }
  ]
}
```

Claude findings are also annotated onto the matching commit entries in `local_commit_metrics.json`.

### Graceful Degradation

If `ANTHROPIC_API_KEY` is absent:
- A single log line: `Claude analysis skipped (no ANTHROPIC_API_KEY set)`
- All other metrics run unchanged
- `local_claude_analysis.json` is not written
- No error or exit code change

### Cost Estimate

At the default `AI_ANALYSIS_MAX_COMMITS: 5` with 4000-char diffs, a typical run costs approximately $0.02–0.05 USD using claude-sonnet-4-6. Actual cost depends on diff sizes.

---

## Persistent Measurement Gaps

These signals are not addressable by this toolkit. Each gap is noted with the best alternative approach:

1. **Copy-paste and code cloning detection**: Requires AST-level diff analysis to detect when code is duplicated with minor modifications. GitClear is the specialized commercial solution. This toolkit's additions-ratio metric is a proxy for the outcome (more code added than removed) but cannot detect the structural pattern directly.

2. **DORA delivery metrics** (deployment frequency, lead time, change failure rate, MTTR): Require integration with CI/CD pipelines and incident tracking systems. DX and LinearB provide these for organizations that want full lifecycle visibility alongside git-level analysis.

3. **Code review quality**: Reviewer count, comment depth, and review turnaround time are available via GitHub API. The GitHub workflow variant of this toolkit (`pr-metrics.yml`) surfaces PR-level signals, but the local script has no access to review data.

4. **Architectural boundary violations without Claude**: Detecting whether code crosses architectural boundaries (service layers, domain boundaries, module dependencies) without semantic analysis requires a dependency graph of the codebase. Without Claude API enabled, this toolkit can detect structural patterns (sprawl, large commits) but not semantic architectural violations.

5. **AI tool usage specifics**: Which AI tools are being used, how frequently suggestions are accepted, and which patterns come from which models require IDE telemetry. This is not available in git history.

6. **DORA capabilities 1, 2, 3, 6, 7**: Organizational AI stance, data ecosystem quality, internal knowledge accessibility, user-centric focus, and platform quality all require organizational survey data or infrastructure telemetry. DORA measures these through their survey instrument.

7. **Developer well-being and burnout**: DORA research shows that AI adoption affects developer well-being, which in turn affects all other metrics. This requires survey data.

---

## Configuration Reference

All thresholds are set in the `CONFIG` object at the top of `local-code-metrics.js`. The GitHub workflows have equivalent values hard-coded in their shell/jq logic. Update both locations when adjusting thresholds.

```javascript
const CONFIG = {
  // Analysis window
  ANALYSIS_DAYS: 30,                  // days of history to analyze
  MAX_COMMITS: 50,                    // maximum commits to analyze (most recent first)

  // Commit size thresholds
  LARGE_COMMIT_THRESHOLD: 100,        // lines changed threshold for large_commit flag
  SPRAWLING_COMMIT_THRESHOLD: 5,      // files changed threshold for sprawling_commit flag

  // Message quality
  MESSAGE_QUALITY_MIN_WORDS: 10,      // minimum word count for a "specific" message
                                      // (applies when message doesn't match conventional format)

  // Claude API integration (optional)
  AI_ANALYSIS_MAX_COMMITS: 5,         // maximum commits sent to Claude per run
  AI_DIFF_MAX_CHARS: 4000,            // character limit for diffs sent to Claude
  AI_RISK_ADDITIONS_RATIO: 3,         // additions/deletions multiplier for Claude pre-filter
                                      // also used in generateInsights() heuristic

  // Test file detection (customize for your language/framework)
  TEST_FILE_PATTERNS: [
    /\.(test|spec)\./i,               // file.test.js, file.spec.ts
    /Tests?\.cs$/i,                   // FileTests.cs, FileTest.cs (C#)
    /Test\.java$/i,                   // FileTest.java (Java)
    /_test\.py$/i,                    // file_test.py (Python)
    /test_.*\.py$/i,                  // test_file.py (Python)
    /_test\.go$/i,                    // file_test.go (Go)
    /__tests__/i,                     // __tests__ directory
    /\/tests?\//i                     // /test/ or /tests/ directories
  ]
};
```

---

## Output Format Reference

### `local_commit_metrics.json`

Array of `CommitMetric` objects, one per analyzed commit:

```typescript
{
  // Identity (from git log)
  sha: string,              // 8-character short SHA
  full_sha: string,         // full 40-character SHA
  date: string,             // ISO 8601 timestamp
  author: string,           // author name
  message: string,          // commit subject line
  source_branch: string,    // branch this commit was found on

  // File statistics (from git show --numstat)
  total_additions: number,
  total_deletions: number,
  files_changed: number,
  binary_files: number,
  test_files_count: number,
  prod_files_count: number,

  // Derived flags
  test_first_indicator: boolean,
  large_commit: boolean,
  sprawling_commit: boolean,
  change_ratio: string,         // "X.XX" or "inf"
  outlier: boolean,             // true if > mean + 2σ for this analysis window
  commit_type: "feature_branch",

  // Message quality (new)
  message_quality: boolean,     // true if message meets quality threshold

  // Claude API annotation (present only when ANTHROPIC_API_KEY is set and commit was analyzed)
  ai_confidence?: number,       // 0-100
  risk_score?: number,          // 0-100
  patterns?: string[],
  architectural_concerns?: string[],
  claude_summary?: string
}
```

### `local_metrics_summary.json`

Single summary object for the analysis run:

```typescript
{
  // Run metadata
  analysis_date: string,            // ISO 8601
  analysis_period_days: number,
  total_commits: number,
  filtered_from: number,            // unique commits before MAX_COMMITS cap
  branches_analyzed: string[],
  branch_commit_counts: Record<string, number>,

  // Original 5 metrics (preserved for backwards compatibility)
  large_commits_pct: string,        // "XX.XX"
  sprawling_commits_pct: string,
  test_first_pct: string,
  avg_files_changed: string,
  avg_lines_changed: string,

  // Statistical distributions (new)
  p50_lines_changed: number,
  p90_lines_changed: number,
  p95_lines_changed: number,
  stddev_lines_changed: number,
  p50_files_changed: number,
  p90_files_changed: number,
  commit_size_trend: "growing" | "stable" | "shrinking",

  // Velocity metrics (new)
  velocity_commits_per_day: number,
  velocity_trend: "accelerating" | "stable" | "decelerating",

  // Additions ratio distribution (new)
  additions_ratio_median: number,
  additions_ratio_p90: number,

  // Message quality (new)
  message_quality_pct: string,      // "XX.XX"

  // DORA archetype (new)
  dora_archetype: "harmonious-high-achiever" | "foundational-challenges" | "legacy-bottleneck" | "mixed-signals",

  // Configuration snapshot
  config: CONFIG,
  note: string
}
```

### `local_claude_analysis.json`

Written only when `ANTHROPIC_API_KEY` is set:

```typescript
{
  analyzed_at: string,          // ISO 8601
  model: string,                // "claude-sonnet-4-6"
  commits_analyzed: number,
  results: Array<{
    sha: string,
    ai_confidence: number,      // 0-100
    risk_score: number,         // 0-100
    patterns: string[],
    architectural_concerns: string[],
    summary: string
  }>
}
```

---

## Implementation Libraries

### `simple-statistics` (production dependency)

Used for: `quantile()` (p50/p90/p95), `mean()`, `standardDeviation()`, `linearRegression()` (trend slope), `median()`.

**Why chosen**: Zero dependencies, 47KB, works in Node and browser, comprehensive coverage of the statistical operations needed. Replaces four hand-rolled average calculations with a single well-tested library.

**Why not a larger ML library**: This toolkit needs descriptive statistics and linear trend detection, not machine learning, clustering, or inference. `simple-statistics` covers exactly the needed surface without the overhead of `ml.js`, `tensorflow.js`, or equivalent.

### `@anthropic-ai/sdk` (production dependency, optional at runtime)

Used for: Claude API calls in the diff-level analysis feature (Metric 3 supplement / Claude integration section above).

**Why chosen**: Official Anthropic SDK, actively maintained, full TypeScript types, supports structured JSON output mode, prompt caching available.

**Runtime dependency, not hard requirement**: The SDK is imported conditionally. If `ANTHROPIC_API_KEY` is absent at runtime, the import path is never reached and no network calls are made. Users on Node 16 who don't set the API key are unaffected by the Node 18+ requirement.

### What Was Explicitly Rejected

| Library | Reason Rejected |
|---------|----------------|
| `compromise` (NLP) | 200KB+ for what 3 lines of regex accomplish; message classification does not need ML |
| `wink-nlp` | Same rationale as compromise; heavier and more complex |
| `simple-git` | Shell exec approach in `runGitCommand()` is already abstracted, tested, and working; no benefit from wrapping it further |
| `nodegit` | Native compilation dependencies; declining maintenance; not worth the complexity for shell-replaceable operations |
| `isomorphic-git` | No browser requirement; pure-JS advantage doesn't apply to a Node CLI tool |
| `plato` | Deprecated: last updated 9 years ago, no ES6+ support |
| `escomplex` | Poor TypeScript support; superseded by typhonjs-escomplex, but file complexity analysis is outside the scope of this toolkit's commit-level focus |
| `@octokit/rest` | Already used in GitHub workflows; not needed in the local script which uses git CLI directly |
