// @ts-nocheck
'use strict';

// Configuration — adjust these for your project
const CONFIG = {
  ANALYSIS_DAYS: 30,
  MAX_COMMITS: 50,
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
    '**/deps/**', '**/vendor/**', '**/third_party/**', '**/node_modules/**', '**/generated/**',
    '**/package-lock.json', '**/yarn.lock', '**/pnpm-lock.yaml', '**/*.lock'
  ],

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
  ]
};

module.exports = { CONFIG };
