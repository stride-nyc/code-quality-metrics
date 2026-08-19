# Metric revision brief

**For**: a coding agent producing an analysis and implementation plan.
**Status**: no change below has been made. This is a change register, not a changelog.
**Written**: 2026-08-18, from `calibration/research-findings.md`.

## What you are being asked to do

Nine literature searches established what published research does and does not support for the
thresholds in this toolkit. The findings are in `calibration/research-findings.md`, with citations,
verbatim quotes, units and populations for every figure, and a search record wherever nothing was
found. **Read the header section of that document (lines 1-283) before planning.** The per-question
sections are reference material; consult the ones relevant to whatever you take on.

Your job is to turn that evidence into a plan: what changes, in what order, with what tests, and
which decisions have to go back to a human first.

Do not treat this brief as settled scope. Three of the changes below alter what a metric *computes*,
not just what band it is scored against, and those need a human decision before implementation. They
are marked **DECISION REQUIRED** and you should plan around them, not through them.

## Ground rules

From `CLAUDE.md` (both the repository's and the user's global working agreement), and from the
research brief's beads section:

- **TDD, no exceptions.** Before any implementation, state the test name, the behaviour under test,
  and the exact expected failure. Run it red. If the actual failure differs from the predicted one,
  stop and diagnose. Compilation errors are not RED; stubs must exist and compile.
- **One failing test at a time.** One concern per commit, conventional commit format.
- **Never lower coverage thresholds to make tests pass.** Current gates: 80% lines, 90% functions.
- **`lib/config.js` and `lib/thresholds.js` are shared by three components** — the local script and
  both GitHub Actions workflows `require()` them directly. Grep for every usage before changing a
  value or a key name. A rename is a three-component change.
- **Track work in beads.** Issues already exist for most of what follows; the IDs are given per
  change. Search before creating (`bd search <keyword>`), link new work with
  `--deps discovered-from:<id>`, and never use `bd edit` (it blocks on $EDITOR).
- **Do not commit anything under `.beads/`.** `issues.jsonl` and `interactions.jsonl` regenerate on
  every write and produce merge conflicts.
- **Do not commit or push without explicit authority.** Report a handoff instead.

## The evidence in one paragraph

No published source supplies a boundary number for any threshold in this toolkit. Two useful things
do exist: published commit-size *distributions* that let the toolkit position itself against
something outside its own six reference repositories, and a published *method* citation for the
benchmark-percentile approach it already uses (Alves, Ypma & Visser, ICSM 2010, DOI
10.1109/ICSM.2010.5609747). More consequentially, four metrics rest on premises the literature
contradicts rather than merely fails to support: duplication rate, the net additions ratio, test and
production co-change, and commit message quality. Details and citations are in the findings
document; each change below points at the specific evidence.

## Change register

Five tiers. Tier 1 is safe and should land first; each later tier depends on decisions or carries
more risk. Within a tier, changes are independent unless noted.

---

## Tier 1 — Reframing. No behaviour change, no threshold moves.

This is the highest-value work in the brief and none of it touches a computed value. It changes what
the toolkit *claims*, which is currently stronger than the evidence supports.

### 1.1 Adopt the benchmark-quantile framing and cite its method

**Beads**: `code-quality-metrics-9j5`

**What.** The bands are quantiles of a benchmark of reference systems. That is an established
published method, and the project should say so and cite it. Alves et al. are explicit that the
method is outcome-agnostic:

> "In contrast to using errors to derive thresholds, our methodology derives meaningful thresholds
> which represent overall volume of code from a benchmark of systems." (§II-C)

They list outcome validation as future work. That is exactly the claim this project should make: the
bands mean "unusual relative to these peers", not "unhealthy".

**Where.** `calibration/README.md`, the Threshold Provenance section of `metrics-specification.md`
(around line 43), `CLAUDE.md`'s threshold table preamble, and the coverage map
`ai_drift_metrics_coverage_map.html`.

**Note the scale gap, and state it.** Alves used 100 systems and ~12 MLOC. This project uses six
repositories and twelve windows. The method transfers; the strength of the claim does not.

**Verification.** Documentation only. No test. Confirm no document still describes a band as
"healthy" without qualification.

### 1.2 Fix the superseded derivation rule in `calibration/README.md`

**Beads**: `code-quality-metrics-xeh`

