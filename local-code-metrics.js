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
 * Usage: node local-ai-drift-analysis.js [options]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * @typedef {{ sha: string, full_sha: string, date: string, author: string, message: string, source_branch?: string }} CommitInfo
 * @typedef {{ total_additions: number, total_deletions: number, files_changed: number, binary_files: number, test_files_count: number, prod_files_count: number, test_first_indicator: boolean, large_commit: boolean, sprawling_commit: boolean, source_branch: string, change_ratio: string }} CommitStats
 * @typedef {CommitInfo & CommitStats & { commit_type: string }} CommitMetric
 */

// Configuration - Adjust these for your project
const CONFIG = {
  ANALYSIS_DAYS: 30,
  MAX_COMMITS: 50,
  LARGE_COMMIT_THRESHOLD: 100,
  SPRAWLING_COMMIT_THRESHOLD: 5,
  
  // Test file patterns - customize for your language/framework
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

/**
 * Execute Git command with error handling
 * @param {string} command
 * @returns {string}
 */
function runGitCommand(command) {
  try {
    const result = execSync(command, { encoding: 'utf8' }).trim();
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error running Git command: ${command}`);
    console.error(`Error: ${msg}`);
    return '';
  }
}

/**
 * Parse Git log output into structured commit data
 * @param {string} logOutput
 * @returns {CommitInfo[]}
 */
function parseGitLog(logOutput) {
  if (!logOutput) return [];

  /** @type {CommitInfo[]} */
  const commits = [];
  const lines = logOutput.split('\n').filter(/** @param {string} line */ line => line.trim());
  
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 4) continue;
    
    const [sha, date, author, ...messageParts] = parts;
    if (sha && sha.length === 40) {
      commits.push({
        sha: sha.substring(0, 8),
        full_sha: sha,
        date,
        author,
        message: messageParts.join('|')
      });
    }
  }
  return commits;
}

/**
 * Check if a filename matches test file patterns
 * @param {string} filename
 * @returns {boolean}
 */
function isTestFile(filename) {
  return CONFIG.TEST_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Analyze a single commit for AI drift indicators
 * @param {string} sha
 * @param {string} branch
 * @returns {CommitStats|null}
 */
function analyzeCommit(sha, branch) {
  try {
    // Get detailed commit statistics
    const statsOutput = runGitCommand(`git show --numstat --format="" ${sha}`);
    if (!statsOutput) {
      console.warn(`  Warning: No stats found for commit ${sha}`);
      return null;
    }
    
    const statsLines = statsOutput.split('\n').filter(line => line.trim());
    
    let totalAdditions = 0;
    let totalDeletions = 0;
    let filesChanged = 0;
    let testFiles = 0;
    let prodFiles = 0;
    let binaryFiles = 0;
    
    for (const line of statsLines) {
      const [additions, deletions, filename] = line.split('\t');
      if (!filename) continue;
      
      filesChanged++;
      
      // Handle binary files (marked with '-' in git numstat)
      if (additions === '-' && deletions === '-') {
        binaryFiles++;
        continue;
      }
      
      const addNum = parseInt(additions) || 0;
      const delNum = parseInt(deletions) || 0;
      
      totalAdditions += addNum;
      totalDeletions += delNum;
      
      if (isTestFile(filename)) {
        testFiles++;
      } else {
        prodFiles++;
      }
    }
    
    const totalLines = totalAdditions + totalDeletions;
    
    return {
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      files_changed: filesChanged,
      binary_files: binaryFiles,
      test_files_count: testFiles,
      prod_files_count: prodFiles,
      test_first_indicator: testFiles > 0 && prodFiles > 0,
      large_commit: totalLines > CONFIG.LARGE_COMMIT_THRESHOLD,
      sprawling_commit: filesChanged > CONFIG.SPRAWLING_COMMIT_THRESHOLD,
      source_branch: branch,
      change_ratio: totalDeletions > 0 ? (totalAdditions / totalDeletions).toFixed(2) : 'inf'
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  Error analyzing commit ${sha}: ${msg}`);
    return null;
  }
}

/**
 * Generate insights based on metrics
 * @param {{ large_commits_pct: string, sprawling_commits_pct: string, test_first_pct: string, avg_lines_changed: string }} summary
 * @param {CommitMetric[]} metrics
 * @returns {{ insights: string[], warnings: string[], recommendations: string[] }}
 */
