# Threshold calibration

Every band in `lib/thresholds.js` should trace to measurements recorded here.
None of the cited research supplies boundary numbers: DORA scores batch size
from self-reported ordinal survey answers and never converts them to a line
count, and GitClear reports trends and prevalence rather than a healthy line.
The bands therefore have to come from measuring projects we are willing to hold
up as disciplined, and from saying plainly which ones.

## Files

| File | Purpose |
|---|---|
| `observations.json` | Every measurement taken, append-only. The evidence. |
| `derive-bands.js` | Reads observations and proposes bands. Writes nothing. |

Run `node calibration/derive-bands.js` for a table, or `--json` for machine output.

## Derivation rule

- **healthy** = the worst value any included reference produced. A project doing
  no worse than the references is healthy by construction. This is the only
  claim the data supports.
- **critical** = healthy x 2. A stated convention, not a measurement. No
  reference came close to it, so the observations cannot locate this boundary.
  It is labelled as convention wherever it is reported, and should stay labelled
  that way until something better exists.

The script never edits `lib/thresholds.js`. Copy numbers across in a reviewed
commit, so a threshold change is always deliberate.

## Reservations

`observations.json` carries a `reservations` array: ten recorded concerns about
using this sample to set thresholds, two of them high severity (a pre-AI baseline
now exists -- see below -- which downgraded that one from high to medium). They
are kept with the evidence rather than in `lib/thresholds.js` so the caveats
travel with the data, and so adding a reference repository forces a reader to
reconsider which still apply. `derive-bands.js` prints the high severity ones on
every run.

The two that most limit how far these bands can be carried:

- **Granular history only.** The bands are valid for repositories that preserve
  individual commits. A squash-merge repository yields one commit per pull
  request, so it will look worse on every size metric for reasons that have
  nothing to do with practice. Squash repositories need their own reference set.
- **Circular definition.** The references were chosen because they are considered
  disciplined, and healthy is then defined as what they do. The bands support
  "no worse than these six", which is weaker than "healthy".

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