**What.** `calibration/README.md` documents a rule the code no longer implements. It says `healthy`
= the worst value any included reference produced, and `critical` = healthy × 2, "a stated
convention, not a measurement". Neither is what `derive-bands.js` does. The code computes `healthy` =
p75 of observations (p25 for higher-is-better) and `critical` = the max observed value, reported only
when a second repository sits within `NEAR_EXTREME_FRACTION` (15%) of that extreme, otherwise null.

`calibration/derive-bands.js:27` names the change explicitly, calling it a supersession of "the
earlier rule which took the single worst observation as healthy".

**Consequence if unfixed.** A reader following the README mis-derives every band and expects a
critical bound at 2× healthy that the code never produces.

**Also.** `metrics-specification.md`'s derivation section is closer but still imprecise: it describes
the two-band case as "where the worst value rests on a single repository", which omits the 15%
corroboration band that actually decides the tier.

**Verification.** Documentation only. Cross-check every stated rule against `derive-bands.js`.

### 1.3 Add the two external anchors that exist

**Beads**: `code-quality-metrics-ck3`

**What.** Two bands now have external corroboration — the only two in the toolkit. Cite them, with
the unit mismatches stated honestly.

| Band | Current | External comparison | Source |
|---|---|---|---|
| `P90_LINES_CHANGED.healthy` | 260 | p90 = **261 LoC/commit** over 8,705,118 commits in 11,143 projects | Kolassa, Riehle & Salim, SOFSEM 2013, Table 1; arXiv:1408.4974 |
| `P90_FILES_CHANGED.healthy` | 9.5 | ~90% of changes modify fewer than **10 files**, over ~9M changes | Sadowski et al., ICSE-SEIP 2018, §5.2, DOI 10.1145/3183519.3183525 |
| | | gcc p90 ≈ **8 files** (derived from published frequencies) | Alali et al., ICPC 2008, Table 2 |

**Do not overclaim.** The 260/261 agreement is partly coincidental: Kolassa excludes blank lines and
includes test files, this toolkit does the reverse, and the two biases pull in opposite directions.
Neither source proposes a healthy line. What is citable is a *position* statement — "above the 90th
percentile of published open-source distributions" — not a threshold claim.

**`P90_FILES_CHANGED.critical` (13) has no external support.** No source publishes anything that
could justify a second, higher file boundary. Leave it, and say it rests on two local windows.

### 1.4 Record the contradicting evidence where a reader will see it

**Beads**: `code-quality-metrics-75c`, `code-quality-metrics-w6g`

**What.** The findings document contains eight findings that contradict the toolkit's premises. The
project's own documentation currently presents those premises without qualification. At minimum,
`metrics-specification.md` should carry the contradictions relevant to each metric, and the
reservations list in `calibration/observations.json` should gain the non-transferability and drift
findings from RQ9:

- Metric coefficients reverse sign depending on what else is in the model (Kamei et al. TSE 2013,
  §6.1). The toolkit scores each metric independently.
- JIT model discriminatory power drops 11-34 AUC points within one year of training, and the Size
  family's explanatory share swings 10-43% (McIntosh & Kamei, TSE 2018). A frozen band is the
  artefact that paper warns against.
- Cross-project transfer of fitted models falls as low as 0.38 AUC, worse than random (Kamei et al.
  EMSE 2016, Table 6). A scalar band from six repositories has less claim to transfer than a fitted
  model does.

### 1.5 Withdraw or trace three more untraceable figures

**Beads**: `code-quality-metrics-9ur`, `code-quality-metrics-pw5`

**What.** Three widely repeated figures could not be traced to what they are attributed to. Add them
to the withdrawn list and check whether any project document reaches for them:

- "200-400 LOC over 60-90 minutes should yield 70-90% defect discovery", attributed by SmartBear's
  own page to its Cisco case study. All 26 pages read and text-searched; not present. The study says
  it cannot compute such a figure because there is no counterfactual.
- A 200-400 line review ceiling in McConnell's *Code Complete*. NOT FOUND; every attribution
  encountered was a blog citing a blog. Recorded as not-found rather than refuted, since the book was
  not to hand.
- "Google recommends keeping pull requests under 200 lines." Not in Sadowski et al., which reports a
  median of 24 lines and no recommended limit.

**Two attributions inside this project's own documents could not be traced either**, and both should
be traced or dropped:

