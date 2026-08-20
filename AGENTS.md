# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Working Inside an Isolated Worktree

An agent given its own git worktree runs from `.claude/worktrees/agent-<id>/`. The harness
will refuse any shell command it cannot verify stays inside that worktree:

> This agent is isolated in the worktree ..., but this command is too complex to verify that
> it stays inside the worktree; break it into plain, separate commands.

The error names the redirect specifically. In practice the guard rejects commands that could
write or read outside the worktree, which includes output redirection (`>`, `>>`), heredocs
that write files (`cat > f <<'EOF'`), pipes into files, `cd` to another path, and command
substitution whose result the harness cannot resolve.

**Work with it rather than around it:**

- One plain command per call. Do not chain a redirect onto a `&&` sequence.
- Use the Write and Edit tools for file content instead of `cat > file <<'EOF'`. This is the
  single biggest source of the error.
- Never `cd`. You already start in your worktree, and paths are relative to it.
- Let a command print its output and read it from the tool result. Do not redirect it to a
  file to read it back.
- To filter long output, prefer the command's own flags (`git log --oneline -5`) over piping
  into `head` or `tee` and then reading a file.
- `git` operations target your own worktree automatically. Do not pass absolute paths to
  another checkout, and do not try to move a branch that is checked out elsewhere: create
  your own branch and report its name so the parent can integrate it.

**Whoever briefs the agent owns this.** A brief that shows examples using heredocs or
redirects will produce an agent that hits the guard repeatedly and burns turns recovering.
Write brief examples in the form the guard accepts.

## Starting From the Right Commit

**A worktree does not start on the branch you think it does.** New worktrees in this project
are created from a squashed pull-request merge on the main line, not from the feature branch
the work belongs to. A worktree's ref state does not match the main checkout's, so this is
misleading rather than merely wrong:

```
git rev-parse fix/my-feature      # inside a worktree: returns a commit from the main line
```

Measured cost: five agents in one session started from the wrong base. Three recovered by
re-branching once they noticed. One did not notice and built eight commits against a tree
missing five test suites, a renamed field and a re-derived threshold; its work merged only
because it happened to touch four files that had not changed since. One stopped correctly,
having found its worktree 156 commits behind.

**Whoever writes the brief gives the explicit base SHA.** A branch name is not enough, because
the branch name is exactly what resolves incorrectly. Get it from the main checkout:

```
git rev-parse HEAD
```

Put that SHA in the brief. The agent creates its own branch from it. Do not tell an agent to
check out the shared branch itself: it is checked out in the main checkout and git will refuse.

```
git checkout -B my-work-branch <sha-from-the-brief>
```

The objects are already in the shared store, so no fetch is needed.

**Every brief states the expected test count, and a mismatch is a hard stop.** This is the
check that catches the problem before any code is written:

> Confirm `npm test` shows N tests across M suites before starting. If you see a different
> number, STOP and report it. Do not proceed.

Phrase it as a stop, not as a confirmation. An agent told merely to "confirm the baseline" saw
329 where 390 was expected, reported the discrepancy honestly, and carried on anyway. The
count is cheap to check and is the only signal that reliably distinguishes a stale base from a
correct one, since a stale tree is internally consistent and its own tests pass.

## Dispatching Agents

**State explicitly whether the agent may dispatch further agents.** In most cases it may not.
An agent briefed only to read two files once dispatched its own background fork, which wrote and
committed implementation code concurrently in the same worktree. Nothing prevented it and nothing
detected it; the work was only salvaged because the parent audited every commit the fork produced.
A brief that is silent on this is not a brief that forbids it.

**Give the prohibition its reason, not just the rule.** A second agent dispatched a fork despite
the instruction appearing in the third line of its brief. That fork was harmless: it only
replayed its parent's red/green cycles and cleaned up after itself, and the work proved sound
when the parent replayed the same cycles independently. But a bare "do not dispatch further
agents" invites an agent to conclude that a read-only verification fork is outside the spirit of
the rule, which is a reasonable reading of a rule stated without its purpose.

The reason is worth stating because it is not obvious:

> Verification you dispatch yourself is not independent. A fork shares your context and your
> assumptions, so it will tend to confirm what you already believe. The parent replays every RED
> against its parent commit regardless, so a verification fork adds nothing a reader can rely on
> while looking like a control that was applied.

That last part is the real cost. A report saying "replayed by an independent fork" reads as
stronger evidence than "I checked my own work", and it is not. Self-reported TDD is not evidence,
and neither is TDD reported by something the same agent spawned.

