/*
 * Canonical JSON form of unpickled values, shared with the Python oracle
 * (tools/oracle/dump_json.py), which implements the same rules:
 *
 *   None/bool/int/str -> JSON (ints beyond 2^53: {"$int": "..."})
 *   float             -> {"$float": number | "nan" | "inf" | "-inf"}
 *   bytes, bytearray  -> {"$bytes": hex}, {"$bytearray": hex}
 *   class reference   -> {"$global": "module.name"}
 *   list              -> [...] or {"$id": n, "$list": [...]}
 *   tuple             -> {"$tuple": [...]}       dict -> {"$dict": [[k, v], ...]}
 *   set, frozenset    -> {"$set": [...]}, {"$frozenset": [...]}
 *   instance          -> {"$class": "module.Name", "args": [...], "kwargs": [[k, v]],
 *                         "attrs": {sorted}, "state": ..., "list": [...],
 *                         "dict": [[k, v]], "set": [...]}   (empty parts omitted)
 *
 * Containers referenced more than once get "$id" (numbered in breadth-first
 * discovery order) and are written in full only where a breadth-first walk
 * first reaches them; everywhere else they are {"$ref": n}. Writing along the
 * breadth-first tree keeps the output shallow: a block's statements are
 * written in the block list, and the `next` links between them become $refs.
 */
import type { Json } from './json';
import {
  PyBytes,
  PyDict,
  PyFloat,
  PyGlobal,
  PyList,
  PyObject,
  PySet,
  PyTuple,
  type PyValue,
} from '../pickle/values';

type Container = PyTuple | PyList | PyDict | PySet | PyObject;

function isContainer(value: PyValue): value is Container {
  return (
    value instanceof PyObject ||
    value instanceof PyList ||
    value instanceof PyTuple ||
    value instanceof PyDict ||
    value instanceof PySet
  );
}

function sortedAttrs(obj: PyObject): [string, PyValue][] {
  return [...obj.attrs.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Children of a container, in canonical order. */
function children(value: Container): PyValue[] {
  if (value instanceof PyTuple || value instanceof PyList) return [...value.items];
  if (value instanceof PySet) return [...value.values()];
  if (value instanceof PyDict) return [...value.items()].flat();
  const out: PyValue[] = [...value.args];
  if (value.kwargs) out.push(...[...value.kwargs.items()].flat());
  for (const [, v] of sortedAttrs(value)) out.push(v);
  if (value.state !== undefined) out.push(value.state);
  if (value.listItems) out.push(...value.listItems);
  if (value.dictItems) out.push(...[...value.dictItems.items()].flat());
  if (value.setItems) out.push(...value.setItems);
  return out;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function scalar(value: PyValue): Json {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return { $int: value.toString() };
  if (value instanceof PyFloat) {
    const v = value.value;
    if (Number.isNaN(v)) return { $float: 'nan' };
    if (!Number.isFinite(v)) return { $float: v > 0 ? 'inf' : '-inf' };
    return { $float: v };
  }
  if (value instanceof PyBytes)
    return value.mutable ? { $bytearray: hex(value.data) } : { $bytes: hex(value.data) };
  if (value instanceof PyGlobal) return { $global: value.qualifiedName };
  throw new Error('not a scalar');
}

export interface CanonicalOptions {
  /** Deeper containers are written as {"$truncated": true}. Default 1000. */
  readonly maxDepth?: number;
}

export function toCanonicalJson(root: PyValue, options: CanonicalOptions = {}): Json {
  const maxDepth = options.maxDepth ?? 1000;
  // Pass 1: breadth-first discovery, reference counts, discovering parent.
  const refCount = new Map<Container, number>();
  const parentOf = new Map<Container, Container | null>();
  const order: Container[] = [];
  if (isContainer(root)) {
    refCount.set(root, 1);
    parentOf.set(root, null);
    order.push(root);
    // `order` grows while it is walked: array iteration sees appended items.
    for (const current of order) {
      for (const child of children(current)) {
        if (!isContainer(child)) continue;
        const count = refCount.get(child);
        if (count !== undefined) {
          refCount.set(child, count + 1);
        } else {
          refCount.set(child, 1);
          parentOf.set(child, current);
          order.push(child);
        }
      }
    }
  }
  const ids = new Map<Container, number>();
  for (const container of order)
    if ((refCount.get(container) ?? 0) > 1) ids.set(container, ids.size);

  // Pass 2: write each container in full under its discovering parent only.
  const written = new Set<Container>();
  const emitChild = (child: PyValue, parent: Container, depth: number): Json => {
    if (!isContainer(child)) return scalar(child);
    if (parentOf.get(child) === parent && !written.has(child)) return emit(child, depth + 1);
    return { $ref: ids.get(child) ?? -1 };
  };
  const emitPairs = (items: PyValue[], parent: Container, depth: number): Json[] => {
    const out: Json[] = [];
    for (let i = 0; i < items.length; i += 2) {
      out.push([
        emitChild(items[i] ?? null, parent, depth),
        emitChild(items[i + 1] ?? null, parent, depth),
      ]);
    }
    return out;
  };
  const emit = (value: Container, depth: number): Json => {
    written.add(value);
    if (depth > maxDepth) return { $truncated: true };
    const id = ids.get(value);
    const withId = (body: Record<string, Json>): Json =>
      id === undefined ? body : { $id: id, ...body };
    const all = (items: readonly PyValue[]) => items.map((c) => emitChild(c, value, depth));
    if (value instanceof PyList)
      return id === undefined ? all(value.items) : { $id: id, $list: all(value.items) };
    if (value instanceof PyTuple) return withId({ $tuple: all(value.items) });
    if (value instanceof PySet)
      return withId({ [value.frozen ? '$frozenset' : '$set']: all([...value.values()]) });
    if (value instanceof PyDict)
      return withId({ $dict: emitPairs([...value.items()].flat(), value, depth) });
    const body: Record<string, Json> = { $class: value.className };
    if (value.args.length > 0) body.args = all(value.args);
    if (value.kwargs && value.kwargs.size > 0)
      body.kwargs = emitPairs([...value.kwargs.items()].flat(), value, depth);
    const attrs = sortedAttrs(value);
    if (attrs.length > 0) {
      // fromEntries defines own properties, so a "__proto__" attribute stays data.
      body.attrs = Object.fromEntries(attrs.map(([k, v]) => [k, emitChild(v, value, depth)]));
    }
    if (value.state !== undefined) body.state = emitChild(value.state, value, depth);
    if (value.listItems) body.list = all(value.listItems);
    if (value.dictItems) body.dict = emitPairs([...value.dictItems.items()].flat(), value, depth);
    if (value.setItems) body.set = all(value.setItems);
    return withId(body);
  };
  return isContainer(root) ? emit(root, 0) : scalar(root);
}
