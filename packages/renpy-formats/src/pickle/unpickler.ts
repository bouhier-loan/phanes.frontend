import { FormatError } from '../errors';
import { ByteReader } from '../io/byte-reader';
import { pythonEscapeDecode, rawUnicodeEscapeDecode } from '../text/python-escapes';
import { decodeLatin1, decodeUtf8 } from '../text/utf8';
import { construct, fixImport } from './builtins';
import { HIGHEST_PROTOCOL, Op } from './opcodes';
import {
  normalizeInt,
  PyBytes,
  PyDict,
  PyFloat,
  PyGlobal,
  PyList,
  PyObject,
  PySet,
  PyTuple,
  type PyValue,
} from './values';

export interface PickleLimits {
  /** Maximum number of values created (pushed or stored in containers). */
  readonly maxItems: number;
  /** Maximum nesting of MARK opcodes. */
  readonly maxMarkDepth: number;
  /** Maximum number of memo entries. */
  readonly maxMemoSize: number;
}

export const DEFAULT_PICKLE_LIMITS: PickleLimits = {
  maxItems: 25_000_000,
  maxMarkDepth: 100_000,
  maxMemoSize: 10_000_000,
};

export interface UnpickleOptions {
  /**
   * Decoding of Python 2 `str` (STRING, BINSTRING, SHORT_BINSTRING):
   * 'utf8' decodes as UTF-8 with surrogateescape, like Ren'Py 8;
   * 'bytes' keeps them as PyBytes, like `encoding="bytes"`.
   */
  readonly py2Strings?: 'utf8' | 'bytes';
  readonly limits?: Partial<PickleLimits>;
}

export interface UnpickleResult {
  readonly value: PyValue;
  /** Protocol from the PROTO opcode, or 0 for protocols 0 and 1. */
  readonly protocol: number;
  /** Offset just after the STOP opcode. */
  readonly end: number;
  /** Non-fatal oddities, e.g. a BUILD on a built-in container. */
  readonly warnings: readonly string[];
}

const MAX_WARNINGS = 20;
const INT_TEXT = /^[+-]?\d+(?:_\d+)*$/;
const FLOAT_TEXT =
  /^[+-]?(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[eE][+-]?\d+)?$/;
const FLOAT_SPECIAL = /^([+-]?)(inf|infinity|nan)$/i;

function asciiText(bytes: Uint8Array): string {
  return decodeLatin1(bytes).trim();
}

function parseIntText(text: string, offset: number): bigint {
  if (!INT_TEXT.test(text)) {
    throw new FormatError('PICKLE_INVALID', `invalid integer literal "${text.slice(0, 40)}"`, {
      offset,
    });
  }
  return BigInt(text.replaceAll('_', ''));
}

function parseFloatText(text: string, offset: number): number {
  const special = FLOAT_SPECIAL.exec(text);
  if (special) {
    if (special[2]?.toLowerCase() === 'nan') return Number.NaN;
    return special[1] === '-' ? -Infinity : Infinity;
  }
  if (!FLOAT_TEXT.test(text)) {
    throw new FormatError('PICKLE_INVALID', `invalid float literal "${text.slice(0, 40)}"`, {
      offset,
    });
  }
  return Number(text.replaceAll('_', ''));
}

/** Little-endian two's complement, as pickle's decode_long. */
function decodeLong(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i] ?? 0);
  if (((bytes[bytes.length - 1] ?? 0) & 0x80) !== 0) value -= 1n << BigInt(bytes.length * 8);
  return value;
}

function lengthFrom(value: bigint, reader: ByteReader): number {
  if (value > BigInt(reader.remaining)) {
    throw new FormatError('TRUNCATED', `declared length ${value} exceeds remaining data`, {
      offset: reader.pos,
      remaining: reader.remaining,
    });
  }
  return Number(value);
}

/**
 * Decodes a pickle without executing anything. Classes are kept as PyGlobal
 * references and instances as PyObject records; see values.ts.
 */