## Running the Report Against an External Repository

`local-code-metrics.js` writes its JSON and HTML output to `process.cwd()` under fixed names, so
two runs in the same directory overwrite each other with no warning. This is the same shape as the
jscpd shared-output race, which was fixed in the tool; this one lives in how runs are dispatched.

**Copy the repository into your scratchpad and run there.** Never run in place against a shared
fixture:

- Two concurrent agents doing it clobbered each other's output. Irreplaceable pre-fix evidence
  survived only because it had been renamed out of the default output paths earlier, by luck
  rather than design.
- A copy costs a blobless clone and removes the hazard entirely.
- If a run must happen in place, say so in the brief and ensure no other agent is running against
  that repository at the same time.

Anything a repository holds that you did not create is evidence until proven otherwise. Do not
delete untracked files there to tidy up, and back them up before any run that could overwrite them.

## Analysis Window and Branch Spread (code-quality-metrics-g10, code-quality-metrics-8sq)

With no `--since`/`--days`, the default window is HEAD-anchored, not anchored on today: the
newest `CONFIG.MAX_COMMITS` commits across all analyzed branches, globally sorted by date, not
the first commits a branch loop happens to encounter. Anchoring on today made a repository
whose newest commit predates the calendar window report zero and made the operator guess a
`--days` value; every repository analyzed in this project's own sessions needed that guess.
An explicit `--since`/`--days` window that still returns zero after the existing trunk
fallback widens automatically to the newest `CONFIG.MAX_COMMITS`, ignoring the requested
boundary, and the run states plainly (in both the JSON and the HTML) that it widened and from
what boundary. The actual analyzed span is always reported, never the requested window or
"today" -- see CLAUDE.md's "Analysis Window" section for the field names and the HTML masthead
behavior.

Fixing the window does not fix a sample spread thin across many abandoned branches (30 stale
branches still contributes about one commit each to a HEAD-anchored top-N slice when none of
them has more than a handful of commits total). These are separate defects. The chosen fix for
the branch-spread case is visibility, not a filter: `analyzed_branch_commit_counts` and
`branches_with_analyzed_commits` in the summary, and a masthead phrase pairing the commit count
with the branch count, so a reader sees "50 commits ..., across 7 branches" and knows what they
are looking at. No recency bound is invented for this; a repo owner wanting one would need to
label it a convention, which is exactly what this project avoided doing here.

Neither change touches `.github/workflows/code-metrics.yml` or `pr-metrics.yml`, which window
against the GitHub REST API on their own schedule -- out of scope for this pair of issues.

## Per-Repo Configuration Overrides

`lib/config.js`'s `CONFIG` is the defaults layer, shared by the local script and both GitHub
workflows. A fact about one specific analysis target (a vendored directory that exists in that
repo and nowhere else, a language-specific duplicate-detector tuning) does not belong there,
because it is wrong for every other repo the tool is pointed at. Those facts belong in a
`.codemetrics.json` file committed to the target repository itself, resolved by
`lib/repoConfig.js`'s `resolveConfigOverrides` from `process.cwd()` (code-quality-metrics-wcj).

**Precedence, highest first:**

1. CLI flags — the existing `--since` and `--days` on `local-code-metrics.js`.
2. An explicit `--config <path>` (code-quality-metrics-ap7).
3. `.codemetrics.json` in the analysis target, resolved from `process.cwd()`.
4. `lib/config.js`'s own defaults.

Three tiers when `--config` is not passed, matching `lib/env.js`'s reasoning: `loadEnv` needs a
tool-local `.env` tier because a secret has to live somewhere outside the repo under analysis;
configuration does not, because `lib/config.js` already is that tier. Four tiers when `--config`
is passed — see below for why that tier exists and how it composes with tier 3.

**`--config <path>` (code-quality-metrics-ap7): an override from outside the analysis target.**
Tier 2's own `.codemetrics.json` mechanism covers a repository the operator owns — it can be
committed there. It does not cover running this tool in a scripted way against a repository the
operator does not control, where committing a file into someone else's repo is not an option and
writing one into every fresh clone before each run does not scale. `--config` supplies the same
override shape from a path the operator does control, independent of the target's own tree.
`resolveConfigOverrides(defaults, targetDir, explicitConfigPath)` takes this as its third
parameter — the same function tier 3 already used, not a new module.

