#!/usr/bin/env node
'use strict';

/**
 * Manual prompt eval script. Runs each Claude prompt against a toy fixture
 * via the real API and checks that the response is parseable JSON matching
 * the expected schema.
 *
 * Usage: ANTHROPIC_API_KEY=... node scripts/eval-prompts.js
 *
 * Run before releasing any prompt change. Not in the unit test suite
 * (requires live API, costs money, non-deterministic).
 */

const { getAnthropicClient, analyzeCfpWithClaude, runSemanticDuplicateAnalysis } = require('../lib/claude');

// client is resolved inside main() after awaiting getAnthropicClient

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  PASS  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`  FAIL  ${name}: ${reason}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CFP_FIXTURE = [
  { filename: 'src/users.js', additions: 30, deletions: 2, patch: '+async function createUser(data) {\n+  await db.insert("users", data);\n+  return { id: 1 };\n+}' },
];

const DUP_FIXTURE_FILES = [];
const DUP_FIXTURE_STATIC = [];

// ---------------------------------------------------------------------------
// Evals
// ---------------------------------------------------------------------------

async function evalCfpPrompt(client) {
  const name = 'CFP prompt: returns parseable JSON with E/X/R/W integers';
  try {
    const result = await analyzeCfpWithClaude(client, CFP_FIXTURE);
    if (!result) return fail(name, 'returned null');
    const { estimated_cfp_delta, estimated_cfp_breakdown: b } = result;
    if (typeof estimated_cfp_delta !== 'number') return fail(name, `estimated_cfp_delta is ${typeof estimated_cfp_delta}`);
    for (const key of ['entries', 'exits', 'reads', 'writes']) {
      if (typeof b[key] !== 'number') return fail(name, `breakdown.${key} is ${typeof b[key]}`);
    }
    if (b.entries + b.exits + b.reads + b.writes !== estimated_cfp_delta) return fail(name, 'E+X+R+W does not equal estimated_cfp_delta');
    pass(name);
  } catch (err) {
    fail(name, err.message);
  }
}

async function evalDuplicatePrompt(client) {
  const name = 'Duplicate prompt: returns parseable JSON array';
  try {
    const result = await runSemanticDuplicateAnalysis(client, DUP_FIXTURE_FILES, DUP_FIXTURE_STATIC);
    if (result.status === 'unmeasured') return fail(name, `status=unmeasured: ${result.error}`);
    if (!Array.isArray(result.findings)) return fail(name, `findings is ${typeof result.findings}`);
    for (const f of result.findings) {
      for (const key of ['file1', 'file2', 'similarity', 'concern', 'confidence']) {
        if (typeof f[key] !== 'string') return fail(name, `finding.${key} is ${typeof f[key]}`);
      }
    }
    pass(name);
  } catch (err) {
    fail(name, err.message);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

(async () => {
  const client = await getAnthropicClient();
  if (!client) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }
  console.log('Running prompt evals against live API...\n');
  await evalCfpPrompt(client);
  await evalDuplicatePrompt(client);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
