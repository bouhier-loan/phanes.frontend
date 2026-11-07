/*
 * Screen language 2 nodes (renpy/sl2/slast.py: SLScreen, SLDisplayable,
 * SLBlock, SLIf, SLShowIf, SLFor, SLUse, SLCustomUse, SLPython, SLDefault)
 * and the displayables registered for each statement before Ren'Py 8 stored
 * their name (renpy/sl2/sldisplayables.py). Ren'Py is MIT licensed (see NOTICE).
 */
import { PyGlobal, PyObject, type PyValue } from '@phanes/renpy-formats';
import type { Location, ScreenElement } from '../model/ast';
import { codeSource, itemsOf, NodeReader, textOf } from './read';

/** Statement names by displayable, for screens compiled before `name` was stored. */
const STATEMENTS: ReadonlyMap<string, string> = new Map([
  ['renpy.display.layout.Null', 'null'],
  ['renpy.text.text.Text', 'text'],
  ['renpy.display.layout.Grid', 'grid'],
  ['renpy.display.layout.Side', 'side'],
  ['renpy.ui._key', 'key'],
  ['renpy.display.behavior.Timer', 'timer'],
  ['renpy.display.behavior.Input', 'input'],
  ['renpy.display.behavior.Button', 'button'],
  ['renpy.ui._imagebutton', 'imagebutton'],
  ['renpy.ui._textbutton', 'textbutton'],
  ['renpy.ui._label', 'label'],
  ['renpy.sl2.sldisplayables.sl2bar', 'bar'],
  ['renpy.sl2.sldisplayables.sl2vbar', 'vbar'],
  ['renpy.sl2.sldisplayables.sl2viewport', 'viewport'],
  ['renpy.sl2.sldisplayables.sl2vpgrid', 'vpgrid'],
  ['renpy.sl2.sldisplayables.sl2add', 'add'],
  ['renpy.ui._imagemap', 'imagemap'],
  ['renpy.ui._hotspot', 'hotspot'],
  ['renpy.ui._hotbar', 'hotbar'],
  ['renpy.display.motion.Transform', 'transform'],
  ['renpy.display.dragdrop.Drag', 'drag'],
  ['renpy.display.dragdrop.DragGroup', 'draggroup'],
  ['renpy.display.behavior.MouseArea', 'mousearea'],
  ['renpy.display.behavior.OnEvent', 'on'],
]);
/** Displayables shared by several statements, told apart by their base style. */
const BY_STYLE: ReadonlyMap<string, readonly string[]> = new Map([
  ['renpy.display.layout.MultiBox', ['hbox', 'vbox', 'fixed']],
  ['renpy.display.layout.Window', ['frame', 'window']],
]);

const SL = 'renpy.sl2.slast.';
const MAX_DEPTH = 200;

function statementName(r: NodeReader): string {
  const name = r.text('name');
  if (name) return name;
  const displayable = r.raw('displayable');
  const qualified = displayable instanceof PyGlobal ? displayable.qualifiedName : null;
  if (qualified === null) return '';
  const style = r.text('style');
  const shared = BY_STYLE.get(qualified);
  if (shared && style !== null && shared.includes(style)) return style;
  return STATEMENTS.get(qualified) ?? qualified.slice(qualified.lastIndexOf('.') + 1).toLowerCase();
}

function keywordsOf(r: NodeReader): [string, string][] {
  const out: [string, string][] = [];
  for (const pair of r.items('keyword')) {
    const [name, value] = itemsOf(pair);
    const key = textOf(name);
    const code = textOf(value);
    if (key !== null && code !== null) out.push([key, code]);
  }
  return out;
}

function sources(values: readonly PyValue[]): string[] {
  return values.map(textOf).filter((s): s is string => s !== null);
}

/**
 * The statements of a screen (an SLScreen), flattened in source order.
 * Never throws: unknown nodes are skipped, their children still visited.
 */
export function screenElements(screen: PyValue | undefined, defaultFile: string): ScreenElement[] {
  const out: ScreenElement[] = [];
  const seen = new Set<PyObject>();
  const visit = (value: PyValue | undefined, depth: number) => {
    if (!(value instanceof PyObject) || seen.has(value) || depth > MAX_DEPTH) return;
    seen.add(value);
    const r = new NodeReader(value);
    const [file, line] = itemsOf(r.raw('location'));
    const loc: Location = {
      file: textOf(file) ?? defaultFile,
      line: typeof line === 'number' ? line : 0,
    };
    const children = () => {
      for (const child of r.items('children')) visit(child, depth + 1);
    };
    const kind = value.className.startsWith(SL) ? value.className.slice(SL.length) : '';
    switch (kind) {
      case 'SLScreen':
      case 'SLBlock':
      case 'SLDisplayable': {
        const keywords = keywordsOf(r);
        const positional = sources(r.items('positional'));
        const name = kind === 'SLScreen' ? 'screen' : kind === 'SLBlock' ? '' : statementName(r);
        if (kind === 'SLDisplayable' || keywords.length > 0)
          out.push({ kind: 'displayable', loc, name, positional, keywords });
        children();
        break;
      }
      case 'SLIf':
      case 'SLShowIf':
        for (const entry of r.items('entries')) {
          const [condition, block] = itemsOf(entry);
          const code = textOf(condition);
          if (code !== null) out.push({ kind: 'condition', loc, code });
          visit(block, depth + 1);
        }
        break;
      case 'SLFor':
        out.push({
          kind: 'for',
          loc,
          variable: r.text('variable') ?? '',
          code: r.text('expression') ?? '',
        });
        children();
        break;
      case 'SLUse':
      case 'SLCustomUse': {
        const args = r.raw('args');
        const argSources =
          args instanceof PyObject
            ? sources(new NodeReader(args).items('arguments').map((a) => itemsOf(a)[1] ?? null))
            : sources(r.items('positional'));
        out.push({ kind: 'use', loc, target: r.text('target') ?? '', args: argSources });
        visit(r.raw('block'), depth + 1);
        break;
      }
      case 'SLPython':
        out.push({ kind: 'python', loc, code: codeSource(r.raw('code')) ?? '' });
        break;
      case 'SLDefault':
        out.push({
          kind: 'default',
          loc,
          variable: r.text('variable') ?? '',
          code: r.text('expression') ?? '',
        });
        break;
      default:
        children();
        break;
    }
  };
  visit(screen, 0);
  return out;
}
