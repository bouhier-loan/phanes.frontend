import {
  BytesSource,
  type FileSource,
  PyGlobal,
  PyList,
  PyObject,
  readFully,
} from '@phanes/renpy-formats';
import { fixturePath, readFixture, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  type DiagnosticsResult,
  mapStatements,
  newAclReport,
  type OverviewResult,
} from '../src';

const dist = (sdk: string) => walkDirectory(fixturePath('build', sdk, 'phanes_demo', 'dist'));

function node(className: string, attrs: Record<string, unknown>): PyObject {
  const dot = className.lastIndexOf('.');
  const obj = new PyObject(new PyGlobal(className.slice(0, dot), className.slice(dot + 1)));
  for (const [k, v] of Object.entries(attrs)) obj.attrs.set(k, v as never);
  return obj;
}

describe('a broken file does not break the report', () => {
  it('reports a corrupted compiled script and keeps the rest', async () => {
    const garbage = new BytesSource(
      'dist/game/broken.rpyc',
      new TextEncoder().encode('not a script'),
    );
    const { report } = await analyzeFiles([...(await dist('8.5.3')), garbage]);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'RPYC_BAD_HEADER',
        path: 'dist/game/broken.rpyc',
      }),
    ]);
    const overview = report.analyses.overview as OverviewResult;
    expect(overview.scripts).toMatchObject({ compiled: 7, decoded: 6, failed: 1 });
    expect(overview.dialogue.lines).toBe(17);
    const summary = report.analyses.diagnostics as DiagnosticsResult;
    expect(summary).toMatchObject({
      total: 1,
      bySeverity: { error: 1 },
      failedFiles: ['dist/game/broken.rpyc'],
    });
  });

  it('reports a truncated script', async () => {
    const files = await walkDirectory(fixturePath('build', '7.4.11', 'phanes_demo', 'project'));
    const script = files.find((f) => f.path.endsWith('game/script.rpyc'));
    if (!script) throw new Error('missing script');
    const bytes = await readFully(script, 1 << 20);
    const truncated = new BytesSource(script.path, bytes.subarray(0, 600));
    const { report } = await analyzeFiles(
      files.map((f): FileSource => (f === script ? truncated : f)),
    );
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]).toMatchObject({ path: script.path, severity: 'error' });
    expect((report.analyses.overview as OverviewResult).labels).toBe(2); // labels of extra.rpy
  });
});

describe('anti-corruption layer', () => {
  it('turns unknown statements into Unknown nodes and keeps their dialogue', () => {
    const say = node('renpy.ast.Say', { who: 'e', what: 'Hello there', linenumber: 3 });
    const future = node('renpy.ast.FutureStatement', { linenumber: 2, block: new PyList([say]) });
    const report = newAclReport();
    const { statements } = mapStatements([future, 42], 'game/x.rpy', report);
    expect(statements).toEqual([
      {
        kind: 'unknown',
        loc: { file: 'game/x.rpy', line: 2 },
        className: 'renpy.ast.FutureStatement',
        block: [expect.objectContaining({ kind: 'say', who: 'e', what: 'Hello there' })],
      },
    ]);
    expect(report.unknownClasses).toEqual(new Map([['renpy.ast.FutureStatement', 1]]));
    expect(report.invalidStatements).toBe(1);
  });

  it('tolerates missing and mistyped fields', () => {
    const say = node('renpy.ast.Say', { what: 7, interact: 'yes' });
    const menu = node('renpy.ast.Menu', { items: 'nonsense' });
    const { statements } = mapStatements([say, menu], 'game/x.rpy');
    expect(statements[0]).toMatchObject({
      kind: 'say',
      who: null,
      what: '',
      interact: true,
      loc: { line: 0 },
    });
    expect(statements[1]).toMatchObject({ kind: 'menu', items: [] });
  });

  it('cuts hostile nesting', () => {
    let inner = node('renpy.ast.Pass', {});
    for (let i = 0; i < 1000; i++)
      inner = node('renpy.ast.Init', { block: new PyList([inner]), priority: 0 });
    const report = newAclReport();
    mapStatements([inner], 'x', report);
    expect(report.truncated).toBe(true);
  });

  it('reports unknown node classes found in real files', async () => {
    const files = await dist('8.5.3');
    const { report } = await analyzeFiles(files);
    expect(report.diagnostics.filter((d) => d.code === 'AST_UNKNOWN_NODE')).toEqual([]);
  });
});

describe('version heuristics without version files', () => {
  it.each([
    ['6.99.14.3', '≤ 7', 2],
    ['8.3.7', '8.0–8.3', 3],
    ['8.5.3', '≥ 8.4', 3],
  ])("loose scripts of Ren'Py %s give %s", async (sdk, range, python) => {
    const bytes = await readFixture('build', sdk, 'phanes_demo', 'project', 'game', 'script.rpyc');
    const { report } = await analyzeFiles([new BytesSource('script.rpyc', bytes)]);
    const overview = report.analyses.overview as OverviewResult;
    expect(overview.renpy).toMatchObject({
      version: range,
      confidence: 'range',
      source: 'scripts',
      python,
    });
  });
});
