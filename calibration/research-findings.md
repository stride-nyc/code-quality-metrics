# Research findings: evidence for commit-level quality thresholds

Answers to the nine open questions in `calibration/research-brief.md`. Produced 2026-08-18.

## How this was produced

Nine parallel searches, one per open question, each working to the brief's evidentiary standard:
a source counts only if it is cited and locatable with a stable identifier, states its method and
corpus, and can be checked by a reader against a verbatim quote. Paraphrase is not evidence.
Verdicts are kept separate: CONFIRMED with a quote, NOT FOUND after a stated search, INACCESSIBLE
with the URL and how it failed.

Every figure below carries its unit and population. Where a number was derived rather than quoted,
the derivation is labelled as such.

Roughly 70 primary sources were read, mostly as extracted PDF text rather than web summaries.
Eleven sources are recorded as INACCESSIBLE with the specific failure; those gaps are listed per
question rather than papered over.

## Bottom line

**No published source supplies a boundary number for any threshold in this toolkit.** That was the
expected answer and it is now established rather than assumed. Two exceptions are worth having:
published *distributions* exist for commit size and files per commit that let the toolkit position
itself against something outside its own six reference repositories, and the benchmark-percentile
*method* this project already uses has a published citation.

The more consequential result is the one the brief asked to be reported as prominently as a
confirmation. **Several of the toolkit's premises are contradicted, not merely unsupported.** The
duplication metric measures a quantity the clone literature says is not a defect signal; the
net-additions ratio uses the one denominator the churn literature tried and discarded; the
test co-change metric is a heuristic a 2023 TOSEM paper exists specifically to refute; and the
commit message metric scores the losing side of a comparison the field has already run.

## Verdicts

| # | Question | Verdict | What changes |
|---|---|---|---|
| 1 | Reviewable change size | direction only | The 200-400 line ceiling is one vendor's telemetry about its own product, and it contradicts itself. Nothing supports 100 lines or the 23/30 band. |
| 2 | Change scatter across files | nothing found | The only published "5 files" line is explicitly arbitrary. 19% is the observed base rate, not a health line. |
| 3 | Duplication rate | nothing found | No boundary exists, and the premise is contradicted: the strongest studies find clones no more, or less, defect-prone. |
| 4 | Churn and net-new ratio | direction only | Churn is well established; *this form of it* is the weakest measure in the canonical paper and was dropped from the model. |
| 5 | Test/production co-change | direction only, near-refutation | Same-commit co-occurrence is a published-noisy proxy. The healthy line of 50 exceeds what any measured population reaches. |
| 6 | Commit message quality | nothing found | Three distributions available. The 10-word bar sits above the population median; the metric mostly measures Conventional Commits adoption. |
| 7 | Distribution boundaries | **boundary available** (distributions) | p90 lines 261 over 8.7M commits; p90 files ≈10 over 9M changes. The toolkit's 260 and 9.5 have external corroboration. |
| 8 | Pre-AI comparison | direction only | No same-repository before/after exists. Commit size rises; duplication, sprawl and test discipline do not. |
| 9 | Outcome anchoring | direction only | The JIT literature is real and gives coefficients, never thresholds, and says they neither transfer between projects nor hold still within one. |

## Which thresholds could be replaced by a sourced number

Only one metric has genuine external corroboration, and it is corroboration of a *position*, not a
derivation of a *boundary*.

| Threshold | Current | External comparison | Source |
|---|---|---|---|
| `P90_LINES_CHANGED.healthy` | 260 | p90 = **261 LoC/commit** over 8,705,118 commits in 11,143 projects | Kolassa, Riehle & Salim, SOFSEM 2013, Table 1 |
| `P90_FILES_CHANGED.healthy` | 9.5 | ~90% of changes modify fewer than **10 files**, over ~9M changes | Sadowski et al., ICSE-SEIP 2018, §5.2 |
| | | gcc p90 ≈ **8 files** (derived from published frequencies) | Alali et al., ICPC 2008, Table 2 |

Two cautions before this is treated as a win. The 260/261 agreement is partly coincidental: Kolassa
excludes blank lines and includes test files, the toolkit does the reverse, and the two biases pull
in opposite directions. And neither source proposes these as healthy lines; they are descriptive
percentiles of a population. What they legitimately support is a **restatement of the claim**: "this
repository's commits sit above the 90th percentile of published open-source distributions" is
citable. "This repository exceeds a review-effectiveness threshold" is not.

One further item is a real, citable upgrade that costs nothing:

| Claim | Citation |
|---|---|
| Deriving thresholds as quantiles of a benchmark of reference systems is an established published method | Alves, Ypma & Visser, "Deriving Metric Thresholds from Benchmark Data", ICSM 2010, DOI 10.1109/ICSM.2010.5609747 |

That gives the calibration approach a methodological source even though its numbers have none.
Alves is explicit that the method is outcome-agnostic — "our methodology derives meaningful
thresholds which represent overall volume of code from a benchmark of systems" — which is precisely
the claim this project should make. Note the scale gap: Alves used 100 systems and ~12 MLOC; this
project uses six repositories and twelve windows.

## Which must remain empirical, and be defended as such

All the rest. Specifically:

- `LARGE_COMMITS_PCT` (23/30) and `LARGE_COMMIT_THRESHOLD` (100 lines)
- `SPRAWLING_COMMITS_PCT` (19) and `SPRAWLING_COMMIT_THRESHOLD` (5 files)
- `DUPLICATION_PCT` (3/10)
- `NET_ADDITIONS_RATIO_MEDIAN` (0.51/0.79)
- `TEST_COVERAGE_RATE` (30/50) and `UNCOVERED_PROD_RATE` (16/20)
- `MESSAGE_QUALITY_PCT` (60/40) and `MESSAGE_QUALITY_MIN_WORDS` (10)
- `P90_FILES_CHANGED.critical` (13), `AVG_LINES_CHANGED` (150)
- every `DORA_ARCHETYPE` boundary

The honest framing for these is available and should be adopted rather than left implicit: they are
percentiles of a small measured sample, they say "unusual relative to these six peers", and outcome
validation has not been done by this project or, at commit-shape granularity, by anyone.

## Findings that contradict the toolkit's premises

The brief asked for these to be reported as prominently as confirmations. There are eight that
matter, ordered by how much they should change what the toolkit does.

**1. Duplication rate is not established as a quality signal, and the best evidence runs the other
way.** Rahman, Bird and Devanbu (MSR 2010, four C projects, 116-155 monthly snapshots each): "we
find that clones may be less defect prone than non-cloned code… Our findings do not support the
claim that clones are really a 'bad smell'." Significant across all four projects and both parameter
settings. Wagner et al. (SANER 2016) found clone length does not predict faultiness (ρ = 0.268,
p = 0.120). What the harm literature actually implicates is *inconsistency between* clones over
time, which jscpd does not measure. Separately, the 3% healthy band is numerically SonarQube's
default gate but measured at half Sonar's minimum block size, and Wagner et al. quantify what
halving the minimum does: roughly 3×.

**2. The net-additions ratio uses the one denominator the churn literature discarded.** Nagappan and
Ball (ICSE 2005) tested eight relative-churn measures against defect density on 44.97M LOC of Windows
Server 2003. M7 = Churned LOC / Deleted LOC — the toolkit's metric, up to a monotone transform —
scored ρ = .288, tied for weakest, against .883 for churn normalised by total LOC, and stepwise
regression **dropped it**. Shin et al. (TSE 2011) found the additions-only form met their prediction
criterion in **0 of 80** runs against 76 of 80 for total churn. And the literature does not treat
deletion as healthy: Kamei's Table 1 hypothesises deletions raise defect risk, and Nagappan and
Ball's deleted-LOC measure correlates at ρ = .798, the *first* predictor entered by stepwise
regression. The toolkit's formula puts deletions in the numerator with a minus sign.

**3. On GitClear's own data, the net-additions ratio never trips its own band, and misses the signal
GitClear actually documents.** Reconstructing a git-visible ratio from GitClear's Appendix A1 counts
gives 0.221 (2020) rising to 0.354 (2025) — real movement, in the expected direction, but every
value stays **below the 0.51 healthy boundary**. Meanwhile the collapse GitClear does document,
Moved code falling from 24.17% to 3.10%, is invisible to git numstat: a moved line is `+1` and `−1`,
which reads as perfectly balanced churn, i.e. as healthy refactoring.

**4. Test/production co-change is a heuristic the field has specifically refuted.** Sun et al.
(TOSEM 2023) exists to test the assumption that same-commit co-occurrence identifies co-evolution,
and reports "the pervasive existence of noise". Borle et al. (EMSE 2018) state it in their own
threats section: "In a git history, test first could look like testing at the same time, or even
testing later depending on how the git commits were formed." Fucci et al. (TSE 2017) found
*sequencing dropped out of both* their quality and productivity models while granularity and
uniformity survived — meaning the toolkit's large-commit and sprawl metrics are better proxies for
what this metric is reaching for than the metric itself. And Beller et al. found ρ = 0.35 between
test and production churn, reading the weakness as expected rather than as a failure.