- **A repo-keyed section inside `lib/config.js` was considered and rejected**, the same way it was
  for tier 3 (code-quality-metrics-wcj): a per-target fact living in config shared by the local
  script and both workflows is the defect this whole mechanism exists to avoid, not a fix for it.
  `--config` was rejected once already, during `wcj`'s own design, on the grounds that "the caller
  must remember it on every invocation." That objection is about a *human* caller; a script that
  invokes this tool does not forget a flag, so the objection does not hold for the scripted case
  this issue was filed for.
- **Missing or non-file path fails loudly.** A `--config` path that does not exist, or that names a
  directory rather than a file, throws immediately (`--config path not found: <path>` /
  `--config path is a directory, not a file: <path>`) rather than silently falling back to the
  target's own `.codemetrics.json` or to defaults. A scripted run has nobody watching it in real
  time, so a typo'd path must be loud, not swallowed into an unnoticed default run. This is
  deliberately different from a missing tier-3 `.codemetrics.json`, which is the ordinary
  unconfigured case and stays silent.
- **Composes with tier 3, rather than replacing it.** Both a target-local `.codemetrics.json` and
  an explicit `--config` file are applied, in precedence order (target file first, `--config`
  second), rather than `--config` displacing the target file entirely. The existing array-union
  semantics (see Class A below) already establish the norm this follows: an operator adding an
  override must never be the reason a target repo's own already-committed conventions silently
  stop applying. A class A array key unions across all three tiers that can contribute a value —
  defaults, target file, `--config` file. A class B scalar key from `--config` wins over the same
  key from the target file, since `--config` is the higher tier, but still leaves
  `classBOverridden` (and therefore `config_sources.class_b_overridden`) true exactly as a
  target-file-only override would.
- **Format is JSON for this tier too**, for the same reason as tier 3 below.
- **`config_sources.files` names whichever file actually contributed an override**, `--config`'s
  path included, alongside the target file's own path when both contribute. `lib/report.js`'s
  `buildMetricCatalog` reads only `config_sources.class_b_overridden`, never which route produced
  it, so a class B override withholds the `duplication_density_pct` verdict identically whichever
  tier supplied it.
- Neither GitHub workflow gains a `--config` flag: they run inside the target repository's own
  checkout, where the tier-3 `.codemetrics.json` resolution from `process.cwd()` already works,
  so they have no scripted-external-repo case to cover.

**Format is JSON, not JS.** A `.js` config file would mean `require()`-ing arbitrary code from
the repository under analysis, and this tool is routinely pointed at repos the operator does not
control — a code-execution hazard for no benefit. JSON also needs no new dependency, so both
GitHub workflows could read the same file unchanged if they chose to (neither does today; only
`local-code-metrics.js` calls `resolveConfigOverrides`).

**Six keys are overridable: five `CONFIG` keys in two classes, plus one meta key that is not a
`CONFIG` value at all:**

