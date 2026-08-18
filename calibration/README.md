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
using this sample to set thresholds, three of them high severity. They are kept
with the evidence rather than in `lib/thresholds.js` so the caveats travel with
the data, and so adding a reference repository forces a reader to reconsider
which still apply. `derive-bands.js` prints the high severity ones on every run.

The three that most limit how far these bands can be carried:

- **No pre-AI baseline.** Every window is from 2026, so the references may already
  have adopted AI assistance. A toolkit built to detect AI drift is calibrating
  to a contemporary sample, which risks defining healthy as whatever drift is
  already present. A pre-2022 window for the same repositories is the single most
  valuable addition to this dataset.
- **Granular history only.** The bands are valid for repositories that preserve
  individual commits. A squash-merge repository yields one commit per pull
  request, so it will look worse on every size metric for reasons that have
  nothing to do with practice. Squash repositories need their own reference set.
- **Circular definition.** The references were chosen because they are considered
  disciplined, and healthy is then defined as what they do. The bands support
  "no worse than these six", which is weaker than "healthy".

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
