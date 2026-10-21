import { describe, expect, it } from 'vitest';
import {
  FormatError,
  PyBytes,
  PyDict,
  PyList,
  PyObject,
  PyTuple,
  unpickle,
  type PyValue,
} from '../../src';

/** Builds a pickle from text and byte fragments. */
function pk(...parts: (string | number[])[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') for (const c of part) out.push(c.charCodeAt(0));
    else out.push(...part);
  }
  return Uint8Array.from(out);
}

function load(...parts: (string | number[])[]): PyValue {
  return unpickle(pk(...parts)).value;
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof FormatError ? error.code : `not a FormatError: ${String(error)}`;
  }
  return undefined;
}

describe('unpickle: protocol 0 text opcodes', () => {
  it('reads Python 2 booleans and longs', () => {
    expect(load('(I01\nI00\nI42\nL12345678901234567890L\nt.')).toEqual(
      new PyTuple([true, false, 42, 12345678901234567890n]),
    );
  });

  it('reads Python 2 str with escapes, decoded as UTF-8 with surrogateescape', () => {
    expect(load("S'caf\\xc3\\xa9 \\xff'\np0\n.")).toBe('caf\u00e9 \udcff');
    expect(unpickle(pk("S'\\xff'\n.", ''), { py2Strings: 'bytes' }).value).toEqual(
      new PyBytes(Uint8Array.of(0xff)),
    );
  });

  it('reads floats including specials', () => {
    const value = load('(F1.5\nFinf\nF-1e+300\nt.') as PyTuple;
    expect(value.items.map((v) => (v as { value: number }).value)).toEqual([1.5, Infinity, -1e300]);
  });

  it('supports PUT/GET memo references', () => {
    const value = load('((lp0\nI1\naI2\nag0\nt.') as PyTuple;
    expect(value.items[0]).toBeInstanceOf(PyList);
    expect(value.items[0]).toBe(value.items[1]);
  });

  it('builds INST objects', () => {
    const value = load("(S'x'\nimy.module\nThing\n(dS'a'\nI1\nsb.") as PyObject;
    expect(value).toBeInstanceOf(PyObject);
    expect(value.className).toBe('my.module.Thing');
    expect(value.args).toEqual(['x']);
    expect(value.attrs.get('a')).toBe(1);
  });
});

describe('unpickle: structure', () => {
  it('keeps shared references and cycles', () => {
    // A list that contains itself: ] q\x00 h\x00 a .
    const list = unpickle(pk([0x80, 2], ']q', [0], 'h', [0], 'a.')).value as PyList;
    expect(list.items[0]).toBe(list);
  });

  it('stores dict keys from the file in Maps only', () => {
    const value = load("}(S'__proto__'\nS'polluted'\nS'constructor'\nI1\nu.") as PyDict;
    expect(value.get('__proto__')).toBe('polluted');
    expect(value.get('constructor')).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('stores object attributes from the file in Maps only', () => {
    const obj = load("cm\nC\n)\x81}S'__proto__'\nS'x'\nsb.") as PyObject;
    expect(obj.attrs.get('__proto__')).toBe('x');
    expect(Object.getPrototypeOf(obj)).toBe(PyObject.prototype);
  });

  it('follows Python equality for dict keys', () => {
    const value = load("(dI1\nS'int'\nsI01\nS'bool'\ns.") as PyDict;
    expect(value.size).toBe(1);
    expect(value.get(1)).toBe('bool');
  });

  it('keeps the state of objects whose state is not a dict', () => {
    const obj = load("cm\nC\n)\x81(I1\nS'src'\ntb.") as PyObject;
    expect(obj.attrs.size).toBe(0);
    expect(obj.state).toEqual(new PyTuple([1, 'src']));
  });
});

describe('unpickle: errors', () => {
  it('rejects truncated input', () => {
    expect(errorCode(() => unpickle(pk('(I1\n')))).toBe('TRUNCATED');
    expect(errorCode(() => unpickle(pk([0x80, 2, 0x58, 0xff, 0xff, 0, 0], 'abc')))).toBe(
      'TRUNCATED',
    );
  });

  it('rejects huge declared lengths before allocating', () => {
    const eight = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f];
    expect(errorCode(() => unpickle(pk([0x80, 4, 0x8e, ...eight])))).toBe('TRUNCATED');
  });

  it('rejects unknown opcodes, bad memo keys and stack underflow', () => {
    expect(errorCode(() => unpickle(pk([0xff])))).toBe('PICKLE_INVALID');
    expect(errorCode(() => unpickle(pk('h', [9], '.')))).toBe('PICKLE_INVALID');
    expect(errorCode(() => unpickle(pk('a.')))).toBe('PICKLE_INVALID');
    expect(errorCode(() => unpickle(pk('t.')))).toBe('PICKLE_INVALID');
  });

  it('refuses persistent ids, extensions and unknown protocols', () => {
    expect(errorCode(() => unpickle(pk('P1\n.')))).toBe('PICKLE_UNSUPPORTED');
    expect(errorCode(() => unpickle(pk([0x80, 2, 0x82, 1], '.')))).toBe('PICKLE_UNSUPPORTED');
    expect(errorCode(() => unpickle(pk([0x80, 6], 'N.')))).toBe('PICKLE_UNSUPPORTED');
  });

  it('enforces limits', () => {
    const marks = pk('('.repeat(50), 'N.');
    expect(errorCode(() => unpickle(marks, { limits: { maxMarkDepth: 10 } }))).toBe('PICKLE_LIMIT');
    const dups = pk('N', '2'.repeat(100), '.');
    expect(errorCode(() => unpickle(dups, { limits: { maxItems: 50 } }))).toBe('PICKLE_LIMIT');
    const memo = pk('N', 'q\x00q\x01q\x02q\x03', '.');
    expect(errorCode(() => unpickle(memo, { limits: { maxMemoSize: 2 } }))).toBe('PICKLE_LIMIT');
  });
});
