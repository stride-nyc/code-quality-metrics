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

## Threshold Provenance and Calibration

No cited source supplies a boundary number for any metric in this document. DORA scores
"working in small batches" from three self-reported survey items, including "the
*approximate* number of lines of code committed in the most recent change", on an ordinal
scale from extremely low to extremely high (*State of AI-Assisted Software Development 2025*,
pp. 50, 57-58). It never converts that to a line count. GitClear reports trends and
prevalence rates, an eight-fold increase in duplicate blocks during 2024 and a rise from
0.70 to 6.66 percent of commits containing one, but never a healthy-versus-unhealthy line
(*AI Copilot Code Quality 2025*, pp. 5, 12).

Bands are therefore derived by measuring projects worth holding up as disciplined. The
observations live in `calibration/observations.json`, one record per run, each carrying the
repository HEAD, the tool commit, the window, the merge-style evidence and the configuration
in effect, so any number can be reproduced. `calibration/derive-bands.js` proposes bands and
writes nothing; values are copied into `lib/thresholds.js` in a reviewed commit.

**Every "healthy", "warning" and "critical" label in this document, wherever it appears below,
means "positioned relative to this six-repository benchmark", not "validated against a quality
outcome".** That qualification applies uniformly and is not repeated at every table.

### What a band means

Deriving thresholds as quantiles of a benchmark of reference systems is itself a published
method: Alves, Ypma and Visser, "Deriving Metric Thresholds from Benchmark Data" (ICSM 2010,
DOI 10.1109/ICSM.2010.5609747) pool measurements across 100 Java/C# systems (roughly 12 MLOC,
proprietary and open source) and read thresholds off percentiles of the pooled, LOC-weighted
distribution. They are explicit that the method is outcome-agnostic: "our methodology derives
meaningful thresholds which represent overall volume of code from a benchmark of systems"
(§II-C), and validating thresholds against an external quality outcome is listed there as
future work, not as something the method already establishes. That is the claim this document
makes for every band below: a band means "unusual relative to these six peers", not "harmful" or
"defect-prone". The scale gap is real and worth stating rather than letting the citation imply
otherwise: Alves used 100 systems and roughly 12 million lines of code; this project uses six
repositories and twelve calibration windows. The method transfers; the strength of the claim
does not.

### Derivation rule

- **healthy** is the 75th percentile of observations (25th percentile for a higher-is-better
  metric, since the unhealthy end is the low tail there).
- **critical** is the worst value observed (best value, for higher-is-better), meaning worse
  than any disciplined project measured -- but only reported when at least two distinct
  reference repositories produced a value within 15% of that extreme
  (`NEAR_EXTREME_FRACTION` in `calibration/derive-bands.js`).

Both bounds come from data. Where the worst value rests on a single repository or a single
window, with no second repository corroborating it within that 15% band, no critical bound is
claimed and the metric carries two bands (good/warning) rather than three (good/warning/
critical), because "outside what disciplined projects do" is supportable from one observation
while "definitively bad" is not. This is a correction to an earlier version of this section,
which described the two-band case as "where the worst value rests on a single repository"
without naming the corroboration check that actually decides the tier -- see
`code-quality-metrics-xeh` and `calibration/README.md`'s "Derivation rule" section, which
documented an even older rule (healthy = worst observation, critical = healthy x 2) that the
code had already stopped implementing.

### External anchors

Two bands, and only two, have corroboration from outside this project's own six repositories.
Both are corroboration of a *position*, not a derivation of a *boundary*, and the unit
mismatches are real:

| Band | This toolkit | External comparison | Source |
|---|---|---|---|
| `P90_LINES_CHANGED.healthy` | 260 | p90 = **261 LoC/commit** over 8,705,118 commits in 11,143 projects | Kolassa, Riehle & Salim, "A Model of the Commit Size Distribution of Open Source", SOFSEM 2013, Table 1; arXiv:1408.4974 |
| `P90_FILES_CHANGED.healthy` | 8 | ~90% of changes touch fewer than **10 files**, over ~9M changes | Sadowski et al., "Modern Code Review: A Case Study at Google", ICSE-SEIP 2018, §5.2 |
| | | gcc p90 ≈ **8 files** (derived from published frequency table) | Alali, Kagdi & Maletic, ICPC 2008, Table 2 |

The 260/261 agreement is partly coincidental rather than a clean replication: Kolassa excludes
blank lines and includes test files; this toolkit counts production lines only via
`git numstat`, which includes blank lines. The two biases pull in opposite directions and
happen to land close together. Neither source proposes these as healthy lines -- both are
descriptive percentiles of a population with no health claim attached. What they support is a
restatement, not a stronger claim: "this repository sits above the 90th percentile of published
open-source commit-size distributions" is citable; "this repository exceeds a review-effectiveness
threshold" is not, for either number. `P90_FILES_CHANGED.critical` has no external support at
all -- no source publishes a second, higher file-count boundary -- and stays a two-repo,
single-benchmark figure.