- `metrics-specification.md:298` — the net additions ratio described as "the systematic
  batch-acceptance pattern DORA associates with architectural debt accumulation".
- `metrics-specification.md:290` — "DORA research identifies this combination as the leading
  indicator of team archetype drift toward foundational challenges."

**Related residue.** The phrase "volume without discipline" was withdrawn from the specification, but
`lib/report.js:310` still names the variable `volumeWithoutDiscipline` and lines 316/327 use it to
raise a warning. The code outlived the retraction. Decide whether the signal itself is still wanted;
if so, rename and document it as this toolkit's hypothesis, which is what the spec now says at line
231.

**Likely transmission vector, worth recording.** `measuring-ai-code-drift-using-github-metrics.md:165`
cites a SonarSource blog post that attributes "9% climb in bug rates, 91% increase in code review
time, 154% increase in PR size" to the "Google 2025 DORA Report" — three of the four already-withdrawn
figures, in a document this project cites.

---

## Tier 2 — Band corrections. Behaviour changes, evidence-backed.

### 2.1 Re-derive `TEST_COVERAGE_RATE` and drop the test-first label

**Beads**: `code-quality-metrics-36d`. Cross-noted on `code-quality-metrics-0er`.

**Two separate problems in one band.**

**(a) The healthy line is unattainable.** `lib/thresholds.js:31` sets
`TEST_COVERAGE_RATE: { warning: 30, healthy: 50 }`. Levin & Yehudai (ICSME 2017), 61 popular Java OSS
projects, 242,567 commits: "In none of the projects, did the test maintenance occur in more than
68.5% of the commits", with per-activity-type medians below 24.7 / 30.4 / 35 percent — on a numerator
*broader* than this toolkit's, since a test-only commit counts for them and does not set
`test_first_indicator`. This project's own twelve calibration observations top out at 46. A healthy
line no reference project attains is a permanent failing grade.

Re-derive from `calibration/observations.json` using the same p75 rule as the six calibrated bands,
via `derive-bands.js`. Cite Levin & Yehudai alongside as an independent, larger-population sanity
check that the plausible range is in the teens to thirties.

**(b) The label is wrong.** `lib/git.js:137` sets
`test_first_indicator: testFiles > 0 && prodFiles > 0` — pure same-commit co-occurrence. It cannot
distinguish test-first from test-after, and Sun et al. (TOSEM 2023) exists specifically to report
that this heuristic produces "the pervasive existence of noise". Borle et al. (EMSE 2018) state it in
their own threats section: "In a git history, test first could look like testing at the same time, or
even testing later depending on how the git commits were formed."

**The label appears in at least nine places**, and this is a shared-code rename:

| File | Line | Form |
|---|---|---|
| `lib/git.js` | 137 | `test_first_indicator` field |
| `.github/workflows/code-metrics.yml` | 199 | reads `test_first_indicator` |
| `.github/workflows/code-metrics.yml` | 322 | "Test-first discipline should remain above 50%" |
| `.github/workflows/pr-metrics.yml` | 136, 298 | reads `test_first_indicator` |
| `.github/workflows/pr-metrics.yml` | 220 | "Strong test-first discipline across commits" |
| `.github/workflows/pr-metrics.yml` | 314 | hardcoded `>50%` target |
| `.github/workflows/pr-metrics.yml` | 373 | "Test-first discipline" row |
| `README.md` | 224, 233, 241, 302 | "Test-first discipline" bands |
| `CLAUDE.md` | 77 | "test-first %" in the archetype table |

**Note there are three independent copies of the 50.** `lib/thresholds.js:31`,
`pr-metrics.yml:314`, and `code-metrics.yml:322`. The workflows `require('./lib/thresholds')` for
other values but hardcode this one. Consolidating them is part of the change.

**Rename target.** Something that names co-occurrence rather than ordering — the JSON field is
consumed by both workflows, so this is a breaking change to the artifact schema. Plan for it.

### 2.2 Cap verdicts at warning for the contradicted metrics

**Beads**: `code-quality-metrics-75c` (evidence), `k1g` and `a9z` (per-metric)

**What.** Three metrics carry `critical` verdicts on risk claims the literature contradicts.
Downgrade them to two-band (good/warning) until the construct is settled.

