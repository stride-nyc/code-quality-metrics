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

// Load .env file if present — allows ANTHROPIC_API_KEY to be set without exporting to the shell
require('dotenv').config({ quiet: true });

const { CONFIG } = require('./lib/config');
const { runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff } = require('./lib/git');
const { computeStatistics, computeVelocity } = require('./lib/statistics');
const { scoreMessageQuality, classifyDoraArchetype, generateInsights } = require('./lib/metrics');
const { CLAUDE_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude, analyzeDuplicatesWithClaude } = require('./lib/claude');
const { runDuplicateCheck, resolveModuleNeighbors } = require('./lib/duplicate');

/**
 * @typedef {{ sha: string, full_sha: string, date: string, author: string, message: string, source_branch?: string }} CommitInfo
 * @typedef {{ total_additions: number, total_deletions: number, files_changed: number, binary_files: number, test_files_count: number, prod_files_count: number, prod_file_paths: string[], test_first_indicator: boolean, test_only_commit: boolean, uncovered_prod_commit: boolean, large_commit: boolean, sprawling_commit: boolean, outlier: boolean, source_branch: string, change_ratio: string, ai_confidence?: number, risk_score?: number, patterns?: string[], architectural_concerns?: string[], claude_summary?: string }} CommitStats
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
 * Main analysis function
 * @param {{ days?: number, since?: string }} [options] CLI window override: since (an explicit
 *   YYYY-MM-DD boundary) takes precedence over days (a count replacing CONFIG.ANALYSIS_DAYS).
 */