### Reference set

nodejs/node, emberjs/ember.js, git/git, postgres/postgres, django/django and curl/curl. All
six preserve individual commits, which is a requirement rather than a preference: this toolkit
measures commits, and a squash-merge repository yields one commit per pull request, so its
numbers describe pull request shape instead of working habits. Screening rejected eslint,
prettier, vuejs/core, TypeScript, angular, webpack, babel, react, svelte, jest, express,
python/cpython, apache/kafka and kubernetes on that basis, not on quality.

### What limits this

Thirteen reservations are recorded alongside the observations in
`calibration/observations.json`, three of them high severity.

- **Granular history only.** The bands do not transfer to squash-merge repositories, which
  will look worse on every size metric for reasons unrelated to practice.
- **Circular definition.** The references were chosen because they are considered
  disciplined, and healthy was then defined as what they do. This supports "no worse than
  these six" rather than "healthy", and reputation is not a measured outcome.
- **Cross-project non-transfer.** Kamei, Fukushima, McIntosh, Yamashita, Ubayashi and Hassan
  (EMSE 2016, DOI 10.1007/s10664-015-9400-x, Table 6) found within-project just-in-time defect
  models score 0.74-0.83 AUC on their own project but fall as low as 0.38 AUC -- worse than
  random -- applied cross-project to the same eleven projects. An unfitted scalar band from six
  repositories has less claim to transfer to an unseen project than a fitted, multi-feature
  model does, so these bands describe these six repositories rather than generalizing beyond
  them.
- **Context-dependence** (medium severity). Zhang, Mockus, Zou, Khomh and Hassan (ICSM 2013,
  DOI 10.1109/ICSM.2013.46) measured 320 SourceForge systems across 39 metrics and found every
  one of six context factors they studied (domain, language, age, lifespan, number of changes,
  number of downloads) shifts metric distributions; language alone shifted 35 of 39. The six
  references here are one context, not a population sample.
- **Within-project drift of model properties** (medium severity). McIntosh and Kamei (TSE 2018,
  DOI 10.1109/TSE.2017.2693980) found just-in-time defect models lose 11-34 percentage points of
  AUC one year after training, with the Size family's explanatory share swinging 10-43% (Qt) and
  3-37% (OpenStack) of period-specific importance. A frozen band is the artefact this paper warns
  against; these bands should be re-derived periodically, not treated as a permanent constant.
- **No pre-AI baseline (partially addressed).** Every window used to be from 2026, so the
  references may already have adopted AI assistance. A pre-2022 (2019-2020) window has since
  been measured for all six repositories -- twelve `era: "pre-ai"` observations alongside the
  twelve `era: "current"` ones -- and movement between eras was modest and mixed in direction
  rather than uniformly worse, which softens but does not retire the concern (downgraded from
  high to medium severity for this reason).

The remaining reservations (practice-not-outcome, narrow-population, two-windows-per-repo,
fifty-commit sampling, language mix, bot traffic, measurement-changed-mid-calibration) are
recorded in full, with their implications, in `calibration/observations.json`'s `reservations`
array; `calibration/derive-bands.js` prints the high-severity ones on every run.

### Findings that contradict this toolkit's premises

Peer-reviewed AI-era measurements exist for four of the premises this document otherwise states
without qualification. None of them supports a threshold; all of them bear on whether the
metric's *direction* is the one this toolkit assumes.

- **Duplication.** He, Miller, Agarwal, Kaestner and Vasilescu ("Speed at the Cost of Quality",
  MSR 2026, arXiv:2511.04427v3, Table 2), 806 Cursor adopters vs. 1,380 matched controls: AI-tool
  adoption moved duplicated line density by +7.03% (±4.79%), not statistically significant. The
  authors write that the result "challenges simplistic narratives about AI coding degrading code
  quality", citing GitClear directly.
- **Test discipline.** Hora ("Are Coding Agents Generating Over-Mocked Tests?", MSR 2026,
  arXiv:2602.00409), 1.2 million 2025 commits across 2,168 repositories: 23% of coding-agent
  commits add or change test files, against 13% of non-agent commits. Agent commits touch tests
  *more* often, not less; the offsetting finding is that 36% of agent commits add mocks against
  26% of non-agent commits.
- **Revert rates.** Khosravani and Mockus (arXiv:2606.24429, Table 7): Claude Code commits were
  reverted 32% less often than human commits in the same projects (1.1% vs 1.6%), Aider 82% less
  (0.17% vs 0.90%); OpenHands was the exception at 34% more (1.38% vs 1.03%).
- **Commit-volume null results.** Stray et al. (HICSS-59 2026, arXiv:2509.20353) found no
  statistically significant change in commit-based activity for 25 Copilot adopters at NAV IT
  over two years. Daniotti, Wachs, Feng and Neffke (arXiv:2506.08945) found multi-file commit
  counts rise at the same ~3.6% rate as all commits at 29% AI use, so the *share* of multi-file
  commits does not move even though the count does.

