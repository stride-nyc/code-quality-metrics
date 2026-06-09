// @ts-nocheck
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { CONFIG } = require('./config');

const JSCPD_OUTPUT_DIR = path.join(os.tmpdir(), 'jscpd-output');
const JSCPD_REPORT_FILE = path.join(JSCPD_OUTPUT_DIR, 'jscpd-report.json');

function runDuplicateCheck(filePaths) {
  if (!filePaths || filePaths.length === 0) return [];

  const ignoreArg = CONFIG.DUPLICATE_IGNORE_PATTERNS.length > 0
    ? `--ignore-pattern "${CONFIG.DUPLICATE_IGNORE_PATTERNS.join(',')}"` : '';

  const cmd = [
    'npx jscpd',
    `--min-lines ${CONFIG.DUPLICATE_MIN_LINES}`,
    `--min-tokens ${CONFIG.DUPLICATE_MIN_TOKENS}`,
    ignoreArg,
    '--reporters json',
    `--output "${JSCPD_OUTPUT_DIR}"`,
    ...filePaths.map(f => `"${f}"`)
  ].filter(Boolean).join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch {
    return [];
  }

  if (!fs.existsSync(JSCPD_REPORT_FILE)) return [];

  const report = JSON.parse(fs.readFileSync(JSCPD_REPORT_FILE, 'utf8'));
  return (report.duplicates || []).map(d => ({
    firstFile:  d.firstFile,
    secondFile: d.secondFile,
    lines:  d.lines,
    tokens: d.tokens
  }));
}

module.exports = { runDuplicateCheck };
