// @ts-nocheck
'use strict';

const path = require('path');

/**
 * Load ANTHROPIC_API_KEY (and any other vars) from .env files, in the
 * following precedence order, highest first:
 *
 *   1. An already-exported shell environment variable. dotenv never
 *      overrides a key already present in process.env, so this wins with
 *      no special-casing here: it is already set before either config()
 *      call below runs.
 *   2. The target repository's own .env, resolved from process.cwd(). Lets
 *      someone running this tool against another repo keep the key there.
 *   3. This tool's own .env, resolved relative to baseDir (this tool's
 *      installation directory) rather than process.cwd(). dotenv resolves
 *      .env relative to the caller's cwd by default, which breaks when this
 *      tool is invoked from another repository's directory: the key lives
 *      in this tool's own .env, not the target repo's. This is the
 *      fallback, so the key still works when the target repo has no .env
 *      of its own.
 *
 * dotenv only ever fills in keys not already set, so loading cwd's .env
 * before baseDir's is what makes tier 2 win over tier 3.
 * @param {string} baseDir - directory to resolve this tool's own .env against (pass __dirname)
 */
function loadEnv(baseDir) {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
  dotenv.config({ path: path.join(baseDir, '.env'), quiet: true });
}

module.exports = { loadEnv };