### Defects found by measuring

Seven, three of which changed what a metric counts and retired every observation taken
before them. Recorded here because they are the argument for keeping the calibration data
rather than discarding it after use.

| Defect | Effect |
|---|---|
| Commit size counted test lines | Adding tests could push a change over the large-commit threshold |
| Repository-root `test/` never matched | Node classified 1 of 1514 touched files as a test |
| git's `t/` suite never matched | git reported 0 percent test coverage |
| Merge commits counted twice | A merge diffs against its first parent, so a merged single-commit branch was counted twice |
| Message quality read the subject only | The short-subject convention scored near zero; postgres moved 22 to 94 percent on an identical commit set once fixed |
| Trailer-only bodies passed | A body of `PR-URL:` and `Reviewed-By:` lines scored as quality, so projects with more reviewers scored higher |
| Ignore patterns used the wrong jscpd flag | Every configured pattern was silently inert; vendored trees counted as duplication |

### Provenance failures checked and not found in this project's own documents

A 2026-08-18 research pass (`calibration/research-findings.md`) traced three widely repeated
figures in the review-size literature and could not locate any of them at their stated source:
a "200-400 LOC over 60-90 minutes should yield 70-90% defect discovery" figure attributed by
SmartBear to its own Cisco case study (not present in that study, which states it cannot compute
such a figure); a 200-400 line review ceiling attributed to McConnell's *Code Complete* (every
attribution traced back to a blog citing a blog); and "Google recommends keeping pull requests
under 200 lines" (Sadowski et al., the actual Google study, reports a median of 24 lines and no
recommended limit). None of the three was found anywhere in this project's own documents
(`metrics-specification.md`, `README.md`, `CLAUDE.md`, `calibration/README.md`) during that
pass, so there is nothing to withdraw here; they are recorded so a future edit does not
reintroduce them. A separate likely transmission vector for three of the four already-withdrawn
DORA figures — a SonarSource blog post cited as reference [7] in
`measuring-ai-code-drift-using-github-metrics.md:165`, which attributes "9% climb in bug rates,
91% increase in code review time, 154% increase in PR size" to a "Google 2025 DORA Report" with
no corpus or method of its own — was also identified (`code-quality-metrics-9ur`); fixing that
citation is out of this document's scope and is tracked on that issue.

---

## Metrics Reference

### Metric 1: Large Commit Percentage

**What it measures**: The proportion of commits that exceed a line-change threshold, used as a proxy for wholesale AI code acceptance.

**Formula**:
```
large_commit_pct = (commits where additions + deletions > LARGE_COMMIT_THRESHOLD) / total_commits × 100
```

**Per-commit flag**: `large_commit: boolean`

**Data source**: `git show --numstat {sha}` (additions and deletions per file, summed across **production files only**; files matching `TEST_FILE_PATTERNS` are excluded from the total)

**Why production lines only**: counting test lines meant that adding tests could push a change over the threshold. A 90 line production change shipped with 30 lines of tests scored 120 and was flagged large, while the same change with no tests was not, so the metric penalised the practice this toolkit identifies as the strongest protection against drift. `uncovered_prod_rate` already covers the untested case as a separate signal.

**Note**: `total_additions` and `total_deletions` in the output remain whole-diff, including test lines, because the size distributions describe how much a reviewer actually reads. `prod_additions` and `prod_deletions` carry the production-only totals that drive this flag.

**CONFIG key**: `LARGE_COMMIT_THRESHOLD` (default: 100 lines)

**Thresholds** (`LARGE_COMMITS_PCT` in `lib/thresholds.js`; three-band, corroborated at the
critical extreme by nodejs/node and curl/curl -- see `calibration/`):
| Range | Signal |
|-------|--------|
| < 19% | Healthy: at or below the 75th percentile of the six-repository benchmark |
| 19–30% | Warning: above the benchmark's typical range |
| > 30% | Critical: at or above the worst value two reference repositories both produced |

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

**Thresholds** (`SPRAWLING_COMMITS_PCT`; three-band, corroborated by nodejs/node,
django/django and curl/curl):
| Range | Signal |
|-------|--------|
| < 18% | Healthy: at or below the 75th percentile of the six-repository benchmark |
| 18–20% | Warning: above the benchmark's typical range |
| > 20% | Critical: at or above the worst value three reference repositories all produced |

**DORA connection**: DORA's 2024 research measured a 7.2% increase in software delivery instability for every 25% increase in AI adoption, and its 2025 report states that AI adoption now improves throughput but "still increases delivery instability" (2025 report, p. 4). Instability is the finding that held across both years. Sprawling commits are one commit-level mechanism that could produce instability, but this link is an inference by this toolkit: DORA does not measure files changed per commit, and publishes no figure for pull request size. Do not cite the 2024 throughput figure as current; the 2025 report reverses its direction.

