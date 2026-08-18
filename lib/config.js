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
  DUPLICATE_MIN_LINES: 5,
  DUPLICATE_MIN_TOKENS: 50,
  // Generated or authored-once artifacts committed alongside source. These are
  // near-verbatim by nature and swamp the signal from real code: on flight-info-spike
  // the designs/ directory alone measured 39.35 percent duplication and dragged the
  // whole-repo figure to 16.50 percent, against 1.23 percent once excluded.
  DUPLICATE_IGNORE_PATTERNS: ['**/designs/**'],
  DUPLICATE_SCAN_PATHS: [],

  // Test file patterns — customize for your language/framework
  TEST_FILE_PATTERNS: [
    /\.(test|spec)\./i,              // file.test.js, file.spec.ts
    /Tests?\.cs$/i,                  // FileTests.cs, FileTest.cs (C#)
    /Test\.java$/i,                  // FileTest.java (Java)
    /_test\.py$/i,                   // file_test.py (Python)
    /test_.*\.py$/i,                 // test_file.py (Python)
    /_test\.go$/i,                   // file_test.go (Go)
    /__tests__/i,                    // __tests__ directory
    /\/tests?\//i                    // /test/ or /tests/ directories
  ]
};

module.exports = { CONFIG };