export function unpickle(bytes: Uint8Array, options: UnpickleOptions = {}): UnpickleResult {
  const limits: PickleLimits = { ...DEFAULT_PICKLE_LIMITS, ...options.limits };
  const py2AsBytes = options.py2Strings === 'bytes';
  const reader = new ByteReader(bytes);
  const memo = new Map<number, PyValue>();
  const metastack: PyValue[][] = [];
  const warnings: string[] = [];
  const globals = new Map<string, PyGlobal>();
  let stack: PyValue[] = [];
  let protocol = 0;
  let budget = limits.maxItems;
  let opStart = 0;

  // Annotated so that calls narrow types like a throw statement does.
  const fail: (message: string) => never = (message) => {
    throw new FormatError('PICKLE_INVALID', message, { offset: opStart });
  };
  const spend = (n: number): void => {
    budget -= n;
    if (budget < 0) {
      throw new FormatError('PICKLE_LIMIT', `pickle creates more than ${limits.maxItems} values`, {
        limit: limits.maxItems,
      });
    }
  };
  const warn = (message: string): void => {
    if (warnings.length < MAX_WARNINGS) warnings.push(`${message} (offset ${opStart})`);
  };
  const push = (value: PyValue): void => {
    spend(1);
    stack.push(value);
  };
  const pop = (): PyValue => {
    if (stack.length === 0) fail('stack underflow');
    return stack.pop() as PyValue;
  };
  const top = (): PyValue => {
    if (stack.length === 0) fail('stack underflow');
    return stack[stack.length - 1] as PyValue;
  };
  const popMark = (): PyValue[] => {
    const items = stack;
    const previous = metastack.pop();
    if (previous === undefined) fail('MARK expected');
    stack = previous;
    return items;
  };
  const memoPut = (index: number, value: PyValue): void => {
    if (!memo.has(index) && memo.size >= limits.maxMemoSize) {
      throw new FormatError('PICKLE_LIMIT', `memo exceeds ${limits.maxMemoSize} entries`, {
        limit: limits.maxMemoSize,
      });
    }
    memo.set(index, value);
  };
  const memoGet = (index: number): PyValue => {
    const value = memo.get(index);
    if (value === undefined) fail(`memo key ${index} not found`);
    return value;
  };
  const py2String = (raw: Uint8Array): PyValue =>
    py2AsBytes ? new PyBytes(raw.slice()) : decodeUtf8(raw, 'surrogateescape');
  const global = (rawModule: string, rawName: string): PyGlobal => {
    const [module, name] = protocol < 3 ? fixImport(rawModule, rawName) : [rawModule, rawName];
    const key = `${module}\n${name}`;
    let ref = globals.get(key);
    if (!ref) {
      ref = new PyGlobal(module, name);
      globals.set(key, ref);
    }
    return ref;
  };
  const asTuple = (value: PyValue, what: string): readonly PyValue[] => {
    if (!(value instanceof PyTuple)) fail(`${what} expects a tuple`);
    return value.items;
  };
  const instantiate = (cls: PyValue, args: readonly PyValue[]): void => {
    if (!(cls instanceof PyGlobal)) fail('instance creation expects a class');
    push(construct(cls, args, null));
  };
  const appendTo = (target: PyValue, items: readonly PyValue[]): void => {
    spend(items.length);
    if (target instanceof PyList) target.items.push(...items);
    else if (target instanceof PyObject) (target.listItems ??= []).push(...items);
    else fail('APPEND target is not a list');
  };
  const setItemsOn = (target: PyValue, items: readonly PyValue[]): void => {
    if (items.length % 2 !== 0) fail('odd number of items for SETITEMS');
    spend(items.length / 2);
    let dict: PyDict;
    if (target instanceof PyDict) dict = target;
    else if (target instanceof PyObject) dict = target.dictItems ??= new PyDict();
    else fail('SETITEM target is not a dict');
    for (let i = 0; i < items.length; i += 2) dict.set(items[i] ?? null, items[i + 1] ?? null);
  };
  const addItemsTo = (target: PyValue, items: readonly PyValue[]): void => {
    spend(items.length);
    if (target instanceof PySet && !target.frozen) for (const item of items) target.add(item);
    else if (target instanceof PyObject) (target.setItems ??= []).push(...items);
    else fail('ADDITEMS target is not a set');
  };
  // Attribute names are identifiers; Python 2 ones are byte strings.
  const attrName = (key: PyValue): string | null =>
    typeof key === 'string'
      ? key
      : key instanceof PyBytes
        ? decodeUtf8(key.data, 'surrogateescape')
        : null;
  const mergeState = (inst: PyObject, state: PyValue): boolean => {
    const parts: PyValue[] =
      state instanceof PyTuple && state.items.length === 2 ? [...state.items] : [state];
    const pairs: [string, PyValue][] = [];
    for (const part of parts) {
      if (part === null) continue;
      if (!(part instanceof PyDict)) return false;
      for (const [key, value] of part.items()) {
        const name = attrName(key);
        if (name === null) return false;
        pairs.push([name, value]);
      }
    }
    for (const [name, value] of pairs) inst.attrs.set(name, value);
    return true;
  };
  const build = (inst: PyValue, state: PyValue): void => {
    if (inst instanceof PyObject) {
      if (!mergeState(inst, state)) inst.state = state;
    } else if (state !== null) {
      warn('BUILD on a built-in value ignored');
    }
  };

  for (;;) {
    opStart = reader.pos;
    const op = reader.u8();
    switch (op) {
      case Op.PROTO: {
        protocol = reader.u8();
        if (protocol > HIGHEST_PROTOCOL) {
          throw new FormatError('PICKLE_UNSUPPORTED', `unsupported pickle protocol ${protocol}`, {
            protocol,
          });
        }
        break;
      }
      case Op.FRAME:
        lengthFrom(reader.u64le(), reader);
        break;
      case Op.STOP: {
        const value = pop();
        return { value, protocol, end: reader.pos, warnings };
      }
      case Op.MARK:
        if (metastack.length >= limits.maxMarkDepth) {
          throw new FormatError('PICKLE_LIMIT', `MARK nesting exceeds ${limits.maxMarkDepth}`, {
            limit: limits.maxMarkDepth,
          });
        }
        metastack.push(stack);
        stack = [];
        break;
      case Op.POP:
        if (stack.length > 0) stack.pop();
        else popMark();
        break;
      case Op.POP_MARK:
        popMark();
        break;
      case Op.DUP:
        push(top());
        break;

      // Constants and numbers
      case Op.NONE:
        push(null);
        break;
      case Op.NEWTRUE:
        push(true);
        break;
      case Op.NEWFALSE:
        push(false);
        break;
      case Op.INT: {
        const raw = reader.line();
        const text = asciiText(raw);
        if (raw.length === 2 && raw[0] === 0x30 && raw[1] === 0x31) push(true);
        else if (raw.length === 2 && raw[0] === 0x30 && raw[1] === 0x30) push(false);
        else push(normalizeInt(parseIntText(text, opStart)));
        break;
      }
      case Op.BININT:
        push(reader.i32le());
        break;
      case Op.BININT1:
        push(reader.u8());
        break;
      case Op.BININT2:
        push(reader.u16le());
        break;
      case Op.LONG: {
        let text = asciiText(reader.line());
        if (text.endsWith('L')) text = text.slice(0, -1);
        push(normalizeInt(parseIntText(text, opStart)));
        break;
      }
      case Op.LONG1:
        push(normalizeInt(decodeLong(reader.take(reader.u8()))));
        break;
      case Op.LONG4: {
        const n = reader.i32le();
        if (n < 0) fail('negative LONG4 length');
        push(normalizeInt(decodeLong(reader.take(lengthFrom(BigInt(n), reader)))));
        break;
      }
      case Op.FLOAT:
        push(new PyFloat(parseFloatText(asciiText(reader.line()), opStart)));
        break;
      case Op.BINFLOAT:
        push(new PyFloat(reader.f64be()));
        break;

      // Strings and bytes
      case Op.STRING: {
        const raw = reader.line();
        const q = raw[0];
        if (raw.length < 2 || (q !== 0x22 && q !== 0x27) || raw[raw.length - 1] !== q) {
          fail('STRING argument must be quoted');
        }
        push(py2String(pythonEscapeDecode(raw.subarray(1, raw.length - 1))));
        break;
      }
      case Op.BINSTRING: {
        const n = reader.i32le();
        if (n < 0) fail('negative BINSTRING length');
        push(py2String(reader.take(lengthFrom(BigInt(n), reader))));
        break;
      }
      case Op.SHORT_BINSTRING:
        push(py2String(reader.take(reader.u8())));
        break;
      case Op.UNICODE:
        push(rawUnicodeEscapeDecode(reader.line()));
        break;
      case Op.BINUNICODE:
        push(decodeUtf8(reader.take(lengthFrom(BigInt(reader.u32le()), reader)), 'surrogatepass'));
        break;
      case Op.SHORT_BINUNICODE:
        push(decodeUtf8(reader.take(reader.u8()), 'surrogatepass'));
        break;
      case Op.BINUNICODE8:
        push(decodeUtf8(reader.take(lengthFrom(reader.u64le(), reader)), 'surrogatepass'));
        break;
      case Op.BINBYTES:
        push(new PyBytes(reader.take(lengthFrom(BigInt(reader.u32le()), reader)).slice()));
        break;
      case Op.SHORT_BINBYTES:
        push(new PyBytes(reader.take(reader.u8()).slice()));
        break;
      case Op.BINBYTES8:
        push(new PyBytes(reader.take(lengthFrom(reader.u64le(), reader)).slice()));
        break;
      case Op.BYTEARRAY8:
        push(new PyBytes(reader.take(lengthFrom(reader.u64le(), reader)).slice(), true));
        break;
      case Op.READONLY_BUFFER:
        top();
        break;

      // Containers
      case Op.EMPTY_TUPLE:
        push(new PyTuple([]));
        break;
      case Op.TUPLE:
        push(new PyTuple(popMark()));
        break;
      case Op.TUPLE1: {
        const a = pop();
        push(new PyTuple([a]));
        break;
      }
      case Op.TUPLE2: {
        const b = pop();
        const a = pop();
        push(new PyTuple([a, b]));
        break;
      }
      case Op.TUPLE3: {
        const c = pop();
        const b = pop();
        const a = pop();
        push(new PyTuple([a, b, c]));
        break;
      }
      case Op.EMPTY_LIST:
        push(new PyList());
        break;
      case Op.LIST:
        push(new PyList(popMark()));
        break;
      case Op.APPEND: {
        const value = pop();
        appendTo(top(), [value]);
        break;
      }
      case Op.APPENDS: {
        const items = popMark();
        appendTo(top(), items);
        break;
      }
      case Op.EMPTY_DICT:
        push(new PyDict());
        break;
      case Op.DICT: {
        const items = popMark();
        const dict = new PyDict();
        push(dict);
        setItemsOn(dict, items);
        break;
      }
      case Op.SETITEM: {
        const value = pop();
        const key = pop();
        setItemsOn(top(), [key, value]);
        break;
      }
      case Op.SETITEMS: {
        const items = popMark();
        setItemsOn(top(), items);
        break;
      }
      case Op.EMPTY_SET:
        push(new PySet());
        break;
      case Op.FROZENSET:
        push(new PySet(true, popMark()));
        break;
      case Op.ADDITEMS: {
        const items = popMark();
        addItemsTo(top(), items);
        break;
      }

      // Memo
      case Op.PUT:
        memoPut(Number(parseIntText(asciiText(reader.line()), opStart)), top());
        break;
      case Op.BINPUT:
        memoPut(reader.u8(), top());
        break;
      case Op.LONG_BINPUT:
        memoPut(reader.u32le(), top());
        break;
      case Op.MEMOIZE:
        memoPut(memo.size, top());
        break;
      case Op.GET:
        push(memoGet(Number(parseIntText(asciiText(reader.line()), opStart))));
        break;
      case Op.BINGET:
        push(memoGet(reader.u8()));
        break;
      case Op.LONG_BINGET:
        push(memoGet(reader.u32le()));
        break;

      // Classes and instances (never executed)
      case Op.GLOBAL: {
        const module = decodeUtf8(reader.line(), 'strict');
        const name = decodeUtf8(reader.line(), 'strict');
        push(global(module, name));
        break;
      }
      case Op.STACK_GLOBAL: {
        const name = pop();
        const module = pop();
        if (typeof module !== 'string' || typeof name !== 'string')
          fail('STACK_GLOBAL requires str');
        push(global(module, name));
        break;
      }
      case Op.REDUCE: {
        const args = asTuple(pop(), 'REDUCE');
        const callable = pop();
        push(construct(callable, args, null));
        break;
      }
      case Op.NEWOBJ: {
        const args = asTuple(pop(), 'NEWOBJ');
        const cls = pop();
        if (!(cls instanceof PyGlobal)) fail('NEWOBJ expects a class');
        push(construct(cls, args, null));
        break;
      }
      case Op.NEWOBJ_EX: {
        const kwargs = pop();
        const args = asTuple(pop(), 'NEWOBJ_EX');
        const cls = pop();
        if (!(cls instanceof PyGlobal) || !(kwargs instanceof PyDict)) {
          throw new FormatError('PICKLE_INVALID', 'invalid NEWOBJ_EX', { offset: opStart });
        }
        push(construct(cls, args, kwargs.size > 0 ? kwargs : null));
        break;
      }
      case Op.INST: {
        const module = decodeUtf8(reader.line(), 'strict');
        const name = decodeUtf8(reader.line(), 'strict');
        instantiate(global(module, name), popMark());
        break;
      }
      case Op.OBJ: {
        const items = popMark();
        const cls = items.shift();
        instantiate(cls ?? null, items);
        break;
      }
      case Op.BUILD: {
        const state = pop();
        build(top(), state);
        break;
      }

      case Op.PERSID:
      case Op.BINPERSID:
      case Op.EXT1:
      case Op.EXT2:
      case Op.EXT4:
      case Op.NEXT_BUFFER:
        throw new FormatError(
          'PICKLE_UNSUPPORTED',
          `unsupported pickle opcode 0x${op.toString(16)}`,
          { offset: opStart, opcode: op },
        );
      default:
        throw new FormatError('PICKLE_INVALID', `unknown pickle opcode 0x${op.toString(16)}`, {
          offset: opStart,
          opcode: op,
        });
    }
  }
}