---

### Metric 3: Three-Way Test Coverage Classification

**What it measures**: Replaces the binary `test_first_indicator` with three distinct commit categories, each carrying different signal quality for AI drift detection.

| Category | Formula | Per-commit flag | Summary field |
|----------|---------|----------------|---------------|
| Test Coverage | test AND prod files in same commit | `test_first_indicator` | `test_coverage_rate` |
| Test Isolation | test files only (no prod files) | `test_only_commit` | `test_isolation_rate` |
| Uncovered Prod | prod files only AND large commit | `uncovered_prod_commit` | `uncovered_prod_rate` |

**Formulas**:
```
test_coverage_rate   = (commits where test_files_count > 0 AND prod_files_count > 0) / total_commits × 100
test_isolation_rate  = (commits where test_files_count > 0 AND prod_files_count = 0) / total_commits × 100
uncovered_prod_rate  = (commits where test_files_count = 0 AND prod_files_count > 0 AND large_commit = true) / total_commits × 100
```

**Data source**: `git show --numstat {sha}` (file paths matched against `TEST_FILE_PATTERNS`)

**Detection defects, both fixed**: the directory pattern was `/\/tests?\//`, which requires a slash before the word. Git emits repo-relative paths with no leading slash, so a repository-root `test/` or `tests/` directory never matched, and only nested paths were detected. Measuring nodejs/node, one file out of 1514 touched across two windows was classified as a test, and commits whose subject was literally `test: enable multi-global WPTs` counted as uncovered production code. Separately, git's suite lives under `t/`, which no pattern covered, so one of the most heavily tested C projects reported 0 percent coverage. The pattern is now `(^|\/)tests?\/` plus a root-anchored `^t\/`.

