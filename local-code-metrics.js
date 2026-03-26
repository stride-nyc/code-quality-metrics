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
const { CLAUDE_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude } = require('./lib/claude');

/**
 * @typedef {{ sha: string, full_sha: string, date: string, author: string, message: string, source_branch?: string }} CommitInfo
 * @typedef {{ total_additions: number, total_deletions: number, files_changed: number, binary_files: number, test_files_count: number, prod_files_count: number, test_first_indicator: boolean, large_commit: boolean, sprawling_commit: boolean, outlier: boolean, source_branch: string, change_ratio: string, ai_confidence?: number, risk_score?: number, patterns?: string[], architectural_concerns?: string[], claude_summary?: string }} CommitStats
 * @typedef {CommitInfo & CommitStats & { commit_type: string }} CommitMetric
 */

/**
 * Main analysis function
 */
async function collectLocalMetrics() {
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
  console.log(`📅 Analysis period: Last ${CONFIG.ANALYSIS_DAYS} days`);
  console.log('');

  // Get all local branches except main/master
  const branchesOutput = runGitCommand('git branch');
  if (!branchesOutput) {
    console.error('❌ Unable to list Git branches');
    process.exit(1);
  }

  const allBranches = branchesOutput.split('\n')
    .map(line => line.replace(/^\*?\s*/, '').trim())
    .filter(branch => branch && !['main', 'master'].includes(branch.toLowerCase()));

  if (allBranches.length === 0) {
    console.log('⚠️ No feature branches found. Analysis works best with feature branch workflows.');
    console.log('Consider preserving feature branches after merging for better AI drift detection.');
    return;
  }

  console.log(`🌿 Found ${allBranches.length} feature branches:`);
  allBranches.forEach(branch => console.log(`   • ${branch}`));
  console.log('');

  // Calculate date range
  const since = new Date();
  since.setDate(since.getDate() - CONFIG.ANALYSIS_DAYS);
  const sinceStr = since.toISOString().split('T')[0];

  console.log(`🔍 Looking for commits since: ${sinceStr}`);
  console.log('');

  // Collect commits from all feature branches
  /** @type {CommitInfo[]} */
  const allCommits = [];
  /** @type {Record<string, number>} */
  const branchCommitCounts = {};

  for (const branch of allBranches) {
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

  if (uniqueCommits.length === 0) {
    console.log('⚠️ No commits found in feature branches in the last 30 days.');
    console.log('This could mean:');
    console.log('  • All recent work was done directly on main branch');
    console.log('  • Feature branches were deleted after merging');
    console.log('  • No development activity in the analysis period');
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
        commit_type: 'feature_branch'
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

  // Additions ratio distribution
  const ratios = metrics.map(m => m.total_additions / (m.total_deletions || 1));
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

  // Pre-compute pct fields once — reused in both summary object and classifyDoraArchetype call
  const large_commits_pct = metrics.length > 0 ? ((metrics.filter(m => m.large_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const sprawling_commits_pct = metrics.length > 0 ? ((metrics.filter(m => m.sprawling_commit).length / metrics.length) * 100).toFixed(2) : '0.00';
  const test_first_pct = metrics.length > 0 ? ((metrics.filter(m => m.test_first_indicator).length / metrics.length) * 100).toFixed(2) : '0.00';

  // Generate summary statistics
  const summary = {
    analysis_date: new Date().toISOString(),
    analysis_period_days: CONFIG.ANALYSIS_DAYS,
    total_commits: metrics.length,
    filtered_from: uniqueCommits.length,
    branches_analyzed: allBranches,
    branch_commit_counts: branchCommitCounts,
    large_commits_pct,
    sprawling_commits_pct,
    test_first_pct,
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
    additions_ratio_median: ratioStats.p50,
    additions_ratio_p90: ratioStats.p90,
    message_quality_pct,
    dora_archetype: classifyDoraArchetype({ large_commits_pct, sprawling_commits_pct, test_first_pct, message_quality_pct }),
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

  // Display results
  console.log('=== 📊 ANALYSIS RESULTS ===');
  console.log('');
  console.log(`📈 Total commits analyzed: ${summary.total_commits}`);
  console.log(`📏 Large commits (>${CONFIG.LARGE_COMMIT_THRESHOLD} lines): ${summary.large_commits_pct}%`);
  console.log(`📁 Sprawling commits (>${CONFIG.SPRAWLING_COMMIT_THRESHOLD} files): ${summary.sprawling_commits_pct}%`);
  console.log(`🧪 Test-first discipline: ${summary.test_first_pct}%`);
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

// Script execution — placed after all definitions and module.exports so all
// required lib modules are fully initialized before collectLocalMetrics() runs.
if (require.main === module) {
  collectLocalMetrics().catch(error => {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  });
}
