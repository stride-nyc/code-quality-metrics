// @ts-nocheck
'use strict';

const fs = require('fs');
const path = require('path');
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
 * Selects large commits with high additions ratio, sorted by counted churn descending,
 * capped at AI_ANALYSIS_MAX_COMMITS.
 *
 * Both the additions ratio and the ranking are judged on counted_additions/counted_deletions
 * (exclusion-scoped), not total_additions/total_deletions (whole-diff), so a commit that is
 * almost entirely excluded vendored/generated content neither scores as a high-risk AI-drift
 * candidate nor outranks genuine development for the AI_ANALYSIS_MAX_COMMITS budget
 * (code-quality-metrics-ce9m). Measured case (73V, cc7c77aa): 14,679 total changed lines,
 * 14,410 of them excluded terraform, 216 real production lines.
 * @param {Array<object>} metrics
 * @returns {Array<object>}
 */
function selectClaudeCommits(metrics) {
  return metrics
    .filter(m => m.large_commit && m.counted_additions > m.counted_deletions * CONFIG.AI_RISK_ADDITIONS_RATIO)
    .sort((a, b) => (b.counted_additions + b.counted_deletions) - (a.counted_additions + a.counted_deletions))
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

const DUPLICATE_SYSTEM_PROMPT = `You are a code quality analyst specializing in detecting copy-paste and AI-generated duplication. Given a set of files and any static duplicate findings already detected, identify semantically similar functions or logic blocks — even when variable names or formatting differ.

Respond ONLY with valid JSON, no other text: an array of findings, or an empty array if none. Each finding:
{
  "file1": "<relative path>",
  "file2": "<relative path>",
  "similarity": "<one sentence describing what is structurally similar>",
  "concern": "<why this matters, e.g. same error-handling pattern repeated>",
  "confidence": "high" | "medium" | "low"
}`;

/**
 * Analyze a set of files for semantic duplicate patterns using Claude, returning a
 * result object that distinguishes "ran and genuinely found nothing" (status 'ok',
 * findings possibly empty) from "did not produce a usable result" (status
 * 'unmeasured': API error, truncated response, or malformed JSON). Callers must not
 * treat 'unmeasured' as a confident zero.
 *
 * @param {object|null} client - Anthropic client instance
 * @param {string[]} filePaths
 * @param {Array<object>} staticFindings - findings from jscpd (passed as context)
 * @returns {Promise<{status: 'skipped'|'ok'|'unmeasured', findings: Array<object>, error?: string}>}
 */
async function runSemanticDuplicateAnalysis(client, filePaths, staticFindings) {
  if (!client) return { status: 'skipped', findings: [] };

  // Dedupe by resolved identity before bounding (code-quality-metrics-34fu): the same
  // real file can arrive under two different spellings (relative vs. absolute, or one
  // resolved through a different base). resolveModuleNeighbors (lib/duplicate.js)
  // already normalizes its own output, but this function is also called directly by
  // pr-metrics.yml and local-code-metrics.js, so it cannot assume a caller already
  // deduped. Sending the same file twice wastes one of a handful of file slots and
  // guarantees a zero-information "duplicates itself" finding. Deduping before the
  // AI_DUPLICATE_MAX_FILES bound (not after) keeps every slot spent on a distinct file.
  const seenRealPaths = new Set();
  const dedupedPaths = filePaths.filter(p => {
    const key = path.resolve(p);
    if (seenRealPaths.has(key)) return false;
    seenRealPaths.add(key);
    return true;
  });

  // Bound the file set before building the prompt. Unlike the commit path
  // (AI_ANALYSIS_MAX_COMMITS), this had no upper bound: a large file set is both
  // costly and prone to truncating the response mid-JSON (observed on a real
  // repo: 111 files, 74911 input tokens, stop_reason max_tokens).
  const boundedPaths = dedupedPaths.slice(0, CONFIG.AI_DUPLICATE_MAX_FILES);

  const fileSnippets = boundedPaths.map(p => {
    try {
      const content = fs.readFileSync(p, 'utf8');
      return `=== ${p} ===\n${content.substring(0, CONFIG.AI_DIFF_MAX_CHARS)}`;
    } catch {
      return `=== ${p} ===\n(unreadable)`;
    }
  }).join('\n\n');

  const findingsNote = `${staticFindings.length} static finding${staticFindings.length === 1 ? '' : 's'} already detected by jscpd.`;

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: CONFIG.AI_DUPLICATE_MAX_OUTPUT_TOKENS,
      system: DUPLICATE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${findingsNote} Analyze these files for semantic duplication:\n\n${fileSnippets}`
      }]
    });
  } catch (err) {
    console.warn(`  ⚠️  Claude semantic duplicate analysis failed: ${err.message}`);
    return { status: 'unmeasured', findings: [], error: err.message };
  }

  if (response.stop_reason === 'max_tokens') {
    const message = 'response truncated at max_tokens before completing valid JSON';
    console.warn(`  ⚠️  Claude semantic duplicate analysis ${message}`);
    return { status: 'unmeasured', findings: [], error: message };
  }

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    console.warn(`  ⚠️  Claude semantic duplicate analysis failed to parse response: ${err.message}`);
    return { status: 'unmeasured', findings: [], error: err.message };
  }

  return { status: 'ok', findings: Array.isArray(parsed) ? parsed : [] };
}

/**
 * Analyze a set of files for semantic duplicate patterns using Claude. Returns
 * an array of findings, the shape .github/workflows/pr-metrics.yml consumes.
 * Callers that need to tell "ran and found nothing" apart from "the call failed or was
 * truncated" should call runSemanticDuplicateAnalysis directly and read its status.
 * @param {object|null} client - Anthropic client instance
 * @param {string[]} filePaths
 * @param {Array<object>} staticFindings - findings from jscpd (passed as context)
 * @returns {Promise<Array<{file1:string,file2:string,similarity:string,concern:string,confidence:string}>>}
 */
async function analyzeDuplicatesWithClaude(client, filePaths, staticFindings) {
  const result = await runSemanticDuplicateAnalysis(client, filePaths, staticFindings);
  return result.findings;
}

const CFP_SYSTEM_PROMPT = `You are a code analyst estimating COSMIC Function Points from a pull request diff. COSMIC FP counts data movements across a software boundary: Entry (E, data entering from user or external system), Exit (X, data leaving to user or external system), Read (R, data read from persistent storage), Write (W, data written to persistent storage).

Count movements visible in the diff: new or modified function parameters and API request bodies are Entries; return values and API responses are Exits; SELECT/GET/read calls are Reads; INSERT/UPDATE/DELETE/PUT/write calls are Writes.

Ignore test files when counting data movements. Test assertions, test setup, and mock definitions are not data movements across a software boundary. Test files include files with names matching patterns like *.test.js, *.spec.js, *_test.go, test_*.py, *Test.java, or files in directories named test, tests, __tests__, or spec.

This is an approximation from code, not a formal ISO 19761 measurement. Boundary ambiguity is expected.

Respond ONLY with valid JSON, no other text:
{
  "entries": <integer>,
  "exits": <integer>,
  "reads": <integer>,
  "writes": <integer>
}`;

/**
 * Estimate COSMIC Function Points from a PR diff using Claude.
 * Returns { estimated_cfp_delta, estimated_cfp_breakdown } or null on failure/skip.
 * @param {object|null} client - Anthropic client instance
 * @param {Array<{filename:string,additions:number,deletions:number,patch:string}>} files
 * @returns {Promise<{estimated_cfp_delta:number,estimated_cfp_breakdown:{entries:number,exits:number,reads:number,writes:number}}|null>}
 */
async function analyzeCfpWithClaude(client, files) {
  if (!client) return null;

  const diffContent = files.map(f => `=== ${f.filename} (+${f.additions}/-${f.deletions}) ===\n${f.patch || ''}`).join('\n\n');

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: CFP_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: diffContent }]
    });
  } catch (err) {
    console.warn(`  ⚠️  CFP estimation failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    console.warn(`  ⚠️  CFP estimation: failed to parse response: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const { entries = 0, exits = 0, reads = 0, writes = 0 } = parsed;
  return {
    estimated_cfp_delta: entries + exits + reads + writes,
    estimated_cfp_breakdown: { entries, exits, reads, writes }
  };
}

module.exports = { CLAUDE_SYSTEM_PROMPT, DUPLICATE_SYSTEM_PROMPT, CFP_SYSTEM_PROMPT, getAnthropicClient, selectClaudeCommits, analyzeWithClaude, analyzeDuplicatesWithClaude, runSemanticDuplicateAnalysis, analyzeCfpWithClaude };