**5. The test-coverage healthy line of 50 is above what any measured population reaches.** Levin and
Yehudai (ICSME 2017, 61 popular Java OSS projects, 242,567 commits): "In none of the projects, did
the test maintenance occur in more than 68.5% of the commits", with per-activity-type medians below
24.7 / 30.4 / 35 percent — on a numerator *broader* than the toolkit's. The toolkit's own twelve
calibration observations top out at 46. A healthy line no reference project attains is a permanent
failing grade, not a health line. `lib/thresholds.js:31` carries no derivation comment (nor do
`TEST_ISOLATION_RATE`, `MESSAGE_QUALITY_PCT` and `AI_BATCH_SHARE` at lines 32, 39 and 49 — the RQ5
agent's claim that line 31 was the sole uncommented band is corrected here).

**6. The commit-message metric scores the losing side of a settled comparison.** Li and Ahmed
(ICSE 2023) ran exactly the regression that decides between word count and semantic What/Why quality
over 185,026 Apache commits. What and Why won at every window size with large effect sizes on the
difference; GLM coefficients differ by roughly two orders of magnitude (Volume ~0.0037; What
0.117-0.483; Why 0.088-0.833). Barnett et al. (MSR 2016) found word count significant in 43% of 342
systems with a median 4% of explanatory power, against 80% and up to 72% for their content metric.
Separately, the 10-word bar sits **above the median commit message** in the largest published corpus
(median 11 T5 subword tokens over 23.3M commits, and T5 tokens run higher than words), so the metric
behaves bimodally: it mostly reports whether a project has adopted Conventional Commits.

**7. Two independent peer-reviewed MSR '26 papers reject the GitClear duplication narrative on
method, and the one causal DiD finds duplication does not significantly rise.** He et al.
(arXiv:2511.04427v3, 806 Cursor adopters vs 1,380 matched controls) put the effect on duplicated
line density at +7.03% (±4.79%), insignificant, and attribute most of the warning increase to
volume: "LLM agent assistants amplify existing velocity-quality dynamics by enabling faster code
production, but may not necessarily introduce more code quality issues than non-adopting projects
moving with the same velocity." The one genuinely AI-specific residual is **complexity**, which this
toolkit does not measure.

**8. On the metrics that do move, sprawl is not one of them, and test discipline moves the wrong way
for the premise.** Daniotti et al. (*Science* 2026, 30M+ commits, with a verified pre-2022 placebo)
find multi-file commit counts and total commit counts both rise ~3.6%, so the *share* of multi-file
commits is flat. Robbes et al. (2026, ~9.4M commits) find median files per commit is 2 for both
human and AI-assisted commits. Hora (MSR 2026, 1.25M commits) finds 23% of agent commits touch test
files against 13% of non-agent commits. Khosravani and Mockus find Claude Code and Aider commits
reverted 32% and 82% *less* often than human commits. **AI makes commits longer, not wider, and the
test-discipline and duplication premises are not supported by the AI-era measurements.**

And one methodological warning aimed at the whole metric class, from METR:

> "these studies use outcome measures that are not fixed in advance—i.e. lines of code written,
> number of code commits, and pull requests (PRs) as their key outcome measures respectively. It's
> possible for AI assistance to affect the outcomes without actually increasing productivity, e.g.
> by causing developers to write more verbose but functionally equivalent code, or causing them to
> break up pull requests into smaller chunks of work."

Every metric this toolkit computes is in that class. That does not make them worthless as drift
signals, but a threshold breach cannot be read as a quality claim.

## Provenance failures found along the way

Three numbers in wide circulation could not be traced to what they are attributed to. They belong on
the same list as the four already-withdrawn DORA figures.

- **"200-400 LOC over 60-90 minutes should yield 70-90% defect discovery."** Attributed by
  SmartBear's own best-practices page to its Cisco case study. All 26 pages of that study were read
  and text-searched; the figure is not in it, and the study says it cannot compute such a number
  because there is no counterfactual.
- **A 200-400 line review ceiling in McConnell's *Code Complete*.** NOT FOUND. Every attribution
  encountered was a blog citing a blog, and the numbers match Cohen's 2006 vendor study exactly.
- **"Google recommends keeping pull requests under 200 lines."** Does not appear in Sadowski et al.,
  which is the actual Google study and reports a median of 24 lines with no recommended limit.

Two likely transmission vectors for the withdrawn DORA figures were identified. The SonarSource blog
post cited as reference [7] in `measuring-ai-code-drift-using-github-metrics.md:165` attributes "9%
climb in bug rates, 91% increase in code review time, 154% increase in PR size" to the "Google 2025
DORA Report" — three of the four withdrawn figures, in a document this project cites. And LinearB's
2026 benchmarks report "AI-assisted PRs run about 2.5x larger" with an undisclosed classifier and no
stated unit, which is very close in kind to the withdrawn 154% PR-size claim. Vendor DevEx telemetry,
laundered through blog posts until the attribution drifts to DORA, is the most likely origin of that
whole family of numbers.

Separately, two attributions inside this project's own documentation could not be traced:
`metrics-specification.md` describes the net-additions ratio as capturing "the systematic
batch-acceptance pattern DORA associates with architectural debt accumulation", and Metric 6 as a
combination "DORA research identifies… as the leading indicator of team archetype drift toward
foundational challenges". Neither was located in any DORA report.

## Recommendations

Ordered by value. None of these is applied yet; they are proposals.

**Reframe rather than renumber.** The single highest-value change costs no threshold movement: state
what the bands are. Adopt Alves's formulation — benchmark quantiles that mean "unusual relative to
these peers" — cite Alves et al. (2010) as the method, and say plainly that outcome validation has
not been done. This is defensible, citable, and true, where the current implicit "healthy" claim is
none of the three.

**Cite the two external anchors where they exist.** `P90_LINES_CHANGED` against Kolassa's 261 and
`P90_FILES_CHANGED` against Google's ~10, with the unit mismatches stated. These are the only two
places the toolkit can point outside its own reference set.

**Cap verdicts at warning for the three contradicted metrics.** `DUPLICATION_PCT`,
`NET_ADDITIONS_RATIO_MEDIAN` and `TEST_COVERAGE_RATE` carry risk claims the literature contradicts.
The precedent already exists in this codebase: `dora_archetype` is capped at warning for the same
kind of reason.

**Re-derive `TEST_COVERAGE_RATE` and drop the test-first label.** The 50 is unattainable and the
label is wrong — `lib/git.js:137` sets `test_first_indicator` from pure co-occurrence. Re-derive from
`calibration/observations.json` by the same p75 rule as the other bands, and rename to what it
measures. Note `pr-metrics.yml:314` carries an independent hardcoded copy of the same 50.

**Consider changing what two metrics compute, not just their bands.** The churn measure with
published support is additions normalised by prior file size (LA/LT), not additions over deletions.
The message-quality signal with published support is semantic What/Why, not word count. Both are
larger changes than a threshold edit and both are the direction the evidence points.

**Stop reporting mean and stddev for commit size.** Three independent fits agree the distribution is
heavy-tailed; the best fit (GPD, ξ = 1.4617) has no finite mean or variance. Kolassa's own table
shows a mean of 465.72 against a median of 16 — a mean above its own 90th percentile. The
calibration data already rediscovered this: three recorded windows where one vendored import
destroyed the mean while percentiles survived.

**Measure the pre-AI baseline yourself.** It cannot be assembled from published data — every AI-era
study compares contemporaneously, and post-2022 "human" commits are contaminated by invisible AI use,
which the authors of both large corpora say explicitly. Running the toolkit unchanged over pre-2022
windows of the same six repositories is the only route to a same-tool, same-corpus before/after.
Adding matched repositories with no AI-adoption signal over the same windows would make it a crude
difference-in-differences.

## Work filed

Fourteen issues, all linked `discovered-from` their originating question. The nine research issues
(`3mv`, `w0o`, `1b8`, `e30`, `tw9`, `rwy`, `13u`, `79z`, `a3u`) are closed.

| Issue | Concern |
|---|---|
| `36d` | `test_coverage_rate`: drop the test-first label, re-derive the band |
| `4qr` | Use Robbes et al. commit-shape distributions to calibrate large-commit and sprawl |
| `6dg` | Reporting mean and stddev of commit size may be statistically invalid |
| `6ti` | Message-quality scoring rule: word count is the weakest published signal |
| `75c` | Record the published evidence contradicting the AI-degrades-discipline premise |
| `9j5` | Cite Alves et al. (ICSM 2010) as the method behind the calibration approach |
| `9ur` | SonarSource blog reference [7] is the vector for three withdrawn DORA figures |
| `a9z` | Relative churn normalises by total LOC, not by deletions |
| `ck3` | Revisit the p90 lines-changed band in `metrics-specification.md` |
| `k1g` | Duplication 3% is Sonar's default gate at half Sonar's minimum block size |
| `nek` | Sprawling commit rate is confounded by commit activity mix |
| `pw5` | Metric 7's DORA attribution in `metrics-specification.md` is unsourced |
| `w6g` | Add non-transferability and drift caveats to the threshold documentation |
| `xeh` | `calibration/README.md` documents a superseded derivation rule |

Two pre-existing issues were appended to rather than duplicated: `0er` (reconcile documented
thresholds with calibrated values) and `ck3`.

---

# Per-question findings

## RQ1: Reviewable change size

**Verdict**: direction only

No published study establishes a change-size boundary beyond which review effectiveness
falls. The 200-to-400-line figure traces to a single vendor case study of its own product;
the one boundary that survives peer review is a **rate** (200 LOC/hour), not a **size**, and
even that is a soft inflection rather than a cliff. Nothing supports a boundary at 100
production lines, and nothing supports any rate band on what percentage of commits may
exceed a size.

### Sources

#### 1. Cohen, "Code Review at Cisco Systems" — the actual origin of the 200/400 figure

Jason Cohen, "Code Review at Cisco Systems," in *Best Kept Secrets of Peer Code Review*,
Smart Bear Inc., 2006, pp. 63-87.
https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf
(accessed 2026-08-18). Not peer-reviewed. Published by the vendor whose tool produced the data.

Corpus and method: 10-month study (July 2005 - May 2006) of the Cisco MeetingPlace product
group. "With 2500 reviews of 3.2 million lines of code written by 50 developers, this is the
largest case study ever done on what's known as a 'lightweight' code review process" (p. 63).
A Perforce trigger required a completed review before every check-in.

Two filtering steps materially shape the result. 21 percent of reviews were discarded:
"1. Throw out reviews whose total duration is shorter than 30 seconds. 2. Throw out reviews
where the inspection rate is greater than 1500 LOC/hour. 3. Throw out reviews where the number
of lines under review is greater than 2000" (p. 69). The defect analysis is not based on the
full corpus: "we cannot just use the defect data from the database as a true measure of
defects. Instead we took **a random sample of 300 reviews** and studied the conversations in
each one to measure the number of true defects" (p. 77).

The size finding (p. 78):

> "Reviewers are most effective at reviewing small amounts of code. Anything below 200 lines
> produces a relatively high rate of defects, often several times the average. After that the
> results trail off considerably; no review larger than 250 lines produced more than 37
> defects per 1000 lines of code."

Where 400 comes from, an inference rather than a measurement (p. 79):

> "Another explanation comes from the well-established fact that after 60 minutes reviewers
> 'wear out' and stop finding additional defects. Given this, a reviewer will probably not be
> able to review more than 300-400 lines of code before his performance drops."

The published recommendation (p. 85):

> "LOC under review should be under 200, not to exceed 400. Anything larger overwhelms
> reviewers and defects are not uncovered."

Unit and population: defect density = defects found during review per 1000 lines of code under
inspection; population = a hand-coded sample of 300 reviews drawn from ~2000 surviving reviews
at one Cisco product group. "Our reviews had an average 32 defects per 1000 lines of code.
**61% of the reviews uncovered no defects**" (p. 77). A 61 percent zero-inflation rate is not
reported as handled in the density regression.

**The study contradicts its own headline** (pp. 83-84):

> "From Figure 24 it is clear that review size does not affect the defect rate. Although the
> smaller reviews afforded a few especially high rates, 94% of all reviews had a defect rate
> under 20 defects per hour regardless of review size."
>
> "So reviewers are able to uncover problems at a relatively fixed rate regardless of the size
> of the task put in front of them."

If defects are found at a fixed rate per hour and review sessions are roughly bounded in time,
defects-per-line must fall as lines rise, arithmetically. The declining density curve is
substantially a restatement of a constant hourly rate. The authors flag the load-bearing
assumption in footnote 5, p. 78:

> "The critical reader will notice we're tacitly assuming that true defect density is constant
> over both large and small code changes."

Outcome measured: defects *found during review*, including readability and style objections.
**No escaped or post-release defects were measured.** No counterfactual: "because this was a
study *in situ* and not in a laboratory, we don't know how each of these reviews would have
fared with a different process" (p. 86).

Commit or review: a review, though the Perforce gate maps it closely to one changelist.
"LOC under inspection" is never stated to be diff lines or whole-file lines.
Production versus test lines: not separated.

#### 2. The "70-90% defect discovery" claim is not in the study it cites

SmartBear's best-practices page
(https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/, accessed
2026-08-18) states that "a review of 200-400 LOC over 60 to 90 minutes should yield 70-90%
defect discovery" and attributes it to the Cisco study. The agent read all 26 pages and
searched the extracted text; **no figure of 70-90 percent and no statement about defect
discovery yield appears anywhere in it.** The case study measures defect *density* and *rate*,
never a percentage of total defects found, and explicitly says it cannot compute one because
there is no counterfactual. Treat the 70-90 percent figure as unsourced.

#### 3. The McConnell / *Code Complete* attribution — NOT FOUND

No passage located in *Code Complete* (McConnell, 2nd ed., Microsoft Press, 2004,
ISBN 0-7356-1967-0) stating a 200-to-400-line review ceiling, and no source found quotes one
with a page number. Every attribution encountered was a blog citing another blog. What *Code
Complete* actually contributes is defect-detection-rate figures for inspection versus testing
(roughly 60 percent for design and code inspections), a claim about the *technique*, not about
*size*. Recorded as NOT FOUND rather than refuted: the book was not to hand. But no citation
chain supports the attribution and the numbers match Cohen exactly.

#### 4. Kemerer and Paulk 2009 — the one peer-reviewed boundary, and it is a rate

Chris F. Kemerer and Mark C. Paulk, "The Impact of Design and Code Reviews on Software
Quality: An Empirical Study Based on PSP Data," *IEEE TSE* 35(4), July/Aug 2009, pp. 534-550.
DOI: 10.1109/TSE.2009.27. Free copy: https://sites.pitt.edu/~ckemerer/PSP_Data.pdf
(accessed 2026-08-18).

Corpus and method: 371 C programs (153 developers) and 246 C++ programs (90 developers), from
Personal Software Process classes. 2.9 percent excluded for internal inconsistency. Regression
plus mixed models controlling for developer ability, initial work-product quality, size and
language. Median program size 120 LOC (C) / 124 (C++); median code review rate 261 LOC/hr
(Table 3, p. 6).

Result (Section 4.5, Table 14, p. 14): comparing reviews at or below 200 LOC/hour against
faster reviews, defect removal effectiveness was 56.0 vs 46.9 percent for C code reviews
(p = 0.0013) and 57.4 vs 45.2 for C++ (p = 0.0003); for design reviews 65.6 vs 48.8 (C,
p < 0.0001) and 56.7 vs 50.7 (C++, p = 0.2206, not significant).

Where 200 LOC/hour originally came from (Section 2.3, p. 3), cited to Ackerman, Gilb and
Graham, Glass, and Radice:

> "The preparation rate for each participant when inspecting code should be about 100 LOC/hour
> and no more than 200 LOC/hour. The meeting review rate for the inspection team in code
> inspections should be about 125 LOC/hour and no more than 250 LOC/hour for code."

Lineage (Section 5, p. 15): "when Fagan formalized the inspection process in 1976, he included
guidelines on recommended preparation and meeting rates based on his observations at IBM. Buck
found an optimal inspection rate of 125 LOC/hour."

**There is no cliff.** Figure 6 (p. 15) plots DRE against review rate in bins and shows a
smooth monotonic decline. Below the boundary the curve is flat: "no statistically significant
difference was observed for either design or code reviews for review rates at 0-100 LOC/hour
versus 100-200 LOC/hour; neither was a statistically significant difference observed between
50-LOC bins" (p. 14). The authors conclude: "It may be somewhat surprising to some that, once
the 200 LOC/hour limit has been met, a more deliberate pace seems to not materially improve
performance" (p. 15).

Unit and population: LOC per hour of individual preparation effort; percentage of injected
defects removed, per program, per developer. Outcome is defects found in review and in test
within a bounded classroom exercise, not escaped or post-release defects. Production and test
lines not separated.

Applicability: this is a *rate*, not a *size*, and it is a **self-review**: "in this research,
the only reviewer is the developer" (p. 15). It cannot be converted into a commit-size
threshold without assuming a review duration, which is exactly the unwarranted step Cohen took
to reach 400.

#### 5. McIntosh, Kamei, Adams, Hassan 2014 — the only published rate band tied to escaped defects

Shane McIntosh, Yasutaka Kamei, Bram Adams, Ahmed E. Hassan, "The Impact of Code Review
Coverage and Code Review Participation on Software Quality: A Case Study of the Qt, VTK, and
ITK Projects," *MSR '14*, pp. 192-201. DOI: 10.1145/2597073.2597076. Free copy:
https://posl.ait.kyushu-u.ac.jp/~kamei/publications/McIntosh_MSR2014.pdf (accessed 2026-08-18).

Corpus and method: Qt 5.0.0 and 5.1.0, VTK 5.10.0, ITK 4.3.0 — 1.1M to 5.6M LOC, 10,163 and
7,106 commits for the two Qt releases, 1,431 for VTK, 352 for ITK. Gerrit review records linked
to VCS commits by change ID. Multiple linear regression on post-release defect counts per
component, controlling for size, complexity, prior defects, churn, change entropy and five
ownership metrics. Android and LibreOffice dropped because only 2 and 14 percent of changes
could be linked to reviews.

The relevant metric (Table 2): "*Proportion of hastily reviewed changes*: The proportion of
changes that are approved for integration at a rate that is faster than 200 lines per hour."
The 200 figure is imported from Kemerer and Paulk.

The band (Section 4, RQ2, p. 8):

> "Our models also indicate that Qt components quickly become defect-prone when review
> participation decreases. Either the proportion of hastily reviewed changes or the proportion
> of changes without discussion need only reach 0.1 and 0.13 respectively before our Qt 5.1.0
> model expects that a component will contain a post-release defect."

Unit and population: proportion of changes **per component (directory)**; outcome is count of
post-release defects, those with fixes recorded in the six-month period after release.
Production and test lines not separated.

The 200 boundary is not sharp here either (Section 5, p. 9): "setting the reviewing speed
threshold to 100 lines per hour had little impact on our models."

Applicability: git and Gerrit data, so it transfers better than anything else found. But it
bands *review speed*, which the toolkit cannot compute from git history (no review timestamps),
and the denominator is a component, not a repository.

#### 6. Sadowski et al. 2018 — reference distributions and the shape of the size effect

Caitlin Sadowski, Emma Söderberg, Luke Church, Michal Sipko, Alberto Bacchelli, "Modern Code
Review: A Case Study at Google," *ICSE-SEIP '18*, pp. 181-190. DOI: 10.1145/3183519.3183525.
Held locally: `talks/XP 2026/3183519.3183525.pdf`.

Corpus and method: ~9 million changes by >25,000 authors and reviewers, January 2014 - July
2016, plus ~13 million comments, from Google's Critique logs; robot-authored changes filtered;
plus 12 interviews and a 44-response survey.

Change size distribution (Section 5.2, p. 187):

> "At Google, over 35% of the changes under consideration modify only a single file and about
> 90% modify fewer than 10 files. Over 10% of changes modify only a single line of code, and
> the median number of lines changed is 24."

The size effect on review attention (Section 5.2, p. 187):

> "Moreover, the average number of comments per change grows with the number of lines changed,
> reaching a peak of 12.5 comments per change for changes of about 1250 lines. Changes larger
> than this often contain auto-generated code or large deletions, resulting in a lower average
> number of comments."

Comments *rise* with size up to roughly 1250 lines. If reviewer comments proxy engagement,
engagement does not collapse at 200 or 400 lines in this corpus.

What the authors cite for a size effect (Section 7.1, p. 188):

> "Previous studies have found that the number of useful comments decreases [11, 14] and the
> review latency increases [8, 24] as the size of the change increases."

A stated direction with no boundary attached. [11] is Bosu, Greiler, Bird (MSR 2015); [26] is
Kononenko, Baysal, Godfrey (ICSE 2016). Neither primary was read; no claim is made that they
contain a boundary.

Unit and population: lines changed per *change* (Google's changelist, one commit in the
monolithic repo, so this maps to a commit); comments per change. Production and test lines not
separated. Binary-only changes excluded.

#### 7. Rigby and Bird 2013 — reference distributions across twelve projects

Peter C. Rigby and Christian Bird, "Convergent Contemporary Software Peer Review Practices,"
*ESEC/FSE '13*, pp. 202-212. DOI: 10.1145/2491411.2491444. Free copy:
https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/rigby2013convergent.pdf
(accessed 2026-08-18).

Corpus: Lucent 1994-95 (88 reviews), Apache 1996-2005 (5.9K), Subversion (4.9K), Linux 2005-08
(28K), FreeBSD 1995-2006 (47K), KDE (23K), Gnome (8K), AMD 2008-11 (7K), MS Bing 2010-13
(102K), MS SQL Server (80K), MS Office 2013 (96K), Android 2008-13 (16K), Chrome OS 2011-13
(39K).

Change size (Section 4.1, p. 207, Figure 4):

> "From Figure 4, both Android and AMD have a median change size of 44 lines. This median
> change size is larger than Apache, 25 lines, and Linux, 32 lines, but much smaller than
> Lucent where the number of non-comment lines changed is 263 lines. Bing, Office, SQL, and
> Chrome have larger median changes than the other projects examined, but are still much
> smaller than Lucent. For example, Chrome's median change is 78 lines and includes 5 files."

Boxed as "Convergent Practice 3: Change sizes are small."

Why they give no size-versus-defect result (Section 4.3, p. 209): "defects are not explicitly
recorded. AMD uses CodeCollaborator, which has a field for developers to record the number of
defects found; however, **87% of reviews have no recorded defects, and only 7% have two or more
defects found**."

Unit and population: median lines added plus removed per review (Figure 4 captioned "Churn:
Lines added and removed"). Production and test lines not separated.

#### 8. Bacchelli and Bird 2013 — the canonical paper contains no size number

Alberto Bacchelli and Christian Bird, "Expectations, Outcomes, and Challenges of Modern Code
Review," *ICSE 2013*, pp. 712-721. DOI: 10.1109/ICSE.2013.6606617. Held locally:
`talks/XP 2026/icse2013.pdf`.

Corpus: 17 observed and interviewed Microsoft developers across 16 product teams; card sort of
1,047 interview units and of 570 review comments from 200 threads; surveys of 165 managers
(28 percent response) and 873 programmers (44 percent response).

Reported as a negative: all ten pages read. The paper contains **no lines-of-code figure, no
change-size distribution, and no analysis of review outcome as a function of size**. Its
findings concern the gap between expectation and outcome: defect comments are "only the fourth
most frequent, out of nine items, with 78 (14%) comments" against code improvements at 165
(29%). Its quality-assurance recommendation is a caution, not a threshold: "review does not
result in identifying defects as often as project members would like and even more rarely
detects deep, subtle, or 'macro' level issues. Relying on code review in this way for quality
assurance may be fraught" (Section VII.A).

The most-cited paper on modern code review does not support a size boundary because it does not
measure size.

### What this does and does not support

Does not support:

- **The 100-production-line commit threshold.** No source measures anything at 100 lines.
  Kemerer and Paulk's median *program* is 120 LOC; Google's median *change* is 24 lines; Rigby
  and Bird's medians run 25 to 78. A 100-line commit is already unusually large by every
  published distribution, but "unusually large" is not "past a review-effectiveness boundary."
- **The 23 percent healthy / 30 percent critical rate band.** Nothing in the literature bands
  the *share of changes* that may exceed a size. McIntosh et al. is the only published
  proportion-with-an-outcome, and it bands review *speed* at component granularity, from data
  the toolkit cannot derive from git.
- **Any boundary at 200 or 400 lines per commit.** The 200 figure is one vendor's density
  curve, confounded by that vendor's own finding that hourly defect rate is size-independent,
  from a hand-coded sample of 300 reviews of which 61 percent found nothing. The 400 figure is
  an inference from a 60-minute attention limit. Neither has been replicated in any
  peer-reviewed corpus, and no contemporary project records the data that would allow it.
- **Anything separating production from test lines.** None of the eight sources does. The
  toolkit's production-only counting has no precedent here and no calibration against it. Every
  published median cited above includes test lines, so they are **not** directly comparable to
  the toolkit's production-line counts, and the toolkit's numbers will run lower for the same
  commits.

Supports, as direction only:

- Defect density found per line falls monotonically as change size grows (Cohen, Fig. 21);
  review latency rises and useful-comment count falls with size (as summarised by Sadowski et
  al. Section 7.1). Direction is consistent; no inflection point is identified by anyone.
- Review *rate* above roughly 200 LOC/hour degrades defect removal effectiveness, smoothly, in
  a self-review setting, by about 9 to 12 percentage points of DRE (Kemerer and Paulk, Table
  14). The strongest peer-reviewed number in the area, and it is not a size.
- Small changes are the empirical norm in every measured corpus, industrial and open source,
  1996 to 2016. A toolkit could defensibly frame its band as "this repository's commits are
  large relative to published distributions" — a percentile statement against Google, Chrome,
  Android, Apache, Linux, AMD, Bing, Office, SQL Server — which is honest and citable, where
  "this exceeds a review-effectiveness threshold" is not.

The unit problem is unresolved and probably unresolvable. Cohen's unit is closest to a commit,
Google's changelist is a commit, Rigby and Bird's is a review that may bundle several patch
revisions, McIntosh's is a Gerrit patch mapped to a commit. None measures a *pull request*
bundling many commits, which is what most teams review today.

### Search record

Read in full: Cohen (all 26 pages, text-extracted and grepped for "70", "90%", "yield",
"discovery" — zero hits outside axis labels). Bacchelli and Bird (all 10 pages). Sadowski et al.
(all 10 pages). Rigby and Bird (pp. 202-211). McIntosh et al. (pp. 1-9). Kemerer and Paulk
(pp. 1-6, 13-17).

Databases and terms: WebSearch across ACM DL, IEEE Xplore, Semantic Scholar, Microsoft
Research, Kyushu University and University of Pittsburgh author pages. Terms: "SmartBear Cisco
code review case study 200 400 lines defect density origin"; "Rigby Bird convergent
contemporary software peer review practices median change size"; "Code Complete McConnell 200
400 lines review limit attribution"; "McIntosh Kamei Adams Hassan code review coverage
participation post-release defects"; "Kemerer Paulk impact of design and code reviews PSP
review rate 200 LOC per hour"; "Gousios Pinzger van Deursen pull-based development pull request
size merge latency".

Not reached: Bosu, Greiler, Bird (MSR 2015) and Kononenko, Baysal, Godfrey (ICSE 2016), cited
by Sadowski as sources for "useful comments decrease with size." Contents unverified; neither
is claimed to contain a boundary. Gousios et al. ICSE 2014 on pull request size versus merge
latency not retrieved; searches returned only abstract and landing pages. These three are the
most promising remaining leads.

Failed fetches: WebFetch returned undecoded binary for four PDFs (smartbear.co, microsoft.com,
kyushu-u, pitt.edu). All four recovered by reading the cached binary with the Read tool. No
source here is quoted from an abstract.

### Contradictions

1. **The most-repeated number in this field is a vendor's telemetry about its own product, and
   it undercuts itself.** Smart Bear measured reviews conducted in Smart Bear's Code
   Collaborator, published in a Smart Bear book. The same chapter reports that defect *rate*
   per hour is flat across review sizes, which mechanically produces the falling density curve
   it presents as the finding.
2. **SmartBear's marketing page attributes to its own case study a figure the case study does
   not contain.** The 70-90 percent defect discovery claim appears nowhere in the 26-page
   source. Structurally identical to the four withdrawn DORA attributions already documented in
   this project. If any project document reaches for it, withdraw on sight.
3. **The Code Complete attribution appears to be fabricated by repetition.** Every occurrence
   found is a blog citing a blog, and the numbers match Cohen exactly.
4. **Reviewer engagement rises with change size in the largest modern corpus.** Google's
   comments-per-change grows monotonically to a peak at ~1250 lines, from 9 million changes
   rather than 300 hand-coded reviews. The "reviewers wear out" mechanism is not visible where
   it would most be expected.
5. **Where the 200-line boundary has been tested for sharpness, it is not sharp.** Kemerer and
   Paulk found no significant difference between 0-100 and 100-200 LOC/hr, nor between 50-LOC
   bins. McIntosh et al. found halving the threshold "had little impact on our models." Two
   independent teams probing the same number found it flat on both sides. A toolkit that
   classifies at 23 versus 30 percent asserts a precision the underlying literature explicitly
   disclaims.
6. **Modern projects do not record what would be needed to validate a size threshold.** Rigby
   and Bird: 87 percent of AMD reviews record zero defects; CodeFlow has no defect field;
   Gerrit has none. Cohen 2006 is likely to remain the last of its kind, which is precisely why
   an unreplicated vendor number became the field's default.

### Local PDFs identified (for other questions)

- `talks/XP 2026/icse2013.pdf` = Bacchelli and Bird, ICSE 2013. Qualitative; no numeric
  git-derived boundary of any kind.
- `talks/XP 2026/3183519.3183525.pdf` = Sadowski et al., ICSE-SEIP 2018. Contains real
  commit-size distributions (median 24 lines, >35 percent single-file, ~90 percent under 10
  files) — relevant to RQ2 and RQ7 as well.
- `talks/XP 2026/1701.05472v1.pdf` = Juergens, Deissenboeck, Hummel, Wagner, "Do Code Clones
  Matter?" arXiv:1701.05472 (ICSE 2009). Three commercial C# systems, one Cobol, one
  open-source Java; ~900 clone groups manually inspected, 107 confirmed faults. Relevant to RQ3.
## RQ2: Change scatter across files

**Verdict**: nothing found (no boundary), with a strong direction-only result for change coupling
and a usable population baseline for files-per-commit

The literature splits exactly along the line the question anticipates. **Which files change
together** (change coupling) is a well-established defect signal. **How many files change** is a
weakly-established covariate with no boundary, no rate band, and one published "5 files" line
that its own authors describe as arbitrary. The toolkit measures the weaker of the two.

### Sources

#### 1. Hattori & Lanza, "On the Nature of Commits" (ASE 2008) — the origin of a 5-file boundary, and it is arbitrary

Lile P. Hattori, Michele Lanza. *On the Nature of Commits.* ASE 2008 workshop proceedings,
pp. 63-71. https://www.inf.usi.ch/lanza/PUBS/P/Hatt2008a.pdf (accessed 2026-08-18).

Corpus and method: nine open-source projects (aMSN, ArgoUML, Firebird, JEdit, JHotDraw, Mantis,
Miranda, Spring, Swig), C/C++/Java/PHP/Tcl/Python/C#/Delphi, ages two to nine years, intervals
1998-2008. ~72,350 CVS/SVN commits. Commits are native repository commits, not reconstructed.
Size = count of files affected. Commits classified by log-message keywords into forward
engineering / reengineering / corrective / management (validated against 1,088 manually
classified commits; F-measure 0.70 and 0.76).

On the derivation of the boundary (Section 3, "Size Classification"):

> "The approach we propose is to divide the commits into fours groups by using an exponential
> scale. Although the exponential scaling parameter for power law distributions typically lies
> in the range 2 < α < 3 [3], we choose 5 as exponential scaling parameter. Otherwise the last
> group would range from 16 or 81 up, which would still be a small number compared to some
> commits with hundreds of files in it. The proposed size classification of commits is:
> • tiny: 1 to 5; • small: 6 to 25; • medium: 26 to 125; • large: 126 up."

On the resulting distribution (Section 5.2):

> "In general, tiny commits are approximately 80% of the total, small commits are 15%, medium
> commits are less than 5% and large commits are less than 1%."

Shape (Section 3): "the number of commits with only one file is around the 50th percentile in
most cases" and "This implies that the majority of commits have very few files in it, while few
commits contain a large number of files." (Section 6, Pareto fit via Q-Q plots per project.)

Unit and population: one native VCS commit; all commits in the analyzed interval for each of nine
projects (~72k). "80% tiny" is a percentage *of commits*, averaged informally across projects,
not weighted by size. The median commit touches **one** file.

Applicability: CVS/SVN commit history, same granularity concern as git. Firmly pre-AI (1998-2008).

#### 2. Sadowski et al., "Modern Code Review: A Case Study at Google" (ICSE-SEIP 2018) — the largest population baseline

DOI 10.1145/3183519.3183525, pp. 181-190. Held locally at `talks/XP 2026/3183519.3183525.pdf`.

Corpus and method: Google Critique logs, ~9 million changes by >25,000 authors and reviewers,
January 2014 to July 2016, main codebase only, excluding changes with no reviewer, automated
changes, uncommitted changes, and zero source-line deltas. ~20,000 changes committed per workday
meet the criteria.

> "At Google, over 35% of the changes under consideration modify only a single file and about
> 90% modify fewer than 10 files. Over 10% of changes modify only a single line of code, and the
> median number of lines modified is 24." (Section 4, "Review size")

Unit and population: one reviewed, committed change (Google's changes map roughly to a squashed
PR, not to individual commits); the ~9M filtered changes. Percentages are share *of changes*.

Applicability: pre-AI (2014-2016). Single company, monorepo, flagged by the authors as possibly
non-generalizable. Gives no bound at 5 files; brackets it.

#### 3. Kamei et al., "A Large-Scale Empirical Study of Just-in-Time Quality Assurance" (TSE 2013) — file count is a predictor with no threshold, and the scatter term flips sign

IEEE TSE 39(6):757-773, June 2013. DOI 10.1109/TSE.2012.70.
https://posl.ait.kyushu-u.ac.jp/~kamei/publications/Kamei_TSE2013.pdf (accessed 2026-08-18).

Corpus and method: eleven systems — six open source (Bugzilla, Columba, Eclipse JDT, Eclipse
Platform, Mozilla, PostgreSQL) and five commercial, 1996-2010, ~250,000 changes. Defect-inducing
changes identified by SZZ (approximate SZZ for Columba and PostgreSQL; manual root-cause data for
C-5). Fourteen factors across five dimensions; logistic regression, 10-fold cross-validation,
stepwise selection. Measures log-transformed before modelling; odds ratios are `e^coefficient`.

> "We use the root directory name as the subsystem name (i.e., to measure NS), the directory name
> to identify directories (i.e., ND) and the file name to identify files (i.e., NF)." (Section 3)

Table 2, average number of modified files per change: Bugzilla 2.3, Columba 6.2, Eclipse JDT 4.3,
Eclipse Platform 4.3, Mozilla 5.3, PostgreSQL 4.5, **OSS median 4.4**; C-1 2.0, C-2 2.4, C-3 2.0,
C-4 1.8, C-5 4.8, **commercial median 2.0**.

Table 6 (odds ratios, blank = not significant at p < 0.05): NF positive in 11 of 11 projects,
negative in 0 — BUZ 2.95, COL 3.00, JDT 2.62, PLA 3.07, MOZ 4.29, POS 5.61; C-1 1.62, C-2 1.33,
C-3 4.26, C-4 2.10, C-5 1.87.

> "We can see that for the open source projects, the number of files (NF), the relative churn
> metrics (LA/LT and LT/NF), and whether or not the change was to fix a defect (FIX) are the most
> important, risk-increasing factors." (Section 5.3)

But the *scatter* term, once NF is controlled, mostly reverses. Entropy in Table 6 is positive in
1 project and negative in 5 (JDT 0.44, PLA 0.60, MOZ 0.49, POS 0.62, C-4 0.26; only C-5 at 2.28
is above 1). In the effort-aware models:

> "On the other hand, the diffusion factors (Entropy), the number of developers (NDEV), AGE, and
> NUC/NF are risk decreasing." … "For the commercial projects, only the diffusion factors (NF)
> are consistently important for change risk. These size factors are all risk decreasing in the
> effort-aware models." (Section 5.3)

Unit and population: one change. For the CVS-based open source projects this is a *reconstructed*
transaction, not a raw commit: "We consider all commits by the same developer, with the same log
message, made in the same time window as one change… we set the time window to 200 seconds"
(Section 4.2). Commercial projects use native transactional SCM. The odds ratio is **per unit
increase in log(NF)**, i.e. per e-fold (~2.72x) increase in file count, not per additional file.
The "average number of modified files per change" is a **mean over a Pareto-shaped distribution**,
so it sits well above the median.

Applicability: direct to commit history. Pre-AI (data ends 2010).

#### 4. Hassan, "Predicting Faults Using the Complexity of Code Changes" (ICSE 2009) — the closest match to "scatter", and it is not a file count

ICSE 2009, pp. 78-88. DOI 10.1109/ICSE.2009.5070510.
https://sailresearch.github.io/sail-website/data/pdfs/ICSE2009_PredictingFaultsUsingTheComplexityOfCodeChanges.pdf
(accessed 2026-08-18).

Corpus and method: six large open-source projects (NetBSD, FreeBSD, OpenBSD, Postgres, KDE,
KOffice), 108-280 subsystems each, first five years of each repository with year one discarded.
Simple linear regression on `log(x)` predicting fault count in years 4-5 from metrics in years
2-3; paired t-test and Wilcoxon at α = 0.05.

The metric is Shannon entropy of a file change probability distribution over a *period*, not a
count:

> "In the BCC model we use the file as our unit of code to build the change probability
> distribution P for each period." (Section 4.1)
>
> "Instead of simply using the number of changes to the file, we use the number of modified lines
> over a period to build the file change probability." (Section 4.1)

Periods are bursts, not commits: "All the HCM models are based on the ECC bursty model that has a
one hour quiet time between bursts" (Section 7.1).

Fix commits are deliberately excluded:

> "The BCC model, along with the next two models, only use the FI modifications. FR modifications
> are not used since they represent fault fixes which are likely to be more scattered and to touch
> areas that are not being developed during the current period. This property of fault fixes
> inflates the entropy measurement for a period." (Section 4.1)

One of the three weighting variants runs *opposite* to a naive scatter penalty:

> "HCPF3 with cij = 1/|Fi|: This factor distributes evenly the complexity associated to a period
> (Hi) between all modified files in that period… As more files are changed, the effect of a
> period's complexity on every changed file is reduced." (Section 6)

Results: R² 0.27-0.71 (Table 3); prediction-error reduction of 13% to 42% (32% average) versus a
prior-modifications predictor (Section 7.4.2), 15% to 38% versus a prior-faults predictor where
significant. No boundary value appears anywhere. The author disclaims causality:

> "Our results do not show a causality relation but intuitively we believe that a complex code
> change process negatively affects the software system." (Section 7.5)

Unit and population: entropy value per burst-delimited evolution period across the whole system;
predictor unit is a subsystem (low-level directory) aggregated from files; outcome is count of
fault-repairing modifications in that subsystem in years 4-5. Nothing here is per-commit.

Applicability: pre-AI. Transfers conceptually to git but not operationally: reproducing it needs
burst reconstruction, line-weighted probabilities, fix-commit exclusion, and subsystem aggregation.

#### 5. D'Ambros, Lanza & Robbes, "On the Relationship Between Change Coupling and Software Defects" (WCRE 2009)

WCRE 2009, pp. 135-144. DOI 10.1109/WCRE.2009.19.
https://www.inf.usi.ch/lanza/PUBS/P/DAmb2009e.pdf (accessed 2026-08-18).

Corpus and method: three Java systems — ArgoUML 0.28 (SVN, 2,197 classes, 15,257 transactions),
Eclipse JDT Core 3.3 (CVS, 1,193 classes, 13,186 transactions), Mylyn 3.1.0 (CVS, 3,050 classes,
9,373 transactions). Bugs linked from Bugzilla by pattern-matching bug IDs in commit comments.
Four per-class coupling measures (NOCC, SOC, EWSOC, LWSOC), all parameterised by *n*, the minimum
number of shared transactions for two classes to count as coupled. Spearman correlation (all
reported values significant at 0.01), plus PCA-based logistic regression with 50 folds of 90/10
cross-validation.

> "A transaction corresponds to a commit in the SCM repository… SVN marks co-changing files at
> commit time as belonging to the same transaction while in CVS the transactions must be inferred
> from the modification time (plus commit comment and author) of each file. In the case of CVS, we
> reconstruct the transactions using a sliding time window approach." (Section II)

There is a file-count cutoff, and its purpose is noise removal:

> "In computing the change coupling, we filtered out the transactions involving more than 100
> classes, which were 86 for ArgoUML, 59 for Eclipse JDT Core, and 102 for Mylyn. We manually
> inspected the commit comments of these transactions, the vast majority of which concerned
> license changes, Javadoc and documentation updates." (Section II)

The headline result, including the part that undercuts coupling's advantage:

> "In conclusion, we can answer question 1: Change coupling correlates with defects, more than
> metrics but less than number of changes." (Section IV-B)

And the tuning parameter does not generalise:

> "Since we consider three systems, we cannot derive a general formula, but limit ourselves to
> note that the correlation depends on the change proneness of the system." (Section IV-B)

Optimal *n* differs: "All the coupling measures decrease after a certain value of n: 3 for ArgoUML
and Mylyn, 10 for Eclipse." (Section IV-A). Maximum Spearman values above 0.5 generally, above 0.8
for Eclipse.

Unit and population: coupling measure per *class*, aggregated from pairwise co-change counts over
transactions. *n* is a count of shared transactions between a **pair** of classes, not files in one
commit. The 100-class cutoff applies to well under 1% of transactions in each project.

#### 6. Zimmermann, Weißgerber, Diehl & Zeller, "Mining Version Histories to Guide Software Changes" (TSE 2005)

IEEE TSE 31(6):429-445, June 2005. DOI 10.1109/TSE.2005.72. Conference version ICSE 2004.
https://thomas-zimmermann.com/publications/files/zimmermann-tse-2005.pdf (accessed 2026-08-18).
Companion: Zimmermann & Weißgerber, "Preprocessing CVS Data for Fine-Grained Analysis", MSR 2004.

> "ROSE follows the classical sliding window approach [9]: Two subsequent changes by the same
> author and with the same log message are part of one transaction if they are at most 200 seconds
> apart." (Section 4)

The number:

> "In a CVS archive, the merge of a branch is not reflected explicitly; instead, the merge becomes
> a large transaction which includes all the changes made in the branch. In order to detect
> coupling within transactions, one must avoid the large merge transactions. ROSE does so by
> ignoring all changes that affect more than 30 entities." (Section 4)

The MSR 2004 companion frames the same operation as cleaning: "Large transactions which often
result from infrastructure changes and merge transactions which simply reproduce changes are such
noise." (Section 5)

Unit and population: 30 **entities** (methods, fields, classes, or documentation sections), not
files — ROSE parses files into syntactic entities, so 30 entities is typically far fewer than 30
files. Aggregation unit is a 200-second sliding-window transaction. No defect outcome; evaluation
metric is recommendation precision and recall.

Applicability: the 30-entity number is not transferable to a git file-count threshold under any
reading.

#### 7. Gall, Hajek & Jazayeri, "Detection of Logical Coupling Based on Product Release History" (ICSM 1998)

ICSM 1998, pp. 190-198. https://plg.uwaterloo.ca/~migod/846/papers/gall-coupling.pdf
(accessed 2026-08-18).

> "We have developed the approach by working with 20 releases of a large Telecommunications
> Switching System. We use release information such as version numbers of programs, modules, and
> subsystems together with change reports to discover common change behavior (i.e. change
> patterns) of modules." (Abstract)

Unit and population: a **release**, not a commit. Granularity program / module / subsystem, not
file. Outcome: identification of restructuring candidates. No defect outcome, no counts, no
threshold, n = 1 system. Establishes the coupling *construct* only.

#### 8. Di Nucci, Palomba, Siravo, Bavota, Oliveto & De Lucia, "On the Role of Developer's Scattered Changes in Bug Prediction" (ICSME 2015)

ICSME 2015, pp. 241-250. DOI 10.1109/ICSM.2015.7332472.
https://fpalomba.github.io/pdf/Conferencs/C8.pdf (accessed 2026-08-18).

Corpus and method: five large Java open-source systems (Xerces-J among them, history from Nov
1999). SZZ for bug-introducing changes. Change history split into three-month time periods with a
three-month sliding window for training.

Structural scattering `StrScat(d,p)` is the number of code components a developer *d* touched in
period *p*, multiplied by the mean pairwise **package-tree distance** between them ("the number of
subsystems one needs to cross in order to reach one component from the other", Section I).
Semantic scattering uses vector-space textual similarity. Both are summed per component to form a
predictor variable. Reported prediction accuracy 68% to 94%.

Unit and population: one developer, one three-month period, aggregated to a code component. Not a
per-commit measure and not a file count: two files in the same package contribute zero structural
scattering regardless of how many there are. No threshold published; measures enter a classifier
as continuous predictors.

#### 9. Herzig & Zeller, "The Impact of Tangled Code Changes" (MSR 2013) — a validity warning for every study above

MSR 2013, pp. 121-130. https://www.st.cs.uni-saarland.de/publications/files/herzig-msr-2013.pdf
(accessed 2026-08-18). Extended: Herzig, Just & Zeller, EMSE 21(2):303-336, 2016.

> "we found up to 15% of all bug fixes to consist of multiple tangled changes. Using a
> multi-predictor approach to untangle changes, we show that on average at least 16.5% of all
> source files are incorrectly associated with bug reports" (Abstract)
>
> "73% of all tangled changes have a blob size of two." (RQ1 results) — "blob size" is the number
> of tangled *tasks*, not files.

Unit and population: an issue-fixing change set. "15%" is a share of bug fixes; "16.5%" is a share
of source files mislabelled in the derived bug-count dataset. Impact on bug-count models ranged 6%
to 50%, harmonic mean 17.4%.

Applicability: gives no files-per-change number. It matters because every defect-outcome result
cited above rests on commit-to-bug linkage that tangling corrupts, and multi-file commits are
precisely where tangling lives.

#### 10. Methodological note: Alves, Ypma & Visser, "Deriving Metric Thresholds from Benchmark Data" (ICSM 2010)

DOI 10.1109/ICSM.2010.5609747.
https://webarchive.di.uminho.pt/wiki.di.uminho.pt/twiki/pub/Personal/Joost/PublicationList/AlvesYpmaVisserICSM2010.pdf
(accessed 2026-08-18). Benchmark of 100 object-oriented systems, proprietary and open source.

> "the effective use of software metrics is hindered by the lack of meaningful thresholds.
> Thresholds have been proposed for a few metrics only, mostly based on expert opinion and a small
> number of observations." (Abstract)

They derive thresholds as benchmark quantiles (70/80/90 percentile of weighted code volume,
mapping to low / moderate / high / very-high risk), with the explicit requirement that the method
"should not be driven by expert opinion but by measurement data from a representative set of
systems".

Caveat: their metrics are *source-code* metrics (LOC, McCabe, parameter count) measured per unit of
code, not process metrics per commit. Supplies no files-per-commit number. Included because it is
the standard citation for the approach this project's `calibration/` directory already takes.

### What this does and does not support

**No source gives a boundary against any quality outcome.** Three numeric file-count cutoffs exist
and all three are noise filters:

| Number | Source | Purpose | Unit |
|---|---|---|---|
| >30 entities discarded | Zimmermann TSE 2005 | drop CVS merge transactions | syntactic entities in a 200s window transaction |
| >100 classes discarded | D'Ambros WCRE 2009 | drop license/Javadoc bulk edits | classes per SVN commit or CVS window transaction |
| 5 files = "tiny" boundary | Hattori & Lanza ASE 2008 | bucket a Pareto distribution for presentation | files per native commit |

The Hattori boundary is the only 5, and the authors state its derivation was convenience. None is
validated against defects, maintainability, or review outcomes.

**Entropy and scattering have no published threshold.** Hassan's HCM enters a linear regression as
`log(x)`, reporting R² and prediction-error deltas, never a cut-off. Kamei's Entropy enters a
logistic regression as a normalised continuous variable; likewise. Di Nucci's measures enter a
classifier as continuous predictors. Searched specifically for downstream threshold proposals;
none found.

**The unit varies by source and rarely matches a git commit.** Native commits: Hattori, D'Ambros
for ArgoUML only. Reconstructed with a sliding time window: Zimmermann (200 s), Kamei for the six
OSS projects (200 s), D'Ambros for the two CVS projects. Burst-delimited period: Hassan (one-hour
quiet gap). Developer-quarter: Di Nucci. Reviewed change ≈ squashed PR: Sadowski. Release: Gall.
**This matters to the toolkit's stated premise:** several studies had to *reconstruct* the change
unit because CVS lacked atomic commits, and the toolkit's own concern is the inverse (squash-merge
destroying commit granularity). The literature's "change" and the toolkit's "commit" are not the
same object.

**Nothing supports a rate band as a *health* line.** Two sources supply a *base rate*, which is the
useful finding:

- Hattori & Lanza: ~80% of commits are 1-5 files across nine OSS projects, so **roughly 20% exceed
  5 files** in ordinary projects with no identified quality problem.
- Sadowski: at Google, >35% single-file, ~90% under 10 files, so ~10% touch 10 or more.
- Kamei Table 2: mean files per change, OSS median 4.4, commercial median 2.0 (means over Pareto
  distributions, so medians are far lower).

The toolkit's 19% healthy band sits essentially *at* the observed open-source base rate. That makes
it defensible as a "typical" line and indefensible as a "healthy" line: a project scoring 19% is
average, not good, and the label implies a quality claim the evidence does not carry.

Could be justified: a descriptive band anchored on Hattori (~20% of commits exceed 5 files in
ordinary OSS), or a percentile derived the Alves way from this project's own
`calibration/observations.json`, labelled as a population baseline. Cannot be justified: any
statement that 5 files or 19% relates to defect risk, maintainability, or review quality.

### Search record

Local PDF library checked. Four previously-unknown files identified for other questions:

- `talks/XP 2026/icse2013.pdf` = Bacchelli & Bird, ICSE 2013, DOI 10.1109/ICSE.2013.6606617.
- `talks/XP 2026/1701.05472v1.pdf` = Juergens et al., "Do Code Clones Matter?", arXiv:1701.05472
  (ICSE 2009).
- `talks/XP 2026/3183519.3183525.pdf` = Sadowski et al., ICSE-SEIP 2018. Used here as source 2.
- `Ai adoption/67110.pdf` = Anderson, Parker & Tan, "The Hidden Costs of Coding With Generative
  AI", MIT Sloan Management Review, reprint 67110, 18 August 2025. **Trade magazine article, not a
  study with a stated corpus; rejected under the evidentiary standard.**

No local PDF bears on files-per-change.

Databases: Semantic Scholar, ACM DL, IEEE Xplore listings, dblp, arXiv, Google Scholar redirects,
author homepages (sailresearch.github.io, inf.usi.ch/lanza, thomas-zimmermann.com,
st.cs.uni-saarland.de, posl.ait.kyushu-u.ac.jp, fpalomba.github.io, plg.uwaterloo.ca,
webarchive.di.uminho.pt).

Terms: change coupling defects threshold; logical coupling co-change; code change entropy threshold
cut-off; scattered changes bug prediction; number of files changed per commit defect-prone; commit
size classification tiny small medium large; sliding time window transaction reconstruction; large
transaction filter merge noise; just-in-time defect prediction diffusion NF; tangled code changes;
deriving metric thresholds benchmark percentile; AI assistant files per commit / files per pull
request 2024-2025.

Read in full or substantial part: Hassan ICSE 2009 (complete), D'Ambros WCRE 2009 (complete through
the regression section), Zimmermann TSE 2005 (Sections 1-4), Zimmermann MSR 2004 (Section 5), Kamei
TSE 2013 (Sections 3, 4, 5.3, plus Tables 2, 6, 7 read as page images), Hattori & Lanza ASE 2008
(complete), Di Nucci ICSME 2015 (Sections I-IV), Gall ICSM 1998 (Sections 1-2 plus keyword sweep
for defect/threshold, both absent), Herzig MSR 2013 (abstract and RQ1 results), Sadowski ICSE-SEIP
2018 (Sections 3-4), Alves ICSM 2010 (abstract and threshold-selection section).

Failed or rejected:

- `https://www.inf.usi.ch/faculty/lanza/publications.html` — HTTP 403 via WebFetch. Worked around
  by guessing the stable PDF path pattern `inf.usi.ch/lanza/PUBS/P/`, which resolved.
- Mockus & Weiss, "Predicting Risk of Software Changes", Bell Labs Technical Journal 5(2):169-180,
  2000 — **INACCESSIBLE**. This is the origin of the "number of subsystems touched relates to
  defect probability" claim that Kamei cites as motivation for the whole diffusion dimension.
  Probed `mockus.us/papers/change_risk.pdf` and `mockus.us/papers/risk.pdf` (both 404); journal
  behind Wiley/Nokia paywall; only an Academia.edu copy surfaced, requiring login. Its claim is
  reported here only *as quoted secondhand by Kamei*, and Kamei's paraphrase gives no number.
  Anyone who reaches it should check whether Mockus states a subsystem-count boundary.
- Purushothaman & Perry (small changes) and Hindle et al. (large commits) appear only as Hattori's
  citations; not retrieved, not relied on.
- Post-2022 measurement of files-per-commit or files-per-PR under AI assistance: **NOT FOUND**.
  Results were AI-adoption studies measuring PR counts, task completion, and clone rates, none
  reporting a file-count distribution.

### Contradictions

**1. The 5-file line's only literature parallel is explicitly arbitrary, and the 19% band is the
base rate, not a health line.** Hattori & Lanza chose 5 because 2 or 3 would have produced an
unhelpful top bucket, and their nine-project corpus puts ~20% of ordinary commits above it.
Labelling 19% "healthy" encodes "average" as "good".

**2. Bug fixes are the *smallest* commits, and the largest commits are mostly benign.** Hattori:
"Tiny commits are more related to corrective activities" and, for large commits, "management
activities are the majority in five projects, but forward engineering occupies the first position
in four… we confirm the findings by Hindle et al. that a great number of large commits is actually
related to the development of new functionalities." D'Ambros manually inspected their >100-class
transactions and found "the vast majority of which concerned license changes, Javadoc and
documentation updates." Zimmermann's >30-entity cases are branch merges. A high file count is more
often a merge, a rename sweep, a license header pass, or a genuine feature than a quality defect.
Filed as `code-quality-metrics-nek`.

