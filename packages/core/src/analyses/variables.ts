import {
  type LayeredLayer,
  type Location,
  type ScreenElement,
  screenElementCode,
} from '../model/ast';
import type { Project } from '../model/project';
import { parseCall } from '../python-lite/call';
import { stringLiteralValue } from '../python-lite/literal';
import {
  actionWrites,
  interpolatedNames,
  pythonNames,
  stringConstants,
} from '../python-lite/names';
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

/** Store variables that Ren'Py itself reads (renpy/*.py, renpy/common: `store.<name>`). */
const ENGINE_VARIABLES = new Set([
  'menu',
  'narrator',
  'adv',
  'nvl',
  'save_name',
  'main_menu',
  'mouse_visible',
  'suppress_overlay',
  'predict_menu',
]);

function storeQualified(store: string, name: string): string {
  return store === 'store' ? name : `${store.replace(/^store\./, '')}.${name}`;
}

function isEngine(name: string): boolean {
  const head = name.split('.')[0] ?? name;
  return head.startsWith('_') || ENGINE_NAMESPACES.includes(head) || ENGINE_VARIABLES.has(name);
}

function lineOf(code: string, index: number): string {
  return (code.split('\n')[index] ?? code).trim();
}

/** A layer of a layered image as written, e.g. `attribute happy default` or `if x`. */
function layerCode(layer: LayeredLayer): string {
  switch (layer.kind) {
    case 'always':
      return `always ${layer.image ?? ''}`.trim();
    case 'attribute':
      return `attribute ${layer.name}${layer.default ? ' default' : ''} ${layer.image ?? ''}`.trim();
    case 'auto':
      return `group ${layer.group ?? ''} auto`;
    case 'condition':
      return layer.condition === null ? 'else' : `if ${layer.condition}`;
  }
}

