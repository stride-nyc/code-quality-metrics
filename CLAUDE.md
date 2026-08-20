# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This toolkit detects **AI code drift**: problematic patterns that emerge when teams adopt AI coding tools. It captures metrics *before* merge squashing destroys the signals, making visible how AI tools actually affect code quality.

Key insight: Local analysis reveals 10x higher drift rates than remote analysis because `git merge --squash` and branch deletion destroy granular commit-level signals.

## Running the Tools

```bash
# Analyze the local repository (outputs JSON files + console report)
node local-code-metrics.js

# Manually trigger GitHub Actions workflows
gh workflow run code-metrics.yml
gh workflow run pr-metrics.yml
```

### Analysis Window

With no `--since`/`--days` flag, `local-code-metrics.js` is HEAD-anchored, not anchored on
today: it takes the newest `CONFIG.MAX_COMMITS` commits (across all analyzed branches,
merged and globally sorted, not the first commits encountered per branch) regardless of
calendar date, then reports the actual span it found (code-quality-metrics-g10). `--since`
and `--days` keep their prior meaning exactly: an explicit date boundary. A repository whose
newest commit is older than a calendar window would have covered reports zero under a
date-based default; measured on four repositories analyzed in this project, all four needed
`--days` passed by hand at the old 30-day default (remote_retro 103 days stale, daloopa ~300,
flight-info-spike 95, dotnetdependencytracer ~270). A HEAD-anchored default also matches the
50-commit windows `calibration/README.md`'s bands were derived from more closely than a
calendar range that happens to catch a handful of commits.

If an explicit `--since`/`--days` window returns zero commits, the run widens automatically
to the newest `CONFIG.MAX_COMMITS` commits, ignoring the requested boundary, rather than
exiting for the operator to retry by hand.

