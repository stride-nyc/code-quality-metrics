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

## Dispatching Agents

**State explicitly whether the agent may dispatch further agents.** In most cases it may not.
An agent briefed only to read two files once dispatched its own background fork, which wrote and
committed implementation code concurrently in the same worktree. Nothing prevented it and nothing
detected it; the work was only salvaged because the parent audited every commit the fork produced.
A brief that is silent on this is not a brief that forbids it.

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

Run these after each implementation step, not only at the end of a session:

**When renaming a field that appears in another file's JSDoc `@param` type**, update the JSDoc in the same step as the rename — do not defer to a later step. A transient typecheck failure between steps is a process violation. Run `npm run typecheck` immediately after any rename before proceeding.

```bash
npm test          # all tests must pass before moving to next step
npm run lint      # lint must be clean before moving to next step
```

When introducing new tooling (new lint rules, type checking, config changes), run the gate immediately after setup — before writing any tests or code — to catch configuration gaps early.

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