/** A screen element as written, e.g. `textbutton "Go" action SetVariable("x", 1)`. */
function shownElement(element: ScreenElement): string {
  switch (element.kind) {
    case 'displayable':
      return [
        element.name,
        ...element.positional,
        ...element.keywords.map(([key, value]) => `${key} ${value}`),
      ]
        .filter(Boolean)
        .join(' ');
    case 'condition':
      return `if ${element.code}:`;
    case 'for':
      return `for ${element.variable} in ${element.code}:`;
    case 'use':
      return `use ${element.target}${element.args.length > 0 ? `(${element.args.join(', ')})` : ''}`;
    case 'python':
      return `$ ${element.code.trim()}`;
    case 'default':
      return `default ${element.variable} = ${element.code}`;
  }
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
    // `store.x` is the store variable x.
    const parts = chain.replace(/^store\./, '').split('.');
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
    loc: Location,
    label: string | null,
    context: VariableContext,
    shown: string,
    globalWrites = true,
  ) => {
    const { reads, writes } = pythonNames(code);
    const block = code.includes('\n');
    const at = (line: number) => ({
      file: loc.file,
      line: loc.line + line + (block ? 1 : 0),
    });
    for (const w of writes) {
      // In a screen, a plain name is a screen variable; only store.x or persistent.x reach the store.
      if (!globalWrites && !w.name.includes('.')) continue;
      site('writes', w.name, {
        loc: at(w.line),
        label,
        context,
        code: block ? lineOf(code, w.line) : shown,
      });
    }
    for (const name of actionWrites(code))
      site('writes', name, { loc, label, context, code: shown });
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
    loc: Location,
    label: string | null,
    context: VariableContext,
    shown: string,
  ) => {
    for (const r of pythonNames(code).reads)
      site('reads', r.name, { loc, label, context, code: shown });
    for (const name of actionWrites(code))
      site('writes', name, { loc, label, context, code: shown });
  };
  const text = (
    value: string,
    loc: Location,
    label: string | null,
    context: VariableContext,
    shown: string,
  ) => {
    for (const name of interpolatedNames(value))
      site('reads', name, { loc, label, context, code: shown });
  };

  walkStatements(project.scripts, (stmt, ctx) => {
    if (ctx.language !== null) return;
    const label = ctx.label;
    switch (stmt.kind) {
      case 'python':
        python(stmt.code, stmt.loc, label, 'python', `$ ${stmt.code.trim()}`);
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
          if (nameArg) text(nameArg, stmt.loc, label, 'character', shown);
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
            stmt.loc,
            label,
            'condition',
            `${i === 0 ? 'if' : 'elif'} ${b.condition}:`,
          );
        }
        break;
      case 'while':
        expression(stmt.condition, stmt.loc, label, 'condition', `while ${stmt.condition}:`);
        break;
      case 'menu':
        for (const item of stmt.items) {
          if (item.condition.trim() !== 'True')
            expression(
              item.condition,
              stmt.loc,
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
            stmt.loc,
            label,
            'expression',
            `${stmt.kind} expression ${stmt.target}`,
          );
        break;
      case 'say': {
        const shown = `${stmt.who ? `${stmt.who} ` : ''}${JSON.stringify(stmt.what)}`;
        text(stmt.what, stmt.loc, label, 'say', shown);
        break;
      }
      case 'screen':
        if (stmt.elements.length === 0) {
          // Older screens: their strings are the sources of their Python expressions.
          for (const source of stmt.strings) {
            const shown = `screen ${stmt.name}: ${source}`;
            expression(source, stmt.loc, null, 'screen', shown);
            for (const value of stringConstants(source))
              text(value, stmt.loc, null, 'screen', shown);
          }
          break;
        }
        for (const element of stmt.elements) {
          const shown = `screen ${stmt.name}: ${shownElement(element)}`;
          if (element.kind === 'python') {
            python(element.code, element.loc, null, 'screen', shown, false);
            continue;
          }
          for (const source of screenElementCode(element)) {
            expression(source, element.loc, null, 'screen', shown);
            for (const value of stringConstants(source))
              text(value, element.loc, null, 'screen', shown);
          }
        }
        break;
      case 'with':
        if (stmt.expression)
          expression(stmt.expression, stmt.loc, label, 'expression', `with ${stmt.expression}`);
        break;
      case 'scene':
      case 'show': {
        const image = stmt.image;
        if (!image) break;
        const shown = `${stmt.kind} ${image.expression ? `expression ${image.expression}` : image.name.join(' ')}${image.atList.length ? ` at ${image.atList.join(', ')}` : ''}`;
        if (image.expression) expression(image.expression, stmt.loc, label, 'image', shown);
        for (const at of image.atList) expression(at, stmt.loc, label, 'image', shown);
        break;
      }
      case 'layeredimage':
        for (const layer of stmt.layers) {
          const shown = `layeredimage ${stmt.name}: ${layerCode(layer)}`;
          if (layer.kind === 'condition' && layer.condition !== null)
            expression(layer.condition, stmt.loc, label, 'image', shown);
          if (
            layer.kind !== 'auto' &&
            layer.image !== null &&
            stringLiteralValue(layer.image) === null
          )
            expression(layer.image, stmt.loc, label, 'image', shown);
        }
        break;
      case 'image':
        if (stmt.value)
          expression(
            stmt.value,
            stmt.loc,
            label,
            'image',
            `image ${stmt.name.join(' ')} = ${stmt.value}`,
          );
        break;
      case 'user': {
        const line = stmt.line.trim();
        const m = /^(?:play|queue)\s+\w+\s+(.+)$/.exec(line);
        const sound = m?.[1]?.split(/\s+(?:fadein|fadeout|loop|noloop|if_changed|volume)\b/)[0];
        if (m) {
          if (sound && stringLiteralValue(sound) === null) {
            for (const r of pythonNames(sound).reads) {
              const chain = lookup(`audio.${r.name}`) ? `audio.${r.name}` : r.name;
              site('reads', chain, { loc: stmt.loc, label, context: 'audio', code: stmt.line });
            }
          }
        } else if (line.startsWith(stmt.name)) {
          // Other statements (`call screen x(a=b)`, `pause d`): the arguments after the name.
          expression(line.slice(stmt.name.length), stmt.loc, label, 'expression', line);
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
