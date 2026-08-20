# Screening candidates for a `greenfield-modern` reference population

## Why this exists

`greenfield-modern` currently stands at n=2: `stride-nyc/remote_retro` and
`stride-nyc/dotnetdependencytracer`, both also members of the five-repo eval set this
toolkit's maintainer uses it to evaluate (see GitHub #84 and the
`greenfield-modern-eval-circularity` reservation in `observations.json`'s
"Greenfield reference set" section). Any band drawn from that population cannot be used
to judge either of the two repositories that define it. This screening task looks for
independent candidates, so a future measurement pass can grow n and retire the
circularity at the same time.

**This is a screening exercise only.** Nothing here was measured into
`observations.json`, no band was derived, and no code changed. It answers one question:
which candidates are worth spending a real measurement pass on.

## The key insight this screening exploits

A `greenfield-modern`/`greenfield-historical` observation measures only a repository's
**founding window** (its first `MAX_COMMITS` = 50 commits, pinned per
`calibration/README.md`'s "Method: pinning a window that actually reaches the root").
The squash-merge screening recorded in `calibration/README.md`'s "Choosing a reference
repository" section, and repeated in the top-level `CLAUDE.md`, rejected eslint,
prettier, vuejs/core, TypeScript, angular, webpack, babel, react, svelte, jest, express,
python/cpython, apache/kafka and kubernetes against their **current** practice.
Squash-merge is typically adopted well after a project's founding, so a repository that
squashes today may still have granular, direct-push history in its first 50 commits.
This screen re-checks the founding window specifically, not HEAD, for a sample of those
previously-rejected projects plus a set of newer candidates chosen for language diversity.

## Method

For each candidate: a blobless, single-branch clone into a scratch directory
(`git clone --filter=blob:none --single-branch <url> <dest>`), followed by:

1. `git rev-list --max-parents=0 <default-branch>` to enumerate **every** root reachable
   from the default branch (not just `git rev-list --max-parents=0 HEAD | head -1`, which
   returns the wrong root whenever subproject histories were merged in later — this bit
   `greenfield-historical`'s own measurement three times, per `observations.json`'s
   git/git notes).
2. Sort all roots by committer date; read the earliest one's subject and full diff
   directly, and reject it outright if it reads as an import ("Initial revision",
   "Virgin Sources", "Imported", an SVN/CVS checkin message, a landing of hundreds of
   files) rather than a genuine from-scratch start.
3. Walk forward from the genuine root in topological order, computing each candidate
   commit's own `git rev-list --count` until it exceeds 50, and pin at the last commit
   whose count is ≤ 50 — the same technique `calibration/README.md`'s greenfield method
   already documents for reaching a root exactly.
4. Check out that pin, and run `detectHistoryGranularity` (`lib/git.js`) against the
   resulting window: commit subjects (for PR-reference share), committer names (for
   squash-flavored identity), and merge-commit count, exactly as the function's own
   signature expects. Verdict, confidence and signals are reported as-is, not
   re-interpreted.
5. Delete the clone.

Every clone was made under a scratch directory outside this repository and removed by
exact path afterward; none of this touched `~/Projects` or any tracked file.

## Results — 15 candidates screened

| Repo | Founding year | Root SHA / subject | Root files | Roots | Granularity (founding window) | Pass? | Failing criterion |
|---|---|---|---|---|---|---|---|
| eslint/eslint | 2013 | `a658d7b0` "First commit - everything working, sorely needing tests" | 17 | 1 | granular / high | **pass** | — (but pre-2015, see below) |
| prettier/prettier | 2016 | `29627ee5` "initial" | 3 | 1 | granular / high | **pass** | — |
| facebook/react | 2013 | `75897c2d` "Initial public release" | 317 | **4** | squashed / low | **fail** | 1 (import at root) |
| sveltejs/svelte | 2016 | `fc7e6e68` "initial commit" | 7 | 1 | granular / high | **pass** | — |
| babel/babel | 2014 | see note below — `c97696c2` "first commit" (corrected root) | 167 | **5** | granular / high | **pass** | — (multi-root correction needed) |
| expressjs/express | 2009 | `9998490f` "Initial commit" | 7 | 1 | granular / high | **pass** | — (but pre-2015, see below) |
| angular/angular | 2014 | `6a3abf23` "Initial commit" (LICENSE + .gitignore only) | 2 | **2** | granular / high | **pass** | — (scaffold root, see note) |
| kubernetes/kubernetes | 2014 | `2c4b3a56` "First commit" | 250 | 1 | granular / high | **fail** | 1 (import at root) |
| apache/kafka | 2011 | `642da2f2` "Initial checkin of Kafka to Apache SVN...this is just a copy of master..." | 433 | 1 | granular / high | **fail** | 1 (explicit import) |
| python/cpython | 1990 | `7f777ed9` "Initial revision" | 2 | 1 | granular / high | **fail** | 1 (explicit import; also 1990) |
| denoland/deno | 2018 | `f7c5e190` "Init" | 4 | **2** | granular / high | **pass** | — |
| ziglang/zig | 2015 | `8e08cf4b` "init" | 1 | 1 | granular / high | **pass** | — |
| tokio-rs/tokio | 2016 | `bc64194b` "Let's rename everything!" | 14 | **3** | granular / **low** | **pass, flagged** | — mechanically, see note |
| caddyserver/caddy | 2019 | `859b5d7e` "Initial commit" | 6 | 1 | granular / high | **pass, flagged** | — mechanically, see note |
| tiangolo/fastapi | 2018 | `406c092a` ":tada: Start tracking messy initial stage" | 11 | 1 | granular / high | **pass** | — |

All 15 clear criterion 3 (none is in the eval set: `stride-nyc/73V`,
`stride-nyc/dotnetdependencytracer`, `stride-nyc/flight-info-spike`, `daloopa`,
`stride-nyc/remote_retro`).

### Notes on individual rows

**react (fail, criterion 1).** 4 roots; the earliest (2013-05-29, "Initial public
release") lands 317 files and 47,501 insertions in one commit. React was developed
internally at Facebook for roughly two years before this public release — the commit is
a codebase arriving under version control already built, the same pattern
`observations.json` already excluded curl and postgres for. The founding window pinned to
this root also reads `squashed`/low confidence, a second, independent reason it would not
serve as a granular-history reference even setting the import question aside.

**kubernetes (fail, criterion 1).** Single root, but 250 files and 47,501 insertions in
the "First commit," half of which (125/250) sit under `third_party/`, `Godep/`, or
`vendor/`. Kubernetes had months of private development at Google before this June 2014
commit. Same import-at-root pattern as react, curl and postgres.

**apache/kafka (fail, criterion 1).** The root commit's own subject says it directly:
"Initial checkin of Kafka to Apache SVN. This corresponds to
https://github.com/kafka-dev/kafka/commit/709afe4e...This is just a copy of master,
branches and history are not being converted." This is a self-described import of a
pre-existing GitHub repository's history into SVN, then back into git — about as
explicit a reject signal as this criterion names.

**python/cpython (fail, criterion 1).** Root subject is verbatim "Initial revision," the
exact phrase this task's own reject list names. It is also dated 1990, a CVS-conversion
artifact, absurdly outside any reading of "modern" regardless of the import question.

**babel (pass, with a real multi-root correction).** 5 roots. The earliest by committer
date (`aedcd4e1`, 2012-09-24, "Initial import") is a single 998-line file, `acorn.js` —
a vendored copy of the existing Acorn JS parser, merged into babel's repository later as
a subproject, not babel's own start. Two more roots (`fde7f8ca` "Initial commit.",
`af5c64c4` "Initial commit of the call-to-action sandbox page.") are both the
`regenerator` subproject and its demo site, also merged in later. The genuine babel
project root — reading its full diff directly — is `c97696c2` (2014-09-28, "first
commit"): 167 files, but the bulk are one- and two-line paired test fixtures
(`test/fixtures/*/actual.js` + `expected.js`), alongside real transformer source files,
a `LICENSE`, `Makefile`, and a working `bin/6to5` CLI. This reads as a genuine,
test-driven from-scratch start for what was then called 6to5 (babel's original name),
not an import. This is the same class of hazard `observations.json` documents for
git/git (7 roots, only one the true genesis) — the difference is that git's true root
also happened to be earliest-by-date, while babel's is not. I verified this the same way
the git/git note recommends: by reading each root's own diff content rather than trusting
date order alone. The founding window pinned to the corrected root is granular/high
confidence.

**angular (pass, scaffold root).** 2 roots; the earlier (2014-09-18, "Initial commit")
adds only `.gitignore` and `LICENSE` — a scaffold, not code, the same shape
`windowIncludesRepositoryRoot`/`isRepoFurniture` exists to detect for `stride-nyc/73V`.
Unlike 73V, there is no multi-year dormancy after it: real commits (build scripts, then
early Angular2/Dart-transpilation prototyping referencing `js2dart` and `traceur`) begin
the very next day. This is Angular's own 2014 ground-up rewrite (the "Angular2" effort),
not AngularJS 1.x's actual 2009 origin — a distinction worth stating plainly rather than
implying this observation would describe "Angular since inception."

**tokio (pass mechanically, flagged).** 3 roots. The earliest, `bc64194b` (2016-07-30),
is titled "Let's rename everything!" — an unusual thing for an actual first commit to be
called, and detectHistoryGranularity itself returns **low** confidence for this window
(one of only two low-confidence results in this sample, the other being react's
already-rejected squashed verdict). I could not rule out, within this screening's scope,
that this root reflects a renamed/rehomed history rather than tokio's true from-scratch
start. I would not hold this one up without further research into what the rename refers
to.

**caddy (pass mechanically, flagged).** Single root, clean and small (2019-03-26,
"Initial commit," 6 files), granular/high confidence. But Caddy the project actually
dates to 2015; the `caddyserver/caddy` history sampled here begins with Caddy v2's full,
deliberate rewrite by an already-experienced team, not a first-time founding. A rewrite
by experienced maintainers plausibly reads more disciplined than genuine novice founding
work — the opposite-direction bias from an import-at-root, but a bias against this
population's purpose all the same.

**eslint and express (pass mechanically, pre-2015).** Both are unambiguous, single-root,
high-confidence-granular, genuine from-scratch starts. But eslint's root is 2013 and
express's is 2009 — years before "roughly 2015," the boundary this task sets for
"modern." Both sit closer in era to the existing `greenfield-historical` trio
(ember.js/node/git, founded 1996–2011) than to a population meant to add a *second*,
more-recent era alongside it. Including either would blur the very historical/modern
split this population exists to preserve.

## Ranked shortlist (candidates that pass and I would hold up)

1. **ziglang/zig** (2015). Single root, a one-file "init" commit for a brand-new
   compiled systems language with no pre-existing codebase to import from. Adds a
   language (Zig) neither reference population has any representation of at all.
2. **denoland/deno** (2018). A genuine four-file "Init" root (the second root is an
   unrelated later merge, correctly set aside). A well-regarded, actively developed
   runtime; its Rust+TypeScript combination is a real diversification from the current
   C/JS skew both populations carry.
3. **tiangolo/fastapi** (2018). Single root, an honest ":tada: Start tracking messy
   initial stage" commit. A widely-adopted modern Python web framework — Python is
   entirely absent from both existing greenfield populations.
4. **sveltejs/svelte** (2016). Single root, unambiguous seven-file from-scratch compiler
   project start, high confidence throughout. The cleanest of the JavaScript candidates
   to defend.
5. **prettier/prettier** (2016). Single root, three-file genuine start, high confidence.
   An industry-standard tool with heavy real-world adoption; nearly as clean a case as
   svelte.
6. **babel/babel** (2014, corrected root). The de facto standard JS transpiler —
   genuinely influential — but defensible only once the multi-root correction above is
   accepted; the most methodologically delicate pass in this set.
7. **angular/angular** (2014). Usable, but only if labeled as Angular2's own 2014
   restart, not AngularJS's 2009 origin, given the scaffold-only root.

## Recommendation

Measure **4**: zig, deno, fastapi, and svelte. This set fixes the n=2 problem and the
eval-set circularity in one pass, and buys the most language diversity for the effort —
three languages (Zig, Rust/TypeScript, Python) that neither greenfield population
currently has at all, plus the single cleanest-to-defend JavaScript candidate. Prettier
and babel are reasonable next additions if the population is expanded further; angular is
usable but needs its restart-vs-origin caveat carried alongside its observation, the same
way `observations.json` already carries similar caveats for kenjudy/73V's dormant root
and git/git's multi-root pin.

**Hold out of this round:** caddy (measures a mature rewrite, not a founding), tokio
(low-confidence detector signal and an unexplained "rename" root — needs more research
before trusting it), and eslint/express (genuine and clean, but pre-2015 enough to belong
with the historical population's era rather than the modern one, if either population is
ever revisited for era boundaries).
