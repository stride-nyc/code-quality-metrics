// @ts-nocheck
'use strict';

// Configuration — adjust these for your project
const CONFIG = {
  ANALYSIS_DAYS: 30,
  MAX_COMMITS: 50,
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
  DUPLICATE_IGNORE_PATTERNS: [
    '**/deps/**', '**/vendor/**', '**/third_party/**', '**/node_modules/**', '**/generated/**', '**/.terraform/**', '**/.terraform.lock.hcl',
    '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml', '**/*.lock'
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
  // DEFAULT IS EMPTY, DELIBERATELY. Seeding this with the vendored/generated patterns
  // already in DUPLICATE_IGNORE_PATTERNS would change every existing measurement, including
  // the 34 calibration observations __tests__/thresholdProvenance.test.js gates against this
  // file's own CONFIG. An empty default keeps every current number identical, so this key's
  // introduction is provably behaviour-preserving; a non-empty default is a separate decision
  // requiring re-measurement of the reference set, not something to fold in here.
  ANALYSIS_IGNORE_PATTERNS: [],

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
