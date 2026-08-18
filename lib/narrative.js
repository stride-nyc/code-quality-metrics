// @ts-nocheck
'use strict';

const { fallbackFindings, formatValue } = require('./report-template');
const { METRIC_DESCRIPTIONS } = require('./metric-descriptions');

/**
 * Sent once per payload rather than repeated on every entry: the healthy/
 * critical language a metric carries is a benchmark quantile, not a
 * validated outcome threshold. See CLAUDE.md's Key Metrics table note and
 * calibration/README.md. Giving the model this framing directly, rather
 * than trusting it to infer "healthy" means "at or below the 75th
 * percentile of six reference repositories," is what keeps prose like
 * "well below the healthy boundary" from reading as a validated safety
 * margin it is not.
 */
const BENCHMARK_PROVENANCE_NOTE = 'healthyBoundary/criticalBoundary values are quantiles of a six-repository benchmark (healthy is roughly the 75th percentile, or 25th for a higher-is-better metric; critical is the most extreme corroborated observation), not validated outcome thresholds. An entry with criticalBoundary: null has no critical bound because its extreme rests on a single reference repository -- do not state or imply one.';

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
 * Build what is actually sent to the model for a given catalog. Strips
 * concern (an internal sort sentinel, meaningless to a reader -- see
 * lib/report.js's computeConcern), hasGauge and tier (rendering-only), and
 * rounds every numeric value/boundary through the same formatValue the
 * report's own cards use (lib/report-template.js), so the model is never
 * handed a raw float like 0.4108463434675432 to (mis)quote at full
 * precision. Reusing formatValue rather than a second formatter is
 * deliberate: the report and the narrative must always agree on what a
 * value "is" once rounded.
 * @param {Array<object>} catalog - already-computed catalog from buildMetricCatalog
 * @returns {Array<object>}
 */
function buildNarrativePayload(catalog) {
  return catalog.map(({ value, healthyBoundary, criticalBoundary, ...rest }) => {
    delete rest.concern;
    delete rest.hasGauge;
    delete rest.tier;
    const description = METRIC_DESCRIPTIONS[rest.key];
    return {
      ...rest,
      value: formatValue(value),
      healthyBoundary: healthyBoundary == null ? null : formatValue(healthyBoundary),
      criticalBoundary: criticalBoundary == null ? null : formatValue(criticalBoundary),
      ...(description ? { description } : {}),
      // Marks an entry whose construct cannot support a verdict (see lib/report.js's
      // message_quality_pct and net_additions_ratio_median comments) so the model has an
      // explicit signal, not just an inferred one, before it ever drafts a sentence --
      // the validator below rejects any such entry that shows up under "Concern" anyway.
      ...(rest.direction === 'informational' ? { verdict: 'none' } : {})
    };
  });
}

/**
 * A numeric literal in prose, excluding digits that are part of an
 * alphanumeric identifier (a short or full commit sha, an issue id like
 * code-quality-metrics-6ti). The lookbehind/lookahead both forbid a
 * neighboring word character, so "0db5a2c7" never yields a spurious "0" or
 * "7": each digit run in that token sits directly against a letter on at
 * least one side. An optional trailing "%" is captured and stripped by the
 * caller, since a catalog value is stored unitless.
 */
const NUMBER_PATTERN = /(?<![\w.])-?\d+(?:\.\d+)?%?(?![\w])/g;

/**
 * Extract every numeric literal from a string of prose, as canonical
 * (percent-sign-stripped) strings, in the same textual precision the model
 * wrote them.
 * @param {string} text
 * @returns {string[]}
 */
function extractNumbers(text) {
  const matches = text.match(NUMBER_PATTERN) || [];
  return matches.map(match => match.replace(/%$/, ''));
}

/**
 * True if a value is (or stringifies to) a bare numeral, so it belongs in
 * the allowed-numbers set. Excludes non-numeric strings like a trend label
 * ("shrinking") without needing the caller to know which fields are numeric.
 * @param {*} value
 * @returns {boolean}
 */
function isNumeric(value) {
  return value !== null && value !== undefined && /^-?\d+(?:\.\d+)?$/.test(String(value));
}

/**
 * Collect every number the model was actually given, canonicalized to the
 * exact strings that would appear in the JSON it received: the narrative
 * payload's rounded value/healthyBoundary/criticalBoundary (never its
 * stripped concern -- there is no longer a concern field to collect), plus
 * every numeric field of every top commit (total_additions, ai_confidence,
 * risk_score, and so on -- whichever a commit happens to carry, without
 * hardcoding the field list). A prose number failing to appear in this set
 * is either recomputed, rounded differently than given, or invented outright
 * -- all three are what the system prompt already forbids and none of them
 * were previously checked.
 * @param {Array<object>} payload - buildNarrativePayload's output
 * @param {Array<object>} topCommits
 * @returns {Set<string>}
 */
function collectAllowedNumbers(payload, topCommits) {
  const allowed = new Set();
  for (const entry of payload) {
    for (const field of [entry.value, entry.healthyBoundary, entry.criticalBoundary]) {
      if (isNumeric(field)) allowed.add(String(field));
    }
  }
  for (const commit of topCommits || []) {
    for (const field of Object.values(commit)) {
      if (isNumeric(field)) allowed.add(String(field));
    }
  }
  return allowed;
}

/**
 * Validate generated prose against the exact payload that produced it.
 * Rejects (does not warn -- see code-quality-metrics-ll1) on either of two
 * failures:
 *   1. A bullet cites a number, at whatever precision it wrote, that is not
 *      present anywhere in the catalog payload or the top-commits payload.
 *   2. A bullet labeled "Concern" names a metric the payload marked
 *      verdict: 'none' (informational -- see buildNarrativePayload), which
 *      is the metric layer's own withheld verdict being restored by prose.
 * @param {string[]} bullets - flattened, labeled bullets (flattenNarrative's output)
 * @param {Array<object>} payload - buildNarrativePayload's output
 * @param {Array<object>} topCommits
 * @returns {{ valid: boolean, reason: (string|null) }}
 */
function validateNarrative(bullets, payload, topCommits) {
  const allowedNumbers = collectAllowedNumbers(payload, topCommits);
  for (const bullet of bullets) {
    for (const token of extractNumbers(bullet)) {
      if (!allowedNumbers.has(token)) {
        return { valid: false, reason: `cites "${token}", which does not appear in the metric catalog or top-commit payload at that precision: "${bullet}"` };
      }
    }
  }

  const informationalLabels = payload
    .filter(entry => entry.verdict === 'none')
    .map(entry => entry.label.toLowerCase());
  for (const bullet of bullets) {
    if (!bullet.startsWith('Concern: ')) continue;
    const lowerBullet = bullet.toLowerCase();
    const match = informationalLabels.find(label => lowerBullet.includes(label));
    if (match) {
      return { valid: false, reason: `presents "${match}" as a Concern, but the metric layer marked it informational (no verdict): "${bullet}"` };
    }
  }

  return { valid: true, reason: null };
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

  const payload = buildNarrativePayload(catalog);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: NARRATIVE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${BENCHMARK_PROVENANCE_NOTE}\n\nMetric catalog (JSON):\n${JSON.stringify(payload)}\n\nTop commits (JSON):\n${JSON.stringify(topCommits)}`
      }]
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(json);
    const bullets = flattenNarrative(parsed);

    if (bullets.length === 0) {
      throw new Error('narrative response contained no findings');
    }

    const validation = validateNarrative(bullets, payload, topCommits);
    if (!validation.valid) {
      // Falls back rather than throwing into the catch below: that path's tests already pin
      // its return to fallbackFindings(catalog) exactly, with no visible marker, for API and
      // parse failures where there is nothing more specific to say. A validation rejection
      // does have something specific to say, and silently swallowing it (returning the same
      // bare fallback) is how this defect went unnoticed in the first place -- see
      // code-quality-metrics-ll1's decision: fail visibly, not silently.
      console.log(`ℹ️  Findings narrative rejected, using templated fallback: ${validation.reason}`);
      return [`Narrative rejected: ${validation.reason}`, ...fallbackFindings(catalog)];
    }

    return bullets;
  } catch (err) {
    console.log(`ℹ️  Findings narrative unavailable, using templated fallback: ${err.message}`);
    return fallbackFindings(catalog);
  }
}

module.exports = { generateFindingsNarrative, NARRATIVE_SYSTEM_PROMPT, buildNarrativePayload, validateNarrative };
