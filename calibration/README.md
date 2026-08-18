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

`observations.json` carries a `reservations` array: thirteen recorded concerns
about using this sample to set thresholds, three of them high severity (a
pre-AI baseline now exists -- see below -- which downgraded one from high to
medium; three published transferability findings -- non-transferability across
projects, context-dependence, and within-project drift over time -- were added
afterward and one of those is itself high severity). They are kept with the
evidence rather than in `lib/thresholds.js` so the caveats travel with the
data, and so adding a reference repository forces a reader to reconsider which
still apply. `derive-bands.js` prints the high severity ones on every run.

The three that most limit how far these bands can be carried:

- **Granular history only.** The bands are valid for repositories that preserve
  individual commits. A squash-merge repository yields one commit per pull
  request, so it will look worse on every size metric for reasons that have
  nothing to do with practice. Squash repositories need their own reference set.
- **Circular definition.** The references were chosen because they are considered
  disciplined, and healthy is then defined as what they do. The bands support
  "no worse than these six", which is weaker than "healthy".
- **Cross-project non-transfer.** Kamei et al. (EMSE 2016, Table 6) found a
  fitted, multi-feature just-in-time defect model loses accuracy down to 0.38
  AUC -- worse than random -- when applied to a project outside its training
  set. An unfitted scalar band from six reference repositories has less claim
  to transfer to an unseen project than a fitted model does, so these bands
  should be read as describing these six repositories rather than generalizing
  to one unlike them.

A third, now medium severity, is worth calling out separately because it drove a
whole second measurement pass:

- **Pre-AI baseline (partially addressed).** Every window used to be from 2026, so
  the references may already have adopted AI assistance. A pre-2022 (2019-2020)
  window has now been measured for all six repositories -- twelve `era: "pre-ai"`
  observations alongside the twelve `era: "current"` ones. Movement between eras
  turned out modest and mixed in direction rather than uniformly worse (see the
  measurement task's report for the full per-metric table), which softens but does
  not retire the concern: two 50-commit windows per era per repository is still a
  thin sample.

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
code-quality-metrics-7sk) or `"squash-merge"` (one commit is a whole pull request). An
observation with no `population` field at all is granular; only the squash-merge
reference set below sets the field explicitly. `derive-bands.js`'s `selectByPopulation`
defaults to `"granular"` -- unlike `selectByEra`, which pools every era by default --
because the two populations describe different units and **must never be pooled**: a
squash-merged commit routinely spans what would have been several granular commits, so
every size-shaped metric (large/sprawling percentages, p90 lines/files, and duplication_pct
via the wider file set a "commit" now touches) means something structurally different
between the two, independent of whether either team's actual practice is any better or
worse. Pass `--population squash-merge` to derive bands from the squash-merge reference
set instead; passing no flag reproduces exactly what `derive-bands.js` computed before
this option existed, since no pre-existing observation carries the field.

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
`PR_REFERENCE_PATTERN` (`/\(#\d+\)$/`) does not match GitHub's alternate `(GH-N)`
backport-reference suffix, which about half of cpython's sampled commits use instead of
`(#N)`. This undercounts `pr_reference_share` and should be fixed in `lib/git.js` in its own
change; it did not flip cpython's verdict here, but a repository that used *only* the GH-N
form and nothing else plausibly could.

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
