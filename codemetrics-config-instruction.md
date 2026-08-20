# Determine and write a repository's `.codemetrics.json`

Reusable instruction for an agent. Point an agent at this file with the target repository
path substituted.

> **This process ends with a human review that cannot be skipped.** Every exclusion changes
> what the tool measures, and some are judgement calls that are not yours to make. See
> [Human review](#human-review-required).

---

## Task

Determine what `<REPO_PATH>` vendors, generates, or otherwise commits that is not development
work, and write or update `<REPO_PATH>/.codemetrics.json`.

Getting this wrong in either direction is costly. Exclude too little and one dependency sync
dominates a window: a `deps/` update in one measured repository moved its duplication from
5.12 to 15.09 percent with no change in practice. Exclude too much and you hide real work,
and the repository silently scores better than it should.

## The two ignore keys are not interchangeable

This is the trap. Both are Class A and both union rather than replace, but they union onto
different things:

| Key | Unions onto | Affects |
|---|---|---|
| `DUPLICATE_IGNORE_PATTERNS` | 11 built-in vendored/generated patterns | the duplicate detector, and the always-on "vendored or generated" measurement |
| `ANALYSIS_IGNORE_PATTERNS` | **an empty list** | large-commit, sprawling-commit, the line and file distributions, test/production classification, uncovered-prod |

So a repository gets vendored exclusion from the duplicate detector for free and **none at
all** from the size metrics unless every pattern is spelled out. A config that sets only
`DUPLICATE_IGNORE_PATTERNS` leaves build output counted in every size-shaped metric.

The built-in eleven, which `ANALYSIS_IGNORE_PATTERNS` does *not* inherit:

```
**/deps/**  **/vendor/**  **/third_party/**  **/node_modules/**  **/generated/**
**/.terraform/**  **/.terraform.lock.hcl
**/package-lock.json  **/yarn.lock  **/pnpm-lock.yaml  **/*.lock
```

If you want those excluded from size metrics too, restate them under
`ANALYSIS_IGNORE_PATTERNS`.

## Which keys you may set

| Key | Class | Notes |
|---|---|---|
| `DUPLICATE_IGNORE_PATTERNS` | A | unions onto the eleven above |
| `ANALYSIS_IGNORE_PATTERNS` | A | unions onto nothing |
| `TEST_FILE_PATTERNS` | A | for languages or layouts the defaults miss |
| `DUPLICATE_MIN_LINES` | B | **withholds the duplication verdict when overridden** |
| `DUPLICATE_MIN_TOKENS` | B | same |
| `lifecycle` | meta | `initial-build` or `established` |

`LARGE_COMMIT_THRESHOLD` and `SPRAWLING_COMMIT_THRESHOLD` are **not overridable** and
attempting them is an error. They are the bars the reference set was measured against; a
repository setting its own bar defeats the comparison.

Only override a Class B key with a reason. A duplication percentage measured at a different
detector sensitivity is not comparable to the band, so the tool withholds the verdict. Roughly
a threefold difference was measured on the same systems at 5/50 versus 10/100.

## Determine, do not guess

Work from the repository, not from what a project of that type usually has.

1. Tracked directories by size: `git ls-files | awk -F/ 'NF>1{print $1"/"}' | sort | uniq -c | sort -rn | head -20`
2. Candidate generated or vendored paths: `git ls-files | grep -iE 'node_modules|/dist/|/build/|/bin/|/obj/|generated|vendor|third_party|/deps/|_build|/target/|\.lock$|-lock\.json$|/locale/|/po/|/migrations/|\.min\.(js|css)$|/__pycache__/|\.venv/|/packages/'`
3. What actually dominates recent history, which is the real test:
   `git log --since='6 months ago' --numstat --format='C|%h' | awk -F'|' '/^C\|/{s=$2;next} {n=split($0,f,"\t"); if(n>=3 && f[1]!="-"){t[s]+=f[1]+f[2]; p[s","f[3]]+=f[1]+f[2]}} END{for(k in p) if(p[k]>2000) print p[k], k}' | sort -rn | head -20`

Step 3 matters most. A directory that exists but never changes costs nothing. A directory
that lands 20,000 lines in one commit distorts everything.

## What to exclude, and what to leave

Exclude, when present and actually changing:

- Vendored third-party source committed in-tree
- Build output committed to the repository (`bin/`, `obj/`, `dist/`, `_build/`, compiled assets)
- Lockfiles and dependency manifests that regenerate wholesale
- Translation and localisation catalogues (`locale/`, `po/`, `.po`, `.pot`), which arrive as
  bulk external syncs. One Transifex sync was 65 percent of a measured window.
- Machine-generated documentation, schema or client code

Leave alone:

- **Test fixtures and test data.** Already classified as tests by `TEST_FILE_PATTERNS`, which
  is the correct treatment. Excluding them makes them count as neither test nor production and
  distorts test-coverage rate.
- **Anything representing real decisions.** Database migrations and regression expected-output
  files are generated *scaffolding* carrying real schema and behaviour choices. A bulk
  regeneration is noise, but an ordinary one is work. Default to leaving them and flag the
  call for the human rather than deciding it yourself.
- Configuration, infrastructure-as-code and CI definitions that people author by hand. They may
  be repetitive, which is a duplication-detector problem, not an analysis-exclusion one. If
  repetitive infra inflates duplication, put it in `DUPLICATE_IGNORE_PATTERNS` only.

## Record what you checked and found nothing

If a repository has nothing to exclude, write the key with an empty array rather than omitting
it, and say so in your summary. An explicit empty list records that the question was asked and
answered. An absent key is indistinguishable from nobody having looked, and the next person
re-litigates it.

## The `lifecycle` key

Set `"lifecycle": "initial-build"` when the repository is a greenfield build rather than a
mature codebase in maintenance. The bands were derived from maintenance-era windows on
decades-old codebases and lean against an initial build in the same direction, toward a worse
verdict.

Detection is automatic but has a known limit: analysis caps at `MAX_COMMITS`, so a repository
whose build began further back than the window reaches will read as `established` no matter
what. Check the age and shape of the history yourself:

```
git log --format='%cd' --date=format:%Y | sort | uniq -c
git log --reverse --format='%cd %s' --date=short | head -3
```

Watch for a placeholder first commit followed by a long gap. One measured repository had a
2022 root commit adding only LICENSE and README, then nothing for three years, then 2,928
commits in 2025. That repository is a greenfield build and the date of its first commit says
otherwise.

## Verify before reporting done

Load the file through the real resolver, not by eyeballing the JSON:

```bash
cd <code-quality-metrics-path> && node -e '
const { CONFIG } = require("./lib/config");
const { resolveConfigOverrides } = require("./lib/repoConfig");
const r = resolveConfigOverrides(CONFIG, "<REPO_PATH>");
console.log("ANALYSIS:", r.effective.ANALYSIS_IGNORE_PATTERNS);
console.log("DUPLICATE:", r.effective.DUPLICATE_IGNORE_PATTERNS.length, "patterns");
console.log("classB overridden:", r.classBOverridden);
'
```

A malformed file throws here. A key you got wrong is rejected by name. Confirm the
repo-specific patterns you intended actually appear in `ANALYSIS_IGNORE_PATTERNS`, not only in
`DUPLICATE_IGNORE_PATTERNS`.

Then run the tool against the repository and read `excluded_lines_pct` and the vendored share
in the summary. If your exclusions removed nothing, either the repository has nothing to
exclude or your patterns do not match. Say which.

## Report

- Each pattern, which key it went in, and the evidence for it: file count, and lines changed in
  recent history
- Anything you deliberately left in, and why, especially migrations and expected-output files
- Any key you set to an empty array, stated as a checked negative
- Whether you set `lifecycle`, with the history shape that justified it
- The resolver output and the before/after excluded-lines figures

## Human review required

**Do not treat the config as final until a human has read your summary and said so.**

End your run with this, verbatim, as the last thing you say:

> **Review required.** Every exclusion here changes what the tool measures and therefore what
> this repository's numbers mean. Please read the summary above, in particular anything I left
> in as a judgement call and any empty list I recorded as a checked negative. Excluding too
> much hides real work as surely as excluding too little buries it. Confirm before these
> numbers are compared against a band or shared.

Then stop. Do not run the analysis for publication, and do not share or upload any report
generated with this config.
