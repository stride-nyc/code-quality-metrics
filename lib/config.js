// @ts-nocheck
'use strict';

// Configuration — adjust these for your project
const CONFIG = {
  ANALYSIS_DAYS: 30,
  MAX_COMMITS: 50,
  // Upper safety ceiling for the --max-commits unbounded CLI override (local-code-metrics.js).
  // Removing the MAX_COMMITS cap entirely on a very large repository can hang the process or
  // exhaust memory: GitHub #89 documents `git log --all --reverse` throwing ENOBUFS on a
  // 36,058-commit history, an error runGitCommand's own catch swallows into an empty result --
  // silently reading as "zero commits found" rather than surfacing the real problem. Rather than
  // let an unbounded run attempt that fetch at all, a cheap `git rev-list --count` pre-flight
  // (this never fetches full log content, so it cannot hit the same failure) checks the actual
  // size an unbounded fetch would attempt; exceeding this limit throws loudly before the fetch
  // is ever issued. 10,000 sits safely below the 36,058 already known to break, while
  // comfortably covering any single repository's first-year window -- the greenfield reference
  // set's own use case for this override -- since even a very active project rarely exceeds a
  // few thousand commits in twelve months. Only checked for the 'unbounded' sentinel: a bounded
  // numeric --max-commits is the operator's own explicit, self-limiting request, the same way
  // --days already permits an arbitrarily large historical window with no separate ceiling.
  MAX_COMMITS_SAFETY_LIMIT: 10000,
  // Loud-failure guard (code-quality-metrics-tde9): local-code-metrics.js's own git log fetch
  // (summary.filtered_from) is cross-checked against an independent `git rev-list --count`
  // over the same resolved ref(s). A ratio this far below 1.0 means the analysis target was
  // very likely misresolved (stale remote-tracking ref, or a partial clone that silently
  // dropped commits after `git remote remove origin`) -- see the 1-vs-178-commit case that
  // motivated this. Deliberately generous (0.5, not e.g. 0.9): de-duplication across multiple
  // analyzed branches can legitimately lower the selected count below the summed per-branch
  // rev-list total, and this must not fire on that healthy case.
  WINDOW_COMMIT_COUNT_DISCREPANCY_RATIO: 0.5,
  // How many days after the requested --since boundary the analyzed span's own start date can
  // begin before that is worth surfacing as "commits since the requested date look sparse or
  // wrong," rather than the ordinary variance of high-velocity vs. low-velocity repositories.
  //
  // Calibrated against real, correctly-resolved reproductions, not guessed (code-quality-
  // metrics-tde9, re-verified after #76 switched commit selection to committer date): a
  // healthy nodejs/node run (--since 2026-08-01, 178 commits reachable, MAX_COMMITS 50) lands
  // exactly a 7-day lag purely from commit velocity -- 50 commits exhausts in under 8 days at
  // that repository's landing rate, with no contamination involved -- and curl/curl
  // (--since 2026-08-10) lands a 2-day lag. The originally reported defect (other branches'
  // live tips contaminating the analyzed sample) produced an 11-day lag on the same repository
  // and window. 7 sat exactly on the healthy boundary, one bad measurement away from a false
  // positive on ordinary high-velocity truncation; 9 clears both verified healthy lags with
  // real margin while still catching the reported 11-day defect.
  WINDOW_SPAN_LAG_DAYS: 9,
  // Buffer ceiling for findEffectiveRootSha's forward-walk query (lib/git.js, GitHub #89):
  // `git log --all --reverse --pretty=format:%H` emits one 40-character SHA per commit across
  // every ref, and execSync's ~1MB default maxBuffer overflows around 24,000-25,000 commits --
  // measured directly on ziglang/zig's 36,058-commit history, which produced ~1.48MB of output
  // and threw ENOBUFS, an error the surrounding try/catch previously swallowed into an empty
  // result read as "no scaffold root found" (findEffectiveRootSha's own comment). 64MB clears
  // zig's measured case with wide headroom for a much larger repository, while remaining a
  // bounded ceiling rather than an unlimited buffer: an even larger history still fails loudly
  // here rather than hanging or exhausting memory.
  GIT_LOG_MAX_BUFFER: 64 * 1024 * 1024,
  LARGE_COMMIT_THRESHOLD: 100,
  SPRAWLING_COMMIT_THRESHOLD: 5,
  MESSAGE_QUALITY_MIN_WORDS: 10,
  AI_ANALYSIS_MAX_COMMITS: 5,
  AI_DIFF_MAX_CHARS: 4000,
  AI_RISK_ADDITIONS_RATIO: 3,
  AI_DUPLICATE_MAX_FILES: 40,
  // A real 40-file semantic response measures around 1000 output tokens. The previous
  // 1024 cap sat right on top of that, so completion was a coin flip and a truncated
  // response was reported as unmeasured. Headroom is close to free: billing is on tokens
  // generated, not requested, and raising the cap to 8192 still produced 995.
  AI_DUPLICATE_MAX_OUTPUT_TOKENS: 8192,
  // The Findings-narrative prompt (lib/narrative.js) grew once METRIC_DESCRIPTIONS prose was
  // added to the payload (code-quality-metrics-ll1 follow-up item 1), and the same 1024 cap
  // this key's sibling above was raised from started failing to parse ("Unterminated string in
  // JSON") often enough that the report quietly fell back to fallbackFindings instead of the
  // model's prose. Measured directly rather than assumed: 23 live calls against two real
  // catalogs (one with the full pipeline's 10 top commits, one without) produced 0 outright
  // truncations, but output usage ranged up to 855 of the 1024-token budget (83%) on the larger
  // payload -- thin enough that occasional truncation under ordinary response-length variance
  // is expected, matching what the ticket reported. Set to the same 8192 as
  // AI_DUPLICATE_MAX_OUTPUT_TOKENS above for the same reason: headroom above the observed
  // maximum costs nothing unless the model actually writes that much.
  NARRATIVE_MAX_OUTPUT_TOKENS: 8192,

  // How many total attempts generateFindingsNarrative makes before falling back to the
  // deterministic templated bullets, when the model's response fails validateNarrative's
  // consistency checks (code-quality-metrics-49ch). Retries only a validation rejection, never
  // a genuine API/parse error (the Anthropic SDK's own default maxRetries already retries a
  // transient API failure before generateFindingsNarrative's catch block ever sees one, so
  // retrying that case again here would be redundant). Measured directly: 42 live calls
  // against this project's own, byte-identical catalog produced 6 false-positive validation
  // rejections (of 8 total), all from natural comparative phrasing around a proposed commit-size
  // ceiling that a narrow regex exemption cannot fully enumerate (see lib/narrative.js's
  // isExemptFromPresenceCheck) -- a single retry drops the residual failure rate from roughly
  // 1 in 7 to roughly 1 in 50 if the two attempts are independent. 2 rather than higher: each
  // attempt costs a real API call (about 20 seconds measured), and this tool already runs
  // across a multi-repository batch, so an unbounded retry risks compounding latency and cost
  // against a catalog shape the model can never satisfy, the same reasoning
  // MAX_COMMITS_SAFETY_LIMIT already applies to an unbounded commit count.
  NARRATIVE_MAX_ATTEMPTS: 2,

  // Duplicate detection thresholds — customize for your language/framework
  //
  // Raised from 5/50 to 10/100 (code-quality-metrics-k1g) so duplication_pct is measured
  // the way SonarQube's 3% "Sonar way" gate was defined: 100 successive duplicated tokens
  // over 10 lines. At half that minimum in both dimensions, this toolkit measured strictly
  // more duplication than the number it was being compared against. Wagner et al. (SANER
  // 2016) found roughly a threefold difference on the same three systems: 3.0/5.3/3.4
  // percent at 10/100 against 10.1/14.8/10.5 percent at 5/50. Position within the published
  // 3-23 percent range depends more on detector settings than on the codebase, so matching
  // Sonar's settings is what makes the comparison mean anything.
  //
  // This drops the one alignment in this toolkit that had a primary source behind it:
  // DUPLICATE_MIN_LINES: 5 matched GitClear's definition of a duplicate block. The trade is
  // taken deliberately anyway, because GitClear's floor is for detecting a clone at all,
  // while Sonar's is for calling that clone a quality problem worth gating on, and this
  // toolkit reports a rate against a published range, not a clone list, so the latter is
  // the better match for what duplication_pct is used for.
  //
  // Consequence: this changes what duplication_pct counts. Every duplication observation in
  // calibration/observations.json was measured at 5/50 and is superseded; the derived band
  // (6/6.5) does not carry over and calibration must re-measure at these settings before the
  // band can be trusted again (see code-quality-metrics-k1g and its re-measurement follow-up).
  DUPLICATE_MIN_LINES: 10,
  DUPLICATE_MIN_TOKENS: 100,
  // Generated or authored-once artifacts committed alongside source. These are
  // near-verbatim by nature and swamp the signal from real code.
  //
  // '**/designs/**' used to be listed here. It was a fact about one target repo
  // (stride-nyc/flight-info-spike, where that directory alone measured 39.35 percent
  // duplication and dragged the whole-repo figure to 16.50 percent, against 1.23
  // percent once excluded) sitting in defaults shared by every consumer of this
  // file, including repos that have no such directory (code-quality-metrics-wcj).
  // It now belongs in that repo's own .codemetrics.json, unioned onto the patterns
  // below at run time -- see lib/repoConfig.js and AGENTS.md's "Per-Repo
  // Configuration Overrides" section for the mechanism and an example file.
  //
  // deps/, vendor/, third_party/, node_modules/: conventional homes for
  // dependency code vendored in-tree, across ecosystems (Node.js core itself
  // vendors npm under deps/, Go/PHP/Ruby use vendor/, Bazel/Chromium-style
  // repos use third_party/, and node_modules/ is occasionally committed).
  // Nobody on the team wrote this code; a sync of it (e.g. a "deps: upgrade
  // npm" commit touching hundreds of files) is not a change in practice. On
  // nodejs/node measuring across two windows, one such sync alone moved
  // whole-repo duplication from 5.12 percent to 15.09 percent.
  //
  // generated/: a directory literally named for what it holds. No hand-written
  // code convention uses this name, so there is no real-code exclusion risk.
  //
  // Lock files: always machine-written and regenerated wholesale, never hand-edited,
  // and their repetitive structure (dozens of near-identical dependency blocks) reads
  // as duplication to jscpd despite carrying no practice signal. **/*.lock catches
  // Cargo.lock, Gemfile.lock, poetry.lock, and composer.lock in one glob; the three
  // JS package managers each use a name that does not end in .lock, so each needs
  // its own entry.
  // '**/.codemetrics/**' (code-quality-metrics-w3wn): local-code-metrics.js writes its own
  // output (local_commit_metrics.json, local_metrics_summary.json, local_drift_report.html
  // and siblings) into a .codemetrics/ directory inside the analyzed repository. Without this
  // entry, a run that follows one whose output was ever committed would hand jscpd its own
  // prior local_commit_metrics.json -- an array of per-commit records sharing one schema,
  // exactly the shape a clone detector reads as duplication -- and local_drift_report.html, a
  // large generated HTML file, as if both were the codebase under analysis. Unlike every other
  // entry in this list, this one is not a per-ecosystem convention some target repository
  // happens to use; it is this tool's own output location in every repository it is ever
  // pointed at, so it belongs in the shared default rather than a per-repo .codemetrics.json
  // (see AGENTS.md's "Per-Repo Configuration Overrides" for that distinction).
  DUPLICATE_IGNORE_PATTERNS: [
    '**/deps/**', '**/vendor/**', '**/third_party/**', '**/node_modules/**', '**/generated/**', '**/.terraform/**', '**/.terraform.lock.hcl',
    '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml', '**/*.lock', '**/.codemetrics/**'
  ],

  // Paths excluded from the commit-shape metrics entirely: large_commit, sprawling_commit,
  // files_changed's sprawling threshold, the line-count distributions, prod/test
  // classification, and uncovered_prod_rate. A matched path counts as neither test nor
  // production (code-quality-metrics-y8j, step code-quality-metrics-3yd).
  //
  // DUPLICATE_IGNORE_PATTERNS above only ever reached the duplicate detector; nothing
  // excluded a vendored or generated path from these other metrics, so a repository that
  // commits build output (measured case: stride-nyc/dotnetdependencytracer, where 789 of
  // 1972 tracked paths are committed bin/ and obj/ output and one commit changed 560,857
  // lines across 196 files) had every size-shaped metric inflated by whatever share of its
  // history is that output, with nothing in the report saying so.
  //
  // DEFAULT WAS EMPTY, DELIBERATELY, and still is except for one entry. Seeding this with the
  // vendored/generated patterns already in DUPLICATE_IGNORE_PATTERNS would change every
  // existing measurement, including the 34 calibration observations
  // __tests__/thresholdProvenance.test.js gates against this file's own CONFIG. An empty
  // default kept every current number identical, so this key's original introduction was
  // provably behaviour-preserving; a non-empty default seeded with a real per-ecosystem
  // convention is a separate decision requiring re-measurement of the reference set, not
  // something to fold in here.
  //
  // '**/.codemetrics/**' (code-quality-metrics-w3wn) is the one exception, and it does not
  // violate the reasoning above: local-code-metrics.js only began writing that directory with
  // this change, so it is absent from every repository's history and from every recorded
  // observation -- no historical measurement can move, because none of them could ever have
  // contained it. Without this entry, a committed .codemetrics/ directory (the exact accident
  // Part 1 of code-quality-metrics-w3wn exists to make less likely, not impossible) would
  // count its own prior local_commit_metrics.json/local_drift_report.html as production code
  // in large_commit, sprawling_commit, the line-count distributions and uncovered_prod_rate on
  // the very next run.
  ANALYSIS_IGNORE_PATTERNS: ['**/.codemetrics/**'],

  // Dependency and CI bot accounts (issue #62). Matched case-insensitively against a commit's
  // author name, committer name, or (for GitHub API callers) login. These commits are noise
  // this toolkit's metrics were never meant to measure: a dependency-bump or release commit
  // typically touches one file with a one-line diff, which deflates size percentiles, inflates
  // the test-isolation and message-quality denominators, and (calibration/observations.json's
  // bot-traffic reservation) can set the observed floor for an entire metric on its own -- an
  // ember window with 8 of 49 commits from Renovate did exactly that.
  //
  // AI_AGENT_PATTERNS below always takes precedence over a match here (see isBotCommit,
  // lib/metrics.js): AI coding agents (Claude Code, Copilot, Cursor, Devin, Aider, ...) are the
  // *subject* this toolkit exists to measure, and a bare /\[bot\]$/ pattern -- the obvious
  // naive implementation -- would also catch a "claude[bot]"-style account and silently remove
  // that signal. isBotCommit checks the AI-agent exemption first for exactly this reason.
  BOT_ACCOUNT_PATTERNS: [
    /dependabot(\[bot\])?/i,
    /renovate(\[bot\])?/i,
    /github-actions(\[bot\])?/i,
    /^release-bot/i,
    /^version-bump(-bot)?/i,
    /\[bot\]$/i
  ],

  // AI coding agents (issue #62). A commit attributable to one of these -- by author,
  // committer, or a `Co-Authored-By:` trailer in the commit message -- is never classified as
  // a bot, no matter what BOT_ACCOUNT_PATTERNS above matches. Names are substrings, matched
  // case-insensitively, so both a human-readable account name ("Claude") and a bot-flavored
  // one ("claude[bot]") are recognized identically. Extend this list for other agents your
  // team uses; "and similar" in the issue is deliberately open-ended, not a closed enumeration.
  AI_AGENT_PATTERNS: [
    /claude/i,
    /copilot/i,
    /cursor/i,
    /devin/i,
    /aider/i,
    /codex/i
  ],

  // Default ON (issue #62): dependency/CI bot commits are excluded from the metrics
  // denominators by default, not opt-in. They are still counted and reported --
  // bot_commits_count / bot_commits_pct in local_metrics_summary.json -- never silently
  // dropped.
  EXCLUDE_BOT_COMMITS: true,

  // Test file patterns — customize for your language/framework
  TEST_FILE_PATTERNS: [
    /\.(test|spec)\./i,              // file.test.js, file.spec.ts
    /Tests?\.cs$/i,                  // FileTests.cs, FileTest.cs (C#)
    /Test\.java$/i,                  // FileTest.java (Java)
    /_test\.py$/i,                   // file_test.py (Python)
    /test_.*\.py$/i,                 // test_file.py (Python)
    /_test\.go$/i,                   // file_test.go (Go)
    /__tests__/i,                    // __tests__ directory
    /(^|\/)tests?\//i,              // test/ or tests/ directory, at the repo root or nested.
                                     // The leading (^|\/) is required: git show --numstat emits
                                     // repo-relative paths with no leading slash, so /\/tests?\//
                                     // silently missed every top-level test directory.
    /^t\//i                         // bare t/ directory, repo root only (e.g. git.git's suite:
                                     // t/t1400-update-ref.sh). Anchored at the start of the path,
                                     // not (^|\/), so a nested t/ elsewhere does not match: a
                                     // top-level t is almost always a test suite, but a bare t
                                     // directory buried in the tree is more likely something else,
                                     // and misclassifying production code as tests is the more
                                     // damaging false positive.
  ],

  // Repo furniture: files GitHub's own repo-creation wizard adds, or that convention expects
  // at the root of nearly every repository, carrying no production signal of their own
  // (code-quality-metrics-fex3, GitHub #71). A named, explicit list -- not a tuned number
  // like a repo age or commit count -- so a root commit that touches only these is
  // structurally a scaffold, not a production-bearing start of the build. Measured case:
  // stride-nyc/73V's actual root commit (`ec1026c4`) adds only LICENSE and README.md.
  // Matched case-insensitively, at any depth, the same way TEST_FILE_PATTERNS' own /(^|\/).../
  // entries are: `git show --numstat`/`--name-only` emit repo-relative paths with no leading
  // slash, so a bare /^.../ anchor would miss a nested copy (e.g. a monorepo package's own
  // README.md), and "(any extension)" per the file's own kind (LICENSE.md, LICENSE.txt, ...)
  // is expressed as an optional `.ext` suffix rather than enumerating extensions.
  REPO_FURNITURE_PATTERNS: [
    /(^|\/)LICEN[CS]E(\.[^/]*)?$/i,      // LICENSE, LICENCE, LICENSE.md, LICENSE.txt, ...
    /(^|\/)COPYING(\.[^/]*)?$/i,          // COPYING, COPYING.txt, ...
    /(^|\/)README(\.[^/]*)?$/i,           // README, README.md, README.rst, ...
    /(^|\/)\.gitignore$/i,
    /(^|\/)\.gitattributes$/i,
    /(^|\/)CODE_OF_CONDUCT(\.[^/]*)?$/i,
    /(^|\/)CONTRIBUTING(\.[^/]*)?$/i,
    /(^|\/)SECURITY(\.[^/]*)?$/i,
    /(^|\/)CHANGELOG(\.[^/]*)?$/i,
    /^\.github\//i                        // anything under a repo-root .github/ directory
  ]
};

module.exports = { CONFIG };
