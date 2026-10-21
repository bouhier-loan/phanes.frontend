import {
  PyBytes,
  PyDict,
  PyList,
  PyObject,
  PySet,
  PyTuple,
  type PyValue,
} from '@phanes/renpy-formats';
import type { ImageSpec, Location, MenuItem, Stmt } from '../model/ast';
import { itemsOf, NodeReader, textOf } from './read';

/** Nesting deeper than this is treated as hostile and cut. */
const MAX_DEPTH = 200;

export interface AclReport {
  /** Unknown node classes and how often they were seen. */
  readonly unknownClasses: Map<string, number>;
  /** Values that should have been statements but were not objects. */
  invalidStatements: number;
  truncated: boolean;
}

export function newAclReport(): AclReport {
  return { unknownClasses: new Map(), invalidStatements: 0, truncated: false };
}

interface Ctx {
  readonly report: AclReport;
  readonly defaultFile: string;
}

function locationOf(r: NodeReader, ctx: Ctx): Location {
  return { file: r.text('filename') ?? ctx.defaultFile, line: r.int('linenumber') ?? 0 };
}

/**
 * Normalizes an imspec tuple: (name, at_list, layer) in old versions,
 * (name, expression, tag, at_list, layer, zorder[, behind]) since 6.x.
 */
function imageSpec(value: PyValue | undefined): ImageSpec | null {
  const items = value instanceof PyTuple || value instanceof PyList ? value.items : null;
  if (!items || items.length === 0) return null;
  const name = itemsOf(items[0])
    .map(textOf)
    .filter((s): s is string => s !== null);
  const strings = (v: PyValue | undefined) =>
    itemsOf(v)
      .map(textOf)
      .filter((s): s is string => s !== null);
  if (items.length === 3) {
    return {
      name,
      expression: null,
      tag: null,
      atList: strings(items[1]),
      layer: textOf(items[2]),
    };
  }
  return {
    name,
    expression: textOf(items[1]),
    tag: textOf(items[2]),
    atList: strings(items[3]),
    layer: textOf(items[4]),
  };
}

/** Collects string constants from a screen's AST, without following cycles. */
function collectStrings(root: PyValue, limit = 2000): string[] {
  const seen = new Set<object>();
  const out = new Set<string>();
  const stack: PyValue[] = [root];
  while (stack.length > 0 && out.size < limit) {
    const value = stack.pop() ?? null;
    if (typeof value === 'string') {
      out.add(value);
      continue;
    }
    if (value === null || typeof value !== 'object' || value instanceof PyBytes || seen.has(value))
      continue;
    seen.add(value);
    if (value instanceof PyTuple || value instanceof PyList) stack.push(...value.items);
    else if (value instanceof PySet) stack.push(...value.values());
    else if (value instanceof PyDict) for (const [k, v] of value.items()) stack.push(k, v);
    else if (value instanceof PyObject) {
      stack.push(...value.args, ...value.attrs.values());
      if (value.state !== undefined) stack.push(value.state);
      if (value.listItems) stack.push(...value.listItems);
      if (value.dictItems) for (const [k, v] of value.dictItems.items()) stack.push(k, v);
    }
  }
  return [...out];
}

function shortName(className: string): string | null {
  return className.startsWith('renpy.ast.') ? className.slice('renpy.ast.'.length) : null;
}

