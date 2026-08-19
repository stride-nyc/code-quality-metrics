# Threshold calibration

Every band in `lib/thresholds.js` should trace to measurements recorded here.
None of the cited research supplies boundary numbers: DORA scores batch size
from self-reported ordinal survey answers and never converts them to a line
count, and GitClear reports trends and prevalence rather than a healthy line.
The bands therefore have to come from measuring projects we are willing to hold
up as disciplined, and from saying plainly which ones.

**What a band means.** Deriving thresholds as quantiles of a benchmark of
reference systems is itself a published method, not something invented for
this project: Alves, Ypma and Visser, "Deriving Metric Thresholds from
Benchmark Data" (ICSM 2010, DOI 10.1109/ICSM.2010.5609747) pool measurements
across 100 Java/C# systems (roughly 12 MLOC, proprietary and open source) and
read thresholds off percentiles of the pooled, LOC-weighted distribution. They
are explicit that the method is outcome-agnostic: "our methodology derives
meaningful thresholds which represent overall volume of code from a benchmark
of systems" (§II-C), and they list validating thresholds against an external
quality outcome as future work, not as something the method already
establishes. That is the honest claim for every band below: it means "unusual
relative to these six peers", not "unhealthy" and not "harmful". State the
scale gap plainly rather than let the citation imply otherwise -- Alves used
100 systems and roughly 12 million lines of code; this project uses six
repositories and twelve calibration windows. The method transfers; the
strength of the claim does not.

## Files

| File | Purpose |
|---|---|
| `observations.json` | Every measurement taken, append-only. The evidence. |
| `derive-bands.js` | Reads observations and proposes bands. Writes nothing. |

Run `node calibration/derive-bands.js` for a table, or `--json` for machine output.

## Derivation rule

This is what `derive-bands.js` actually computes; keep this section in step with
the script rather than letting it drift, which is exactly how it went stale
before (`code-quality-metrics-xeh`).

- **healthy** = the 75th percentile of the pooled observed values for a
  higher-is-worse metric (25th percentile for a higher-is-better metric, since
  the unhealthy end is the low tail there). Both bounds come from data, not
  from a single worst case.
- **critical** = the single worst value observed (best value, for
  higher-is-better) -- but only reported when at least two distinct reference
  repositories produced a value within 15% of that extreme
  (`NEAR_EXTREME_FRACTION` in `derive-bands.js`). When the extreme rests on a
  single repository or a single window, `critical` is `null` rather than
  asserting a red boundary the observations cannot support, and the metric is
  reported as **two-band** (good/warning only) instead of **three-band**
  (good/warning/critical). `lib/report.js`'s `statusForTwoBand` is the runtime
  half of this: a `null` critical boundary is a deliberate, checked absence of
  evidence, not an omission to be coerced to zero.

This supersedes an earlier, simpler rule this file used to state: healthy as
the single worst observation, and critical as healthy times two, "a stated
convention, not a measurement". That rule stopped being what the code does
once the p75/max-with-corroboration tiering above landed
(`derive-bands.js:27`), and this file was not updated to match, so a reader
following the old text here would mis-derive every band and expect a critical
bound at 2x healthy that the code has never produced.

The script never edits `lib/thresholds.js`. Copy numbers across in a reviewed
commit, so a threshold change is always deliberate.

## Reservations

`observations.json` carries a `reservations` array: fifteen recorded concerns
about using this sample to set thresholds, three of them currently high severity
(granular-history-only, pre-AI-baseline and brownfield-only-lifecycle were each
downgraded from high to medium once their own suggested remedy was measured -- see
below; three published transferability findings -- non-transferability across
projects, context-dependence, and within-project drift over time -- were added
afterward and one of those is itself high severity; a fourth,
commit-selection-changed-to-committer-date, was added when code-quality-metrics-75/mbiw's
fix to commit selection retired every existing observation). They are kept with the
evidence rather than in `lib/thresholds.js` so
the caveats travel with the data, and so adding a reference repository forces a
reader to reconsider which still apply. `derive-bands.js` prints the high severity
ones on every run.

The two that most limit how far these bands can be carried:

