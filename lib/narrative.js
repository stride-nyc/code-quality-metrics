// @ts-nocheck
'use strict';

const { fallbackFindings, formatValue } = require('./report-template');
const { METRIC_DESCRIPTIONS } = require('./metric-descriptions');
const { CONFIG } = require('./config');

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

const NARRATIVE_SYSTEM_PROMPT = `You are writing the Findings section of a code quality drift report, for a reader who has never seen this tool before and will not ask what a term means -- if a sentence needs jargon explained, explain it in the same sentence. You are given a metric catalog and a list of top commits, both already computed by the report tool. Do not compute, estimate, or restate any number differently than given. Echo every number you reference exactly as given, to the same precision -- this includes a top commit's own addition/deletion counts, which are exact facts about that one commit, not a rounded rate the way a catalog value is.

Five rules, in order of how much they matter to a first-time reader:

1. Lead with the consequence, not the metric name. Start each sentence with what is actually true or worth doing ("About a third of commits are too large to review line by line") and bring in the metric name and number as support, not the headline ("Large commits sit at 33%..." buries the point until the second half of the sentence). A reader scanning ten bullets should learn what is wrong before they read ten metric names.

2. Explain "p90" the first time a p90 metric appears, in words, not as a restated percentage: say "nine out of ten commits are smaller than this" or "the largest tenth of commits", never "90% of commits", since "90" is not itself a number from the catalog and reusing it that way will be rejected as fabricated. Each catalog entry may carry a description.measures field written in plain language for exactly this -- prefer reusing or adapting that wording over inventing your own, and especially over leaving "p90" unexplained.

3. The catalog gives each metric's healthy/critical boundary so you can compare a value to it, but do not restate "above/below the healthy boundary of N" in nearly every bullet -- ten near-identical sentences is as hard to read as ten unexplained numbers. State that comparison plainly where it earns its place, and elsewhere just say what the number itself means (e.g. "about a third of commits" rather than repeating "33%, above the healthy boundary of 19%" every time it recurs).

4. Say once, wherever it fits best, that "healthy" and "critical" describe where a value sits among six benchmark repositories, not a validated safety threshold -- do not repeat this framing in every bullet, and do not let a boundary read as a guarantee.

5. Only present a metric as a Concern when the catalog itself scores it that way (its own status is 'warning' or 'critical'). An entry the catalog marks informational (verdict: 'none' -- no construct that could support a pass/fail call) must never be framed as the concern itself, even as supporting color inside a sentence about a real one.

None of this is license to sound more certain than the data supports. Rounding a number for readability or spelling out a term in plain words must never add confidence the catalog itself does not have: a rate from a small commit sample is still a rate from a small sample whether it is written as "62.22%" or "about 62%".

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
 * Round a numeric payload value to two significant figures rather than
 * formatValue's fixed two decimal places (code-quality-metrics-5qn). A rate
 * or line count derived from a commit sample this small does not support
 * "62.22%" or "578.5 lines" -- both real quoted issue examples -- so a
 * large value collapses to a round number the way a reader would say it
 * aloud: 62.22 -> 62 (two significant figures: 6 and 2), 578.5 -> 580 (5
 * and 8, with the trailing zero a placeholder, not a claimed digit). The
 * same rule leaves a value that already has two significant figures or
 * fewer untouched, with no separate magnitude check needed: a ratio like
 * net_additions_ratio_median's 0.2, or its own 0.63/0.79 boundaries, is
 * already at (or under) two significant figures, so rounding to two only
 * ever reproduces the same number -- it never collapses toward zero the
 * way rounding to a fixed number of *decimal places* would for a value
 * this small. Delegates to formatValue first so a non-numeric value (a
 * trend label, or duplication_lines' composite "15 / 3651" string) passes
 * through exactly as before, and again after rounding so the payload's
 * string form matches the report cards' own (no trailing ".0").
 * @param {*} value
 * @returns {*}
 */
function narrativeValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return formatValue(value);
  if (value === 0) return formatValue(value);
  const rounded = Number(value.toPrecision(2));
  return formatValue(rounded);
}

/**
 * Build what is actually sent to the model for a given catalog. Strips
 * concern (an internal sort sentinel, meaningless to a reader -- see
 * lib/report.js's computeConcern), hasGauge and tier (rendering-only), and
 * rounds every numeric value/boundary to the precision a reader can trust
 * (narrativeValue above), so the model is never handed a raw float like
 * 0.4108463434675432, nor a rate like 62.22% implying more precision than a
 * 45-commit sample supports. This is deliberately not the same rounding the
 * report's own cards use (formatValue, lib/report-template.js): a tile can
 * show "62.22" where a reader has the gauge and the label right next to it,
 * but prose reporting the same figure needs the coarser, more readable cut.
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
      value: narrativeValue(value),
      healthyBoundary: healthyBoundary == null ? null : narrativeValue(healthyBoundary),
      criticalBoundary: criticalBoundary == null ? null : narrativeValue(criticalBoundary),
      ...(description ? { description } : {}),
      // Marks an entry whose construct cannot support a verdict, so the model has an explicit
      // signal, not just an inferred one, before it ever drafts a sentence -- the validator below
      // rejects any such entry that shows up under "Concern" anyway.
      //
      // Requires BOTH direction and status, deliberately (code-quality-metrics-i39): direction
      // alone used to collide two different things under one verdict rule. message_quality_pct,
      // net_additions_ratio_median and avg_lines_changed are informational because their construct
      // cannot support a verdict at all -- their status is hardcoded 'neutral' in lib/report.js, so
      // they still end up marked verdict: 'none' below. commit_size_trend and velocity_trend are
      // informational by default but carry a real composite-rule status ('warning' when
      // lib/report.js's growingAndAccelerating rule fires) -- the tool itself raised that concern,
      // so prose reporting it must be presentable, and the status half of this check is what lets
      // it through. Keying on direction alone marked both cases identically and rejected the
      // toolkit's own named drift signal in 4 of 5 real repository runs. direction: 'special'
      // (test_isolation_rate is the only current example) still always ends up marked: lib/report.js
      // never assigns it 'warning' or 'critical', only 'good' or 'neutral'. Status alone is not
      // enough on its own, either: a real scored metric (direction 'higher-is-worse'/'higher-is-
      // better') sitting at status 'good' must never be marked verdict: 'none' just because its
      // status is not 'warning'/'critical' this run -- it is still a real, presentable metric.
      ...((rest.direction === 'informational' || rest.direction === 'special') && rest.status !== 'warning' && rest.status !== 'critical' ? { verdict: 'none' } : {})
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
 *
 * The first alternative matches a thousands-separated numeral (e.g.
 * "14,803") as a single token before the second, plain-digit-run
 * alternative gets a chance to split it into "14" and "803" -- regex
 * alternation tries alternatives left to right at each position, so order
 * here is load-bearing (code-quality-metrics-38h). Only the standard
 * 3-digit grouping is recognized; extractNumbers strips the commas back out
 * below so the token compares equal to the payload's own ungrouped digits.
 */
const NUMBER_PATTERN = /(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?%?(?![\w])|(?<![\w.])-?\d+(?:\.\d+)?%?(?![\w])/g;

/**
 * Extract every numeric literal from a string of prose, as canonical
 * (percent-sign-stripped, thousands-comma-stripped) strings, in the same
 * textual precision the model wrote them. Stripping a thousands separator
 * is a narrow, specific normalization -- the payload never stores one (see
 * buildNarrativePayload/formatValue), so a prose "14,803" and a payload
 * "14803" are the same number written two ways, not two different figures.
 * This does not generalize to stripping arbitrary punctuation from a
 * number: a comma is only ever removed here because NUMBER_PATTERN already
 * anchored it inside a recognized thousands-grouping shape.
 * @param {string} text
 * @returns {string[]}
 */
function extractNumbers(text) {
  const matches = text.match(NUMBER_PATTERN) || [];
  return matches.map(match => match.replace(/%$/, '').replace(/,/g, ''));
}

/**
 * Collect every number the model was actually given, canonicalized the same
 * way a number extracted from prose is: by running the same boundary-aware
 * NUMBER_PATTERN over the JSON text of the narrative payload and the top
 * commits, rather than walking specific fields. Whole-string numeric fields
 * (value, healthyBoundary, criticalBoundary) are covered this way, but so is
 * a number embedded in a composite string value -- duplication_lines' value
 * is "15 / 3651", not a bare numeral, and a model correctly citing either 15
 * or 3651 was being rejected as fabricated until this was found running a
 * real repro (code-quality-metrics-ll1). The same boundary rule that keeps a
 * commit sha's digits out of prose (see NUMBER_PATTERN) keeps a JSON key
 * name's digits (e.g. p90_lines_changed's "90") out of this set too: every
 * digit run there sits directly against a letter.
 * @param {Array<object>} payload - buildNarrativePayload's output
 * @param {Array<object>} topCommits
 * @returns {Set<string>}
 */
function collectAllowedNumbers(payload, topCommits) {
  const text = `${JSON.stringify(payload)} ${JSON.stringify(topCommits || [])}`;
  return new Set(extractNumbers(text));
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

  // code-quality-metrics-ll1 follow-up item 2: presence alone is not enough -- the original
  // report cited a real value (18) as a metric's "healthy boundary" when the metric's actual
  // healthyBoundary was 8, and the presence check above let it through because 18 genuinely
  // appears in the payload (as the metric's own value). Checking the *role* a number plays in
  // open-ended prose is guesswork in general, so this is deliberately narrow: it fires only on
  // the literal phrase "healthy/critical boundary of/is/at/was N", which is how a model
  // naturally renders the payload's own healthyBoundary/criticalBoundary field names back into
  // English (see BENCHMARK_PROVENANCE_NOTE above, which uses that exact wording) -- not a
  // general attempt to parse what every number in a sentence means. It only judges a match when
  // the bullet names exactly one payload entry by label; with zero or multiple candidates it
  // does not guess which metric the phrase is about, and passes the number through to the
  // presence check above instead.
  const BOUNDARY_PHRASE = /(healthy|critical)\s+boundary\s*(?:of|is|at|was)?\s*(-?\d+(?:\.\d+)?)%?/gi;
  for (const bullet of bullets) {
    const lowerBullet = bullet.toLowerCase();
    let match;
    BOUNDARY_PHRASE.lastIndex = 0;
    while ((match = BOUNDARY_PHRASE.exec(bullet)) !== null) {
      const tier = match[1].toLowerCase();
      const cited = match[2];
      const phraseIndex = match.index;
      // Only a label that appears BEFORE the phrase counts as naming the metric the phrase is
      // about: prose normally names its subject, then states the subject's boundary ("Files
      // changed, p90 sits at 18, above the healthy boundary of 8"). Matching a label anywhere in
      // the bullet was found (running generate-drift-report.js for real) to misfire on a label
      // that only occurs later as ordinary English unrelated to that metric -- see this
      // function's own test for the exact real sentence that exposed it. Requiring the label to
      // precede the phrase, and requiring exactly one such preceding label, keeps the check from
      // guessing when it is genuinely ambiguous which metric (if any) the phrase names.
      //
      // A preceding label is also only a candidate if its entry could ever legitimately own a
      // boundary of THIS tier at all (code-quality-metrics-i39, measured against a real daloopa
      // run): commit_size_trend has no healthy or critical boundary of any kind (it is a
      // composite-rule status, not a threshold), but its label happened to be the only one
      // literally preceding a "healthy boundary of 260" phrase whose real subject
      // (p90_lines_changed) was paraphrased rather than quoted verbatim -- crediting a boundary-
      // less entry as the phrase's sole subject was always incoherent, not merely ambiguous. This
      // can only shrink the candidate pool, never grow it, so it cannot introduce a new false
      // rejection; it can only turn a wrong single candidate into zero (skip) or, when a genuine
      // boundary-bearing candidate is also present, into the one candidate that actually matters
      // (see this function's own guard test for a bullet naming both).
      const precedingEntries = payload.filter(entry => {
        if (!entry.label) return false;
        const ownBoundary = tier === 'healthy' ? entry.healthyBoundary : entry.criticalBoundary;
        if (ownBoundary == null) return false;
        const idx = lowerBullet.indexOf(entry.label.toLowerCase());
        return idx !== -1 && idx < phraseIndex;
      });
      if (precedingEntries.length !== 1) continue;
      const entry = precedingEntries[0];
      const expected = tier === 'healthy' ? entry.healthyBoundary : entry.criticalBoundary;
      if (expected == null || Number(cited) !== Number(expected)) {
        return { valid: false, reason: `cites a ${tier} boundary of ${cited} for "${entry.label}", but the payload's ${tier}Boundary for that metric is ${expected == null ? 'absent' : expected}: "${bullet}"` };
      }
    }
  }

  // code-quality-metrics-ll1 follow-up item 3: entry.key is an internal identifier
  // (test_prod_cochange_commit, duplication_density_pct, ...) that exists so the payload can be
  // looked up programmatically; entry.label is the human-readable name meant for prose.
  // Unlike a number, a snake_case key can never be present-but-wrong the way a boundary can --
  // it is either quoted verbatim (always wrong; a reader has no use for it, and the measured
  // defect was exactly this, a field name the model had no business surfacing) or absent. A
  // plain substring check is safe here in a way it would not be for a number: an internal key
  // always contains an underscore against two word characters, so it cannot appear in ordinary
  // English prose by coincidence the way a bare digit or short label word could.
  for (const bullet of bullets) {
    const quoted = payload.find(entry => entry.key && bullet.includes(entry.key));
    if (quoted) {
      return { valid: false, reason: `quotes the internal field name "${quoted.key}" verbatim instead of its label "${quoted.label}": "${bullet}"` };
    }
  }

  // code-quality-metrics-6gu: presence-anywhere is not enough here either. A real generated
  // bullet named a real scored metric (duplication_density_pct) as its subject, correctly
  // stated its healthy boundary, and cited an informational metric's own value as supporting
  // detail later in the same sentence ("...with 924 duplicated lines out of 14740 scanned...").
  // The check below only rejects when NO scored (verdict-bearing) metric's label is named
  // anywhere in the bullet: a bullet naming a real scored metric is about that metric, and an
  // informational label mentioned elsewhere in it is being cited as supporting detail, not
  // asserted as the bullet's own subject. This is deliberately conservative, not precise:
  // distinguishing "this bullet's subject" from "supporting detail" in open-ended prose in
  // general is guesswork the same way the boundary-phrase check above declines to guess, and a
  // position-based rule (e.g. "only the first label mentioned") was found to trade this
  // false-positive class for a different false-negative class -- a bullet that correctly leads
  // with a real concern and then smuggles in an improper verdict for an informational metric
  // later in the same bullet. Requiring the bullet to name no scored metric at all is narrower:
  // it still catches a bullet that is entirely about an informational metric (the guard test
  // below), but knowingly does not catch the smuggled-verdict case, since any bullet naming a
  // real concern already passes this gate. That trade is accepted rather than layered with
  // further phrase-position special cases.
  const scoredLabels = payload
    .filter(entry => entry.verdict !== 'none')
    .map(entry => entry.label.toLowerCase());
  // code-quality-metrics-i39: measured against real flight-info-spike and
  // dotnetdependencytracer runs, both rejected with 'presents "velocity" as a Concern' even
  // though the bullet correctly reported velocity_trend's real 'warning' status (see the
  // status-keyed verdict mark above). velocity_commits_per_day's label, "Velocity", is a strict
  // text prefix of velocity_trend's label, "Velocity trend" -- a model writing the bare word
  // "velocity" (not required to echo a label back verbatim) collides with the always-
  // informational raw-rate entry's own label by substring, even when it is naming the scored
  // trend entry. An informational label that is itself a substring of some currently-scored
  // label is excluded here: it is not more likely that a bullet mentioning that text is about
  // the never-scored entry than about the scored one whose label contains it, so it is not
  // informative to reject on it. This cannot introduce a new false rejection (it only narrows
  // the set this loop can flag), and does not fire at all when the composite entry is not
  // currently scored (both labels stay informational, no exclusion applies, and the guard test
  // below still rejects that case).
  const informationalLabels = payload
    .filter(entry => entry.verdict === 'none')
    .map(entry => entry.label.toLowerCase())
    .filter(label => !scoredLabels.some(scoredLabel => scoredLabel.includes(label)));
  for (const bullet of bullets) {
    if (!bullet.startsWith('Concern: ')) continue;
    const lowerBullet = bullet.toLowerCase();
    if (scoredLabels.some(label => lowerBullet.includes(label))) continue;
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
      max_tokens: CONFIG.NARRATIVE_MAX_OUTPUT_TOKENS,
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
