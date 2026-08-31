#!/usr/bin/env node
// @ts-check

/**
 * AI Code Drift Local Analysis Script
 *
 * Analyzes local Git repository for AI code drift patterns by examining
 * feature branches before they're merged and squashed.
 *
 * Based on research by Ken Judy - https://github.com/stride-nyc/code-quality-metrics
 * Licensed under CC BY 4.0
 *
 * Usage: node local-code-metrics.js [options]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env file if present — allows ANTHROPIC_API_KEY to be set without exporting to the
// shell. Resolved relative to this script's own directory (not process.cwd()), since this
// tool is routinely invoked against another repository's working directory. See
// lib/env.js for the full precedence order.
require('./lib/env').loadEnv(__dirname);

const { CONFIG } = require('./lib/config');
const { resolveConfigOverrides } = require('./lib/repoConfig');
const { runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff, detectHistoryGranularity, findContentDuplicateGroups, windowIncludesRepositoryRoot, findRepositoryRootShas, findEffectiveRootSha, getExpectedCommitCount, findNewestCommitDate, fetchReleaseTags, findDefaultBranch, fetchDefaultBranchShas } = require('./lib/git');
const { computeStatistics, computeVelocity } = require('./lib/statistics');
const { scoreMessageQuality, classifyDoraArchetype, generateInsights, isBotCommit, detectDeploymentFrequency, findReleaseCommitsFromSubjects, findUnmatchedVersionShapedRefs } = require('./lib/metrics');
const { CLAUDE_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude, runSemanticDuplicateAnalysis } = require('./lib/claude');
const { runDuplicateAnalysis, resolveModuleNeighbors } = require('./lib/duplicate');

// Captured once at module load, before any run can mutate CONFIG via a
// repo-local override, so every invocation of collectLocalMetrics can reset
// these four keys to their true defaults before applying its own run's
// overrides on top. Without this reset, CONFIG (a shared, mutated singleton --
// every lib/*.js module that required it holds this exact same object) would
// compound one run's override into the next run in the same process, which is
// exactly what this project's own test suite would otherwise hit silently.
const CONFIG_OVERRIDABLE_DEFAULTS = Object.freeze({
  DUPLICATE_IGNORE_PATTERNS: [...CONFIG.DUPLICATE_IGNORE_PATTERNS],
  TEST_FILE_PATTERNS: [...CONFIG.TEST_FILE_PATTERNS],
  DUPLICATE_MIN_LINES: CONFIG.DUPLICATE_MIN_LINES,
  DUPLICATE_MIN_TOKENS: CONFIG.DUPLICATE_MIN_TOKENS,
  ANALYSIS_IGNORE_PATTERNS: [...CONFIG.ANALYSIS_IGNORE_PATTERNS]
});

/**
 * @typedef {{ sha: string, full_sha: string, date: string, author: string, committer: string, message: string, full_message: string, source_branch?: string }} CommitInfo
 * date is committer date (git %ci), not author date -- see fetchBranchCommits' own comment
 * (code-quality-metrics-75 / mbiw) for why: it matches --since's own filtering semantics.
 * @typedef {{ total_additions: number, total_deletions: number, files_changed: number, counted_additions: number, counted_deletions: number, counted_files_changed: number, binary_files: number, test_files_count: number, prod_files_count: number, prod_file_paths: string[], suspect_test_paths: string[], test_prod_cochange_commit: boolean, test_only_commit: boolean, uncovered_prod_commit: boolean, large_commit: boolean, sprawling_commit: boolean, excluded_files_count: number, excluded_additions: number, excluded_deletions: number, vendored_default_files_count: number, vendored_default_additions: number, vendored_default_deletions: number, source_branch: string, change_ratio: string, ai_confidence?: number, risk_score?: number, patterns?: string[], architectural_concerns?: string[], claude_summary?: string }} CommitStats
 * @typedef {CommitInfo & CommitStats & { commit_type: string }} CommitMetric
 */

/**
 * Parses `git branch -a` (or `git branch -a --merged <ref>`) output into a flat list of
 * normalized branch names. Strips the current-branch "* " marker, drops the
 * "remotes/origin/HEAD -> origin/main" pointer line (it names no real branch), and strips
 * only the "remotes/" segment from remote-only branches, keeping the remote qualifier
 * (e.g. "origin/pl/alerts-history"): a bare branch name with no local counterpart is not a
 * resolvable git ref, only "<remote>/<name>" is. A remote branch mirroring a local one of the
 * same name is deduped to the local entry rather than counted twice.
 * @param {string} output
 * @returns {string[]}
 */
function parseBranchList(output) {
  const rawLines = output.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.includes('->'))
    .map(line => line.replace(/^\*?\s*/, '').trim())
    .filter(Boolean);

  const localBranchNames = new Set(
    rawLines.filter(name => !name.startsWith('remotes/'))
  );

  const seenBranches = new Set();
  const branchLines = [];
  for (const name of rawLines) {
    if (!name.startsWith('remotes/')) {
      branchLines.push(name);
      continue;
    }
    const remoteQualified = name.split('/').slice(1).join('/');
    const nameWithoutRemote = name.split('/').slice(2).join('/');
    if (localBranchNames.has(nameWithoutRemote) || seenBranches.has(remoteQualified)) continue;
    seenBranches.add(remoteQualified);
    branchLines.push(remoteQualified);
  }
  return branchLines;
}

/**
 * Fetch and parse commits for one ref. When sinceStr is a date string (an explicit --since or
 * --days request), commits are filtered to that boundary, unchanged from prior behavior. When
 * sinceStr is null, no date filter is applied at all: --max-count bounds the fetch to
 * CONFIG.MAX_COMMITS instead, since the newest MAX_COMMITS commits on a ref is exactly what a
 * HEAD-anchored window asks for, and the caller never needs more than that from any single ref
 * before its own global slice (code-quality-metrics-g10). --since alone would not achieve this:
 * with no --since and no --max-count, git returns the whole history of the ref.
 *
 * The log format captures %ci (committer date), not %ai (author date). git's own --since above
 * filters on committer date, and CommitInfo.date drives the global newest-MAX_COMMITS sort
 * (below), analyzed_span_start/end, and the velocity/trend statistics -- all of which claim to
 * describe the same window --since names. Sourcing that field from author date instead made the
 * sort key and the filter disagree: on a rebase-and-land or cherry-pick workflow a commit's
 * author date can sit well before its committer date, so the "newest 50" by author date is not
 * the same 50 commits --since would call newest, and the two silently diverge (code-quality-
 * metrics-75 / mbiw). Measured: reproducing the recorded nodejs/node observation at its recorded
 * tool_commit gives large_commits_pct 14, matching; re-sorting the same window by author date at
 * current HEAD gave 18. Committer date is also the more defensible choice on its own terms: it
 * is when the work landed, which is what a calendar window is asking about, whereas author date
 * can be rewritten arbitrarily far into the past by a rebase. The `author` field (commit.author,
 * from %an) still carries authorship identity; only the point-in-time value changed.
 *
 * --no-merges: git show --numstat diffs a merge against its first parent, so merging a
 * single-commit branch reproduces that commit's diff and the same change is counted twice. A
 * merge commit's content belongs to the commits it merges.
 *
 * maxCommits (default CONFIG.MAX_COMMITS) is the per-run --max-commits override, threaded as a
 * parameter rather than mutated onto CONFIG: the widen fallback (below, in collectLocalMetrics)
 * calls this same function but must keep the true default regardless of any override in effect,
 * so the two call sites need to be able to disagree on this value. Number.isFinite(maxCommits)
 * is false only for the Infinity sentinel an 'unbounded' override resolves to, in which case the
 * bound is omitted from the command entirely -- unlike a numeric maxCommits, this only applies
 * meaningfully when sinceStr is also null, since --since already fetches with no count bound.
 * @param {string} ref
 * @param {string|null} sinceStr
 * @param {number} [maxCommits] effective --max-count bound; Infinity omits it entirely
 * @returns {CommitInfo[]}
 */
function fetchBranchCommits(ref, sinceStr, maxCommits = CONFIG.MAX_COMMITS) {
  const boundsArg = sinceStr
    ? `--since="${sinceStr}"`
    : (Number.isFinite(maxCommits) ? `--max-count=${maxCommits}` : '');
  // %B\x1f%cn: committer name appended after the body, needed so isBotCommit/isAIAgentCommit
  // (issue #62) can check committer identity, not just author. See lib/git.js's
  // COMMITTER_SEPARATOR comment for why this is a trailing \x1f-delimited suffix rather than
  // a new pipe-delimited field.
  const logOutput = runGitCommand(
    `git log --no-merges ${boundsArg} --pretty=format:"%H|%ci|%an|%B\x1f%cn%x1e" ${ref}`
  );
  return parseGitLog(logOutput);
}

/**
 * Parse --since <date> / --days <n> / --history <granular|squashed> CLI flags
 * into a collectLocalMetrics options object.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ days?: number, since?: string, history?: 'granular'|'squashed', lifecycle?: 'initial-build'|'established', config?: string, maxCommits?: number|'unbounded', outputDir?: string }}
 */
