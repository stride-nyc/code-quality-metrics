# Scrub an AI Drift Report for external viewing

Reusable instruction for an agent. Paste it, or point an agent at this file, with the
report path substituted.

> **This process ends with a human review that cannot be skipped.** The agent's final act is
> to stop and ask you to read its summary. Automated scrubbing catches strings; it does not
> catch meaning. See [Human review](#human-review-required) at the end.

---

## Task

Scrub `<PATH>/local_drift_report.html` so it can be viewed outside the client context. Write
the result to `local_drift_report.scrubbed.html` in the same directory. Never modify the
original.

## Derive the sensitive list first, do not guess

From the repository the report was generated in, collect:

1. Author and committer names: `git log --all --format='%an%n%cn' | sort -u`
2. Commit subjects in the report's window: `git log --all --format='%s'`
3. Tracked file and directory paths: `git ls-files`
4. Branch names: `git branch -a --format='%(refname:short)'`
5. The repository and directory name itself

**`--all` is not optional on 1 and 2.** This toolkit's whole premise is analysing commits on
unmerged feature branches, so the report routinely names authors and subjects that a plain
`git log` on the default branch never reaches. Measured: on one repository, `git log` alone
missed an author who appears in the report, and the scrub would have verified clean against a
list that never contained that name. Note also that an author's initials can survive inside a
branch name (`origin/jw/create-staging-env`) after the name itself is replaced.

If you are working alongside other agents, write any scratch file you create under a name
unique to your target repository. Concurrent runs share a scratchpad, and a generic name like
`scrub.py` will be silently overwritten by another agent's script targeting a different
repository. If a file you wrote comes back with contents you did not write, do not run it: say
so, rename yours, re-read it to confirm, and continue.

This list is what you verify against at the end. Anything you cannot derive this way, you
cannot claim to have removed.

## Replace, do not delete

Blanking makes the report unreadable. Substitute consistently, so the same input always maps
to the same output within one report:

| Leaks | Replace with |
|---|---|
| Author / committer names | `Developer A`, `Developer B`, … |
| File and directory paths | `module-1/file-1.ts`, preserving the extension |
| Commit subjects | `Commit subject redacted` |
| SHAs (7-40 hex chars) | a fixed-width placeholder, e.g. `0000001` |
| Branch names | `branch-1`, `branch-2`, … |
| Ticket IDs, PR numbers (`#1007`, `TD 1258`, `ABC-123`) | `#000`, `TICKET-0` |
| Organisation, product or brand names anywhere in prose | `the organisation` |

Keep the mapping in your working notes only. Do not write it to a file that travels with the
report.

## Never touch

- Any number: metric values, percentages, band boundaries, commit counts, dates
- Metric names and band language ("Healthy below 19, critical above 30")
- The generic explanatory prose about what each metric means
- HTML structure, CSS, classes, layout

A scrubbed report must produce the identical reading to the original for someone who does not
know the client.

## Read the narrative prose carefully

The findings section is model-generated prose about this specific codebase. It can name a
module, a domain concept or a feature without using any string you derived above. Read it
sentence by sentence. If a sentence only makes sense to someone who knows the product,
rewrite it in generic terms or cut it.

This is the part a search-and-replace will miss, and the reason the human review below exists.

## Verify before reporting done

For every string in the derived list, grep the scrubbed file. Report the count of surviving
matches, which must be zero. Show the command you used.

Then grep the scrubbed file independently for:

- `[0-9a-f]{7,40}` (SHAs)
- paths matching `[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+\.[a-z]{2,4}`
- `#[0-9]+` and `[A-Z]{2,}[- ][0-9]+`

Report what each returns. A non-zero result you believe is safe must be named and justified,
not silently accepted.

## Report

- Sensitive strings found and replaced, by category, with counts
- Anything you judged safe to keep, and why
- Any sentence you rewrote or cut from the narrative, quoted before and after
- The verification output

---

## Human review required

**Do not treat the scrubbed report as safe to share until a human has read your summary and
said so.**

End your run with this, verbatim, as the last thing you say:

> **Review required before sharing.** I have scrubbed the report and verified it against the
> derived string list, but automated scrubbing catches strings, not meaning. Please read the
> summary above, and in particular the narrative sentences I rewrote or kept. A sentence can
> identify a client without containing any name I could have derived. Confirm before this
> file leaves the client context.

Then stop. Do not open, publish, upload, attach or send the scrubbed file. Do not offer to.
Handing it onward is the human's decision, taken after reading the summary.

## Scope limit

**HTML only. Do not scrub, modify, move or delete the JSON files.** They are listed here so
you know what still carries risk and can say so in your summary, not as work to do. Leaving
them untouched is deliberate.

```
local_commit_metrics.json      author, committer, message, prod_file_paths,
                               source_branch, sha, full_sha
local_metrics_summary.json     branches_analyzed, branch_commit_counts,
                               analyzed_branch_commit_counts
local_duplicate_analysis.json  firstFile, secondFile
local_claude_analysis.json     claude_summary, architectural_concerns, patterns
                               (model prose about the code; drop wholesale)
```

`prod_file_paths` is the easiest of these to overlook and often the richest.
