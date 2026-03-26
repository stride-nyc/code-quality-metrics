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
 * @typedef {{ total_additions: number, total_deletions: number, files_changed: number, binary_files: number, test_files_count: number, prod_files_count: number, test_first_indicator: boolean, large_commit: boolean, sprawling_commit: boolean, outlier: boolean, source_branch: string, change_ratio: string, ai_confidence?: number, risk_score?: number, patterns?: string[], architectural_concerns?: string[], claude_summary?: string }} CommitStats
 * @typedef {CommitInfo & CommitStats & { commit_type: string }} CommitMetric
 */

// Configuration - Adjust these for your project
const CONFIG = {
  ANALYSIS_DAYS: 30,
  MAX_COMMITS: 50,
  LARGE_COMMIT_THRESHOLD: 100,
  SPRAWLING_COMMIT_THRESHOLD: 5,
  MESSAGE_QUALITY_MIN_WORDS: 10,
  AI_ANALYSIS_MAX_COMMITS: 5,
  AI_DIFF_MAX_CHARS: 4000,
  AI_RISK_ADDITIONS_RATIO: 3,
  
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
      outlier: false,
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
    dora_archetype: classifyDoraArchetype({
      large_commits_pct: metrics.length > 0 ? ((metrics.filter(m => m.large_commit).length / metrics.length) * 100).toFixed(2) : '0.00',
      sprawling_commits_pct: metrics.length > 0 ? ((metrics.filter(m => m.sprawling_commit).length / metrics.length) * 100).toFixed(2) : '0.00',
      test_first_pct: metrics.length > 0 ? ((metrics.filter(m => m.test_first_indicator).length / metrics.length) * 100).toFixed(2) : '0.00',
      message_quality_pct
    }),
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

/**
 * Classify a repo into a DORA team archetype based on summary metrics.
 * Evaluated in priority order: harmonious-high-achiever → legacy-bottleneck → foundational-challenges → mixed-signals
 * @param {{ large_commits_pct: string, sprawling_commits_pct: string, test_first_pct: string, message_quality_pct: string }} summary
 * @returns {string}
 */
function classifyDoraArchetype(summary) {
  const large = parseFloat(summary.large_commits_pct);
  const sprawling = parseFloat(summary.sprawling_commits_pct);
  const testFirst = parseFloat(summary.test_first_pct);
  const msgQuality = parseFloat(summary.message_quality_pct);

  if (large < 20 && sprawling < 10 && testFirst > 50 && msgQuality > 60) return 'harmonious-high-achiever';
  if (sprawling > 25 && large > 30) return 'legacy-bottleneck';
  if (large > 40 || (testFirst < 30 && large > 20)) return 'foundational-challenges';
  return 'mixed-signals';
}

/** @type {RegExp} */
const CONVENTIONAL_COMMIT_RE = /^(feat|fix|refactor|test|chore|docs|perf|ci|build|revert)(\(.+\))?:/i;

/**
 * Score a single commit message for quality.
 * Quality = conventional commit format OR word count >= MESSAGE_QUALITY_MIN_WORDS.
 * @param {string} message
 * @returns {boolean}
 */
function scoreMessageQuality(message) {
  if (!message) return false;
  if (CONVENTIONAL_COMMIT_RE.test(message)) return true;
  return message.split(/\s+/).filter(Boolean).length >= CONFIG.MESSAGE_QUALITY_MIN_WORDS;
}

/**
 * Compute commit velocity and trend from an array of ISO 8601 date strings.
 * Dates must be time-ordered (oldest first).
 * @param {string[]} dates
 * @returns {{ commits_per_day: number, trend: string }}
 */
function computeVelocity(dates) {
  if (dates.length < 2) return { commits_per_day: dates.length, trend: 'stable' };

  const ms = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const spanDays = (ms[ms.length - 1] - ms[0]) / 86400000 || 1;
  const commits_per_day = dates.length / spanDays;

  // Split commits at time midpoint; compare first-half vs second-half rate
  const midMs = (ms[0] + ms[ms.length - 1]) / 2;
  const firstHalf = ms.filter(t => t <= midMs);
  const secondHalf = ms.filter(t => t > midMs);
  const halfSpan = spanDays / 2 || 1;
  const firstRate = firstHalf.length / halfSpan;
  const secondRate = secondHalf.length / halfSpan;

  let trend = 'stable';
  if (secondRate > firstRate * 1.25) trend = 'accelerating';
  else if (secondRate < firstRate * 0.75) trend = 'decelerating';

  return { commits_per_day, trend };
}

/**
 * Compute statistical distribution of a numeric array.
 * sizes and timestamps must be same length and time-ordered (oldest first).
 * @param {number[]} sizes
 * @param {number[]} timestamps - epoch ms values
 * @returns {{ p50: number, p90: number, p95: number, mean: number, stddev: number, trend: string, isOutlier: (v: number) => boolean }}
 */
function computeStatistics(sizes, timestamps) {
  if (sizes.length === 0) {
    return { p50: 0, p90: 0, p95: 0, mean: 0, stddev: 0, trend: 'stable', isOutlier: () => false };
  }

  // Percentile (linear interpolation)
  const sorted = [...sizes].sort((a, b) => a - b);
  /** @param {number} p - 0..1 */
  function quantile(p) {
    if (sorted.length === 1) return sorted[0];
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  const mean = sizes.reduce((s, v) => s + v, 0) / sizes.length;
  const variance = sizes.reduce((s, v) => s + (v - mean) ** 2, 0) / sizes.length;
  const stddev = Math.sqrt(variance);

  // Trend: linear regression slope of size over time index
  const n = sizes.length;
  let trend = 'stable';
  if (n >= 2) {
    // Normalize timestamps to [0..1] to avoid floating-point magnitude issues
    const t0 = timestamps[0];
    const tRange = (timestamps[n - 1] - t0) || 1;
    const xs = timestamps.map(t => (t - t0) / tRange);
    const xMean = xs.reduce((s, v) => s + v, 0) / n;
    const yMean = mean;
    const num = xs.reduce((s, x, i) => s + (x - xMean) * (sizes[i] - yMean), 0);
    const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
    const slope = den === 0 ? 0 : num / den;
    // Threshold: slope relative to mean — ignore noise below 5% of mean per unit
    const threshold = yMean * 0.05;
    if (slope > threshold) trend = 'growing';
    else if (slope < -threshold) trend = 'shrinking';
  }

  const cutoff = mean + 2 * stddev;
  return {
    p50: quantile(0.5),
    p90: quantile(0.9),
    p95: quantile(0.95),
    mean,
    stddev,
    trend,
    isOutlier: (v) => stddev > 0 && v > cutoff
  };
}

// ---------------------------------------------------------------------------
// Claude API integration (optional — requires ANTHROPIC_API_KEY)
// ---------------------------------------------------------------------------

/**
 * Fetch the stat summary and full diff for a single commit SHA.
 * Returns a combined string truncated to AI_DIFF_MAX_CHARS.
 * @param {string} sha
 * @returns {string}
 */
function getCommitDiff(sha) {
  const stat = runGitCommand(`git show --stat --format="" ${sha}`);
  const diff = runGitCommand(`git show --format="" ${sha}`);
  const combined = `--- File Summary ---\n${stat}\n\n--- Diff ---\n${diff}`;
  return combined.substring(0, CONFIG.AI_DIFF_MAX_CHARS);
}

/**
 * Pre-filter metrics to commits worth sending to Claude.
 * Selects large commits with high additions ratio, sorted by total churn descending,
 * capped at AI_ANALYSIS_MAX_COMMITS.
 * @param {CommitMetric[]} metrics
 * @returns {CommitMetric[]}
 */
function selectClaudeCommits(metrics) {
  return metrics
    .filter(m => m.large_commit && m.total_additions > m.total_deletions * CONFIG.AI_RISK_ADDITIONS_RATIO)
    .sort((a, b) => (b.total_additions + b.total_deletions) - (a.total_additions + a.total_deletions))
    .slice(0, CONFIG.AI_ANALYSIS_MAX_COMMITS);
}

const CLAUDE_SYSTEM_PROMPT = `You are a code quality analyst specializing in detecting AI-generated code patterns and architectural concerns. Analyze the provided git commit diff and return a JSON assessment.

Detect these AI-generated code patterns:
- Generic variable names (data, result, item, temp, obj, val, arr, str) without domain context
- Boilerplate CRUD operations without error handling or domain-specific validation
- Identically or near-identically structured adjacent functions differing only in variable names
- Absent domain language — uses generic technical terms instead of business/domain vocabulary
- Import patterns inconsistent with the rest of the file
- Missing edge case handling (no null checks, no boundary conditions, no error paths)

Detect these architectural concerns:
- Code crossing service/module/layer boundaries based on import paths
- New dependencies on modules not previously used in this area of the codebase
- Structural patterns inconsistent with the surrounding code's style

Respond ONLY with valid JSON in this exact schema, no other text:
{
  "ai_confidence": <integer 0-100>,
  "risk_score": <integer 0-100>,
  "patterns": ["string", ...],
  "architectural_concerns": ["string", ...],
  "summary": "<one to three sentence plain-English summary>"
}

ai_confidence: likelihood this code was AI-generated without careful human review (0=clearly human-authored, 100=clearly AI-generated)
risk_score: overall code quality risk for this commit considering size, patterns, and architectural issues`;

/**
 * Analyze a list of commits with the Claude API, returning structured results.
 * Calls are sequential to avoid rate limits. Errors per-commit are captured, not thrown.
 * @param {any} client - Anthropic client instance
 * @param {CommitMetric[]} commits
 * @returns {Promise<Array<{sha: string, [key: string]: any}>>}
 */
async function analyzeWithClaude(client, commits) {
  const results = [];

  for (const commit of commits) {
    const diff = getCommitDiff(commit.full_sha);
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Commit: ${commit.sha}\nMessage: ${commit.message}\nAuthor: ${commit.author}\nDate: ${commit.date}\nBranch: ${commit.source_branch}\n\n${diff}`
        }]
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '';
      const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(json);
      results.push({ sha: commit.sha, ...parsed });
    } catch (err) {
      console.warn(`  ⚠️  Claude analysis failed for ${commit.sha}: ${err.message}`);
      results.push({ sha: commit.sha, error: err.message });
    }
  }

  return results;
}

/**
 * Returns an Anthropic client if ANTHROPIC_API_KEY is set and the SDK is available.
 * Returns null otherwise — callers must check before using.
 * @returns {Promise<object|null>}
 */
async function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    // @ts-ignore — optional peer dependency; not installed when API key absent
    const { Anthropic } = require('@anthropic-ai/sdk');
    return new Anthropic();
  } catch {
    console.warn('⚠️  Claude analysis unavailable: @anthropic-ai/sdk not installed or requires Node 18+');
    return null;
  }
}

module.exports = { collectLocalMetrics, parseGitLog, isTestFile, analyzeCommit, generateInsights, CONFIG, computeStatistics, computeVelocity, scoreMessageQuality, classifyDoraArchetype, getAnthropicClient, selectClaudeCommits, getCommitDiff, analyzeWithClaude, CLAUDE_SYSTEM_PROMPT };

// Script execution — placed after all definitions so CONVENTIONAL_COMMIT_RE and
// other helpers are fully initialized before collectLocalMetrics() runs synchronously.
if (require.main === module) {
  collectLocalMetrics().catch(error => {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  });
}