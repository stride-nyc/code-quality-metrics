# Research brief: evidence for commit-level quality thresholds

## What you are being asked to do

This toolkit measures AI code drift from git history and classifies repositories against
numeric thresholds. **None of those thresholds has a published source.** They were set by
judgement, and bands are currently being derived by measuring six reference repositories,
which is circular: the references were chosen because they are considered disciplined, and
healthy was then defined as what they do.

Find out whether published research supplies defensible numbers instead, or establishes that
none exist.

A negative result is a genuine deliverable. "No published study gives a boundary for X, and
here is where I looked" is more useful than a plausible number with no provenance, because it
tells us to stop searching and defend the empirical approach openly.

## Evidentiary standard

Include a source only if it meets all three:

1. **Cited and locatable.** Peer-reviewed paper, conference proceeding, thesis, preprint with
   methodology, or industry research that states its corpus and method. Give the full
   citation and a stable identifier: DOI, arXiv ID, ISBN, or a URL plus access date.
2. **Method stated.** What was measured, over what corpus, how large, across what period,
   and how the measurement was made. A number whose method is not described cannot be
   evaluated or reproduced.
3. **Verifiable by a reader.** A quote or table a reader can turn to and check. Paraphrase is
   not evidence.

**Reject, and say why if a rejected source is widely repeated:**

- Blog posts citing other blog posts, with no traceable origin
- Vendor marketing figures with no stated corpus or method
- Numbers presented without a denominator or population
- Secondary summaries when the primary is reachable
- Any figure you cannot trace to a first source

**Three verdicts, never merged:** CONFIRMED with quote and location, NOT FOUND after a stated
search, and INACCESSIBLE with the URL and how it failed. Absence of evidence and refutation
are different findings.

**Always record the unit and population.** A number without its denominator is unusable. This
project already made that mistake: GitClear reports 6.66 percent duplication, but the
denominator is *commits containing a duplicate block*, not *share of lines duplicated*, so it
cannot seed a threshold on lines. Every figure you return needs its unit spelled out.

## Do not repeat work already done

These have been searched directly, as extracted PDF text rather than web summaries, and
**contain no numeric boundary for any git-derived metric**:

| Source | Result |
|---|---|
| DORA, *State of AI-Assisted Software Development 2025* | Scores batch size from three self-reported survey items on an ordinal scale, extremely low to extremely high. Never converts to a line or file count. |
| DORA, *Accelerate State of DevOps 2024* and its AI addendum | Gives outcome effects per 25 percent AI adoption increase, including 7.2 percent higher delivery instability, 3.1 percent faster code review. No commit-level boundaries. |
| DORA, 2026 ROI report | Nothing further. |
| GitClear, *AI Copilot Code Quality 2025* | Trend and prevalence figures only: eightfold rise in duplicate blocks during 2024, duplicate-block prevalence 0.70 to 6.66 percent of commits. No share-of-lines figure, no healthy line. |

Four figures previously attributed to DORA in this project appear in none of its reports and
have been withdrawn: a 154 percent increase in pull request size, a 91 percent increase in
code review time, a 9 percent increase in bug rates, and the phrase "volume without
discipline". Two more, 98 percent more pull requests merged per developer and 21 percent more
tasks completed, could not be traced to any source. **Treat any figure resembling these as
suspect until you find its origin.** The 154 percent figure appears to originate with a
vendor's own telemetry rather than DORA.

## Open questions

Ordered by how much a real number would change. For each, state whether research supplies a
boundary, only a direction, or nothing.

### 1. Reviewable change size

The toolkit flags a commit as large above **100 production lines** and bands the rate at 23
percent healthy, 30 percent critical.

Is there evidence for a change size beyond which review effectiveness falls? The code review
literature is the most promising thread here and the figure most often repeated in practice is
a 200 to 400 line ceiling; find its actual origin and method rather than the repetition.
Defect-detection-versus-size studies, and the large industrial review studies from Microsoft,
Google and open source projects, are where to look.

Report: the boundary if one exists, what outcome it was measured against, whether it concerns
a commit or a whole review, and whether production lines were separated from test lines.

### 2. Change scatter across files

Flagged above **5 files**, banded at 19 percent healthy with no critical bound.

Is number of files touched per change established as a defect or maintainability predictor?
Change coupling, logical coupling and co-change literature is the relevant body. Distinguish
studies about *how many* files change from studies about *which* files change together, since
this metric only counts.

### 3. Duplication rate