**3. Once file count is controlled, *scatter* is associated with fewer defect-inducing changes, not
more.** Kamei's normalised Entropy has odds ratios below 1 in five of six projects where
significant, and is risk-decreasing throughout the effort-aware models — where NF itself also flips
to risk-decreasing for the commercial systems. The toolkit's "sprawl is bad" framing is not what
the largest per-change study on this question found. Hassan's HCPF3 variant carries the same
reversal in its construction.

**4. Coupling is the better-supported signal, and this toolkit does not measure it — but even a
plain change count beat coupling on the primary outcome.** D'Ambros: "Change coupling correlates
with defects, more than metrics but less than number of changes." The honest ordering on their three
systems: number of changes > change coupling > object-oriented complexity metrics, with
files-per-commit not tested at all. Two caveats limit what switching to coupling would buy: the
tuning parameter *n* is system-specific with no general formula (3 for ArgoUML and Mylyn, 10 for
Eclipse), and per Herzig at least 16.5% of files in these derived datasets are incorrectly linked to
bug reports because of tangling.

Beads: claimed and closed `code-quality-metrics-w0o`. Filed `code-quality-metrics-nek` (sprawl rate
confounded by commit activity mix). Appended the Hattori-arbitrariness and base-rate findings to
`code-quality-metrics-0er` rather than opening a rival.
## RQ3: Duplication rate

**Verdict**: nothing found (for a boundary) — distribution only, and the distribution is not
comparable to the toolkit's measurement

No published study proposes a healthy or critical duplication percentage. The literature
supplies a distribution of measured clone coverage across real systems, but every figure in it
is a function of the detection tool and the minimum clone size, and the two published papers
that vary the minimum size internally show the rate roughly tripling when the minimum is
halved. Separately, the clone-and-defect literature largely **contradicts** the premise that a
higher duplication rate signals lower quality. See Contradictions; it is the most important
part of this section.

### Sources

#### 1. Wagner, Abdulkhaleq, Kaya, Paar — *On the Relationship of Inconsistent Software Clones and Faults* (2016)

SANER 2016, DOI 10.1109/SANER.2016.94; preprint arXiv:1611.08005. This is the local PDF
`Ai adoption/On_the_Relationship_of_Inconsistent_Software_Clone.pdf`, now identified.

Corpus and method: three closed-source Java systems at TWT GmbH (automotive), 253/332/454
kLOC, 4-5 years old, 1,622-2,470 revisions, 5-10 developers. Clones detected with ConQAT
`JavaGappedCloneAnalysis` on the latest revision, then the full Mercurial history of
clone-containing files cross-referenced against FogBugz issues. Detection run twice: liberal
(min-length 10 units, max errors 10, gap ratio 0.25) and conservative (min-length 20 units).
All conservative results manually screened for false positives.

The share-of-lines numbers, Tables V and VI (p. 8), columns Minlength / Error / Gap Ratio /
Runtime / kLOC / Clone LOC / Clone Count:

> **TABLE V. CLONE DETECTION WITH THE LIBERAL APPROACH** … A | 10 | 10 | 0.25 | 58s | 253 |
> 25.443 | 981 · B | 10 | 10 | 0.25 | 58s | 332 | 49.2 | 1.545 · C | 10 | 10 | 0.25 | 112s |
> 454 | 47.8 | 2.244
>
> **TABLE VI. CLONE DETECTION WITH THE CONSERVATIVE APPROACH** … A | 20 | 10 | 0.25 | 52s |
> 253 | 7.6 | 143 · B | 20 | 10 | 0.25 | 42s | 332 | 17.7 | 352 · C | 20 | 10 | 0.25 | 97s |
> 454 | 15.6 | 382

Unit and population: Clone LOC / kLOC is a share of physical lines of the whole system.
Derived (agent's computation, not stated in the paper; the "Clone LOC" column carries no unit
label, though both readings of A's `25.443` give the same ratio):

| System | Conservative (min 20 units) | Liberal (min 10 units) |
|---|---|---|
| A (253 kLOC) | 3.0 % | 10.1 % |
| B (332 kLOC) | 5.3 % | 14.8 % |
| C (454 kLOC) | 3.4 % | 10.5 % |

**The single most decision-relevant fact in the search.** Halving the minimum clone length on
identical systems moves measured duplication from 3.0-5.3 % to 10.1-14.8 %, roughly 3x. The
toolkit's healthy band (3 %) and critical band (10 %) are *the same codebase measured at two
different minimum clone sizes*.

The paper's fault results use a different unit: clone groups, not lines. Table II:
`RQ 2: |C_F^T3|/|C^T3|` = 0.33 / 0.05 / 0.03, mean 0.17.

> "Answer to RQ 2: On average, 17 % of all type-3 clone groups contained a documented fault.
> The range is from 3 % to 33 %. Therefore, type-3 clones do contain documented faults but not
> a high ratio of them." (Section V.C, boxed answer)

RQ 4 (Section V.E, Table IV): Spearman's rho between clone length and faultiness = 0.268,
p = 0.120, N = 35.

> "Answer to RQ 4: The length of clones do not influence their faultiness."

Applicability: industrial Java, whole-system snapshot scan, pre-AI (2016). Transfers to a
repository-wide clone scan. Does not transfer to git commit history; nothing is measured per
commit.

#### 2. Rahman, Bird, Devanbu — *Clones: What is that Smell?* (MSR 2010)

MSR 2010, IEEE, pp. 72-81 (Best Paper). Journal version: *EMSE* 17(5):503-530, DOI
10.1007/s10664-011-9195-3. Free author copy: https://cabird.com/pdfs/rahman2010cws.pdf
(accessed 2026-08-18).

Corpus and method: four medium-to-large open-source C projects (Apache httpd, Nautilus,
Evolution, Gimp), 116-155 monthly snapshots each, full project history. Clones detected with
DECKARD (AST-based, vector similarity):

> "For the conservative mode, we set minimum token parameter for DECKARD to 50 (clones must be
> at least 50 tokens in length) and similarity to 1.0 (clones must be nearly identical). In
> liberal parameter setting, we set minimum token to 50 and similarity to 0.99" (Section III.B)

Bugs linked from Bugzilla to fix revisions; every source line in a snapshot tagged `copy` or
`unique`.

Unit and population: Table I gives `Lines per snapshot` and `Cloned lines per snapshot`, both
averaged over all snapshots — a share of physical lines of the whole system, at DECKARD
min-token 50. Derived (agent's computation):

| Project | Avg lines/snapshot | Conservative | Liberal |
|---|---|---|---|
| Apache | 124,463 | 11.1 % | 13.3 % |
| Evolution | 324,487 | 8.1 % | 10.2 % |
| Gimp | 755,512 | 22.1 % | 23.3 % |
| Nautilus | 131,063 | 11.4 % | 13.3 % |

The closest comparable in the literature to the toolkit's scan: min-token 50 is exactly
`DUPLICATE_MIN_TOKENS: 50`. Still not equivalent — DECKARD is AST/vector-based where jscpd is
token-based, DECKARD has no line minimum where jscpd adds `min-lines 5`, and the corpus is C.

Applicability: whole-repository snapshot; pre-AI (2010).

#### 3. Juergens, Deissenboeck, Hummel, Wagner — *Do Code Clones Matter?* (ICSE 2009)

31st ICSE, IEEE, 2009, pp. 485-495, DOI 10.1109/ICSE.2009.5070547. Author preprint
arXiv:1701.05472. **This is the local PDF `talks/XP 2026/1701.05472v1.pdf`** — the ICSE 2009
paper re-posted to arXiv in 2017, not a new work.

Corpus and method: five production systems — three Munich Re C# systems (317/454/495 kLOC), one
LV 1871 Cobol system (197 kLOC, 17 years old), and Sysiphus (Java, 281 kLOC). ConQAT-based
inconsistent-clone detection, minimum clone length 10 statements, max edit distance 5, max
inconsistency ratio 0.2 (doubled for Cobol). ~900 clone groups manually screened for false
positives; all 700+ inconsistent clone groups shown to the systems' own developers, who
classified each as intentional or unintentional and faulty or not — about 1,800 manual
assessments.

Unit and population: clone groups throughout. Table 2: `|IC|/|C|` mean 0.52, `|UIC|/|IC|` mean
0.28, `|F|/|IC|` mean 0.15.

> "About half of the clones (52%) contain inconsistencies. … From these inconsistencies over a
> quarter (28%) has been introduced unintentionally." (Section 6)

The one cost-linked number: fault density in kLOC⁻¹ = 43 / 91.4 / 52.7 / 3.4 / 50.1, mean 48.1,
computed as faults divided by the *inconsistent logical lines only* (3,371 lines across all five
systems), against Endres and Rombach's typical whole-system range of "0.1-50 faults per kLOC"
(Section 5.3).

**The paper reports no clone coverage percentage at all.** It cannot supply a duplication rate.

#### 4. Roy and Cordy — *A Survey on Software Clone Detection Research* (2007)

Queen's University Technical Report 2007-541.
https://research.cs.queensu.ca/TechReports/Reports/2007-541.pdf (accessed 2026-08-18).

A literature survey, not a measurement. Included for two things no primary does: it collects
reported rates side by side with attributions, and it states in its own voice that they are not
comparable.

The collected rates, Section 1, all share of source code lines unless noted:

> "Baker [18] has found that on large systems between 13% - 20% of source code can be cloned
> code. Lague et al. [158] have studied only function clones and reported that between 6.4% -
> 7.5% of code is cloned code whereas Baxter et al. [31] have reported that 12.7% of code being
> clones of a software system. Mayrand et al. [178] have also estimated that normal industrial
> source code contains 5% – 20% of duplicated code. Kapser and Godfrey [123] have experienced
> that as much as 10% –15% of source code of large system is cloned. For an object-oriented
> COBOL system, the rate of duplicated code is found even much higher, about 50% [74]."

Abstract: "Several studies show that about 5% to 20% of a software systems can contain
duplicated code".

The survey's own open problem, Section 17, p. 84 — this is the finding, not the rates above:

> "**Studies of clone coverage**: Although there are several studies that show that a
> significant amount of code is cloned code of a software system, a solid argument is still
> missing. This is because comparing the results of these studies is difficult and error-prone.
> Different studies use different clone detection tools where most tools use their own
> detection-dependent definitions of a clone. Many detection algorithms also take adjustable
> parameters. A large scale case study with systems of different languages can be conducted
> with a common clone definition."

Applicability: the collected figures are secondary; none is quoted with its minimum clone size,
which is exactly the omission that makes them unusable. Treat 5-20 % as folklore-with-attribution,
not a calibrated distribution. Primaries (Baker WCRE 1995, Lague ICSM 1997, Baxter ICSM 1998,
Mayrand METRICS 1996, Kapser and Godfrey WCRE 2006, Ducasse ICSM 1999) were not individually
retrieved.

#### 5. SonarQube default quality gate — vendor product default, not research

SonarSource, *SonarQube Server documentation*, quality-standards and metric-definitions pages,
docs.sonarsource.com (accessed 2026-08-18).

Default "Sonar way" gate condition: **Duplicated lines density ≤ 3.0 %**, applied to **new
code**, not the whole codebase.

Metric definition: `duplicated_lines_density = duplicated_lines / lines * 100`

Detection minimum, verbatim from metric-definitions: at least **100 successive and duplicated
tokens** spread over at least **10 lines** for most languages (30 for COBOL, 20 for ABAP); for
Java, at least 10 successive duplicated statements regardless of tokens or lines.

Unit and population: share of physical lines, denominator = lines of new or changed code in the
analysis period.

**Why this matters more than any paper here**: the toolkit's healthy band of 3 % is numerically
identical to Sonar's default gate, but the toolkit measures it at `min-lines 5 / min-tokens 50`
— half of Sonar's minimum in both dimensions — and over the full contents of the production
files a commit window touched, not over new code. Wagner et al. quantifies what halving the
minimum does: roughly 3x. A codebase that passes Sonar at 3.0 % will not read 3.0 % under this
toolkit's settings. Filed as `code-quality-metrics-k1g`.

A product default with no published derivation. Not evidence of a boundary; evidence of where
one vendor put its default.

#### 6. GitClear (already searched; restated for the unit contrast)

GitClear's 0.70 → 6.66 % is the share of **commits containing at least one duplicate block of
five or more lines**. A per-commit prevalence, not a share of lines. Arithmetically unrelated to
every other percentage in this section, all of which are share-of-lines. `DUPLICATE_MIN_LINES: 5`
is the only thing GitClear legitimately anchors; its 6.66 % cannot anchor a percentage band.

#### 7. Rejected: SonarSource, *The Inevitable Rise of Poor Code Quality in AI-Accelerated Codebases*

Sonar Blog, 2025,
https://www.sonarsource.com/blog/the-inevitable-rise-of-poor-code-quality-in-ai-accelerated-codebases/
(accessed 2026-08-18). Cited as reference [7] in this project's
`measuring-ai-code-drift-using-github-metrics.md:165`.

Rejected on the corpus-and-method requirement. States no corpus, no period, no tool, no
repository sample of its own. Every statistic is attributed to a third party. Its only
duplication figure restates GitClear:

> "GitClear's 2020 to 2024 analysis tracked an 8-fold increase in the frequency of code blocks
> containing five or more duplicated lines"

**Incidental finding.** The same article attributes "9% climb in bug rates, 91% increase in code
review time, 154% increase in PR size" to the "Google 2025 DORA Report." Those are three of the
four figures this project already searched the DORA reports for and withdrew as untraceable.
This blog, which the project cites, is a plausible transmission path for them. Filed as
`code-quality-metrics-9ur`.

### What this does and does not support

Does not support:

- Any healthy or critical duplication percentage. No study proposes one. Neither does jscpd,
  whose own `--threshold` default is 0 (report everything, fail nothing).
- The 3 % healthy band as currently measured. The number is SonarQube's default gate, applied
  at half Sonar's minimum block size and to a different population.
- Reading a rising duplication percentage as a quality signal. See Contradictions.

Supports, weakly:

- A distribution statement with a heavy caveat. Across the four papers with stated methods and
  stated minimum clone sizes, whole-system share-of-lines clone coverage in production codebases
  falls in roughly **3-23 %**, and within that, the position of any one system depends more on
  the detector's minimum clone size than on the system. Wagner et al. is the proof.
- The narrow inference that follows: **the toolkit's healthy band sits at the extreme low end of
  everything ever measured, while its settings are more sensitive than anything used to measure
  it.** Both errors point the same way. Under jscpd at 5/50, well-maintained mature codebases
  should be expected to read well above 3 %.
- If the project wants 3 % to mean what Sonar means by it, raise `DUPLICATE_MIN_LINES` /
  `DUPLICATE_MIN_TOKENS` to 10/100. If it keeps 5/50, the band has to move up and must not be
  described as Sonar's number or as research-backed.

On comparability to a jscpd 5-line / 50-token scan: no measured rate in the literature is
comparable. Rahman et al. is nearest (DECKARD, min-token 50) but is AST-based with no line
minimum, on C. Roy and Cordy say this explicitly and it remains true nineteen years later.

### Search record

Read in full or in relevant part: local `Ai adoption/On_the_Relationship_of_Inconsistent_Software_Clone.pdf`
(Wagner et al. 2016, read in full including Tables I-VI); local `talks/XP 2026/1701.05472v1.pdf`
(identified as Juergens et al. ICSE 2009, read Sections 5-6 and Tables 1-2); Roy and Cordy TR
2007-541 (abstract, Section 1, Section 17); Rahman, Bird, Devanbu MSR 2010 (Sections I-V, Table
I); SonarQube docs; SonarSource blog (fetched twice with different extraction prompts); project
files `lib/config.js`, `lib/thresholds.js`, `lib/duplicate.js`, `lib/report.js`,
`calibration/observations.json`.

Databases and terms: Semantic Scholar, arXiv, ACM DL, IEEE Xplore, ScienceDirect, ResearchGate,
author homepages. Terms: Roy Cordy survey clone percentage; Rattan Bhatia Singh systematic
review; Juergens do code clones matter; Rahman Bird Devanbu clones what is that smell; Monden
industrial legacy software code clones; Krinke cloned code stability; Kamiya CCFinder JDK Linux
FreeBSD percentage minimum tokens; Cheung Ryu Kim JavaScript clones; Lopes DéjàVu GitHub
duplicates; jscpd default min-tokens threshold; SonarQube duplicated lines density default gate.

INACCESSIBLE:

- Rattan, Bhatia, Singh, *Software clone detection: A systematic review*, IST 55(7):1165-1199,
  2013. ScienceDirect returned HTTP 403. No open-access copy found. Not used.
- Cheung, Ryu, Kim, *Development nature matters: An empirical study of code clones in JavaScript
  applications*, EMSE 21(2):517-564, 2016, DOI 10.1007/s10664-015-9368-6. Author copy returned
  HTTP 403 / HTML redirect on repeated attempts; Semantic Scholar API returned HTTP 429. **The
  most language-appropriate source for a JavaScript-oriented toolkit and the biggest remaining
  gap in this section.** Worth one more attempt from a different network or institutional access.
- Kamiya, Kusumoto, Inoue, *CCFinder*, IEEE TSE 28(7):654-670, 2002. Three mirrors tried; two
  returned HTML, one an unrelated Japanese-language paper. Its reported figures are file-level
  cross-system counts, a third unit again. Not quoted.
- Monden et al., *Software quality analysis by code clones in industrial legacy software*, IEEE
  METRICS 2002, pp. 87-94. Paywalled; no open copy. Snippets describe the finding as "modules
  having code clones are more reliable than modules having no code clone on average," with
  modules containing clones over 200 SLOC being less reliable. **Abstract/snippet only, method
  and denominators unverified.** Not counted as a source.
- Lozano and Wermelinger; Krinke's clone-stability work — located as citations only, primaries
  not retrieved. Represented here only through Wagner's and Rahman's verbatim related-work
  summaries.

### Contradictions

**The premise that duplication rate is a quality signal is contradicted, not merely unsupported,
by the strongest studies in this literature.** This goes further than "no boundary exists."

1. **Rahman, Bird and Devanbu found clones are *less* defect-prone than non-cloned code.**
   Abstract:

   > "We find that, first, the great majority of bugs are not significantly associated with
   > clones. Second, we find that clones may be less defect prone than non-cloned code. Finally,
   > we find little evidence that clones with more copies are actually more error prone. Our
   > findings do not support the claim that clones are really a 'bad smell'. Perhaps we can
   > clone, and breathe easy, at the same time."

   Body (Section V.A, RQ1): "besides Gimp, 80% or more bugs in the other projects contain no
   cloned code at all. … This finding suggests that only a small number of bugs are attributable
   to cloning."

   Significant across all four projects and both parameter settings (Table II, paired Wilcoxon
   with Benjamini-Hochberg adjustment, p between 3.4e-06 and 1.1e-03). They suggest the inverse
   use: "one might well conclude that bug-prediction tools could use cloned content as a negative
   indicator of defect-proneness!" (Section I)

2. **Clone length does not predict faultiness.** Wagner et al. RQ4: Spearman's rho 0.268,
   p = 0.120, null accepted. The intuition that bigger duplicate blocks are worse has no support.

3. **What the harm literature implicates is *inconsistency between* clones, which jscpd does not
   measure.** Juergens found faults in 15 % of inconsistent clone groups; Wagner found documented
   faults in 17 % of type-3 clone groups and traced between-system variance to developer
   *awareness* of the clones rather than to how much duplication existed. Wagner et al.,
   Section VI.C:

   > "As several studies confirmed now that faultiness is not a strong argument for considering
   > cloning to be a bad smell, researchers need to concentrate more on the effects of the size
   > increase caused by cloning."

   A duplication percentage from a token scanner measures volume. The published harm mechanism is
   divergence between duplicates over time, plus the size increase itself. The toolkit measures
   neither.

4. **A methodological warning aimed squarely at this project.** Both of Wagner's case-study
   organizations already ran SonarQube duplication analysis in the build, and developers judged
   it useless at that point:

   > "Both cases had duplication analysis with SonarQube automatically performed with the build
   > of the system. Those were described as too late. The information is needed before or while
   > performing a change." (Section V.D.4)

**Implication for the toolkit.** `DUPLICATION_PCT` should be presented as a descriptive
size-and-repetition indicator whose absolute value is a function of the scanner's parameters, not
as a defect-risk verdict. The two derived-from-the-author's-own-repos numbers are not merely
under-sourced; the risk claim they carry is contradicted by the best available evidence. If a
verdict is retained, it should be capped at warning, on the same reasoning already applied to
`dora_archetype`.

Beads filed: `code-quality-metrics-k1g`, `code-quality-metrics-9ur`. Both linked
`discovered-from: code-quality-metrics-1b8`, now closed.
## RQ4: Code churn and the net-new ratio

**Verdict**: **direction only** — and weakly, for the specific form the toolkit computes.

Churn is the best-established defect predictor in this brief, and that holds up. But the
establishment is entirely **correlational**, and it is established for **churn volume normalised by
code size**, not for **additions relative to deletions**. Every study that measured an
additions-over-deletions form found it to be the *weakest* member of the churn family. No study in
any corpus publishes a cut point for any churn measure.

### The distinction that decides this question

A correlation supports the **metric**. Only a threshold supports the **band**. Here the two come
apart twice over:

1. **No boundary exists anywhere.** Nagappan and Ball, the canonical relative-churn paper, close by
   listing the derivation of such a boundary as *future work they had not done*. Hassan's entropy
   paper contains the string "threshold" zero times. Kamei's only threshold is a logistic-regression
   probability cut at 0.5, which is about classifier output, not about churn.
2. **The correlation that does exist is for a different metric.** The literature's relative churn is
   `churn ÷ size of the code being changed` (Nagappan M1 = Churned LOC / Total LOC; Kamei LA/LT). The
   toolkit's denominator is deletions. The one published measure with deletions in the denominator —
   Nagappan and Ball's M7 — is the weakest of eight and was dropped from the regression model.

The toolkit's metric maps onto M7 by a strictly increasing transform: with `r = (a−d)/(a+d)` and
`M7 = a/d`, `r = (M7−1)/(M7+1)`. The toolkit's own spec states this mapping. So the band boundaries
are M7 = **3.08** (healthy) and M7 = **8.52** (critical). Rank correlations are invariant under this
transform, so Nagappan and Ball's ρ for M7 is the toolkit's ρ. (Exact equivalence assumes no
modified-in-place lines, which git numstat counts as one addition *and* one deletion; the two remain
the same construct regardless.)

### Sources

#### 1. Nagappan and Ball, ICSE 2005 — the canonical relative-churn paper

N. Nagappan and T. Ball, "Use of Relative Code Churn Measures to Predict System Defect Density,"
*Proc. 27th ICSE*, St. Louis, May 2005, pp. 284-292. DOI 10.1145/1062455.1062514. Full text read
from the Microsoft Research copy:
https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/icse05churn.pdf (accessed
2026-08-18).

Corpus and method: Windows Server 2003 baseline vs. its Service Pack 1. Section 3: *"The size of the
code base analyzed is 44.97 million LOC (44,970 KLOC). This consisted of 2465 binaries which were
compiled from 96,189 files."* Churn measured by diff between the two versions; defects attributed at
binary level. Spearman rank correlation, multiple/stepwise regression, PCA, discriminant analysis,
with 2/3-1/3 data splitting plus three random splits.

Unit and population: the observation is a **binary** (n = 2465). The dependent variable is **defects
per KLOC of that binary**. Churn is cumulative between two release versions — **not per commit, and
not per repository**. Normalisation denominators are the binary's total LOC, its file count, its
weeks of churn, its churn count, or its deleted LOC.

The eight measures (Section 4), with denominators:

| | Measure | Denominator | Spearman ρ with defects/KLOC (Table 2) |
|---|---|---|---|
| M1 | Churned LOC / Total LOC | binary size | **.883** |
| M2 | Deleted LOC / Total LOC | binary size | **.798** |
| M3 | Files churned / File count | file count | **.868** |
| M4 | Churn count / Files churned | churned files | .288 |
| M5 | Weeks of churn / File count | file count | .729 |
| M6 | Lines worked on / Weeks of churn | time | .374 |
| **M7** | **Churned LOC / Deleted LOC** | **deletions** | **.288** |
| M8 | Lines worked on / Churn count | change count | .262 |

Section 3 defines the inputs: *"Churned LOC is the sum of the added and changed lines of code between
a baseline version and a new version of a binary. Deleted LOC is the number of lines of code deleted
between the baseline version and the new version of a binary."*

M7 is the toolkit's metric. Its stated purpose, Section 4:

> "M7: Churned LOC / Deleted LOC. M7 is used in order to quantify new development. All churn is not
> due to bug fixes. In feature development the lines churned is much greater than the lines deleted,
> so a high value of M7 indicates new feature development."

**Note the framing: M7 detects new feature development, not decay.** It is a cross-check on M1 and
M2, not a health signal.

M7 is the weakest predictor and was dropped. Section 5.2:

> "Table 4 shows how the R2 value changes in step-wise regression for all the models built during
> that process. In the step-wise regression model the measure M7 is dropped."

Table 6 labels the row "Step-wise regression (M7 dropped)", and dropping it changed R² only in the
third decimal place. Two of the three random splits also dropped M7 or M4 (Table 8).

No boundary is published, and the authors say so. Section 6, Future Work:

> "We also plan to develop standards for all the measures to provide guidance to the developers on
> the maximum allowable change."

The paper's only prescription is a *procedure*, per-system, not a number. End of Section 5.3:

> "For example, in order to determine the maximum allowable code churn with respect to the file size
> (i.e. M1), say for a particular software we fix the maximum allowable system defect density. We
> then can build a regression model with M2-M8 and defect density as predictors and M1 as the
> dependent variable."

The headline 89.0 percent figure is a **discriminant classification accuracy**, not a churn cut
point. Its boundary (Equation 1) is on **defect density**, not churn: `LB = μ_c − z_(α/2) × (stdev of
defect density / √n)`.

Applicability: predates AI assistance by ~17 years. Closed-source commercial monolith, single vendor,
single product family. Section 5.5 concedes: *"External validity issues may arise from the fact that
all the data is from one software system."* Commit-level granularity was **not** used.

#### 2. Munson and Elbaum, ICSM 1998 — the net-vs-gross distinction, made explicitly

S. G. Elbaum and J. C. Munson, "Code Churn: A Measure for Estimating the Impact of Code Change,"
*Proc. IEEE ICSM 1998*, pp. 24-31. DOI 10.1109/ICSM.1998.738486. Author preprint retrieved via
CiteSeerX (accessed 2026-08-18).

Corpus and method: QTB, one large embedded real-time system, 19 successive builds over six months.
Per build they recorded code delta, code churn, change requests, programmers involved, and problem
reports from regression testing. Univariate regression, n = 19 build observations.

Unit and population: the observation is a **build** (n = 19). Delta and churn are measured in
**relative complexity (RCM) units**, not lines of code — a PCA-derived composite of static complexity
metrics. The criterion is **count of problem reports per build**.

This paper draws exactly the net-vs-gross distinction the toolkit's ratio rests on, and comes out
against the net side:

> "The change in the relative complexity in a single module between two builds may be measured in one
> of two distinct ways. First, we may simply compute the simple difference in the module relative
> complexity between build i and build j. We have called this value the code delta … The absolute
> value of the code delta is a measure of code churn."

> "From the standpoint of fault insertion, removing a lot of code is probably as catastrophic as
> adding a bunch."

Table 4, ranked by predictive value — **gross beats net**:

| Process measure | Multiple R | R² |
|---|---|---|
| **Code Churn** (gross) | **0.728** | **0.529** |
| People | 0.667 | 0.445 |
| Change Requests | 0.619 | 0.383 |
| **Code Delta** (net) | **0.560** | **0.314** |

They compute something structurally close to a net-new share, and pointedly decline to grade it
(Table 5 discussion):

> "First, note the relationship between churn and delta. Had all changes resulted in new code, the
> correlation here would have been 1.0. The reported correlation of 0.940 is very close to 1.0. This
> means that the majority of changes made over the 19 builds resulted in increased code complexity.
> On the other hand, if this value had been –1.0, we would conclude that all changes made would have
> reduced the complexity of the total system."

0.940 is *described*, never called unhealthy. No threshold anywhere in the paper.

#### 3. Kamei et al., TSE 2013 — the commit-level analogue, and the strongest evidence against this denominator

Y. Kamei, E. Shihab, B. Adams, A. E. Hassan, A. Mockus, A. Sinha, N. Ubayashi, "A Large-Scale
Empirical Study of Just-in-Time Quality Assurance," *IEEE TSE* 39(6), June 2013, pp. 757-773. DOI
10.1109/TSE.2012.70.

Corpus and method: eleven projects: six open source (Bugzilla, Columba, Mozilla, Eclipse JDT, Eclipse
Platform, PostgreSQL) and five large commercial. CVS histories linked to bug reports via SZZ/ASZZ. 14
change factors, logistic regression, 10-fold cross-validation.

Unit and population: the observation is an **individual change (commit)** — the same granularity the
toolkit uses. This is the closest published corpus in unit terms.

Table 1 defines the size dimension, and hypothesises that **both** additions and deletions raise risk:

> "LA — Lines of code added. *Rationale:* The more lines of code added, the more likely a defect is
> introduced."
> "LD — Lines of code deleted. *Rationale:* The more lines of code deleted, the higher the chance of
> a defect."
> "LT — Lines of code in a file before the change. *Rationale:* The larger a file, the more likely a
> change might introduce a defect."

Section 5, model construction — the decisive passage:

> "Furthermore, we found LA and LD to be highly correlated. Nagappan and Ball [46] reported that
> relative churn metrics perform better than absolute metrics when predicting defect density.
> Therefore, we normalized LA and LD by dividing by LT, similarly to Nagappan and Ball's approach."

**Additions and deletions are treated as collinear measures of the same thing — change volume.** LD
is dropped for redundancy with LA, not because deletions are benign. The surviving relative churn
factor is **LA/LT**, additions over the prior size of the touched files.

Section 5.3, RQ3 results:

> "We can see that for the open source projects, the number of files (NF), the relative churn metrics
> (LA/LT and LT/NF), and whether or not the change was to fix a defect (FIX) are the most important,
> risk-increasing factors."

No churn threshold. The only threshold reported is on classifier output: *"We use a threshold value
of 0.5, which means that if the model-predicted probability of a defect is greater than 0.5, the
change is classified as defect inducing."*

#### 4. Shin, Meneely, Williams and Osborne — additions-only churn is the weak one

Y. Shin, A. Meneely, L. Williams, J. A. Osborne, "Evaluating Complexity, Code Churn, and Developer
Activity Metrics as Indicators of Software Vulnerabilities," *IEEE TSE* 37(6), 2011, pp. 772-787. DOI
10.1109/TSE.2010.81. Read from the author tech-report version, NCSU CSC TR-2009-10,
https://techrep.csc.ncsu.edu/2009/TR-2009-10.pdf (accessed 2026-08-18).

Corpus and method: two large open source projects: Mozilla Firefox and the Red Hat Enterprise Linux
kernel. 28 metrics across complexity, code churn and developer activity. Discriminative power tests
plus next-release univariate and multivariate logistic prediction, 10 repetitions per release.

Unit and population: the observation is a **source file**; the outcome is whether that file was
**vulnerable**, not defect count. Churn metrics are cumulative over the file's lifetime, per Table II:

> "NumChanges — The number of check-ins for a file since the creation of a file."
> "LinesChanged — The cumulated number of code lines changed since the creation of a file."
> "LinesNew — The cumulated number of new code lines since the creation of a file."

Table V (Mozilla Firefox), univariate predictability. PD = probability of detection, PF = probability
of false alarm, N(QP) = number of the 80 predictions meeting the criterion of PD > 70 percent with
PF < 25 percent:

| Metric | PD | PF | N(QP) |
|---|---|---|---|
| NumChanges | 86 | 23 | **80 / 80** |
| LinesChanged (total churn) | 85 | 25 | **76 / 80** |
| **LinesNew (additions only)** | 88 | **58** | **0 / 80** |

Red Hat kernel (out of 100 predictions): NumChanges 83/25, N=27; LinesChanged 83/39, N=0; **LinesNew
90/52, N=0**.

The additions-only measure has more than double the false-alarm rate of total churn in Firefox and
never meets the usability criterion in either project. Thresholds appear only as classifier
probability cut points; the paper states plainly that no external standard exists.

#### 5. Nagappan, Ball and Zeller, ICSE 2006 — why a universal boundary is unlikely to exist

N. Nagappan, T. Ball, A. Zeller, "Mining Metrics to Predict Component Failures," *Proc. 28th ICSE*,
Shanghai, May 2006, pp. 452-461. DOI 10.1145/1134285.1134349. Read from
https://www.st.cs.uni-saarland.de/publications/files/nagappan-icse-2006.pdf (accessed 2026-08-18).

Corpus and method: five Microsoft software systems (A-E), post-release defect history mapped back to
modules, standard complexity metrics per module, Spearman correlations, PCA plus regression,
cross-project validation.

Unit and population: the observation is a **module**; outcome is **count of post-release defects**.

Section 4.2:

> "It turns out that there is not a single metric that would correlate with post-release defects in
> all five projects. All in all, this rejects our hypothesis H2, which has a number of consequences.
> In particular, this means that it is unwise to use some complexity metric and assume the reported
> complexity would imply anything—at least in terms of post-release defects."

Pull-quote: **"There is no single set of metrics that fits all projects."**

Section 4.4, on cross-project transfer (Table 7 is almost entirely "No"):

> "Predictors obtained from one project are applicable only to similar projects—which again
> substantiates our word of caution against indiscriminate use of metrics."

They also give a concrete mechanism for why a fixed boundary misfires: project D showed almost no
metric correlations *because* its team already refactored against those metrics — *"The team of
project D routinely uses metrics like the ones above to identify potential complexity traps, and
refactors code pieces which are too complex."* **A team that manages to a metric breaks that
metric's relationship to defects.**

#### 6. Hassan, ICSE 2009 — change entropy, and the treatment of additions and deletions

A. E. Hassan, "Predicting Faults Using the Complexity of Code Changes," *Proc. 31st ICSE*, 2009,
pp. 78-88. DOI 10.1109/ICSE.2009.5070510. Read from
https://sailresearch.github.io/sail-website/data/pdfs/ICSE2009_PredictingFaultsUsingTheComplexityOfCodeChanges.pdf
(accessed 2026-08-18).

Relevant to this question, Section 4.1 defines the input:

> "Instead of simply using the number of changes to the file, we use the number of modified lines
> over a period to build the file change probability. Modified lines is the sum of added and deleted
> lines per the modification record."

**Additions and deletions are summed, not contrasted.**

NOT FOUND: any threshold. The string "threshold" appears **zero times** in the full extracted text.
Reported results are R² values (0.27-0.71) and relative prediction error reductions (−13 to −42
percent). Entropy is prescribed as something to *watch for spikes in*, never to compare against a
line.

#### 7. GitClear 2025 — the closest published analogue, and it points the other way

*AI Copilot Code Quality: Evaluating 2024's Increased Defect Rate*, GitClear, research version
v2025.2.5. Local copy: `Ai adoption/GitClear-AI-Copilot-Code-Quality-2025.pdf`.

The prior sweep of this report covered duplicate-block prevalence. **The operation-provenance
material in Appendices A0 and A1 is new to this question.**

Corpus and method. Appendix A0: *"GitClear has been classifying git repos by these operations since
2020. As of January 2025, GitClear has analyzed and classified around a billion lines of code over
five years… 211 million lines of code were meaningful (not No-op) line changes, used for this
research."* **No repository count and no per-repository distribution is given.**

**Do their categories give this metric a comparable population? No.** The definitions (Appendix A0)
are not git numstat:

> "**Added code.** Newly committed lines of code that are distinct, excluding lines that
> incrementally change an existing line (labeled 'Updates'). 'Added code' also does not include lines
> that are added, removed, and then re-added (these lines are labeled as 'Updated' and 'Churned')."
> "**Deleted code.** Lines of code that are removed, committed, and not subsequently re-added for at
> least the next two weeks."
> "**Moved code.** A line of code that is cut and pasted to a new file, or a new function within the
> same file."
> "**Updated code.** A committed line of code based off an existing line of code, that modifies the
> existing line of code by approximately three words or less."

GitClear "Deleted" requires a **two-week lookahead**; git's deletions do not. GitClear "Added"
**excludes** moved, updated and re-added lines, all of which git counts as additions. **Their
percentages cannot be read onto a git-numstat ratio.**

Unit and population of their figures: denominator is **changed lines, pooled across all repos and all
commits**, classified into six operations that sum to 100 percent. Not per commit, not per
repository, no median. Appendix A1:

| Year | Added | Deleted | Updated | Moved | Copy/pasted | Find/replaced | All lines changed |
|---|---|---|---|---|---|---|---|
| 2020 | 39.54% | 19.14% | 5.16% | 24.17% | 8.86% | 3.12% | 27,433,911 |
| 2022 | 40.86% | 19.85% | 5.17% | 20.60% | 9.56% | 3.95% | 38,120,220 |
| 2024 | 46.16% | 21.91% | 5.89% | 9.47% | 12.32% | 4.25% | 58,755,703 |
| 2025 | 49.32% | 23.00% | 6.33% | 3.10% | 13.90% | 4.35% | 69,140,000 |

**No threshold, no healthy line, no target ratio.**

### What this does and does not support

Supports:

- That change volume relative to the size of the code being changed correlates with defect density
  and with change risk. Established across a commercial monolith (Nagappan and Ball), eleven OSS +
  commercial projects at commit level (Kamei), two OSS projects at file level (Shin), and one
  embedded system (Munson and Elbaum). A real, replicated, directional result.
- That per-commit **additions normalised by prior file size** (LA/LT) is a defensible risk factor
  with published support in both OSS and commercial settings.
- Watching the metric and investigating movement in it, which is the prescription every one of these
  papers actually offers.

Does not support:

- **0.51, 0.79, or any other boundary.** No study publishes one. Nagappan and Ball name deriving one
  as future work; Hassan's paper does not contain the word.
- **The choice of deletions as the denominator.** This is the one denominator the literature tried
  and abandoned. M7 = Churned/Deleted scored ρ = .288 against .883 for M1, and stepwise regression
  discarded it.
- **The median-across-commits estimator.** Nagappan and Ball measure release-to-release per binary;
  Shin measures lifetime-cumulative per file; Hassan measures per period per subsystem; Munson and
  Elbaum measure per build. Only Kamei is per commit, and Kamei never aggregates to a
  repository-level median. **No study establishes that a median of per-commit ratios is a meaningful
  repository statistic at all.**
- **Any transfer of the correlation to a classification.** Nagappan and Ball's 89 percent
  discriminates fault-prone binaries using a bound on the *defect density* distribution of that
  dataset, fitted per system.
- **Reading a high value as "accretion without refactoring."** Nagappan and Ball read a high M7 as
  "new feature development." A greenfield project, a vendored import, or a codebase in a growth phase
  produce the same number as one that has stopped refactoring.

### Contradictions

**1. The literature does not treat deletion as healthy.** Kamei's Table 1 hypothesises that deletions
*increase* defect risk on the same footing as additions. Munson and Elbaum: *"From the standpoint of
fault insertion, removing a lot of code is probably as catastrophic as adding a bunch."* Nagappan and
Ball's M2 = Deleted LOC / Total LOC correlates with defect density at **ρ = .798** and is the *first*
predictor entered by stepwise regression (model (a), R² = .592) — deletion volume alone is the single
strongest churn predictor in the study. **The toolkit's formula puts deletions in the numerator with
a minus sign, treating them as the antidote. No source read here supports that sign.**

**2. The additions-vs-deletions form is specifically the weak one.** Two independent studies,
different corpora, different outcomes, same result. Nagappan and Ball: M7 is tied for weakest (ρ =
.288) and is dropped from the model. Shin et al.: LinesNew has PF = 58 percent in Firefox vs 25
percent for LinesChanged, and satisfies the prediction criterion in **0 of 80** runs vs **76 of 80**.
If the toolkit wanted the best-supported version of this idea it would compute additions ÷ prior LOC,
not additions ÷ deletions.

**3. On GitClear's own data, this metric barely moves during the entire AI-adoption period — while
the thing that does move is invisible to it.** Reconstructing a git-visible ratio from GitClear's raw
Appendix A1 counts (git records one `+` for Added, Updated, Moved, Copy/pasted, Find/replaced; one
`−` for Deleted, Updated, Moved, Find/replaced):

| Year | reconstructed a/d | reconstructed (a−d)/(a+d) |
|---|---|---|
| 2020 | 1.57 | **0.221** |
| 2022 | 1.62 | **0.236** |
| 2024 | 1.88 | **0.306** |
| 2025 | 2.09 | **0.354** |

*(Agent's derivation from their published counts, not a published figure. Pooled line-level aggregate,
not a median across commits — the two estimators differ. Treat as an order-of-magnitude check.)*

The direction is right and the movement is real. But every value stays **below the toolkit's 0.51
healthy boundary**. The five-year, 211-million-line industry drift that GitClear built an entire
report around would never once trip this band. Meanwhile the collapse GitClear actually documents —
Moved code from 24.17 percent to 3.10 percent, an **87 percent decline** — is precisely the signal
that git numstat cannot see: a moved line is `+1` and `−1`, which lands in the ratio's denominator as
perfectly balanced churn and reads as *healthy refactoring*. **A project that replaces genuine
refactoring with copy/paste would show its ratio move only slightly, and moving code around without
improving it would show as healthy.**

**4. The authors of the canonical paper published a companion result arguing against exactly this
kind of universal number.** Nagappan, Ball and Zeller, ICSE 2006: *"There is no single set of metrics
that fits all projects"* and *"Predictors are accurate only when obtained from the same or similar
projects."*

### Search record

Databases: Google Scholar and general web search; Semantic Scholar; dblp; ACM DL and IEEE Xplore
landing pages; arXiv; Microsoft Research publication archive; Saarland University SE chair
publication server; NCSU CSC tech report server; Queen's SAIL group site; CiteSeerX; GitClear help
centre and glossary pages.

Terms: "relative code churn measures defect density"; "code churn threshold fault-prone modules
cut-off value"; "added lines deleted lines ratio git commits defect proneness threshold"; "additions
to deletions ratio healthy repository empirical threshold"; "code change entropy ICSE 2009";
"complexity code churn developer activity vulnerabilities"; "mining metrics predict component
failures"; "GitClear code provenance methodology added deleted updated moved copy/pasted"; "Diff
Delta operations glossary"; "refactoring rate healthy projects".

Read in full or grepped in full extracted text: Nagappan and Ball 2005 (all 9 pages, read as images);
Munson and Elbaum 1998 (full text extract); Kamei et al. 2013 (full text extract plus Tables 1, 6 and
Section 5 read as images); Shin et al. tech report (full text extract, Tables II and V); Nagappan,
Ball and Zeller 2006 (full text extract, Sections 4.1-4.4); Hassan 2009 (full text extract, grepped
for "threshold" — zero hits); GitClear 2025 (full text extract, Appendices A0 and A1).

INACCESSIBLE: none of the sources named in the question proved unreachable. Munson and Elbaum was
IEEE-paywalled and 404 at unl.edu author paths; an author preprint was recovered through CiteSeerX
and its title, authors and abstract match the published record. The Shin et al. TSE version is
paywalled; the NCSU author tech report TR-2009-10 was used and cross-checked against the published
abstract, so table numbering may differ slightly from the TSE printing.

Checked and found not applicable: arXiv:2511.04427, "Speed at the Cost of Quality" — a
difference-in-differences design on Cursor-adopting GitHub projects, but the outcomes are
static-analysis warnings and code complexity, not an additions/deletions ratio. **No AI-era study
measuring additions relative to deletions was found.**

Rejected: Count.co "Repository Health Score", Cortex "18 Software Quality Metrics", LinearB
repository-level metrics docs, gitnux "Git Commit Statistics (2026)" — all vendor or aggregator pages
presenting churn guidance with no stated corpus, method, or denominator. None is citable.

Beads: claimed and closed `code-quality-metrics-e30`. Filed `code-quality-metrics-pw5` (unsourced
DORA attribution in `metrics-specification.md` for Metric 7 and Metric 6) and
`code-quality-metrics-a9z` (relative churn normalises by total LOC, not deletions).
## RQ5: Test and production co-change

**Verdict**: direction only — and, on the construct itself, closer to a refutation. No study anywhere
gives a healthy proportion of commits that should touch both test and production code. Three
peer-reviewed sources say explicitly that same-commit co-occurrence is a noisy proxy for test
discipline, and one gives a published per-project distribution whose ceiling sits below the toolkit's
live healthy line.

**Two corrections to the question as posed.** The toolkit's live band is
**`TEST_COVERAGE_RATE: { warning: 30, healthy: 50 }`** (`lib/thresholds.js` line 31, the only band in
that file with no derivation comment). The 23 percent figure in `calibration/research-brief.md` is
stale. Separately, `.github/workflows/pr-metrics.yml` carries its own hardcoded `>50%` target (line
314) and a "Strong test-first discipline" strength at `>50%` (lines 175, 220), independent of
`lib/thresholds.js`. The findings below bear on 50, not 23.

### Sources

#### 1. Zaidman, Van Rompaey, Demeyer, van Deursen — the canonical co-evolution study

Zaidman, A., Van Rompaey, B., van Deursen, A., Demeyer, S. "Studying the co-evolution of production
and test code in open source and industrial developer test processes through repository mining."
*Empirical Software Engineering* 16(3):325-364, 2011. DOI 10.1007/s10664-010-9143-7. Author preprint:
https://azaidman.github.io/publications/azaidmanEMSE2011.pdf (accessed 2026-08-18). Extends the ICST
2008 paper.

Corpus and method: three systems — Checkstyle (open source, 2260 commits by six developers), ArgoUML
(open source, ~3500 commits), and one industrial system at the Software Improvement Group. Three
visualizations over VCS history plus coverage reports, validated against commit log messages, code
inspection, and questionnaires returned by the original developers. Entirely pre-AI (data through
~2009).

The paper does define the toolkit's construct, and endorses it as a *qualitative indicator*:

> "RQ3. Can we detect testing strategies, e.g., test-driven development? From a commit perspective,
> test-driven development is translated as a simultaneous commit of a production source file
> alongside its unit test. We found indications of test-driven development in the SIG case and during
> certain periods of Checkstyle, by means of "test" dots on top of "code" dots in the Change History
> View, signifying concurrent introduction as well as co-evolution."
> — Section 8.2, RQ3

But it gives no rate, no threshold, and frames the alternative pattern as legitimate rather than
deficient:

> "We observe a phased testing approach in ArgoUML, as evidenced by the continuous growth in
> production artifacts and the stepwise growth in testing artifacts." — Section 8.2, RQ1

And the intended use is a conversation-starter for a human assessor, not a scored metric:

> "the Checkstyle.O.4 (synchronous co-evolution) observation would allow the quality engineer to
> congratulate the team members." — Section 7

Unit and population: none. Every finding is a visual pattern over one project's history. **No
percentage of commits is reported anywhere in the paper.**

Incidental figure another question may want: the paper's survey of prior literature puts test code at
"between 10 and 50%" of total source code, against Checkstyle's ~25% and the SIG system's 58-60%,
both at 80-90% branch coverage (Section 8.2, RQ4).

#### 2. Marsavina, Romano, Zaidman — fine-grained co-evolution, and the first direct hit on construct validity

Marsavina, C., Romano, D., Zaidman, A. "Studying Fine-Grained Co-Evolution Patterns of Production and
Test Code." *SCAM 2014*, pp. 195-204. DOI 10.1109/SCAM.2014.28. PDF:
https://azaidman.github.io/publications/marsavinaSCAM2014.pdf (accessed 2026-08-18).

Corpus and method: five open-source Java systems — PMD (7,165 versions), CommonsLang (3,856),
CommonsMath (5,174), JFreeChart (519), Gson (322) — spanning 2002 to 2014. ChangeDistiller extracts
fine-grained AST-level changes per version; the Apriori algorithm (support 50%, confidence 60%) mines
association rules between production-code and test-code change categories; then a manual qualitative
pass over sampled instances.

> "Association rule 1.1 — ADDED CLASS PRODUCTION=YES → ADDED CLASS TEST=YES — support: 412,
> confidence: 0.643 … This first association rule indicates that for CommonsLang, a project that has
> been categorized as extensively tested, the creation of a new production class leads to the
> addition of a corresponding test class in around 64% of the cases." — Section IV

> "1) Occurs in the same commit: The test class is generally added during the same commit (in roughly
> 90% of the cases), thus suggesting that the developers actually test the new production code before
> committing it." — Section V.A

