'use strict';

// Real fs and a real process.cwd() elsewhere on purpose: this module's whole job is
// resolving .env relative to the right base directory, so mocking fs would just
// test the mock. See __tests__/loadEnv.test.js note in the ticket: assert that
// process.env actually ends up populated, never that dotenv was called with
// certain arguments.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadEnv } = require('../lib/env');

const ENV_KEY = 'ANTHROPIC_API_KEY';

let originalCwd;
let tempDirs;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDirs = [];
  delete process.env[ENV_KEY];
});

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env[ENV_KEY];
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Create a fresh temp directory, tracked for cleanup. */
function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Write a .env file containing ANTHROPIC_API_KEY=value into dir. */
function writeEnvFile(dir, value) {
  fs.writeFileSync(path.join(dir, '.env'), `${ENV_KEY}=${value}\n`);
}

describe('loadEnv', () => {
  test('reads ANTHROPIC_API_KEY from the tool\'s own .env when cwd is another directory with no .env and no shell var is set', () => {
    const baseDir = makeTempDir('cqm-basedir-');
    const otherCwd = makeTempDir('cqm-othercwd-');
    writeEnvFile(baseDir, 'sk-test-basedir-value');
    process.chdir(otherCwd);

    loadEnv(baseDir);

    expect(process.env[ENV_KEY]).toBe('sk-test-basedir-value');
  });

  test('does not override an already-exported shell environment variable', () => {
    const baseDir = makeTempDir('cqm-basedir-');
    writeEnvFile(baseDir, 'sk-test-basedir-value');
    process.env[ENV_KEY] = 'sk-test-shell-value';

    loadEnv(baseDir);

    expect(process.env[ENV_KEY]).toBe('sk-test-shell-value');
  });

  test('prefers the target repo\'s own .env (cwd) over the tool\'s bundled .env (baseDir) when no shell var is set', () => {
    const baseDir = makeTempDir('cqm-basedir-');
    const targetRepo = makeTempDir('cqm-targetrepo-');
    writeEnvFile(baseDir, 'sk-test-basedir-value');
    writeEnvFile(targetRepo, 'sk-test-cwd-value');
    process.chdir(targetRepo);

    loadEnv(baseDir);

    expect(process.env[ENV_KEY]).toBe('sk-test-cwd-value');
  });
});