**CONFIG key**: `TEST_FILE_PATTERNS` (array of 8 regex patterns; covers JS/TS, Python, Go, Java, C#)

**Thresholds** (`TEST_COVERAGE_RATE` and `UNCOVERED_PROD_RATE` in `lib/thresholds.js`; both
two-band -- their extremes rest on a single reference repository, emberjs/ember.js, with no
second repository corroborating within 15%, so `lib/report.js` reports only good/warning for
either, never critical):
| Metric | Range | Signal |
|--------|-------|--------|
| `test_coverage_rate` | ≥ 23% | Healthy: at or above the 25th percentile of the benchmark |
| `test_coverage_rate` | < 23% | Warning: below the benchmark's typical range |
| `test_isolation_rate` | > 10% | Positive: TDD red-phase or test-improvement commits visible (informational; carries no critical bound at all, see `calibration/derive-bands.js`'s `INFORMATIONAL` list) |
| `uncovered_prod_rate` | ≤ 13% | Healthy: at or below the 75th percentile of the benchmark |
| `uncovered_prod_rate` | > 13% | Warning: above the benchmark's typical range |

The `warning: 30` value still present in `lib/thresholds.js` for `test_coverage_rate` is not a
second calibrated boundary; it is a pre-existing display cutoff that predates this metric having
any observed basis, kept only because `lib/report.js` never reads it as a critical bound (it
explicitly forces `criticalBoundary: null`). Levin and Yehudai (ICSME 2017, 61 popular Java OSS
projects, 242,567 commits) found "In none of the projects, did the test maintenance occur in more
than 68.5% of the commits", with per-activity-type medians below 24.7/30.4/35 percent on a
numerator broader than this toolkit's -- an independent, much larger population landing in the
same teens-to-thirties range as the 23% derived here.

**Why `uncovered_prod_rate` matters**: A commit that is both prod-only and large is the clearest AI drift signal in this toolkit — it matches the pattern of a developer accepting a large AI-generated code block without writing any tests. `test_isolation_rate` is a positive signal: test-only commits indicate TDD red-phase work or deliberate test improvements, both of which the binary metric incorrectly classified as "bad".

**The same-commit heuristic is a published-noisy proxy for what this metric reaches for.**
`test_coverage_rate` and `test_first_indicator` measure co-occurrence in one commit, not
sequencing. Sun et al. (TOSEM 2023) exists specifically to test whether same-commit
co-occurrence identifies genuine test/production co-evolution and reports "the pervasive
existence of noise". Borle et al. (EMSE 2018) make the same point in their own threats-to-validity
section: "In a git history, test first could look like testing at the same time, or even testing
later depending on how the git commits were formed." This does not change what the field measures
in this release -- `test_first_indicator` still means same-commit co-occurrence, exactly as coded
in `lib/git.js` -- but the label should not be read as evidence of test-first *sequencing*.

**DORA connection**: none directly. Automated testing is not among the seven capabilities in DORA's 2025 AI Capabilities Model (*State of AI-Assisted Software Development 2025*, p. 50), which names clear AI stance, healthy data ecosystems, AI-accessible internal data, strong version control practices, working in small batches, user-centric focus, and quality internal platforms. This metric rests on general software engineering practice, not on a DORA finding. An earlier version of this document called testing DORA's "single strongest predictor"; that claim was not supported by the report and has been removed.

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

**Risk signal**: `commit_size_trend: "growing"` combined with `velocity_trend: "accelerating"`. This is a hypothesis held by this toolkit, not a DORA finding. The phrase "volume without discipline" was previously attributed to DORA here; it appears in no DORA publication and has been removed.

**Thresholds** (`AVG_LINES_CHANGED` and `P90_LINES_CHANGED` in `lib/thresholds.js`):
| Metric | Range | Signal |
|--------|-------|--------|
| `avg_lines_changed` | ≤ 140 | Healthy: at or below the 75th percentile of the benchmark (three-band; nodejs/node and postgres/postgres both corroborate the extreme) |
| `avg_lines_changed` | 140–200 | Warning |
| `avg_lines_changed` | > 200 | Critical |
| `p90_lines_changed` | ≤ 260 | Healthy: at or below the 75th percentile of the benchmark (two-band; only nodejs/node sits near the extreme, so no critical bound is reported) |
| `p90_lines_changed` | > 260 | Warning |

**External anchor for `p90_lines_changed`**: Kolassa, Riehle and Salim (SOFSEM 2013, Table 1;
arXiv:1408.4974), an Ohloh.net snapshot of 8,705,118 commits across 11,143 projects, report a p90
of 261 LoC/commit -- one unit from the 260 derived here from an unrelated, six-repository dataset.
The agreement is partly coincidental: Kolassa excludes blank lines and includes test files, this
toolkit counts production lines only and includes blank lines, and the two biases pull in
opposite directions. Neither source proposes 260 or 261 as a healthy line; both are descriptive
percentiles. What is citable is a position, not a boundary: this repository sits above the 90th
percentile of a large published open-source commit-size distribution, not that it has crossed a
review-effectiveness threshold.

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

**Thresholds** (`P90_FILES_CHANGED` in `lib/thresholds.js`; two-band -- the extreme rests on
curl/curl's own two windows, with no second, distinct repository corroborating it, so no
critical bound is reported):
| Range | Signal |
|-------|--------|
| p90 ≤ 8 files | Healthy: at or below the 75th percentile of the benchmark |
| p90 > 8 files | Warning |

**External anchors**: Sadowski et al. (ICSE-SEIP 2018, §5.2), roughly 9 million Google code
changes: "about 90% modify fewer than 10 files." Alali, Kagdi and Maletic (ICPC 2008, Table 2)
put gcc's files-per-commit p90 at approximately 8, derived from their published size-bucket
frequencies. The two bracket 8 from either side. As with the lines-changed anchor above, these
are descriptive percentiles from unrelated populations, not proposed healthy lines; what they
support is the restatement "this repository's file-scope sits above the 90th percentile of these
published distributions", not a claim that a review-effectiveness or architectural-scatter
threshold has been crossed.

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

**Risk signal**: `velocity_trend: "accelerating"` combined with `commit_size_trend: "growing"`. This is a hypothesis held by this toolkit, not a DORA finding: an earlier version of this document attributed the combination to DORA research as "the leading indicator of team archetype drift toward foundational challenges", and that attribution could not be traced to any DORA publication during a 2026-08-18 research pass (`code-quality-metrics-pw5`). It has been withdrawn. See Metric 4's risk-signal note for the same hypothesis stated without the DORA attribution.

**Note**: A single-day analysis window (all commits on one day) yields `velocity_commits_per_day` but `velocity_trend: "stable"` by convention.

---

### Metric 7: Net Additions Ratio Distribution

**What it measures**: The median and 90th percentile of the per-commit net additions ratio — what fraction of all lines changed in a commit are net-new code. A high ratio indicates new code is being added without commensurate refactoring or removal of replaced code. An earlier version of this document described this as "the systematic batch-acceptance pattern DORA associates with architectural debt accumulation"; that attribution could not be traced to any DORA publication during a 2026-08-18 research pass (`code-quality-metrics-pw5`) and has been withdrawn. This is this toolkit's own hypothesis, not a DORA finding.

**Formula**:
```
per-commit ratio           = (total_additions - total_deletions) / (total_additions + total_deletions)
net_additions_ratio_median = quantile(all_ratios, 0.5)
net_additions_ratio_p90    = quantile(all_ratios, 0.9)
```

The formula is bounded **[-1.0, +1.0]**:
- `1.0` — commit is entirely net-new code (all additions, zero deletions)
- `0.0` — perfectly balanced additions and deletions
- negative — net deletion (cleanup or refactoring that removes more than it adds)

Zero-churn commits (no additions and no deletions) are assigned `0.0`.

**Fields**:
```
net_additions_ratio_median  : float (median ratio across all commits; bounded [-1, +1])
net_additions_ratio_p90     : float (90th percentile ratio; bounded [-1, +1])
```

**Data source**: `total_additions` and `total_deletions` already collected per commit; no new git calls required

**No band (`code-quality-metrics-a9z`)**: `net_additions_ratio_median` and
`net_additions_ratio_p90` are reported descriptively, with no healthy/critical boundary and no
gauge. The era:current calibration data would still support a three-band pair (p75 0.63, max
0.79, corroborated by git/git and django/django), but this exact formula -- additions minus
deletions, over total churn -- is the one relative-churn measure the literature has actually
tested and found weak. Nagappan and Ball (ICSE 2005) tested it as their M7 (churned LOC over
deleted LOC, the same additions-vs-deletions shape); it tied weakest of eight relative-churn
measures at rho .288, and stepwise regression dropped it from their defect model entirely. Shin
et al. (TSE 2011) found the additions-only form (`LinesNew`) satisfied their prediction
criterion in 0 of 80 runs, against 76 of 80 for total churn (`LinesChanged`), and carried a 58%
false-alarm rate in Firefox versus 25% for total churn. Scoring a repository against a boundary
on a measure the literature specifically discarded is not defensible; the ratio itself is still
useful context, so it is shown without a verdict (`lib/report.js`'s catalog entry, `concern`
fixed at `-Infinity` so it never competes with a scored metric in the relevance sort).

**Deletion is not the antidote to net-new growth**: this formula puts `total_deletions` in the
numerator with a minus sign, which treats deleting code as healthy in direct proportion to how
much of it there is. No cited source supports that. Nagappan and Ball's own strongest predictor
in the same study is M2, deleted lines over total lines, at rho .798 -- the *first* variable
their stepwise regression enters, meaning heavy deletion is one of their most defect-associated
signals, not a corrective one. Munson and Elbaum (ICSM 1998) make the same point directly: "From
the standpoint of fault insertion, removing a lot of code is probably as catastrophic as adding a
bunch." A future measure in this family should not repeat the assumption that more deletion is
automatically better; see the RQ4 research note (`code-quality-metrics-e30`) for the LA/LT
alternative (additions over the prior size of touched files) that Kamei et al. (TSE 2013) support
instead, which this toolkit does not yet collect the data to compute.

**Relationship to existing heuristic**: The existing `generateInsights()` function counts commits where `large_commit AND additions > deletions × 3` as "possible AI commits." This metric expresses the same pattern at the aggregate level with a distribution, so outlier commits don't distort the reading.

**Why not `additions / max(deletions, 1)`**: The prior formula yielded ratios approaching `total_additions` for net-new-file commits (zero deletions). A commit adding 500 lines to a new file produced ratio=500, collapsing median and p90 toward the maximum addition count rather than the signal. The bounded formula eliminates this distortion: the same commit correctly produces `(500-0)/(500+0) = 1.0`.

---

### Metric 8: Commit Message Quality Score

**Scored against the full commit message, not the subject line.** The original implementation
read `%s` alone, which mismeasured the older convention of a short subject with the
explanation in the body: postgres, git and curl scored 0 to 22 percent despite exemplary
commit hygiene. Re-measuring an identical 50-commit postgres window after the fix moved the
score from 22 to 94 percent with no other change, which isolates the effect cleanly.

**Trailing trailer blocks are stripped before scoring.** Reading the full body opened a
different hole: a body consisting only of `Key: value` trailers passed on word count alone.
nodejs/node commit `a159b570` has a six word subject and a body of nothing but `PR-URL:` and
five `Reviewed-By:` lines, and scored as quality, so a project with more reviewers scored
higher than one with fewer. Only the final paragraph is stripped, and only when every line in
it matches the trailer shape, so a body mixing prose with trailers still scores on its prose.

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

**No band (`code-quality-metrics-6ti`)**: `message_quality_pct` is reported descriptively, with
no healthy/critical boundary and no gauge. The era:current calibration data would still support a
two-band healthy bound (p25 66%, emberjs/ember.js the only repository near the low extreme), but
the scoring rule underneath it is exactly the comparison the literature has already run and lost.
Li and Ahmed (ICSE 2023, 185,026 Apache commits) regressed defect-introducing commits on semantic
What/Why quality versus commit message word count and found What/Why won at every window size,
with GLM coefficients differing by roughly two orders of magnitude (word-count volume ~0.0037;
What 0.117-0.483; Why 0.088-0.833). Barnett et al. (MSR 2016, 342 systems) found word count
significant in only 43% of systems with a median 4% of explanatory power, against 80% of systems
and up to 72% for their content metric. Separately, the `MESSAGE_QUALITY_MIN_WORDS` bar of 10 sits
above the population median in the largest published corpus available (CommitBench, 23,284,371
commits: median 11 T5 subword tokens, p25 = 6; T5 tokens run higher than words for the same text).
The metric is also bimodal in a way no band could represent: without Conventional Commits the
word branch fails most ordinary, well-explained commits and the score collapses; with it the
format branch passes nearly everything regardless of content. The number this metric reports
mostly answers whether the project has adopted Conventional Commits, not whether its messages are
good, so it is shown without a verdict (`lib/report.js`'s catalog entry, `concern` fixed at
`-Infinity` so it never competes with a scored metric in the relevance sort).

**Conventional Commits has no research basis, and AI drift may invert this metric**: Conventional
Commits (the `conventional` branch of the formula above) is a community specification that cites
no research, and no study available to this project validates it against any maintenance or
defect outcome -- its presence in this formula is a convention, not an evidence-backed criterion.
This matters specifically for a drift detector because of one further finding: Rabbi et al. (2026,
preprint, narrow corpus) measured AI-agent commit messages at 70.4% What-and-Why quality against
roughly 56% for the human baseline in the same corpus, while that quality score itself predicted
nothing about review outcomes. If coding agents reliably emit well-formatted, verbose commit
messages regardless of what the underlying change actually does, `message_quality_pct` could read
*higher* under heavier AI use even as other drift signals worsen -- an inverse drift indicator
rather than a confirming one. Neither finding changes what `message_quality_pct` computes in this
release; a semantic scoring rule is a larger change than a threshold edit and needs its own
decision (`code-quality-metrics-6ti`).

**Design decision: why not NLP**: Conventional commit classification requires a 3-line regex. Word count requires one line. Adding a 200KB+ NLP library (`compromise`, `wink-nlp`) for these two signals is unjustified. The regex approach is zero-dependency, faster, more maintainable, and easier to test.

**Limitations**: This metric cannot assess semantic quality. A message that says "feat: add user authentication for all supported OAuth providers" scores the same as "feat: a." The word-count threshold partially compensates, but it cannot detect technically-compliant messages that are still vague.

---

### Metric 9: Duplication Density (Two-Layer Detection)

**What it measures**: The share of scanned production code that is textually duplicated,
via `jscpd`, plus an optional second layer that asks Claude to find logic duplicated across
files in different words. Layer 1 (jscpd) runs unconditionally; Layer 2 (semantic) runs only
when `ANTHROPIC_API_KEY` is set.

**Formula (Layer 1)**: `jscpd`'s `statistics.total.percentage` — duplicated lines as a share of
lines scanned across the production files touched by the analysed commits, excluding files
matched by `DUPLICATE_IGNORE_PATTERNS`.

**CONFIG keys**: `DUPLICATE_MIN_LINES` (default: 5), `DUPLICATE_MIN_TOKENS` (default: 50),
`DUPLICATE_IGNORE_PATTERNS` (default: excludes `designs/`, `deps/`, `vendor/`, `third_party/`,
`node_modules/`, `generated/` and common lock files — added after a vendored `deps/` sync on
nodejs/node moved measured duplication from 5.12% to 15.09% with no change in practice).

**Thresholds** (`DUPLICATION_PCT` in `lib/thresholds.js`; three-band, corroborated at the
critical extreme by nodejs/node, postgres/postgres and curl/curl):
| Range | Signal |
|-------|--------|
| ≤ 6% | Healthy: at or below the 75th percentile of the benchmark |
| 6–6.5% | Warning |
| > 6.5% | Critical: at or above the worst value three reference repositories all produced |

**The literature does not support reading duplication as a defect signal.** Rahman, Bird and
Devanbu (MSR 2010, four C projects, 116-155 monthly snapshots each): "we find that clones may be
less defect prone than non-cloned code… Our findings do not support the claim that clones are
really a 'bad smell'", significant across all four projects and both parameter settings. Wagner
et al. (SANER 2016) found clone length does not predict faultiness (ρ = 0.268, p = 0.120). What
the harm literature actually implicates is *inconsistency between* clones over time, which
`jscpd` does not measure. This metric is retained as a drift signal (more duplication is a
plausible symptom of accepting AI-generated code without refactoring it), not as a validated
defect predictor, and no defect-risk claim should be attached to it.

**The 6% healthy line happens to be close to SonarQube's default quality gate (≤3.0% duplicated
lines density, a different number under the prior, uncalibrated band), but the comparison is not
apples-to-apples.** Sonar's default measures at a minimum of 100 duplicated tokens over at least
10 lines, applied to new code only. This toolkit measures at `DUPLICATE_MIN_LINES: 5` and
`DUPLICATE_MIN_TOKENS: 50` — half of Sonar's minimum in both dimensions — over the full contents
of the production files a commit window touched. Wagner et al. quantify what halving the minimum
clone size does on the same three systems: roughly a 3x increase in measured duplication (3.0% →
10.1%, 5.3% → 14.8%, 3.4% → 10.5%). Whether to raise this toolkit's minimums to match Sonar's, or
keep them and stop describing the result as Sonar-comparable, is a decision this document does
not make (`code-quality-metrics-k1g`); it is recorded here so the resemblance is not mistaken for
validation.

**Data source (Layer 2, semantic)**: Claude reads up to `AI_DUPLICATE_MAX_FILES` (40) production
files and returns pairs implementing the same logic in different words, each with a confidence.
The count varies between runs on identical input, so it is reported as a finding, never as a
confident zero: `layers_run.semantic` distinguishes "ran and found none" from "never ran" so a
failed or skipped call cannot be read as a clean result.

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
  AND test_coverage_rate > 50
  AND uncovered_prod_rate < 10
  AND message_quality_pct > 60

legacy-bottleneck:
  sprawling_commits_pct > 25
  AND large_commits_pct > 30

foundational-challenges:
  large_commits_pct > 40
  OR uncovered_prod_rate > 20

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
  commit_type: "feature_branch" | "trunk",  // "trunk" when the repo has no feature branches (see workflow_type below)

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
  workflow_type: "feature_branch" | "trunk",  // "trunk" when no feature branches exist; the default branch was analyzed directly
  branches_analyzed: string[],      // feature branches found, or [resolved default branch] when workflow_type is "trunk"
  branch_commit_counts: Record<string, number>,

  // Core metrics
  large_commits_pct: string,        // "XX.XX"
  sprawling_commits_pct: string,
  test_coverage_rate: string,       // commits with test AND prod files / total
  test_isolation_rate: string,      // commits with test files only / total
  uncovered_prod_rate: string,      // large commits with prod files only / total
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

  // Net additions ratio distribution (bounded [-1, +1])
  net_additions_ratio_median: number,
  net_additions_ratio_p90: number,

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

## Drift Report Generator

`generate-drift-report.js` turns a completed local analysis run into a
standalone HTML report, `local_drift_report.html`. It reads only
`local_metrics_summary.json` and `local_commit_metrics.json` from the target
directory; it does not shell out to git or recompute any metric from source.

### Threshold Source of Truth

`lib/thresholds.js` holds the healthy/warning/critical boundary for every
metric in a single `THRESHOLDS` object, for example
`LARGE_COMMITS_PCT: { healthy: 20, critical: 40 }`. Both `lib/metrics.js`
(which classifies individual commits and drives the console report and DORA
archetype logic) and `lib/report.js` (which builds the drift report's metric
catalog and gauge bands) read their boundaries from this same object. Moving
a number in `lib/thresholds.js` changes the console report, the report's
gauges, and the archetype classification together; there is no second copy
of a boundary to fall out of sync.

### Relevance-Sort Formula

Each metric in the report's catalog is scored for concern using:

```
concern = (value - healthyBoundary) / (criticalBoundary - healthyBoundary)
```

The catalog is sorted by this score, descending, so the report always leads
with whichever metric has drifted furthest past healthy, regardless of which
metric that happens to be.

- A negative concern means the value sits on the healthy side of the healthy
  boundary: not a problem right now.
- A concern between 0 and 1 means the value has crossed the healthy boundary
  but has not yet reached the critical boundary: a warning, proportional to
  how far across it has moved.
- A concern of 1 or greater means the value has reached or passed the
  critical boundary.

The same formula covers both directions without branching. For "higher is
worse" metrics (large commits, sprawling commits) `criticalBoundary` is
greater than `healthyBoundary`, so the denominator is positive. For "higher
is better" metrics (message quality, test coverage) `criticalBoundary` is
less than `healthyBoundary`, so the denominator is negative, which flips the
sign automatically for a low (bad) value.

A few catalog entries fall outside this formula because they are
informational rather than threshold-driven: test isolation rate and velocity
each carry a fixed negative concern value so they normally sort after every
threshold-driven metric. Commit size trend and velocity trend behave the same
way by default, but when the two combine into "growing commit size" plus
"accelerating velocity" (this toolkit's own drift hypothesis, not a DORA term), both are
flagged `warning` with a concern of `0.5` instead, so that joint signal
surfaces in the sorted list the same way a real threshold breach would.

### Findings Narrative

The Findings section's connecting prose is the only part of the report that
can be LLM-generated, via `lib/narrative.js`, and even then only the prose:
the system prompt instructs the model to echo every number it references
exactly as given, to the same precision, and never to compute, estimate, or
restate a number differently. The narrative layer never computes or alters a
number; it only writes sentences over metric values and top commits that
`lib/report.js` already computed before the model ever sees them. When no
`ANTHROPIC_API_KEY` is set, or the API call fails, or the response doesn't
parse into usable findings, the Findings section falls back to the same
plain templated bullets (`fallbackFindings` in `lib/report-template.js`): the
top three critical/warning catalog entries, rendered as
`"<label>: <value> (<status>)"`.

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