**The mechanism already exists.** `lib/report.js` has `statusForTwoBand(value, healthyBoundary,
direction)` returning only `'good' | 'warning'`, used wherever `criticalBoundary` is null. The
docstring on `buildCatalogEntry` explains that a null critical bound must not be coerced to 0. The
precedent is also already set: `dora_archetype` is capped at warning for the same class of reason,
and `TEST_COVERAGE_RATE.warning` is already annotated at `lib/report.js:235` as "not a validated
critical bound".

**The three:**

| Metric | Current | Why cap |
|---|---|---|
| `DUPLICATION_PCT` | 3 / 10 | Rahman, Bird & Devanbu (MSR 2010): "clones may be less defect prone than non-cloned code… our findings do not support the claim that clones are really a 'bad smell'." Significant across all four projects, both parameter settings. Wagner et al. (SANER 2016): clone length does not predict faultiness (ρ = 0.268, p = 0.120). |
| `NET_ADDITIONS_RATIO_MEDIAN` | 0.51 / 0.79 | Nagappan & Ball (ICSE 2005) tested this exact form as M7; ρ = .288, tied weakest of eight, **dropped by stepwise regression**. Shin et al. (TSE 2011): the additions-only form met their prediction criterion in 0 of 80 runs against 76 of 80 for total churn. |
| `TEST_COVERAGE_RATE` | 30 / 50 | See 2.1. Also Beller et al.: ρ = 0.35 between test and production churn, read as *expected* — a stable test suite that does not change with every production edit is a design outcome, not a discipline failure. The monotonic "higher is healthier" direction is itself an assumption the literature does not make. |

### 2.3 Reconcile the duplication band with its own detection settings

**Beads**: `code-quality-metrics-k1g`

**What.** `DUPLICATION_PCT.healthy: 3` is numerically identical to SonarQube's default quality gate
(duplicated lines density ≤ 3.0%). But Sonar measures that at **100 successive duplicated tokens over
at least 10 lines**, applied to *new code*. This toolkit measures at `DUPLICATE_MIN_LINES: 5` and
`DUPLICATE_MIN_TOKENS: 50` — half of Sonar's minimum in both dimensions — over the full contents of
the production files a commit window touched.

Wagner et al. (SANER 2016) quantify what halving the minimum does, on the same three systems:

| System | min-length 20 units | min-length 10 units |
|---|---|---|
| A (253 kLOC) | 3.0% | 10.1% |
| B (332 kLOC) | 5.3% | 14.8% |
| C (454 kLOC) | 3.4% | 10.5% |

Roughly 3×. **The toolkit's healthy band and its critical band are the same codebase measured at two
different minimum clone sizes.**

**Two coherent resolutions, and the choice is a human's:**

- Raise `DUPLICATE_MIN_LINES` / `DUPLICATE_MIN_TOKENS` to 10 / 100 so the 3% means what Sonar means.
- Keep 5 / 50 and move the band up, and stop describing it as Sonar's number or as research-backed.

Whichever is chosen, the published range for context is roughly **3-23%** share-of-lines across the
four studies with stated methods and stated minimum clone sizes — and within that range, position
depends more on the detector's minimum clone size than on the system.

**Related open bug**: `code-quality-metrics-ksv` — `DUPLICATE_SCAN_PATHS` is documented and tested
but never read. Worth folding into whatever touches duplication config.

### 2.4 Note what the large-commit and sprawl thresholds actually select

**Beads**: `code-quality-metrics-4qr`, `code-quality-metrics-nek`

**What.** No change to the numbers is proposed — no source supports one — but their *selectivity* is
now measurable and should be documented. Robbes et al. (2026), ~9.4M commits:

- `LARGE_COMMIT_THRESHOLD: 100` sits above the human Q3 (41 added lines) and just below the
  AI-assisted Q3 (114). It selects roughly the top decile of human commits and the top quartile of
  AI-assisted ones. Not a neutral boundary.
- `SPRAWLING_COMMIT_THRESHOLD: 5` sits above Q3 for **both** populations (human Q3 = 3 files, AI Q3 =
  4). Median files per commit is 2 for both. A sprawl rate under 10% is near-automatic, so the metric
  discriminates poorly.

**And a confound worth documenting.** Large and sprawling commits are disproportionately *not*
ordinary development. Hindle et al. (MSR 2008) hand-read 2,000 of the largest commits across nine
projects and found the tail dominated by auto-generated documentation, branch merges, copyright-year
sweeps, license changes, external module imports and reformatting. D'Ambros et al. inspected their
>100-class transactions and found "the vast majority of which concerned license changes, Javadoc and
documentation updates". Hattori & Lanza found bug fixes are the *smallest* commits.

