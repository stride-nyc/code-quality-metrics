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

The 260/261 agreement is consistency within unit uncertainty rather than a clean replication:
Kolassa excludes blank lines and includes test files; this toolkit counts production lines only via
`git numstat`, which includes blank lines. The two biases pull in opposite directions and
land close together. Alali et al.'s gcc data puts the same percentile nearer 160 lines, so on
lines the anchor is one large corpus's position rather than a convergent constant; the file-count
anchor is the better-corroborated of the two. Neither source proposes these as healthy lines -- both are
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
- **Unvalidated reference choice.** The references were chosen because they are considered
  disciplined, and healthy was then defined as what they do. Choosing references and reading
  bands off their quantiles is how a reference benchmark works (it is Alves et al.'s own
  procedure), but nothing validates the choice itself, and reputation is not a measured
  outcome. This supports "no worse than these six" rather than "healthy".
- **Cross-project non-transfer.** Kamei, Fukushima, McIntosh, Yamashita, Ubayashi and Hassan
  (EMSE 2016, DOI 10.1007/s10664-015-9400-x, Table 6) found within-project just-in-time defect
  models score 0.74-0.83 AUC on their own project but fall as low as 0.38 AUC -- worse than
  random -- applied cross-project to the same eleven projects. That result bounds fitted
  prediction models; a benchmark quantile predicts nothing, so on an unseen project it fails
  by going uninformative rather than by scoring worse than chance. It remains the clearest
  published warning against carrying a project-derived number to a dissimilar project, so
  these bands describe these six repositories rather than generalizing beyond them.
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

### History Granularity and Commit-Unit Withholding

Nine of the metrics below treat one `git log` entry as one discrete unit of developer work:
large and sprawling commit percentage, the three-way test-coverage rates, p90 lines/files
changed, and the commit-size and velocity trends. Their healthy/critical bands (see Threshold
Provenance above) were calibrated against repositories with granular history, where that
assumption holds. It does not hold when a commit is actually a squashed pull request: one
"commit" then represents an unknown number of developer edits, so the band no longer describes
the thing being measured. `lib/report.js`'s `buildMetricCatalog` withholds the verdict on all
nine (`WITHHELD_WHEN_SQUASHED_KEYS`) rather than compare a whole-PR-sized value against a
per-commit band — the value is still reported, with `hasGauge: false`, `status: 'neutral'`, and a
`descriptiveNote` explaining why, but no healthy/warning/critical call is made.

**Detection.** `detectHistoryGranularity` (`lib/git.js`) estimates `history_granularity_detected`
from three signals over the analyzed commits: the share of subjects carrying a trailing
`(#N)`/`(GH-N)` pull-request reference, the share of committer names matching a squash-bot
pattern, and whether true merge commits are present (evidence *for* granular history, e.g. a
merge-button workflow, not a squash signal). A majority PR-reference share (`>= 0.5`) reports
`squashed` at `high` confidence; any smaller non-zero share reports `squashed` at `low`
confidence; zero share reports `granular`; zero commits reports `unknown`.

**Withholding rule (code-quality-metrics-drv).** `history_granularity_detected` alone is not
what withholding acts on. `resolveHistoryGranularityForWithholding` (`local-code-metrics.js`)
first checks `workflow_type`: commits unique to an unmerged feature branch
(`workflow_type: feature_branch`) are granular by construction — they have not been squashed
into anything yet — so the gate resolves `history_granularity` to `granular` for withholding
purposes regardless of what the raw PR-reference signal found. Only when `workflow_type` is
`trunk` does the raw detected value (falling back to `squashed` when `unknown`, preserving the
code-quality-metrics-bnq default: asserting a verdict against bands that don't apply is a worse
error than withholding one that would have been valid) reach the withholding decision. A
`--history granular|squashed` CLI flag overrides the resolved value for one invocation and is
recorded separately as `history_granularity_override`; `history_granularity_detected` always
reports what detection itself found, unaffected by either the gate or the override.

This matters because a single PR-referenced commit subject among many otherwise-granular
feature-branch commits — a cherry-pick from a squash-merged main, a rebase onto a squash-merging
main, or a developer simply typing an issue number — used to be enough to classify the entire
sample `squashed` and silence every one of the nine verdicts. Measured before this fix: 1 of 29
commits (3.4%) on remote_retro, 7 of 50 (14.0%) on daloopa, both `workflow_type: feature_branch`.

**Three candidate rules were considered; the workflow_type gate was chosen.** Acting on
confidence alone (withhold on `squashed`/`high`, caveat on `squashed`/`low`) does not resolve the
underlying category error: a low-confidence squashed *label* on feature-branch commits is still
describing something that structurally cannot be a squashed pull request, whatever confidence is
attached to the label. Raising the zero-share threshold above zero would need an invented, unvalidated
number with no natural boundary to derive it from. Gating on `workflow_type` needed no such
number: it rests on a structural fact (an unmerged branch's commits cannot yet be the squashed
result of a merge) rather than a tuned threshold. The trade this rule makes deliberately: a
feature-branch repository where every commit subject happens to reference a PR (for reasons
unrelated to squashing, e.g. an issue-tracker convention) now shows verdicts too, where the old
rule withheld them — a consequence of the same structural fact, not a special case carved out for
it. Trunk analysis of a repository that genuinely squash-merges is unaffected: those commits on
main really are whole pull requests, and the gate does not apply outside
`workflow_type: feature_branch`.

