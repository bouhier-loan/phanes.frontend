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
} from '../../src';

export type Canon = null | boolean | number | string | Canon[] | { [key: string]: Canon };

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function sortKey(c: Canon): string {
  return JSON.stringify(c);
}

/** Same canonical form as tools/fixtures/gen_pickle_cases.py (shared values are inlined). */
export function canon(value: PyValue): Canon {
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
  if (value instanceof PyTuple) return { $tuple: value.items.map(canon) };
  if (value instanceof PyList) return value.items.map(canon);
  if (value instanceof PyDict)
    return { $dict: [...value.items()].map(([k, v]) => [canon(k), canon(v)]) };
  if (value instanceof PySet) {
    const items = [...value.values()].map(canon).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
    return value.frozen ? { $frozenset: items } : { $set: items };
  }
  if (value instanceof PyGlobal) return { $global: value.qualifiedName };
  return canonObject(value);
}

function canonObject(obj: PyObject): Canon {
  const out: Record<string, Canon> = { $object: obj.className, args: obj.args.map(canon) };
  if (obj.attrs.size > 0) {
    const attrs: Record<string, Canon> = {};
    for (const [k, v] of obj.attrs) attrs[k] = canon(v);
    out.attrs = attrs;
  }
  if (obj.state !== undefined) out.state = canon(obj.state);
  if (obj.listItems) out.list = obj.listItems.map(canon);
  if (obj.dictItems) out.dict = [...obj.dictItems.items()].map(([k, v]) => [canon(k), canon(v)]);
  return out;
}

/** Drops empty "attrs" records, which depend on Python's reduce details. */
export function withoutEmptyAttrs(c: Canon): Canon {
  if (Array.isArray(c)) return c.map(withoutEmptyAttrs);
  if (c === null || typeof c !== 'object') return c;
  const out: Record<string, Canon> = {};
  for (const [k, v] of Object.entries(c)) {
    if (
      k === 'attrs' &&
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === 0
    ) {
      continue;
    }
    out[k] = withoutEmptyAttrs(v);
  }
  return out;
}