A rising sprawl rate may signal more vendoring, not more drift.

---

## Tier 3 — Metric redefinitions. DECISION REQUIRED before implementation.

These change what a metric computes. Each is the direction the evidence points, and each is a larger
change than a threshold edit. **Plan them; do not implement them without a human decision.**

### 3.1 DECISION REQUIRED — churn denominator

**Beads**: `code-quality-metrics-a9z`

**Current**: `net_additions_ratio = (additions − deletions) / (additions + deletions)`, median across
commits, banded 0.51 / 0.79.

**The evidence.** This maps onto Nagappan & Ball's M7 = Churned LOC / Deleted LOC by a strictly
increasing transform (`r = (M7−1)/(M7+1)`), so the band boundaries are M7 = 3.08 and M7 = 8.52. M7
scored ρ = .288 against defect density, tied for weakest of eight relative-churn measures, and
stepwise regression dropped it. The measure that *did* work is churn normalised by the size of the
code being changed: M1 = Churned LOC / Total LOC, ρ = .883. Kamei et al. reached the same form
independently at commit level as **LA/LT**, additions over the prior size of the touched files, which
is risk-increasing in 10 of 11 projects.

**The literature also does not treat deletion as healthy.** Kamei's Table 1 hypothesises deletions
raise defect risk on the same footing as additions. Nagappan & Ball's M2 = Deleted LOC / Total LOC
correlates at ρ = .798 and is the *first* predictor entered by stepwise regression. Munson & Elbaum:
"From the standpoint of fault insertion, removing a lot of code is probably as catastrophic as adding
a bunch." This toolkit's formula puts deletions in the numerator with a minus sign, treating them as
the antidote.

**Two further problems with the current metric**, independent of the denominator:

- **No study establishes that a median of per-commit ratios is a meaningful repository statistic.**
  Nagappan & Ball measure per binary release-to-release; Shin per file lifetime-cumulative; Hassan
  per period per subsystem; Munson & Elbaum per build. Only Kamei is per commit, and never aggregates
  to a repository median.
- **On GitClear's own data the metric never trips its own band.** Reconstructing a git-visible ratio
  from their Appendix A1 counts gives 0.221 (2020) rising to 0.354 (2025) — real movement in the
  expected direction, but always below 0.51. Meanwhile the collapse GitClear does document, Moved
  code falling 24.17% → 3.10%, is invisible to git numstat: a moved line is `+1` and `−1`, which
  reads as balanced churn, i.e. as healthy refactoring.

**The decision.** Whether to add or switch to an LA/LT-style measure (additions ÷ prior LOC of touched
files). Note this requires data the toolkit does not currently collect — the pre-change size of each
touched file — so it is a `lib/git.js` change, not just an arithmetic one. Scope that before
recommending it.

### 3.2 DECISION REQUIRED — message quality scoring rule

**Beads**: `code-quality-metrics-6ti`

**Current**: adequate if the message matches Conventional Commits format **or** reaches
`MESSAGE_QUALITY_MIN_WORDS: 10` after trailers are stripped. Banded 60 / 40.

**The evidence.** Li & Ahmed (ICSE 2023) ran precisely the comparison that decides this rule, over
185,026 Apache commits: semantic What/Why quality versus Commit Message Volume (word count after
stop-word removal). What and Why won at every window size, with large effect sizes on the difference.
GLM coefficients differ by roughly two orders of magnitude — Volume ~0.0037 constant; What 0.117 to
0.483; Why 0.088 to 0.833. Barnett et al. (MSR 2016) found the same ordering by a different route:
word count significant in 43% of 342 systems with a median 4% of explanatory power, against 80% and
up to 72% for their content metric. Tian et al. explicitly criticise syntactic scoring for missing
semantics.

**The 10-word bar sits above the population median.** CommitBench, 23,284,371 GitHub commits: median
message length 11 T5 subword tokens, p25 = 6, and 34.7% below 8 tokens. T5 tokens run *higher* than
word count for the same text. Dyer et al. agree from the other end: over two thirds of SourceForge
Java/SVN messages contained 1-15 words.

