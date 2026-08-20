'use strict';

jest.mock('child_process');
jest.mock('fs');

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runDuplicateCheck, runDuplicateAnalysis, resolveModuleNeighbors } = require('../lib/duplicate');
const { CONFIG } = require('../lib/config');

const FIXTURE_DUPLICATE = {
  firstFile:  { name: 'src/lib/git.js',     start: 10, end: 25 },
  secondFile: { name: 'src/lib/metrics.js', start: 5,  end: 20 },
  lines:  15,
  tokens: 120
};

// Shape validated live against this repo's own lib/ (see beads issue
// code-quality-metrics-549): jscpd's report.statistics.total.
const FIXTURE_STATISTICS_TOTAL = {
  clones: 2,
  duplicatedLines: 12,
  duplicatedTokens: 90,
  lines: 1595,
  tokens: 6196,
  sources: 11,
  percentage: 0.75,
  percentageTokens: 2.07,
  newClones: 0,
  newDuplicatedLines: 0
};

beforeEach(() => {
  jest.clearAllMocks();
  execSync.mockReturnValue('');
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue(JSON.stringify({ duplicates: [FIXTURE_DUPLICATE] }));
  fs.mkdtempSync.mockReturnValue('/tmp/jscpd-output-mock');
});

describe('runDuplicateCheck', () => {
  test('returns empty array when filePaths is empty without calling jscpd', () => {
    const result = runDuplicateCheck([]);
    expect(result).toEqual([]);
    expect(execSync).not.toHaveBeenCalled();
  });

  test('returns empty array when jscpd output file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const result = runDuplicateCheck(['src/lib/git.js']);
    expect(result).toEqual([]);
  });

  test('parses jscpd JSON and returns firstFile/secondFile/lines/tokens for each duplicate', () => {
    const result = runDuplicateCheck(['src/lib/git.js', 'src/lib/metrics.js']);
    expect(result).toHaveLength(1);
    expect(result[0].firstFile).toEqual(FIXTURE_DUPLICATE.firstFile);
    expect(result[0].secondFile).toEqual(FIXTURE_DUPLICATE.secondFile);
    expect(result[0].lines).toBe(15);
    expect(result[0].tokens).toBe(120);
  });

  test('returns empty array when jscpd exits non-zero', () => {
    execSync.mockImplementation(() => { throw new Error('exit code 1'); });
    const result = runDuplicateCheck(['src/lib/git.js']);
    expect(result).toEqual([]);
  });

  test('removes the temporary output directory even when jscpd exits non-zero', () => {
    // A naive cleanup call placed after the success path would never run here,
    // since this path returns early. Forces try/finally rather than a trailing
    // statement.
    execSync.mockImplementation(() => { throw new Error('exit code 1'); });
    runDuplicateCheck(['src/lib/git.js']);
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/jscpd-output-mock', { recursive: true, force: true });
  });

  // GUARDs: these pass against the try/finally added for the non-zero-exit case
  // above without a fresh red, since all early-return paths and the success
  // path share that one finally block. Recorded here to pin cleanup on the
  // remaining paths specifically.
  test('GUARD: removes the temporary output directory when the report file is missing', () => {
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/lib/git.js']);
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/jscpd-output-mock', { recursive: true, force: true });
  });

  test('GUARD: removes the temporary output directory after a successful run', () => {
    runDuplicateCheck(['src/lib/git.js']);
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/jscpd-output-mock', { recursive: true, force: true });
  });

  test('GUARD: does not create or remove any directory when filePaths is empty', () => {
    runDuplicateCheck([]);
    expect(fs.mkdtempSync).not.toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  test('creates a unique output directory per run via fs.mkdtempSync instead of a shared fixed path', () => {
    // Regression guard for code-quality-metrics-ddv: a fixed shared tmp path meant
    // two concurrent runs on one machine wrote and read back each other's report.
    fs.mkdtempSync.mockReturnValue('/tmp/jscpd-output-abc123');
    runDuplicateCheck(['src/app.js']);

    const expectedPrefix = path.join(os.tmpdir(), 'jscpd-output-');
    expect(fs.mkdtempSync).toHaveBeenCalledWith(expectedPrefix);

    const command = execSync.mock.calls[0][0];
    expect(command).toContain('--output "/tmp/jscpd-output-abc123"');
  });

  test('excludes vendored dependency trees by default', () => {
    // No CONFIG override here: this exercises the actual shipped default, the
    // same one pr-metrics.yml relies on. nodejs/node vendors npm in-tree under
    // deps/, which had no matching ignore pattern and inflated duplication
    // from 5.12 percent to 15.09 percent on a pure vendored dependency sync.
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('**/deps/**');
    expect(command).toContain('**/vendor/**');
    expect(command).toContain('**/third_party/**');
    expect(command).toContain('**/node_modules/**');
  });

  test('excludes generated-code trees by default', () => {
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('**/generated/**');
  });

  test('excludes lock files by default', () => {
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('**/package-lock.json');
    expect(command).toContain('**/yarn.lock');
    expect(command).toContain('**/pnpm-lock.yaml');
    expect(command).toContain('**/*.lock');
  });

  test('composes --min-lines and --min-tokens flags at Sonar-equivalent minimums by default', () => {
    // Sonar's 3% gate is measured at 100 tokens over 10 lines; this pins the shipped
    // defaults literally, so it fails if the defaults ever drift, unlike a test that
    // reads CONFIG.DUPLICATE_MIN_LINES back and would pass at any value.
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['src/app.js']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('--min-lines 10');
    expect(command).toContain('--min-tokens 100');
  });

  // code-quality-metrics-3i6e: without --absolute, jscpd's own report names every file
  // by bare basename only (verified live: two files named main.tf in different
  // directories both reported as "main.tf", with no directory prefix on either side,
  // even when their basenames are unique in the whole scanned set). A repository with
  // more than one file sharing a basename (e.g. terraform/main.tf,
  // terraform/environments/development/main.tf) then renders an unresolvable "duplicates
  // main.tf" the reader cannot act on. --absolute makes jscpd's report carry the full
  // path so it can be normalized back to something distinguishable.
  test('passes --absolute to jscpd so files sharing a basename across directories can be told apart', () => {
    fs.existsSync.mockReturnValue(false);
    runDuplicateCheck(['terraform/environments/development/main.tf']);
    const command = execSync.mock.calls[0][0];
    expect(command).toContain('--absolute');
  });

  // code-quality-metrics-3i6e: --absolute makes jscpd report firstFile.name/secondFile.name
  // as absolute paths. Left unconverted, that would trade one bug (an unresolvable bare
  // basename) for another (an absolute local filesystem path reaching a report shared
  // outside the client context, the same leak fixed for the semantic layer in
  // code-quality-metrics-34fu). Both members of a pair must render on the same,
  // repo-relative basis.
  test('normalizes firstFile/secondFile names from absolute paths back to paths relative to the working directory', () => {
    const firstAbsolute = path.join(process.cwd(), 'terraform/environments/development/main.tf');
    const secondAbsolute = path.join(process.cwd(), 'terraform/environments/staging/main.tf');
    fs.readFileSync.mockReturnValue(JSON.stringify({
      duplicates: [{
        firstFile: { name: firstAbsolute, start: 28, end: 53 },
        secondFile: { name: secondAbsolute, start: 17, end: 42 },
        lines: 26,
        tokens: 110
      }]
    }));

    const result = runDuplicateCheck([
      'terraform/environments/development/main.tf',
      'terraform/environments/staging/main.tf'
    ]);

    expect(result[0].firstFile.name).toBe('terraform/environments/development/main.tf');
    expect(result[0].secondFile.name).toBe('terraform/environments/staging/main.tf');
  });
});

describe('runDuplicateAnalysis', () => {
  test('returns empty findings and null statistics without calling jscpd when filePaths is empty', () => {
    const result = runDuplicateAnalysis([]);
    expect(result).toEqual({ findings: [], statistics: null });
    expect(execSync).not.toHaveBeenCalled();
  });

  test('returns findings and the full statistics.total object from a real jscpd report', () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({
      duplicates: [FIXTURE_DUPLICATE],
      statistics: { total: FIXTURE_STATISTICS_TOTAL }
    }));

    const result = runDuplicateAnalysis(['src/lib/git.js', 'src/lib/metrics.js']);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].firstFile).toEqual(FIXTURE_DUPLICATE.firstFile);
    expect(result.findings[0].secondFile).toEqual(FIXTURE_DUPLICATE.secondFile);
    expect(result.findings[0].lines).toBe(15);
    expect(result.findings[0].tokens).toBe(120);
    expect(result.statistics).toEqual(FIXTURE_STATISTICS_TOTAL);
  });

  // GUARDs: these degenerate cases are already covered behaviorally by the
  // runDuplicateCheck tests above (same underlying execSync/fs code path,
  // extracted into runDuplicateAnalysis rather than rewritten), so they pass
  // against the current implementation without a fresh red. Recorded here to
  // pin the null-statistics contract on the new return shape specifically.
  test('GUARD: returns null statistics when jscpd exits non-zero', () => {
    execSync.mockImplementation(() => { throw new Error('exit code 1'); });
    const result = runDuplicateAnalysis(['src/lib/git.js']);
    expect(result).toEqual({ findings: [], statistics: null });
  });

  test('GUARD: returns null statistics when the jscpd report file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const result = runDuplicateAnalysis(['src/lib/git.js']);
    expect(result).toEqual({ findings: [], statistics: null });
  });

  // code-quality-metrics-tjn: jscpd does not recognize every language (Elixir's .ex/.exs among
  // them, verified live against remote_retro). When it recognizes none of the scanned files, it
  // still exits 0 and writes a report with statistics.total.sources: 0 -- a report shaped exactly
  // like a real, perfect "0% duplication, nothing to flag" measurement. The two are told apart by
  // a second, cheap jscpd pass with min-lines/min-tokens relaxed to 1: a genuinely supported
  // language will register at least one source at that floor; an unsupported one still won't.
  describe('unsupported-language detection (code-quality-metrics-tjn)', () => {
    const ZERO_SOURCES_STATS = {
      clones: 0, duplicatedLines: 0, duplicatedTokens: 0, lines: 0, tokens: 0,
      sources: 0, percentage: 0, percentageTokens: 0, newClones: 0, newDuplicatedLines: 0
    };

    test('probes with relaxed min-lines/min-tokens only after the real scan finds zero sources', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({ duplicates: [], statistics: { total: ZERO_SOURCES_STATS } }));

      runDuplicateAnalysis(['lib/foo.ex']);

      expect(execSync).toHaveBeenCalledTimes(2);
      const probeCommand = execSync.mock.calls[1][0];
      expect(probeCommand).toContain('--min-lines 1');
      expect(probeCommand).toContain('--min-tokens 1');
    });

    test('does not probe at all when the real scan already found sources', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        duplicates: [FIXTURE_DUPLICATE],
        statistics: { total: FIXTURE_STATISTICS_TOTAL }
      }));

      runDuplicateAnalysis(['src/lib/git.js', 'src/lib/metrics.js']);

      expect(execSync).toHaveBeenCalledTimes(1);
    });

    test('reports unsupportedExtensions and null statistics when the relaxed probe also finds zero sources', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({ duplicates: [], statistics: { total: ZERO_SOURCES_STATS } }));

      const result = runDuplicateAnalysis(['lib/foo.ex', 'lib/bar.exs']);

      expect(result).toEqual({ findings: [], statistics: null, unsupportedExtensions: ['.ex', '.exs'] });
    });

    test('GUARD: keeps the real (genuine) statistics, with no unsupportedExtensions field, when the relaxed probe finds sources', () => {
      // A real, if trivial, measurement (every scanned file fell below the configured
      // min-lines/min-tokens floor) must stay distinguishable from an unsupported language: the
      // relaxed probe finding sources > 0 proves the language IS recognized, so the original
      // zero-source result from the real scan is genuine and must pass through unchanged.
      fs.readFileSync
        .mockReturnValueOnce(JSON.stringify({ duplicates: [], statistics: { total: ZERO_SOURCES_STATS } }))
        .mockReturnValueOnce(JSON.stringify({
          duplicates: [],
          statistics: { total: { ...ZERO_SOURCES_STATS, sources: 2, lines: 4 } }
        }));

      const result = runDuplicateAnalysis(['a.js', 'b.js']);

      expect(result).toEqual({ findings: [], statistics: ZERO_SOURCES_STATS });
      expect(result.unsupportedExtensions).toBeUndefined();
    });
  });
});