Currently 3 percent healthy and 10 percent critical, derived from two repositories belonging to
this project's author, and the weakest threshold in the toolkit. Note that
`DUPLICATE_MIN_LINES: 5` matches GitClear's own definition of a duplicate block, the one
parameter here with a primary source behind it.

Clone detection has a long literature with published rates for real systems. Find measured
duplication percentages with their detection method and minimum clone size, since rates are
not comparable across tools or thresholds. Also look for evidence linking duplication level to
defect or maintenance cost, which would justify a boundary rather than just a distribution.

### 4. Code churn and net-new ratio

The toolkit measures the median share of a commit's churn that is net-new rather than edited,
banded at 0.51 healthy and 0.79 critical.

Churn as a defect predictor is, as far as this project knows, the best-established thread in
this whole brief. Relative churn measures in particular have been studied against defect
density. Find whether any study gives a threshold rather than a correlation, and note the
distinction: a correlation supports the metric, only a threshold supports the band.

### 5. Test and production co-change

The toolkit counts commits touching both test and production files, banded at 23 percent
healthy from a single repository's observation. It cannot distinguish test-first from
test-after, only co-occurrence in one commit.

Two questions. Is co-change of test and production code established as a quality signal? And
is there evidence on what proportion of commits *should* touch both, given that many
disciplined projects deliberately land tests and implementation as separate atomic commits,
which this metric penalises?

### 6. Commit message quality

Banded at 60 percent healthy, 40 percent critical, both invented. The metric scores a message
as adequate if it matches conventional commit format or reaches 10 words after trailers are
stripped.

Is there research on commit message quality, what makes a message informative, and any
measured relationship to maintenance outcomes? Also worth knowing whether any study
establishes a word count or structural criterion, since the 10 word rule is arbitrary.

### 7. Distribution boundaries

The toolkit uses p90 of lines changed, banded at 260 healthy with no critical bound, and p90
of files changed at 9.5 healthy and 13 critical.

Does any research support percentile-based boundaries for commit size, or publish commit size
distributions for real projects that could serve as a comparison? Published distributions
would be nearly as useful as boundaries.

### 8. The pre-AI comparison

The toolkit's central claim is that AI assistance degrades commit-level discipline. Its own
reference measurements are all from 2026, so they may already reflect that drift.

What published work measures commit-level metrics before and after AI assistance, on the same
projects or comparable ones? Note that the studies already on hand disagree: a randomised
trial found AI *increased* completion time by 19 percent for experienced developers on their
own repositories, while a single-task trial with recruited freelancers found a 55.8 percent
speedup. Find what else exists, and be careful to report study design and population, since
those two are not measuring the same thing.

### 9. Outcome anchoring

Every threshold here measures *practice*. None is validated against an *outcome*: defect rate,
incident frequency, delivery stability, maintenance cost.

Is there research linking any commit-level practice metric to a measured outcome? This is the
question that would most improve the toolkit, because it is the only route out of the
circularity described at the top.

## Sources already on hand

Primary PDFs are held locally and may contain relevant material beyond the DORA and GitClear
reports already searched:

```
/Users/kenjudy/Library/Mobile Documents/iCloud~md~obsidian/Documents/Ken Judy, LLC
```

Notable: a randomised controlled trial of AI assistance on experienced open source developers
(arXiv:2507.09089), the GitHub Copilot productivity trial (arXiv:2302.06590), an NBER working
paper on productivity effects across generations of AI coding tools (WP 35275), a SonarSource
analysis of AI-accelerated codebases, and a paper on inconsistent software clones. Check these
before searching outward.

## Output

For each of the nine questions:

- **Verdict**: boundary available / direction only / nothing found
- **Sources**, full citations with stable identifiers, and a verbatim quote for each figure
- **Unit and population** for every number, without exception
- **Method and corpus size**, so a reader can judge transferability
- **Applicability**: whether the finding transfers to git commit history specifically, and
  whether it predates widespread AI assistance
- **Search record** where nothing was found: databases, terms, and what you read

Then, across all nine:

- Which thresholds could be replaced by a sourced number, and what that number would be
- Which must remain empirical, so the project can defend that openly rather than by omission
- Any finding that contradicts this toolkit's premises. That is the most valuable thing you
  could return, and it should be reported as prominently as a confirmation.

Do not soften a negative result, and do not fill a gap with a plausible number. The purpose is
to establish what is known, not to furnish justification for numbers already chosen.