And the finding that damages the metric:

> "They have also demonstrated that in the cases when a change is made in the tests, it does not
> necessarily happen in the same commit as the production change that triggered it; therefore, a
> number of subsequent commits have to be inspected in order to ensure that all the test changes that
> occur due to a specific production change have been identified." — Section V.A

Unit and population: the 64% is *association-rule confidence*, denominator = versions of CommonsLang
in which a production class was added; one project only. The 90% is a share of *manually inspected
instances within CommonsLang where a test class was created* — a conditional on a conditional.
**None of these is the share of all commits touching both**, and none generalizes across the five
projects: PMD's equivalent rule resolves to NO.

#### 3. Beller, Gousios, Panichella, Zaidman — measured co-evolution and measured TDD prevalence

Beller, M., Gousios, G., Panichella, A., Zaidman, A. "When, How, and Why Developers (Do Not) Test in
Their IDEs." *ESEC/FSE 2015*, pp. 179-190. DOI 10.1145/2786805.2786843. Author copy:
https://inventitech.com/assets/publications/2015_beller_gousios_panichella_zaidman_when_how_and_why_developers_do_not_test_in_their_ides.pdf
(accessed 2026-08-18).

Corpus and method: WatchDog IDE plugin instrumenting Eclipse; 416 developers (industry and open
source), 460 projects, 1,337,872 recorded activity intervals over five months, plus 416 survey
responses. TDD is recognized by matching the linearized interval stream against two non-deterministic
finite automata. **Sub-commit-level observation of what developers actually did, not commit history
and not self-report.**

On co-evolution:

> "RQ1.5 Do Developers Co-Evolve Test and Production Code? A weak ρ = 0.35 suggests that tests and
> production code have some tendency to change together, but it is certainly not the case that
> developers modify their tests for every production code change, and vice versa." — Section 4.1

On TDD prevalence:

> "Our results reveal that the sessions of only ten developers match against a strict TDD definition,
> the top NFA in Figure 3 (2% of all developers, or 15% of developers who executed tests …). In
> total, only 4% of sessions with test executions contain strict TDD patterns." — Section 4.4

> "These low results on TDD are complemented by 93 projects where users claimed to use TDD, but in
> reality only 12 of the 93 did." — Section 4.4

Explicitly agreeing with Zaidman and Marsavina:

> "Zaidman et al. [4] and Marsavina et al. [27] studied when tests are introduced and changed. They
> found that test and production code typically do not gracefully co-evolve. Our findings confirm
> this observation on a more fine-grained level." — Section 6

The paper also documents *why* the red-then-green commit pattern the toolkit would penalise is hard
to produce at all:

> "When we tried to apply this strict TDD process, we found that it is very difficult to follow in
> reality, specifically the clear separation between changes to the test, and later changes to the
> production code. Especially when developing a new feature … developers face compilation errors
> during the test creation phase of TDD … To be able to have an executing, but failing test, they
> have to mix in the modification or creation of production code." — Section 3.4

Unit and population: ρ = 0.35 is a Spearman correlation between production-code churn and test-code
churn per *session*, over 416 developers — not a share of commits. The 2% / 4% / 15% figures have
denominators of, respectively, all 416 developers, sessions containing test executions, and
developers who executed tests. **Note the last quote cuts the other way for construct validity: it
means genuine TDD tends to produce mixed test+production edits, not clean separate commits.**

#### 4. Borle, Feghhi, Stroulia, Greiner, Hindle — the only GitHub-scale attempt, and the explicit warning

Borle, N.C., Feghhi, M., Stroulia, E., Greiner, R., Hindle, A. "Analyzing the effects of test driven
development in GitHub." *Empirical Software Engineering* 23:1931-1958, 2018. DOI
10.1007/s10664-017-9576-3. Author copy: http://softwareprocess.ca/pubs/borle2017EMSE-TDD.pdf
(accessed 2026-08-18).

Corpus and method: 256,572 Java repositories from a GitHub snapshot archived September 2015.
TDD-likeness operationalized from commit history as test file committed before the associated source
file, with two relaxations swept across a grid, yielding 40 TDD-like variants. Each variant's
repository set is matched to a K-means-clustered control set on commits, authors, and logical lines of
code.

> "Of the 256,572 Java repositories available in our GitHub data set, we found 41,302 (16.1%)
> repositories with test files … We found only 1,991 repositories whose test files are created
> strictly before the associated source files (no grace period) and where class coverage is over 90%.
> This means that only a very small proportion (0.8%) of Java repositories in GitHub truly practice
> TDD." — Section 4.1

The construct-validity warning, in the authors' own threats section:

> "One construct validity issue that this study faces is that our record of change, the git version
> control histories of Java projects, is not perfect and files can be added, modified, and committed
> at different times, or in different orders than recorded. Ordering of commits is not necessarily the
> ordering of development (Bird et al, 2009; Kalliamvakou et al, 2014). **In a git history, test first
> could look like testing at the same time, or even testing later depending on how the git commits
> were formed.**" — Section 2.3.1 (emphasis added)

And the outcome result:

> "We found that that there was no statistically significant support for any of the research
> questions posed in this work: practicing TDD does not seem to affect commit velocity, number of bug
> fixing commits, numbers of issues, usage of TravisCI nor numbers of pull requests." — Section 5

Unit and population: 16.1% and 0.8% are *shares of repositories*, not of commits, over Java
repositories on GitHub as of September 2015. Neither can seed a per-commit threshold.

#### 5. Levin and Yehudai — the only published per-project distribution of the toolkit's actual quantity

Levin, S., Yehudai, A. "The Co-Evolution of Test Maintenance and Code Maintenance through the lens of
Fine-Grained Semantic Changes." *ICSME 2017*, pp. 35-46. arXiv:1709.09029. DOI
10.1109/ICSME.2017.9.