**Consequence.** The metric is bimodal. On a project without Conventional Commits the word branch
fails for most commits and the score collapses; on one with it, the format branch passes essentially
everything regardless of content. Kong et al. found ~10% of commits match the format incidentally
even in non-adopting projects, so the format branch has a nonzero false-pass floor. **The number
mostly answers "does this project use Conventional Commits?"**

**Also worth stating in the spec.** Conventional Commits is a community specification citing no
research; no study validates it against an outcome. And in the one AI-era measurement available
(Rabbi et al. 2026, preprint, narrow corpus), AI-generated commit messages scored *better* than the
human baseline — 70.4% What-and-Why against ~56% — while predicting nothing about review outcomes.
If AI agents reliably emit well-formed messages regardless of the quality of the underlying change,
this metric may become an *inverse* drift indicator.

**The decision.** Whether to pursue a semantic classifier, keep the syntactic rule with honest
framing, or drop the band and report the rate descriptively. A semantic classifier is a substantial
change and would need `lib/claude.js` involvement.

### 3.3 DECISION REQUIRED — what the co-change metric is for

**Beads**: `code-quality-metrics-36d`

Beyond the rename and re-derivation in 2.1, there is a construct question. Fucci et al. (TSE 2017)
instrumented 82 task-level observations from 39 professionals and found **sequencing dropped out of
both the quality and the productivity model**, while granularity and uniformity survived:

> "We thus recommend focusing on breaking down development tasks into as small and as uniform steps
> as possible. We think that this aspect should be emphasised over religiously focusing on leading
> each production cycle with unit tests."

That points at the toolkit's *large-commit* and *sprawl* metrics as better-founded proxies for what
this metric reaches for, and away from co-change. Separately, the largest modern co-evolution study
(Miranda et al., 526 repositories, six languages) deliberately widens the granularity to 30-day
windows and scores co-evolution as a Pearson correlation of LOC time series, banded by quartile of
the observed distribution — a rejection of both per-commit co-occurrence and absolute healthy values.

**The decision.** Whether this metric survives as a scored band at all, or becomes descriptive.

---

## Tier 4 — Statistical hygiene

### 4.1 Stop reporting mean and stddev for commit size

**Beads**: `code-quality-metrics-6dg`

**What.** `AVG_LINES_CHANGED: { healthy: 150, critical: null }` and the `stddev` field in
`lib/statistics.js` assume the distribution has finite first and second moments. Three independent
published fits agree it is heavy-tailed: Generalized Pareto with ξ = 1.4617 (Kolassa, Table 2), power
law with exponent −1.8612 (Arafat, Table 4), Pareto by Q-Q plot across nine projects (Hattori,
Fig. 2). **A GPD with ξ = 1.4617 has no finite mean and no finite variance.**

Kolassa's own empirical table shows the consequence: mean 465.72 against median 16 — a mean lying
above its own 90th percentile.

**The calibration data already rediscovered this.** `calibration/observations.json` records windows
where a single vendored import or translation sync destroyed the mean while percentile and count
metrics survived.

**Plan.** Either drop the mean-based band and the stddev field, or demote both to informational with
the instability documented. Percentiles should carry the load.

### 4.2 Document the p90 stability limit

**Beads**: `code-quality-metrics-6dg` (same issue, second concern)

**What.** No source estimates the sampling variance of a high quantile from a heavy-tailed
distribution, and this toolkit computes p90 over windows as small as 50 commits — where the empirical
p90 is the 45th order statistic with large variance. This is a genuine methodological gap the
literature does not fill. State it as a limitation rather than leaving it implicit.

**Related.** Hattori & Lanza published a direct objection to the toolkit's construction:

> "Since commits follow a Pareto distribution, it does not make sense to split them into quartiles,
> for example, because the number of commits with only one file is around the 50th percentile in most
> cases. Although we could use the approximate distribution function found for each project to
> calculate an exact division, this is not a generalized approach that could be directly applied to
> other open source projects." (§3, p. 4)

`derive-bands.js` takes the p75 of twelve per-repo p90 observations — a percentile of a percentile.
Acknowledge this in `calibration/README.md` rather than leaving it unstated.

---

## Tier 5 — Explicitly out of scope

Do not do these, and do not let a plan drift into them.

- **Do not invent replacement numbers.** Where the findings say no boundary exists, the answer is to
  change the framing or re-derive from `observations.json`, not to substitute a different plausible
  figure.