The actual analyzed span (the real oldest/newest commit dates, never the requested window or
"today") is always reported: `analyzed_span_start`/`analyzed_span_end` in
`local_metrics_summary.json`, and a masthead line in `local_drift_report.html`
(`generate-drift-report.js`'s HTML output) stating the same span and naming a widened window
explicitly. A report covering, say, 2025-02 to 2026-04 is never presentable as covering
recent activity.

This window applies to `local-code-metrics.js` only. `.github/workflows/code-metrics.yml` and
`pr-metrics.yml` build their own windows against the GitHub REST API and are out of scope for
this change; see code-quality-metrics-g10's own notes on whether they need the same treatment.

**Operator override: `--max-commits <n>|unbounded`.** A per-run override of
`CONFIG.MAX_COMMITS` (default 50), for a reference measurement that needs every commit in a
window rather than the newest 50 -- e.g. a repository's first twelve months, where several
`calibration/observations.json` reservations were excluded outright because a 50-commit sample
was dominated by one vendored dependency sync or bulk import, and where p90 on a 50-commit
sample is only the 45th order statistic of a heavy-tailed distribution (large sampling
variance). `--max-commits <n>` raises the cap to a specific number; `--max-commits unbounded`
removes it entirely, taking however many commits actually fall in the window. Both forms are
supported because they answer different requests: "up to N" versus "every commit in range."

CLI-only, deliberately: no `.codemetrics.json` key exists for this override, unlike
`--lifecycle`. The run-scoping decisions the other six overridable keys make (which paths count
as vendored, which detector sensitivity applies) are facts about the repository being measured
and are appropriate to commit into that repository's own config. How many commits *this run*
analyzes is a property of the run, not of the repository, and a repository able to widen its own
sample size via a committed config file is exactly the kind of self-selection this project
otherwise avoids.

Interaction with `--since`/the widening fallback above: `fetchBranchCommits` applies no
per-branch count bound at all once `--since` is set (it never has), so the override changes the
per-branch `--max-count` only in HEAD-anchored mode (no `--since`/`--days`); with `--since`, it
governs the final global slice instead, which otherwise silently re-imposed the default 50 on
an explicit-window run. The empty-window widening fallback keeps using the true default
`CONFIG.MAX_COMMITS`, never the override: a widen produces a substitute default-shaped
HEAD-anchored sample, not "the requested window," and letting an unbounded or oversized
override reach that fetch would defeat the size guard the ordinary default provides. The
override still governs how many of the widened commits are ultimately analyzed.

An unbounded run over a very large repository can hang or exhaust memory -- GitHub #89
documents `git log --all --reverse` throwing `ENOBUFS` on a 36,058-commit history, an error the
tool's own error handling swallows into an empty result rather than surfacing it, reading as
"zero commits found." `--max-commits unbounded` is guarded by a cheap `git rev-list --count`
pre-flight check (`CONFIG.MAX_COMMITS_SAFETY_LIMIT`, default 10,000): exceeding it throws
loudly before any branch is fetched, rather than truncating silently. A bounded numeric
`--max-commits <n>` is not checked against this limit -- it is the operator's own explicit,
self-limiting request, the same way `--days` already permits an arbitrarily large historical
window with no separate ceiling.

`max_commits_override` in `local_metrics_summary.json` records what was requested (`null` when
not given, otherwise the number or `"unbounded"`), the same convention
`history_granularity_override`/`project_lifecycle_override` already follow: an analysis run over
hundreds of commits is not comparable to one over the default 50, and a reader comparing two
reports must be able to tell an override was requested rather than assuming a larger repository.

### Branch Spread (code-quality-metrics-8sq)

A sample can be dominated by long-abandoned, never-merged branches contributing roughly one
commit each -- measured: remote_retro, 29 analyzed commits across 30 branches;
dotnetdependencytracer, 50 across 49 -- which holds no signal about shipped practice, since
nothing in an abandoned branch reached production. Rather than an invented recency filter,
`local_metrics_summary.json` reports `analyzed_branch_commit_counts` (how many analyzed
commits came from each branch) and `branches_with_analyzed_commits` (how many distinct
branches that is), and the masthead states both counts together (e.g. "50 commits analyzed
..., across 7 branches"), so a reader can see a thin spread without this toolkit asserting
where "too thin" begins.

## Testing and Linting

```bash
npm test                 # run all tests
npm run test:coverage    # tests with coverage report (thresholds: 80% lines, 90% functions)
npm run test:watch       # watch mode
npx jest __tests__/parseGitLog.test.js   # run a single test file
npm run lint             # ESLint (flat config, globals.node required; already configured)
npm run typecheck        # tsc --noEmit (checks local-code-metrics.js via @ts-check + tsconfig.json)
```

All tests mock `child_process` and `fs`. No git repository is required to run the suite.

A pre-commit hook runs lint, typecheck, and test automatically. After cloning, activate it with:

```bash
npm install   # triggers `prepare`, which sets core.hooksPath to .githooks
```

## Architecture

Three public components sharing pure-computation logic via `lib/`:

1. **`local-code-metrics.js`**: Standalone Node.js script (requires Node ≥18). Orchestration entry point that delegates to focused modules in `lib/`. Reads local git history via shell commands, classifies files as test vs. production, computes metrics, writes `local_commit_metrics.json` + `local_metrics_summary.json` + (optionally) `local_claude_analysis.json`, and prints a console report with insights.

   The `lib/` directory contains the internal modules:
   - `lib/config.js` — CONFIG object; detector and analysis settings (large/sprawling commit cutoffs, message-quality word count, AI pre-filter and duplicate-detector tuning, test-file patterns), the single source of truth for those settings (**shared with workflows**)
   - `lib/thresholds.js` — THRESHOLDS object; the calibrated healthy/critical verdict bands each metric is scored against, the single source of truth for those bands (**shared with workflows**)
   - `lib/statistics.js` — statistical distributions (p50/p90/p95/stddev), velocity and trend (**shared with workflows**)
   - `lib/metrics.js` — message quality scoring, DORA archetype classification, test file detection, insights generation (**shared with workflows**)
   - `lib/git.js` — git shell commands, log parsing, per-commit analysis, diff extraction (local only — workflows use REST API)
   - `lib/claude.js` — Anthropic client setup, commit pre-filtering, diff-level API analysis (local only — workflows use GitHub-managed auth)

2. **`.github/workflows/code-metrics.yml`**: Weekly GitHub Actions workflow. Uses the GitHub API to analyze feature branches from the past 30 days. Requires `lib/config.js`, `lib/statistics.js`, `lib/metrics.js`, and `lib/thresholds.js` via `require()`. Outputs a JSON artifact and creates a GitHub issue with the summary.

3. **`.github/workflows/pr-metrics.yml`**: Per-PR GitHub Actions workflow. Requires `lib/config.js`, `lib/thresholds.js`, `lib/metrics.js`, `lib/duplicate.js`, and `lib/claude.js` via `require()`. Posts a detailed comment on each PR with commit-by-commit analysis, test adequacy, development pattern detection, and two-layer duplicate code detection (Layer 1 jscpd always-on; Layer 2 semantic via Claude when `ANTHROPIC_API_KEY` is set).

## Key Metrics and Thresholds

Bands are quantiles of a six-repository benchmark (nodejs/node, emberjs/ember.js, git/git,
postgres/postgres, django/django, curl/curl), derived by `calibration/derive-bands.js` from
`calibration/observations.json` — the same published-method framing Alves, Ypma and Visser use
in "Deriving Metric Thresholds from Benchmark Data" (ICSM 2010, DOI 10.1109/ICSM.2010.5609747).
**"Healthy" below means "at or below the 75th percentile of this benchmark," not "validated
against a quality outcome."** No cited source publishes a boundary number for any of these
metrics: DORA scores batch size from self-reported ordinal survey answers and never converts
them to a line count, and GitClear reports trends and prevalence rather than a healthy line.
Values below are current as of `node calibration/derive-bands.js --era current`; a metric marked
two-band has no critical bound because its extreme rests on a single reference repository with
no second repository corroborating it within 15% (`lib/report.js`'s `statusForTwoBand`
enforces this at runtime — never reads a `null` critical bound as zero).

| Metric | Healthy | Critical | Tier |
|--------|---------|----------|------|
| Large commit % (>100 prod lines) | ≤18% | — | two-band |
| Sprawling commit % (>5 files) | ≤18% | — | two-band |
| Test coverage rate (test+prod co-occurrence) | ≥23% | — | two-band |
| Uncovered prod rate | ≤10% | — | two-band |
| Commit message quality % | — | — | informational |
| Avg lines changed | — | — | informational |
| p90 lines changed | ≤250 | — | two-band |
| p90 files changed | ≤8.5 | — | two-band |
| Net additions ratio (median) | — | — | informational |
| Duplication density % | ≤2% | — | two-band |

Three rows read informational because their bands were withdrawn on evidence, not because
they are unmeasured: each value is still computed and reported, with no verdict attached.
Message quality was found to measure Conventional Commits adoption rather than informativeness.
Net additions ratio used a churn denominator the source literature discards. Avg lines changed
has no finite mean to band: three independent published fits put commit size on a heavy-tailed
distribution, and a generalized Pareto with shape above 1 has no finite mean at all. Seven
metrics carry a band; none currently has a critical bound. Large commit % and sprawling commit
% both lost their critical bound in the most recent re-measurement (`calibration/
observations.json`, twelve era: current observations re-measured after #76 committer-date
selection, #80 bot filtering, and the reference-config exclusions): large commit %'s old
corroborating repo (nodejs/node) was measured pre-bot-filter and no longer sits near the
extreme, and sprawling commit %'s corroborated critical bound now lands exactly on its healthy
bound -- a zero-width warning band `calibration/derive-bands.js` refuses to report, downgrading
it to two-band instead (see that script's `deriveBand` comment). Because every calibrated band
is currently two-band, no metric can render a "critical" verdict right now; `classifyDoraArchetype`'s
`legacy-bottleneck` and `foundational-challenges` archetypes are consequently unreachable until a
future re-measurement restores a three-band metric (see the DORA Archetype section below).

Statistical distributions (p50/p90/p95/stddev) are computed for lines changed and files changed. Commit velocity trend and a practice archetype are included in the summary.

Nine of the bands above (large/sprawling commit %, the three-way test-coverage rates, p90 lines/files changed, commit-size and velocity trend) treat one commit as one unit of work and are withheld entirely — not merely left un-banded — when the analyzed history is squashed pull requests rather than granular commits, since a whole PR sized as if it were one commit is not the thing the band was calibrated against. `history_granularity` is detected from PR-reference subjects, squash-flavored committer names, and merge-commit presence (`detectHistoryGranularity`, `lib/git.js`), but a `workflow_type: feature_branch` history always resolves to `granular` for withholding purposes regardless of that raw detection (`resolveHistoryGranularityForWithholding`, `local-code-metrics.js`): commits unique to an unmerged branch cannot yet be the squashed result of a merge, whatever a subject line says. The gate does not apply to `workflow_type: trunk`, where a genuinely squash-merging repository's main-branch commits really are whole pull requests and withholding is correct. `history_granularity_override` records only an explicit operator `--history` flag, never the workflow_type gate above; when the gate is what actually changed the effective value away from `history_granularity_detected`, that reason is named separately in `history_granularity_forced_reason` (`null | 'operator' | 'workflow_type_feature_branch' | 'unknown_defaults_to_squashed'`, code-quality-metrics-q5uz) — before this field existed, a `history_granularity_override: null` summary could not distinguish "nothing overrode anything" from "the workflow_type gate silently forced a different value." See "History Granularity and Commit-Unit Withholding" in `metrics-specification.md` for the detection rule, the withholding rule, and why the other two candidate rules (act on confidence; raise the zero-share bar) were not chosen.

Two bands have corroboration from outside this project's own six repositories, as a *position*
rather than a *boundary*: p90 lines changed (250) against Kolassa, Riehle & Salim's published p90
of 261 LoC/commit over 8.7M commits (SOFSEM 2013), and p90 files changed (8.5) against Sadowski et
al.'s ~90% of Google changes touching fewer than 10 files (ICSE-SEIP 2018) and Alali et al.'s gcc
p90 of ~8 files (ICPC 2008). Thirteen reservations qualify every band, three of them high
severity, including that a fitted, multi-feature just-in-time defect model already fails to
transfer across projects (down to 0.38 AUC, worse than random; Kamei et al., EMSE 2016). That
result bounds fitted prediction models rather than benchmark quantiles, which predict nothing and
so fail on a dissimilar project by going uninformative rather than by scoring worse than chance,
but it remains the clearest published warning against carrying any project-derived number to a
project unlike the six references. See `calibration/README.md` and the Threshold Provenance section of
`metrics-specification.md` for the full derivation rule, the external anchors, and all thirteen
reservations. Do not cite these numbers as validated outcome thresholds.

### Project Lifecycle Detection

Four tiles above (large/sprawling commit %, p90 lines/files changed) plus duplication density carry a further bias when the analyzed window is a genuine initial build: every reference repository the bands above were calibrated against is a decades-old codebase measured during maintenance, and an initial build carries scaffolding, vendored dependencies and generated files that bias large-commit and p90-lines-changed toward a worse verdict (Hattori and Lanza, EVOL 2008). `project_lifecycle` (`'initial-build' | 'established' | 'undetermined'`) drives this: `windowIncludesRepositoryRoot` (`lib/git.js`) checks whether the analyzed window reaches the repository's own root commit(s), a structural fact rather than a tuned age or commit-count threshold. These five tiles used to be withheld outright for such a window; now that a greenfield-modern reference band exists (`THRESHOLDS.GREENFIELD_MODERN`, `lib/thresholds.js`), `buildMetricCatalog` (`lib/report.js`) scores them against it instead — a much thinner (n=2) but lifecycle-appropriate comparison, visibly marked on the rendered card (a `band-chip`, a dashed border, and a threshold sentence naming the population and its n) so it is never mistaken for the brownfield (n=12) verdict shown elsewhere on the page. Test/prod co-change and uncovered production are deliberately not substituted and keep scoring against the brownfield band regardless of lifecycle: the bias this paragraph describes is specific to change-size and duplication metrics, and no equivalent claim exists for either of those two. See "Project Lifecycle and Change-Size Withholding" in `metrics-specification.md` for the substitution mechanism and the per-metric decision.

**A misdetected lifecycle means the wrong bands are applied — plainly.** A repository read as `established` when it is actually a genuine initial build (or the reverse) is graded against a benchmark that does not describe it, and nothing in the report says so unless the detection signals below are inspected.

**Scaffold root commit detection (code-quality-metrics-fex3, GitHub #71).** A root commit that introduces zero production files — a GitHub repo-reservation scaffold of just `LICENSE` and `README.md`, no source — is not the start of the build. `findEffectiveRootSha` (`lib/git.js`) extends the existing test/production/excluded file classification with one further structural check, `isRepoFurniture` against `CONFIG.REPO_FURNITURE_PATTERNS` (`lib/config.js`) — a named, explicit list of conventional repo-scaffolding filenames (`LICENSE`/`LICENCE`/`COPYING`, `README`, `.gitignore`, `.gitattributes`, `CODE_OF_CONDUCT`, `CONTRIBUTING`, `SECURITY`, `CHANGELOG`, anything under `.github/`), not a tuned age or commit-count constant — and walks forward to the first commit that does introduce a production file, using that as the effective root instead. This is caught under bare default configuration: no `ANALYSIS_IGNORE_PATTERNS` entry or `.codemetrics.json` is required, since repo furniture is classified structurally regardless of what a target repository has configured. Measured case: stride-nyc/73V's root commit `ec1026c4` (2022-01-26) adds only `LICENSE` + `README.md`, then nothing for three years, then 2,928 commits from 2025-01-24 onward — without this fix, the repository classifies `established` permanently regardless of window size. `project_lifecycle_signals.scaffold_root_detected` reports whether this substitution happened.

**`scaffold_root_detected: true` does not by itself widen the analyzed window.** `findEffectiveRootSha` correctly resolves 73V's effective root to `2858c02e` (2025-01-28), but `node local-code-metrics.js --since 2025-01-01` against that repository's real history still analyzes only the newest 50 commits (`CONFIG.MAX_COMMITS`-capped regardless of `--since`/`--days` — see "Analysis Window" above), so `project_lifecycle` still reads `established` for that specific invocation even with `scaffold_root_detected: true`, since 73V logged 2,928+ commits in 2025 alone and the effective root sits far outside any 50-commit window drawn from its recent history. This is failure mode 1 from GitHub #71 (window narrower than the repository's history), a distinct, pre-existing limitation scaffold detection does not touch. See "Project Lifecycle and Change-Size Withholding" in `metrics-specification.md` for the full mechanism and this caveat.

**Operator override: `--lifecycle` (code-quality-metrics-zkhq, GitHub #71).** `--lifecycle initial-build|established`, plus a matching `lifecycle` key in `.codemetrics.json`, overrides a misdetected `project_lifecycle` for a repository the structural detection above still gets wrong — including one whose effective root, even correctly identified, still falls outside the analyzed window. Mirrors `--history`'s own shape exactly: `project_lifecycle` is the effective value, `project_lifecycle_detected` is always the raw structural result regardless of any override, and `project_lifecycle_override` is the override itself or `null`. CLI takes precedence over the `.codemetrics.json` key.

### DORA Archetype Classification

The summary includes a `dora_archetype` field classifying the repository into one of four archetypes. **The names are borrowed from DORA, the method is not.** DORA derives seven archetypes from cluster analysis of survey responses covering burnout, friction and delivery instability; this derives four from commit shape. `classifyDoraArchetype` (`lib/metrics.js`) reads its boundaries directly from the calibrated bands in `lib/thresholds.js` rather than a separate hand-copied set, so every boundary value it compares against (large-commit healthy and critical, sprawling-commit healthy and critical, test-coverage healthy, uncovered-prod healthy) traces to the same calibration as the Key Metrics table above, and the function holds no hardcoded numeric literal at all. Only the *grouping* of those signals into four named archetypes is this toolkit's own invention; DORA does not publish this grouping, and message-quality no longer plays any part in it (its own band was demoted to informational — see below). Do not read the field as a DORA classification.

It classifies the repository based on large commit %, sprawling commit %, test coverage rate, and uncovered prod rate, evaluated in this order:

| Archetype | Signal |
|-----------|--------|
| `harmonious-high-achiever` | large commits below `LARGE_COMMITS_PCT.healthy` AND sprawling commits below `SPRAWLING_COMMITS_PCT.healthy` AND test coverage above `TEST_COVERAGE_RATE.healthy` AND uncovered prod below `UNCOVERED_PROD_RATE.healthy` (currently ≤18%, ≤18%, ≥23%, ≤10%) |
| `legacy-bottleneck` | sprawling commits above `SPRAWLING_COMMITS_PCT.critical` AND large commits above `LARGE_COMMITS_PCT.critical` |
| `foundational-challenges` | large commits above `LARGE_COMMITS_PCT.critical` alone — `uncovered_prod_rate` has no critical bound to add a second path |
| `mixed-signals` | none of the above |

**`legacy-bottleneck` and `foundational-challenges` are currently unreachable.** Both read a
`.critical` bound that is `null` right now (`LARGE_COMMITS_PCT.critical` and
`SPRAWLING_COMMITS_PCT.critical` — see the Key Metrics table above), and `classifyDoraArchetype`
compares through `exceedsCritical`, which returns `false` whenever `.critical` is `null` rather
than fabricating a breach by coercing `null` to `0`. Every currently-calibrated metric is
two-band, so no repository, however extreme, can land on either archetype until a future
re-measurement restores a three-band metric; every run either reads `harmonious-high-achiever`
or `mixed-signals` today. The rendered report states this explicitly on a `mixed-signals`
result: `describeArchetypeBody` (`lib/report-template.js`) appends a clause naming which
archetype is unreachable and why, via `archetypeUnreachableNote`, read live from `THRESHOLDS`
rather than hardcoded — a reader could not otherwise tell a genuine no-match apart from a
structurally unreachable one, which today is every `mixed-signals` result.

### Claude API Integration (Optional)

Set `ANTHROPIC_API_KEY` to enable diff-level analysis of high-risk commits. When active:
- Up to 5 commits are selected (large commits with additions > deletions × 3)
- Each commit is analyzed for AI-generated code patterns and architectural concerns
- Results are written to `local_claude_analysis.json`
- Commit metrics are annotated with `ai_confidence`, `risk_score`, `patterns`, and `architectural_concerns`

The script degrades gracefully when the key is absent. No SDK install is required to run.

## Configuration

Two files hold configuration, each the single source of truth for a different kind of value, both shared across all three components. `CONFIG` in `lib/config.js` holds detector and analysis settings: what counts as a large or sprawling commit, the message-quality word count, the AI pre-filter and duplicate-detector tuning, and test-file patterns. `THRESHOLDS` in `lib/thresholds.js` holds the calibrated healthy/critical verdict bands described in Key Metrics and Thresholds above. Both GitHub Actions workflows `require('./lib/config')` and `require('./lib/thresholds')` directly, so a change to either file propagates automatically to the local script and both workflows with no manual synchronization — but the workflows do not surface a target for every band `THRESHOLDS` holds. Between them, `code-metrics.yml` and `pr-metrics.yml` display a target for large-commit %, sprawling-commit %, test-coverage rate, test-isolation rate, and uncovered-prod rate; `avg_lines_changed`, `p90_lines_changed`, `p90_files_changed`, and `duplication_pct` are computed and included in the summary JSON but shown without a target in either workflow. Key `CONFIG` values:

| Key | Default | Description |
|-----|---------|-------------|
| `LARGE_COMMIT_THRESHOLD` | 100 | Prod lines changed to flag as large |
| `SPRAWLING_COMMIT_THRESHOLD` | 5 | Files changed to flag as sprawling |
| `MESSAGE_QUALITY_MIN_WORDS` | 10 | Word count threshold for non-conventional messages |
| `AI_ANALYSIS_MAX_COMMITS` | 5 | Max commits sent to Claude per run |
| `AI_DIFF_MAX_CHARS` | 4000 | Diff truncation limit for Claude API calls |
| `AI_RISK_ADDITIONS_RATIO` | 3 | Additions/deletions multiplier for Claude pre-filter |
| `DUPLICATE_MIN_LINES` | 10 | Minimum lines for jscpd to flag a duplicate block |
| `DUPLICATE_MIN_TOKENS` | 100 | Minimum tokens for jscpd to flag a duplicate block |
| `DUPLICATE_IGNORE_PATTERNS` | 11 patterns | Globs jscpd ignores: vendored (`deps`, `vendor`, `third_party`, `node_modules`, `.terraform`), generated, and five lock files including `.terraform.lock.hcl`, which the `*.lock` catch-all misses because its name ends in `.hcl`. Per-repo additions go in the target's `.codemetrics.json`, not here (class A, so bands still apply) |
| `ANALYSIS_IGNORE_PATTERNS` | 0 patterns | Globs excluded from the commit-shape metrics: large/sprawling commit, prod/test classification, uncovered prod rate, and (GitHub #90) the line-count distributions -- `avg`/`p50`/`p90`/`p95_lines_changed` and `avg`/`p50`/`p90_files_changed`, built from `analyzeCommit`'s `counted_additions`/`counted_deletions`/`counted_files_changed` (`lib/git.js`), not the raw whole-diff totals. A matched path counts as neither test nor production. `total_additions`, `total_deletions` and `files_changed` stay whole-diff regardless of this setting, by design (see `lib/git.js`'s own comment on those fields), as does `net_additions_ratio`. Default is empty, deliberately: seeding it would change every existing measurement, including the calibration observations. Per-repo additions go in the target's `.codemetrics.json` (class A, so bands still apply) |
| `REPO_FURNITURE_PATTERNS` | 10 patterns | Conventional repo-scaffolding filenames (`LICENSE`/`LICENCE`/`COPYING`, `README`, `.gitignore`, `.gitattributes`, `CODE_OF_CONDUCT`, `CONTRIBUTING`, `SECURITY`, `CHANGELOG`, anything under `.github/`) used only by scaffold root commit detection (`isRepoFurniture`, `lib/git.js`'s `commitIntroducesProductionFiles`) — not folded into `analyzeCommit`'s own prod/test classification, so no other metric is affected |
| `BOT_ACCOUNT_PATTERNS` | 6 patterns | Dependency/CI bot account name patterns (dependabot, renovate, github-actions, release/version-bump bots, generic `[bot]` accounts), matched against author and committer. `AI_AGENT_PATTERNS` below always takes precedence: a bot-flavored AI-agent account name is never classified as a bot (`isBotCommit`, `lib/metrics.js`) |
| `AI_AGENT_PATTERNS` | 6 patterns | AI coding agent name patterns (Claude, Copilot, Cursor, Devin, Aider, Codex), matched against author, committer, and `Co-Authored-By:` trailers. A match here exempts a commit from `BOT_ACCOUNT_PATTERNS` unconditionally — these commits are the subject this toolkit measures, never noise |
| `EXCLUDE_BOT_COMMITS` | `true` | Whether dependency/CI bot commits are excluded from the analyzed window (issue #62). Excluded commits are counted and reported (`bot_commits_count`/`bot_commits_pct`), never silently dropped |

Test file detection uses patterns for JS, Python, Go, Java, and C#. Extend `TEST_FILE_PATTERNS` in `lib/config.js` — the change propagates automatically to all three components.

### Duplicate Detection Tuning

The defaults (`DUPLICATE_MIN_LINES: 10`, `DUPLICATE_MIN_TOKENS: 100`) match what SonarQube uses for its own duplicated-lines gate, so the measured percentage is comparable to the roughly 3 to 23 percent range published across clone studies with stated methods. They were previously 5 and 50, half of Sonar's minimum in both dimensions; Wagner et al. measured the same three systems at both settings and found roughly a threefold difference, so position in that published range depends more on detector settings than on the codebase. Raising them lost the one alignment this toolkit had with a primary source, since 5 lines matched GitClear's definition of a duplicate block. The trade is deliberate: GitClear's floor is for detecting a clone, Sonar's is for calling one a quality problem, and this toolkit reports a rate rather than a clone list.

**Following any of the three blocks below costs the verdict, not just the number.** `DUPLICATE_MIN_LINES` and `DUPLICATE_MIN_TOKENS` are the two "class B" keys a repo-local `.codemetrics.json` can override (`lib/repoConfig.js`, documented in `AGENTS.md`'s "Per-Repo Configuration Overrides"); before that mechanism existed, this table was aspirational, since there was nowhere to put a per-repo value. It is mechanical now, but only partly: every block changes at least one class B key, and `lib/report.js`'s `buildMetricCatalog` withholds the `duplication_density_pct` verdict for the run whenever `summary.config_sources.class_b_overridden` is true, the same way squashed history withholds the commit-unit verdicts. The value is still measured and reported; there is just no healthy/critical call attached, because the band above was derived at the default 10/100 sensitivity and a percentage measured at a different sensitivity is not comparable to it (the threefold difference cited above). A verdict for that language returns only once a reference set is measured and derived at its settings through `calibration/derive-bands.js`.

The examples below predate the per-repo override mechanism and one is now moot: the Java row recommends exactly the new global default. Other languages may still need higher values to suppress boilerplate, but adopting any of them via `.codemetrics.json` gets a working override and a withheld verdict, not a working override with the band intact:

```js
// Java — longer method signatures and boilerplate
DUPLICATE_MIN_LINES: 10,
DUPLICATE_MIN_TOKENS: 100,
DUPLICATE_IGNORE_PATTERNS: ['**/*Test.java', '**/generated/**'],

// Python — decorators and docstrings inflate token counts
DUPLICATE_MIN_LINES: 8,
DUPLICATE_MIN_TOKENS: 80,
DUPLICATE_IGNORE_PATTERNS: ['**/migrations/**', '**/__pycache__/**'],

// Go — interface implementations repeat predictably
DUPLICATE_MIN_LINES: 8,
DUPLICATE_MIN_TOKENS: 75,
DUPLICATE_IGNORE_PATTERNS: ['**/*_test.go', '**/vendor/**'],
```

## Workflow Permissions

The GitHub workflows require:
- `contents: read`
- `issues: write` (code-metrics.yml)
- `pull-requests: write` (pr-metrics.yml)