Corpus and method: 61 popular Java open-source projects from GitHub, selected for >900 Java commits,
>100 stars, >60 forks, created before 2015 and active since 2016. 242,567 commits, 4,259 developers,
16,161,680 fine-grained semantic changes distilled per revision. Commits classified into corrective /
perfective / adaptive maintenance activities by a previously validated classifier (accuracy >76%,
Cohen's κ >0.63).

> "The box-plot in figure 3 shows that proportions of test maintenance is quite different across the
> projects in our study, while in some projects more than half of the commits involved test
> maintenance, in others less than 15%. **In none of the projects, did the test maintenance occur in
> more than 68.5% of the commits.**" — Section IV.C

> "The box-plots in figure 4 show that for half the projects (i.e., the median) in our dataset, test
> maintenance was present in less than 24.7% of the corrective commits, less than 30.4% in adaptive
> commits, and less then 35% in perfective commits." — Section IV.D

Abstract summary: "Our findings also reveal that more often than not, developers perform code fixes
without performing complementary test maintenance in the same commit."

Unit and population: Figure 3 — share of *all commits in a project* that involve test maintenance;
population = 61 popular Java OSS projects. **Note the numerator is "commits involving test
maintenance", which is a superset of the toolkit's "commits touching both test and production": a
test-only commit counts in Levin's numerator and does not set the toolkit's `test_first_indicator`.
So Levin's figures are an upper bound on the toolkit's metric.**

#### 6. Sun, Yan, Liu, Xia, Lei, Lo — the same-commit heuristic tested directly (ABSTRACT-ONLY)

Sun, W., Yan, M., Liu, Z., Xia, X., Lei, Y., Lo, D. "Revisiting the Identification of the
Co-evolution of Production and Test Code." *ACM TOSEM* 32(6), Article 152, 2023. DOI
10.1145/3607183.

**INACCESSIBLE for full text.** dl.acm.org returned HTTP 403 to both curl and WebFetch despite
Semantic Scholar flagging it BRONZE open access; no author-homepage or repository copy found.
Abstract retrieved via the Semantic Scholar Graph API on 2026-08-18. **Method, corpus size and
denominators are unverified.**

Abstract, verbatim:

> "Existing studies mined production-test co-evolution samples based on the following assumption: if
> a test class and its associated production class change together in one commit, or a test class
> changes immediately after the changes of the associated production class within a short time
> interval, this change pair should be a production-test co-evolution sample. However, the validity of
> this assumption has never been investigated. To fill this gap, we present an empirical study …
> revealing the pervasive existence of noise in the production-test co-evolution samples identified
> based on the aforementioned assumption by existing works. We define a taxonomy of such noise,
> including six categories (i.e., adaptive maintenance, perfective maintenance, corrective
> maintenance, indirectly related production code update, indirectly related test code update, and
> other reasons)."

**This paper exists solely to test the assumption the toolkit's metric embodies, and reports that it
produces pervasive noise.** No numeric noise rate is available without the full text.

#### 7. Fucci, Erdogmus, Turhan, Oivo, Juristo — test ordering is not the ingredient that matters

Fucci, D., Erdogmus, H., Turhan, B., Oivo, M., Juristo, N. "A Dissection of the Test-Driven
Development Process: Does It Really Matter to Test-First or to Test-Last?" *IEEE TSE* 43(7):597-614,
2017. arXiv:1611.05994. DOI 10.1109/TSE.2016.2616877.

Corpus and method: 82 data points from 39 professional developers across industry workshop
quasi-experiments. Each participant's process is instrumented at the action level and summarized on
four dimensions — sequencing (share of test-first cycles), granularity (cycle length), uniformity
(variance in cycle length), refactoring effort. Multiple regression with backward AIC selection
against external quality and productivity.

> "Quality and productivity improvements were primarily positively associated with the granularity
> and uniformity. **Sequencing, the order in which test and production code are written, had no
> important influence.** … The claimed benefits of TDD may not be due to its distinctive test-first
> dynamic, but rather due to the fact that TDD-like processes encourage fine-grained, steady steps
> that improve focus and flow." — Abstract

> "Notice that SEQ and its interaction with REF (SEQ:REF) have been dropped from both models. This is
> surprising as it implies the sequence in which writing test and production code are interleaved is
> not a prominent feature. The finding counters the common folklore within the agile software
> development community." — Section 5

> "We thus recommend focusing on breaking down development tasks into as small and as uniform steps as
> possible. We think that this aspect should be emphasised over religiously focusing on leading each
> production cycle with unit tests." — Section 7

Unit and population: SEQ is a ratio in [0,100] measured per *task performed by one developer*, over 82
task-level data points from 39 professionals. Not commits, not projects.

Applicability: does *not* transfer to commit history directly — IDE/action-level instrumentation in a
controlled setting. It matters here because it undercuts the premise that test-first ordering is the
thing worth measuring at all.

#### 8. Miranda, Avelino, Santos Neto — the largest recent co-evolution study, and how it bands

Miranda, C., Avelino, G., Santos Neto, P. "Test Co-Evolution in Software Projects: A Large-Scale
Empirical Study." *Journal of Software: Evolution and Process* 37(6):e70035, 2025. DOI
10.1002/smr.70035.

**INACCESSIBLE for full text.** Wiley returned HTTP 403; the Authorea preprint CDN host does not
resolve from this environment. The Zenodo record 10.5281/zenodo.14705473 is the replication *data
package*, not the paper.

The method is verifiable from the same authors' open-access tool paper on the identical dataset:
Miranda, C., Avelino, G., Santos Neto, P. "Highlight Test Code: Visualizing the Co-Evolution of Test
and Production Code in Software Repositories." *SBES 2025*.
https://sol.sbc.org.br/index.php/sbes/article/download/37075/36860/ (accessed 2026-08-18). Corpus:
526 GitHub repositories across JavaScript, TypeScript, Java, Python, PHP and C#.

> "In this work, co-evolution is defined as the extent to which test and production code evolve in a
> temporally synchronized manner, meaning that changes occur within 30-day time intervals, a
> granularity commonly used in the literature. We operationalize this concept by analyzing variations
> in Lines of Code (LOC) for both test and production code over time. To measure the degree of
> co-evolution, we compute the Pearson Correlation Coefficient for each project." — Section 3.4

> "Based on the distribution of Pearson coefficients across all projects, we classify them into three
> co-evolution levels: High Co-evolution (top quartile), indicating strong synchronization; Moderate
> Co-evolution (middle quartiles) … and Low Co-evolution (bottom quartile)." — Section 3.4

Unit and population: a Pearson r between monthly test-LOC and production-LOC time series, one value
per project, over 526 repositories. Not a commit rate at all. **The three "levels" are quartiles of
the observed distribution, with no absolute healthy line.**

#### 9. Hora and Robbes — the only AI-era rate, verified

Hora, A., Robbes, R. "Are Coding Agents Generating Over-Mocked Tests? An Empirical Study." *MSR
2026*. arXiv:2602.00409v1, 30 Jan 2026.

Corpus and method: 1,254,878 commits made during 2025 across 2,168 TypeScript, JavaScript and Python
GitHub repositories that contain coding-agent files or directories, sampled via seart-ghs (≥10 stars,
≥100 commits). Agent commits (48,563) identified by agent co-author trailers. A "test commit" is a
commit that adds or modifies at least one test file.

> "Overall, we detected 48,563 agent commits (in 1,219 repositories), of which 11,035 are test
> commits, resulting in a test commit ratio of 23%. By comparison, non-coding agents had a test commit
> ratio of only 13% (i.e., 158,326 out of 1,206,315)." — Section 3.1, RQ1

Unit and population: share of *commits* that add or modify at least one test file. Denominators:
48,563 agent-authored commits, and 1,206,315 non-agent commits, all from 2025. **This is not the
toolkit's metric — a test-only commit counts here — so 23% and 13% are upper bounds on a co-change
rate.** The coincidence with the toolkit's stale 23 percent is exactly that: a coincidence.

### What this does and does not support

**Supports (weakly).** Co-change of test and production code within a commit is a *recognized
descriptive pattern* with a named origin (Zaidman et al.), and reading it as an indicator of
test-driven practice is a use the originating authors themselves endorse — qualitatively, for a human
assessor, on a per-project basis, with developer interviews to confirm. That is the whole of the
support.

**Does not support: any quality claim.** No source found relates a co-change *rate* to defect
density, post-release defects, maintainability, or any delivery outcome. Zaidman never measures
defects. Marsavina never measures defects. Borle looked for outcome differences at GitHub scale and
found none on any of five measures. The nearest adjacent evidence, Pecorelli, F., "Test-Related
Factors and Post-release Defects: An Empirical Study," ESEC/FSE 2019, DOI 10.1145/3338906.3342500
(preprint https://fabiano-pecorelli.github.io/publications/conferences/C2.pdf, accessed 2026-08-18),
reports that "while post-release defects are strongly related to process and code metrics of the
production classes, test-related factors have a limited prediction impact" (Abstract) — but its
factor set is test size, test smells, assertion density and coverage, with no co-change variable, and
it is a three-page short paper. **Co-evolution is established as a descriptive PATTERN, not as a
quality signal.**

**Does not support: any boundary.** Nothing published states a healthy proportion. The best available
population reference is Levin and Yehudai's 61-project distribution, and it says the toolkit's live
healthy line of 50 is above what real projects reach: in *none* of 61 popular, well-tested Java OSS
projects did test maintenance appear in more than 68.5% of commits, and the per-project medians
within each maintenance-activity type were below 24.7 / 30.4 / 35 percent — on a numerator definition
*broader* than the toolkit's. The toolkit's own reference measurements agree:
`calibration/observations.json` records `test_coverage_rate` values of 0, 0, 10, 18, 24, 28, 36 and 46
across nodejs/node, ember.js, git/git and postgres. **No observation reaches 50. A band whose healthy
line no reference project attains is not a health line, it is a permanent failing grade.**

**What could legitimately be said.** If a number is wanted, derive it from
`calibration/observations.json` by the same p75 rule as the six calibrated bands, and label it what it
is: a percentile of a small measured sample. Levin and Yehudai can be cited alongside it as an
independent, larger-population sanity check that the plausible range sits somewhere in the
teens-to-thirties, not at fifty.

### Search record

Databases: arXiv (full text), Semantic Scholar Graph API, ACM Digital Library, IEEE Xplore,
SpringerLink, Wiley Online Library, Zenodo API, dblp, TU Delft research portal, and author homepages
(azaidman.github.io, softwareprocess.es/ca, inventitech.com, fabiano-pecorelli.github.io,
yanlei-cs.github.io, zhongxin-liu.github.io, yanmeng.github.io, xin-xia.github.io).

Terms: co-evolution of production and test code; test co-evolution; test maintenance commits;
percentage / proportion of commits that modify both test and production code; TDD commit patterns;
test-first mining study; test-related factors post-release defects; fine-grained co-evolution
patterns; atomic commit test separation.

Read in full or in relevant part: Zaidman EMSE 2011 (48 pp.); Marsavina SCAM 2014 (10 pp.); Lubsen,
Zaidman, Pinzger, "Using Association Rules to Study the Co-evolution of Production & Test Code," MSR
2009 (4 pp.) — reports no numbers, but its conclusion independently flags single-commit granularity as
the method's weak point and proposes "inter-transactional association rule mining … to widen our
analysis from a single commit to a window of commits" as future work; Beller FSE 2015 (12 pp.); Borle
EMSE 2018 (28 pp.); Levin ICSME 2017 (12 pp.); Fucci TSE 2017 (19 pp.); Miranda SBES 2025 tool paper;
Hora and Robbes MSR 2026; Pecorelli ESEC/FSE 2019 (3 pp.).

Failed to reach: Sun et al. TOSEM 2023 (dl.acm.org 403, no mirror; **abstract-only**). Miranda et al.
JSEP 2025 (Wiley 403; Authorea CDN DNS failure; Zenodo record is data only; method recovered from the
authors' open SBES tool paper, results not recovered). Pecorelli, Palomba, De Lucia, *EMSE* 2020
extended version (Springer 303 to an auth endpoint) — the short ESEC/FSE version was used instead.
Pinto, Sinha, Orso, "Understanding myths and realities of test-suite evolution," FSE 2012 — no free
copy located; **not used**, no claim rests on it.

### Contradictions

These contradict the toolkit's premises directly and should be read as the primary result of RQ5.

**1. The metric's own name is wrong and the literature says the underlying heuristic is noisy.**
`lib/git.js` line 137 sets `test_first_indicator: testFiles > 0 && prodFiles > 0` — pure same-commit
co-occurrence — and this is surfaced as "test-first discipline" in `pr-metrics.yml` (lines 220, 314,
373) and as "test-first %" in `CLAUDE.md`'s archetype table. Sun et al. (TOSEM 2023) exist to test
exactly that assumption and report "the pervasive existence of noise" from it. Borle et al. state it
plainly: "In a git history, test first could look like testing at the same time, or even testing later
depending on how the git commits were formed." Marsavina et al. show the triggered test change
frequently lands in a *later* commit. **The atomic-commit objection in the brief is not merely
plausible; it is the published position of the field, including of the researchers who invented the
construct.**

**2. The healthy line of 50 exceeds what any measured population reaches.** Levin and Yehudai: no
project among 61 popular Java OSS projects exceeded 68.5% on a *broader* numerator, with medians under
35%. The toolkit's own twelve calibration observations top out at 46. `lib/thresholds.js` line 31
carries no derivation comment, and `pr-metrics.yml` line 314 carries an independent second copy of
the same 50. (This agent originally claimed line 31 was the *only* uncommented entry; lines 32, 39
and 49 are also uncommented, so the claim is narrowed to line 31 itself.) Filed as `code-quality-metrics-36d`, with a cross-note
appended to `code-quality-metrics-0er`.

**3. Test ordering may not be the ingredient worth measuring.** Fucci et al. built regression models
on 82 task-level observations from 39 professionals and *sequencing dropped out of both the quality
and the productivity model*, while granularity and uniformity survived. Their recommendation points at
the toolkit's *large-commit* and *sprawl* metrics as the better-founded proxies for the thing this
metric is reaching for, and away from co-change.

**4. Higher co-change is not obviously the healthy direction.** Beller et al. found ρ = 0.35 between
test and production churn and interpreted the weakness as *expected*: "tests often serve as
documentation and specification of how production code should work, and are therefore less prone to
change" (Section 5). A stable test suite that does not need editing every time production code changes
is a defensible design outcome, not a discipline failure. **A monotonic "higher is healthier" band
encodes an assumption the literature does not make.**

**5. The largest modern study of co-evolution deliberately does not use per-commit co-occurrence.**
Miranda et al. (526 repositories, six languages) define co-evolution over 30-day windows and score it
as a Pearson correlation of LOC time series, then band it by quartile of the observed distribution.
Both choices are a rejection of the toolkit's approach: they widen the granularity past a single
commit, and they decline to state an absolute healthy value.

**6. AI-era baseline, for whoever sets the band.** Hora and Robbes measured 1.25M commits from 2025:
23% of coding-agent commits and 13% of non-agent commits add or modify a test file. That is a broader
numerator than the toolkit's, so a co-change rate in the same population must be *below* those
figures. It is also the one finding here that runs *for* the toolkit's premise — agent-authored
commits touch tests more often, not less — while saying nothing about whether those tests are good,
which is the paper's actual subject (over-mocking).
## RQ6: Commit message quality

**Verdict**: nothing found for a boundary. Published *distributions* are available and are strong
enough to position the metric; published *outcome links* are real but faint and point away from the
toolkit's current scoring rule.

No source anywhere supports a 60 percent line, a 40 percent line, a 10-word rule, or any healthy
percentage of adequate commit messages. Conventional Commits is a community specification with no
cited research and no outcome validation. All three of the toolkit's numbers remain unsourced.

### Sources

#### 1. Tian, Zhang, Stol, Jiang, Liu — "What Makes a Good Commit Message?" (ICSE 2022)

Yingchen Tian, Yuxia Zhang, Klaas-Jan Stol, Lin Jiang, Hui Liu. 2022. ICSE '22, pp. 2389-2401.
DOI 10.1145/3510003.3510205. Free full text: arXiv:2202.02974 (accessed 2026-08-18). Read in full.

Corpus and method: all commits from five popular Java GitHub projects (Spring-boot, Apache Dubbo,
Okhttp, JUnit4, Retrofit) via the GitHub REST API up to **February 2021**; 41,886 commits, reduced
to 29,348 after removing bot-generated messages. Clustered random sampling drew 1,649 messages (95
percent confidence, 5 percent margin of error) authored by 339 developers; 52 non-atomic commits
removed, leaving **1,597 manually labelled messages**. Two authors labelled independently (Cohen's
kappa 0.91), a third arbitrated; a 30-developer survey validated the labels at ~85 percent
agreement. Each message classed into one of four types by whether it contains a change summary
(What) and a justification (Why).

> "We manually classified 1,597 commits (sampled from five OSS projects) into four types based on
> whether their messages contain Why and What information (see Sec. 3.2). ... The ratio of this
> message type in the five projects varies from ca. 42% to ca. 82%, with an average ratio of ca.
> 56%, suggesting that around 44% of commit messages have quality issues." — Section 4.1

> "Summary for RQ1: The quality of commit messages varies in the five studied OSS projects, with on
> average ca. 44% of messages in need of improvement." — Section 4.1 summary box

Per-project breakdown, read from data labels on Figure 3 (percentages of each project's sampled
commits, four types summing to 100):

| Project | Neither Why nor What | No What | No Why | **Why and What** |
|---|---|---|---|---|
| Apache Dubbo | 4.3 | 19.5 | 20.1 | **56.1** |
| JUnit4 | 7.5 | 12.2 | 38.1 | **42.2** |
| Okhttp | 0.9 | 11.7 | 30.2 | **57.2** |
| Retrofit | 2.5 | 6.7 | 46.6 | **44.2** |
| Spring-boot | 4.8 | 8.9 | 4.0 | **82.3** |

These reconcile with the paper's stated averages (No Why 28 percent, No What 12 percent,
Why-and-What 56 percent), a consistency check on the chart reading.

Unit and population: percentage of *manually labelled sampled commit messages*, per project.
Denominator is the 1,597-message sample, not all commits and not projects. The projects are all
Java, all popular, all deliberately chosen as likely to contain good messages.

Applicability: transfers directly to git commit history. **Predates AI assistance** (data cut at
February 2021).

The authors set **no boundary**. 56 percent is a measured population rate in five hand-picked
projects, not a target. They explicitly reject the syntactic approach the toolkit uses:

> "Chahal and Saini [14] proposed a syntactic model to calculate the quality of commit messages.
> However, this model can only assess the quality at the syntactic level through evaluation of
> 'rules,' such as 'the first character of the subject line should be capitalized'; this model does
> not consider the semantics of commit message contents." — Section 1

> "The dataset we analyzed was collected from five popular projects on GitHub implemented in Java,
> thus posing a threat to external validity. Our findings may not be generalizable to other
> projects, whether they are open or closed-source, or projects that use other languages."
> — Section 6

#### 2. Dyer, Nguyen, Rajan, Nguyen — Boa (ICSE 2013): the commit-message length distribution

Robert Dyer, Hoan Anh Nguyen, Hridesh Rajan, Tien N. Nguyen. 2013. ICSE '13, pp. 422-431. DOI
10.1109/ICSE.2013.6606588. Publisher copy paywalled; author copy from Robert Dyer's homepage at
cse.unl.edu/~rdyer/papers/icse13.pdf (accessed 2026-08-18).

Corpus and method: metadata for all SourceForge projects (620k+), with Subversion repository
metadata for the Java projects using SVN (23k+). Task B.11 computed the distribution of commit log
length in words over that subset. Snapshot circa 2012.

> "This task examines how many words appear in log messages. First, around 14% of all log messages
> were completely empty. We do not investigate the reason for this phenomenom but simply point out
> how prevalent it is. Second, over two thirds of the messages contained 1–15 words, which is less
> than the average length of a sentence in English. A normal length sentence in English is 15–20
> words (according to various results in Google) and thus we see that very few logs (10%) contained
> descriptive messages." — Section V.A, Task B.11 / Figure 13, p. 428

Unit and population: percentage of *SVN commit log messages* in the SourceForge Java-with-SVN subset
(23k+ projects). The paper does not state the total message count for B.11.

Two provenance corrections, because both mangled forms circulate:

- The widely repeated "**75 percent had fewer than 16 words**" is not what the paper says. The
  primary says "over two thirds ... contained 1–15 words". Anyone citing 75 percent is citing a
  paraphrase.
- The "10 percent descriptive" figure is not a measurement of descriptiveness. It is the residual
  after subtracting empties and short messages, and the 15-20-word sentence benchmark it rests on is
  sourced, verbatim, to "various results in Google". **This is the closest thing in the literature to
  the toolkit's 10-word rule, and it is a back-of-envelope remark in a tools paper.**

Applicability: SVN and SourceForge rather than git and GitHub. **Firmly predates AI assistance.**

#### 3. Schall et al. — CommitBench (2024): the largest published message-length distribution

Maximilian Schall, Tamara Czinczoll, Gerard de Melo. *CommitBench: A Benchmark for Commit Message
Generation.* arXiv:2403.05188 (accessed 2026-08-18). Published in SANER 2025.

Corpus and method: 23,284,371 commits from non-fork public GitHub repositories (CodeSearchNet
repository selection), six programming languages, filtered to 1,664,590 examples. Table III reports
message and diff length statistics **before** the length filter, using the T5 tokenizer.

| Statistic | Message length (T5 tokens) |
|---|---|
| Mean | 27.52 |
| Median / 50th percentile | **11** |
| 25th percentile | 6 |
| 75th percentile | 20 |
| Std. dev. | 243.10 |
| Max | 619,941 |

Table II, commits removed by each filter (a commit can be counted by several):

| Filter | Commits |
|---|---|
| No filter (total) | 23,284,371 |
| **Commit messages < 8 tokens** | **8,070,122** |
| Commit messages > 128 tokens | 783,232 |
| Bot commits | 807,335 |
| Trivial messages | 270,330 |

> "Additionally, commit messages shorter than eight tokens were removed, since such messages are
> usually of poor quality, lacking sufficient information on what was changed and why."
> — Section on Sequence Length

Unit and population: T5 subword tokens per commit message, over 23,284,371 unfiltered public GitHub
commits across six languages. **T5 tokens are subword units and run higher than word count for the
same text, so a median of 11 tokens corresponds to well under 11 words.**

The single most useful number for the toolkit: 8,070,122 of 23,284,371 commits, **34.7 percent, fall
below 8 T5 tokens**, and the median commit is 11 T5 tokens. **A 10-word bar therefore sits above the
median commit message in the largest published corpus.** The 8-token floor is itself an engineering
choice for a training dataset, not a validated quality boundary, and the authors present it as such.

Applicability: git commit history, GitHub, directly on point. Collected pre-2024, so substantially
pre-AI, though the window is not stated precisely enough to rule out early Copilot-era commits.

#### 4. Barnett, Gathuru, Soldano, McIntosh (MSR 2016): word count does predict defects, weakly

Jacob G. Barnett, Charles K. Gathuru, Luke S. Soldano, Shane McIntosh. 2016. MSR '16, pp. 496-499.
DOI 10.1145/2901739.2903496. Author copy: rebels.cs.uwaterloo.ca/papers/msr2016_barnett.pdf
(accessed 2026-08-18).

Corpus and method: from the MSR 2016 challenge dataset (7,830,023 repositories, Boa GitHub snapshot
September 2015), filtered to Java projects (380,011), then to mature collaborative projects, then to
a representative sample of **342 repositories**. Baseline JIT metrics from CommitGuru; two new
metrics added: *commit message volume* (word count after NLTK stop-word removal) and *commit message
content* (a SpamBayes naive-Bayes score). Logistic regression per system, optimism-adjusted by 1,000
bootstraps, drop-one chi-squared tests with Bonferroni correction (alpha = 1.46e-4).

> "The commit message volume metric contributes a significant amount of explanatory power to the JIT
> models of 43% of the studied systems. The drop one χ2 tests indicate that our volume metric
> achieves a p-value below the Bonferroni-corrected α value (i.e., 1.46 × 10−4) in 147 of the
> studied systems." — Section 3, RQ1

> "The volume metric contributes up to 25% of explanatory power in our JIT models. ... The values
> range between 0%-35%, with a median of 4%." — Section 3, RQ1

> "The spam probability score contributes a significant amount of explanatory power to the JIT models
> of 80% of the studied systems. ... The Bayesian content score model contributes up to 72% of the
> explanatory power of our models." — Section 3, RQ2

Unit and population: percentage of *studied systems* (denominator 342 repositories) in which the
metric was statistically significant; and percentage of a *single model's explanatory power*. Neither
is a percentage of commits.

The one place the paper approaches a number is not a threshold:

> "Through analysis of the top five repositories where the volume metric contributes the largest
> amount of explanatory power, we find that commit volume has a large interquartile range, with the
> highest being 10." — Section 3, RQ1

That "10" is an interquartile *range width* in one repository, not a word count boundary. Its match
to the toolkit's constant is coincidence.

Applicability: git commit history on GitHub, directly on point. Predates AI assistance (2015 data).

#### 5. Li and Ahmed (ICSE 2023): the semantic outcome link, and the direct refutation of word count

Jiawei Li, Iftekhar Ahmed. 2023. *Commit Message Matters: Investigating Impact and Evolution of
Commit Message Quality.* ICSE '23, pp. 806-817. DOI 10.1109/ICSE48619.2023.00076. Author copy:
stairs.ics.uci.edu/papers/2023/Commit_Messages.pdf (accessed 2026-08-18).

Corpus and method: 32 Apache Java projects (average 16,259 commits, median duration 415 weeks).
Defect-introducing commits identified with SZZUnleashed; refactoring commits removed with
RefactoringMiner. SZZ completed on 17 of 32 projects, yielding **238k commits analysed, 185,026
after refactoring removal**; the evolution analysis used 246,735 bot-filtered commits from all 32.
An improved What/Why classifier (BERT + Bi-LSTM, +12 percent F1 over Tian et al.) labelled each
message. A "Window Quality Score" over the preceding N commits was regressed on whether the current
commit introduced a defect, via Poisson GLM, with **Commit Message Volume** (NLTK word count after
stop-word removal) as the competing predictor. Triangulated with 13 interviews and a survey of 93
developers.

> "Observation 3: Preceding commit message quality in terms of What and Why has a statistically
> significant impact on the defect proneness of future commits." — Section IV.B

> "Observation 4: What and Why information in a commit message has a significantly higher
> association with defect proneness compared to Commit Message Volume." — Section IV.B

> "The coefficient values of our Window Quality Scores for both What and Why are larger than that of
> Commit Message Volume. We also found significant difference between the coefficients of Commit
> Message Volume and What (Welch's t-test, p-val<6.660e-05, Cohen's D(3.55, large)), and between
> What and Why (Welch's t-test, p-val<0.005, Cohen's D(1.732, large)) across all window sizes."
> — Section IV.B, Table V

Table V (commit-level GLM coefficients): Volume's coefficient is ~0.0037 at every window size, while
What ranges 0.117 to 0.483 and Why 0.088 to 0.833. **Volume is roughly two orders of magnitude
weaker.**

The effect on defects is statistically solid but small in absolute terms:

> "Although the effect size is small, there is statistically significant difference in the Window
> Quality Score between defect-introducing commits and non defect-introducing commits."
> — Section IV.B, Table IV

Table IV Cohen's D values run **0.008 to 0.140**. Model fit: "The McFadden Adjusted R2 [31] of these
models were smaller than 0.002." (Section IV.B)

Also relevant to the toolkit's premise that drift is worth trending:

> "The overall quality of commit messages decreases significantly over time in terms of What
> (Spearman correlation coefficient=-0.79953, p-value=1.78787e-93), Why (Spearman correlation
> coefficient=-0.42674, p-value=8.51816e-20), and Good (Spearman correlation coefficient=-0.80203,
> p-value=1.78787e-94)." — Section IV.C

Unit and population: Cohen's D and GLM coefficients over 185,026 commits from 17 Apache Java
projects; Spearman correlation between week number and weekly ratio of good-labelled commits over
246,735 commits from 32 projects, capped at 415 weeks. The Spearman result is a *trend*, not a
level, and gives no target percentage.

Applicability: git commit history, directly on point. Predates AI assistance.

#### 6. Santos and Hindle (MSR 2016): message quality barely predicts build failure

Eddie Antonio Santos, Abram Hindle. 2016. *Judging a Commit by Its Cover: Correlating Commit Message
Entropy with Build Status on Travis-CI.* MSR '16, pp. 504-507. Author copy:
softwareprocess.es/pubs/santos2016MSR-judging-a-commit-by-its-cover.pdf (accessed 2026-08-18).

Corpus and method: 120,822 commits from 2,679 GitHub projects with Travis-CI build status (108,989
commits / 2,529 projects after English-language filtering). Trigram language models over commit
messages with semantic token substitution; cross-entropy as a measure of "unusualness"; build status
as a code-quality proxy.

> "Calculating Pearson's product-moment linear correlation coefficient yields a 99% confidence
> interval of (0.007, 0.468). Since zero is not in the interval (zero would indicate no correlation)
> we conclude that build failure and 'unusualness' may be positively correlated—but only
> marginally." — Section 3

> "Though the results are statistically significant, we conclude that they are not practically
> helpful for the average developer. For example, which of the following commits failed its status
> check? 'added init.d test to travis config' (cross-entropy = 5.08), or 'I'm sloppy' (cross-entropy
> = 12.9)? The latter has a far more unusual commit message than the former, yet it passed its
> status check; the 'usual' commit failed. Thus, as a heuristic for estimating the probability of
> build failure, commit messages are not very useful." — Section 4

Unit and population: Pearson correlation over 108,989 commits from 2,529 open-source GitHub projects
with Travis-CI builds. Correlation, not a rate; no threshold.

#### 7. Rabbi, Turzo, Champa, Zibran (2026): AI-generated commit messages measured

Md Fazle Rabbi, Asif K. Turzo, Arifa I. Champa, Minhaz F. Zibran. 2026. *Insights into
Security-Related AI-Generated Pull Requests.* arXiv:2604.19965v1, submitted 21 April 2026 (accessed
2026-08-18). **Preprint with stated methodology; not peer-reviewed as far as could be determined.**

Corpus and method: over 33,000 AI-generated pull requests screened, 675 identified as
security-related; **2,823 commit messages** from those PRs collected via the GitHub API. Tian et
al.'s C-Good classifier (BERT + Bi-LSTM) retrained on its original annotated dataset and applied;
validated against a manual sample of 339 messages (95 percent confidence, ±5 percent), achieving
93.2 percent accuracy, precision 93.8, recall 84.3, F1 88.8, kappa 0.84. Agents covered: GitHub
Copilot, Devin, Claude Code, Cursor, OpenAI Codex.

> "Out of all 2,823 commit messages, 1,988 (70.4%) are classified as high-quality and 835 (29.6%) as
> low-quality. This shows that AI tools often generate messages with both rationale and
> description." — Section 6.2

> "Devin shows a higher share of high quality messages (79.5%), while Copilot has a lower proportion
> (71.5%). Claude Code and Cursor are near the average, with about two thirds of their messages
> rated as high quality. In contrast, OpenAI Codex produces the lowest share of high quality
> messages, only 31.3%, while most (68.7%) are low quality." — Section 6.2

> "When messages contain both Why and What, 45.6% of the corresponding PRs are accepted. When
> messages are of lower quality, the acceptance rate increases slightly to 58.0%. This shows that
> message quality alone may not determine merge decisions" — Section 6.2

> "The commit message quality of AI PRs has a limited effect on acceptance or latency, in contrast
> to human PRs reported in previous studies." — Abstract

Unit and population: percentage of *commit messages* (denominator 2,823) from 675 security-related
AI-generated PRs. **A narrow slice: security-related PRs only, AI-agent-authored only. Not a general
population rate for AI-assisted commits.**

#### 8. Chahal and Saini (IFIP OSS 2018): the only structural criterion with a number

Kuljit Kaur Chahal, Munish Saini. 2018. *Developer Dynamics and Syntactic Quality of Commit Messages
in OSS Projects.* OSS 2018, Athens, pp. 61-76. DOI 10.1007/978-3-319-92375-8_6. Open copy:
inria.hal.science/hal-01875491/document (accessed 2026-08-18).

Corpus and method: 10 rules for a good commit derived by two authors from a literature and web scan,
operationalised as 11 syntactic measures each scored 1-5, normalised to [0,1] and summed. Applied to
**202,561 commit messages from seven OSS projects**. Validated by asking 20 developers (16 graduate,
4 undergraduate, 5-7 years' industry experience) to upvote or downvote each rule.

Table 2, the relevant row:

| Measure | Score 1 | 2 | 3 | 4 | 5 | Unit |
|---|---|---|---|---|---|---|
| Length of Title | =0 or >72 | 1-10 | 11-30 | 31-50 | **51-72** | characters |

> "1. Title (subject line) of commit message should be short (between 50-72 characters)."
> — Table 1

Table 3 records 15 upvotes, 4 downvotes and 1 neutral for that rule from the 20 respondents.

Unit and population: characters in the subject line; the developer votes have a denominator of 20.
The output is a continuous normalised score per message, not a pass/fail rate, so the paper yields
**no percentage of adequate messages at all**.

This is the closest thing in the literature to the toolkit's structural criterion, and it is a
**character** count on the subject line, not a word count on the whole message. Its provenance is the
git community's folklore "50/72 rule"; its validation is 20 upvotes; it is tied to no outcome.

#### 9. Islam and Zacchiroli (EASE 2026): a systematic mapping study that finds no threshold

Syful Islam, Stefano Zacchiroli. 2026. *On the Use of Commit Messages for Corrective Software
Maintenance: A Systematic Mapping Study.* EASE 2026. arXiv:2604.16404 (accessed 2026-08-18).

Corpus and method: 880 papers from automatic query search, reduced through duplicate removal,
title/abstract screening (484 → 85), full-content screening (59 accepted) and backward snowballing
(+38), giving **97 primary studies**.

Its recommendations section is where a threshold would appear if one existed. It is entirely
qualitative:

> "Developers are recommended to follow strict rules and lexicons when writing commit messages,
> ensuring semantic alignment with code changes ... Besides, keeping commit messages concise with
> separate commit-info, commit-subject, and commit-body can improve automated understanding and
> accuracy of patch identification" — Section 4

> "Maintainers should be conscious that the quality of commit messages will directly impact later
> corrective maintenance tasks." — Section 4

No word count. No percentage. **Across 97 primary studies, the field's own synthesis offers no
numeric boundary. That is the strongest available evidence that the negative result is genuine
rather than a failure of search.**

#### 10. Conventional Commits v1.0.0: a specification, not a finding

https://www.conventionalcommits.org/en/v1.0.0/ (accessed 2026-08-18).

The "Why Use Conventional Commits" section lists five claimed benefits: automatically generating
CHANGELOGs; automatically determining a semantic version bump; communicating the nature of changes
to teammates, the public and other stakeholders; triggering build and publish processes; and making
it easier for people to contribute. **It cites no study, no data and no reference for any of them.**
Its stated justification is machine-readability and automation, not code quality or maintainability.

A targeted search for empirical validation against an outcome found none. What exists is adoption
and classification work:

- Zeng et al., *A First Look at Conventional Commits Classification*, ICSE 2025, DOI
  10.1109/ICSE55347.2025.00011 — qualitatively analyses 194 GitHub issues and 100 Stack Overflow
  questions to categorise challenges applying the spec. Studies *use* of the spec, not its effect.
- Kong, Liu, Bao, Lo, *Toward Better Comprehension of Breaking Changes in the NPM Ecosystem*, TOSEM
  34(4), DOI 10.1145/3702991 — of 381 randomly selected JavaScript GitHub projects, 360 contained at
  least some Conventional-Commits-formatted commits and 198 had 80 percent or more; in non-adopting
  projects roughly 10 percent of commits matched the format anyway. Unit and population: share of
  projects, and share of commits within a project, over 381 JavaScript repositories. An adoption base
  rate, not a quality outcome. **The ~10 percent incidental-match figure is a useful caution: the
  format branch of the toolkit's rule fires on some commits never written to it.**

### What this does and does not support

Does not support any of the toolkit's three numbers.

- **60 percent healthy**: no source states a healthy share of adequate commit messages. Tian et al.'s
  56 percent is uncomfortably close, and this is coincidence, not corroboration: 56 percent is what
  five hand-picked popular Java projects *were*, measured once in 2021, over a 1,597-commit
  hand-labelled sample, under a semantic What/Why definition the toolkit does not implement. Adopting
  60 as "healthy" because 56 is the observed average would mean declaring the median well-regarded
  OSS project unhealthy.
- **40 percent critical**: nothing. No second boundary appears in any source.
- **10 words**: nothing. The nearest published numbers are Chahal and Saini's 50-72 *characters* on
  the subject line (folklore, 20-developer survey, no outcome) and CommitBench's 8 *T5 tokens* (a
  training-data engineering choice, explicitly framed as such). Dyer et al.'s 15-20-word English
  sentence benchmark is sourced to "various results in Google" and cannot carry a threshold.
- **Conventional Commits as an alternative pass condition**: the specification cites no research and
  no study validates it against an outcome. It should not be presented as research-backed anywhere.

What the evidence does support:

1. **Positioning against a published distribution instead of a boundary.** Three usable distributions
   with clear units: semantic quality 56 percent good on average, 42-82 percent range, five popular
   Java OSS projects, 1,597 labelled commits, pre-2021 (Tian); message length median 11 T5 tokens,
   p25 6, p75 20, 34.7 percent below 8 tokens, over 23.3M GitHub commits (CommitBench); message
   length 14 percent empty, over two thirds 1-15 words, SourceForge Java/SVN, 23k+ projects (Dyer). A
   report that says "this repository's rate sits at the 42-82 percent range observed in five popular
   Java projects" is defensible. "Below 60 is unhealthy" is not.

2. **Reporting the metric as a wide band, not a sharp line.** The one study that regresses semantic
   message quality on defects finds Cohen's D between 0.008 and 0.140 and McFadden adjusted R² below
   0.002. Barnett et al. find word count contributes a median of 4 percent of a JIT model's
   explanatory power. Santos and Hindle find message unusualness correlates with build failure but
   conclude it is "not very useful" as a heuristic. Commit message quality is a real signal and a
   faint one. **A `critical` verdict on it is not proportionate to any measured effect size.**

3. **Reconsidering the scoring rule, not just the band.** Filed as `code-quality-metrics-6ti`.

On AI assistance: every measurement of *human* commit message quality above predates widespread AI
assistance (2013, 2015, 2016, pre-2021, pre-2024). Exactly one source measures AI-generated commit
messages (Rabbi et al. 2026), a preprint over a narrow slice. The honest position is that the toolkit
is trending a metric whose pre-AI baselines are known and whose AI-era baseline is essentially
unestablished.

### Search record

Databases: arXiv, Semantic Scholar Graph API, ACM DL (metadata; full text paywalled), IEEE Xplore
(metadata; paywalled), Springer Link (metadata), Inria HAL, ScienceDirect (metadata), and
author/lab homepages at cse.unl.edu (Dyer), rebels.cs.uwaterloo.ca (McIntosh), stairs.ics.uci.edu
(Ahmed), softwareprocess.es (Hindle), conventionalcommits.org.

Terms: "what makes a good commit message"; Tian Zhang ICSE 2022; Dyer Nguyen Rajan Boa commit log
length; Santos Hindle judging a commit by its cover; Barnett Gathuru Soldano McIntosh commit message
detail defect proneness; Chahal Saini developer dynamics syntactic quality commit messages; Maalej
Happel commit comments taxonomy MSR 2010; Jiang McMillan short summaries of commits corpus
statistics; CommitBench commit message length statistics; commit message quality threshold percentage
good messages healthy target; conventional commits empirical validation defect review time
maintainability; AI-generated commit messages Copilot LLM quality measured repositories; commit
message quality onboarding program comprehension bug localization.

Read in full or substantial part: Tian et al. ICSE 2022 (complete); Li and Ahmed ICSE 2023
(complete); Barnett et al. MSR 2016 (complete); Santos and Hindle MSR 2016 (complete); Dyer et al.
ICSE 2013 (Section V, Task B.11); Chahal and Saini OSS 2018 (Sections 1-4, Tables 1-3); CommitBench
(Tables II and III and surrounding filter discussion); Rabbi et al. 2026 (Section 6, RQ3, complete);
Islam and Zacchiroli EASE 2026 (methodology and recommendations); Jiang and McMillan ICPC 2017
(exploratory data analysis); Conventional Commits v1.0.0 (complete).

Failed to reach:

- Dyer et al. ICSE 2013 via publisher: DOI paywalled; Semantic Scholar returns `openAccessPdf:
  {"url": ""}` with status CLOSED. Three mirrors returned HTML error pages. **Resolved** via the
  author copy at cse.unl.edu, so not an INACCESSIBLE result.
- Chahal and Saini via Springer paywalled. **Resolved** via Inria HAL open copy.
- Maalej and Happel, *Can Development Work Describe Itself?* (MSR 2010) — **INACCESSIBLE**. Not on
  arXiv; no open copy on either author's institutional page; ACM DL paywalled. Search results
  reported a "600k commit messages, 10 percent empty or meaningless" figure but the primary could not
  be reached to verify the number, its denominator, or its corpus. **Not reported as a finding.**
- Buse and Weimer (DeltaDoc, ASE 2010) — **NOT FOUND** in a form relevant to this question. A
  summarisation *technique* paper; no corpus distribution of message length or quality found.
- Liu et al. commit-message-generation papers (ATOM, NNGen and successors) — corpus statistics are
  downstream of the Jiang and McMillan dataset and add nothing over CommitBench.

Verified but not reported as findings:

- Jiang and McMillan, ICPC 2017 (author copy at sdf.org/~cmc/papers/jiang_icpc_era17.pdf): 2 million
  commits from the top 1,000 starred Java GitHub projects, ~400k rollback/merge commits removed,
  leaving 1.6 million. Verbatim: "82% of the commit messages have only one sentence. Only 0.2% of the
  commit messages have more than ten sentences." A real published distribution with a clear unit
  (share of 1.6M messages), but it measures *sentences*, not words, so it cannot seed a word
  threshold. It does independently corroborate that the typical commit message is short.
- A widely surfaced claim that low-quality or inconsistent commit messages are "about 1.5 times more
  likely to precede bug-introducing changes" appeared in search summaries. **Could not be traced to
  any primary source, and it contradicts the numbers in the paper it appears to be attached to** (Li
  and Ahmed report Cohen's D 0.008-0.140, not a 1.5x risk ratio). **Treat any 1.5x figure on this
  metric as unsourced until someone finds its origin.**

Local PDF library: none of the listed local PDFs bear on RQ6.

### Contradictions

Three findings run against the toolkit's current design. All three are more consequential than the
missing threshold.

**1. The toolkit scores the weaker of the two signals the literature compares, and the comparison was
made head to head.** Li and Ahmed built exactly the regression that decides between the toolkit's
rule and the alternative: semantic What/Why quality versus *Commit Message Volume*, word count after
stop-word removal, over 185,026 Apache commits. What and Why won at every window size, with large
effect sizes on the difference, and the GLM coefficients differ by roughly two orders of magnitude
(Volume ~0.0037 constant; What 0.117-0.483; Why 0.088-0.833). Barnett et al. found the same ordering
by a different route: word count significant in 43 percent of 342 systems with a median 4 percent of
explanatory power, while their content metric was significant in 80 percent with up to 72 percent.
Tian et al. explicitly criticise syntactic scoring as missing the semantics. **The toolkit's rule is
word count plus a format regex — the syntactic side of a comparison the field has already run and
settled.** Filed as `code-quality-metrics-6ti`.

**2. The 10-word bar sits above the population median, so `message_quality_pct` is closer to a
Conventional-Commits adoption rate than a quality rate.** In the largest published corpus (23.3M
GitHub commits), the median message is 11 T5 subword tokens and the 25th percentile is 6; T5 tokens
exceed word count for the same text, so a 10-word bar excludes most commits ever written. Dyer et al.
agree from the other end: over two thirds of SourceForge Java/SVN messages contained 1-15 words. On a
repository that has not adopted Conventional Commits, the word branch will fail for the majority of
commits and the score will collapse; on one that has, the format branch passes essentially everything
regardless of content. **That is a bimodal instrument, and the number it produces answers "does this
project use Conventional Commits?" far more than "are these messages informative?"** Kong et al.
sharpen this: even in projects that have not adopted the spec, about 10 percent of commits match the
format incidentally, so the format branch has a nonzero false-pass floor.

**3. In the one AI-era measurement available, AI-generated commit messages score *better* than the
human baseline, and their quality predicts nothing about review outcomes.** Rabbi et al. found 70.4
percent of 2,823 AI-agent commit messages contained both What and Why, against Tian et al.'s ~56
percent human average under the same classifier lineage. The per-agent spread is wide (OpenAI Codex
31.3 percent, Copilot 71.5, Devin 79.5), so this is not a uniform effect, and the corpus is narrow
(security-related PRs only, preprint, not peer-reviewed). But the direction matters for a toolkit
built on the premise that AI adoption degrades commit-level signals: on this one metric, in this one
study, it does not. Further, message quality had "a limited effect on acceptance or latency" for AI
PRs, with low-quality-message PRs actually accepted at a *higher* rate (58.0 versus 45.6 percent).
**If AI agents reliably emit well-formed, Conventional-Commits-shaped, What-and-Why-bearing messages
regardless of the quality of the underlying change, then `message_quality_pct` may become an inverse
drift indicator: it will rise as AI assistance increases, while telling you nothing about whether the
change was any good.**
## RQ7: Distribution boundaries (percentile-based commit-size bands)

**Verdict**: **boundary available** for the distributions half of the question, **direction only**
for the percentile-as-a-method half.

Published commit-size distributions exist, are large, and include one directly comparable 90th
percentile. What does *not* exist is any study that proposes flagging a project by its p90, or that
publishes a healthy p90. The published percentiles are descriptive facts about open source, not
recommendations.

The headline: **Kolassa, Riehle and Salim report a 90th percentile of 261 LoC per commit over 8.7
million commits. The toolkit's `P90_LINES_CHANGED` healthy bound is 260, derived independently from
twelve local windows.** That is the external, non-circular anchor this project has been looking for,
with unit caveats spelled out below.

### Sources

#### 1. Kolassa, Riehle, Salim — the only published p90 of commit size

C. Kolassa, D. Riehle, M. A. Salim, "A Model of the Commit Size Distribution of Open Source."
*SOFSEM 2013*, LNCS 7741, pp. 52-66, Springer. Preprint: arXiv:1408.4974 (accessed 2026-08-18,
full text read).

Corpus and method: Ohloh.net database snapshot dated March 2008: 11,143 open source projects,
8,705,118 commits, of which 5,117 projects met an activity test; the authors estimate this is
"about 30% of all open source projects considered active in March 2008" (§3.1). Empirical CDF
fitted by least squares against seven candidate distributions.

> "Key Parameter | Value — Mean 465.72 | Median 16 | 90th percentile 261 | 95th percentile 604.5"
> — Table 1, "Statistical key characteristics of the open source commit size distribution", p. 5

> "After reviewing the different fits and the residual plots as well as the P-P plots ("P" stands
> for percentile) we found that the Generalized Pareto Distribution (GPD) provides the best fit."
> — §3.2, p. 5

> "ξ (xi) / Shape 1.4617 | θ (theta) / Location 0.5 | σ (sigma) / Scale 13.854"
> — Table 2, p. 7. Goodness of fit (Table 3): R² on CDF 0.9949, Pearson's R 0.99755, computed up
> to the 95th percentile.

Unit and population: **LoC per commit**, where (§2) "a line of code (LoC) is either a source code
line or a comment line." **Blank lines excluded; comment lines included.** Commit size is *not*
simply added+deleted: each diff chunk is sized as the midpoint of two bounds — `lower_bound =
max(added, removed)`, `upper_bound = added + removed`, `chunk_size = (lower+upper)/2` (Fig. 1, §2) —
because a diff cannot distinguish a modified line from an add plus a separate delete. Chunk sizes
summed across the commit. **No test/production split. No merge-commit, generated-file or
whitespace-file filtering described.** Population is all commits in the crawled projects; CVS/SVN
era, so git merge commits are largely not a factor. Threats to validity (§4.3) acknowledge two
Ohloh self-selection biases: projects that die very early and non-English-speaking projects are
under-represented.

Applicability: March 2008 data, thoroughly pre-AI, and therefore usable as a pre-AI baseline for
RQ8. Unit of analysis is the individual commit, matching the toolkit exactly.

Comparability to the toolkit's p90 of 260. The mismatches are real but bounded and pull in
*opposite* directions:

| | Kolassa | Toolkit | Direction of bias |
|---|---|---|---|
| Blank lines | excluded | included (git numstat) | toolkit reads higher |
| Comment lines | included | included | neutral |
| Test files | included | excluded (production only) | toolkit reads lower |
| Size formula | midpoint of max(a,r) and a+r | a + d | toolkit reads higher |
| Merges | not addressed | known open defect | toolkit reads higher |

So 261 and 260 are close for reasons that are partly coincidental. Treat it as a **sanity check
that the toolkit's band is in the right order of magnitude and in the right place relative to a
real population**, not as a derivation. It is nonetheless the strongest external evidence in this
review that the band is not arbitrary.

#### 2. Arafat and Riehle — distributional form, and an explicitly unsourced cut point

O. Arafat, D. Riehle, "The Commit Size Distribution of Open Source Software." *HICSS-42*, 2009.
DOI 10.1109/HICSS.2009.421. Free copy: dirkriehle.com (accessed 2026-08-18, full text read).

Corpus: same Ohloh March 2008 snapshot, 9,363 completely crawled projects, January 1990 to
February 2008.

> "In total, our database snapshot encompasses 8,556,036 commits. Of these, 215,531 commits have a
> size of zero. ... In addition, 22,429 commits only move files from one location to another. With
> our focus on source code analysis we omit these commits for the rest of the analysis. This
> results in a total of 8,318,076 commits that are taken into consideration for further analysis."
> — §3, p. 3

> "These commits in the range of 1-100 SLoC constitute 83.54% of our total commit population.
> One-liners constitute 12.13% of the total sample population, two-liners constitute 8.964%,
> three-liners constitute 5.449%, and so on." — §3.2, p. 4

Power-law fits (Tables 3-4): total `y = 1E+07·x^-1.8612`, R² = 0.9782; range 1-100 SLoC
`y = 2E+06·x^-1.1326`, R² = 0.9895; range 11-100 `y = 3E+06·x^-1.2464`, R² = 0.9971; range
101-10,000 `y = 7E+07·x^-1.8700`, R² = 0.9510; above 10,000 `y = 9E+09·x^-2.3659`, R² = 0.7025.

Unit and population: SLoC by Ohloh's `ohcount` diff tool: "SLoC consist only of actual program
code, omitting empty and comment lines" (§2). **Both blank AND comment lines excluded** — differs
from the Kolassa LoC definition on the same underlying database. Size = added + removed + changed,
with changed-line counts estimated from a probability distribution. Zero-size and move-only commits
filtered. No test/production split, no merge handling described.

**Critical negative finding.** Their small/medium/large boundaries (single commits 1-100 SLoC,
aggregate 101-10,000, repository refactorings >10,000) look tempting as a source for the toolkit's
`LARGE_COMMIT_THRESHOLD: 100`. They are not:

> "Maybe most significantly, our cut-off values of 100 SLoC and 10,000 SLoC are more based on
> observation and intuition and less based on statistical analysis. The refinement of this
> heuristic will be a next step to be undertaken..." — §4 Strengths and Limitations, p. 7

**Do not cite Arafat and Riehle as the source for a 100-line boundary.** The authors disclaim it.

#### 3. Alali, Kagdi, Maletic — the strongest precedent for percentile-derived boundaries, and its trap

A. Alali, H. Kagdi, J. I. Maletic, "What's a Typical Commit? A Characterization of Open Source
Software Repositories." *ICPC 2008*, pp. 182-191. DOI 10.1109/ICPC.2008.24. Free copy:
cs.kent.edu/~jmaletic/papers/ICPC08.pdf (accessed 2026-08-18, full text read).

Corpus: nine Subversion-hosted open source systems (Table 1): gcc (8 years, 54,536 versions),
Collab (5.7y, 20,288), JEdit (6.1y, 2,467), Ruby (9y, 10,667), LinuxBoss (7.9y, 3,023), Phpmyadmin
(6.7y, 6,028), MySql-Administrator (1.3y, 384), Python (6y, 20,420), Debian-installer (7.5y,
40,425).

Three size measures (§2.2): File-Size = "the total number of files that are added, deleted, and/or
modified in a commit"; Line-Size = "the total number of lines that are added, deleted, and/or
modified of all the files in a commit"; Hunk-Size = "the total number of hunks with line changes,
i.e., added and/or deleted, in all the files in a commit," computed with GNU `diff`.

**This is the percentile-based method the question asks about.** Categories derived per system from
the box-plot five-point summary:

> "We categorize the size data through their 5-Point summaries: 1) the minimum observation Q₀; 2)
> the lower quartile Q₁; 3) the median Q₂ 4) the upper quartile Q₃; and 5) the maximum observation
> Q₄." — §2.3, p. 3. Regions used are Q₁-1.5×IQR, the box Q₁-Q₃, Q₃+1.5×IQR, Q₃+3×IQR, named
> extra-small, small, medium, large, extra-large.