function generateInsights(summary, metrics) {
  const insights = [];
  const warnings = [];
  const recommendations = [];
  
  // Analyze patterns
  const largePct = parseFloat(summary.large_commits_pct);
  const sprawlingPct = parseFloat(summary.sprawling_commits_pct);
  const testFirstPct = parseFloat(summary.test_first_pct);
  const avgLines = parseFloat(summary.avg_lines_changed);
  
  // Large commit analysis
  if (largePct > 40) {
    warnings.push(`🚨 Very high large commit rate (${largePct}%) - Strong AI drift indicators`);
    recommendations.push('Consider breaking AI-generated code into smaller, focused commits');
  } else if (largePct > 20) {
    warnings.push(`⚠️ High large commit rate (${largePct}%) - Monitor AI tool usage patterns`);
  } else {
    insights.push(`✅ Healthy large commit rate (${largePct}%)`);
  }
  
  // Sprawling commit analysis
  if (sprawlingPct > 25) {
    warnings.push(`🚨 Very high sprawling commit rate (${sprawlingPct}%) - Possible shotgun surgery`);
    recommendations.push('Review if AI suggestions are causing scattered changes across unrelated files');
  } else if (sprawlingPct > 10) {
    warnings.push(`⚠️ High sprawling commit rate (${sprawlingPct}%) - Watch for scope creep`);
  } else {
    insights.push(`✅ Good sprawling commit control (${sprawlingPct}%)`);
  }
  
  // Test discipline analysis
  if (testFirstPct > 50) {
    insights.push(`✅ Strong test-first discipline (${testFirstPct}%)`);
  } else if (testFirstPct < 30) {
    warnings.push(`⚠️ Low test-first discipline (${testFirstPct}%) - AI tools may be bypassing TDD`);
    recommendations.push('Ensure test coverage when accepting AI-generated code');
  }
  
  // Average lines analysis
  if (avgLines > 1000) {
    warnings.push(`🚨 Very high average lines per commit (${avgLines}) - Extreme batch coding`);
    recommendations.push('Implement strict commit size limits when using AI tools');
  } else if (avgLines > 500) {
    warnings.push(`⚠️ High average lines per commit (${avgLines}) - Monitor AI batch acceptance`);
  }
  
  // AI pattern detection
  const possibleAICommits = metrics.filter(m => 
    m.large_commit && m.total_additions > m.total_deletions * 3
  ).length;
  
  if (possibleAICommits > metrics.length * 0.3) {
    warnings.push(`🤖 High proportion of addition-heavy large commits (${possibleAICommits}/${metrics.length}) - Possible AI batch acceptance`);
  }
  
  return { insights, warnings, recommendations };
}

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
      metrics.push({
        ...commit,
        ...analysis,
        commit_type: 'feature_branch'
      });
    }
  }
  
  console.log('\n');
  
  // Generate summary statistics
  const summary = {
    analysis_date: new Date().toISOString(),
    analysis_period_days: CONFIG.ANALYSIS_DAYS,
    total_commits: metrics.length,
    filtered_from: uniqueCommits.length,
    branches_analyzed: allBranches,
    branch_commit_counts: branchCommitCounts,
    large_commits_pct: metrics.length > 0 ? ((metrics.filter(m => m.large_commit).length / metrics.length) * 100).toFixed(2) : "0.00",
    sprawling_commits_pct: metrics.length > 0 ? ((metrics.filter(m => m.sprawling_commit).length / metrics.length) * 100).toFixed(2) : "0.00",
    test_first_pct: metrics.length > 0 ? ((metrics.filter(m => m.test_first_indicator).length / metrics.length) * 100).toFixed(2) : "0.00",
    avg_files_changed: metrics.length > 0 ? (metrics.reduce((sum, m) => sum + m.files_changed, 0) / metrics.length).toFixed(2) : "0.00",
    avg_lines_changed: metrics.length > 0 ? (metrics.reduce((sum, m) => sum + m.total_additions + m.total_deletions, 0) / metrics.length).toFixed(2) : "0.00",
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
  
  // Display insights
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

// Script execution
if (require.main === module) {
  collectLocalMetrics().catch(error => {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  });
}

module.exports = { collectLocalMetrics, parseGitLog, isTestFile, analyzeCommit, generateInsights, CONFIG };