function parseCliArgs(argv) {
  /** @type {{ days?: number, since?: string, history?: 'granular'|'squashed', lifecycle?: 'initial-build'|'established', config?: string, maxCommits?: number|'unbounded', outputDir?: string }} */
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') {
      if (!argv[i + 1]) throw new Error('--since requires a YYYY-MM-DD date');
      const since = argv[i + 1];
      // git log treats an unparseable --since as matching nothing rather than
      // erroring, so a typo would silently read as "no activity in the window".
      if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(Date.parse(since))) {
        throw new Error(`--since must be a YYYY-MM-DD date, got '${since}'`);
      }
      options.since = since;
      i++;
    } else if (argv[i] === '--days') {
      if (!argv[i + 1]) throw new Error('--days requires a positive integer');
      const days = Number(argv[i + 1]);
      if (!Number.isInteger(days) || days <= 0) {
        throw new Error(`--days must be a positive integer, got '${argv[i + 1]}'`);
      }
      options.days = days;
      i++;
    } else if (argv[i] === '--history') {
      if (!argv[i + 1]) throw new Error("--history requires 'granular' or 'squashed'");
      const history = argv[i + 1];
      if (history !== 'granular' && history !== 'squashed') {
        throw new Error(`--history must be 'granular' or 'squashed', got '${history}'`);
      }
      options.history = history;
      i++;
    } else if (argv[i] === '--lifecycle') {
      // code-quality-metrics-zkhq, GitHub #71 part 1: mirrors --history's own shape exactly.
      if (!argv[i + 1]) throw new Error("--lifecycle requires 'initial-build' or 'established'");
      const lifecycle = argv[i + 1];
      if (lifecycle !== 'initial-build' && lifecycle !== 'established') {
        throw new Error(`--lifecycle must be 'initial-build' or 'established', got '${lifecycle}'`);
      }
      options.lifecycle = lifecycle;
      i++;
    } else if (argv[i] === '--config') {
      if (!argv[i + 1]) throw new Error('--config requires a path');
      options.config = argv[i + 1];
      i++;
    } else if (argv[i] === '--max-commits') {
      if (!argv[i + 1]) throw new Error("--max-commits requires a positive integer or 'unbounded'");
      const raw = argv[i + 1];
      if (raw === 'unbounded') {
        options.maxCommits = 'unbounded';
      } else {
        const maxCommits = Number(raw);
        if (!Number.isInteger(maxCommits) || maxCommits <= 0) {
          throw new Error(`--max-commits must be a positive integer or 'unbounded', got '${raw}'`);
        }
        options.maxCommits = maxCommits;
      }
      i++;
    } else if (argv[i] === '--output-dir') {
      if (!argv[i + 1]) throw new Error('--output-dir requires a path');
      options.outputDir = argv[i + 1];
      i++;
    }
  }
  return options;
}

/**
 * Resolve detectHistoryGranularity()'s raw verdict into the value used to
 * decide whether commit-unit verdicts are withheld (lib/report.js's
 * WITHHELD_WHEN_SQUASHED_KEYS, gated on summary.history_granularity).
 *
 * Commits unique to unmerged feature branches (workflow_type: feature_branch)
 * are granular by construction: they have not been squashed into anything
 * yet, whatever a (#N)/(GH-N) subject suffix on one of them says. A single
 * such commit among many otherwise-granular ones was previously enough to
 * classify the whole sample squashed/low and silence every commit-unit
 * verdict for the repository -- see code-quality-metrics-drv, measured on
 * remote_retro (1 of 29 commits, share 0.034) and daloopa (7 of 50, share
 * 0.140). This gate does not apply to workflow_type: trunk, where commits on
 * main after a squash merge genuinely are whole pull requests and withholding
 * is correct -- that case must not regress.
 * @param {{ value: 'granular'|'squashed'|'unknown', confidence: 'high'|'low' }} detectedGranularity
 * @param {'trunk'|'feature_branch'} workflowType
 * @returns {'granular'|'squashed'}
 */
function resolveHistoryGranularityForWithholding(detectedGranularity, workflowType) {
  if (workflowType === 'feature_branch') return 'granular';
  // Undetermined defaults to squashed, not unknown: squash-merge-delete is the more common
  // workflow, and asserting a verdict against bands that don't apply is a worse error than
  // withholding one that would have been valid (code-quality-metrics-bnq's notes).
  return detectedGranularity.value === 'unknown' ? 'squashed' : detectedGranularity.value;
}

/**
 * Reports the single graceful "nothing to analyze" outcome, used at both points that can
 * reach it: no commits were found in the window at all (uniqueCommits.length === 0), and
 * commits were found but every one of them failed analysis (metrics.length === 0 despite a
 * non-empty uniqueCommits -- code-quality-metrics-1g6j). Both are the same outcome from the
 * report's point of view -- zero analyzable commits -- so they share one message rather than
 * inventing a second way of saying it.
 */
function logNoCommitsAnalyzed() {
  console.log('⚠️ No commits found in the analysis period.');
  console.log('This could mean:');
  console.log('  • No development activity in the analysis period');
  console.log(`  • Try a wider window: node local-code-metrics.js --days 90`);
  process.exit(1);
}

/**
 * Main analysis function
 * @param {{ days?: number, since?: string, history?: 'granular'|'squashed', lifecycle?: 'initial-build'|'established', config?: string, maxCommits?: number|'unbounded', outputDir?: string }} [options] CLI
 *   window override: since (an explicit YYYY-MM-DD boundary) takes precedence over days (a
 *   count replacing CONFIG.ANALYSIS_DAYS). history forces history_granularity, overriding
 *   auto-detection for this invocation only.
 */