gcc results (Table 2, p. 4), 54,536 commits over eight years:

| Measure | Q₀ | Q₁ | median | Q₃ | max | x-Small | Small | Medium | Large | x-Large |
|---|---|---|---|---|---|---|---|---|---|---|
| Files | 1 | 2 | 2 | 4 | 4908 | 1-1 (8.4%) | 2-4 (68.0%) | 5-7 (12.8%) | 8-10 (4.0%) | 11-4908 (6.7%) |
| Lines | 0 | 6 | 14 | 46 | 203359 | 0-5 (19.9%) | 6-46 (55.3%) | 47-106 (11.1%) | 107-166 (4.3%) | 167-203359 (9.4%) |
| Hunks | 0 | 2 | 3 | 8 | 8067 | 0-1 (10.3%) | 2-8 (65.2%) | 9-17 (10.7%) | 18-26 (4.1%) | 27-8067 (9.7%) |

Derived percentiles (agent's arithmetic on their published frequencies, not their claim):
cumulative share of gcc commits at ≤7 files is 89.2%, so gcc's **p90 files ≈ 8**. Cumulative at
≤106 lines is 86.3% and at ≤166 lines is 90.6%, so gcc's **p90 lines ≈ 160**.

Across all nine systems (§6, p. 8):

> "The data that was obtained indicates that a large amount of commits are of very small sizes with
> respect to file (2-4), line (approximately less than 50), and hunk (approximately less than 8)
> measures."

Unit and population: files/lines/hunks per Subversion commit. **No test/production split, no merge
exclusion, no whitespace or generated-file filtering.** Line minimum Q₀ = 0 shows zero-line commits
are retained. One inconsistency: §2.2 defines Line-Size as added + deleted + modified, but the
Table 2 column is headed "Number Of New Lines," which reads as additions only. The paper does not
resolve it, so treat the gcc line figures as unit-ambiguous.

**The trap.** The widely-repeated "approximately 75% of commits are quite small" (Abstract) is **a
tautology of the method, not an empirical finding**. Extra-small spans Q₀-Q₁ (25% by construction)
and Small spans Q₁-Q₃ (50% by construction); their sum is 75% for any distribution whatsoever.
Anyone citing that 75% as evidence about commit behaviour is citing the definition of a quartile.
Only the *category boundary values* (2-4 files, ≤46 lines for gcc) carry information.

#### 4. Hattori and Lanza — Pareto by file count, and an explicit argument against percentile splits

L. P. Hattori, M. Lanza, "On the Nature of Commits." *EVOL 2008* at ASE 2008 Workshops, pp. 63-71.
Free copy: inf.usi.ch/faculty/lanza/PUBS/P/Hatt2008a.pdf (accessed 2026-08-18, full text read).

Corpus: 72,351 commits from nine projects, intervals 1999-2008. Size measured **only** in files:
"We measure the size of a commit by counting the number of files it affects" (§3).

> "As it can be observed, almost all q-q plots approximate a straight line, which confirms that
> they follow a Pareto distribution." — §3, p. 3

Classification (§3, p. 4): tiny 1 to 5 files; small 6 to 25; medium 26 to 125; large 126 up —
chosen on an exponential scale with base 5, an authorial choice, not a fitted boundary.

**This paper directly rebuts percentile-based cut points:**

> "Since commits follow a Pareto distribution, it does not make sense to split them into quartiles,
> for example, because the number of commits with only one file is around the 50th percentile in
> most cases. Although we could use the approximate distribution function found for each project to
> calculate an exact division, this is not a generalized approach that could be directly applied to
> other open source projects." — §3, p. 4

A published objection to exactly the method Alali et al. use, and to any attempt to turn a
per-project percentile into a portable number.

#### 5. Sadowski et al. — a modern industrial p90 in files, closest match to the toolkit's file band

C. Sadowski, E. Söderberg, L. Church, M. Sipko, A. Bacchelli, "Modern Code Review: A Case Study at
Google." *ICSE-SEIP '18*, pp. 181-190. DOI 10.1145/3183519.3183525. Held locally at
`talks/XP 2026/3183519.3183525.pdf`.

Corpus and method (§3.3, p. 184): ~9 million changes by more than 25,000 authors and reviewers,
January 2014 to July 2016, plus 13 million comments. Filters unusually explicit:

> "We use a name-based heuristic to filter out changes made by automated processes. We focus
> exclusively on changes that occur in the main codebase at Google. We also exclude changes not yet
> committed at the time of study and those for which our diff tool reports a delta of zero source
> lines changed, e.g., a change that only modifies binary files."

> "At Google, over 35% of the changes under consideration modify only a single file and about 90%
> modify fewer than 10 files. Over 10% of changes modify only a single line of code, and the median
> number of lines modified is 24." — §5.2 "Review size", pp. 186-187

Unit and population: a **change (CL) submitted for review**, not a git commit — close to one commit
at Google, but a reviewed unit, and robot-authored changes are filtered out (a filter the toolkit
does *not* apply). "Lines modified" is not decomposed into added vs deleted. **No test/production
split**; binary-only changes excluded; generated files not excluded.

Applicability: the best available anchor for `P90_FILES_CHANGED`. Google's p90 is about 10 files;
the toolkit's healthy bound is 9.5 and its critical bound is 13. Data is 2014-2016, comfortably
pre-AI.

#### 6. Rigby and Bird — medians across eleven projects, industrial and open source

P. C. Rigby, C. Bird, "Convergent Contemporary Software Peer Review Practices." *ESEC/FSE 2013*,
pp. 202-212. DOI 10.1145/2491411.2491444. Free copy: microsoft.com/en-us/research (accessed
2026-08-18, full text read).

> "From Figure 4, both Android and AMD have a median change size of 44 lines. This median change
> size is larger than Apache, 25 lines, and Linux, 32 lines, but much smaller than Lucent where the
> number of non-comment lines changed is 263 lines. ... For example, Chrome's median change is 78
> lines and includes 5 files. However, for Chrome, only 23% of changes are the same size or larger
> than a median Lucent change." — §4.1, p. 207

> "the distribution of changes on Google-led and the other OSS project are left skewed indicating
> that the majority of changes are small. While the distribution for the commercial firms is also
> left skewed, it is almost log normal." — §4.1, p. 207

Unit and population: per **review**, not per commit. Microsoft data from CodeFlow, Google-led data
from the Gerrit JSON API (merged and abandoned reviews only), AMD from a CodeCollaborator summary
dump, Lucent from Siy's inspection self-reports. Lines counted are "lines changed"; for Lucent
specifically **non-comment** lines. No test/production split. Data predates 2013.

#### 7. Purushothaman and Perry — a defect-risk boundary tied to change size

R. Purushothaman, D. E. Perry, "Toward Understanding the Rhetoric of Small Source Code Changes."
*IEEE TSE* 31(6), 2005, pp. 511-526. DOI 10.1109/TSE.2005.74. The TSE full text at Perry's homepage
is **a truncated 2-page file**, so the complete MSR 2004 extended abstract of the same study was
read instead (users.ece.utexas.edu/~perry/work/papers/PC-04-msr04.pdf, 5pp, accessed 2026-08-18).

Corpus: the Office Automation subsystem of Lucent's 5ESS switching system: 4,550 modules, ~2 million
lines of C, 31,884 modification requests over a decade, aggregated to 72,258 change records and
51,478 dependent change records (§2, §3.1).

> "Nearly 10 percent of changes involved changing only a single line of code; nearly 50 percent of
> all changes involved changing fewer than 10 lines of code; nearly 95% of all changes were those
> that changed fewer than 50 lines of code." — §4, p. 4

> "The probability that the insertion of a single line might introduce a defect is 2 percent; there
> is nearly a 5 percent chance that a one-line modification will cause a defect. There is nearly a
> 50 percent chance of at least one defect being introduced if more than 500 lines of code are
> changed." — §4, p. 4

> "Less than 4 percent of one-line changes result in error." — §4, p. 4

Unit and population: a "change" is a **Modification Request (MR)**, a logical unit tracked in SCCS,
aggregated across all files it touches — not a commit. Lines = added + deleted + modified, derived
from SCCS deltas where a modification is recorded as a delete plus an add. Single proprietary C
subsystem, roughly mid-1980s to mid-1990s. No test/production split. Not a git repository at all.

Note the tension with source 6: P&P put Lucent's p95 at about 50 lines per MR; Rigby and Bird put
Lucent's *median* at 263 non-comment lines. Different populations (an MR versus an inspection
package bundling many MRs) and different subsystems. Neither refutes the other, but neither should
be cited as "Lucent's commit size" without saying which.

#### 8. Hindle, German, Holt — the 99th percentile as a selection rule, and what lives in the tail

A. Hindle, D. M. German, R. C. Holt, "What Do Large Commits Tell Us? A Taxonomical Study of Large
Commits." *MSR '08*, pp. 99-108. DOI 10.1145/1370750.1370773. Free copy: softwareprocess.ca
(accessed 2026-08-18, full text read).

> "For each project, we retrieved their commit history. We then selected the 1% commits that
> contained the largest number of files (of any file type, not only source code) for our manual
> inspection. We auditted 2000 commits." — §2, p. 2

Nine projects: Boost, Egroupware, Enlightenment, Evolution, Firebird, MySQL 5.0, PostgreSQL, Samba,
Spring Framework.

Real precedent for a percentile cut on commit size, but as a per-project sampling rule, not a health
boundary, and no absolute file count is published for any project's 99th percentile.

The qualitative result matters more than the method: §3.1 finds large commits dominated by
**auto-generated documentation (Boost, Samba), branch merges to trunk (Boost, MySQL, Samba,
Evolution), yearly copyright-year updates (Boost), license changes, imports of externally developed
modules (Egroupware, Enlightenment), build-file proliferation (Firebird), and reformatting /
code-cleanup (PostgreSQL)**.

### What this does and does not support

Supports the two p90 bands as plausible, and for the first time from outside the six reference repos:

| Toolkit band | External comparison | Source |
|---|---|---|
| `P90_LINES_CHANGED` healthy **260** | p90 = **261 LoC** over 8.7M commits (unit differs, bounded) | Kolassa et al., Table 1 |
| | gcc p90 ≈ **160 lines** (derived from published frequencies) | Alali et al., Table 2 |
| `P90_FILES_CHANGED` healthy **9.5** | Google p90 ≈ **10 files** over 9M changes | Sadowski et al., p. 187 |
| | gcc p90 ≈ **8 files** (derived) | Alali et al., Table 2 |

The file band is the better-supported of the two: two independent corpora, one industrial and one
open source, one from 2016 and one from 2008, bracket 9.5 from either side. The critical bound of 13
files has **no** external support.

Supports percentiles over the mean, strongly and on statistical grounds. Three independent fits
agree the distribution is heavy-tailed: GPD with ξ = 1.4617 (Kolassa Table 2), power law with
exponent -1.8612 (Arafat Table 4), Pareto by Q-Q plot across nine projects (Hattori Fig. 2). A GPD
with ξ = 1.4617 has **no finite mean and no finite variance**. Kolassa's own empirical table shows
the consequence: mean 465.72 against median 16, a mean lying above its own 90th percentile. This is
a direct argument that `avg_lines_changed` (banded at 150) and the `stddev` reported by
`lib/statistics.js` are the wrong statistics for this quantity. Filed as `code-quality-metrics-6dg`.

Does not support flagging a project by its p90. No source proposes a p90 threshold, publishes a
healthy p90, or evaluates whether a project with a high p90 has worse outcomes. Alali et al. use
quartiles to *classify commits within one system*; Hindle et al. use the 99th percentile to *sample
commits for manual reading*. Hattori and Lanza explicitly say a per-project percentile division "is
not a generalized approach that could be directly applied to other open source projects" (§3, p. 4).
The move from "the distribution is heavy-tailed so use percentiles as descriptive statistics" to "a
project whose p90 exceeds N is unhealthy" is unpublished. The toolkit is on its own for that step
and the documentation should say so.

Does not resolve the unit mismatch, and no source ever will. Every published distribution counts
something different from what the toolkit counts, and **not one of the eight separates test files
from production files**. Since the toolkit excludes test lines, its p90 should read *lower* than
these published p90s for equivalent behaviour, which makes 260 slightly permissive relative to
Kolassa's 261 rather than slightly strict.

Stability of p90 on a 50-commit window is the unaddressed risk. No source estimates the sampling
variance of a high quantile from a heavy-tailed distribution. With ξ = 1.4617 the tail is extreme;
the empirical p90 of a 50-commit sample is the 45th order statistic and its variance is large. A
real methodological gap the literature does not fill; state it as a limitation.

Sources rejected: a recurring web claim that "Google recommends keeping pull requests under 200
lines" and that "many high-performing teams set a soft limit of 400 lines and a hard limit of 600"
appears in blog and vendor content with no traceable primary. The 400-line figure traces to
SmartBear's Cisco case study, already rejected under RQ1. The 200-line "Google" figure does not
appear in Sadowski et al., which reports a *median of 24 lines* with no recommended limit anywhere.
**Treat any "Google recommends N lines" citation as unsourced.**

### Search record

Local PDF library: four previously unknown files identified.

- `Ai adoption/67110.pdf` = MIT Sloan Management Review, "The Hidden Costs of Coding With Generative
  AI", Edward Anderson, Geoffrey Parker, Burcu Tan, 18 Aug 2025, Reprint 67110. Practitioner
  article, no commit-level data.
- `talks/XP 2026/1701.05472v1.pdf` = Juergens et al., "Do Code Clones Matter?" (ICSE 2009 preprint).
- `talks/XP 2026/icse2013.pdf` = Bacchelli and Bird, ICSE 2013, ZORA copy.
- `talks/XP 2026/3183519.3183525.pdf` = Sadowski et al., ICSE-SEIP 2018. Source 5 above.

Databases and search paths: WebSearch with author+title queries for each named paper; DOI resolution
via doi.org; direct retrieval from author homepages (cs.kent.edu/~jmaletic, inf.usi.ch/faculty/lanza,
users.ece.utexas.edu/~perry, dirkriehle.com, softwareprocess.ca), Microsoft Research's public PDF
host, and arXiv. Terms: commit size distribution power law; What's a Typical Commit Alali Kagdi
Maletic; On the Nature of Commits Hattori Lanza; Arafat Riehle HICSS 2009; Kolassa Riehle Salim
commit size; Hindle German Holt large commits 99th percentile; Rigby Bird convergent peer review
median change size; World of Code / GHTorrent / Boa commit size percentile; 90th percentile commit
size threshold; AI-assisted commit size distribution 2024-2025.

Fully read: Arafat & Riehle HICSS 2009 (8pp); Kolassa/Riehle/Salim SOFSEM 2013 (13pp);
Alali/Kagdi/Maletic ICPC 2008 (10pp); Hattori & Lanza EVOL 2008 (5pp of 9); Hindle/German/Holt MSR
2008 (6pp); Rigby & Bird ESEC/FSE 2013 (pp. 204-207); Sadowski et al. ICSE-SEIP 2018 (pp. 184-187);
Purushothaman & Perry MSR 2004 extended abstract (5pp).

INACCESSIBLE:

- `users.ece.utexas.edu/~perry/work/papers/PC-05-small-tse.pdf` — HTTP 200, valid PDF, but **only 2
  pages**: truncated to the abstract and introduction of the 16-page TSE article. Worked around by
  reading the MSR 2004 extended abstract, which contains the complete results list. Any TSE-only
  detail beyond MSR 2004 is unverified.
- `dl.acm.org/doi/10.1145/3571473.3571508` — **HTTP 403**. Sacramento et al., "Characterizing Commits
  in Open-Source Software", SBQS 2022, reportedly 1M commits from the 24 most popular active Java
  projects on GitHub, reportedly heavy-tailed with most commits touching 1-10 files and 1-4 source
  files. **Abstract-level only via search snippets; method, denominator and exact percentiles
  unverified. Do not cite.** The one modern git-era corpus that would have added a post-2010
  file-count distribution. Worth a retry with ACM DL access.
- `inf.usi.ch/faculty/lanza/publications.html` — HTTP 403 to WebFetch; retrieved with curl and a
  browser user-agent, yielding the working PDF path `PUBS/P/Hatt2008a.pdf`.

Searched and found nothing usable: World of Code (Ma et al., EMSE 2021), GHTorrent (Gousios), and
Boa (Dyer et al.) are infrastructure papers; none reports commit-size percentiles as a finding.
Kolassa/Riehle/Salim's companion paper on commit *frequency* (arXiv:1408.4978) is out of scope. "An
Empirical Study of Token-based Micro Commits" (EMSE 2024, arXiv:2405.09165) reports only
micro-commit prevalence (7.45-17.95%), no percentiles.

### Contradictions

**1. The most-cited claim in this literature is a tautology.** Alali et al.'s "approximately 75% of
commits are quite small" is guaranteed by their categorisation: extra-small is Q₀-Q₁ and small is
Q₁-Q₃, so the two always sum to 75%. Do not cite it as evidence.

**2. A published paper argues against exactly the method the toolkit uses.** Hattori and Lanza (§3,
p. 4) state that Pareto-distributed commit sizes make quartile splits meaningless because one-file
commits already sit near the 50th percentile, and that a per-project distributional division does
not generalise. The toolkit's `derive-bands.js` takes the p75 of twelve per-repo p90 observations —
a percentile of a percentile — precisely the sort of construction they say is not portable. Should
be acknowledged in `calibration/README.md`.

**3. The toolkit's mean-based band sits on a distribution that may have no mean.**
`AVG_LINES_CHANGED: { healthy: 150 }` and the `stddev` field in `lib/statistics.js` assume finite
first and second moments. The best published fit (GPD, ξ = 1.4617) has neither.
`calibration/observations.json` already records three windows where a single vendored import or
translation sync destroyed the mean while percentile and count metrics survived — the calibration
data independently rediscovered the theory. Filed as `code-quality-metrics-6dg`.

**4. The p90 tail is largely not development.** Hindle et al. read 2,000 of the largest commits by
hand and found the tail dominated by merges, auto-generated documentation, copyright-year sweeps,
license changes, external module imports and reformatting. The toolkit's p90 sits at exactly the
boundary where that population starts. Two consequences: a p90 that rises may signal more vendoring
rather than more AI-driven sprawl, and the known merge-diff double-count defect recorded in
`calibration/observations.json` for `emberjs/ember.js` (12 of 50 commits double-counting 6 real
changes) attacks the p90 harder than any count-based metric.

**5. Nothing validates the file-count *critical* bound of 13.** Alali's gcc x-Large band starts at 11
files and Hattori and Lanza's "large" starts at 126 files — two orders of magnitude apart, same
unit, overlapping eras. No convergence in the literature on where "too many files" begins; the
toolkit's 13 rests entirely on two local windows.

