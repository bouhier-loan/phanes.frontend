/**
 * Generic representation of unpickled Python values. Nothing here is ever
 * executed: classes are references by name, instances are plain records.
 * Dict contents and object attributes live in Maps, so keys read from a file
 * can never reach a JS prototype.
 */
export type PyValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | PyFloat
  | PyBytes
  | PyTuple
  | PyList
  | PyDict
  | PySet
  | PyGlobal
  | PyObject;

/** Python float, kept apart from int (both would be JS numbers). */
export class PyFloat {
  constructor(readonly value: number) {}
}

export class PyBytes {
  constructor(
    readonly data: Uint8Array,
    /** bytearray rather than bytes. */
    readonly mutable = false,
  ) {}
}

export class PyTuple {
  constructor(readonly items: readonly PyValue[]) {}
}

export class PyList {
  constructor(readonly items: PyValue[] = []) {}
}

/** A class or function reference (GLOBAL / STACK_GLOBAL). Never resolved. */
export class PyGlobal {
  constructor(
    readonly module: string,
    readonly name: string,
  ) {}

  get qualifiedName(): string {
    return `${this.module}.${this.name}`;
  }
}

/** An instance of a class we do not interpret: built by REDUCE, NEWOBJ, INST or OBJ. */
export class PyObject {
  /** Attributes from BUILD: the instance dict and slot state, merged. */
  readonly attrs = new Map<string, PyValue>();
  /** BUILD state that is not a (dict, slots) pair, e.g. PyCode's tuple. */
  state: PyValue | undefined = undefined;
  /** Items appended to a list subclass (APPEND/APPENDS). */
  listItems: PyValue[] | null = null;
  /** Items set on a dict subclass (SETITEM/SETITEMS). */
  dictItems: PyDict | null = null;
  /** Items added to a set subclass (ADDITEMS). */
  setItems: PyValue[] | null = null;

  constructor(
    readonly cls: PyGlobal,
    /** Positional arguments given to the constructor or __new__. */
    readonly args: readonly PyValue[] = [],
    readonly kwargs: PyDict | null = null,
  ) {}

  get className(): string {
    return this.cls.qualifiedName;
  }
}

type HashKey = string;

let nextIdentity = 0;
const identities = new WeakMap<object, number>();

function identityOf(value: object): number {
  let id = identities.get(value);
  if (id === undefined) {
    id = ++nextIdentity;
    identities.set(value, id);
  }
  return id;
}

/**
 * Key under which a value is stored in a PyDict or PySet, following Python's
 * equality for hashable built-ins: True == 1 == 1.0, tuples compare by
 * content, other objects by identity.
 */
export function hashKey(value: PyValue, depth = 0): HashKey {
  if (value === null) return 'n';
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'boolean') return value ? 'i:1' : 'i:0';
  if (typeof value === 'number' || typeof value === 'bigint') return `i:${value.toString()}`;
  if (value instanceof PyFloat) {
    return Number.isInteger(value.value)
      ? `i:${BigInt(value.value).toString()}`
      : `f:${value.value}`;
  }
  if (value instanceof PyBytes && !value.mutable) {
    let hex = '';
    for (const b of value.data) hex += b.toString(16).padStart(2, '0');
    return `b:${hex}`;
  }
  if (value instanceof PyTuple && depth < 32) {
    return `t(${value.items.map((item) => hashKey(item, depth + 1)).join(',')})`;
  }
  if (value instanceof PyGlobal) return `g:${value.qualifiedName}`;
  return `o:${identityOf(value)}`;
}

/** Python dict: insertion-ordered, keyed by Python equality. */
export class PyDict {
  private readonly entries = new Map<HashKey, [PyValue, PyValue]>();

  get size(): number {
    return this.entries.size;
  }

  set(key: PyValue, value: PyValue): void {
    const k = hashKey(key);
    const existing = this.entries.get(k);
    if (existing) existing[1] = value;
    else this.entries.set(k, [key, value]);
  }

  get(key: PyValue): PyValue | undefined {
    return this.entries.get(hashKey(key))?.[1];
  }

  has(key: PyValue): boolean {
    return this.entries.has(hashKey(key));
  }

  *keys(): IterableIterator<PyValue> {
    for (const [key] of this.entries.values()) yield key;
  }

  *values(): IterableIterator<PyValue> {
    for (const [, value] of this.entries.values()) yield value;
  }

  items(): IterableIterator<[PyValue, PyValue]> {
    return this.entries.values();
  }
}

/** Python set or frozenset. */
export class PySet {
  private readonly members = new Map<HashKey, PyValue>();

  constructor(
    readonly frozen = false,
    items: Iterable<PyValue> = [],
  ) {
    for (const item of items) this.add(item);
  }

  get size(): number {
    return this.members.size;
  }

  add(item: PyValue): void {
    const k = hashKey(item);
    if (!this.members.has(k)) this.members.set(k, item);
  }

  has(item: PyValue): boolean {
    return this.members.has(hashKey(item));
  }

  values(): IterableIterator<PyValue> {
    return this.members.values();
  }
}

/** Python int as a JS number when exact, as a bigint otherwise. */
export function normalizeInt(value: bigint): number | bigint {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value;
}

export function isPyInt(value: PyValue | undefined): value is number | bigint {
  return (typeof value === 'number' && Number.isInteger(value)) || typeof value === 'bigint';
}

/** Items of a tuple or list, or null for anything else. */
export function sequenceItems(value: PyValue | undefined): readonly PyValue[] | null {
  if (value instanceof PyTuple || value instanceof PyList) return value.items;
  return null;
}

/** Text of a str, or of a str subclass instance whose first argument is a str. */
export function asText(value: PyValue | undefined): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof PyObject) {
    const first = value.args[0];
    if (typeof first === 'string') return first;
  }
  return null;
}