async function collectLocalMetrics(options = {}) {
  const analysisDays = options.days ?? CONFIG.ANALYSIS_DAYS;
  // true only when the operator passed --since or --days explicitly. Drives the choice between
  // a date-bounded window (existing behavior, preserved exactly) and the HEAD-anchored default
  // (code-quality-metrics-g10) below.
  const explicitWindow = options.since !== undefined || options.days !== undefined;

  // Per-run --max-commits override (not a CONFIG mutation -- see fetchBranchCommits' own
  // comment on why this is threaded as a parameter instead). Infinity represents the
  // 'unbounded' sentinel: Array.prototype.slice(0, Infinity) already returns the whole array,
  // and fetchBranchCommits treats a non-finite maxCommits as "omit --max-count entirely",
  // so both downstream uses need no further special-casing beyond this one resolution.
  const effectiveMaxCommits = options.maxCommits === 'unbounded'
    ? Infinity
    : (options.maxCommits ?? CONFIG.MAX_COMMITS);

  // PRECEDENCE (highest to lowest): CLI flags (--since/--days, applied via
  // `options` above and parseCliArgs' own flags) > an explicit --config <path>
  // (options.config, code-quality-metrics-ap7 -- for a scripted run against a
  // repository the operator does not control, where committing a
  // .codemetrics.json into that repo is not an option) > a .codemetrics.json in
  // the analysis target, resolved from process.cwd() > lib/config.js's own
  // defaults. --config COMPOSES with the target's own .codemetrics.json rather
  // than replacing it -- see lib/repoConfig.js's own doc comment for the full
  // rationale (JSON not JS, array union not replace, why this is four tiers
  // with --config and three without, not loadEnv's four) and AGENTS.md's
  // "Per-Repo Configuration Overrides" section for an example file.
  // Reset-then-apply every run: see CONFIG_OVERRIDABLE_DEFAULTS' own comment
  // for why.
  const { effective: effectiveConfig, sources: configSources, classBOverridden } =
    resolveConfigOverrides(CONFIG_OVERRIDABLE_DEFAULTS, process.cwd(), options.config);
  Object.assign(CONFIG, effectiveConfig);
  const config_sources = {
    files: configSources.map(source => source.file),
    overrides: configSources.reduce((acc, source) => Object.assign(acc, source.overrides), /** @type {Record<string, unknown>} */ ({})),
    class_b_overridden: classBOverridden
  };

  console.log('=== AI Code Drift Local Analysis ===');
  console.log('');

  // Verify we're in a Git repository
  const repoRoot = runGitCommand('git rev-parse --show-toplevel');
  if (!repoRoot) {
    console.error('❌ Not in a Git repository or Git not available');
    process.exit(1);
  }

  const remoteUrl = runGitCommand('git remote get-url origin') || 'No remote configured';

  console.log(`📁 Repository: ${remoteUrl}`);
  console.log(`📍 Local path: ${repoRoot}`);
  console.log(explicitWindow
    ? `📅 Analysis period: Last ${analysisDays} days`
    : `📅 Analysis period: newest ${CONFIG.MAX_COMMITS} commits (HEAD-anchored)`);
  console.log('');

  // Get all local and remote branches except main/master
  //
  // runGitCommand collapses "the command failed" and "the command succeeded with empty
  // stdout" into the same '' return, which is exactly the wrong thing here (code-quality-
  // metrics-wzy2): a freshly initialised repository with no branches yet has `git branch -a`
  // succeed with legitimately empty output, and that must not be reported as the tool being
  // unable to list branches. execSync's own success/failure is asked directly instead,
  // bypassing runGitCommand, the same way analyzeCommit's own numstat call does
  // (code-quality-metrics-p4c) -- a genuinely broken git invocation still exits below, while
  // an empty-but-successful one falls through to the no-feature-branches trunk fallback.
  let branchesOutput;
  try {
    branchesOutput = execSync('git branch -a', { encoding: 'utf8' }).trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Unable to list Git branches');
    console.error(`Error: ${msg}`);
    process.exit(1);
    return;
  }

  const branchLines = parseBranchList(branchesOutput);

  // Capture the main/master entry the filter below would otherwise discard,
  // so the trunk fallback can resolve the repo's actual default branch name
  // instead of assuming main. First match wins if a repo somehow has both.
  const defaultBranch = branchLines.find(branch => ['main', 'master'].includes(branch.toLowerCase())) ?? null;

  let allBranches = branchLines.filter(branch => !['main', 'master'].includes(branch.toLowerCase()));

  // A branch with no commits unique to the default branch is a merged remnant: it
  // contributes nothing beyond the default branch and must not stand in for it.
  // Degrade to filtering nothing when the merged listing is unavailable (e.g. the
  // git call failed), preserving prior behavior rather than guessing.
  const mergedOutput = defaultBranch ? runGitCommand(`git branch -a --merged ${defaultBranch}`) : '';
  if (mergedOutput) {
    const mergedBranches = new Set(parseBranchList(mergedOutput));
    allBranches = allBranches.filter(branch => !mergedBranches.has(branch));
  }

  // workflowType and branchesToAnalyze default to the feature-branch path; the
  // no-feature-branches fallback below overrides both for repos whose history
  // lives on main (trunk workflow), instead of returning early.
  /** @type {'trunk'|'feature_branch'} */
  let workflowType = 'feature_branch';
  let branchesToAnalyze = allBranches;

  if (allBranches.length === 0) {
    const fallbackRef = defaultBranch ?? 'HEAD';
    workflowType = 'trunk';
    branchesToAnalyze = [fallbackRef];
    console.log(`⚠️ No feature branches found. Falling back to trunk analysis on '${fallbackRef}'.`);
    console.log('');
  } else {
    console.log(`🌿 Found ${allBranches.length} feature branches:`);
    allBranches.forEach(branch => console.log(`   • ${branch}`));
    console.log('');
  }

  // Window boundary. An explicit --since/--days is a real request and is honored exactly
  // (regression guard, code-quality-metrics-g10): sinceStr becomes the boundary date and
  // fetchBranchCommits filters every ref to it, unchanged from prior behavior. Absent either
  // flag, the window is HEAD-anchored rather than anchored on today: sinceStr stays null and
  // fetchBranchCommits takes the newest CONFIG.MAX_COMMITS commits per ref regardless of
  // calendar date instead. A calendar window that happens to be "the last 30 days" reports
  // zero for a repository whose newest commit is older than that -- measured on remote_retro
  // (103 days), daloopa (~300), flight-info-spike (95) and dotnetdependencytracer (~270) -- and
  // a commit-count window matches the 50-commit windows calibration/README.md's bands were
  // derived from more closely than a date range does.
  let sinceStr = explicitWindow
    ? (options.since ?? (() => {
      const since = new Date();
      since.setDate(since.getDate() - analysisDays);
      return since.toISOString().split('T')[0];
    })())
    : null;

  console.log(sinceStr
    ? `🔍 Looking for commits since: ${sinceStr}`
    : `🔍 Looking for the newest ${CONFIG.MAX_COMMITS} commits (HEAD-anchored, no date filter)`);
  console.log('');

  // Safety ceiling for the --max-commits unbounded sentinel (GitHub #89, CONFIG.MAX_COMMITS_
  // SAFETY_LIMIT's own comment in lib/config.js): removing the cap entirely can attempt a git
  // log fetch over a very large history, which can throw ENOBUFS -- an error runGitCommand's
  // own catch swallows into an empty result, reading as "zero commits found" rather than
  // surfacing the real problem. A cheap `rev-list --count` pre-flight (never fetches full log
  // content, so it cannot hit the same failure) checks the actual size before committing to
  // that fetch; exceeding the limit throws loudly here, before any branch is fetched at all.
  // Only checked for 'unbounded': a bounded numeric --max-commits is the operator's own
  // explicit, self-limiting request (effectiveMaxCommits's own comment above).
  if (options.maxCommits === 'unbounded') {
    const expectedCommitCount = getExpectedCommitCount(branchesToAnalyze, sinceStr);
    if (expectedCommitCount > CONFIG.MAX_COMMITS_SAFETY_LIMIT) {
      throw new Error(
        `--max-commits unbounded would analyze approximately ${expectedCommitCount} commits, over the safety limit of ${CONFIG.MAX_COMMITS_SAFETY_LIMIT}. Narrow the window with --since/--days, or pass a bounded --max-commits <n> instead.`
      );
    }
  }

  // Collect commits from all feature branches
  /** @type {CommitInfo[]} */
  const allCommits = [];
  /** @type {Record<string, number>} */
  const branchCommitCounts = {};

  for (const branch of branchesToAnalyze) {
    process.stdout.write(`📊 Analyzing branch: ${branch}... `);

    try {
      const branchCommits = fetchBranchCommits(branch, sinceStr, effectiveMaxCommits);
      branchCommitCounts[branch] = branchCommits.length;

      // Add branch info to each commit
      branchCommits.forEach(commit => {
        commit.source_branch = branch;
        allCommits.push(commit);
      });

      console.log(`${branchCommits.length} commits`);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Error: ${msg}`);
      branchCommitCounts[branch] = 0;
    }
  }

  // Remove duplicate commits (same SHA)
  const uniqueCommits = allCommits.filter((commit, index, self) =>
    index === self.findIndex(c => c.sha === commit.sha)
  );

  console.log('');
  console.log(`📈 Found ${allCommits.length} total commits, ${uniqueCommits.length} unique`);
  console.log('📊 Commits per branch:', branchCommitCounts);
  console.log('');

  if (uniqueCommits.length === 0 && workflowType !== 'trunk') {
    // Feature branches found but none have commits in the analysis window.
    // This is the squash-merge-delete pattern: branches are deleted after merge,
    // leaving only an occasional surviving remote branch with stale commits.
    // Fall back to trunk analysis the same way as the "no feature branches" path.
    const fallbackRef = defaultBranch ?? 'HEAD';
    console.log(`⚠️ No commits found in feature branches. Falling back to trunk analysis on '${fallbackRef}'.`);
    console.log('');
    workflowType = 'trunk';
    branchesToAnalyze = [fallbackRef];

    process.stdout.write(`📊 Analyzing branch: ${fallbackRef}... `);
    const trunkCommits = fetchBranchCommits(fallbackRef, sinceStr, effectiveMaxCommits);
    trunkCommits.forEach(c => { c.source_branch = fallbackRef; allCommits.push(c); });
    branchCommitCounts[fallbackRef] = trunkCommits.length;
    console.log(`${trunkCommits.length} commits`);
    console.log('');

    uniqueCommits.push(...trunkCommits);
  }

  // Automatic fallback (code-quality-metrics-g10): an explicitly requested window that still
  // yields zero commits after the trunk fallback above is widened to the newest
  // CONFIG.MAX_COMMITS commits, ignoring the requested date boundary entirely, rather than
  // reporting an empty run the operator has to retry by hand. windowWidened and
  // effectiveSinceStr (used below for history-granularity detection and the reported span)
  // both record that this happened; a default (already HEAD-anchored) run that is still empty
  // here is a genuinely empty repository, not a window to widen.
  let windowWidened = false;
  let effectiveSinceStr = sinceStr;
  if (uniqueCommits.length === 0 && explicitWindow) {
    const fallbackRef = defaultBranch ?? 'HEAD';
    console.log(`⚠️ The requested window (since ${sinceStr}) returned no commits. Widening to the newest ${CONFIG.MAX_COMMITS} commits on '${fallbackRef}', ignoring the requested date boundary.`);
    console.log('');
    workflowType = 'trunk';
    branchesToAnalyze = [fallbackRef];

    process.stdout.write(`📊 Analyzing branch: ${fallbackRef}... `);
    const widenedCommits = fetchBranchCommits(fallbackRef, null);
    widenedCommits.forEach(c => { c.source_branch = fallbackRef; allCommits.push(c); });
    branchCommitCounts[fallbackRef] = widenedCommits.length;
    console.log(`${widenedCommits.length} commits`);
    console.log('');

    uniqueCommits.push(...widenedCommits);
    if (widenedCommits.length > 0) {
      windowWidened = true;
      effectiveSinceStr = null;
    }
  }

  if (uniqueCommits.length === 0) {
    logNoCommitsAnalyzed();
    return;
  }

  // History granularity: independent of workflowType (which only distinguishes
  // feature-branch from trunk, not squash-merge-delete from direct push -- see
  // code-quality-metrics-bnq). --no-merges above strips true merge commits from
  // the analyzed set, so their count is fetched separately here; their presence
  // is itself evidence FOR granular history (a true merge-button workflow keeps
  // individual commits, e.g. emberjs), not a squash signal.
  // effectiveSinceStr, not sinceStr: after a widen (above), the analyzed commits are no longer
  // bounded by the originally requested date, so querying these with the stale requested
  // boundary would starve detection of merge/committer signal that the actual analyzed window
  // does contain. In HEAD-anchored mode (effectiveSinceStr null from the start) these are
  // unbounded too, matching fetchBranchCommits' own null-means-no-date-filter contract.
  //
  // The `commits` population passed to detectHistoryGranularity below is deferred until
  // commitsToAnalyze exists (code-quality-metrics-66oo): merge/committer signals are fetched
  // here because historyRefs/effectiveSinceStr are already in scope, but the PR-reference share
  // itself must be computed over the same commits the rest of the report calls "analyzed" --
  // the ones that survive bot-filtering and the MAX_COMMITS slice into commitsToAnalyze, not
  // uniqueCommits (the full pre-slice candidate pool across every branch, which can be an order
  // of magnitude larger; measured on 73V: 1246 candidates against 50 actually analyzed).
  const historyRefs = branchesToAnalyze.join(' ');
  const historySinceArg = effectiveSinceStr ? `--since="${effectiveSinceStr}" ` : '';
  const mergeLog = runGitCommand(`git log --merges ${historySinceArg}--pretty=format:"%H" ${historyRefs}`);
  const mergeCommitCount = mergeLog ? mergeLog.split('\n').filter(Boolean).length : 0;
  const committerLog = runGitCommand(`git log --no-merges ${historySinceArg}--pretty=format:"%cn" ${historyRefs}`);
  const committerNames = committerLog ? committerLog.split('\n').filter(Boolean) : [];

  // The repository's own newest commit across the analyzed refs (code-quality-metrics-bb29),
  // independent of --since/--days and of MAX_COMMITS -- it answers "what is the newest commit
  // that exists here", not "what did this run select." Compared against analyzedSpanEnd below
  // (in the summary, and in the masthead via lib/report-template.js's renderStaleWindowLine) to
  // state a real gap, if one exists, rather than guessing staleness from the report's own
  // generation date.
  const repositoryNewestCommitDate = findNewestCommitDate(branchesToAnalyze);

  // Project lifecycle (code-quality-metrics-31w): purely structural, no tuned number. Every
  // reference window this toolkit's bands were calibrated on measures maintenance-era work on
  // a decades-old codebase (calibration/observations.json's brownfield-only-lifecycle
  // reservation, high severity), and several bands are biased against a genuine initial build
  // in the same direction, toward a worse verdict (see lib/report.js's WITHHELD_WHEN_GREENFIELD
  // comment for the citations). Rather than invent an age or commit-count cutoff, this checks
  // one fact: does the analyzed window include the repository's own first commit(s)?
  // `git rev-list --max-parents=0 --all` finds those roots across every ref, not just
  // branchesToAnalyze, since the question is about the repository's whole history, independent
  // of workflow_type -- unlike history_granularity above, no feature-branch special case is
  // needed here: a commit's SHA either is one of the repository's roots or it is not,
  // regardless of which ref found it.
  const { shas: rootCommitShas, failed: rootCommitDetectionFailed } = findRepositoryRootShas();
  if (rootCommitDetectionFailed) {
    console.log('⚠️ Unable to determine the repository\'s root commit(s); project_lifecycle will report as undetermined rather than established.');
    console.log('');
  }

  // Independent commit-count cross-check (code-quality-metrics-tde9): only meaningful for an
  // explicit, non-widened window, where effectiveSinceStr is still the boundary that was
  // actually requested -- a HEAD-anchored run (effectiveSinceStr null from the start) or a
  // widened one (effectiveSinceStr reset to null above) has no comparable "--since window" for
  // git rev-list to count against. null (not 0) signals "not applicable" here, distinct from a
  // genuine 0-vs-0 count that would otherwise look identical to "never checked".
  const windowExpectedCommitCount = (effectiveSinceStr && !windowWidened)
    ? getExpectedCommitCount(branchesToAnalyze, effectiveSinceStr)
    : null;

  // Dependency/CI bot exclusion (issue #62): dependabot, renovate, github-actions, release/
  // version-bump bots and other [bot] accounts are excluded from the analyzed window entirely
  // -- not merely flagged -- so they cannot crowd real human commits out of the MAX_COMMITS
  // budget below, the same way calibration/observations.json's bot-traffic reservation
  // describes an ember window where 8 of 49 commits were Renovate. isBotCommit checks the
  // AI-agent exemption FIRST and unconditionally (lib/metrics.js), so a commit attributable
  // to Claude Code, Copilot, Cursor, Devin, Aider etc. by author, committer, or a
  // Co-Authored-By trailer is never excluded here, no matter what CONFIG.BOT_ACCOUNT_PATTERNS
  // matches -- those commits are the subject this toolkit measures, not noise. Bot commits are
  // counted and reported (bot_commits_count/bot_commits_pct below), not silently dropped.
  const botCommits = CONFIG.EXCLUDE_BOT_COMMITS
    ? uniqueCommits.filter(c => isBotCommit({ author: c.author, committer: c.committer, message: c.message, full_message: c.full_message }))
    : [];
  const humanCommits = CONFIG.EXCLUDE_BOT_COMMITS
    ? uniqueCommits.filter(c => !isBotCommit({ author: c.author, committer: c.committer, message: c.message, full_message: c.full_message }))
    : uniqueCommits;
  if (botCommits.length > 0) {
    console.log(`🤖 Excluded ${botCommits.length} dependency/CI bot commit(s) from the analyzed window (${((botCommits.length / uniqueCommits.length) * 100).toFixed(2)}% of ${uniqueCommits.length} found).`);
    console.log('');
  }

  // Analyze commits in detail. humanCommits (bot commits already excluded above) is a
  // concatenation of per-branch results in branch-iteration order, not a globally date-sorted
  // list, so slicing it directly would keep whichever MAX_COMMITS commits were encountered
  // first rather than the newest MAX_COMMITS across all branches -- the opposite of what a
  // HEAD-anchored window claims to select (code-quality-metrics-g10). Select newest-first,
  // then re-sort the selected set oldest-first before use: computeStatistics's trend
  // calculation (lib/statistics.js) assumes its `timestamps` argument arrives oldest-first and
  // does not re-sort internally, unlike computeVelocity, which does.
  //
  // "newest" here means newest by commit.date, which is committer date (fetchBranchCommits'
  // own comment, code-quality-metrics-75 / mbiw) -- the same clock --since filters on, so an
  // explicit window and the HEAD-anchored default both select the commit set they claim to.
  //
  // effectiveMaxCommits, not CONFIG.MAX_COMMITS: with an explicit --since, fetchBranchCommits
  // applies no per-branch count bound at all (its own comment), so this slice is the only place
  // a --max-commits override can take effect for that mode. slice(0, Infinity) for the
  // 'unbounded' sentinel returns the whole array, matching fetchBranchCommits' own Infinity
  // handling with no further special-casing needed here.
  const commitsToAnalyze = [...humanCommits]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, effectiveMaxCommits)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  console.log(`🔬 Analyzing ${commitsToAnalyze.length} commits in detail...`);
  console.log('');

  // History granularity detection itself (code-quality-metrics-66oo): commitsToAnalyze, not
  // uniqueCommits, so pr_reference_share describes the same population the report's Flight Log
  // and "analyzed commit subjects" sentence describe. merge_commit_count and committerNames
  // above stay window-scoped rather than analyzed-set-scoped: a true merge commit cannot appear
  // in commitsToAnalyze at all (fetchBranchCommits strips them with --no-merges), so restricting
  // that signal to the analyzed set would make it read zero unconditionally and lose the very
  // evidence-for-granular signal it exists to carry.
  const detectedGranularity = detectHistoryGranularity({ commits: commitsToAnalyze, committerNames, mergeCommitCount });
  const detectedForWithholding = resolveHistoryGranularityForWithholding(detectedGranularity, workflowType);
  const historyGranularity = options.history ?? detectedForWithholding;

  // Names the reason history_granularity (effective) differs from history_granularity_detected
  // (raw), when it does (code-quality-metrics-q5uz). history_granularity_override alone cannot
  // carry this: it is documented, and used elsewhere (project_lifecycle_override,
  // max_commits_override), specifically as "the operator's own CLI flag, or null" -- overloading
  // it to also mean "the workflow_type gate fired" would break that established meaning. Before
  // this field existed, a workflow_type: feature_branch run that silently forced granular over a
  // raw squashed/unknown detection recorded history_granularity_override: null, identical to a
  // run where nothing overrode anything -- exactly the 73V case, which narrated the override in
  // its rendered report while the JSON gave no sign anything had happened.
  //
  // null when historyGranularity already equals the raw detected value: nothing forced anything,
  // so there is no reason to name. Otherwise: 'operator' when an explicit --history flag is why
  // (it sets historyGranularity directly, taking precedence over detectedForWithholding
  // entirely); 'workflow_type_feature_branch' when resolveHistoryGranularityForWithholding's
  // feature-branch gate is why; 'unknown_defaults_to_squashed' when its other branch (an
  // undetermined raw verdict defaulting to squashed under workflow_type: trunk, per
  // code-quality-metrics-bnq) is why.
  const historyGranularityForcedReason = historyGranularity === detectedGranularity.value
    ? null
    : (options.history != null
      ? 'operator'
      : (workflowType === 'feature_branch' ? 'workflow_type_feature_branch' : 'unknown_defaults_to_squashed'));

  /** @type {CommitMetric[]} */
  const metrics = [];
  const progressInterval = Math.max(1, Math.floor(commitsToAnalyze.length / 10));

  for (let i = 0; i < commitsToAnalyze.length; i++) {
    const commit = commitsToAnalyze[i];

    if (i % progressInterval === 0 || i === commitsToAnalyze.length - 1) {
      const progress = Math.round((i + 1) / commitsToAnalyze.length * 100);
      process.stdout.write(`\r⏳ Processing commits... ${progress}%`);
    }

    const analysis = analyzeCommit(commit.full_sha, commit.source_branch ?? '');
    if (analysis) {
      metrics.push(/** @type {CommitMetric} */ ({
        ...commit,
        ...analysis,
        commit_type: workflowType
      }));
    }
  }

  console.log('\n');

  // code-quality-metrics-1g6j: uniqueCommits was non-empty (the guard above already ruled
  // out zero commits found), but every one of them can still fail analyzeCommit (lib/git.js)
  // -- a true merge commit by its own parent-count check, or a genuinely failed `git show
  // --numstat` -- leaving metrics empty regardless. Math.min(...[]) is Infinity and
  // Math.max(...[]) is -Infinity, so computing analyzedSpanStart/End below would throw
  // `RangeError: Invalid time value` rather than reporting the same "nothing to analyze"
  // outcome the zero-commits guard above already reports gracefully. Absent, not null or a
  // placeholder, is the right shape for analyzed_span_start/end here: a span over zero
  // commits does not exist, and returning before the summary is built (as the zero-commits
  // guard above already does) keeps the report and local_metrics_summary.json in agreement
  // by both omitting it identically, rather than one inventing a placeholder the other lacks.
  if (metrics.length === 0) {
    logNoCommitsAnalyzed();
    return;
  }

  // Content-duplicate detection (code-quality-metrics-7ccq): the existing same-SHA dedup above
  // (uniqueCommits) does not catch a squash-merge duplicate, since the squash commit on the
  // default branch and the feature-branch commits it squashed are different SHAs carrying the
  // same change -- when the branch survives the merge, both remain reachable and both land in
  // metrics. findContentDuplicateGroups (lib/git.js) is a floor, not an exact test: it will miss
  // a multi-commit branch whose squash diff differs from the sum of its parts, and could in
  // principle group two unrelated commits that coincide on subject and diff size. For both
  // reasons this is report-only -- a detected group is surfaced as a count beside total_commits,
  // the honest-fallback choice from code-quality-metrics-7ccq, never used to silently drop an
  // entry from metrics or any downstream rate/distribution.
  const contentDuplicateGroups = findContentDuplicateGroups(metrics);
  const contentDuplicateRedundantEntriesCount = contentDuplicateGroups.reduce((sum, g) => sum + (g.shas.length - 1), 0);
  if (contentDuplicateGroups.length > 0) {
    console.log(`♻️  ${contentDuplicateGroups.length} content-duplicate group(s) detected: the same change reachable more than once in the analyzed sample (${contentDuplicateRedundantEntriesCount} redundant entr${contentDuplicateRedundantEntriesCount === 1 ? 'y' : 'ies'} among ${metrics.length} analyzed commits). See content_duplicate_groups in the summary.`);
    console.log('');
  }

  // Statistical distributions. timestamps is built from m.date, which is committer date
  // (code-quality-metrics-75 / mbiw) -- so the trend regression inside computeStatistics
  // orders commits, and analyzedSpanStart/End below reports a span, on the same clock
  // --since itself filters by.
  //
  // Built from counted_additions/counted_deletions/counted_files_changed, not the raw
  // total_additions/total_deletions/files_changed (GitHub #90): CLAUDE.md documents
  // ANALYSIS_IGNORE_PATTERNS as excluding globs from "the line-count distributions", and the
  // counted fields are the exclusion-aware siblings lib/git.js's analyzeCommit computes for
  // exactly this (see that function's own comment). Equal to the raw fields, and so equal to
  // every prior measurement, whenever nothing is excluded.
  const lineSizes = metrics.map(m => m.counted_additions + m.counted_deletions);
  const fileCounts = metrics.map(m => m.counted_files_changed);
  const timestamps = metrics.map(m => new Date(m.date).getTime());
  const lineStats = computeStatistics(lineSizes, timestamps);
  const fileStats = computeStatistics(fileCounts, timestamps);

  // The actual analyzed span (code-quality-metrics-g10 hard requirement): derived from the
  // analyzed commits themselves, never from the requested window or from "today", so a report
  // is never presentable as covering recent activity when it does not. Reported unconditionally
  // -- both for an explicit --since/--days window and for the HEAD-anchored default -- since a
  // requested window can itself be wider than what was actually found (e.g. --days 365 on a
  // repository whose commits all land in the last 40 of those days). This is a committer-date
  // span, matching timestamps above and --since's own semantics (code-quality-metrics-75 / mbiw):
  // on a rebase-and-land workflow a commit's author date can fall well outside it.
  const analyzedSpanStart = new Date(Math.min(...timestamps)).toISOString().split('T')[0];
  const analyzedSpanEnd = new Date(Math.max(...timestamps)).toISOString().split('T')[0];

  // The per-commit outlier flag is withdrawn (code-quality-metrics-496). Every window-relative
  // cutoff measured -- mean + 2*stddev, a bare p95, and a log-scale Tukey fence at several
  // multipliers -- either un-flags a commit that was already flagged when a larger commit joins
  // the window (violating monotonicity 45-70% of the time across 3000 randomized heavy-tailed
  // windows), or goes inert once the window's own body spans orders of magnitude, exactly the
  // case this flag exists to catch: on the bug's own measured window, the log-Tukey fence
  // required upward of ~28,600 lines to fire at all. No absolute alternative was adopted either
  // (see metrics-specification.md's Per-Commit Outlier Flag section for why). p50/p90/p95 remain
  // in `local_metrics_summary.json` as the statistics that can support a claim on this
  // distribution; `large_commit` remains as the absolute, non-window-relative size flag.
  //
  // Velocity. Also committer-date-ordered (m.date; code-quality-metrics-75 / mbiw), so "commits
  // per day" and the accelerating/decelerating trend describe the rate work actually landed at,
  // not the rate it was originally authored at.
  const dates = metrics.map(m => m.date);
  const velocity = computeVelocity(dates);

  // Net additions ratio distribution: (additions - deletions) / (additions + deletions)
  // Bounded [-1, +1]: 1.0 = entirely net-new code, 0.0 = balanced, negative = net deletion (cleanup)
  // Replaces the unbounded additions / max(deletions, 1) formula, which inflated ratios to ~500
  // for net-new-file commits (zero deletions), distorting both median and p90.
  //
  // Built from counted_additions/counted_deletions, not the raw whole-diff total_additions/
  // total_deletions (code-quality-metrics-ce9m): a vendored dependency sync (e.g. a large
  // excluded deletion) would otherwise dominate this informational metric even though it
  // describes no real development. Equal to the raw fields, and so equal to every prior
  // measurement, whenever nothing is excluded.
  const ratios = metrics.map(m => {
    const total = m.counted_additions + m.counted_deletions;
    return total === 0 ? 0 : (m.counted_additions - m.counted_deletions) / total;
  });
  const ratioStats = computeStatistics(ratios, timestamps);

  // Message quality
  const qualityCount = metrics.filter(m => scoreMessageQuality(m.message, m.full_message)).length;
  const message_quality_pct = metrics.length > 0
    ? ((qualityCount / metrics.length) * 100).toFixed(2)
    : '0.00';

  // Claude API analysis (optional — runs only when ANTHROPIC_API_KEY is set)
  const anthropicClient = await getAnthropicClient();
  /** @type {any[]} */
  let claudeResults = [];
  if (anthropicClient) {
    const claudeTargets = selectClaudeCommits(metrics);
    if (claudeTargets.length > 0) {
      console.log(`🤖 Running Claude analysis on ${claudeTargets.length} high-risk commits...`);
      claudeResults = await analyzeWithClaude(anthropicClient, claudeTargets);
      for (const result of claudeResults) {
        const metric = metrics.find(m => m.sha === result.sha);
        if (metric && !result.error) {
          Object.assign(metric, {
            ai_confidence: result.ai_confidence,
            risk_score: result.risk_score,
            patterns: result.patterns,
            architectural_concerns: result.architectural_concerns,
            claude_summary: result.summary
          });
        }
      }
    } else {
      console.log('ℹ️  No commits met Claude analysis threshold');
    }
  } else {
    console.log('ℹ️  Claude analysis skipped (no ANTHROPIC_API_KEY set)');
  }

  // Duplicate code detection: Layer 1 (jscpd, static) always runs over the
  // production files touched by the analyzed commits; Layer 2 (Claude,
  // semantic) runs over the same files widened to their module neighbors,
  // only when ANTHROPIC_API_KEY is set. Reuses the anthropicClient already
  // resolved above rather than creating a second client.
  const prodFilePaths = [...new Set(metrics.flatMap(m => m.prod_file_paths || []))];
  const suspectTestPaths = [...new Set(metrics.flatMap(m => m.suspect_test_paths || []))];
  if (suspectTestPaths.length > 0) {
    console.warn(`⚠️  ${suspectTestPaths.length} production-classified file(s) have path segments that look like test directories (test/, spec/, __tests__, etc.) but matched no TEST_FILE_PATTERNS entry. Test coverage metrics may be understated. Review these paths and add patterns to TEST_FILE_PATTERNS in lib/config.js if needed:`);
    suspectTestPaths.forEach(p => console.warn(`   ${p}`));
  }
  // One combined call: jscpd is the expensive part of a run, so findings and
  // statistics come from the same scan rather than two passes over the same files.
  const { findings: staticDuplicates, statistics: duplicateStatistics, unsupportedExtensions } = runDuplicateAnalysis(prodFilePaths);
  /** @type {any[]} */
  let semanticFindings = [];
  // false: layer did not run (no client). true: ran and produced a usable result
  // (possibly genuinely zero findings). 'unmeasured': attempted but the call
  // failed or its response was truncated — must not be confused with a real 0.
  /** @type {boolean|'unmeasured'} */
  let semanticLayerStatus = false;
  if (anthropicClient && prodFilePaths.length > 0) {
    console.log(`🔁 Running semantic duplicate analysis on ${prodFilePaths.length} production file(s)...`);
    const neighborFiles = resolveModuleNeighbors(prodFilePaths);
    const semanticResult = await runSemanticDuplicateAnalysis(anthropicClient, neighborFiles, staticDuplicates);
    semanticFindings = semanticResult.findings;
    // The outcome is a plain field on the result: 'ok' when the call produced a usable
    // answer, 'unmeasured' when it failed or was truncated. Never collapse the second
    // into a confident true, which is what made a failed call look like a real zero.
    semanticLayerStatus = semanticResult.status === 'unmeasured' ? 'unmeasured' : true;
  }

  // Excluded volume (code-quality-metrics-3b6): a silent exclusion is the same defect class
  // as the silent inclusion code-quality-metrics-y8j fixes, so this reports what
  // ANALYSIS_IGNORE_PATTERNS actually removed from the scored metrics -- count, lines, and
  // share of the total lines analyzed -- following the config_sources precedent for
  // surfacing something that changes the headline numbers by a lot.
  const totalLinesAnalyzed = metrics.reduce((sum, m) => sum + m.total_additions + m.total_deletions, 0);
  const excludedFilesCount = metrics.reduce((sum, m) => sum + (m.excluded_files_count || 0), 0);
  const excludedLinesCount = metrics.reduce((sum, m) => sum + (m.excluded_additions || 0) + (m.excluded_deletions || 0), 0);
  const analysis_exclusions = {
    patterns: CONFIG.ANALYSIS_IGNORE_PATTERNS,
    excluded_files_count: excludedFilesCount,
    excluded_lines_count: excludedLinesCount,
    excluded_lines_pct: totalLinesAnalyzed > 0 ? ((excludedLinesCount / totalLinesAnalyzed) * 100).toFixed(2) : '0.00'
  };

  // Vendored/generated default share (code-quality-metrics-3b6, the higher-value half):
  // computed from CONFIG.DUPLICATE_IGNORE_PATTERNS's existing, non-empty defaults
  // regardless of whether ANALYSIS_IGNORE_PATTERNS is configured, so this is visible on
  // every repository by default, not only one whose owner has already found the problem.
  const vendoredFilesCount = metrics.reduce((sum, m) => sum + (m.vendored_default_files_count || 0), 0);
  const vendoredLinesCount = metrics.reduce((sum, m) => sum + (m.vendored_default_additions || 0) + (m.vendored_default_deletions || 0), 0);
  const vendored_generated_share = {
    patterns: CONFIG.DUPLICATE_IGNORE_PATTERNS,
    files_count: vendoredFilesCount,
    lines_count: vendoredLinesCount,
    lines_pct: totalLinesAnalyzed > 0 ? ((vendoredLinesCount / totalLinesAnalyzed) * 100).toFixed(2) : '0.00'
  };

  // Pre-compute pct fields once — reused in both summary object and classifyDoraArchetype call
  const large_commits_pct = metrics.length > 0 ? ((metrics.filter(m => m.large_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const sprawling_commits_pct = metrics.length > 0 ? ((metrics.filter(m => m.sprawling_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const test_coverage_rate = metrics.length > 0 ? ((metrics.filter(m => m.test_prod_cochange_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const test_isolation_rate = metrics.length > 0 ? ((metrics.filter(m => m.test_only_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const uncovered_prod_rate = metrics.length > 0 ? ((metrics.filter(m => m.uncovered_prod_commit).length / metrics.length) * 100).toFixed(2) : '0.00';

  // How many of the analyzed commits actually came from each branch (code-quality-metrics-8sq),
  // as opposed to branch_commit_counts above, which counts what was fetched from each branch
  // before global selection and can no longer be read as "how much this branch contributed":
  // in HEAD-anchored mode every branch fetch is capped at CONFIG.MAX_COMMITS regardless of how
  // few of those commits survive into the analyzed set. A repository whose sample is spread
  // across many long-abandoned branches (measured: remote_retro, 29 analyzed commits across 30
  // branches; dotnetdependencytracer, 50 across 49) draws no shipped-practice signal from most
  // of those branches at all, and a reader has no way to see that from total_commits alone.
  // This does not filter anything out -- see this project's own notes on why an unjustified
  // recency bound was rejected in favor of visibility -- it only makes the shape of the sample
  // visible next to the count.
  /** @type {Record<string, number>} */
  const analyzed_branch_commit_counts = {};
  for (const m of metrics) {
    const branch = m.source_branch;
    analyzed_branch_commit_counts[branch] = (analyzed_branch_commit_counts[branch] || 0) + 1;
  }
  const branches_with_analyzed_commits = Object.keys(analyzed_branch_commit_counts).length;

  // Scaffold root commit detection (code-quality-metrics-fex3, GitHub #71 part 2): a root
  // commit that introduces no production files (e.g. a GitHub repo-reservation scaffold of
  // just LICENSE + README) is not the true start of the build. Map each raw root sha to its
  // effective counterpart -- itself, unless it is a scaffold, in which case the first later
  // commit that does introduce a production file -- before checking whether the analyzed
  // window includes "the start of history". See lib/git.js's findEffectiveRootSha for the
  // full mechanism and its caveats.
  const effectiveRootResults = rootCommitShas.map(findEffectiveRootSha);
  const effectiveRootShas = effectiveRootResults.map(r => r.sha);
  // True when the forward-walk query itself failed (GitHub #89) rather than genuinely finding
  // no later production-bearing commit -- see findEffectiveRootSha's own comment. Folded into
  // detectedLifecycle below the same way root_commit_detection_failed already is: a swallowed
  // failure here previously read as a confident scaffold_root_detected: false, indistinguishable
  // from a genuinely non-scaffold root.
  const effectiveRootDetectionFailed = effectiveRootResults.some(r => r.failed);
  if (effectiveRootDetectionFailed) {
    console.log('⚠️ Unable to walk forward from a scaffold root commit; project_lifecycle will report as undetermined rather than established.');
    console.log('');
  }
  const scaffoldRootDetected = rootCommitShas.some((sha, i) => sha !== effectiveRootShas[i]);

  // See the rootCommitShas comment above: this is the actual structural check, run once the
  // final analyzed commit set (metrics) is known, against the whole repository's (effective)
  // root commit(s) fetched earlier.
  const includesRepositoryRoot = windowIncludesRepositoryRoot({
    analyzedShas: metrics.map(m => m.full_sha),
    rootShas: effectiveRootShas
  });
  // 'undetermined' when the root-commit query, or the scaffold forward-walk query, itself
  // failed: neither 'established' (which would silently assert brownfield bands apply, exactly
  // the defect this guards against) nor 'initial-build' (which would assert a fact the failed
  // query never confirmed). Distinct from both, and paired with root_commit_detection_failed /
  // effective_root_detection_failed below so the failure is visible in the written summary
  // rather than reading as a confident verdict either way (code-quality-metrics-dqri, GitHub
  // #89).
  const detectedLifecycle = (rootCommitDetectionFailed || effectiveRootDetectionFailed)
    ? 'undetermined'
    : (includesRepositoryRoot ? 'initial-build' : 'established');

  // Operator override (code-quality-metrics-zkhq, GitHub #71 part 1): mirrors --history's own
  // shape exactly. CLI (options.lifecycle) takes precedence over a repo-local
  // .codemetrics.json's own `lifecycle` key (config_sources.overrides.lifecycle, already
  // resolved to the correct file-precedence winner by resolveConfigOverrides/lib/repoConfig.js
  // -- 'lifecycle' is a META key there, recognized but never merged into `effective`, since it
  // is not a CONFIG value), which in turn takes precedence over the structural detection above.
  const project_lifecycle_override = options.lifecycle ?? config_sources.overrides.lifecycle ?? null;
  const project_lifecycle = project_lifecycle_override ?? detectedLifecycle;

  // Deployment frequency (GitHub #65): opt-in via releaseTagPattern in .codemetrics.json.
  // Tags are the primary source; commit subjects are the fallback when no tags exist.
  // Both are a floor -- deleted tags and unrecognized conventions are invisible.
  const releaseTagPattern = /** @type {string|null} */ (config_sources.overrides.releaseTagPattern ?? null);
  const stagingTagPattern = /** @type {string|null} */ (config_sources.overrides.stagingTagPattern ?? null);
  const releaseCommitSubjectPattern = /** @type {string|null} */ (config_sources.overrides.releaseCommitSubjectPattern ?? null);
  let deployment_frequency_floor = null;
  if (releaseTagPattern || releaseCommitSubjectPattern) {
    const tagEvents = fetchReleaseTags(releaseTagPattern, stagingTagPattern);
    const commitEvents = releaseCommitSubjectPattern
      ? findReleaseCommitsFromSubjects(
          metrics.map(m => ({ sha: m.sha, subject: m.message, date: m.date })),
          releaseCommitSubjectPattern
        )
      : null;
    const events = tagEvents.length > 0 ? tagEvents : (commitEvents ?? []);
    deployment_frequency_floor = detectDeploymentFrequency(events, new Date().toISOString());

    if (releaseTagPattern) {
      const allTagNames = runGitCommand("git tag --list").split('\n').map(t => t.trim()).filter(Boolean);
      const unmatched = findUnmatchedVersionShapedRefs(allTagNames, releaseTagPattern, stagingTagPattern);
      if (unmatched.length > 0) {
        console.warn(`⚠️  ${unmatched.length} version-shaped tag(s) do not match releaseTagPattern and were excluded: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '...' : ''}`);
      }
    }
  }

  // Commit shipment visibility (GitHub #107): classify each analyzed commit as confirmed
  // shipped (full_sha reachable from the default branch) or unconfirmed (not a direct
  // ancestor -- includes squash-merged commits that git cannot distinguish from abandoned
  // branches via ancestry alone; the count is a lower bound on unshipped work).
  const default_branch = findDefaultBranch();
  const defaultBranchShas = fetchDefaultBranchShas(default_branch, 5 * CONFIG.MAX_COMMITS);
  const shipped_commits_count = metrics.filter(m => defaultBranchShas.has(m.full_sha)).length;
  const unconfirmed_commits_count = metrics.length - shipped_commits_count;

  // Generate summary statistics
  const summary = {
    analysis_date: new Date().toISOString(),
    analysis_period_days: analysisDays,
    total_commits: metrics.length,
    filtered_from: uniqueCommits.length,
    // Content-duplicate detection (code-quality-metrics-7ccq): how many groups of analyzed
    // commits share a content signature (normalized subject, total_additions, total_deletions)
    // despite different SHAs, and how many redundant entries that represents -- see
    // findContentDuplicateGroups' own comment (lib/git.js) for the detection method and its
    // known floor. Reported beside total_commits, not subtracted from it: a reader can see the
    // sample's real shape without this toolkit silently correcting a number on a heuristic that
    // can both under- and (in principle) over-detect.
    content_duplicate_group_count: contentDuplicateGroups.length,
    content_duplicate_redundant_entries_count: contentDuplicateRedundantEntriesCount,
    content_duplicate_groups: contentDuplicateGroups,
    // Dependency/CI bot commits excluded from the window above (issue #62), counted and
    // reported rather than silently dropped: a window that is, say, 40 percent bot traffic is
    // itself a finding, and a reader needs to know the human denominator every other
    // percentage in this summary is computed against shrank because of it.
    bot_commits_count: botCommits.length,
    bot_commits_pct: uniqueCommits.length > 0 ? ((botCommits.length / uniqueCommits.length) * 100).toFixed(2) : '0.00',
    // The actual span covered by the analyzed commits (code-quality-metrics-g10), never the
    // requested window or "today" -- see analyzedSpanStart/End's own comment above for why.
    // Rendered in the HTML masthead too (lib/report-template.js's renderMasthead), not only here.
    analyzed_span_start: analyzedSpanStart,
    analyzed_span_end: analyzedSpanEnd,
    // The repository's own newest commit across the analyzed refs (code-quality-metrics-bb29),
    // read from repositoryNewestCommitDate above. null when the query itself found nothing (an
    // orphan/empty ref set) -- see findNewestCommitDate's own comment for why null rather than
    // an empty string.
    repository_newest_commit_date: repositoryNewestCommitDate,
    // null when the run was HEAD-anchored from the start (no --since/--days given); otherwise
    // the boundary date that was actually requested, whether or not it was later widened.
    window_requested_since: explicitWindow ? sinceStr : null,
    // true only when an explicit --since/--days window returned zero commits and was widened to
    // the newest CONFIG.MAX_COMMITS regardless of date (see the widen block above). A
    // HEAD-anchored default run is never "widened": it had no date restriction to begin with.
    window_widened: windowWidened,
    // Independent git rev-list count over the same resolved ref(s), for the loud-failure
    // guard in generateInsights (code-quality-metrics-tde9). null when not applicable
    // (HEAD-anchored or widened run) -- see windowExpectedCommitCount's own comment above.
    window_expected_commit_count: windowExpectedCommitCount,
    workflow_type: workflowType,
    history_granularity: historyGranularity,
    history_granularity_detected: detectedGranularity.value,
    history_granularity_confidence: detectedGranularity.confidence,
    history_granularity_signals: detectedGranularity.signals,
    history_granularity_override: options.history ?? null,
    // Names the reason history_granularity differs from history_granularity_detected: null when
    // it does not differ, otherwise 'operator' | 'workflow_type_feature_branch' |
    // 'unknown_defaults_to_squashed'. See historyGranularityForcedReason's own comment above for
    // why this is a separate field rather than folded into history_granularity_override
    // (code-quality-metrics-q5uz).
    history_granularity_forced_reason: historyGranularityForcedReason,
    // Visibility for --max-commits (this override has no .codemetrics.json counterpart -- see
    // effectiveMaxCommits' own comment above for why): null when not given, otherwise whatever
    // was requested (a number, or the string 'unbounded'), the same shape
    // history_granularity_override/project_lifecycle_override already follow. An analysis run
    // over hundreds of commits is not comparable to one over the default 50, and a reader
    // comparing two reports must be able to tell that an override -- not just a larger repo --
    // is why the count differs.
    max_commits_override: options.maxCommits ?? null,
    // Project lifecycle (code-quality-metrics-31w): see the rootCommitShas/includesRepositoryRoot
    // comments above. project_lifecycle is the effective value (project_lifecycle_override when
    // one is given, the structural detection otherwise); project_lifecycle_detected is always the
    // raw structural result regardless of any override -- the same shape history_granularity /
    // history_granularity_detected / history_granularity_override already follow
    // (code-quality-metrics-zkhq, GitHub #71 part 1), so the detected value stays visible
    // alongside the override rather than being replaced by it.
    project_lifecycle,
    project_lifecycle_detected: detectedLifecycle,
    project_lifecycle_override,
    project_lifecycle_signals: {
      window_includes_repository_root: includesRepositoryRoot,
      repository_root_commit_count: rootCommitShas.length,
      // True when `git rev-list --max-parents=0 --all` itself failed rather than
      // succeeding with no roots -- see project_lifecycle's own comment above.
      root_commit_detection_failed: rootCommitDetectionFailed,
      // True when the scaffold forward-walk query itself failed (GitHub #89) rather than
      // genuinely finding no later production-bearing commit -- see findEffectiveRootSha's own
      // comment for the mechanism.
      effective_root_detection_failed: effectiveRootDetectionFailed,
      // True when at least one raw root commit introduced zero production files and was
      // replaced by a later effective root (code-quality-metrics-fex3, GitHub #71 part 2) --
      // see findEffectiveRootSha's own comment for the mechanism and its caveats.
      scaffold_root_detected: scaffoldRootDetected
    },
    config_sources,
    analysis_exclusions,
    suspect_test_paths: suspectTestPaths,
    vendored_generated_share,
    branches_analyzed: branchesToAnalyze,
    branch_commit_counts: branchCommitCounts,
    analyzed_branch_commit_counts,
    branches_with_analyzed_commits,
    large_commits_pct,
    sprawling_commits_pct,
    test_coverage_rate,
    test_isolation_rate,
    uncovered_prod_rate,
    // Built from the counted (exclusion-aware) fields, matching lineSizes/fileCounts above
    // (GitHub #90) -- see their own comment for why.
    avg_files_changed: metrics.length > 0 ? (metrics.reduce((sum, m) => sum + m.counted_files_changed, 0) / metrics.length).toFixed(2) : "0.00",
    avg_lines_changed: metrics.length > 0 ? (metrics.reduce((sum, m) => sum + m.counted_additions + m.counted_deletions, 0) / metrics.length).toFixed(2) : "0.00",
    p50_lines_changed: lineStats.p50,
    p90_lines_changed: lineStats.p90,
    p95_lines_changed: lineStats.p95,
    stddev_lines_changed: lineStats.stddev,
    p50_files_changed: fileStats.p50,
    p90_files_changed: fileStats.p90,
    commit_size_trend: lineStats.trend,
    velocity_commits_per_day: velocity.commits_per_day,
    velocity_trend: velocity.trend,
    net_additions_ratio_median: ratioStats.p50,
    net_additions_ratio_p90: ratioStats.p90,
    message_quality_pct,
    // Suppressed entirely (the key is omitted from the written JSON -- JSON.stringify drops an
    // undefined value) rather than shown without a verdict, since the archetype is a composite
    // of the commit-unit metrics withheld above (code-quality-metrics-bnq requirement #5).
    // project_lifecycle === 'initial-build' withholds that same pair (large_commits_pct,
    // sprawling_commits_pct -- lib/report.js's WITHHELD_WHEN_GREENFIELD_KEYS) for an identical
    // reason, so the same suppression applies here: a JSON consumer must not read a confident
    // archetype string built from inputs this same report declares inapplicable to an initial
    // build (code-quality-metrics-m7kt).
    dora_archetype: (historyGranularity === 'squashed' || project_lifecycle === 'initial-build')
      ? undefined
      : classifyDoraArchetype({ large_commits_pct, sprawling_commits_pct, test_coverage_rate, uncovered_prod_rate, message_quality_pct }),
    // Deployment frequency floor (GitHub #65): null when no releaseTagPattern or
    // releaseCommitSubjectPattern is configured in .codemetrics.json. A floor, not a count:
    // deleted tags and unrecognized conventions are invisible to this detector.
    deployment_frequency_floor,
    // Commit shipment visibility (GitHub #107): how many analyzed commits are confirmed
    // shipped vs. unconfirmed. Squash-merged commits appear unconfirmed even when shipped
    // because they are not direct ancestors of the default branch; unconfirmed_commits_count
    // is therefore a lower bound on unshipped work, not an exact count.
    default_branch,
    shipped_commits_count,
    unconfirmed_commits_count,
    config: CONFIG,
    note: "Local feature branches analysis - shows actual development patterns before merge squashing"
  };

  // Generate insights
  const { insights, warnings, recommendations } = generateInsights(summary, metrics);

  // Save results (code-quality-metrics-w3wn): written into a .codemetrics/ directory inside
  // the analyzed repository, not its root. Measured across the six repositories this toolkit
  // evaluates, writing local_*.json/local_*.html directly into the target's root left 235
  // untracked files behind, none of them protected by that repository's own .gitignore --
  // every one was one `git add .` away from being committed into a client repo, and two of the
  // six are client repositories whose JSON carries author names, commit messages,
  // prod_file_paths and model prose. `.codemetrics/` pairs with the existing per-repo
  // `.codemetrics.json` config file (same prefix, one convention rather than two) and is
  // hidden by default in a repository someone else opens. Deliberate near-collision: a tracked
  // `.codemetrics.json` file and an ignored `.codemetrics/` directory can coexist in the same
  // repository without conflict, since one is a file and the other a directory.
  //
  // --output-dir (options.outputDir) overrides this default entirely, mirroring --max-commits'
  // own reasoning (see CLAUDE.md's "Analysis Window" section): where a run writes its output is
  // a property of the run, not a fact about the repository, so this has no .codemetrics.json
  // key -- CLI-only.
  //
  // Created when absent, left alone when already present (an existing directory is not
  // recreated or emptied -- prior local_*.json/html here are simply overwritten by the writes
  // below, the same overwrite-in-place behavior this tool has always had at its old root-level
  // location).
  const outputDir = options.outputDir ?? path.join(process.cwd(), '.codemetrics');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const metricsFile = path.join(outputDir, 'local_commit_metrics.json');
  const summaryFile = path.join(outputDir, 'local_metrics_summary.json');

  fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  if (claudeResults.length > 0) {
    const claudeOutput = {
      analyzed_at: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      commits_analyzed: claudeResults.filter(r => !r.error).length,
      results: claudeResults
    };
    fs.writeFileSync(
      path.join(outputDir, 'local_claude_analysis.json'),
      JSON.stringify(claudeOutput, null, 2)
    );
  }

  if (prodFilePaths.length > 0) {
    const duplicateOutput = {
      analyzed_at: new Date().toISOString(),
      files_scanned: prodFilePaths.length,
      static_duplicates: staticDuplicates,
      semantic_findings: semanticFindings,
      statistics: duplicateStatistics,
      // code-quality-metrics-tjn: unsupportedExtensions is only present when
      // runDuplicateAnalysis has determined jscpd recognizes none of the scanned files'
      // languages (verified live against remote_retro, Elixir) -- distinct from a genuine
      // zero, which carries a real statistics object instead. Layer 1 attempted to run but
      // produced no usable measurement in that case, so layers_run.static reports
      // 'unmeasured' rather than a confident true, the same tri-state convention
      // layers_run.semantic already uses for its own failed/truncated case.
      ...(unsupportedExtensions ? { unsupported_extensions: unsupportedExtensions } : {}),
      layers_run: { static: unsupportedExtensions ? 'unmeasured' : true, semantic: semanticLayerStatus }
    };
    fs.writeFileSync(
      path.join(outputDir, 'local_duplicate_analysis.json'),
      JSON.stringify(duplicateOutput, null, 2)
    );
  }

  // Display results
  console.log('=== 📊 ANALYSIS RESULTS ===');
  console.log('');
  console.log(`📈 Total commits analyzed: ${summary.total_commits}`);
  if (summary.bot_commits_count > 0) {
    console.log(`🤖 Dependency/CI bot commits excluded: ${summary.bot_commits_count} (${summary.bot_commits_pct}% of ${summary.filtered_from} found)`);
  }
  console.log(`📏 Large commits (>${CONFIG.LARGE_COMMIT_THRESHOLD} lines): ${summary.large_commits_pct}%`);
  console.log(`📁 Sprawling commits (>${CONFIG.SPRAWLING_COMMIT_THRESHOLD} files): ${summary.sprawling_commits_pct}%`);
  console.log(`🧪 Test coverage (test+prod): ${summary.test_coverage_rate}%`);
  console.log(`🧪 Test isolation (test-only): ${summary.test_isolation_rate}%`);
  console.log(`🚨 Uncovered prod (large, no tests): ${summary.uncovered_prod_rate}%`);
  console.log(`📂 Average files changed: ${summary.avg_files_changed}`);
  console.log(`📝 Average lines changed: ${summary.avg_lines_changed}`);
  console.log('');

  if (insights.length > 0) {
    console.log('=== ✅ POSITIVE FINDINGS ===');
    insights.forEach(insight => console.log(insight));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('=== ⚠️ CONCERNS DETECTED ===');
    warnings.forEach(warning => console.log(warning));
    console.log('');
  }

  if (recommendations.length > 0) {
    console.log('=== 💡 RECOMMENDATIONS ===');
    recommendations.forEach(rec => console.log(`• ${rec}`));
    console.log('');
  }

  const claudeAnnotated = metrics.filter(m => m.ai_confidence !== undefined);
  if (claudeAnnotated.length > 0) {
    console.log('=== 🤖 CLAUDE AI ANALYSIS ===');
    claudeAnnotated.forEach(m => {
      console.log(`${m.sha}: confidence=${m.ai_confidence}% risk=${m.risk_score}%`);
      if (m.patterns && m.patterns.length) console.log(`  Patterns: ${m.patterns.join(', ')}`);
      if (m.architectural_concerns && m.architectural_concerns.length) console.log(`  Architecture: ${m.architectural_concerns.join(', ')}`);
      if (m.claude_summary) console.log(`  ${m.claude_summary}`);
    });
    console.log('');
  }

  // Show sample commits
  if (metrics.length > 0) {
    console.log('=== 📋 SAMPLE COMMITS ===');
    const sampleSize = Math.min(10, metrics.length);
    const samples = metrics.slice(0, sampleSize);

    samples.forEach(commit => {
      const lines = commit.total_additions + commit.total_deletions;
      const flags = [];
      if (commit.large_commit) flags.push('LARGE');
      if (commit.sprawling_commit) flags.push('SPRAWLING');
      if (commit.test_prod_cochange_commit) flags.push('TEST+PROD');

      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
      console.log(`${commit.sha}: ${commit.message.substring(0, 60)}... (${lines} lines, ${commit.files_changed} files)${flagStr} [${commit.source_branch}]`);
    });

    if (metrics.length > sampleSize) {
      console.log(`... and ${metrics.length - sampleSize} more commits`);
    }
    console.log('');
  }

  // Output file information
  console.log('=== 💾 OUTPUT FILES ===');
  console.log(`📄 Detailed metrics: ${metricsFile}`);
  console.log(`📊 Summary statistics: ${summaryFile}`);
  console.log('');
  console.log('=== 🎯 NEXT STEPS ===');
  console.log('• Review the detailed metrics files for specific commits of concern');
  console.log('• Set up the GitHub Actions workflow for ongoing monitoring');
  console.log('• Consider implementing PR size limits to prevent future drift');
  console.log('• Share results with your team to discuss AI tool usage patterns');
  console.log('');
  console.log('📚 Learn more: https://github.com/yourrepo/your-article');
}

module.exports = {
  collectLocalMetrics,
  parseCliArgs,
  resolveHistoryGranularityForWithholding,
  CONFIG,
  // git
  runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff, getExpectedCommitCount,
  // statistics
  computeStatistics, computeVelocity,
  // metrics
  scoreMessageQuality, classifyDoraArchetype, generateInsights,
  // claude
  CLAUDE_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude
};


// Script execution, placed after all definitions and module.exports so all
// required lib modules are fully initialized before collectLocalMetrics() runs.
if (require.main === module) {
  /** @type {{ days?: number, since?: string, history?: 'granular'|'squashed', lifecycle?: 'initial-build'|'established', config?: string, maxCommits?: number|'unbounded', outputDir?: string }} */
  let cliOptions;
  try {
    cliOptions = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    // Argument errors are the user's typo, not an analysis failure, so report
    // them as such and show the accepted forms rather than a stack trace.
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    console.error('Usage: node local-code-metrics.js [--days <n>] [--since <YYYY-MM-DD>] [--history granular|squashed] [--lifecycle initial-build|established] [--config <path>] [--max-commits <n>|unbounded] [--output-dir <path>]');
    process.exit(1);
  }

  collectLocalMetrics(cliOptions).catch(error => {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  });
}