- Class A — `DUPLICATE_IGNORE_PATTERNS`, `TEST_FILE_PATTERNS`, `ANALYSIS_IGNORE_PATTERNS`. These
  correct what a measurement counts, not how sensitive detection is. Bands still apply. Array
  values **union** with the defaults rather than replacing them: a team adding one vendored
  directory should not have to restate the ten default patterns to keep them, since forgetting
  one would silently inflate its own duplication number. There is no removal syntax; nobody has
  asked for one.
  `ANALYSIS_IGNORE_PATTERNS` (code-quality-metrics-3yd, fixing code-quality-metrics-y8j) is class
  A for the same reason as the other two: excluding a path from `large_commit`,
  `sprawling_commit`, the line-count distributions, prod/test classification, and
  `uncovered_prod_rate` changes what those metrics count, not how sensitively any detector runs,
  so the calibrated bands still apply to a run that configures it. Its own default is empty
  (unlike `DUPLICATE_IGNORE_PATTERNS`'s nine vendored/generated patterns): seeding it would change
  every existing measurement, including the 34 calibration observations the provenance gate in
  `__tests__/thresholdProvenance.test.js` checks against `CONFIG`, so an empty default keeps the
  introduction of this key provably behaviour-preserving. A matched path counts as neither test
  nor production; it stays in the raw totals (`total_additions`, `total_deletions`,
  `files_changed`) so a reader comparing the report to `git log` still sees the real commit, but
  it is excluded from every scored metric and from the file count `sprawling_commit` is judged
  against.
- Class B — `DUPLICATE_MIN_LINES`, `DUPLICATE_MIN_TOKENS`. These are detector sensitivity, and
  overriding either one **invalidates the duplication band**: Wagner et al. (SANER 2016) measured
  roughly a threefold difference in reported duplication on the same systems at different
  minimums, so a percentage measured at an overridden sensitivity is not comparable to a band
  derived at the default. A class B override still changes what jscpd measures, but
  `lib/report.js`'s `buildMetricCatalog` withholds the `duplication_density_pct` verdict whenever
  `summary.config_sources.class_b_overridden` is true, the same way squashed history withholds the
  commit-unit verdicts.
- Meta — `lifecycle` (code-quality-metrics-zkhq, GitHub #71 part 1): the `project_lifecycle`
  operator override, mirroring the existing `--history` CLI flag's shape. Recognized by
  `lib/repoConfig.js`'s `META_KEYS` so it does not trip the "not a recognized override key" guard
  when it coexists with a real `CONFIG` override in the same file, but never merged into
  `effective` — it is not a `CONFIG` value, so `resolveConfigOverrides`'s `effective` object is
  untouched by it. `local-code-metrics.js` reads the value back out of `sources` (surfaced as
  `config_sources.overrides.lifecycle`) and applies it with the same CLI-over-config-file
  precedence every other override here follows: a `--lifecycle` CLI flag wins over a `lifecycle`
  key set in `.codemetrics.json`.

`LARGE_COMMIT_THRESHOLD` and `SPRAWLING_COMMIT_THRESHOLD` are **never overridable**: they are the
bars the six-repository reference set was measured against (`lib/thresholds.js`), and a repo
setting its own bar is the exact circularity `calibration/derive-bands.js` exists to escape. A
team wanting different bars re-derives against its own reference set through
`calibration/derive-bands.js`, a reviewed act, not a config value. `resolveConfigOverrides`
rejects an attempt to override either of these with a message that says why, and rejects any
other unrecognized key outright rather than silently ignoring it.

**`MAX_COMMITS` is deliberately absent from every `.codemetrics.json` key class** (it is not in
`CLASS_A_KEYS`, `CLASS_B_KEYS`, or `META_KEYS`, so a `.codemetrics.json` entry for it still fails
with "not a recognized override key"). How many commits one run analyzes is a property of that
run, not a fact about the repository under analysis the way the six keys above are; a repository
able to widen its own sample size via a config file committed into its own tree is exactly the
self-selection this override mechanism otherwise exists to prevent. The override this project
does support instead is CLI-only: `--max-commits <n>|unbounded` on `local-code-metrics.js`,
mirroring `--history`/`--lifecycle`'s shape (parsed the same way in `parseCliArgs`, recorded the
same way as `max_commits_override` in the summary). See CLAUDE.md's "Analysis Window" section for
the full flag semantics, its interaction with `--since` and the empty-window widening fallback,
and the `CONFIG.MAX_COMMITS_SAFETY_LIMIT` guard against an unbounded run over a very large
repository (GitHub #89).

**Discoverability:** every run's `local_metrics_summary.json` carries a `config_sources` field
alongside `history_granularity` — the file(s) that contributed an override, the effective value
of every overridden key, and whether a class B override is in effect. An override that changes
the headline number by an order of magnitude has to be visible in the output, not only in a file
the reader may not have. `ANALYSIS_IGNORE_PATTERNS` follows the same precedent through two more
fields (code-quality-metrics-3b6): `analysis_exclusions` reports what the configured patterns
actually removed (count, line share, the effective pattern list), and `vendored_generated_share`
reports the same shape of number against `DUPLICATE_IGNORE_PATTERNS`'s own existing
vendored/generated defaults — computed always, whether or not `ANALYSIS_IGNORE_PATTERNS` is
configured, because that is the half of this feature that helps a repo owner who has not yet
found the problem. Both render in `local_drift_report.html`'s Analysis Scope section too, not
only in the JSON.

**Example.** `stride-nyc/flight-info-spike` has a `designs/` directory that is not a convention
this tool's shared defaults should carry for every repo it analyzes (it previously measured 16.50
percent whole-repo duplication with that directory included, against 1.23 percent once excluded —
an order-of-magnitude difference from one setting). That repo's own `.codemetrics.json` — not
created here; this project does not modify that repository — should read:

```json
{
  "DUPLICATE_IGNORE_PATTERNS": ["**/designs/**"]
}
```

This unions `**/designs/**` onto `lib/config.js`'s existing ignore patterns (`**/deps/**`,
`**/vendor/**`, and so on) rather than replacing them, so a run against that repo still excludes
every default vendored/generated path in addition to `designs/`.