function mapNode(node: PyObject, ctx: Ctx, depth: number): Stmt {
  const r = new NodeReader(node);
  const loc = locationOf(r, ctx);
  const block = (name: string) => mapBlock(r.items(name), ctx, depth + 1);
  switch (shortName(node.className)) {
    case 'Say':
    case 'TranslateSay':
      return {
        kind: 'say',
        loc,
        who: r.text('who'),
        what: r.text('what') ?? '',
        attributes: r.strings('attributes'),
        interact: r.bool('interact', true),
        identifier: r.text('identifier'),
        language: r.text('language'),
      };
    case 'Label':
      return {
        kind: 'label',
        loc,
        name: r.text('name', '_name') ?? '',
        block: block('block'),
        hasParameters: (r.raw('parameters') ?? null) !== null,
        hidden: r.bool('hide', false),
      };
    case 'Menu': {
      const items: MenuItem[] = r.items('items').map((item) => {
        const [label, condition, body] = itemsOf(item);
        return {
          text: textOf(label) ?? '',
          condition: textOf(condition) ?? 'True',
          block:
            body === null || body === undefined ? null : mapBlock(itemsOf(body), ctx, depth + 1),
        };
      });
      return { kind: 'menu', loc, items, setVariable: r.text('set') };
    }
    case 'Jump':
      return {
        kind: 'jump',
        loc,
        target: r.text('target') ?? '',
        expression: r.bool('expression', false),
      };
    case 'Call':
      return {
        kind: 'call',
        loc,
        target: r.text('label') ?? '',
        expression: r.bool('expression', false),
        hasArguments: (r.raw('arguments') ?? null) !== null,
      };
    case 'Return':
      return { kind: 'return', loc, expression: r.text('expression') };
    case 'If':
      return {
        kind: 'if',
        loc,
        branches: r.items('entries').map((entry) => {
          const [condition, body] = itemsOf(entry);
          return {
            condition: textOf(condition) ?? 'True',
            block: mapBlock(itemsOf(body), ctx, depth + 1),
          };
        }),
      };
    case 'While':
      return { kind: 'while', loc, condition: r.text('condition') ?? '', block: block('block') };
    case 'Init':
      return { kind: 'init', loc, priority: r.int('priority') ?? 0, block: block('block') };
    case 'Define':
      return {
        kind: 'define',
        loc,
        store: r.text('store') ?? 'store',
        name: r.text('varname') ?? '',
        operator: r.text('operator') ?? '=',
        index: r.code('index'),
        value: r.code('code') ?? '',
      };
    case 'Default':
      return {
        kind: 'default',
        loc,
        store: r.text('store') ?? 'store',
        name: r.text('varname') ?? '',
        value: r.code('code') ?? '',
      };
    case 'Python':
    case 'EarlyPython':
      return {
        kind: 'python',
        loc,
        code: r.code('code') ?? '',
        early: node.className.endsWith('EarlyPython'),
        store: r.text('store') ?? 'store',
      };
    case 'Scene':
      return { kind: 'scene', loc, image: imageSpec(r.raw('imspec')), layer: r.text('layer') };
    case 'Show': {
      const image = imageSpec(r.raw('imspec'));
      if (image) return { kind: 'show', loc, image };
      break;
    }
    case 'Hide': {
      const image = imageSpec(r.raw('imspec'));
      if (image) return { kind: 'hide', loc, image };
      break;
    }
    case 'With':
      return { kind: 'with', loc, expression: r.text('expr') };
    case 'Image':
      return {
        kind: 'image',
        loc,
        name: r.strings('imgname'),
        value: r.code('code'),
        hasAtl: (r.raw('atl') ?? null) !== null,
      };
    case 'Transform':
      return { kind: 'transform', loc, name: r.text('varname') ?? '' };
    case 'UserStatement': {
      const line = r.text('line') ?? '';
      const parsed = itemsOf(r.raw('parsed'));
      const words = itemsOf(parsed[0])
        .map(textOf)
        .filter((s): s is string => s !== null);
      return {
        kind: 'user',
        loc,
        line,
        name: words.length > 0 ? words.join(' ') : (line.split(/\s+/)[0] ?? ''),
      };
    }
    case 'Translate':
      return {
        kind: 'translate',
        loc,
        identifier: r.text('identifier') ?? '',
        language: r.text('language'),
        block: block('block'),
      };
    case 'TranslateString':
      return {
        kind: 'translate-string',
        loc,
        language: r.text('language') ?? '',
        old: r.text('old') ?? '',
        new: r.text('new') ?? '',
      };
    case 'TranslateBlock':
    case 'TranslateEarlyBlock':
    case 'TranslatePython':
      return { kind: 'translate-block', loc, language: r.text('language'), block: block('block') };
    case 'EndTranslate':
      return { kind: 'end-translate', loc };
    case 'Pass':
      return { kind: 'pass', loc };
    case 'Screen': {
      const screen = r.raw('screen');
      const name = screen instanceof PyObject ? new NodeReader(screen).text('name') : null;
      return { kind: 'screen', loc, name: name ?? '', strings: collectStrings(screen ?? null) };
    }
    case 'Style':
      return { kind: 'style', loc, name: r.text('style_name') ?? '' };
    default:
      break;
  }
  const count = ctx.report.unknownClasses.get(node.className) ?? 0;
  ctx.report.unknownClasses.set(node.className, count + 1);
  return { kind: 'unknown', loc, className: node.className, block: block('block') };
}

function mapBlock(items: readonly PyValue[], ctx: Ctx, depth: number): Stmt[] {
  if (depth > MAX_DEPTH) {
    ctx.report.truncated = true;
    return [];
  }
  const out: Stmt[] = [];
  for (const item of items) {
    if (item instanceof PyObject) out.push(mapNode(item, ctx, depth));
    else ctx.report.invalidStatements++;
  }
  return out;
}

/**
 * Converts the unpickled top-level statements of a script into the domain
 * model. Never throws on unexpected shapes: unknown nodes become `unknown`
 * statements and are counted in `report`.
 */
export function mapStatements(
  stmts: readonly PyValue[],
  defaultFile: string,
  report: AclReport = newAclReport(),
): { statements: Stmt[]; report: AclReport } {
  const statements = mapBlock(stmts, { report, defaultFile }, 0);
  return { statements, report };
}