**6. Pre-AI baseline status, for RQ8.** Sources 1-4 and 6-8 are all pre-2019 and most pre-2010;
clean pre-AI baselines. The one AI-era study found, Ogenrwot and Businge, "How AI Coding Agents
Modify Code: A Large-Scale Study of GitHub Pull Requests" (arXiv:2601.17581v2, 24,014 agentic PRs /
440,295 commits versus 5,081 human PRs / 23,242 commits across 116,211 repositories, AIDev dataset
retrieved 2025-11-01) publishes **Cliff's δ effect sizes only** — commits δ=0.5429 large, files
touched δ=0.4487 medium, deletions δ=0.4462 medium, additions δ=0.2836 small, line changes δ=0.3158
small — with **no absolute median or percentile line counts**, and does not separate test from
production files or state whether bot commits are filtered. Cannot be differenced against the pre-AI
p90s above. Flagged for RQ8 as relevant but not quantitatively comparable.

Beads: `code-quality-metrics-13u` closed. Appended the Kolassa p90=261 and Sadowski/Alali
file-percentile findings to `code-quality-metrics-ck3` rather than opening a rival. Filed
`code-quality-metrics-6dg` on the statistical validity of reporting mean and stddev for commit size.
## RQ8: The pre-AI comparison

**Verdict**: direction only

No published study measures this toolkit's commit-shape metrics on the same repositories before and
after AI adoption. What exists is (a) contemporaneous within-project comparisons of AI-assisted vs
human commits, (b) difference-in-differences and event studies on volume outcomes that do not
decompose into commit shape, and (c) two nulls. **The direction of the commit-size evidence supports
the toolkit's premise; the direction of the duplication, test-discipline, and revert evidence
contradicts it.**

### Sources

#### 1. Robbes, Matricon, Degueule, Hora, Zacchiroli (2026) — the only large-scale commit-shape distribution

*Agentic Much? Adoption of Coding Agents on GitHub.* arXiv:2601.18341v2, 8 Apr 2026, 43 pp. Accessed
18 Aug 2026.

Corpus and method: 128,018 GitHub projects. Coding-agent adoption detected from three signal
families: agent configuration files (`CLAUDE.md`, cursor rules), commit-message/co-author trailers,
and branch names. For the size analysis they restrict to commits by projects with *both* file-level
and commit-level adoption, to minimise mislabelling AI commits as human. Three size metrics from
`git log`: lines added, lines deleted, files involved. Sample sizes: human 8,968,071 commits, bot
965,338, AI-assisted 439,439 (added-lines panel).

> "For instance, the median number of added lines for a human contribution is 11, while for a bot, it
> is only 4; on the other hand, for AI-assisted commits, it rises to 31, a value triple the median for
> humans, and closer to the third quartile of human contributions (41). The third quartile of
> AI-assisted contributions is considerably larger (114)." — Section 9, RQ5

> "For deleted lines, the differences are not as stark: we see that the amount of deleted lines per
> commits for bots is smaller than the other two categories (median: 3), while AI-assisted
> contributions are larger (median: 7) than Human contributions (median: 5). The same is true at the
> file level. However, the metric being coarser, the differences are smaller: the median bot commit
> involves a single file, while both AI-assisted and human commits involve two files. Only in the
> upper part of the distribution do we see a difference (Q3 for humans: 3; for AI-assisted commits:
> 4)." — Section 9, RQ5

> "Files follow the same pattern, with single-file AI-assisted commits being close to 15% less
> frequent, while commits with more than 20 files are 30% more frequent." — Section 9, RQ5

Separately, a random sample of 790 Claude Code commits (Table 6): median lines added 70, median lines
deleted 9, median files modified 1.

Unit and population: the individual commit. Population is commits in GitHub projects showing both
file-level and commit-level agent adoption, over the first half of 2025 plus a trailing window.
Medians and quartiles are of the per-commit distribution.

Applicability: directly comparable to what `local-code-metrics.js` computes, with one decisive
caveat: this is a **between-commit comparison inside AI-adopting projects at one point in time**, not
a before/after on the same projects. It does not supply a pre-AI baseline. The authors note
under-detection biases the gap *downward*.

#### 2. He, Miller, Agarwal, Kästner, Vasilescu (2026) — the DiD study

*Speed at the Cost of Quality: How Cursor AI Increases Short-Term Velocity and Long-Term Complexity in
Open-Source Projects.* arXiv:2511.04427v3, 26 Jan 2026. MSR '26. Carnegie Mellon University.

Corpus and method: 806 GitHub repositories identified as Cursor adopters by the first commit touching
a `.cursorrules` file or `.cursor` folder; 1,380 matched never-adopter controls by propensity-score
matching (1:3 nearest neighbour, same primary language, AUC 0.83-0.91), observation window January
2024 to August 2025, monthly panel. Staggered-adoption DiD using the Borusyak et al. imputation
estimator. Outcomes log-transformed, so ATTs read as 100(e^ATT − 1)%.

Table 2 (Section 4.1):

| Outcome | Percentage change |
|---|---|
| Commits | +2.63% (±4.40%) |
| Lines Added | +28.58% (±13.7%) |
| Static Analysis Warnings | +30.26% (±6.66%) |
| Duplicated Lines Density | +7.03% (±4.79%) |
| Code Complexity | +41.64% (±7.62%) |

> "On average, Cursor adoption has a modestly significant positive impact on development velocity,
> particularly in terms of code production volume: Lines added increase by about 28.6% (Table 2).
> There is no statistically significant effect for the volume of commits." — Section 4.1.1

> "In contrast to the transient velocity gains, Cursor adopters show sustained patterns across static
> analysis warnings and code complexity. On average (Table 2), static analysis warnings increase
> significantly by 30.3%, and code complexity increases by 41.6%. The effect on duplicate line density
> is insignificant." — Section 4.1.2

Unit and population: the repository-month. Population is public GitHub repositories in JavaScript,
TypeScript, or Python that *committed* Cursor configuration files. Duplicated Lines Density is
SonarQube's percentage of duplicated lines in the codebase — a share-of-lines figure, the denominator
GitClear does not supply.

Applicability: the strongest causal design available, and lines-added rising ~29% while commit count
does not move is the closest published thing to a pre/post statement about commit size. **But the
authors never compute lines-per-commit, and the two ATTs come from separately estimated log-outcome
models, so the ~25% implied rise in lines per commit is a derived directional inference, not a stated
result.** Estimates are intent-to-treat and relative to "current state of the practice", not relative
to no AI.

#### 3. Demirer, Musolff, Yang (2026) — NBER WP 35275 (local PDF)

*Writing Code vs. Shipping Code: Productivity Effects Across Generations of AI Coding Tools.* NBER
Working Paper 35275, May 2026, 97 pp. **Not peer-reviewed.** Funded in part by the Mack Institute at
Wharton and the Chicago AI Incubator; uses confidential Microsoft/GitHub Copilot telemetry.

Corpus and method: >100,000 GitHub developers, 2022-March 2026. Adoption events built from
confidential Microsoft Copilot subscription and request telemetry, plus public signals. Matched event
study: each treated user matched to a control user in the same calendar week *one year earlier*, to
avoid contamination from invisible contemporaneous adoption. Complete commit and PR histories from the
GitHub REST API. Outcomes normalised by each developer's own pre-period mean and winsorised at the
1st/99th percentiles.

Table 5, weeks 21-30, percent:

| Tool generation | Lines Chg | Dist Files | Commits | PRs | Dist Repos | Releases |
|---|---|---|---|---|---|---|
| Autocomplete | 228.2 (17.6) | 50.8 (4.5) | 35.9 (2.9) | 11.0 (2.7) | 13.6 (1.7) | 10.2 (4.1) |
| Sync agents (pooled) | 741.3 (19.2) | 187.0 (4.3) | 109.1 (2.7) | 65.5 (2.3) | 25.5 (1.0) | 20.3 (2.6) |

> "Starting with autocomplete, the effects decline monotonically across layers: from 228.2% for lines
> of code, to 35.9% for commits, and to only 10.2% for releases." — Section 7.1

Unit and population: the developer-week. "Lines Chg" is `stats_total` (additions plus deletions)
summed per developer-week after SHA-level dedup.

**Applicability, and a warning against the obvious arithmetic.** It is tempting to divide 228.2% by
35.9% and conclude commit size rose 141%. **Do not.** The authors are explicit:

> "the coefficients 𝛽𝑘 should be interpreted as the average of individual percentage changes, not a
> renormalization of the average level effect relative to average productivity—a distinction that
> matters if treatment effects are heterogeneous across baseline productivity levels, which is likely
> the case here" — Section 6

The ratio of two averages-of-individual-percentage-changes is not the average change in the ratio.
What survives is the *direction*: for every tool generation, lines and distinct files rise
proportionally far more than commits. No magnitude can be read off.

#### 4. Becker, Rush, Barnes, Rein (2025) — METR RCT (local PDF)

*Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity.*
arXiv:2507.09089v1, 12 Jul 2025, 50 pp. Model Evaluation & Threat Research (METR).

Design and population: RCT, task-level randomisation. 16 developers, 246 tasks (2.0 hours average),
on mature repositories they regularly maintain: average 5 years' prior experience and 1,500 prior
commits on the repo; repositories average 10 years old, >1,100,000 lines of code, 23,000 stars, 20,000
commits, 710 committers. Tools: primarily Cursor Pro with Claude 3.5/3.7 Sonnet, February-June 2025.
Outcome is self-reported total implementation time including post-PR-review time. Screen recordings
labelled for 143 hours (29% of total).

> "Surprisingly, we find that allowing AI actually increases completion time by 19%—AI tooling slowed
> developers down." — Abstract

Two things bear on RQ8 more than the headline. First, an explicit warning against exactly the class of
metric this toolkit computes:

> "Other literature uses tasks found 'in the wild,' either via natural experiments [16] or randomized
> controlled trials [15; 17], finding 14-51% increases in output productivity metrics. However, these
> studies use outcome measures that are not fixed in advance—i.e. lines of code written, number of
> code commits, and pull requests (PRs) as their key outcome measures respectively. It's possible for
> AI assistance to affect the outcomes without actually increasing productivity, e.g. by causing
> developers to write more verbose but functionally equivalent code, or causing them to break up pull
> requests into smaller chunks of work." — Section 1.1

Second, the only commit-shape number they report (Appendix C.2.3):

> "Quantitatively, we observe that developers write 47% (p = 0.16) more code per hour of AI-disallowed
> forecasts, on issues where AI is allowed. This is not statistically significant, and as discussed in
> section 1, an increase in the number of lines of code does not necessarily correspond to greater
> productivity or a larger scope, because code can be more verbose but functionally equivalent."

Unit and population: the task. Population is 16 experienced maintainers of large mature open-source
repositories, self-selected into a paid study. Post-hoc power is low; the 19% figure has a CI of
roughly +2% to +39%.

Follow-up: METR, *We are Changing our Developer Productivity Experiment Design*,
metr.org/blog/2026-02-24-uplift-update, 24 Feb 2026, accessed 18 Aug 2026. Preliminary late-2025
replication: 57 developers, 143 repositories, >800 tasks. Reported speedups: −18% (CI −38% to +9%) for
original developers; −4% (CI −15% to +9%) for new recruits. METR states this gives "only very weak
evidence" because developers systematically withheld tasks where AI would help most.

#### 5. Peng, Kalliamvakou, Cihon, Demirer (2023) — the 55.8% figure (local PDF, duplicated)

*The Impact of AI on Developer Productivity: Evidence from GitHub Copilot.* arXiv:2302.06590v1, 13 Feb
2023. Microsoft Research, GitHub Inc., MIT Sloan.

Design and population: RCT, single task. 95 developers recruited via **Upwork job posting** (166
offers sent, 95 accepted), randomised to Copilot or no Copilot, September 2022. Task: implement an
HTTP server in JavaScript against 12 visible, unmodifiable test cases in a GitHub Classroom template
repository. Participants mostly aged 25-34, mostly from India and Pakistan, median yearly income
$10,000-$19,000, average 6 years' coding experience.

> "The treatment group, with access to the AI pair programmer, completed the task 55.8% faster than
> the control group." — Abstract

Unit and population: one greenfield task. Outcome is wall-clock task completion time. **No
commit-level metric is reported.**

**Do not average this with METR.** METR's own critique names this study:

> "Peng et al. [10] asks developers to implement a very basic HTTP server in JavaScript to satisfy
> several automatic test cases that are shown to the developers—this task is a) unrepresentative of
> most software development work, and b) likely to be similar to a large amount of LLM training data,
> which may unfairly advantage AI systems relative to humans." — METR, Section 1.1

The design differences are total: recruited freelancers vs 5-year maintainers; one greenfield task vs
246 tasks in 10-year-old million-line codebases; a visible test oracle vs human PR review; 2022
autocomplete vs 2025 agentic Cursor. **They are not two estimates of one quantity.**

Note on the local library: `talks/XP 2026/impact-of-ai-on-development-copilot.pdf` is a byte-identical
copy of `writing/infoq/Pdca/2302.06590v1.pdf`. Same paper, filed twice.

#### 6. Cui, Demirer, Jaffe, Musolff, Peng, Salz (2025/2026) — the three field experiments

*The Effects of Generative AI on High-Skilled Work: Evidence from Three Field Experiments with
Software Developers.* February 2025 draft at
economics.mit.edu/sites/default/files/inline-files/draft_copilot_experiments.pdf (accessed 18 Aug
2026); published in *Management Science*, 2026; SSRN 4945566. Post-registered AEARCTR-0014530.

Design and population: three RCTs run by the firms themselves (Microsoft, Accenture, an anonymous
Fortune 100 electronics manufacturer) as ordinary business decisions, 2 to 8 months each, 4,867
developers pooled. Preferred estimates are IV, treatment status instrumenting for usage.

> "Our preferred estimates from an instrumental variable regression suggest that usage of the coding
> assistant causes a 26.08% (SE: 10.3%) increase in the weekly number of completed tasks for those
> using the tool. When we look at outcomes of secondary interest, our results support this
> interpretation, with a 13.55% (SE: 10.0%) increase in the number of code updates (commits) and a
> 38.38% (SE: 12.55%) increase in the number of times code was compiled." — Abstract / Section 1

Unit and population: the developer-week. Outcomes are counts. The commit effect (+13.55%, SE 10.0%) is
not significant at conventional levels. The authors flag the design:

> "The exact implementation of these experiments was rather ad-hoc as they were driven by business
> considerations at these companies rather than research goals." — Footnote 3

No commit-shape metric. The only quality proxy is build success rate, on which they find no negative
effect except a negative point estimate at Accenture.

#### 7. Stray, Brandtzæg, Wivestad, Barbala, Moe (2026) — the same-developers null

*Developer Productivity With and Without GitHub Copilot: A Longitudinal Mixed-Methods Case Study.*
arXiv:2509.20353v2, 28 Jan 2026; HICSS-59 proceedings. University of Oslo / SINTEF.

Corpus and method: 26,317 unique non-merge commits from 703 NAV IT repositories (Norwegian
public-sector agency) over two years spanning Copilot's introduction, mined locally with PyDriller. 39
developers: 25 Copilot users, 14 non-users, identified by self-reported GitHub username in a survey.
Plus 13 interviews.

> "We did not find any statistically significant changes in commit-based activity for Copilot users
> after they adopted the tool, although minor increases were observed." — Abstract

> "Before Copilot's launch, users were adding 188 lines and deleting 105 lines per week on average,
> compared to non-users' 80 additions and 40 deletions. After Copilot's launch, the user group's
> insertions ticked up slightly (to 200/week) while deletions ticked down (98/week), yielding an
> increase in net lines of code (+16 net lines as average weekly). Non-users, by contrast, showed a
> small decline in both additions (70) and deletions (30) in the same period (thus a roughly flat net
> change). These shifts were relatively small." — Section 4.1

> "It is important to note that we found no evidence of any negative impact on code quality metrics
> from Copilot adoption. The structural metrics (e.g., function complexity, average module size)
> remained virtually unchanged and showed no significant differences between users and non-users."
> — Section 4.1

Unit and population: the developer-week. Population is 25 adopters and 14 non-adopters at one
Norwegian public-sector organisation.

**Two limitations that matter here.** The dataset was **trimmed at the 95th percentile per metric**
(Section 3), which removes precisely the large-commit tail this toolkit is built to detect. And with
n=25 adopters, the study has little power to detect anything but a large effect. **This is a weak
null, not a refutation.**

Applied to `net_additions_ratio`: taking (additions − deletions) / (additions + deletions) on the
weekly aggregates gives 0.283 before and 0.342 after for adopters — a rise, but derived by the agent
from group means, not stated by the authors, and computed on developer-week totals rather than
per-commit medians. Not comparable to `net_additions_ratio_median`.

#### 8. Daniotti, Wachs, Feng, Neffke (2025/2026) — the only corpus with a genuine pre-AI window

*Who is using AI to code? Global diffusion and impact of generative AI.* arXiv:2506.08945v2, 20 Nov
2025; published in *Science*, DOI 10.1126/science.adz9311, 2026. Complexity Science Hub Vienna /
Utrecht / Corvinus.

Corpus and method: a neural classifier trained to detect AI-generated Python functions, applied to
over 30 million GitHub commits by 170,000 developers (arXiv v2 figures). OLS with user and quarter
fixed effects, standard errors clustered by user. Three commit-count dependent variables: all commits,
commits modifying multiple files, and commits adding library imports.

> "We find consistent effects across different sets of commits: all commits, commits that modify
> multiple files (which typically require navigating complex dependencies across scripts), and commits
> that add new libraries or library combinations (which typically introduce new functionality to
> scripts). Moving from 0 to 29% genAI usage—the estimated US adoption rate by the end of 2024—is
> associated with a 3.6% increase in commit rates across all these commit types." — Main text

> "Table S8: Placebo tests of main regressions. Subsetting our dataset to pre-2022 activity where we
> expect no AI use, we find no significant relationships between detected AI use and developer
> behavior." — Supplementary Information, Table S8 caption

Unit and population: the developer-quarter. Population is GitHub developers with Python commits,
2018-2024. The DV is a *count* of commits in a category, not a share.

**Why this matters for sprawl.** Multi-file commit counts and all-commit counts move by the same 3.6%,
which means the *share* of multi-file commits does not shift with AI adoption. That is a derived
inference — both are semi-elasticities from the same specification, so the comparison is legitimate,
but the authors do not state it. **Evidence against an AI-driven rise in commit sprawl, from the
largest corpus with a real pre-AI window.**

Version discrepancy: the arXiv v2 abstract says "over 30 million GitHub commits by 170,000 developers"
and "increased by 3.6%". Secondary summaries of the *Science* version report 80 million commits,
200,000 developers, and 2.4%. Only the arXiv text was verified; treat the *Science* figures as
unverified.

#### 9. Khosravani, Mockus (2026) — revert rates and the 100-line boundary

*Detecting AI Coding Agents in Open Source: A Validated Multi-Method Census of 180 Million
Repositories.* arXiv:2606.24429v1, 23 Jun 2026. World of Code infrastructure.

> "Using the GitHub REST API, we sampled 41 OpenHands-attributed (AI) commits and 58 human commits
> from the same projects and compared their commit characteristics. OpenHands commits added a median
> of 52 lines, compared to 28 lines for human commits, corresponding to a 1.9× median increase. The
> mean ratio was substantially larger (8.1×) due to extreme outliers, including one commit adding
> 143,802 lines. Lines deleted per commit were lower for AI-generated commits (median 4 vs. 6), while
> the number of files changed was comparable (median 2 for both groups). **The proportion of large
> commits (more than 100 lines added) was also higher for AI commits (34%) than for human commits
> (24%).**" — Section 4.4

> "Claude Code commits are reverted 32% less often than human commits (1.1% vs. 1.6%), while Aider
> commits are reverted 82% less often (0.17% vs. 0.90%). Both represent strong positive signals of
> stability. In contrast, OpenHands commits show a 34% higher revert rate than human ones (1.38% vs.
> 1.03%)." — Section 4.4

Unit and population: the commit-size comparison is a **convenience sample of 41 AI and 58 human
commits** — far too small to seed a threshold, but it is the only published measurement using the
toolkit's exact >100-lines-added boundary. Revert rates are computed over the full detected commit
populations (850,157 Claude Code commits) and are far more solid.

#### 10. Hora (2026) — test co-change

*Are Coding Agents Generating Over-Mocked Tests? An Empirical Study.* arXiv:2602.00409, MSR '26.

Corpus and method: over 1.2 million commits made in 2025 across 2,168 TypeScript, JavaScript, and
Python repositories with agent configuration files; 48,563 agent commits, 169,361 test-modifying
commits, 44,900 mock-adding commits.

> "(2) 23% of commits made by coding agents add/change test files, compared with 13% by non-agents;
> ... (4) 36% of commits made by coding agents add mocks to tests, compared with 26% by non-agents"
> — Abstract

Unit and population: the commit; population is 2025 commits in repositories with detected agent
activity. A within-2025 between-commit comparison, not before/after.

### What this does and does not support

Supports (direction only, no boundary):

- Commit size rises with AI assistance. Robbes et al.'s median lines added of 31 for AI-assisted vs 11
  for human, on ~9.4M commits, is the best-evidenced statement in this area. He et al.'s DiD adds
  causal weight: +28.6% lines added with no significant change in commit count.
- Very large commits get commoner. Robbes et al.: commits over 500 and over 1,000 added lines are
  roughly twice as frequent when AI-assisted. Khosravani and Mockus: 34% vs 24% over 100 lines added.
- Deletions rise too, less sharply, so the net-additions ratio moves toward additions but does not
  collapse: Robbes et al. median deletions 7 (AI) vs 5 (human).

Calibration these figures could inform (filed as `code-quality-metrics-4qr`):

- `LARGE_COMMIT_THRESHOLD: 100` sits above the human Q3 (41 added lines) and just below the
  AI-assisted Q3 (114). **It is not a neutral boundary; it selects roughly the top decile of human
  commits and roughly the top quartile of AI-assisted ones.**
- `SPRAWLING_COMMIT_THRESHOLD: 5` sits above Q3 for **both** populations (human Q3 = 3 files, AI Q3 =
  4). A sprawl rate under 10% is near-automatic under this distribution, so the metric discriminates
  poorly. Median files per commit is 2 for both populations — **AI changes commit *length* far more
  than commit *breadth*.**

Does not support:

- No study measures files per commit, additions-to-deletions ratio, test co-change, or commit message
  quality *before and after* AI adoption on the same repositories.
- No study measures commit message quality against AI adoption at all, in either design.
- No published figure supports a *healthy line* for any of these metrics.
- The `dora_archetype` boundary values (large-commit >30%/>40%, sprawl >25%) find no support anywhere.

**On constructing a pre-AI baseline from published data: it cannot be done in a way that answers the
question.** The obstacles are concrete:

1. Robbes et al., Khosravani and Mockus, and Hora all compare AI vs human commits *contemporaneously*.
   Post-2022 "human" commits are contaminated by invisible AI use — Robbes et al. say so explicitly.
   He et al. say the same: their estimates are "the impact of systematic Cursor adoption compared to
   the current state-of-the-practice ... not the impact of using Cursor with respect to no AI usage at
   all (the latter is generally not estimable in our observational dataset)."
2. He et al.'s window starts January 2024. NBER's starts 2022. Neither reaches back before autocomplete.
3. Daniotti et al. is the only corpus with a genuine pre-AI window (2018 onward, with a pre-2022
   placebo in Table S8), and their replication data is public (Dryad, doi:10.5061/dryad.3r2280gv0). But
   their DVs are commit *counts* by category. They never publish a commit-size distribution.
4. Pre-AI commit-size distributions do exist in the older mining literature (see RQ7). These give a
   pre-2022 baseline for *size*, but they use different corpora, different filtering, and no
   test/production split, so differencing them against 2026 measurements would confound the tool change
   with everything else.

**The practical conclusion:** this project must measure its own baseline. Running
`local-code-metrics.js` unchanged over pre-2022 windows of the same six reference repositories already
in `calibration/observations.json` is the only way to get a same-tool, same-corpus, same-definition
before/after. That is a within-repository design with the known confound of secular drift, which is
exactly the confound the Microsoft team flags: "such before-and-after comparisons are vulnerable to
seasonal confounds" (Murphy-Hill, Butler, Savelieva, arXiv:2607.01418, Section 2.2). Adding a matched
set of repositories with no detectable AI adoption signal over the same windows would turn it into a
crude DiD and is worth the effort.

### Search record

Local PDFs read, full text extracted with `pdftotext`:

| File | Identity | Relevant? |
|---|---|---|
| `Ai adoption/2507.09089v1.pdf` | Becker et al., METR RCT | Yes, source 4 |
| `writing/infoq/Pdca/2302.06590v1.pdf` | Peng et al., arXiv:2302.06590v1 | Yes, source 5 |
| `talks/XP 2026/impact-of-ai-on-development-copilot.pdf` | **Identical copy of the above** | Duplicate |
| `Ai adoption/Writing Code vs. Shipping Code...pdf.pdf` | Demirer, Musolff, Yang, NBER WP 35275 | Yes, source 3 |
| `Ai adoption/Measuring the Effectiveness of AI Adoption...pdf` | **A Medium blog post** by Adnan Masood, 28 Apr 2025. Enterprise AI-ROI framework survey. No corpus, no method, no git metrics | **Rejected**: secondary blog |
| `Ai adoption/67110.pdf` | **MIT Sloan Management Review**, Anderson, Parker & Tan, "The Hidden Costs of Coding With Generative AI", 18 Aug 2025, Reprint 67110. Unspecified-N interviews plus "our own economic modeling" | **Rejected**: no stated corpus size or sampling method. Its own caveat is quotable: "The studies were conducted in controlled environments where programmers completed isolated tasks — not in real-world settings" |
| `talks/XP 2026/1701.05472v1.pdf` | Juergens et al., "Do Code Clones Matter?" | Not RQ8 — duplication |
| `talks/XP 2026/icse2013.pdf` | Bacchelli & Bird, ICSE 2013 | Not RQ8 — code review |
| `talks/XP 2026/3183519.3183525.pdf` | Sadowski et al., ICSE-SEIP 2018 | Not RQ8 — code review |

Databases and terms (all 18 Aug 2026): arXiv, Semantic Scholar, MSR 2026 program, NBER, SSRN, MIT
Economics, INFORMS/Management Science, metr.org. Terms: `difference-in-differences GitHub Copilot
adoption commit characteristics repository mining`; `commit size files per commit before after AI
coding assistant adoption`; `pull request size code review time before after AI adoption
difference-in-differences 2026`; `AI-assisted commits test files co-change test coverage Copilot
adoption`; `commit message quality conventional commits before after AI assistance`; `Cui field
experiments Microsoft Accenture Copilot 4867 developers`; `Daniotti Wachs Feng Neffke who is using AI
to code`; `METR critique replication 19% slowdown`; `typical commit size distribution GitHub median
lines files`.

Papers retrieved and read in full: arXiv:2511.04427v2 and v3, 2601.18341v2, 2606.24429v1,
2509.20353v2, 2506.08945v2, 2602.00409, 2607.01418v1, 2603.28592v2, and the MIT Economics draft of Cui
et al.

Examined and set aside:

- *Debt Behind the AI Boom* (Liu et al., arXiv:2603.28592v2, SMU/HUST): 302.6k verified AI-authored
  commits from 6,299 repos, static analysis before and after each commit; 484,366 issues found, 89.3%
  code smells, 22.7% still alive at latest revision. Real and well-specified, but **no human-commit
  control and no pre-AI window**, so it cannot answer RQ8.
- *Adoption and Impact of Command-Line AI Coding Agents* (Murphy-Hill, Butler, Savelieva, Microsoft,
  arXiv:2607.01418v1): tens of thousands of Microsoft engineers, early-2026 Claude Code / Copilot CLI
  rollout, synthetic-control estimate that "adopters merged roughly 24% more pull requests than they
  would have otherwise". Sole outcome is merged-PR count; no commit shape.
- Tomaz et al., *Impacts of Generative AI on Agile Teams' Productivity*, arXiv:2602.13766 (2026). Cited
  by the Microsoft paper as finding no change in commit volume for three agile teams. **Not
  retrieved** — noted as a second null, unverified.

**Rejected vendor telemetry** (the same species as the withdrawn 154%/91% DORA claims):

- **Faros AI 2026 telemetry**, corpus stated as ~22,000 developers across ~4,000 teams: "median time
  spent in code review up 441.5%", "Code churn ... is up 861%", "Bugs per developer are up 54%",
  "ratio of production incidents to pull requests is up 242.7%". No stated method for classifying a PR
  as AI-assisted, no baseline period definition, no denominator for "churn". Reached only through an
  intermediary blog, not a primary methodology document.
- **LinearB 2026 Software Engineering Benchmarks**, corpus stated as 8.1 million pull requests across
  4,800 teams in 42 countries: "AI-assisted PRs run about 2.5x larger"; 30-day merge rate 32.7%
  (AI-assisted) vs 84.5% (unassisted). Same defects: undisclosed classifier, and "2.5x larger" has no
  stated unit.

Both are the exact pattern the project already got burned by. **The 2.5x PR-size figure is very close
in kind to the withdrawn "154% increase in pull request size", and this is most likely where that
family of numbers originates: vendor DevEx-platform telemetry, laundered through blog posts until the
attribution drifts to DORA.** Do not cite either.

### Contradictions

Filed as `code-quality-metrics-75c`.

**1. Duplication does not measurably rise, and the leading peer-reviewed DiD says so explicitly.** He
et al. put Cursor's effect on duplicated line density at +7.03% (±4.79%) and describe it as
insignificant. Their discussion (Section 4.4) names the target:

> "quality that challenges simplistic narratives about AI coding degrading code quality [6]. While the
> absolute levels of static analysis warnings increase post adoption (Finding 2), a large part of this
> observed effect can be attributed to the causal path of increased velocity → increased code base
> size → increased technical debt (Table 3). In other words, LLM agent assistants amplify existing
> velocity-quality dynamics by enabling faster code production, but may not necessarily introduce more
> code quality issues than non-adopting projects moving with the same velocity."

Their reference [6] is GitClear's *Coding on Copilot*. Robbes et al. independently attack the same
source (Section 3.1):

> "the white papers from GitClear [10, 11] report increased churn and code duplication after Copilot's
> release over time. However, their lack of usage traces prevents distinguishing actual Copilot use,
> limiting the analysis to a rough approximation that may not exclude other confounding factors."

**Two independent peer-reviewed MSR '26 papers reject the GitClear duplication narrative on method.**
He et al.'s +7.03% is measured as a *percentage of duplicated lines in the codebase*, the share-of-lines
denominator the toolkit needed and GitClear never provided.

**2. The quality degradation is largely a volume effect, not an AI-code-intrinsic effect.** He et al.'s
panel GMM (Table 3) decomposes the warning increase into lines-added → codebase size → technical debt.
Only *complexity* survives as a distinct AI effect:

> "That code complexity increases even after accounting for velocity dynamics (Table 3) gives strong
> evidence that code generated with Cursor in our study sample is inherently more complex than
> human-written code."

If the toolkit's framing is "AI degrades discipline", this reframes it: AI mostly makes teams go
faster, and going faster has always cost quality. **The one genuinely AI-specific residual is
complexity, which this toolkit does not measure at all.**

**3. Agent commits touch tests MORE often, not less.** Hora: 23% of agent commits add or change test
files vs 13% of non-agent commits, over 1.2M 2025 commits. The toolkit's `test_first_pct` premise
assumes AI erodes test discipline; this is the largest measurement bearing on it and it points the
other way. The offsetting finding is qualitative: 36% of agent commits add mocks vs 26%, and the
paper's argument is that mock-heavy tests validate less. **A test-file-touched counter cannot
distinguish those two cases — a limitation of this toolkit's metric, not evidence for its premise.**

**4. Revert rates mostly favour AI.** Khosravani & Mockus: Claude Code commits reverted 32% less often
than human commits in the same projects; Aider 82% less; OpenHands 34% more. Two of three agents look
*more* stable than human commits.