describe('resolveModuleNeighbors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
  });

  // code-quality-metrics-34fu: candidates are normalized relative to a root (repo root
  // in real usage) rather than returned in whatever form they arrived in, so the same
  // real file cannot enter the set twice under two different spellings. These four
  // tests pass an explicit root so the fixture's `/project/...` paths stay realistic
  // without depending on this process's actual working directory.
  test('returns only the input files when they have no local imports', () => {
    fs.readFileSync.mockReturnValue('const x = 1;');
    const input = ['/project/src/lib/git.js'];
    const result = resolveModuleNeighbors(input, '/project');
    expect(result).toContain('src/lib/git.js');
    expect(result).toHaveLength(1);
  });

  test('returns changed files plus resolved local imports', () => {
    fs.readFileSync.mockReturnValue("const { CONFIG } = require('./config');");
    const input = ['/project/src/lib/git.js'];
    const result = resolveModuleNeighbors(input, '/project');
    expect(result).toContain('src/lib/git.js');
    expect(result).toContain('src/lib/config.js');
    expect(result).toHaveLength(2);
  });

  test('skips import resolution for non-JS files and includes them as-is', () => {
    const input = ['/project/.github/workflows/pr-metrics.yml'];
    const result = resolveModuleNeighbors(input, '/project');
    expect(result).toContain('.github/workflows/pr-metrics.yml');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  test('skips files that do not exist on disk', () => {
    fs.existsSync.mockReturnValue(false);
    const input = ['/project/src/deleted.js'];
    const result = resolveModuleNeighbors(input);
    expect(result).toEqual([]);
  });

  test('ignores external and node_modules imports', () => {
    fs.readFileSync.mockReturnValue(
      "const fs = require('fs');\nconst x = require('lodash');\nconst y = require('./local');"
    );
    const input = ['/project/src/lib/git.js'];
    const result = resolveModuleNeighbors(input, '/project');
    expect(result).toContain('src/lib/local.js');
    expect(result.some(p => p.includes('lodash'))).toBe(false);
    expect(result.some(p => p.includes('node_modules'))).toBe(false);
  });

  test('passes ignore patterns as file globs, not code-level regexes', () => {
    // jscpd's -i/--ignore takes file globs; --ignore-pattern takes code-level regexes
    // for skipping tokens. Asserting the command because the shell invocation is the
    // contract with jscpd, and there is no local observable for "the right files were
    // excluded". Verified live: on flight-info-spike, --ignore-pattern left duplication
    // at 16.50 percent, identical to passing nothing, while --ignore gave 1.23 percent.
    const original = CONFIG.DUPLICATE_IGNORE_PATTERNS;
    CONFIG.DUPLICATE_IGNORE_PATTERNS = ['**/designs/**'];
    try {
      fs.existsSync.mockReturnValue(false);
      runDuplicateCheck(['src/app.js']);
      const command = execSync.mock.calls[0][0];
      expect(command).toMatch(/--ignore\s+"/);
      expect(command).toContain('**/designs/**');
    } finally {
      CONFIG.DUPLICATE_IGNORE_PATTERNS = original;
    }
  });

  // code-quality-metrics-34fu: a file already present in the candidate set (e.g. a
  // production file passed in directly) can also be reached a second time as a resolved
  // import target of another file. path.resolve() always returns an absolute path, so the
  // same real file entered the Set under two different string spellings (its original
  // relative form, and the newly resolved absolute form) and was never deduplicated.
  // Verified live against 73V: the semantic-duplicate layer then paired the file with
  // itself, reporting a guaranteed "byte-for-byte identical" finding that carries zero
  // information and consumes one of a handful of semantic-analysis slots.
  test('dedupes the same real file when it is passed in directly and also reached as a resolved import target', () => {
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath === 'backend/routes/index.js') {
        return "const authorize = require('../middleware/authorizeWithProviderScope');";
      }
      return 'module.exports = function authorizeWithProviderScope() {};';
    });

    const result = resolveModuleNeighbors([
      'backend/middleware/authorizeWithProviderScope.js',
      'backend/routes/index.js'
    ]);

    expect(result).toHaveLength(2);
    expect(result.filter(p => p === 'backend/middleware/authorizeWithProviderScope.js')).toHaveLength(1);
  });

});