**Consequence for `CLAUDE.md`'s "Duplicate Detection Tuning" table:** its Java, Python and Go
example blocks all change `DUPLICATE_MIN_LINES`/`DUPLICATE_MIN_TOKENS` — class B. A repo that
follows that table via its own `.codemetrics.json` gets a working override, but
`duplication_density_pct` comes back withheld for that run until a reference set exists for that
language's detector settings. The table describes a capability the tool now has, but following it
does not make the band travel with it.

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Version-controlled: Built on Dolt with cell-level merge
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Quality Gates

**A green suite does not prove the work is committed.** Verify git state directly; do not infer
it from test results. After any merge or commit you intend to report as done:

```bash
git log --oneline -1          # is HEAD what you think it is?
git status --short            # is anything still uncommitted?
```

This is not pedantry. In one session a `git stash` run during an investigation, while a merge
was staged, silently cleared `MERGE_HEAD` and converted the merge into ordinary working-tree
edits. The file contents were all present, so the suite passed at the expected count and the
work was reported as merged. Only the commit was missing, and the branch had to be rebuilt.
`git stash` is not safe to run mid-merge; finish or abort the merge first.

The same principle covers the stale-base problem above: a stale tree is internally consistent
and its own tests pass. Test results tell you the code in the working tree is coherent. They
tell you nothing about which commit you are on, whether it is the one you meant, or whether
your changes are recorded anywhere durable.

Run these after each implementation step, not only at the end of a session:

**When renaming a field that appears in another file's JSDoc `@param` type**, update the JSDoc in the same step as the rename — do not defer to a later step. A transient typecheck failure between steps is a process violation. Run `npm run typecheck` immediately after any rename before proceeding.

```bash
npm test          # all tests must pass before moving to next step
npm run lint      # lint must be clean before moving to next step
```

When introducing new tooling (new lint rules, type checking, config changes), run the gate immediately after setup — before writing any tests or code — to catch configuration gaps early.

### Provenance Gates

`__tests__/thresholdProvenance.test.js` ties `lib/thresholds.js` back to the data, settings and
documents that describe it. Every defect it catches shares one shape: **a derived value outliving
the thing it was derived from.** That shape produced a duplication band scored roughly three times
too permissively for weeks, eight workflow references to keys another change had removed, and stale
band tables in four documents. None of it was visible to a test that only checks code against code.

Four gates plus one guard:

| Gate | Fails when |
|---|---|
| band derivation | `lib/thresholds.js` disagrees with what `calibration/derive-bands.js` derives from `observations.json` |
| observation provenance | an observation feeding a band records different detector settings than `CONFIG` holds |
| CLAUDE.md table | the Key Metrics table states a band the code does not hold |
| coverage map | a tile shows a Critical row with no critical bound behind it, or any band for an informational metric |
| workflow references | a `THRESHOLDS.KEY.subKey` path in either workflow does not resolve |

**If you change a detector setting in `lib/config.js`, expect the provenance gate to fail.** That is
the gate working: the observations were measured at the old setting, so the band derived from them
no longer describes what the tool now measures. Re-measure, do not adjust the gate. Raising
`DUPLICATE_MIN_LINES`/`DUPLICATE_MIN_TOKENS` from 5/50 to 10/100 moved measured duplication by about
3x at the median across 24 windows, so the gap is not cosmetic.

**If you withdraw or add a band, expect the table and coverage-map gates to fail.** Update the
documents, never the expectation. A withdrawn band left on display is a verdict the tool no longer
issues.

Do not weaken a gate to land a change. If one blocks you and you believe it is wrong, say so and
leave it failing rather than editing the assertion.

**When modifying `.github/workflows/` or `lib/`**, run a workflow smoke test:

```bash
gh workflow run code-metrics.yml --ref <your-branch>
gh run watch                          # wait for completion
gh run download <run-id> --dir /tmp/smoke && cat /tmp/smoke/*/metrics_summary.json | python3 -m json.tool
```

Verify:
- The artifact contains `velocity_commits_per_day` (numeric, not absent)
- No `Cannot find module` errors in the log
- Confirm the run's commit SHA matches your branch HEAD: `gh run view <run-id>`

A green run ≠ new code ran. The artifact is the proof.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