**5. Two same-cohort before/after studies find no change in commit activity at all.** Stray et al.: no
statistically significant change for 25 Copilot adopters over two years, and "no evidence of any
negative impact on code quality metrics". Tomaz et al. (unverified): three agile teams, no change in
commit volume. Both are underpowered and Stray et al. trimmed at the 95th percentile — but the
toolkit's own design assumes the signal is loud enough to see in a single repository's history, and
these studies could not see it in 39 developers and 26,317 commits.

**6. Commit sprawl does not rise, on the largest corpus with a pre-AI window.** Daniotti et al.:
multi-file commit counts and total commit counts both rise ~3.6% at 29% AI use, so the *share* of
multi-file commits is flat. Robbes et al. agree on the level: median files per commit is 2 for both
human and AI-assisted commits. **Whatever AI is doing to commit shape, it is making commits longer,
not obviously wider. A toolkit that weights `avg_files_per_commit` and sprawl percentage as heavily as
commit size is measuring the dimension that moves least.**

**7. METR's warning about the toolkit's entire metric class.** Section 1.1 of the METR paper: lines of
code, commit counts, and PR counts are *not fixed in advance*, so AI can move them without
productivity or scope changing. Verbose-but-equivalent code inflates line counts; task splitting
deflates commit size. **Every metric this toolkit computes is in that class.** This does not make them
worthless as drift *signals*, but a threshold breach cannot be read as a quality claim, and the
documentation should say so.

**8. The effect attenuates, and possibly reverses, with time.** He et al.: velocity gains are
concentrated in months 1-2 post-adoption and dissipate (commits +55.4% month 1, +14.5% month 2, then
nothing; lines added +281.3% month 1, +48.4% month 2). METR's 2026 follow-up puts the slowdown at −4%
for newly recruited developers with a CI spanning zero, against −19% in 2025. **Any threshold
calibrated on 2026 measurements is calibrated on a moving target, and the direction of the movement is
not settled.**
## RQ9: Outcome anchoring

**Verdict**: direction only

There is a large, mature body of research linking commit-level practice metrics to measured outcomes.
It is the just-in-time (JIT) defect prediction literature, and it is real, replicated, and directly
about git-shaped data. But it yields **model coefficients and predictive performance, never
thresholds**. Across every primary source read for this question, not one publishes a boundary value
for commit size, files touched, or any other commit-shape metric above which a change is "unhealthy".
Several publish findings that make such a boundary *unlikely to exist* in transferable form.

The single most important result for this project is not a confirmation. It is that the same
literature that establishes the direction (bigger, more diffuse changes are riskier) also establishes
that the *strength* of that relationship is unstable across projects and unstable over time within one
project.

### Sources

#### 1. Kamei et al. (2013) — the canonical JIT study. Coefficients, not thresholds.

Yasutaka Kamei, Emad Shihab, Bram Adams, Ahmed E. Hassan, Audris Mockus, Anand Sinha, Naoyasu
Ubayashi. "A Large-Scale Empirical Study of Just-in-Time Quality Assurance." *IEEE TSE*
39(6):757-773, June 2013. DOI 10.1109/TSE.2012.70. Free author copy:
https://posl.ait.kyushu-u.ac.jp/~kamei/publications/Kamei_TSE2013.pdf (accessed 2026-08-18).

Corpus and method: six open-source projects (Bugzilla, Columba, Eclipse JDT, Eclipse Platform,
Mozilla, PostgreSQL) and five unnamed commercial projects, >250,000 changes, C/C++ and Java. Periods
range from 3.7 years (Columba) to 13.8 years (PostgreSQL). CVS single-file commits grouped into
"changes" by same-author/same-message/200-second window. Fourteen change-level factors in five
dimensions feed a logistic regression, 10-fold cross-validated, with a fixed classification cut-off of
0.5 on the model's output probability.

The metric definitions (Table 1, p. 760): NS = number of modified subsystems, ND = number of modified
directories, NF = number of modified files, Entropy = normalised distribution of modified lines across
files, LA = lines added, LD = lines deleted, LT = lines of code in a file *before* the change, FIX =
boolean, NDEV/AGE/NUC = history factors, EXP/REXP/SEXP = author experience.

The outcome: "defect-inducing change", identified by SZZ. Section 4.3: for Columba and PostgreSQL the
authors used *approximate* SZZ (ASZZ) with no bug-tracker link at all, because "the defect identifiers
are not referenced in the change logs". For the commercial C-5 project the labels came from human
root-cause analysis instead.

Unit and population of every number:

| Figure | Unit | Population |
|---|---|---|
| 68% accuracy, 34% precision, 64% recall | classification rates on individual changes | all 11 projects, averaged, 10-fold CV |
| "20 percent of the effort can detect on average 35 percent of all defect-inducing changes" (Section 5.2) | percentage of defect-inducing changes caught, where "effort" = cumulative lines modified | all 11 projects, effort-aware model |
| Defect-inducing change rate: 36% (Bugzilla), 31% (Columba), 14% (JDT), 14% (Platform), 5% (Mozilla), 25% (PostgreSQL), OSS median 20% (Table 2) | share of *changes* that induce ≥1 defect | per project, whole history |
| Avg LOC per change: OSS median 86.7; COM median 16.6 (Table 2) | project-level **mean** lines per change | per project, whole history |
| Avg files per change: OSS median 4.4; COM median 2.0 (Table 2) | project-level **mean** files per change | per project, whole history |
| NF odds ratios 2.95 / 3.00 / 2.62 / 3.07 / 4.29 / 5.61 (OSS), 1.62 / 1.33 / 4.26 / 2.10 / 1.87 (COM) (Table 6) | multiplicative change in the *odds* of a change being defect-inducing, per one unit of the **log-transformed** factor | per project |

> "We also found that a change-level prediction model can predict changes as being defect prone or not
> with 68 percent accuracy, 34 percent precision, and 64 percent recall. Furthermore, when factoring
> in the effort required to review the changes into our predictions, we found that using only 20
> percent of all effort suffices to identify 35 percent of all predicted defect-inducing changes."
> — Section 8, Conclusions

How the "threshold" in the paper is actually used — a classifier cut-off, not a metric boundary:

> "We use a threshold value of 0.5, which means that if the model-predicted probability of a defect is
> greater than 0.5, the change is classified as defect inducing; otherwise, it is classified as
> non-defect-inducing." — Section 4.4

**Relationship type: model coefficient (odds ratio), plus a classifier cut-off on predicted
probability. Not a threshold on any metric.**

#### 2. Kamei et al. (2013), Tables 6 and 7 — the contradiction inside the canonical study

The same paper shows the sign of the effect flipping between models and between populations.

- Number of files (NF) is risk-**increasing** in all 11 projects in the plain model (Table 6, "All"
  column: 11 positive, 0 negative), but in the effort-aware model (Table 7) NF is 6 positive / 4
  negative overall and **negative in all four disclosed commercial projects** (−0.07, −0.06, −0.07,
  −0.06).
- Entropy (spread of change across files) is risk-**decreasing** in the OSS projects: Table 6 "All"
  column reads 1 positive, 5 negative.
- Author experience (EXP) is 3 positive, 3 negative. Subsystem experience (SEXP) is 3 and 3.

> "We also find that the diffusion factors are consistently important in RQ1 and RQ2 for commercial
> projects, but have a different effect in RQ1 and RQ2 (risk-increasing and -decreasing,
> respectively)." — Section 5.3 summary box

> "A factor (independent variable) in a regression model can only be interpreted conditionally on the
> values of other factors. The same factor may have a positive or a negative influence depending on
> what other factors are in the model." — Section 6.1

**That last sentence is fatal to reading a single metric's coefficient as a standalone rule. The
toolkit scores each metric independently against its own band. This paper says the sign of a metric's
effect is not defined outside the model it sits in.**

#### 3. Śliwerski, Zimmermann, Zeller (2005) — the origin of "fix-inducing changes are large"

Jacek Śliwerski, Thomas Zimmermann, Andreas Zeller. "When Do Changes Induce Fixes?" *MSR '05*,
pp. 1-5. DOI 10.1145/1083142.1083147. Free copy:
https://thomas-zimmermann.com/publications/files/sliwerski-msr-2005.pdf (accessed 2026-08-18).

Corpus and method: all changes and bugs in Eclipse and Mozilla up to 20 January 2005: 78,954
transactions (278,010 revisions) for Eclipse, 109,658 transactions (392,972 revisions) for Mozilla.
"Transaction" = grouped CVS commit. Fix-inducing changes located by the original SZZ procedure.

> "In our first experiment, we examined if the span of the transaction (i.e. the number of files
> touched) correlates with the fact that the transaction is fix-inducing." — Section 5.1

> "Additionally, Table 3 shows that fix-inducing transactions are roughly three times larger than non
> fix-inducing transactions." — Section 5.1

Unit and population: Table 3 (Eclipse), all-rows: fix-inducing transactions average **7.49 files ±
44.37**; non-fix-inducing **2.61 ± 13.66**. Table 4 (Mozilla): **5.19 ± 34.12** vs **1.97 ± 10.13**.
Unit = number of files touched per transaction. Population = all transactions in the project history.

**This is where the "large commits are risky" claim comes from, and it is a mean with a standard
deviation six times its own size.** A distribution that skewed supports a direction and nothing else.
There is no percentile in the paper, no cut-off, and no recommendation of a file count.

#### 4. McIntosh and Kamei (2018) — JIT model properties drift; fixed thresholds are undermined

Shane McIntosh, Yasutaka Kamei. "Are Fix-Inducing Changes a Moving Target? A Longitudinal Case Study of
Just-In-Time Defect Prediction." *IEEE TSE* 44(5):412-428, 2018. DOI 10.1109/TSE.2017.2693980. Author
pre-print: https://rebels.cs.uwaterloo.ca/papers/tse2017_mcintosh.pdf (accessed 2026-08-18).

Corpus and method: 37,524 changes: Qt (06/2011-03/2014, 25,150 changes, 2,002 defective, 8%) and
OpenStack (11/2011-02/2014, 12,374 changes, 1,616 defective, 13%) — Table 1. Changes sliced into
three-month and six-month development periods; a JIT model trained on each period and tested on every
later period. SZZ labels, filtered with da Costa et al.'s evaluation framework.

> "(a) the discriminatory power (AUC) and calibration (Brier) scores of JIT models drop considerably
> one year after being trained; (b) the role that code change properties (e.g., Size, Experience) play
> within JIT models fluctuates over time; and (c) those fluctuations yield over- and underestimates of
> the future impact of code change properties on the likelihood of inducing fixes." — Abstract

> "After one year, our JIT models typically lose 11-22 and 14-34 percentage points of their
> discriminatory power (AUC) in the QT and OPENSTACK systems, respectively." — Section 1, RQ1

> "The Size family of code change properties is a consistent contributor of large importance scores.
> However, the magnitude of these importance scores fluctuates considerably, ranging between 10%-43%
> and 3%-37% of the period-specific explanatory power of our QT and OPENSTACK JIT models,
> respectively." — Section 1, RQ2

**The data-volume requirement, which is the transferability killer for this toolkit:**

> "We analyze period lengths of three and six months, since we find that at least three months are
> needed for our studied systems to accrue a substantial amount of data (i.e., 1,721-2,984 changes in
> QT and 831-2,094 in OPENSTACK), while still yielding enough time periods to study trends" — Section 3

> "JIT models should be retrained to include data from at most three months prior to the testing
> period." — Section 5, suggestion (1)

**Relationship type: model coefficient stability analysis. Explicitly argues against fixed values.**

#### 5. Kamei et al. (2016) — change-level models do not transfer across projects

Yasutaka Kamei, Takafumi Fukushima, Shane McIntosh, Kazuhiro Yamashita, Naoyasu Ubayashi, Ahmed E.
Hassan. "Studying just-in-time defect prediction using cross-project models." *EMSE* 21(5):2072-2106,
2016. DOI 10.1007/s10664-015-9400-x. Author pre-print:
https://rebels.cs.uwaterloo.ca/papers/emse2016_kamei.pdf (accessed 2026-08-18).

Corpus and method: 11 OSS projects, median 32,866 changes per project, median 24% defect-inducing. All
110 train-on-A / test-on-B combinations evaluated by AUC, against within-project 10-fold CV as
baseline.

> "we find that while JIT models rarely perform well in a cross-project context, their performance
> tends to improve when using approaches that: (1) select models trained using other projects that are
> similar to the testing project, (2) combine the data of several other projects to produce a larger
> pool of training data, and (3) combine the models of several other projects to produce an ensemble
> model." — Abstract

**Table 6, p. 13.** Within-project AUC (the diagonal) runs **0.74 to 0.83**. Off-diagonal cross-project
AUC falls as low as **0.38** (Bugzilla model tested on Maven-2) — *worse than random*. Other lows: 0.47
(Bugzilla→Gimp, Columba→Gimp), 0.49 (Columba→Perl), 0.50 (Bugzilla→PostgreSQL), 0.51 (Bugzilla→Ruby).

The paper also reports, at Section 2, the strongest published transferability result at module level:
Zimmermann et al. (2009) found that "of the 622 cross-project combinations, only 21 produce acceptable
results". *Primary flagged INACCESSIBLE below; this figure is a secondary restatement.*

#### 6. Alves, Ypma and Visser (2010) — benchmark-derived thresholds ARE a published method

Tiago L. Alves, Christiaan Ypma, Joost Visser. "Deriving Metric Thresholds from Benchmark Data." *ICSM
2010*, pp. 1-10. DOI 10.1109/ICSM.2010.5609747. Free copy:
https://webarchive.di.uminho.pt/wiki.di.uminho.pt/twiki/pub/Personal/Joost/PublicationList/AlvesYpmaVisserICSM2010.pdf
(accessed 2026-08-18).

**This answers the methodological half of the question: yes, this project's
percentile-from-reference-repositories approach has a published method behind it.**

Corpus and method: 100 object-oriented systems (82 Java, 18 C#; 77 proprietary from SIG customers, 23
open source), 3K to 800K LOC each, ~12 MLOC total, across 19 ISBSG functional domains. Six steps
(Figure 2): extract metric + LOC weight per entity → normalise each entity's weight to a share of *its
own system's* LOC → aggregate into a weighted histogram per system → aggregate across systems → order
metric values and take the maximum value representing 1%…100% of weight → read the threshold off
chosen quantiles.

> "6. thresholds derivaton: thresholds are derived by choosing the percentage of the overall code we
> want to represent. For instance, to represent 90% of the overall code for the McCabe metric, the
> derived threshold is 14." — Section IV

> "As a final example, the SIG uses thresholds derived by choosing 70%, 80% and 90% of the overall
> code, which derive thresholds 6, 8 and 14, respectively. … Furthermore, these percentiles are used in
> quality profiles to characterize code according to four categories: low risk (between 0−70%),
> moderate risk (70−80%), high risk (80−90%) and very-high risk (> 90%)." — Section IV

Unit and population: Table IV — thresholds at the 70/80/90 quantiles of *LOC-weighted* pooled
distributions: Unit complexity 6/8/14; Unit size 30/44/74 LOC; Module inward coupling 10/22/56; Module
interface size 29/42/73. Population = 100 systems' pooled entity-level measurements.

**Critically, Alves says explicitly that this method does NOT produce outcome-validated numbers:**

> "In contrast to using errors to derive thresholds, our methodology derives meaningful thresholds
> which represent overall volume of code from a benchmark of systems." — Section II-C

> "Empirical studies to validate software metrics with external qualities, using metric thresholds,
> such as the one from Luijten et al. [24] are foreseen." — Section IX-D, Future work

And in the same related-work section, Alves reports two prior studies that found **no evidence for a
threshold model of faults at all**:

> "The studies of Benlarbi et al. [10] and El Eman et al. [11] show that there is no empirical evidence
> for the threshold model used to predict faults." — Section II-C

*(Benlarbi, El Emam, Goel, Rai, "Thresholds for object-oriented measures", ISSRE 2000; El Emam,
Benlarbi, Goel, Melo, Lounis, Rai, "The optimal class size for object-oriented software", IEEE TSE
28(5):494-509, 2002. Not read in the original — reported here as Alves characterises them.)*

**Relationship type: a threshold-derivation METHOD, outcome-agnostic by the authors' own statement.**

#### 7. Foucault et al. (2014) and Zhang et al. (2013) — thresholds do not generalise across contexts

Matthieu Foucault, Marc Palyart, Jean-Rémy Falleri, Xavier Blanc. "Computing Contextual Metric
Thresholds." *SAC 2014*, pp. 1120-1125. DOI 10.1145/2554850.2554997. Open access: HAL hal-00911762
(accessed 2026-08-18).

> "Recently, Zhang et al. have shown that thresholds depend on context and therefore cannot be
> generalized to all kinds of software systems [27]. In particular, the programming language or the
> domain of application are contexts that have a strong impact on the thresholds. This further
> strengthens the results of Nagappan et al. who have shown that thresholds obtained by performing a
> correlation analysis are only true for a limited set of similar software systems [21]." — Section 1

Foucault's own method, validated on GitHub Java projects, uses double sampling plus bootstrap quantiles
precisely because a fixed benchmark cannot serve all contexts.

The cited primary is Feng Zhang, Audris Mockus, Ying Zou, Foutse Khomh, Ahmed E. Hassan. "How Does
Context Affect the Distribution of Software Maintainability Metrics?" *ICSM 2013*, pp. 350-359. DOI
10.1109/ICSM.2013.46 (verified via Crossref). Its reported design: 320 non-trivial SourceForge systems
sampled from nine application domains, 39 maintainability metrics, Kruskal-Wallis and Mann-Whitney U
tests against six context factors; all six factors affect 20 metrics and programming language affects
35 of 39. **INACCESSIBLE — the design description is abstract-level and the effect magnitudes are
unverified.** The Foucault quote above is a primary-source restatement that was read directly.

#### 8. McIntosh et al. (2014) — the closest thing to an outcome-anchored boundary, and it is not about commit shape

Shane McIntosh, Yasutaka Kamei, Bram Adams, Ahmed E. Hassan. "The Impact of Code Review Coverage and
Code Review Participation on Software Quality: A Case Study of the Qt, VTK, and ITK Projects." *MSR
2014*, pp. 192-201. DOI 10.1145/2597073.2597076. Author copy:
https://rebels.cs.uwaterloo.ca/papers/msr2014_mcintosh.pdf (accessed 2026-08-18). MSR 2014
distinguished paper.

Corpus and method: four releases: Qt 5.0.0 (5.56 MLOC, 1,339 components, 254 with defects, 10,163
commits), Qt 5.1.0 (1,337 components, 187 with defects), VTK 5.10.0 (170 components, 15 with defects),
ITK 4.3.0 (218 components, 24 with defects) — Table 1. Multiple Linear Regression per release,
dependent variable = post-release defect count per component, controlling for size, complexity, prior
defects, churn, entropy, and four ownership metrics.

The outcome definition, spelled out:

> "we define post-release defects as those with fixes recorded in the six-month period after the
> release date." — Section 3.2

The near-threshold results (Section 4, RQ2):

> "Figure 4 shows that Qt 5.0.0 components with a proportion of self-approved changes of 0.84 or higher
> are estimated to contain five additional post-release defects. To put this in perspective, a
> post-release defect count of five corresponds to the 95th percentile of the observed post-release
> defect counts in Qt 5.0.0, and the 70th percentile of Qt 5.0.0 components with at least one
> post-release defect. Components where the proportion of changes without discussion is above 0.71 are
> estimated to have at least two post-release defects in both of the studied Qt releases, while those
> Qt 5.0.0 components with a proportion above 0.9 are estimated to have at least three post-release
> defects."

Unit and population: 0.84 and 0.71 are *proportions of a component's integrated changes* that were
self-approved / had no reviewer discussion. The outcome is *count of post-release defects in that
component within six months of release*. Population = 1,339 components of Qt 5.0.0.

**Relationship type: model coefficient, read off a fitted response curve.** These are not derived
thresholds — they are the x-values at which a regression's predicted y crosses an integer. They are
also single-release, single-project, and the paper's own RQ1 summary is careful: code review coverage
"only provides significant explanatory power to two of the four studied releases".

**Applicability: these are *review-process* metrics (self-approval rate, discussion rate, review
speed), not commit-shape metrics. The toolkit measures none of them.**

#### 9. Luijten and Visser (2010) — maintenance outcome linked to Alves-style thresholds

Bart Luijten, Joost Visser. "Faster Defect Resolution with Higher Technical Quality of Software." *SQM
2010*. Journal version: *Software Quality Journal* 20:265-285, DOI 10.1007/s11219-011-9140-0.
Workshop PDF:
https://webarchive.di.uminho.pt/wiki.di.uminho.pt/twiki/pub/Personal/Joost/PublicationList/SQM2010-FasterDefectResolution.pdf
(accessed 2026-08-18).

Corpus and method: 10 open-source projects, 107 code snapshots (44 KLOC Checkstyle to 1.2 MLOC
WebKit), >61,000 issues of which ~50,000 defects, reduced after cleaning to ~9,000 closed/resolved
defects. Spearman rank correlation, one-sided, between SIG maintainability ratings (computed using
Alves-derived thresholds) and a defect-resolution-speed rating.

Results, Table II: Volume ρ=0.29 (p=0.003), Duplication ρ=0.31 (p=0.002), Unit size ρ=0.51, Unit
complexity ρ=0.51, **Unit interfacing ρ=−0.14 (p=0.897, not significant)**, Module coupling ρ=0.51,
Analysability ρ=0.51, Changeability ρ=0.64, Stability ρ=0.41, Testability ρ=0.53, Maintainability
ρ=0.62.

Unit and population: ρ is a rank correlation over 107 *snapshots*, not over defects or commits. The
dependent variable is a *rating* of aggregated defect resolution duration, not effort.

The key admission, on why measured maintenance cost is not available:

> "Properties of maintenance activities that one would like to quantify include their effectiveness (Do
> defects get solved correctly?) and their efficiency (How much maintenance effort is invested?).
> Unfortunately, reliable data regarding correctness and effort of fixes is notoriously hard to come
> by, simply because they are usually not recorded." — Section I

**Relationship type: correlation. The metrics are source-code metrics, not commit metrics.** This is
the only source found where an Alves-derived threshold set has been validated against *any* external
outcome, and the outcome is issue-tracker resolution time as a stand-in for effort.

#### 10. Rosa et al. (2021) — how much noise the outcome label carries

Giovanni Rosa, Luca Pascarella, Simone Scalabrino, Rosalia Tufano, Gabriele Bavota, Michele Lanza,
Rocco Oliveto. "Evaluating SZZ Implementations Through a Developer-Informed Oracle." *ICSE 2021*,
pp. 436-447. DOI 10.1109/ICSE43902.2021.00049. arXiv:2102.03300 (accessed 2026-08-18).

Corpus and method: commits mined March 2011 - April 2020; 3,585 candidate commits manually validated
down to **1,930 bug-fixing commits in 1,625 repositories** where the developer explicitly named the
bug-inducing commit in the fix message. Nine SZZ variants run against this developer-informed oracle.

Table V results (oracle_all, with issue-date filter):

| Variant | Recall | Precision | F1 |
|---|---|---|---|
| B-SZZ (the original Śliwerski algorithm, and Kamei 2013's labeller) | 0.69 | **0.42** | 0.53 |
| AG-SZZ | 0.60 | 0.49 | 0.54 |
| R-SZZ (best) | 0.57 | **0.73** | 0.64 |
| SZZ@UNL | 0.72 | 0.09 | 0.16 |

Unit and population: precision/recall over the 1,930-commit developer-informed oracle; unit =
individual bug-inducing commit.

**Meaning for RQ9.** Roughly **58% of the "defect-inducing changes" identified by the original SZZ are
false positives** against developers' own accounts. Every coefficient in sources 1, 4 and 5 is
estimated against a label of about that quality. This does not invalidate the direction of the
findings, but it caps how sharp any derived boundary could ever be.

### What this does and does not support

What the literature supports:

1. **A direction, robustly.** More files touched raises the probability that a change induces a later
   fix. The single most consistent finding in the corpus: NF is risk-increasing in 11 of 11 projects in
   Kamei et al. Table 6, and fix-inducing transactions touch ~3× more files than others in both Eclipse
   and Mozilla. The toolkit's *ordering* (fewer files is better) is defensible.
2. **A relative-churn direction.** LA/LT is risk-increasing in 10 of 11 projects (Kamei Table 6), with
   odds ratios from 2.74 to 20.43. The nearest published relative to the net-additions-ratio metric —
   but LA/LT normalises by *file size*, not by deletions, so it is not the same quantity and the odds
   ratios cannot be carried over.
3. **A published method for this project's calibration approach.** Alves et al. (2010) legitimises
   deriving thresholds from a benchmark of reference systems at chosen quantiles. It should be cited.
   Filed as `code-quality-metrics-9j5`.
4. **A defensible framing for what a benchmark band means.** Alves says outright that such thresholds
   "represent overall volume of code from a benchmark of systems", and lists outcome validation as
   future work. **That is exactly the claim the documentation should make and no more.**

What the literature does not support:

1. **Any numeric boundary for commit size, files changed, test ratio, message quality, or duplication
   share.** Not one appears in any primary source read. Kamei's "0.5" is a classifier probability
   cut-off. Alves's 6/8/14 are McCabe values at code-volume quantiles with no outcome behind them.
   McIntosh's 0.84 and 0.71 are curve read-offs on review-process metrics the toolkit does not measure.
2. **Independent per-metric scoring.** Kamei et al. state that a factor's sign is only interpretable
   conditional on the other factors in the model, and demonstrate NF flipping sign between two models on
   the same data.
3. **Transfer of any of this to a small repository over a 30-90 day window.** McIntosh and Kamei needed
   831-2,984 changes to fill a *single* three-month period, and reported that even six-month periods
   produce importance scores that swing by tens of percentage points. Kamei et al. (2016) show
   within-project AUC of 0.74-0.83 collapsing to as low as 0.38 cross-project. Every corpus in this
   literature is a multi-year, multi-thousand-commit history. **A 30-90 day window on a small repository
   sits below the data volume at which any of these papers were willing to fit a model, let alone read a
   boundary off one.**
4. **Any commit-level link to DORA-style delivery outcomes.** Nothing was found that connects commit
   shape to change failure rate, deployment frequency, time to restore, or incident count at the commit
   level. DORA's own instruments measure these at the survey/team level.
5. **Any maintenance-cost study with measured effort.** Luijten and Visser wanted exactly this and
   stated plainly that effort data "is notoriously hard to come by, simply because [it is] usually not
   recorded".

### Search record

Databases and indexes: Crossref REST API (used to verify every DOI reported above), arXiv, Semantic
Scholar, ACM Digital Library, IEEE Xplore, HAL, ZORA (U. Zurich), TU Delft repository, U. Minho web
archive, CiteSeerX, and the SAIL/REBELS/SWAG lab publication pages at Queen's, Waterloo, McGill and
Kyushu.

Terms: just-in-time defect prediction; JIT quality assurance; fix-inducing changes; bug-inducing
commit; SZZ evaluation oracle; change-level defect prediction; cross-project defect prediction; code
review coverage post-release defects; deriving metric thresholds benchmark; contextual metric
thresholds; threshold generalisation software metrics; commit size change failure rate; commit size
rollback revert production incident; maintenance effort technical quality issue resolution.

Read in full or in substantial part: Kamei et al. TSE 2013 (all sections, Tables 1, 2, 6, 7 read as
page images); McIntosh & Kamei TSE 2018 (abstract, RQ summaries, Table 1, Section 3, Section 5); Kamei
et al. EMSE 2016 (abstract, Sections 1-4, Tables 1 and 6); Śliwerski et al. MSR 2005 (Sections 4-5,
Tables 3-6); Alves et al. ICSM 2010 (all); Foucault et al. SAC 2014 (Sections 1, 4, 5, 6); McIntosh et
al. MSR 2014 (abstract, Sections 1-4, Table 1); Rosa et al. ICSE 2021 (Sections 1-3, Tables III and
V); Luijten & Visser SQM 2010 (all).

INACCESSIBLE:

- Zhang, Mockus, Zou, Khomh, Hassan, ICSM 2013, DOI 10.1109/ICSM.2013.46. Tried CiteSeerX (returned an
  HTML shell twice, once with certificate verification disabled); ieeexplore.ieee.org (empty content —
  paywalled); feng-zhang.com (404); swat.polymtl.ca (404); sail.cs.queensu.ca (404). Its central claim
  is reported here only via Foucault et al.'s primary restatement.
- Zimmermann, Nagappan, Gall, Giger, Murphy, "Cross-project defect prediction", ESEC/FSE 2009, DOI
  10.1145/1595696.1595713. Tried zora.uzh.ch, thomas-zimmermann.com, two Microsoft Research paths,
  CiteSeerX, a Tufts course mirror — all returned HTML, not PDF; ResearchGate returned HTTP 403. The
  "21 of 622 combinations" figure is reported here **only as restated in Kamei et al. 2016 Section 2**.
- Benlarbi et al. ISSRE 2000 and El Emam et al. TSE 2002 were not retrieved; reported only as Alves et
  al. characterise them.

### Contradictions

**1. The literature does not merely fail to supply thresholds — parts of it argue thresholds cannot
exist in transferable form.** Alves et al. report that Benlarbi et al. and El Emam et al. "show that
there is no empirical evidence for the threshold model used to predict faults". Foucault et al. open by
stating thresholds "depend on context and therefore cannot be generalized to all kinds of software
systems", citing Zhang et al.'s 320-system study.

**2. A metric's effect can reverse sign depending on the model and the population.** Kamei et al. Table
6 vs Table 7: number of files is risk-increasing in all 11 projects in the plain model and
risk-*decreasing* in all four disclosed commercial projects in the effort-aware model. Entropy is
risk-decreasing in five of six OSS projects. Author experience is positive in three and negative in
three. **The toolkit's independent per-metric verdicts assume a stability the source literature
explicitly denies.**

**3. The relationship drifts inside a single project within a year.** McIntosh & Kamei: 11-34 AUC
percentage points lost after one year; the Size family's share of explanatory power swings 10-43% in Qt
and 3-37% in OpenStack. **A band frozen in `lib/thresholds.js` is exactly the artefact this paper warns
against.**

**4. Models fitted on one project routinely perform worse than random on another.** Kamei et al. 2016
Table 6: 0.38 AUC for the Bugzilla model on Maven-2, against 0.74-0.83 within-project. **If a fitted
multivariate model fails to transfer between two mature OSS projects, a single scalar band derived from
six reference repositories has substantially less claim to transfer to an arbitrary seventh.**

**5. The outcome label itself is roughly 58% noise under the algorithm most of this work used.** Rosa
et al.: the original B-SZZ achieves 0.42 precision against a developer-informed oracle of 1,930 fixes.

**6. This project's calibration is not just circular — it is under-powered relative to the published
method it resembles.** Alves used 100 systems and ~12 MLOC; this project uses six repositories. The
method is legitimate; this instantiation of it supports a much weaker claim than Alves's does, and
Alves's own claim is already explicitly *not* an outcome claim.

**7. An unsourced DORA attribution remains in the specification.** `metrics-specification.md` line 298
describes the net-additions-ratio metric as capturing "the systematic batch-acceptance pattern DORA
associates with architectural debt accumulation". That attribution was not located in any DORA report
during this review. It has the shape of the four figures already withdrawn from this project and should
be traced or dropped. Noted on `code-quality-metrics-w6g`.

**Bottom line for the calibration question.** Linking a practice metric to a measured outcome would
indeed break the circularity, and the JIT literature is where that link exists. But it delivers
coefficients over multi-year, multi-thousand-commit corpora with ~58%-noisy labels, and it reports that
those coefficients neither transfer between projects nor hold still within one. It cannot be converted
into a band for a small repository over 30 to 90 days. **The honest position is Alves's: publish the
bands as benchmark quantiles that say "unusual relative to these peers", cite Alves et al. (2010) as
the method, and state that outcome validation has not been done — by this project or, at commit-shape
granularity, by anyone.**