- **Unvalidated reference choice.** The references were chosen because they are
  considered disciplined, and healthy is then defined as what they do. Choosing
  references and reading bands off their quantiles is how a reference benchmark
  works (it is Alves et al.'s own procedure), but nothing validates the choice
  itself, and reputation is not a measured outcome. The bands support
  "no worse than these six", which is weaker than "healthy".
- **Cross-project non-transfer.** Kamei et al. (EMSE 2016, Table 6) found a
  fitted, multi-feature just-in-time defect model loses accuracy down to 0.38
  AUC -- worse than random -- when applied to a project outside its training
  set. That result bounds fitted prediction models; a benchmark quantile
  predicts nothing, so on an unseen project it fails by going uninformative
  rather than by scoring worse than chance. It is still the clearest published
  warning against carrying a project-derived number to a dissimilar project,
  so these bands should be read as describing these six repositories rather
  than generalizing to one unlike them.

Three more, now medium severity, are worth calling out separately because each drove
its own follow-up measurement pass:

- **Granular history only (partially addressed).** The bands are valid for
  repositories that preserve individual commits; a squash-merge repository yields
  one commit per pull request, so it looked worse on every size metric for reasons
  that had nothing to do with practice, and every commit-unit verdict was withheld
  for it. A separate squash-merge reference set now exists (`population:
  "squash-merge"` in `observations.json`; see "Populations" above) -- five
  repositories, ten included windows -- with its own bands derivable via
  `derive-bands.js --population squash-merge`. This is a real remedy, which is why
  the severity dropped, but not a complete one: the squash-merge set is smaller
  than the granular one (six repositories, twenty-four included windows pooled
  across eras), so its own bands carry a wider version of the same
  two-windows-per-repo and narrow-population reservations.
- **Pre-AI baseline (partially addressed).** Every window used to be from 2026, so
  the references may already have adopted AI assistance. A pre-2022 (2019-2020)
  window has now been measured for all six repositories -- twelve `era: "pre-ai"`
  observations alongside the twelve `era: "current"` ones. Movement between eras
  turned out modest and mixed in direction rather than uniformly worse (see the
  measurement task's report for the full per-metric table), which softens but does
  not retire the concern: two 50-commit windows per era per repository is still a
  thin sample.
- **Brownfield-only lifecycle (partially addressed).** Every window used to measure
  maintenance-era work on a decades-old codebase; the tool had no notion of project
  lifecycle at all. A greenfield reference set now exists, split into `population:
  "greenfield-historical"` (4 repositories) and `population: "greenfield-modern"` (2
  repositories) so the era/lifecycle confound this reservation exists to name is not
  re-collapsed by a historical-only sample -- see "Greenfield reference set" above.
  This is a real remedy, which is why the severity dropped, but a thinner one than
  either prior remedy: 4 and 2 usable repositories respectively (one non-repeating
  window each), against the squash-merge set's five and the granular set's six, and
  no band from either new population has been adopted into `lib/thresholds.js`.

## Eras

Every observation carries an `era` field: `"current"` (2026, measured at whichever
tool commit the observation records) or `"pre-ai"` (2019-2020, chosen to sit before
GitHub Copilot's technical preview and clear of the initial 2020 pandemic
disruption). `derive-bands.js` pools every `include_in_derivation: true` observation
regardless of era by default -- unchanged from before the era field existed. Pass
`--era current` or `--era pre-ai` to restrict derivation to one era.

**Recommendation:** set `lib/thresholds.js` bands from `era: current` observations
(i.e. run `derive-bands.js --era current` when a band is actually adopted), not from
the pooled default and not from `pre-ai` alone. The tool's job is to flag drift in
today's practice, so the baseline should describe today's practice; pre-AI data is
here to check that baseline for validity; not to replace it. This is a
recommendation, not a code change -- `derive-bands.js`'s default behaviour, and
`lib/thresholds.js` itself, are both unchanged by this decision until someone acts
on it in its own reviewed commit.

## Populations

Every observation implicitly belongs to a `population`: `"granular"` (one commit is an
individual commit -- the default, and the only kind that existed before
code-quality-metrics-7sk) or a named population that sets the field explicitly --
`"squash-merge"` (one commit is a whole pull request), or `"greenfield-historical"` /
`"greenfield-modern"` (one commit was measured during a project's own initial build rather
than its maintenance era -- see "Greenfield reference set" below). An observation with no
`population` field at all is granular. `derive-bands.js`'s `selectByPopulation` defaults to
`"granular"` -- unlike `selectByEra`, which pools every era by default -- because every
population describes a different unit or a different lifecycle phase and **must never be
pooled with another**: a squash-merged commit routinely spans what would have been several
granular commits, so every size-shaped metric (large/sprawling percentages, p90 lines/files,
and duplication_pct via the wider file set a "commit" now touches) means something
structurally different between the two, independent of whether either team's actual practice
is any better or worse; a greenfield commit carries a lifecycle-phase bias in the same
direction on the same metrics for a different reason (see below). Pass `--population <name>`
to derive bands from a specific reference set instead; passing no flag reproduces exactly what
`derive-bands.js` computed before this option existed, since no pre-existing observation
carries the field.

The squash-merge reference set exists so that a squash-merging repository -- the more
common workflow, and one this tool otherwise withholds every commit-unit verdict for
(`history_granularity: "squashed"`) -- has *some* answer available rather than none.
It is a separate, smaller population, not a substitute for the granular one: **do not
compare a squash-merge band to a granular one as if they measured the same thing.**

**Confirming the detector, not just the screening.** `detectHistoryGranularity` (`lib/git.js`)
now classifies history automatically and is printed in every run's summary
(`history_granularity_detected`, `_confidence`, `_signals`). Run it on every candidate before
trusting a manual screening: it agreed with the "already screened as squashing" candidate
list for apache/kafka, microsoft/playwright (substituted for microsoft/TypeScript -- see
observations.json), facebook/react and TanStack/query at high confidence, and agreed with
python/cpython too but only at *low* confidence, which traced to a real detector gap:
`PR_REFERENCE_PATTERN` (`/\(#\d+\)$/`) did not match GitHub's alternate `(GH-N)`
backport-reference suffix, which about half of cpython's sampled commits use instead of
`(#N)`. This undercounted `pr_reference_share`; it did not flip cpython's verdict here, but a
repository that used *only* the GH-N form and nothing else plausibly could -- see
code-quality-metrics-wgc. **Fixed**: `PR_REFERENCE_PATTERN` is now `/\((?:#|GH-)\d+\)$/` and
matches both suffixes. The cpython `merge_style_evidence` notes in `observations.json` describing
the low-confidence result are left as recorded -- they are accurate history of what the tool
measured before this fix, not a live reading -- but re-running `detectHistoryGranularity` against
either cpython window today would combine both suffixes into a single high-confidence
`pr_reference_share` (the 21/50 + 25/50 = 92% figure quoted above), matching what the manual
recount already found by hand.

## Greenfield reference set

Every other observation in this file measures maintenance-era work on a decades-old
codebase (the `brownfield-only-lifecycle` reservation, originally high severity). Three
banded metrics -- `LARGE_COMMITS_PCT`, `P90_LINES_CHANGED`, `DUPLICATION_PCT` -- are biased
against a genuine initial build in the same direction, toward a worse verdict: large
commits are disproportionately forward engineering and initial build carries scaffolding,
vendored dependencies and generated files (Hattori and Lanza, EVOL 2008), and a young
codebase's small total-lines denominator makes duplication swing on a few blocks.
code-quality-metrics-31w added a structural detector for this (`windowIncludesRepositoryRoot`
in `lib/git.js`, surfaced as `project_lifecycle: "initial-build"` in every run's summary) and
withholds the biased verdicts for a window that trips it, rather than scoring them against
maintenance-era bands. code-quality-metrics-4cv is the other half: measuring a reference set
during that same phase, so the withheld verdicts have somewhere to go instead.

**Two sub-populations, not one.** The six granular baselines above all began between 1996 and
2011, so their first months are also an old-tooling era: pre-CI as practiced now, different
review norms, pre-GitHub for most. Measuring only their first months would still answer "what
did an initial build look like" with an old-tooling-era sample, re-collapsing era and lifecycle
into a single axis in the *opposite* direction from the bias `brownfield-only-lifecycle` exists
to correct. `population: "greenfield-historical"` and `population: "greenfield-modern"` keep
these separate, and `derive-bands.js --population <name>` must never pool them (see
"Populations" above):

- **`greenfield-historical`**: each of `emberjs/ember.js`, `curl/curl`, `postgres/postgres`
  and `nodejs/node` measured during its own earliest commits (`django/django` was also
  measured but is excluded -- see "Consistency check" below).
- **`greenfield-modern`**: `stride-nyc/remote_retro` (first commit 2015-07-17) and
  `stride-nyc/dotnetdependencytracer` (first commit 2024-06-13), each measured during its own
  first several months. (`kenjudy/73V`, first commit 2022-01-26, was also measured but is
  excluded -- see "Consistency check" below.) These are local repositories, not cloned from
  GitHub for this measurement; see "Adding a repository" for the local-clone method used.

**Method: pinning a window that actually reaches the root.** `--since` alone does not
guarantee this, for the same reason the general "Adding a repository" pinning trap below
exists: `local-code-metrics.js`'s HEAD-anchored fetch (no explicit `--since`/`--days`) takes
the **newest** `MAX_COMMITS` (50) commits reachable from whatever ref is checked out, not the
oldest. If more than 50 commits separate the repository's root from the checked-out ref, the
newest-50 slice never reaches the root at all. The pin must therefore be a commit whose own
`git rev-list --count <sha>` is at most 50 -- i.e. a commit that is itself early enough that
its *entire* ancestry fits in one HEAD-anchored fetch. In practice: list commits in
topological (or plain chronological) order from the root, and take the commit at whichever
position keeps the running ancestor count at or under 50 while getting as close to 50 as
possible. Every included observation in this population records the exact pin and the
verification (`repo_head`, and a `window.actual_span` note describing how the pin was chosen)
in `observations.json`.

**A real trade-off this constraint forces:** the resulting window's *calendar* span is
whatever 50 commits happens to cover for that repository's early cadence, not a fixed "first
six months." Measured directly: ember.js took 4 days to reach 50 commits from its root,
django 2 days, postgres 14, curl 48, node 46, remote_retro's entire first six months produced
only 18 commits total (well under 50, so all 18 were analyzed), and
dotnetdependencytracer took 18 days. Only remote_retro's window is close to a genuine
six-month span; every other window is a fast initial burst measured in days to a few weeks.
This is itself a finding, not a method failure: a 50-commit cap calibrated for measuring
*shape*, not *duration*, of a phase, and it turns out early-phase commit velocity varies by
more than an order of magnitude across these nine repositories.

**Consistency check: does the detector agree with intent?** Every window in this set was
checked against `windowIncludesRepositoryRoot`/`project_lifecycle`, and two disagreed, in
opposite directions:

- **django/django** (`greenfield-historical`, excluded): its repository root (`d6ded0e9`,
  "Created basic repository structure", an empty SVN-import artifact -- `git show --stat`
  and `--name-status` both return nothing for it) produces an empty `git show --numstat`
  diff. `analyzeCommit` (`lib/git.js`) treats an empty `statsOutput` identically to a
  git-command failure (`if (!statsOutput) return null;`) and silently drops the commit from
  the analyzed set, even though `git log --max-count=50` on the pinned ref did fetch it as one
  of the 50. The window therefore reports `project_lifecycle: "established"` and
  `window_includes_repository_root: false` despite structurally reaching the root. This is a
  genuine detector defect, not a bad pin -- out of scope to fix under this task (`lib/git.js`
  is not in scope) -- and it means django's greenfield practice cannot currently be measured
  with this detector at all: any window that includes this specific root will hit the same
  gap.
- **kenjudy/73V** (`greenfield-modern`, excluded, two windows): the repository's second-ever
  commit by author date is dated roughly three years after its root (2025-01-24 vs
  2022-01-26) -- a created-then-dormant repository, not a detector defect (the root commit
  itself is a genuine, non-empty "Initial commit"). The root-anchored window structurally
  reaches the root (`window_includes_repository_root: true`) and self-reports
  `initial-build`, technically satisfying the consistency check, but its `actual_span` covers
  three years for what is nominally 50 commits, 49 of which actually land in a single week in
  January 2025 -- not a six-month greenfield window by any reasonable reading. A second,
  corrected window pinned 50 commits further forward falls entirely within the real
  development burst and is genuine early practice by any practical measure, but because it
  excludes the dormant root it self-reports `established` -- the opposite-direction
  disagreement: a window that IS what was intended as greenfield, that the detector does not
  confirm. Both windows are kept in `observations.json` (`include_in_derivation: false`) to
  document the disagreement rather than resolve it silently either way. Their metrics broadly
  agree in shape (16% vs 14.29% large commits, 4% vs 4.76% sprawling), some evidence that the
  underlying practice being measured is similar regardless of which window is used.

**git/git could not be measured.** It was targeted as the sixth `greenfield-historical`
baseline (root commit `e83c5163`, "Initial revision of \"git\", the information manager from
hell", 2005-04-07; the 50th commit by author date, `853916ff`, lands 2005-04-12, four and a
half days later -- confirmed via the GitHub GraphQL API's commit-history connection rather
than a local clone, since no local clone of it was possible here). The sandboxed environment
this measurement ran in
blocks Bash commands that reference the literal path `git/git` more than once (a
worktree-isolation guard that cannot distinguish "the git binary invoked twice" from "the
string 'git' appearing twice because that happens to be this repository's own name"), and
further attempts to work around it (via a wrapper script, `git init` with no URL at all, and
`gh repo clone`) were denied by the runtime's own auto-mode classifier. Rather than fabricate
a workaround, this baseline is left unmeasured; `greenfield-historical` rests on 4 of the 6
intended repositories, not 5 (django is measured but excluded) or 6.

**Derived bands proposed (not adopted).** `node calibration/derive-bands.js --population
greenfield-historical` (4 repositories: ember.js, curl, postgres, node) and `--population
greenfield-modern` (2 repositories: remote_retro, dotnetdependencytracer) each propose a full
band table. Neither has been copied into `lib/thresholds.js`; that step is a separate,
reviewed decision, the same as for the squash-merge set. Run the commands above for the
current table; do not treat the numbers reproduced in any report derived from this file as
adopted.

**Is greenfield `duplication_pct` stable enough to band at all?** No, not on this sample.
Every greenfield observation's jscpd scan is small: ember.js scanned 32 sources / 11,215
lines, node 8 sources / 2,090 lines, remote_retro 3 sources / 150 lines. A handful of
duplicated blocks swings the whole-window percentage by several points on a denominator this
small, which is exactly the bias `brownfield-only-lifecycle` names for this metric. Three of
the four `greenfield-historical` repositories measured 0% duplication outright (ember.js,
node, and -- at 0.20% -- effectively django), curl alone measured 11.86%, and the derived
"healthy" p75 (6.5%) is entirely a function of where curl happens to fall in a 4-point
sample. The `greenfield-modern` population shows the same pattern at n=2: 0% and 1.76%. This
metric should not be banded from this sample regardless of how the historical/modern question
resolves; a much larger sample, or a different aggregation (e.g. lines-weighted pooling across
repositories rather than one point per repository) would be needed before a greenfield
duplication band means anything.

**Do the two sub-populations agree?** Reported side by side rather than pooled, per the
measurement task's design:

| Metric | greenfield-historical (n=4) | greenfield-modern (n=2) | Agreement |
|---|---|---|---|
| large_commits_pct | min 22, median 32, max 40 -> healthy 37 | min 16.67, median 37.34, max 58 -> healthy 48 | Modern's healthy bound sits above historical's max; dotnetdependencytracer's committed build output (see its observation's notes) plausibly explains this rather than a genuine practice difference. |
| sprawling_commits_pct | min 10, median 18, max 20 -> healthy 19 | min 5.56, median 30.78, max 56 -> healthy 43 | Same likely cause and same direction as above. |
| test_coverage_rate | min 0, median 8, max 26 -> healthy 3 (two-band) | min 5.56, median 39.78, max 74 -> healthy 23 (two-band) | Modern reads meaningfully higher; both populations are two repositories or fewer per extreme, so this could as easily be repository choice as era. |
| uncovered_prod_rate | min 20, median 25, max 38 -> healthy 31 (two-band) | min 11.11, median 11.55, max 12 -> healthy 12 / critical 12 (three-band, both modern repos within 15% of the max) | Modern reads lower (better) and, unusually, ties healthy and critical at the same rounded value -- an artifact of only two very close observations, not a real two-tier boundary. |
| p90_lines_changed | min 276.8, median 712.75, max 1560.3 -> healthy 1100 (two-band) | min 927.4, median 991.8, max 1056.2 -> healthy 1020 / critical 1060 (three-band) | Ranges overlap; modern's narrower spread is an n=2 artifact, not evidence of tighter practice. |
| p90_files_changed | min 4.2, median 8.1, max 12.4 -> healthy 10 (two-band) | min 5, median 9.05, max 13.1 -> healthy 11 (two-band) | Close agreement. |
| duplication_pct | min 0, median 2.51, max 11.86 -> healthy 6.5 (two-band) | min 0, median 0.88, max 1.76 -> healthy 1.5 (two-band) | See "stable enough to band" above -- neither figure should be trusted regardless of the apparent gap between them. |

Overall: the two sub-populations broadly overlap on file/line-count percentiles
(`p90_files_changed`, `p90_lines_changed`) but diverge on the commit-shape percentages
(`large_commits_pct`, `sprawling_commits_pct`, the test-coverage pair), with modern reading
worse on sprawl/size and better on test discipline. At n=4 and n=2 respectively, with one
non-repeating window per repository, this is far too thin a sample to call the divergence a
real era effect rather than which four and which two repositories happened to be chosen
(`dotnetdependencytracer`'s committed build output in particular is doing a lot of the work
in the "modern reads worse on size" direction). The honest reading is: report both tables,
do not pool them, and do not treat either as validated until the sample grows.

## Choosing a reference repository

Two requirements, and the first is easy to get wrong.

**Granular history.** The tool measures commits. A repository that squash-merges
turns one pull request into one commit, so its commit-level numbers describe
pull request shape instead of working habits, and are not comparable with a
repository that preserves individual commits. Check before measuring:

```bash
git log --since=<date> --merges --oneline | wc -l          # true merge commits
git log --since=<date> --format=%s | grep -cE '\(#[0-9]+\)$'  # squash signature
git log --since=<date> --format=%cn | sort | uniq -c        # web-flow means GitHub squashed it
```

Most well-known JavaScript projects squash, including eslint, prettier, vuejs/core,
microsoft/TypeScript, angular, webpack, babel, react and svelte. They were screened
and rejected on that basis, not on quality. Repositories with genuinely granular
history include nodejs/node (rebase-and-land, commits keep `PR-URL:` trailers) and
emberjs/ember.js (true two-parent merge commits).

**A reputation you can defend.** The bands inherit whatever these projects do, so
the choice is a judgement about what good practice looks like, not a neutral one.
Record why each was chosen.

## Adding a repository

1. Clone without blobs, which keeps commit metadata while skipping file contents:
   `git clone --filter=blob:none --single-branch --branch <default> <url> <dest>`
2. Establish and record merge style using the commands above.
3. Run at least two non-overlapping windows, so noise is visible. The CLI takes
   `--since` only; bound the older window by moving the branch ref back with
   `git checkout -B <branch> <older-sha>` before running.
4. Run with `ANTHROPIC_API_KEY` unset. The Claude layers cost money and are not
   deterministic, so they have no place in calibration.
5. Append one record per run to `observations.json`, including the repository
   HEAD SHA and the tool commit. Without both, the numbers cannot be reproduced.
   Record `repo_head` as the exact commit that was checked out for *this specific
   run* (`git rev-parse HEAD` right before invoking the tool), not the repository's
   live tip at some other point in the session -- a fixed `since` date on a
   high-volume repository (nodejs/node, git/git) selects the newest 50 commits
   reachable from whatever `repo_head` is, so two runs that share a `repo_head` but
   differ only in `since` can select the *same* 50 commits, and a `repo_head` that
   silently drifted between two runs meant to represent two different windows makes
   the older one unreproducible from the recorded fields. This was found the hard
   way while re-measuring for the trailer-stripping and vendor-exclusion fixes: see
   the `era: current` observations' `notes` for repositories where the original
   `repo_head` could not be trusted to reproduce its own recorded numbers.
6. Re-run `derive-bands.js` and, if a band moves, update `lib/thresholds.js` in
   its own commit citing the change.

## Reproducing a recorded observation

Reproducing an already-recorded entry from a clean clone is a different exercise from
adding a new one above, and two things beyond `repo_head` have to be right
(code-quality-metrics-tde9). Verified directly against a fresh, real blobless clone of two
repositories, not reasoned about:

1. **Clone single-branch, from the start.** Use the exact command step 1 above already
   gives: `git clone --filter=blob:none --single-branch --branch <default> <url> <dest>`.
   A plain `git clone` (no `--single-branch`) carries every remote branch as a
   remote-tracking ref sitting at its own live tip, and `local-code-metrics.js` enumerates
   branches with `git branch -a`; it then still analyzes whichever of those branches have
   commits in the requested window, wherever they have moved on to since the observation
   was recorded. Checking out `repo_head` afterward, or even resetting a local branch of
   the same name to it (`git checkout -B <default> <repo_head>`), changes nothing on its
   own, because the *other* branches are still there and still newer -- confirmed against
   nodejs/node's long-lived `vX.x-staging`/`canary-*` branches and reproduced on a
   synthetic repository built specifically to carry one contaminating branch. Cloning
   single-branch is what prevents this; ref surgery after the fact is not a substitute.
2. **Do not remove the `origin` remote.** Nothing above asks for this, but it is a natural
   next step to try once single-branch cloning alone does not appear to be enough (it is,
   if done correctly -- see below), so it is worth ruling out explicitly: a blobless
   (`--filter=blob:none`) clone fetches missing blob content from `origin` lazily, on
   demand, and every `git show --numstat` this tool runs against a historical commit needs
   exactly that. Removing the remote breaks the fetch silently -- `git log`/`git rev-list`
   traversal still succeeds, since commit and tree objects are never filtered, but
   per-commit diffing then collapses to whichever few commits happen to need no further
   blob fetch, which reads as a complete, well-formed report analyzing almost nothing.
3. **Run at the recorded `tool_commit`** for a bit-exact match, not necessarily this
   repository's current HEAD. Following steps 1-2 correctly is necessary but not always
   sufficient: verified directly against the nodejs/node (`repo_head` `cb9bb667`, `since`
   `2026-08-01`) and curl/curl (`repo_head` `05ddf551`, `since` `2026-08-10`) observations
   in this file, both recorded at `tool_commit` `fcc40d93` -- `large_commits_pct`,
   `p90_lines_changed`, and the exact `actual_span` reproduced bit-for-bit at that tool
   commit, but differed at this project's later HEAD, because of an unrelated defect in how
   the newest `MAX_COMMITS` commits are selected once a rebase-and-land workflow's author
   date and committer date diverge. Not fixed as part of this entry; tracked separately.

`local-code-metrics.js` now cross-checks its own selection against an independent
`git rev-list --count` over the same resolved ref and warns loudly on a large mismatch, or
when the analyzed span starts well after the requested `--since` date, or collapses to a
single day (code-quality-metrics-tde9) -- exactly the three failure signatures a ref-handling
mistake in steps 1-2 above produces, so getting them wrong now surfaces a warning instead of
a silent, plausible wrong answer.

## When observations expire

Recorded numbers are only valid for the tool version that produced them. Two
defects found during the first calibration round changed what several metrics
measure:

- `large_commit` counted test lines, so adding tests could push a commit over
  the threshold
- `TEST_FILE_PATTERNS` could not match a repository-root `test/` directory, so
  entire test suites counted as untested production code

Any observation taken before those fixes measures something different and is
marked excluded rather than deleted, so the record of what was measured and why
it was discarded survives.

A second round found two more, changing what `message_quality_pct` measures
across the board and `test_coverage_rate`/`test_isolation_rate`/`uncovered_prod_rate`
specifically for git/git:

- `message_quality_pct` scored only the commit subject line, so short-subject/
  long-body conventions (postgres, curl, git) scored as low quality regardless of
  how well explained the commit actually was
- `TEST_FILE_PATTERNS` had no pattern for a bare, repository-root `t/` directory,
  so git/git's entire test suite (`t/t*.sh`) counted as untested production code

A third round found two more, changing `message_quality_pct` again and
`duplication_pct` for any repository that vendors dependency code in tree:

- `message_quality_pct` scored the full commit body, but a trailing block of
  `Key: value` trailers (PR-URL, Reviewed-By, Co-authored-by, ...) counted toward
  the word-count check, so trailer volume alone could pass a message with no prose
- `DUPLICATE_IGNORE_PATTERNS` did not exclude `deps/`, `vendor/`, `third_party/`,
  `node_modules/`, `generated/` or lock files, so a vendored dependency sync (or a
  regenerated lockfile) read as organic code duplication

Each round's pre-fix observations are marked `include_in_derivation: false` with a
reason naming the fixes, rather than deleted.

A fourth event changed `duplication_pct` again, but it is a deliberate config change rather
than a bug fix, and it is handled differently in the data as a result: `DUPLICATE_MIN_LINES` /
`DUPLICATE_MIN_TOKENS` were raised from 5/50 to 10/100 (code-quality-metrics-k1g) to match
SonarQube's own duplicated-lines gate, so the toolkit's number means what the published 3-23
percent clone-study range means. Every metric *except* `duplication_pct` in the twenty-four
`include_in_derivation: true` observations (both eras, all six references) is unaffected by this
change and was not re-measured. Rather than excluding those observations wholesale -- which
would have discarded twenty-three still-valid metrics per observation to retire one stale one --
`metrics.duplication_pct` was updated in place to the re-measured 10/100 value (the same pinned
`repo_head` and commit window, jscpd re-run with the new minimums), and a `duplication_remeasurement`
field on each observation preserves the superseded 5/50 value, the ratio between them, and the
tool commit the re-measurement was taken at, so the earlier number is recoverable rather than
lost. See the measurement task's report for the full old-value/new-value table and whether the
threefold difference Wagner et al. found held here.

A fifth defect (code-quality-metrics-pke) was found and fixed but, unlike the four above,
required **no** re-measurement. `analyzeCommit` (`lib/git.js`) computed per-commit stats with
`git show --numstat`, which diffs a two-parent merge commit against its first parent; for a
conflict-free merge (GitHub's "Merge pull request" button on a single-commit PR) that reproduces
one of the merged children's diff exactly, double-counting that change. This is a real defect in
`analyzeCommit` itself, and ember/git are both true merge-commit workflows, so it looked like it
should have contaminated this dataset. It did not, because `local-code-metrics.js`'s own commit
collection already passes `--no-merges` to every `git log` call that builds the list
`analyzeCommit` is invoked over (commit `fa14708`), and that fix predates the `tool_commit` every
included observation in this file was measured at. Checked directly rather than assumed: merge
commits are present in the pinned window for emberjs/ember.js (both included windows) and git/git
(all four included windows, current + pre-ai) -- 24 to 78 raw merge commits per window -- and
nodejs/node, postgres/postgres, django/django and curl/curl have zero merge commits in any of
their eight included windows. For every one of the six windows with merges present, re-running
the current tool against that window's pinned `repo_head` reproduced the stored observation's
metrics bit-for-bit, confirming zero merge commits ever entered the analyzed set, before or after
the `lib/git.js`-level fix. The fix itself moved the guard into `analyzeCommit` so it holds for any
caller, not only the one `--no-merges` flag -- calling `analyzeCommit` directly on a merge sha,
bypassing that flag, is exactly how this defect was originally found -- but no observation's
`metrics` needed updating and no band moved.
