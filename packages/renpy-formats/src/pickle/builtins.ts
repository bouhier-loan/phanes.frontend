import { FormatError } from '../errors';
import { decodeLatin1, encodeLatin1 } from '../text/utf8';
import {
  PyBytes,
  PyDict,
  PyGlobal,
  PyList,
  PyObject,
  PySet,
  PyTuple,
  type PyValue,
} from './values';

/**
 * Python 2 names renamed in Python 3, applied for protocols < 3 like
 * `fix_imports=True` does (subset of CPython's Lib/_compat_pickle.py).
 */
const MODULE_ALIASES: ReadonlyMap<string, string> = new Map([
  ['__builtin__', 'builtins'],
  ['copy_reg', 'copyreg'],
  ['_abcoll', 'collections.abc'],
]);

const NAME_ALIASES: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['__builtin__.unicode', ['builtins', 'str']],
  ['__builtin__.long', ['builtins', 'int']],
  ['__builtin__.xrange', ['builtins', 'range']],
  ['__builtin__.unichr', ['builtins', 'chr']],
  ['__builtin__.reduce', ['functools', 'reduce']],
  ['__builtin__.intern', ['sys', 'intern']],
  ['UserDict.IterableUserDict', ['collections', 'UserDict']],
  ['UserDict.UserDict', ['collections', 'UserDict']],
  ['UserList.UserList', ['collections', 'UserList']],
  ['UserString.UserString', ['collections', 'UserString']],
]);

export function fixImport(module: string, name: string): [string, string] {
  const renamed = NAME_ALIASES.get(`${module}.${name}`);
  if (renamed) return [renamed[0], renamed[1]];
  return [MODULE_ALIASES.get(module) ?? module, name];
}

type Constructor = (args: readonly PyValue[]) => PyValue;

function iterableItems(value: PyValue | undefined): PyValue[] {
  if (value === undefined) return [];
  if (value instanceof PyList || value instanceof PyTuple) return [...value.items];
  if (value instanceof PySet) return [...value.values()];
  if (value instanceof PyDict) return [...value.keys()];
  throw new FormatError('PICKLE_INVALID', 'expected an iterable argument');
}

function dictFrom(value: PyValue | undefined): PyDict {
  const dict = new PyDict();
  if (value === undefined || value === null) return dict;
  if (value instanceof PyDict) {
    for (const [k, v] of value.items()) dict.set(k, v);
    return dict;
  }
  for (const pair of iterableItems(value)) {
    const items = pair instanceof PyList || pair instanceof PyTuple ? pair.items : null;
    if (items?.length !== 2) throw new FormatError('PICKLE_INVALID', 'expected key/value pairs');
    dict.set(items[0] ?? null, items[1] ?? null);
  }
  return dict;
}

/** An encoding name, which a Python 2 pickle stores as a byte string. */
function encodingName(value: PyValue | undefined): string | null {
  if (typeof value === 'string') return value;
  if (value instanceof PyBytes) return decodeLatin1(value.data);
  return null;
}

function latin1Bytes(args: readonly PyValue[], mutable: boolean): PyBytes {
  const [text] = args;
  const encoding = encodingName(args[1]);
  if (typeof text !== 'string' || (encoding !== 'latin1' && encoding !== 'latin-1')) {
    throw new FormatError('PICKLE_UNSUPPORTED', 'unsupported bytes encoding in pickle');
  }
  const data = encodeLatin1(text);
  if (!data) throw new FormatError('PICKLE_INVALID', 'non latin-1 text in bytes reduction');
  return new PyBytes(data, mutable);
}

function bytesFrom(args: readonly PyValue[], mutable: boolean): PyBytes {
  const [first] = args;
  if (first === undefined) return new PyBytes(new Uint8Array(0), mutable);
  if (first instanceof PyBytes) return new PyBytes(first.data.slice(), mutable);
  if (typeof first === 'string') return latin1Bytes(args, mutable);
  const items = iterableItems(first);
  const data = new Uint8Array(items.length);
  items.forEach((item, i) => {
    if (typeof item !== 'number' || item < 0 || item > 255) {
      throw new FormatError('PICKLE_INVALID', 'invalid byte value');
    }
    data[i] = item;
  });
  return new PyBytes(data, mutable);
}

/**
 * Built-in callables whose result we can rebuild exactly. Everything else
 * becomes a generic PyObject.
 */
const CONSTRUCTORS: ReadonlyMap<string, Constructor> = new Map<string, Constructor>([
  ['builtins.set', (args) => new PySet(false, iterableItems(args[0]))],
  ['builtins.frozenset', (args) => new PySet(true, iterableItems(args[0]))],
  ['builtins.list', (args) => new PyList(iterableItems(args[0]))],
  ['builtins.tuple', (args) => new PyTuple(iterableItems(args[0]))],
  ['builtins.dict', (args) => dictFrom(args[0])],
  ['collections.OrderedDict', (args) => dictFrom(args[0])],
  ['collections.defaultdict', (args) => dictFrom(args[1])],
  ['builtins.bytes', (args) => bytesFrom(args, false)],
  ['builtins.bytearray', (args) => bytesFrom(args, true)],
  ['_codecs.encode', (args) => latin1Bytes(args, false)],
  [
    'copyreg._reconstructor',
    (args) => {
      const [cls, base, state] = args;
      if (!(cls instanceof PyGlobal)) {
        throw new FormatError('PICKLE_INVALID', '_reconstructor expects a class');
      }
      const isPlainObject = base instanceof PyGlobal && base.qualifiedName === 'builtins.object';
      return new PyObject(
        cls,
        isPlainObject || state === undefined || state === null ? [] : [state],
      );
    },
  ],
]);

/** Calls `callable(*args)` without executing anything. */
export function construct(
  callable: PyValue,
  args: readonly PyValue[],
  kwargs: PyDict | null,
): PyValue {
  if (callable instanceof PyGlobal) {
    const ctor = kwargs ? undefined : CONSTRUCTORS.get(callable.qualifiedName);
    return ctor ? ctor(args) : new PyObject(callable, args, kwargs);
  }
  // A callable that is not a plain global (rare): keep it as the first argument.
  return new PyObject(new PyGlobal('builtins', '<call>'), [callable, ...args], kwargs);
}
