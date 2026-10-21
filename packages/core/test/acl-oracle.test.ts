import { readFile } from 'node:fs/promises';
import { fixturePath, walkDirectory } from '@phanes/testkit';
import { describe, expect, it } from 'vitest';
import { buildVfs, loadScripts, type Stmt, walkStatements, type ScriptFile } from '../src';

/**
 * Compares the domain model with tools/oracle/semantic.py, which projects
 * unrpyc's view of the same scripts. Same projection on both sides.
 */
function projection(stmt: Stmt): unknown[] {
  const line = stmt.loc.line;
  switch (stmt.kind) {
    case 'say':
      return ['say', line, stmt.who, stmt.what];
    case 'label':
      return ['label', line, stmt.name];
    case 'menu':
      return ['menu', line, stmt.items.map((i) => [i.text, i.condition, i.block !== null])];
    case 'jump':
    case 'call':
      return [stmt.kind, line, stmt.target, stmt.expression];
    case 'return':
      return ['return', line];
    case 'if':
      return ['if', line, stmt.branches.map((b) => b.condition)];
    case 'init':
      return ['init', line, stmt.priority];
    case 'define':
    case 'default':
      return [stmt.kind, line, stmt.store, stmt.name, stmt.value];
    case 'python':
      return ['python', line, stmt.code];
    case 'scene':
      return ['scene', line, stmt.image?.name ?? []];
    case 'show':
    case 'hide':
      return [stmt.kind, line, stmt.image.name];
    case 'image':
      return ['image', line, stmt.name, stmt.value];
    case 'user':
      return ['user', line, stmt.line];
    case 'translate':
      return ['translate', line, stmt.identifier, stmt.language];
    case 'translate-string':
      return ['translate-string', line, stmt.language, stmt.old, stmt.new];
    case 'screen':
      return ['screen', line, stmt.name];
    default:
      return [stmt.kind, line];
  }
}

export function project(script: ScriptFile): unknown[][] {
  const out: unknown[][] = [];
  walkStatements([script], (stmt) => out.push(projection(stmt)));
  return out;
}

export const SDKS = ['6.99.14.3', '7.4.11', '8.3.7', '8.5.3'] as const;

export async function projectScripts(sdk: string): Promise<ScriptFile[]> {
  const { vfs } = await buildVfs(
    await walkDirectory(fixturePath('build', sdk, 'phanes_demo', 'project')),
  );
  const { scripts, diagnostics } = await loadScripts(vfs);
  expect(diagnostics).toEqual([]);
  return scripts;
}

for (const sdk of SDKS) {
  describe(`domain model of Ren'Py ${sdk} scripts matches unrpyc`, () => {
    it('for every script', async () => {
      const scripts = await projectScripts(sdk);
      expect(scripts.map((s) => s.gamePath)).toEqual([
        'characters.rpyc',
        'options.rpyc',
        'script.rpyc',
        'story/extra.rpyc',
        'tl/french/characters.rpyc',
        'tl/french/script.rpyc',
      ]);
      for (const script of scripts) {
        const expected = JSON.parse(
          await readFile(
            fixturePath(
              'expected',
              sdk,
              'phanes_demo',
              'semantic',
              'game',
              `${script.gamePath}.json`,
            ),
            'utf8',
          ),
        ) as unknown;
        expect(project(script), script.gamePath).toEqual(expected);
      }
    });
  });
}

/**
 * Ren'Py ends every file with an implicit `return`; its line number is the
 * last statement's line up to 7.x and the end of the file in 8.x.
 */
function withoutImplicitReturnLine(statements: unknown[][]): unknown[][] {
  const last = statements[statements.length - 1];
  return last?.[0] === 'return' ? [...statements.slice(0, -1), ['return', 'eof']] : statements;
}

describe('domain model across versions', () => {
  it("is the same for every Ren'Py version", async () => {
    const normalized = async (sdk: string) =>
      (await projectScripts(sdk)).map((s) => withoutImplicitReturnLine(project(s)));
    const reference = await normalized('8.5.3');
    for (const sdk of SDKS) expect(await normalized(sdk), sdk).toEqual(reference);
  });
});