**Reporting the decision, not the discarded guess (code-quality-metrics-aoo).** The masthead's
history line used to pair the *resolved* value with the raw detector's own confidence — e.g.
"History: granular (low confidence)" — even on a `workflow_type: feature_branch` run, where the
resolved value came from the structural gate above, not from the low-confidence guess sitting
next to it. That reads as unsure about a fact that was never in doubt. `lib/report-template.js`'s
`resolveGranularitySentence` now states a plain-language sentence per state, naming a confidence
only when a detection genuinely produced the resolved value (`workflow_type: trunk`); a
`workflow_type: feature_branch` run states the structural fact with no confidence hedge at all.
The raw guess that gate discarded is not lost — `renderHistoryProvenanceLine` surfaces it in
Analysis Scope as provenance (e.g. "Detection guessed squashed pull requests... overridden
because the analyzed commits are unique to unmerged branches"), where it serves as an audit trail
rather than sitting in the masthead beside a value it does not describe. A human-supplied
`--history` override is unaffected by this change and keeps stating what was forced and what
detection itself found.

### Project Lifecycle and Change-Size Withholding

Four of the metrics above (large and sprawling commit percentage, p90 lines/files changed) and
duplication density carry a further bias, on an axis independent of history granularity: their
bands were calibrated against maintenance-era windows on six decades-old codebases
(`calibration/observations.json`'s `brownfield-only-lifecycle` reservation, high severity).
Lifecycle (greenfield vs. brownfield) and era (pre-AI vs. current) are separate axes, and only
era is represented in the calibration data. Large commits are disproportionately forward
engineering, and an initial build carries scaffolding, vendored dependencies and generated
files (Hattori and Lanza, EVOL 2008) — biasing `LARGE_COMMITS_PCT` and `P90_LINES_CHANGED`
toward a worse verdict; `DUPLICATION_PCT` is biased on arithmetic, since a small total-lines
denominator swings on a few blocks. `P90_FILES_CHANGED` sits in the same tile group for the same
underlying reason (an initial build's commits are unusually large and multi-file) even though
no single cited study isolates the files-changed count the way Hattori and Lanza isolate lines.

**Measured, not hypothetical.** flight-info-spike, a three-week greenfield spike (45 commits,
2026-04-27 to 2026-05-15), was labelled `legacy-bottleneck` with 48.89% large commits and 42.22%
sprawling commits before this change — graded against six mature projects doing maintenance.

**The decision (code-quality-metrics-31w): display the value, withhold the verdict.** Hiding
the tile was ruled out on the same evidence code-quality-metrics-tjn already established:
duplication vanished from an Elixir report because jscpd could not parse the language, and the
natural reading was a clean bill of health when nothing had actually been measured. `lib/report.js`'s
`buildMetricCatalog` reuses `withholdEntry` — the same function squashed history and a class B
config override already use — rather than adding a fourth shape. The note states that the
bands are quantiles of maintenance-era windows on decades-old codebases and do not transfer to
an initial build.

**Detection is a structural fact, not a tuned number.** `windowIncludesRepositoryRoot`
(`lib/git.js`) checks whether any analyzed commit's SHA is one of the repository's own root
commit(s), found by `git rev-list --max-parents=0 --all` in `local-code-metrics.js` and compared
against the whole analyzed set regardless of `workflow_type`. Unlike history granularity, no
feature-branch special case is needed: a commit's SHA either is one of the repository's roots or
it is not, independent of which ref found it — a genuinely new project bootstrapped directly on
an unmerged branch is still detected. `local-code-metrics.js` resolves this to
`project_lifecycle: 'initial-build' | 'established' | 'undetermined'`, reported alongside
`project_lifecycle_signals` (`window_includes_repository_root`, `repository_root_commit_count`,
`root_commit_detection_failed`) for audit.

**A failed root-commit query must not read as "established" (code-quality-metrics-dqri).**
`git rev-list --max-parents=0 --all` and `runGitCommand` both return `''` on success-with-no-output
and on failure, the same ambiguity code-quality-metrics-p4c fixed for `analyzeCommit`'s numstat
query. Left unfixed here, a failed rev-list read as "no root commit found," which is exactly
`established` -- silently defeating this section's own detection in the one case it exists to
protect: a genuine initial build whose root-commit query happens to fail. `findRepositoryRootShas`
(`lib/git.js`) calls `execSync` directly and reports whether the command itself threw, distinct
from whether its output was empty; `local-code-metrics.js` resolves that into a third
`project_lifecycle` value, `'undetermined'`, rather than defaulting to either `'established'` or
`'initial-build'`, neither of which the failed query ever confirmed. `lib/report.js` is
unmodified: its `WITHHELD_WHEN_GREENFIELD` gate checks for `'initial-build'` specifically, so
`'undetermined'` is treated the same as `'established'` for banding purposes (bands are applied,
not withheld) -- consistent with how `resolveHistoryGranularityForWithholding` above already
treats an undetermined history-granularity signal as the less-withholding default. What changes
is visibility: the failure is now legible in `project_lifecycle` and
`project_lifecycle_signals.root_commit_detection_failed` and logged to the console, rather than
reading as a confident, silent verdict either way.

**This detection depends on the root commit surviving analysis at all (code-quality-metrics-p4c).**
`windowIncludesRepositoryRoot` can only see a root commit's sha in `analyzedShas`, which is
built from `analyzeCommit`'s results; a root commit `analyzeCommit` drops never reaches the
check. django's actual root commit is an empty SVN-import artifact with a zero-byte
`git show --numstat` diff, and `analyzeCommit` used to treat that the same as a failed git
invocation — both produced empty stdout through `runGitCommand` — so it returned `null` and
the commit disappeared from `metrics` entirely. A window that structurally reached the
repository's own first commit then read as `established`, issuing band verdicts against a
greenfield window rather than withholding them, the exact failure this section exists to
prevent. `analyzeCommit` now asks whether `git show --numstat` itself succeeded (via a direct
`execSync` call, distinct from whether its output is empty) rather than treating empty
output as failure, so a genuinely empty commit is counted with zero additions, deletions and
files instead of dropped. See Metric 1's data-source note below for the corresponding
denominator decision.

**Why this rule over the other three candidates.** Repository age from first commit, total
commit count, and the ratio of the window's span to the repository's whole history were all
considered and rejected: each needs an invented age, count, or ratio boundary with no natural
place to draw it, joining the six figures this project has already withdrawn as unsourced or
untraceable. Whether the window includes the repository's root commit needs no such number —
it rests on a structural fact, the same reasoning `workflow_type` already applied to history
granularity above.

**Which way this rule errs, and why that is the right way round.** Withholding every tile this
gate touches (large/sprawling commit %, p90 lines/files changed, duplication density) costs a
reader most of the "Change size and scope" group; asserting a verdict against bands that do not
apply costs them a wrong one. This rule is built to almost never do the first to a real,
established repository: `local-code-metrics.js` is HEAD-anchored by default (the newest
`CONFIG.MAX_COMMITS`, 50, commits), so a mature repository's root commit is reachable inside the
window only once its whole recorded history is smaller than the window itself. Measured against
the four repositories copied for this ticket's own verification: 73V and remote_retro each carry
3,174+ total commits, daloopa 357, dotnetdependencytracer 1,321 — all far above 50, so none of
them trips the rule. The rule's failure mode is therefore a false negative, not a false
positive: a greenfield window that starts partway into a still-small project's history (an
explicit `--since` older than the repository but not old enough to reach commit zero, for
instance) is graded normally, exactly as it was before this change. That is the pre-existing,
already-documented bias this ticket opened against, not a new harm this rule introduces — so a
missed greenfield window costs nothing beyond leaving today's known bias in place, while a false
positive would cost a reader looking at a genuinely mature codebase every band on the page.

**The report says plainly what it is still for.** Withholding four of six "Change size and
scope" tiles plus duplication density leaves most of that group as ungraded numbers — honest,
but also the point a reader asks what the report is still for. `lib/report-template.js`'s
`renderLifecycleLine` states the answer in the masthead rather than leaving it to be inferred
from a screen of ungraded tiles: "This report shows shape and trend for those tiles, not a
grade."

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

**A genuinely empty commit counts in `total_commits` (code-quality-metrics-p4c)**: a
`git commit --allow-empty` commit, or a root commit that is itself an empty artifact (see
Project Lifecycle above), is a real commit the team or a migration tool made, which is
information rather than an error, so `analyzeCommit` reports it with `total_additions: 0`,
`total_deletions: 0`, `files_changed: 0`, `large_commit: false`, `sprawling_commit: false`
rather than dropping it. It therefore counts in the denominator of every commit-shape rate
in this file (large/sprawling commit %, the three-way test-coverage rates, and the
lines/files-changed distributions), which pulls those rates down slightly rather than
leaving them unaffected. That is the deliberate choice: excluding it would silently shrink
every rate's denominator the same way a dropped merge commit or a failed git invocation
does, and unlike those two cases an empty commit is not an error to exclude, it is a
zero-sized unit of work like any other. A merge commit (skipped to avoid double-counting
against its first parent, see the code comment in `analyzeCommit`) and a commit whose
`git show --numstat` invocation itself fails are the only cases still dropped from
`total_commits` entirely.

**CONFIG key**: `LARGE_COMMIT_THRESHOLD` (default: 100 lines)

**Thresholds** (`LARGE_COMMITS_PCT` in `lib/thresholds.js`; three-band, corroborated at the
critical extreme by nodejs/node and curl/curl -- see `calibration/`):
| Range | Signal |
|-------|--------|
| < 19% | Healthy: at or below the 75th percentile of the six-repository benchmark |
| 19–30% | Warning: above the benchmark's typical range |
| > 30% | Critical: at or above the worst value two reference repositories both produced |

**False positives**: Legitimate large commits include data migrations, bulk refactoring, large file additions (assets, generated code), and one-time cleanup. Context from `large_commit AND additions > deletions × 3` narrows to the AI-specific pattern.

**What the threshold selects, not a health boundary**: Robbes, Matricon, Degueule, Hora and Zacchiroli ("Agentic Much? Adoption of Coding Agents on GitHub," arXiv:2601.18341v2, 2026; 128,018 projects) report, for commits in projects with both file-level and commit-level coding-agent adoption, a median of 11 added lines and a third quartile of 41 for human-authored commits (n = 8,968,071), against a median of 31 and a third quartile of 114 for AI-assisted commits (n = 439,439). `LARGE_COMMIT_THRESHOLD: 100` sits above the human third quartile and just below the AI-assisted third quartile, so it selects roughly the top decile of human commits and roughly the top quartile of AI-assisted ones in that population. This describes what the boundary selects, not evidence that crossing it is harmful: Robbes et al. compare AI-assisted and human commits contemporaneously within AI-adopting projects at one point in time, not before and after AI adoption on the same projects, and report no defect, review, or maintainability outcome tied to either quartile. No source supports changing the 100-line boundary itself; only its selectivity is now measurable.

**A confound that matters more than the selectivity**: large commits are disproportionately not ordinary development. Hindle et al. (MSR 2008) hand-read 2,000 of the largest commits across nine projects and found the tail dominated by auto-generated documentation, branch merges, copyright-year sweeps, license changes, external module imports, and reformatting. D'Ambros, Lanza and Robbes (WCRE 2009) manually inspected the transactions in their three-system corpus that touched more than 100 classes and reported that "the vast majority... concerned license changes, Javadoc and documentation updates." Hattori and Lanza (ASE 2008) found bug fixes are the smallest commits in their nine-project corpus, not the largest. A rising large-commit rate can therefore reflect more vendoring or mechanical sweeps rather than more drift. This project's own calibration data hit the same pattern: `calibration/research-findings.md` records observation windows where a single vendored import dominated commit-size statistics.

**What `ANALYSIS_IGNORE_PATTERNS` fixes here, and what it does not (code-quality-metrics-y8j, -3yd, -1tp, -3b6)**: until this key existed, nothing let a vendored or generated path count as anything other than production code in `large_commit`, `sprawling_commit`, the line-count distributions, prod/test classification, or `uncovered_prod_rate` — `DUPLICATE_IGNORE_PATTERNS` only ever reached the duplicate detector. Measured on stride-nyc/dotnetdependencytracer: 789 of 1972 tracked paths are committed `bin/` and `obj/` build output, and one commit changed 560,857 lines across 196 files, landing in `avg_lines_changed`, `p90_lines_changed`, and both percentage rates with full weight. A repo can now list such paths in its own `.codemetrics.json` so they count as neither test nor production, and `local_metrics_summary.json` (`vendored_generated_share`) reports the share matching the existing vendored/generated defaults even when nothing is configured, so the distortion is visible before anyone has set anything.

The edge that remains: a human still has to notice the distortion and write the pattern. Nothing in this toolkit detects that a repository *should* configure `ANALYSIS_IGNORE_PATTERNS` and did not — `vendored_generated_share` reports what matches `DUPLICATE_IGNORE_PATTERNS`'s own defaults (`deps/`, `vendor/`, `third_party/`, `node_modules/`, `generated/`, lock files), which does not include `bin/`/`obj/` or any other build-output convention outside that list, so a .NET repository committing build output the way dotnetdependencytracer does gets no automatic flag from this share either, only from a human reading the raw size-shaped numbers and recognizing they look wrong. This is the same limitation the calibration method already lives with by hand: `calibration/observations.json` excludes a window only after a person notices and writes a note explaining why (two nodejs/node windows over a Web Platform Tests fixture import and a vendored dependency sync; one django window over a translations sync). State this plainly rather than implying the problem is solved: the mechanism exists now; the detection of when to use it does not.

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

**What the threshold selects, not a health boundary**: in the same Robbes et al. (2026) dataset cited under Metric 1, files touched has a median of 2 for both human and AI-assisted commits, with a third quartile of 3 for human commits and 4 for AI-assisted ones. `SPRAWLING_COMMIT_THRESHOLD: 5` sits above the third quartile for both populations, so a sprawl rate under 10 percent is close to automatic in either population and the metric has limited power to distinguish a healthier practice from a less healthy one. As with Metric 1, this is a statement about what the boundary selects, not a demonstrated harm from crossing it, and no source supports changing the 5-file boundary itself.

**The same mechanical-commit confound applies here, more directly**: Hattori and Lanza (ASE 2008), the source of the "more than 5 files" convention this threshold echoes, chose 5 for presentation (an exponential bucket boundary for a power-law distribution), not from any relationship to defects or maintainability, and found roughly 80 percent of commits in their nine-project corpus touch 5 or fewer files with no reference to project health. The same literature found bug fixes are the smallest commits, while the largest, most file-spanning commits are dominated by license changes, generated documentation, and merges (Hindle et al., MSR 2008; D'Ambros, Lanza and Robbes, WCRE 2009; both cited under Metric 1). A rising sprawl rate is therefore also consistent with more vendoring or dependency syncs, not more drift.

---

### Metric 3: Three-Way Test Coverage Classification

**What it measures**: Replaces the binary `test_prod_cochange_commit` (renamed from `test_first_indicator` under code-quality-metrics-36d) with three distinct commit categories, each carrying different signal quality for AI drift detection.

| Category | Formula | Per-commit flag | Summary field |
|----------|---------|----------------|---------------|
| Test Coverage | test AND prod files in same commit | `test_prod_cochange_commit` | `test_coverage_rate` |
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

**The same-commit heuristic is a published-noisy proxy for what this metric reaches for, which is
why the per-commit flag is named for co-occurrence rather than ordering.** `test_coverage_rate`
and `test_prod_cochange_commit` measure co-occurrence in one commit, not sequencing. The field was
previously named `test_first_indicator`, a name this project has withdrawn (code-quality-metrics-36d)
because it asserted an ordering the same-commit check cannot observe. Three peer-reviewed sources
support the withdrawal:

- Sun, Yan, Liu, Xia, Lei & Lo (TOSEM 32(6) art. 152, 2023, doi 10.1145/3607183) exist
  specifically to test whether same-commit co-occurrence identifies genuine test/production
  co-evolution and report "the pervasive existence of noise" in samples identified this way, with
  a six-category noise taxonomy.
- Borle, Feghhi, Stroulia, Greiner & Hindle (EMSE 2018, doi 10.1007/s10664-017-9576-3) make the
  same point in their own threats-to-validity section: "In a git history, test first could look
  like testing at the same time, or even testing later depending on how the git commits were
  formed."
- Marsavina, Romano & Zaidman (SCAM 2014, Section V.A) report that test changes triggered by a
  production change often land in a *later* commit rather than the same one, so "a number of
  subsequent commits have to be inspected" before the pairing this metric looks for would even
  appear.

`test_prod_cochange_commit` still means same-commit co-occurrence, exactly as coded in
`lib/git.js`, and the rename does not change what it measures or claim the noise these sources
document has been resolved -- it only stops the field's own name from making a claim (test-first
sequencing) the measurement cannot support. The rename also penalises, by omission, the deliberate
practice of landing a failing test and its production code as two separate atomic commits: that
practice looks identical to test-after work under this same-commit check.

Fucci, Turhan & Oivo (TSE 43(7):597-614, 2017) bear on the same question from a different angle: in
their controlled study, *sequencing* (the share of test-first development cycles) dropped out of
both their quality and productivity models, while *granularity* (cycle length) and *uniformity*
(consistency of cycle length) survived as predictors. That result points toward commit size and
batch consistency, both of which this toolkit already measures (Metrics 1 and 4), as the
better-founded proxies for the underlying practice this metric reaches for, rather than ordering.

**No study cited here relates a co-change rate to a defect or other quality outcome.** Nothing in
this section, or in `test_coverage_rate`'s calibrated band above, should be read as
quality-validated: the band says where this population's rate sits relative to a six-repository
benchmark, not that a higher rate produces fewer defects or higher quality code.

**DORA connection**: none directly. Automated testing is not among the seven capabilities in DORA's 2025 AI Capabilities Model (*State of AI-Assisted Software Development 2025*, p. 50), which names clear AI stance, healthy data ecosystems, AI-accessible internal data, strong version control practices, working in small batches, user-centric focus, and quality internal platforms. This metric rests on general software engineering practice, not on a DORA finding. An earlier version of this document called testing DORA's "single strongest predictor"; that claim was not supported by the report and has been removed.

---

### Metric 4: Lines Changed Per Commit (Distribution)

**What it measures**: The statistical distribution of commit sizes by line count. Distributions reveal patterns that averages conceal: a p90 of 500 lines with a p50 of 30 lines describes a "mostly disciplined with occasional explosions" pattern that an average of 65 lines hides entirely.

**Fields**:
```
p50_lines_changed    : median commit size (lines)
p90_lines_changed    : 90th percentile commit size
p95_lines_changed    : 95th percentile commit size
stddev_lines_changed : standard deviation (informational only -- see below; not a scored metric)
avg_lines_changed    : mean (informational only -- see below; kept for backwards compatibility)
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

**No band for `avg_lines_changed` (`code-quality-metrics-6dg`)**: `avg_lines_changed` and
`stddev_lines_changed` are reported descriptively, with no healthy/critical boundary and no
gauge -- `AVG_LINES_CHANGED` no longer has a key in `lib/thresholds.js` at all, and it is not
merely re-tiered. Three independent published fits agree the per-commit line-count population is
heavy-tailed with no finite mean: Kolassa, Riehle and Salim (SOFSEM 2013, Table 2; arXiv:1408.4974)
fit a Generalized Pareto Distribution to 8.7 million commits with shape ξ = 1.4617 (a GPD has a
finite mean only when ξ < 1 and finite variance only when ξ < 0.5 -- this population has neither);
Arafat and Riehle (HICSS 2009, Table 4) independently fit a power law with exponent −1.8612 on the
same underlying database; Hattori and Lanza (EVOL 2008, §3) confirm a Pareto fit by Q-Q plot for
files per commit across nine projects. Kolassa's own empirical table (Table 1) shows the practical
consequence directly: mean 465.72 sits above the reported 90th percentile (261) of the same
distribution, against a median of 16 -- the mean is not a stable center of this population, and
the standard deviation built on that mean is not a meaningful dispersion measure for a
distribution whose variance is itself undefined. This toolkit's own calibration data independently
rediscovered the same failure mode: `calibration/observations.json` records windows excluded
because a single vendored import or translation sync destroyed the mean while the percentile and
count metrics in the same window survived unaffected. The average and standard deviation are still
reported for reference -- removing the fields would be a breaking change to `local_metrics_
summary.json`'s schema for both GitHub Actions workflows and any other consumer -- but neither
carries a verdict; the percentiles below carry the load this band used to carry.

**Thresholds** (`P90_LINES_CHANGED` in `lib/thresholds.js`):
| Metric | Range | Signal |
|--------|-------|--------|
| `p90_lines_changed` | ≤ 260 | Healthy: at or below the 75th percentile of the benchmark (two-band; only nodejs/node sits near the extreme, so no critical bound is reported) |
| `p90_lines_changed` | > 260 | Warning |

**External anchor for `p90_lines_changed`**: Kolassa, Riehle and Salim (SOFSEM 2013, Table 1;
arXiv:1408.4974), an Ohloh.net snapshot of 8,705,118 commits across 11,143 projects, report a p90
of 261 LoC/commit -- one unit from the 260 derived here from an unrelated, six-repository dataset.
The agreement is consistency within unit uncertainty: Kolassa excludes blank lines and includes
test files, this toolkit counts production lines only and includes blank lines, and the two biases
pull in opposite directions. Alali et al.'s gcc data puts the same percentile nearer 160 lines, so
this is one large corpus's position, not a convergent constant. Neither source proposes 260 or 261 as a healthy line; both are descriptive
percentiles. What is citable is a position, not a boundary: this repository sits above the 90th
percentile of a large published open-source commit-size distribution, not that it has crossed a
review-effectiveness threshold.

**Limitation: sampling variance of a high quantile from a heavy-tailed distribution
(`code-quality-metrics-6dg`)**: No source reviewed by this project estimates the sampling
variance of a percentile computed on a heavy-tailed distribution, and this is a genuine gap in
the literature, not merely an omission here. This toolkit computes `p90_lines_changed` over
windows as small as 50 commits, where the empirical p90 is the 45th order statistic of that
window -- a single-sample estimate whose own variance is unknown and, given the tail shape above,
plausibly large. `calibration/derive-bands.js` compounds this by taking the 75th percentile of
twelve such per-repo p90 values to set the `healthy` bound: a percentile of a percentile, with no
published method to say how stable that second-order statistic is either. Hattori and Lanza make
a direct, related objection to splitting Pareto-distributed commit populations into quantiles at
all:

> "Since commits follow a Pareto distribution, it does not make sense to split them into
> quartiles, for example, because the number of commits with only one file is around the 50th
> percentile in most cases. Although we could use the approximate distribution function found for
> each project to calculate an exact division, this is not a generalized approach that could be
> directly applied to other open source projects." (EVOL 2008, §3, p. 4)

No published method reviewed here resolves either problem, and this toolkit does not attempt to
invent one. State the limitation plainly: `p90_lines_changed` and the calibrated band built on it
should be read as a rough position, not a precisely estimated boundary, and a project's own p90
can plausibly move a large amount between two 50-commit windows for reasons that have nothing to
do with a change in practice.

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

**Limitation: sampling variance of a high quantile from a heavy-tailed distribution
(`code-quality-metrics-6dg`)**: The same gap documented in Metric 4 applies here, and this is the
metric Hattori and Lanza measured directly: they count commit size in files, the exact unit of
this metric, over 72,351 commits across nine projects, and found "almost all q-q plots
approximate a straight line, which confirms that they follow a Pareto distribution" (EVOL 2008,
§3) before objecting explicitly to splitting such a population into quantiles at all (quoted in
full in Metric 4). `p90_files_changed` is computed over windows as small as 50 commits (the 45th
order statistic of that window), and `calibration/derive-bands.js` then takes the 75th percentile
of twelve such per-repo p90 values to set the `healthy` bound above -- a percentile of a
percentile, with no published method available to estimate how stable either statistic is on a
population this shaped. Read the resulting bound as a rough position, not a precisely estimated
boundary.

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

**Thresholds** (`DUPLICATION_PCT` in `lib/thresholds.js`; two-band, no corroborated critical
extreme: only curl/curl sits within 15% of the worst observed value):
| Range | Signal |
|-------|--------|
| ≤ 2% | Healthy: at or below the 75th percentile of the benchmark |
| > 2% | Warning |

Re-derived at `DUPLICATE_MIN_LINES` 10 and `DUPLICATE_MIN_TOKENS` 100 (`code-quality-metrics-8ad`).
The prior band, healthy 6 and critical 6.5 as three-band, was derived at 5/50 and left in place
when the detector was raised, so duplication was scored roughly three times more permissively
than the reference set warranted, against a critical line the re-measured data does not support.
**A band on this metric is comparable only at the detector settings it was derived at**, which is
now gated by `__tests__/thresholdProvenance.test.js`.

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

**Withholding when Layer 1's language is one jscpd cannot parse (code-quality-metrics-tjn)**:
jscpd does not recognize every language. Verified live against `remote_retro` (an Elixir
repository): two 30-line, obviously-duplicated `.ex` files still report
`statistics.total.sources: 0` at the configured `DUPLICATE_MIN_LINES`/`DUPLICATE_MIN_TOKENS`, and
still do at 1/1 -- jscpd exits 0 and writes a report shaped exactly like a genuine "0%
duplication, nothing to flag" measurement, because it recognized none of the scanned files at
all. Passing that through unchanged would report a language jscpd cannot parse as a confidently
healthy 0%, the same silent-zero shape this project has already fixed once for a truncated
semantic response (`code-quality-metrics-all`) and for squashed history's commit-unit verdicts.

`statistics.total.sources === 0` alone does not distinguish "unsupported language" from "every
scanned file happens to fall under the configured min-lines/min-tokens floor" -- both produce the
identical zeroed report. `runDuplicateAnalysis` (`lib/duplicate.js`) tells them apart with a
second, cheap jscpd pass with min-lines/min-tokens relaxed to 1, run only when the real scan
already came back at zero sources: a genuinely supported language registers at least one source
at that floor; an unsupported one still won't. This avoids the alternative of this project
maintaining its own copy of jscpd's roughly 223-language support list, which would drift from
jscpd's own list as it changes.

When the probe also finds zero sources, `runDuplicateAnalysis` returns `statistics: null` and
`unsupportedExtensions` (the distinct file extensions among the scanned files) instead of the
zeroed statistics object. `local-code-metrics.js` carries this into
`local_duplicate_analysis.json` as `unsupported_extensions`, and sets `layers_run.static` to
`'unmeasured'` rather than a confident `true` -- the same tri-state convention `layers_run.semantic`
already uses for its own failed/truncated case. `lib/report.js`'s `buildMetricCatalog` renders
`duplication_density_pct` as informational (`value: 'Not measurable'`, `status: 'neutral'`, no
gauge) naming the extensions found, instead of a silently omitted metric or a fabricated
0%/healthy verdict. **This bears on the band, not only the measurement**: `DUPLICATION_PCT` was
derived from C, JavaScript, Python and Go repositories, so for a language jscpd cannot parse, the
band is not merely inapplicable -- the measurement itself does not exist. A genuine zero-source
result (every scanned file *is* a supported language, just below the size floor at both the
configured and the relaxed settings) is not affected: it has no `unsupportedExtensions` field and
keeps its real, if trivial, `duplication_density_pct` verdict.

---

## Derived Metrics

### Per-Commit Outlier Flag (withdrawn)

**Status**: withdrawn under code-quality-metrics-496. This toolkit no longer computes or reports
a per-commit outlier flag. `local_commit_metrics.json` no longer includes an `outlier` field.

**What it used to measure**: whether an individual commit was a statistical outlier relative to
the rest of the analysis window, originally `outlier = size > mean + 2 × stddev`.

**Why it was withdrawn, not re-tuned**: the original rule was non-monotonic in the wrong
direction. Because mean and stddev are not stable statistics for this distribution (a generalized
Pareto with shape 1.4617 has no finite mean, and no finite variance above shape 0.5 — see Metric
4's heavy-tail discussion), adding one sufficiently large commit to a window pulled the cutoff up
enough to un-flag commits that were already flagged, even though those commits did not change
size. Measured on a 39-commit window (max 2925 lines): the cutoff was 1721, flagging
1800/2200/2925; adding one 6518-line commit raised the cutoff to 2867 and un-flagged 1800 and
2200; adding two more extreme commits raised it to 5873 and un-flagged 2925 as well. The worse the
drift in a window, the fewer commits the old rule flagged — the inverse of what the flag was for.

Two candidate replacements were measured and rejected in turn:

- **A bare p95 cutoff** (already computed, and the first candidate this issue proposed) inverts
  on the same reproduction: adding the 6518-line commit un-flags 2200 (cutoff moves 1840 → 2236).
  A window-relative percentile is still pulled toward a newly added extreme value near the tail.
- **A Tukey fence (Tukey, 1977) on log-transformed commit sizes**, at the "far out" 3×IQR
  multiplier, does not invert on that same reproduction (Q1/Q3 sit deep in the body rather than
  near the tail, so one added extreme value shifts them only by the gap between two pre-existing
  body values). But on the bug's own realistic window shape — a body itself spanning orders of
  magnitude (single-digit to several-hundred-line commits, median 90) rather than the narrow body
  used in the first reproduction — the log-scale IQR is large enough that the fence lands in the
  tens of thousands of lines: it required upward of ~28,600 lines to fire at all in that window,
  and never fired on the bug's own measured commits (1800–12000 lines). A rule that never fires on
  the distribution it targets passed a monotonicity test only because nothing was ever flagged —
  the same vacuous-green shape as an always-false predicate, just reached by a real formula rather
  than a stub.

A wider sweep (6 rules — Tukey at k=1.5/2/3 on raw values, Hampel at k=3/5/8 — over 3000
randomized heavy-tailed windows, each grown by appending 1–3 larger values) found every
window-relative rule violates monotonicity 45–70% of the time. An absolute cutoff scores 0%
violations by construction, because it does not depend on the window's contents, but no absolute
multiplier of `CONFIG.LARGE_COMMIT_THRESHOLD` has any empirical grounding — introducing one here
would reintroduce exactly the kind of unbacked magic number this toolkit removed elsewhere (see
code-quality-metrics-251 and code-quality-metrics-4hu). Consistent with how this project handled
`message_quality_pct`'s and `net_additions_ratio_median`'s bands (see Metric 7, Metric 8, and the
Key Metrics table in `CLAUDE.md`): when a construct cannot support its claim, the claim is
withdrawn rather than shipped in a weaker form.

**What still covers this need**: `p50_lines_changed`, `p90_lines_changed`, and
`p95_lines_changed` in `local_metrics_summary.json` describe the window's distribution without
claiming any single commit is exceptional. `large_commit` (Metric 1) remains as the absolute,
non-window-relative size flag — its threshold is a calibrated band position, not a per-window
statistic, so it does not have this monotonicity problem.

**Known residual**: `lib/git.js`'s `analyzeCommit` still stamps a placeholder `outlier: false` on
every commit object it returns; `local-code-metrics.js` deletes the field before writing
`local_commit_metrics.json` so the withdrawn construct does not resurface as a silent, permanent
`false`. Removing the placeholder at its source in `lib/git.js` is left as follow-up work, since
`lib/git.js` was out of scope for this fix.

---

### DORA Archetype Classification

**What it measures**: Which of four DORA-named team archetypes best describes the commit patterns in the analysis window. This is a heuristic classification based on four of the eight metrics above (large commits, sprawling commits, test coverage rate, uncovered prod rate), intended to contextualize threshold readings rather than replace them. Message quality plays no part in it: its own band was demoted to informational (see Metric 8), and scoring this archetype against an un-banded metric would reinstate the exact verdict that removal rejected.

**Classification logic** (evaluated in order; `classifyDoraArchetype` in `lib/metrics.js` reads each boundary directly from `THRESHOLDS` in `lib/thresholds.js`, not a separate copy, so a recalibration of any of these bands moves this classifier's boundary too):

```
harmonious-high-achiever:
  large_commits_pct < LARGE_COMMITS_PCT.healthy        (currently 19)
  AND sprawling_commits_pct < SPRAWLING_COMMITS_PCT.healthy   (currently 18)
  AND test_coverage_rate > TEST_COVERAGE_RATE.healthy  (currently 23)
  AND uncovered_prod_rate < UNCOVERED_PROD_RATE.healthy (currently 13)

legacy-bottleneck:
  sprawling_commits_pct > SPRAWLING_COMMITS_PCT.critical (currently 20)
  AND large_commits_pct > LARGE_COMMITS_PCT.critical      (currently 30)

foundational-challenges:
  large_commits_pct > LARGE_COMMITS_PCT.critical          (currently 30)

mixed-signals:
  (all other combinations)
```

`uncovered_prod_rate` is a two-band metric with no `.critical` value (see Metric 3), so
`foundational-challenges` has only the large-commit path above; it no longer has a second,
test-discipline path.

**Field**: `dora_archetype: "harmonious-high-achiever" | "foundational-challenges" | "legacy-bottleneck" | "mixed-signals"`

**Interpretation**:

| Archetype | Which rule fired |
|-----------|-----------------|
| `harmonious-high-achiever` | All four signals above stayed at or below (or, for test coverage, at or above) their healthy line |
| `foundational-challenges` | Large commits alone crossed its critical line |
| `legacy-bottleneck` | Sprawling commits and large commits both crossed their critical lines |
| `mixed-signals` | No combination above matched |

Earlier text in this section described what each archetype "suggests" about AI tool impact
(e.g. "AI tools likely amplifying positive outcomes," "AI making cross-cutting changes worse").
No source cited anywhere in this project supports that causal reading — DORA does not derive
these archetypes from commit shape at all (see "What it measures" above), and this toolkit's own
classification is four commit-shape percentages evaluated against calibrated bands, nothing more.
The table above states only which rule fired, matching the wording the rendered report itself now
uses (see below).

**Report placement (code-quality-metrics-bmg).** This classification used to render in the
report's masthead, above every metric tile — the first interpretive claim a reader met, and the
most prominent position on the page, for a construct with no validation behind its four-way
grouping (measured absurdity: a three-week-old greenfield spike, flight-info-spike, classified as
`legacy-bottleneck`). `lib/report-template.js`'s `renderArchetypeSection` now renders it below the
"Commit messages" metric group, in a block explicitly marked "under development," with two
changes to the text itself: it names which of the four signals crossed which line
(`archetypeSignalPhrase`) rather than asserting what the combination "points to," and it states
plainly, in the block itself, that the four-way grouping is this toolkit's own invention, not
something DORA publishes from commit data. The classification is still computed exactly as
described above; only its report weight and wording changed.

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

Two kinds of gap, and the difference matters: some signals need data this toolkit never sees,
others need only analysis nobody has built yet on data already in reach. A gap of the second
kind is a statement about this toolkit's backlog, not about the data sources.

### Gaps in the data (the toolkit never sees it)

1. **DORA delivery metrics** (deployment frequency, lead time, change failure rate, MTTR): Require integration with CI/CD pipelines and incident tracking systems. DX and LinearB provide these for organizations that want full lifecycle visibility alongside git-level analysis.

2. **AI tool usage specifics**: Which AI tools are being used, how frequently suggestions are accepted, and which patterns come from which models require IDE telemetry. This is not available in git history.

3. **DORA capabilities 1, 2, 3, 6, 7**: Organizational AI stance, data ecosystem quality, internal knowledge accessibility, user-centric focus, and platform quality all require organizational survey data or infrastructure telemetry. DORA measures these through their survey instrument.

4. **Developer well-being and burnout**: DORA research shows that AI adoption affects developer well-being, which in turn affects all other metrics. This requires survey data.

### Gaps in the analysis (the data is in reach; the analysis is unbuilt or partial)

1. **Structural clone detection**: Token-level duplication is measured (jscpd at SonarQube's minimum clone size, over the production files the analyzed commits touched; see Duplication Density above), and the optional Claude pass catches some duplicates rebuilt with different names or structure. What remains unbuilt is AST-level detection of restructured clones; GitClear is the specialized commercial solution.

2. **Code review quality**: Reviewer count, comment depth, and review turnaround time are available via the GitHub API, and `pr-metrics.yml` already runs with API access in the same context that posts the PR comment. Unmeasured rather than unreachable (`code-quality-metrics-5w1`). The local script has no access to review data.

3. **Architectural boundary violations**: Detecting whether code crosses architectural boundaries (service layers, domain boundaries, module dependencies) requires a dependency graph over source that is already checked out. With the Claude API enabled the toolkit gets a semantic approximation; without it, only the structural proxies (sprawl, large commits).

---

## Configuration Reference

Detector and analysis settings live in the `CONFIG` object in `lib/config.js`; the calibrated
verdict bands live in `THRESHOLDS` in `lib/thresholds.js`. Each file is the single source of
truth for its kind of value: the local script and both GitHub workflows `require()` them
directly, so a change propagates everywhere with no second location to update. Per-repo
overrides go in the target repository's `.codemetrics.json` (see AGENTS.md, "Per-Repo
Configuration Overrides"); overriding a class B key withholds the affected verdict. Key
`CONFIG` defaults:

```javascript
const CONFIG = {
  // Analysis window. The default is HEAD-anchored: the newest MAX_COMMITS commits
  // regardless of calendar date (code-quality-metrics-g10). ANALYSIS_DAYS applies
  // only when --days sets an explicit calendar window.
  ANALYSIS_DAYS: 30,                  // calendar window when --days is passed explicitly
  MAX_COMMITS: 50,                    // maximum commits to analyze (most recent first)

  // Commit size thresholds
  LARGE_COMMIT_THRESHOLD: 100,        // lines changed threshold for large_commit flag
  SPRAWLING_COMMIT_THRESHOLD: 5,      // files changed threshold for sprawling_commit flag

  // Paths excluded from the commit-shape metrics entirely (code-quality-metrics-y8j):
  // a matched path counts as neither test nor production. Default is empty, deliberately --
  // see "What ANALYSIS_IGNORE_PATTERNS fixes here, and what it does not" above.
  ANALYSIS_IGNORE_PATTERNS: [],

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

  // Excluded and vendored/generated volume (code-quality-metrics-1tp, -3b6). Excluded fields
  // are 0 unless ANALYSIS_IGNORE_PATTERNS is configured; vendored_default_* is computed
  // always, against DUPLICATE_IGNORE_PATTERNS's own defaults, regardless of configuration.
  excluded_files_count: number,
  excluded_additions: number,
  excluded_deletions: number,
  vendored_default_files_count: number,
  vendored_default_additions: number,
  vendored_default_deletions: number,

  // Derived flags
  test_prod_cochange_commit: boolean,
  large_commit: boolean,
  sprawling_commit: boolean,
  change_ratio: string,         // "X.XX" or "inf"
  commit_type: "feature_branch" | "trunk",  // "trunk" when the repo has no feature branches (see workflow_type below)
  // Note: no `outlier` field. The per-commit outlier flag was withdrawn (code-quality-metrics-496);
  // see the Derived Metrics > Per-Commit Outlier Flag (withdrawn) section above.

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
  analysis_period_days: number,     // options.days ?? CONFIG.ANALYSIS_DAYS; carried for backward compat, does not by itself mean a day-based boundary was applied -- see window_requested_since
  total_commits: number,
  filtered_from: number,            // unique commits before MAX_COMMITS cap

  // Analysis window (code-quality-metrics-g10): the actual span covered by the analyzed
  // commits, never the requested window or "today". null window_requested_since means the
  // run was HEAD-anchored from the start (no --since/--days given); a non-null value with
  // window_widened false means the requested date boundary is exactly what was used
  // (backward-compatible with pre-g10 behavior); window_widened true means an explicit
  // --since/--days window returned zero commits and was widened to the newest MAX_COMMITS,
  // ignoring the requested boundary. See CLAUDE.md's "Analysis Window" section.
  analyzed_span_start: string,      // "YYYY-MM-DD", the oldest analyzed commit's date
  analyzed_span_end: string,        // "YYYY-MM-DD", the newest analyzed commit's date
  window_requested_since: string | null,
  window_widened: boolean,

  workflow_type: "feature_branch" | "trunk",  // "trunk" when no feature branches exist; the default branch was analyzed directly
  branches_analyzed: string[],      // feature branches found, or [resolved default branch] when workflow_type is "trunk"
  branch_commit_counts: Record<string, number>,  // commits fetched per branch before global selection -- in HEAD-anchored mode this saturates at MAX_COMMITS for any branch with that many commits ever, so it no longer means "how much this branch contributed"; see analyzed_branch_commit_counts for that

  // Branch spread (code-quality-metrics-8sq): how many of the analyzed commits actually came
  // from each branch, and how many distinct branches that is. A sample spread across many
  // long-abandoned branches (measured: remote_retro, 29 across 30; dotnetdependencytracer, 50
  // across 49) holds no signal about shipped practice. No filter is applied; this is
  // visibility only -- see CLAUDE.md's "Branch Spread" section.
  analyzed_branch_commit_counts: Record<string, number>,
  branches_with_analyzed_commits: number,

  // History granularity (code-quality-metrics-bnq, code-quality-metrics-drv): see "History
  // Granularity and Commit-Unit Withholding" below for what each field means and how
  // history_granularity is resolved from history_granularity_detected.
  history_granularity: "granular" | "squashed",             // used to decide withholding; a --history override wins here
  history_granularity_detected: "granular" | "squashed" | "unknown",  // detectHistoryGranularity's raw verdict, unaffected by the override or the workflow_type gate
  history_granularity_confidence: "high" | "low",
  history_granularity_signals: {
    pr_reference_share: number,       // share of subjects carrying a trailing (#N)/(GH-N) reference
    squash_committer_share: number,
    merge_commit_count: number
  },
  history_granularity_override: "granular" | "squashed" | null,  // the --history CLI flag, if passed

  // Project lifecycle (code-quality-metrics-31w): see "Project Lifecycle and Change-Size
  // Withholding" above. A purely structural detection -- no confidence axis and no override,
  // unlike history_granularity above, since there is no raw guess to resolve or overrule.
  // "undetermined" (code-quality-metrics-dqri) is a third, distinct value: the repository-root
  // query itself failed, so neither "initial-build" nor "established" was ever confirmed.
  project_lifecycle: "initial-build" | "established" | "undetermined",
  project_lifecycle_signals: {
    window_includes_repository_root: boolean,  // windowIncludesRepositoryRoot's raw verdict
    repository_root_commit_count: number,      // `git rev-list --max-parents=0 --all`'s count
    root_commit_detection_failed: boolean       // true when that command itself failed, not
                                                 // when it succeeded and simply found none
  },

  // Excluded and vendored/generated volume (code-quality-metrics-3b6): a silent exclusion
  // is the same defect class as the silent inclusion code-quality-metrics-y8j fixes.
  analysis_exclusions: {
    patterns: string[],             // effective ANALYSIS_IGNORE_PATTERNS, [] by default
    excluded_files_count: number,
    excluded_lines_count: number,
    excluded_lines_pct: string      // "XX.XX", share of total lines analyzed
  },
  vendored_generated_share: {
    patterns: string[],             // DUPLICATE_IGNORE_PATTERNS's own defaults, always non-empty
    files_count: number,
    lines_count: number,
    lines_pct: string               // "XX.XX", computed even when nothing is configured
  },

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
metric that carries one in a single `THRESHOLDS` object, for example
`LARGE_COMMITS_PCT: { healthy: 19, critical: 30 }`. Message quality and net
additions ratio carry no key here at all — both were demoted to
informational, reported without a verdict (see each one's own comment in
`lib/thresholds.js` and Metrics 7 and 8 below). Both `lib/metrics.js`
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
restate a number differently.

A first pass at verifying this (code-quality-metrics-ll1) misread its own
evidence: it compared a report rendered at one point in a session against
catalog data from several hours later, after an unrelated threshold
re-derivation and field rename had already landed in between, and concluded
from the mismatch that the model had fabricated a duplication boundary, a
concern score, and a field name. It had not -- every value it echoed was
correct for the catalog state that actually produced that report; the two
snapshots were simply never comparable. Re-measured against a single
consistent run, three things were real: raw unrounded floats reaching the
reader's prose (`0.4108463434675432%`), the internal `concern` sort
sentinel (`lib/report.js`'s `computeConcern`) quoted as if it were a
reader-facing score, and `message_quality_pct` -- an entry the catalog
deliberately marks informational, with no healthy/critical band --
presented under "Concern" anyway. A better-worded prompt cannot make an
LLM's output verifiable regardless of which defect turns out to be real;
only a generated-output check can, so one now runs on every call:

- `buildNarrativePayload(catalog)` is what is actually sent to the model, not
  the raw catalog. It strips `concern`, `hasGauge` and `tier` (rendering/sort
  internals a reader should never see quoted), rounds `value`,
  `healthyBoundary` and `criticalBoundary` to two significant figures
  (`narrativeValue`, code-quality-metrics-5qn) -- deliberately not the same
  rounding the report's own cards use (`formatValue`, two fixed decimal
  places, `lib/report-template.js`): a rate or line count drawn from a
  45-commit sample does not support "62.22%" or "578.5 lines" (both real
  quoted examples), so a value at that scale collapses to a round number the
  way a reader would say it aloud (62.22 -> 62, 578.5 -> 580). A value that
  already has two significant figures or fewer -- a ratio like
  `net_additions_ratio_median`'s 0.2, or its own 0.63/0.79 boundaries -- is
  left untouched, with no separate magnitude check needed: rounding an
  already-short number to two significant figures reproduces it exactly,
  unlike rounding to a fixed number of decimal places, which would collapse
  a value below 1 toward zero. `buildNarrativePayload` also attaches each
  entry's `lib/metric-descriptions.js` prose, and marks `verdict: 'none'` on
  an entry only when BOTH its `direction` is `'informational'` or `'special'`
  AND its `status` has not reached `'warning'`/`'critical'` this run
  (code-quality-metrics-i39). This distinguishes two things `'informational'`
  used to collide under one rule keyed on direction alone:
  `message_quality_pct`, `net_additions_ratio_median` and
  `avg_lines_changed` have `status` hardcoded `'neutral'` because their
  construct cannot support a verdict at all (their band was withdrawn on
  evidence), so they are always marked. `commit_size_trend` and
  `velocity_trend` are `'informational'` by default but carry a real
  composite-rule `status` (`'warning'` when `lib/report.js`'s
  `growingAndAccelerating` rule fires) -- the tool itself raised that
  concern, so prose reporting it must be presentable, and keying on status
  as well is what lets it through. `test_isolation_rate` (direction
  `'special'`) is still always marked: it is scored `'good'`/`'neutral'`
  only, never `'warning'`/`'critical'`, so the status half of the check
  excludes it on its own. A real scored metric (`direction`
  `'higher-is-worse'`/`'higher-is-better'`) is never marked regardless of its
  current status -- direction still gates this, so a scored metric sitting
  at `'good'` this run is never mistaken for a withdrawn-band entry. Measured
  on 5 real repository runs, keying on direction alone rejected the
  toolkit's own named drift signal (growing commit size plus accelerating
  velocity) in 4 of 5. The user message also states once, up front, that
  healthy/critical are benchmark quantiles, not validated outcome thresholds
  (see "What a band means" above).
- `validateNarrative(bullets, payload, topCommits)` checks the model's
  flattened response against that same payload before it is ever returned.
  It rejects (fails the render's narrative step, not merely warns) if any of
  the following is true:
  - a bullet cites a number, at whatever precision it wrote, that does not
    appear anywhere in the catalog payload or the top-commits payload;
  - a bullet names exactly one payload entry by label, that entry actually
    has a boundary at the cited tier, and the bullet attributes a number to
    that metric's "healthy boundary" or "critical boundary" which does not
    match that metric's own `healthyBoundary`/`criticalBoundary` field --
    catching a real value (e.g. a metric's own `value`) mislabeled as its
    boundary, which a presence-only check cannot, since the digit is
    genuinely present just not in that role. Deliberately narrow: it only
    fires on that literal phrasing, tied to an unambiguous single-metric
    label match, rather than attempting to parse what every number in open
    prose means (code-quality-metrics-ll1 follow-up item 2). The
    "actually has a boundary at the cited tier" half was added after a real
    daloopa run misattributed a "healthy boundary of 260" phrase to
    `commit_size_trend` (which has no boundary of any kind) purely because
    its label happened to precede the phrase, while the true subject
    (`p90_lines_changed`) was paraphrased rather than quoted verbatim and so
    never precedes it literally (code-quality-metrics-i39). Requiring
    boundary eligibility only narrows the candidate pool, so it cannot
    introduce a new false rejection;
  - a bullet quotes one of the payload's internal `key` values verbatim
    (e.g. `test_prod_cochange_commit`) instead of its human-readable
    `label` -- a snake_case identifier has no legitimate reason to appear in
    reader-facing prose (follow-up item 3);
  - a bullet labeled "Concern" names a metric the payload marked
    `verdict: 'none'`, excluding a label that is itself a text substring of
    some other, currently-scored label (e.g. `velocity_commits_per_day`'s
    "Velocity" is a substring of `velocity_trend`'s "Velocity trend"): a
    model writing the shorter, bare word is not more likely naming the
    never-scored entry than the scored one whose label contains it
    (code-quality-metrics-i39, measured against real flight-info-spike and
    dotnetdependencytracer runs).
- On rejection, `generateFindingsNarrative` logs the reason and returns the
  same deterministic fallback described below, prefixed with a
  `"Narrative rejected: <reason>"` bullet -- visible in the rendered report,
  not a silently swallowed failure. A silent fallback is how the measured
  defect went unnoticed in the first place.
- The API call's `max_tokens` is `CONFIG.NARRATIVE_MAX_OUTPUT_TOKENS` (8192),
  not a literal in `lib/narrative.js`. The original 1024 cap was measured,
  not assumed, to be too tight once `lib/metric-descriptions.js` prose was
  added to the payload: 23 live calls against two real catalogs produced 0
  outright truncations, but output usage reached 855 of the 1024-token
  budget (83%) on the payload carrying the full pipeline's 10 top commits --
  thin enough that an occasional truncated, unparseable response is expected
  under ordinary response-length variance (follow-up item 1).

The narrative layer still never computes or alters a number itself; it only
writes sentences over metric values and top commits that `lib/report.js`
already computed before the model ever sees them. The check above verifies
that promise held, rather than assuming it. When no `ANTHROPIC_API_KEY` is
set, the API call fails, the response doesn't parse into usable findings, or
validation rejects it, the Findings section falls back to the same plain
templated bullets (`fallbackFindings` in `lib/report-template.js`): the top
three critical/warning catalog entries, rendered as
`"<label>: <value> (<status>)"`.

**Readability (code-quality-metrics-5qn).** Passing validation is necessary
but not sufficient -- a bullet can cite every number correctly and still be
unreadable to someone who has not seen this tool before. Real generated
prose, read before this change, showed five specific problems: jargon never
explained ("p90", "the upper tail", "sprawling"), two decimal places on a
rate from a 45-commit sample ("62.22%"), a "healthy boundary of N" restated
in nearly every bullet, a sentence that opens with the metric name and number
before saying what either means, and no bullet ever stating what "healthy"
actually means. `NARRATIVE_SYSTEM_PROMPT` now instructs the model, in
priority order: lead with the consequence rather than the metric name;
explain "p90" the first time it appears, reusing each entry's own
`description.measures` wording rather than inventing new phrasing; state the
healthy/critical comparison where it earns its place rather than in nearly
every bullet; say once, not repeatedly, that "healthy"/"critical" describe a
position among six benchmark repositories rather than a validated threshold;
and never present an entry the payload marked `verdict: 'none'` as a Concern,
even as supporting color in a sentence about a real one. A final rule caps
all four: none of this is license to sound more certain than the data
supports -- rounding a number or explaining a term in plain words must never
add confidence the catalog itself does not carry. Prompt wording is not
unit-testable the way `buildNarrativePayload`'s shape and `validateNarrative`'s
rejection behavior are; this file records the intent, and the rejection rate
measured across real repository runs (unchanged or improved, never worse, is
the bar) is what confirms the prompt change did not trade readability for
fabrication.

### Report Layout (code-quality-metrics-g39, -aoo, -bmg)

Rendered top to bottom, `lib/report-template.js`'s `renderReportHtml` now produces: masthead
(title, `workflow_type`, commit count and branch-spread count, actual span, history-granularity
sentence) → a deterministic top summary → the five metric groups (Metrics 1-8's headings) →
the archetype block, marked under development → Flight Log → Duplicate Code → Findings → Analysis
Scope → footer. Three things moved out of the masthead to get there: the branch name list and
the archetype verdict (both used to render there, before a reader reached a single metric), and
Analysis Scope itself (used to render immediately after the masthead, before every metric tile).
The commit count, branch-spread count, and actual span stay in the masthead — code-quality-
metrics-8sq's own reasoning for keeping the branch-spread count next to the commit count
(a thin sample across many idle branches is real information) still applies regardless of where
the branch names themselves render.

**Top summary.** A short paragraph, right after the masthead, links down to Findings via a
`#findings` fragment matching an `id="findings"` on the Findings heading. Built by
`renderTopSummary` deterministically from the already-computed catalog -- no model call, no
free-form text -- so it carries the same non-fabrication guarantee `validateNarrative` enforces
for the LLM-generated Findings narrative, by construction rather than by a runtime check: every
word is fixed template text, and every number either comes directly from a catalog entry
(`value`/`label`/`status`) or `summary.vendored_generated_share`, or is a count of catalog
entries matching a status already computed from that same catalog (the one arithmetic step this
function performs, and a provably correct tally rather than new information). Because it never
reads the findings narrative argument, its content is identical whether that narrative below was
accepted or fell back to `fallbackFindings`, and it never states more than `fallbackFindings`
already would for the same catalog. When `summary.vendored_generated_share.lines_pct` is at or
above 25% (a documented design choice, not a calibrated boundary -- see
`VENDORED_SHARE_CALLOUT_THRESHOLD`), the summary calls it out explicitly, since Analysis Scope no
longer sits near the top where a reader would otherwise see it (measured: flight-info-spike
reports 72%, reframing its large-commit and sprawl figures).

**Archetype block.** See "DORA Archetype Classification" above for the reworded text itself;
this section covers only its position. It renders below the "Commit messages" metric group, in a
block headed "Team archetype (under development)," rather than in the masthead.

**Analysis Scope.** Still built by `renderExclusionsSection`, carrying `analysis_exclusions` and
`vendored_generated_share` exactly as before, plus two additions: the branch name list
(`branches_analyzed`, relocated from the masthead) and, when `workflow_type: feature_branch`
structurally overrode a non-granular raw detection, a provenance line naming what detection
guessed and why it was overridden (`renderHistoryProvenanceLine`, see "History Granularity and
Commit-Unit Withholding" above). Because the section now always has the branch list to show on
any real run, it is omitted only when a summary has none of its four possible contents at all
(exclusions, vendored share, branches, or a discarded detection) -- previously it was omitted
whenever exclusions and vendored share were both absent, which does not describe what the
section renders any more.

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