async function collectLocalMetrics(options = {}) {
  const analysisDays = options.days ?? CONFIG.ANALYSIS_DAYS;

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
  console.log(`📅 Analysis period: Last ${analysisDays} days`);
  console.log('');

  // Get all local and remote branches except main/master
  const branchesOutput = runGitCommand('git branch -a');
  if (!branchesOutput) {
    console.error('❌ Unable to list Git branches');
    process.exit(1);
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

  // Calculate date range. An explicit --since date takes precedence over the
  // day-count window; otherwise derive the boundary from analysisDays.
  let sinceStr;
  if (options.since) {
    sinceStr = options.since;
  } else {
    const since = new Date();
    since.setDate(since.getDate() - analysisDays);
    sinceStr = since.toISOString().split('T')[0];
  }

  console.log(`🔍 Looking for commits since: ${sinceStr}`);
  console.log('');

  // Collect commits from all feature branches
  /** @type {CommitInfo[]} */
  const allCommits = [];
  /** @type {Record<string, number>} */
  const branchCommitCounts = {};

  for (const branch of branchesToAnalyze) {
    process.stdout.write(`📊 Analyzing branch: ${branch}... `);

    try {
      const logOutput = runGitCommand(
        `git log --since="${sinceStr}" --pretty=format:"%H|%ai|%an|%s" ${branch}`
      );

      const branchCommits = parseGitLog(logOutput);
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
    const trunkLog = runGitCommand(
      `git log --since="${sinceStr}" --pretty=format:"%H|%ai|%an|%s" ${fallbackRef}`
    );
    const trunkCommits = parseGitLog(trunkLog);
    trunkCommits.forEach(c => { c.source_branch = fallbackRef; allCommits.push(c); });
    branchCommitCounts[fallbackRef] = trunkCommits.length;
    console.log(`${trunkCommits.length} commits`);
    console.log('');

    uniqueCommits.push(...trunkCommits);
  }

  if (uniqueCommits.length === 0) {
    console.log('⚠️ No commits found in the analysis period.');
    console.log('This could mean:');
    console.log('  • No development activity in the analysis period');
    console.log(`  • Try a wider window: node local-code-metrics.js --days 90`);
    return;
  }

  // Analyze commits in detail
  const commitsToAnalyze = uniqueCommits.slice(0, CONFIG.MAX_COMMITS);
  console.log(`🔬 Analyzing ${commitsToAnalyze.length} commits in detail...`);
  console.log('');

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

  // Statistical distributions
  const lineSizes = metrics.map(m => m.total_additions + m.total_deletions);
  const fileCounts = metrics.map(m => m.files_changed);
  const timestamps = metrics.map(m => new Date(m.date).getTime());
  const lineStats = computeStatistics(lineSizes, timestamps);
  const fileStats = computeStatistics(fileCounts, timestamps);

  // Mark outlier commits in-place
  metrics.forEach(m => {
    m.outlier = lineStats.isOutlier(m.total_additions + m.total_deletions);
  });

  // Velocity
  const dates = metrics.map(m => m.date);
  const velocity = computeVelocity(dates);

  // Net additions ratio distribution: (additions - deletions) / (additions + deletions)
  // Bounded [-1, +1]: 1.0 = entirely net-new code, 0.0 = balanced, negative = net deletion (cleanup)
  // Replaces the unbounded additions / max(deletions, 1) formula, which inflated ratios to ~500
  // for net-new-file commits (zero deletions), distorting both median and p90.
  const ratios = metrics.map(m => {
    const total = m.total_additions + m.total_deletions;
    return total === 0 ? 0 : (m.total_additions - m.total_deletions) / total;
  });
  const ratioStats = computeStatistics(ratios, timestamps);

  // Message quality
  const qualityCount = metrics.filter(m => scoreMessageQuality(m.message)).length;
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
  const staticDuplicates = runDuplicateCheck(prodFilePaths);
  /** @type {any[]} */
  let semanticFindings = [];
  if (anthropicClient && prodFilePaths.length > 0) {
    console.log(`🔁 Running semantic duplicate analysis on ${prodFilePaths.length} production file(s)...`);
    const neighborFiles = resolveModuleNeighbors(prodFilePaths);
    semanticFindings = await analyzeDuplicatesWithClaude(anthropicClient, neighborFiles, staticDuplicates);
  }

  // Pre-compute pct fields once — reused in both summary object and classifyDoraArchetype call
  const large_commits_pct = metrics.length > 0 ? ((metrics.filter(m => m.large_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const sprawling_commits_pct = metrics.length > 0 ? ((metrics.filter(m => m.sprawling_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const test_coverage_rate = metrics.length > 0 ? ((metrics.filter(m => m.test_first_indicator).length / metrics.length) * 100).toFixed(2) : '0.00';
  const test_isolation_rate = metrics.length > 0 ? ((metrics.filter(m => m.test_only_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const uncovered_prod_rate = metrics.length > 0 ? ((metrics.filter(m => m.uncovered_prod_commit).length / metrics.length) * 100).toFixed(2) : '0.00';

  // Generate summary statistics
  const summary = {
    analysis_date: new Date().toISOString(),
    analysis_period_days: analysisDays,
    total_commits: metrics.length,
    filtered_from: uniqueCommits.length,
    workflow_type: workflowType,
    branches_analyzed: branchesToAnalyze,
    branch_commit_counts: branchCommitCounts,
    large_commits_pct,
    sprawling_commits_pct,
    test_coverage_rate,
    test_isolation_rate,
    uncovered_prod_rate,
    avg_files_changed: metrics.length > 0 ? (metrics.reduce((sum, m) => sum + m.files_changed, 0) / metrics.length).toFixed(2) : "0.00",
    avg_lines_changed: metrics.length > 0 ? (metrics.reduce((sum, m) => sum + m.total_additions + m.total_deletions, 0) / metrics.length).toFixed(2) : "0.00",
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
    dora_archetype: classifyDoraArchetype({ large_commits_pct, sprawling_commits_pct, test_coverage_rate, uncovered_prod_rate, message_quality_pct }),
    config: CONFIG,
    note: "Local feature branches analysis - shows actual development patterns before merge squashing"
  };

  // Generate insights
  const { insights, warnings, recommendations } = generateInsights(summary, metrics);

  // Save results
  const outputDir = process.cwd();
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
      layers_run: { static: true, semantic: Boolean(anthropicClient) }
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
      if (commit.test_first_indicator) flags.push('TEST+PROD');

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
  CONFIG,
  // git
  runGitCommand, parseGitLog, isTestFile, analyzeCommit, getCommitDiff,
  // statistics
  computeStatistics, computeVelocity,
  // metrics
  scoreMessageQuality, classifyDoraArchetype, generateInsights,
  // claude
  CLAUDE_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude
};

/**
 * Parse --since <date> / --days <n> CLI flags into a collectLocalMetrics options object.
 * Not unit tested directly (same category as the require.main block below); the
 * behavior it feeds (options.since, options.days) is covered by the CLI window
 * override tests in __tests__/collectLocalMetrics.test.js.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ days?: number, since?: string }}
 */
function parseCliArgs(argv) {
  /** @type {{ days?: number, since?: string }} */
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since' && argv[i + 1]) {
      options.since = argv[i + 1];
      i++;
    } else if (argv[i] === '--days' && argv[i + 1]) {
      options.days = Number(argv[i + 1]);
      i++;
    }
  }
  return options;
}

// Script execution, placed after all definitions and module.exports so all
// required lib modules are fully initialized before collectLocalMetrics() runs.
if (require.main === module) {
  collectLocalMetrics(parseCliArgs(process.argv.slice(2))).catch(error => {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  });
}