- **Do not cite the rejected sources.** The 200/400 line ceiling, the 70-90% defect discovery figure,
  the *Code Complete* attribution, the "Google recommends 200 lines" claim, Faros AI's and LinearB's
  vendor telemetry, and Alali et al.'s "75% of commits are quite small" (a tautology of their
  quartile method, not a finding).
- **Do not add a duplication-to-defect risk claim.** The literature contradicts it.
- **Do not attempt to build a pre-AI baseline from published data.** It cannot be done: every AI-era
  study compares contemporaneously, and post-2022 "human" commits are contaminated by invisible AI
  use, which the authors of both large corpora state explicitly. That work is a separate measurement
  exercise (see below).

---

## Adjacent work already tracked, not part of this brief

| Issue | Concern |
|---|---|
| `code-quality-metrics-0er` | Reconcile documented thresholds with calibrated values across README, CLAUDE.md, spec, coverage map. **Overlaps Tier 1 — coordinate, do not duplicate.** |
| `code-quality-metrics-7sk` | Build a squash-merge reference set with its own bands |
| `code-quality-metrics-bnq` | Withhold threshold verdicts when analysing squashed history |
| `code-quality-metrics-wcj` | Per-repo configuration for scripted runs |
| `code-quality-metrics-ksv` | `DUPLICATE_SCAN_PATHS` documented and tested but never read |

**The pre-AI baseline** is the single most valuable measurement this project could add, and it is not
a code change. Running `local-code-metrics.js` unchanged over pre-2022 windows of the same six
reference repositories is the only route to a same-tool, same-corpus, same-definition before/after.
Adding matched repositories with no AI-adoption signal (no `CLAUDE.md`, no `.cursorrules`, no agent
co-author trailers) over the same windows would make it a crude difference-in-differences. Note the
known confound: within-repository before/after is "vulnerable to seasonal confounds" (Murphy-Hill et
al., arXiv:2607.01418, §2.2).

---

## What your plan should contain

1. **A sequencing recommendation.** Tier 1 first — it is safe, independent, and changes the claims
   that are currently overstated. Do not batch it with Tier 2.
2. **Per-change: the failing test first.** For every behaviour change, name the test, the observable
   behaviour, and the predicted failure message. Threshold changes will break existing tests; that is
   expected and those tests encode the old claim, so updating them is part of the change, not a
   workaround.
3. **A shared-code impact list.** For anything touching `lib/config.js`, `lib/thresholds.js`, or a
   JSON field name, enumerate every consumer across the local script and both workflows before
   proposing the edit.
4. **An explicit escalation list.** The three DECISION REQUIRED items, stated as questions a human can
   answer without reading the whole findings document.
5. **A verification step for the re-derivations.** `node calibration/derive-bands.js` reproduces the
   bands and writes nothing. Any re-derived value must match its output, and the copy into
   `lib/thresholds.js` is a separate reviewed commit — that separation is deliberate and should be
   preserved.

## Where to check the evidence

`calibration/research-findings.md`. Sections are `## RQ1` through `## RQ9`:

| Question | Bears on |
|---|---|
| RQ1 Reviewable change size | `LARGE_COMMIT_THRESHOLD`, `LARGE_COMMITS_PCT` |
| RQ2 Change scatter | `SPRAWLING_COMMIT_THRESHOLD`, `SPRAWLING_COMMITS_PCT` |
| RQ3 Duplication | `DUPLICATION_PCT`, `DUPLICATE_MIN_LINES`, `DUPLICATE_MIN_TOKENS` |
| RQ4 Churn | `NET_ADDITIONS_RATIO_MEDIAN` |
| RQ5 Test co-change | `TEST_COVERAGE_RATE`, `test_first_indicator` |
| RQ6 Message quality | `MESSAGE_QUALITY_PCT`, `MESSAGE_QUALITY_MIN_WORDS` |
| RQ7 Distributions | `P90_LINES_CHANGED`, `P90_FILES_CHANGED`, `AVG_LINES_CHANGED` |
| RQ8 Pre-AI comparison | the toolkit's central premise |
| RQ9 Outcome anchoring | the calibration method, and every band's transferability |

Each section ends with a **Search record** (what was read, what failed and how) and a
**Contradictions** subsection. If you need to check whether a claim here is fairly drawn, those are
the places to look.
