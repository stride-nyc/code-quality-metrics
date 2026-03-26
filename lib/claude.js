// @ts-nocheck
'use strict';

const { CONFIG } = require('./config');
const { getCommitDiff } = require('./git');

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

/**
 * Pre-filter metrics to commits worth sending to Claude.
 * Selects large commits with high additions ratio, sorted by total churn descending,
 * capped at AI_ANALYSIS_MAX_COMMITS.
 * @param {Array<object>} metrics
 * @returns {Array<object>}
 */
function selectClaudeCommits(metrics) {
  return metrics
    .filter(m => m.large_commit && m.total_additions > m.total_deletions * CONFIG.AI_RISK_ADDITIONS_RATIO)
    .sort((a, b) => (b.total_additions + b.total_deletions) - (a.total_additions + a.total_deletions))
    .slice(0, CONFIG.AI_ANALYSIS_MAX_COMMITS);
}

/**
 * Analyze a list of commits with the Claude API, returning structured results.
 * Calls are sequential to avoid rate limits. Errors per-commit are captured, not thrown.
 * @param {object} client - Anthropic client instance
 * @param {Array<object>} commits
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

module.exports = { CLAUDE_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude };
