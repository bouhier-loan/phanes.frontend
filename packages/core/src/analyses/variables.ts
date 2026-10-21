import type { Location, Stmt } from '../model/ast';
import type { Project } from '../model/project';
import { parseCall } from '../python-lite/call';
import { stringLiteralValue } from '../python-lite/literal';
import { interpolatedNames, pythonNames, stringConstants } from '../python-lite/names';
import type { Analysis } from './analysis';
import { dialogueIndex } from './dialogue';
import { walkStatements } from './walk';

export type VariableContext =
  | 'python'
  | 'define'
  | 'default'
  | 'condition'
  | 'menu'
  | 'say'
  | 'screen'
  | 'character'
  | 'expression'
  | 'audio'
  | 'image';

export type VariableSite = {
  loc: Location;
  label: string | null;
  /** The statement or line where the variable appears. */
  code: string;
  context: VariableContext;
};

export type VariableEntry = {
  /** Store-qualified name, e.g. "affection" or "persistent.endings". */
  name: string;
  kind: 'default' | 'define';
  /** Initial value, as written. */
  value: string;
  loc: Location;
  /** Defined with a Character factory: detailed in the characters section. */
  character: boolean;
  /** In a namespace Ren'Py reads itself (config, gui, build…): never "unused". */
  engine: boolean;
  writes: VariableSite[];
  reads: VariableSite[];
};

export type VariablesResult = {
  variables: VariableEntry[];
  totals: {
    variables: number;
    default: number;
    define: number;
    characters: number;
    engine: number;
    /** Neither a character nor an engine setting, and never read. */
    neverRead: number;
    /** `default` variables that nothing modifies. */
    neverWritten: number;
  };
};

const ENGINE_NAMESPACES = [
  'config',
  'build',
  'gui',
  'preferences',
  'style',
  'renpy',
  'layout',
  'achievement',
];

function storeQualified(store: string, name: string): string {
  return store === 'store' ? name : `${store.replace(/^store\./, '')}.${name}`;
}

function isEngine(name: string): boolean {
  const head = name.split('.')[0] ?? name;
  return head.startsWith('_') || ENGINE_NAMESPACES.includes(head);
}

function lineOf(code: string, index: number): string {
  return (code.split('\n')[index] ?? code).trim();
}

/**
 * Variables declared with `default` and `define`, and where the script
 * modifies and reads them. Found lexically in Python code and Ren'Py
 * statements, without executing anything (docs/analyses.md).
 */
export function variables(project: Project): VariablesResult {
  const index = dialogueIndex(project);
  const declared = new Map<string, VariableEntry>();
  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null) return;
    if (stmt.kind !== 'define' && stmt.kind !== 'default') return;
    const name = storeQualified(stmt.store, stmt.name);
    if (stmt.kind === 'define' && (stmt.operator !== '=' || stmt.index !== null)) return;
    if (declared.has(name)) return;
    declared.set(name, {
      name,
      kind: stmt.kind,
      value: stmt.value,
      loc: stmt.loc,
      character: index.definitions.has(name),
      engine: isEngine(name),
      writes: [],
      reads: [],
    });
  });

  /** The declared variable a dotted chain refers to: its longest declared prefix. */
  const lookup = (chain: string): VariableEntry | undefined => {
    const parts = chain.split('.');
    for (let n = parts.length; n > 0; n--) {
      const hit = declared.get(parts.slice(0, n).join('.'));
      if (hit) return hit;
    }
    return undefined;
  };
  const site = (
    list: 'reads' | 'writes',
    chain: string,
    s: Omit<VariableSite, 'code'> & { code: string },
  ) => {
    const entry = lookup(chain);
    if (!entry) return;
    const sites = entry[list];
    const last = sites[sites.length - 1];
    if (last?.loc.file === s.loc.file && last.loc.line === s.loc.line && last.code === s.code)
      return;
    sites.push(s);
  };
  const python = (
    code: string,
    stmt: Stmt,
    label: string | null,
    context: VariableContext,
    shown: string,
  ) => {
    const { reads, writes } = pythonNames(code);
    const block = code.includes('\n');
    const at = (line: number) => ({
      file: stmt.loc.file,
      line: stmt.loc.line + line + (block ? 1 : 0),
    });
    for (const w of writes)
      site('writes', w.name, {
        loc: at(w.line),
        label,
        context,
        code: block ? lineOf(code, w.line) : shown,
      });
    for (const r of reads)
      site('reads', r.name, {
        loc: at(r.line),
        label,
        context,
        code: block ? lineOf(code, r.line) : shown,
      });
  };
  const expression = (
    code: string,
    stmt: Stmt,
    label: string | null,
    context: VariableContext,
    shown: string,
  ) => {
    for (const r of pythonNames(code).reads)
      site('reads', r.name, { loc: stmt.loc, label, context, code: shown });
  };
  const text = (
    value: string,
    stmt: Stmt,
    label: string | null,
    context: VariableContext,
    shown: string,
  ) => {
    for (const name of interpolatedNames(value))
      site('reads', name, { loc: stmt.loc, label, context, code: shown });
  };

  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null) return;
    const label = ctx.label;
    switch (stmt.kind) {
      case 'python':
        python(stmt.code, stmt, label, 'python', `$ ${stmt.code.trim()}`);
        break;
      case 'define':
      case 'default': {
        const name = storeQualified(stmt.store, stmt.name);
        const shown =
          stmt.kind === 'define'
            ? `define ${name}${stmt.index ? `[${stmt.index}]` : ''} ${stmt.operator} ${stmt.value}`
            : `default ${name} = ${stmt.value}`;
        // Any define or default of the name but its declaration modifies it.
        if (declared.get(name)?.loc !== stmt.loc)
          site('writes', name, { loc: stmt.loc, label, context: stmt.kind, code: shown });
        const call = parseCall(stmt.value);
        const factory = call?.callee.split('.').pop() ?? '';
        if (call && factory === 'DynamicCharacter') {
          const arg = call.positional[0]?.string;
          if (arg) site('reads', arg, { loc: stmt.loc, label, context: 'character', code: shown });
        } else if (call && index.definitions.has(name)) {
          const nameArg = call.positional[0]?.string ?? call.keywords.get('name')?.string;
          if (nameArg) text(nameArg, stmt, label, 'character', shown);
        }
        for (const r of pythonNames(stmt.value).reads)
          if (r.name !== name)
            site('reads', r.name, { loc: stmt.loc, label, context: stmt.kind, code: shown });
        break;
      }
      case 'if':
        for (const [i, b] of stmt.branches.entries()) {
          if (b.condition.trim() === 'True' && i > 0) continue;
          expression(
            b.condition,
            stmt,
            label,
            'condition',
            `${i === 0 ? 'if' : 'elif'} ${b.condition}:`,
          );
        }
        break;
      case 'while':
        expression(stmt.condition, stmt, label, 'condition', `while ${stmt.condition}:`);
        break;
      case 'menu':
        for (const item of stmt.items) {
          if (item.condition.trim() !== 'True')
            expression(
              item.condition,
              stmt,
              label,
              'menu',
              `${JSON.stringify(item.text)} if ${item.condition}`,
            );
        }
        if (stmt.setVariable)
          for (const w of pythonNames(stmt.setVariable).reads)
            site('writes', w.name, {
              loc: stmt.loc,
              label,
              context: 'menu',
              code: `menu (set=${stmt.setVariable})`,
            });
        break;
      case 'jump':
      case 'call':
        if (stmt.expression)
          expression(
            stmt.target,
            stmt,
            label,
            'expression',
            `${stmt.kind} expression ${stmt.target}`,
          );
        break;
      case 'say': {
        const shown = `${stmt.who ? `${stmt.who} ` : ''}${JSON.stringify(stmt.what)}`;
        text(stmt.what, stmt, label, 'say', shown);
        break;
      }
      case 'screen':
        // Its strings are the sources of the screen's Python expressions.
        for (const source of stmt.strings) {
          const shown = `screen ${stmt.name}: ${source}`;
          expression(source, stmt, null, 'screen', shown);
          for (const value of stringConstants(source)) text(value, stmt, null, 'screen', shown);
        }
        break;
      case 'with':
        if (stmt.expression)
          expression(stmt.expression, stmt, label, 'expression', `with ${stmt.expression}`);
        break;
      case 'scene':
      case 'show': {
        const image = stmt.image;
        if (!image) break;
        const shown = `${stmt.kind} ${image.expression ? `expression ${image.expression}` : image.name.join(' ')}${image.atList.length ? ` at ${image.atList.join(', ')}` : ''}`;
        if (image.expression) expression(image.expression, stmt, label, 'image', shown);
        for (const at of image.atList) expression(at, stmt, label, 'image', shown);
        break;
      }
      case 'image':
        if (stmt.value)
          expression(
            stmt.value,
            stmt,
            label,
            'image',
            `image ${stmt.name.join(' ')} = ${stmt.value}`,
          );
        break;
      case 'user': {
        const m = /^(?:play|queue)\s+\w+\s+(.+)$/.exec(stmt.line.trim());
        const sound = m?.[1]?.split(/\s+(?:fadein|fadeout|loop|noloop|if_changed|volume)\b/)[0];
        if (sound && stringLiteralValue(sound) === null) {
          for (const r of pythonNames(sound).reads) {
            const chain = lookup(`audio.${r.name}`) ? `audio.${r.name}` : r.name;
            site('reads', chain, { loc: stmt.loc, label, context: 'audio', code: stmt.line });
          }
        }
        break;
      }
      default:
        break;
    }
  });

  const list = [...declared.values()].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const plain = list.filter((v) => !v.character && !v.engine);
  return {
    variables: list,
    totals: {
      variables: list.length,
      default: list.filter((v) => v.kind === 'default').length,
      define: list.filter((v) => v.kind === 'define').length,
      characters: list.filter((v) => v.character).length,
      engine: list.filter((v) => v.engine).length,
      neverRead: plain.filter((v) => v.reads.length === 0).length,
      neverWritten: list.filter(
        (v) => v.kind === 'default' && !v.character && v.writes.length === 0,
      ).length,
    },
  };
}

export const variablesAnalysis: Analysis<VariablesResult> = { id: 'variables', run: variables };
