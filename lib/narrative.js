// @ts-nocheck
'use strict';

const { fallbackFindings } = require('./report-template');

const NARRATIVE_SYSTEM_PROMPT = `You are writing the Findings section of a code quality drift report for an engineering team. You are given a metric catalog and a list of top commits, both already computed by the report tool. Do not compute, estimate, or restate any number differently than given. Echo every number you reference exactly as given, to the same precision.

Write short connecting prose in three groups:
1. Positive findings: signals that are healthy or improving.
2. Concerns: signals that are in warning or critical status.
3. Recommended actions: concrete next steps tied to the concerns above.

Write full plain English sentences, not the emoji prefixed console style. Only mention metrics present in the given catalog. Never invent a metric, a number, or a trend that is not present in the input.

Respond ONLY with valid JSON in this exact schema, no other text:
{
  "positive_findings": ["sentence", ...],
  "concerns": ["sentence", ...],
  "recommended_actions": ["sentence", ...]
}`;

/**
 * Flatten a parsed narrative response into a single ordered list of labeled
 * bullet strings: positive findings first, then concerns, then recommended
 * actions. Non-array or non-string entries are skipped rather than thrown on,
 * since this is fed by an external API response.
 * @param {object} parsed
 * @returns {string[]}
 */
function flattenNarrative(parsed) {
  const groups = [
    ['Positive', parsed && parsed.positive_findings],
    ['Concern', parsed && parsed.concerns],
    ['Recommended action', parsed && parsed.recommended_actions]
  ];
  const bullets = [];
  for (const [label, items] of groups) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item === 'string' && item.trim()) {
        bullets.push(`${label}: ${item.trim()}`);
      }
    }
  }
  return bullets;
}

/**
 * Generate the Findings section narrative. When no client is available
 * (no ANTHROPIC_API_KEY), returns the same deterministic templated bullets
 * lib/report-template.js falls back to on its own. When a client is given,
 * sends the already-computed catalog and top commits to Claude for
 * connecting prose only; the numbers themselves are never recomputed here.
 * On any API or parse error, falls back to the same deterministic bullets
 * rather than throwing, logging a single line instead of a stack trace.
 * @param {object|null} client - Anthropic client instance, or null
 * @param {Array<object>} catalog - already-computed catalog from buildMetricCatalog
 * @param {Array<object>} topCommits - already-computed top commits
 * @returns {Promise<string[]>}
 */
async function generateFindingsNarrative(client, catalog, topCommits) {
  if (!client) return fallbackFindings(catalog);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: NARRATIVE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Metric catalog (JSON):\n${JSON.stringify(catalog)}\n\nTop commits (JSON):\n${JSON.stringify(topCommits)}`
      }]
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(json);
    const bullets = flattenNarrative(parsed);

    if (bullets.length === 0) {
      throw new Error('narrative response contained no findings');
    }

    return bullets;
  } catch (err) {
    console.log(`ℹ️  Findings narrative unavailable, using templated fallback: ${err.message}`);
    return fallbackFindings(catalog);
  }
}

module.exports = { generateFindingsNarrative, NARRATIVE_SYSTEM_PROMPT };
