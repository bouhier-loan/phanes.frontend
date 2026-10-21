import {
  decodeUtf8,
  isPyInt,
  PyBytes,
  PyDict,
  PyList,
  PyObject,
  PyTuple,
  type PyValue,
} from '@phanes/renpy-formats';

const PYEXPR_CLASSES = new Set(['renpy.ast.PyExpr', 'renpy.astsupport.PyExpr']);
const PYCODE_CLASSES = new Set(['renpy.ast.PyCode', 'renpy.astsupport.PyCode']);

/**
 * Text of a value that Ren'Py stores as a string: str, PyExpr (a str
 * subclass), Python 2 bytes, or the source of a PyCode.
 */
export function textOf(value: PyValue | undefined): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof PyBytes) return decodeUtf8(value.data, 'surrogateescape');
  if (value instanceof PyObject) {
    if (PYEXPR_CLASSES.has(value.className)) return textOf(value.args[0]);
    if (PYCODE_CLASSES.has(value.className)) return codeSource(value);
    const first = value.args[0];
    if (typeof first === 'string') return first; // other str subclasses
  }
  return null;
}

/** Source text of a PyCode: its state is (1, source, location, mode, ...). */
export function codeSource(value: PyValue | undefined): string | null {
  if (!(value instanceof PyObject)) return textOf(value);
  const state = value.state;
  if (state instanceof PyTuple && state.items.length >= 2) return textOf(state.items[1]);
  return textOf(value.attrs.get('source'));
}

export function itemsOf(value: PyValue | undefined): readonly PyValue[] {
  if (value instanceof PyList || value instanceof PyTuple) return value.items;
  if (value instanceof PyObject && value.listItems) return value.listItems;
  return [];
}

/** Typed access to the attributes of an AST node, tolerant to version differences. */
export class NodeReader {
  constructor(readonly node: PyObject) {}

  has(name: string): boolean {
    return this.node.attrs.has(name);
  }

  raw(...names: string[]): PyValue | undefined {
    for (const name of names) {
      const value = this.node.attrs.get(name);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  text(...names: string[]): string | null {
    for (const name of names) {
      const text = textOf(this.node.attrs.get(name));
      if (text !== null) return text;
    }
    return null;
  }

  code(name: string): string | null {
    return codeSource(this.node.attrs.get(name));
  }

  int(name: string): number | null {
    const value = this.node.attrs.get(name);
    if (typeof value === 'boolean') return value ? 1 : 0;
    return isPyInt(value) ? Number(value) : null;
  }

  bool(name: string, fallback: boolean): boolean {
    const value = this.node.attrs.get(name);
    if (typeof value === 'boolean') return value;
    if (isPyInt(value)) return Number(value) !== 0;
    return fallback;
  }

  items(name: string): readonly PyValue[] {
    return itemsOf(this.node.attrs.get(name));
  }

  strings(name: string): string[] {
    return this.items(name)
      .map(textOf)
      .filter((s): s is string => s !== null);
  }

  dict(name: string): PyDict | null {
    const value = this.node.attrs.get(name);
    if (value instanceof PyDict) return value;
    if (value instanceof PyObject && value.dictItems) return value.dictItems;
    return null;
  }
}
