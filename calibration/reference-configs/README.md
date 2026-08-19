# Reference repository exclusions

One file per reference repository, naming the vendored and generated paths that repository
carries. Applied with `--config` when re-measuring, so a baseline run reproduces exactly.

```bash
node /path/to/local-code-metrics.js \
  --since <window> \
  --config /path/to/calibration/reference-configs/<repo>.json
```

Exclusions are per repository, not a shared default, because each project has its own
conventions for what it vendors and where it puts generated output. A single list would
either miss node's `deps/` tree or wrongly exclude a directory another project uses for
source.

## Why these paths and not others

Every entry below traces to a window `observations.json` had to exclude, or to a tracked
directory large enough to distort a 50-commit window. Nothing here is a guess about what
*might* be generated.

### nodejs/node

| Pattern | Tracked files | Evidence |
|---|---|---|
| `**/deps/**` | 36,617 | Two excluded windows. 2026-06-01 was dominated by a burst of vendored syncs: openssl 3.5.7 (18,572 lines / 163 files), ngtcp2 1.23.0 (16,949 / 114), npm 11.17.0 (10,283 / 320), zlib (7,823 / 77). 2026-08-11 included perfetto 57.2 (29,781 / 4). |
| `test/wpt/**` | 55 | 2026-08-11, `worker: add wpt tests for Web Workers` imported the external Web Platform Tests fixture suite: 53,334 lines across 1,322 files in one commit. |
| `tools/v8_gypfiles/**` | 62 | Vendored V8 build tooling, not authored here. |
| `tools/inspector_protocol/**` | (included above) | Vendored from Chromium. |

Node is the case `lib/config.js` already documents: one `deps/` sync moved its measured
duplication from 5.12 to 15.09 percent with no change in practice.

### django/django

| Pattern | Tracked files | Evidence |
|---|---|---|
| `**/locale/**` | 2,708 | The 2026-07-01 window was excluded because one commit, `9e0655e4 Updated translations from Transifex`, accounted for roughly 65 percent of the window's changed lines (5,125 of 7,934 across 50 commits). Transifex syncs are batch content pulled from an external platform, not development. |

### git/git

| Pattern | Tracked files | Evidence |
|---|---|---|
| `po/**` | 26 | The 2026-04-01 window landed a burst of periodic release-cycle localization-file merges, recorded in its exclusion reason. |

### postgres/postgres

| Pattern | Tracked files | Evidence |
|---|---|---|
| `**/po/**` | 525 | Translation catalogues, same class as django and git above. No postgres window was excluded for this, so this entry is preventive rather than corrective. |

**Deliberately not excluded:** `**/expected/**/*.out` (878 files). These are regression test
expected-output files. A bulk regeneration is noise, but an updated expected output is
usually a real consequence of a real change, and excluding them would hide legitimate work.
They are already classified as tests by `TEST_FILE_PATTERNS`, which is the correct treatment.
Revisit only if a window is observably dominated by one.

### curl/curl

Nothing excluded. Checked and found nothing that qualifies.

`tests/data/**` (2,090 files) holds curl's test case definitions, which are test fixtures
rather than vendored or generated content, and `TEST_FILE_PATTERNS` already classifies them.
`docs/cmdline-opts/**` (303 files) is authored documentation.

The empty list is deliberate and recorded so a later run does not re-litigate it.

### emberjs/ember.js

Nothing excluded. Checked and found nothing that qualifies.

`packages/**` (1,466 files) is the monorepo's own source. No `dist/` or `vendor/` tree is
tracked. Ember's two excluded windows were excluded for a tool artifact (merge-commit
double counting), not for vendored content.

## Scope: these set `ANALYSIS_IGNORE_PATTERNS` only

`DUPLICATE_IGNORE_PATTERNS` is left at its defaults for every reference repository, so the
duplication figures stay comparable with what is already recorded. Class A keys union with
whatever is already effective, so a `--config` file adds to the eleven built-in vendored
patterns rather than replacing them.

Note the asymmetry that makes these files necessary at all: `DUPLICATE_IGNORE_PATTERNS`
unions onto eleven defaults, `ANALYSIS_IGNORE_PATTERNS` unions onto an empty list. A
repository gets vendored exclusion from the duplicate detector for free and none at all from
the size metrics unless it is spelled out. See issue #69.

## What re-measuring with these changes

`ANALYSIS_IGNORE_PATTERNS` removes a path from `large_commit`, `sprawling_commit`, the
line-count distributions, prod/test classification and `uncovered_prod_rate`. A matched path
counts as neither test nor production.

So a re-measurement is **not** comparable to observations recorded without these configs.
Record new observations rather than editing old ones, and retire the old ones the way
`measurement-changed-mid-calibration` describes.

## Reproducing a baseline run

**There is no working recipe yet. See issue #70.**

Reference repositories are not vendored into this repo, so a baseline run means cloning,
measuring at the recorded `repo_head` and `window.since` from `observations.json`, then
deleting the clone. The obvious version of that does not work:

| Attempt on nodejs/node, `--since 2026-08-01`, recorded span 2026-07-15 to 2026-08-11 | Result |
|---|---|
| `clone --filter=blob:none`, then `checkout <repo_head>` | span 2026-08-12 to 2026-08-16 |
| plus `checkout -B main <repo_head>` | identical |
| plus `git remote remove origin` | 1 commit, single day |

Pinning HEAD does not constrain the analysis, because the tool enumerates branches and a
clone carries remote-tracking refs at upstream tip. Removing the remote breaks target
resolution the other way: `git rev-list --count --since=2026-08-01 main` reports 178 commits
while the tool selected one. Every attempt produced a complete, plausible report with no
warning.

Until #70 lands a verified recipe, treat any re-measurement of the reference set as
unreproducible, and do not derive bands from one.

The `--config` mechanism itself is verified working: applied to a fixed window, the node
config below moved `large_commits_pct` from 28 to 26, `test_coverage_rate` from 42 to 36 and
`uncovered_prod_rate` from 8 to 10. Only window selection is at fault.

Blobless clones are enough and keep node to about 1.1 GB rather than several.
