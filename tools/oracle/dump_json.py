"""Reference dumps of compiled Ren'Py scripts, for the Phanes tests.

For every .rpyc/.rpymc (loose, or inside .rpa archives) under ROOT, decodes
the script with CPython's own unpickler (pickle._Unpickler) and writes the
canonical JSON form defined in packages/renpy-formats/src/dump/canonical.ts.
Classes are never imported: find_class returns generic recorder classes, so
the result is what a faithful, non-executing unpickler must produce.

Container formats follow Ren'Py (renpy/script.py, renpy/loader.py; MIT).

Usage: python3 -I tools/oracle/dump_json.py ROOT OUT_DIR
Writes OUT_DIR/<path relative to ROOT>.json, and for archive entries
OUT_DIR/<archive path>/<entry name>.json.
"""
import _compat_pickle
import codecs
import collections
import io
import json
import math
import os
import pickle
import struct
import sys
import zlib

sys.setrecursionlimit(20000)
MAX_DEPTH = 1000
MISSING = object()

# ---------------------------------------------------------------- generic objects


class Generic(object):
    """Instance of a class we do not interpret (same rules as values.ts)."""

    def __new__(cls, *args, **kwargs):
        self = object.__new__(cls)
        self._p_args = list(args)
        self._p_kwargs = kwargs
        self._p_attrs = {}
        self._p_state = MISSING
        self._p_list = None
        self._p_dict = None
        self._p_set = None
        return self

    def __init__(self, *args, **kwargs):
        pass

    def __setstate__(self, state):
        parts = list(state) if isinstance(state, tuple) and len(state) == 2 else [state]
        pairs = []
        for part in parts:
            if part is None:
                continue
            if not isinstance(part, dict):
                self._p_state = state
                return
            for key, value in part.items():
                if isinstance(key, bytes):
                    key = key.decode("utf-8", "surrogateescape")
                if not isinstance(key, str):
                    self._p_state = state
                    return
                pairs.append((key, value))
        for key, value in pairs:
            self._p_attrs[key] = value

    def append(self, item):
        if self._p_list is None:
            self._p_list = []
        self._p_list.append(item)

    def extend(self, items):
        for item in items:
            self.append(item)

    def __setitem__(self, key, value):
        if self._p_dict is None:
            self._p_dict = {}
        self._p_dict[key] = value

    def add(self, item):
        if self._p_set is None:
            self._p_set = []
        self._p_set.append(item)


_classes = {}


def generic_class(module, name):
    key = (module, name)
    if key not in _classes:
        cls = type("G_" + name.replace(".", "_"), (Generic,), {})
        cls._p_module, cls._p_name = module, name
        _classes[key] = cls
    return _classes[key]


class OrderedSet(object):
    """A set that keeps pickle order, so dumps can be compared."""

    def __init__(self, items=(), frozen=False):
        self.frozen = frozen
        self.items = []
        self.update(items)

    def add(self, item):
        if item not in self.items:
            self.items.append(item)

    def update(self, items):
        for item in items:
            self.add(item)


def reconstructor(cls, base, state):
    # copyreg._reconstructor, without running any constructor.
    if base is object or state is None:
        return cls.__new__(cls)
    return cls.__new__(cls, state)


BUILTINS = {
    "builtins.set": lambda items=(): OrderedSet(items),
    "builtins.frozenset": lambda items=(): OrderedSet(items, frozen=True),
    "builtins.list": list,
    "builtins.tuple": tuple,
    "builtins.dict": dict,
    "collections.OrderedDict": dict,
    "collections.defaultdict": lambda factory=None, *rest: dict(*rest),
    "builtins.bytes": bytes,
    "builtins.bytearray": bytearray,
    "_codecs.encode": codecs.encode,
    "copyreg._reconstructor": reconstructor,
    "builtins.object": object,
}
BUILTIN_NAMES = {id(v): k for k, v in BUILTINS.items()}


class OracleUnpickler(pickle._Unpickler):
    dispatch = dict(pickle._Unpickler.dispatch)

    def find_class(self, module, name):
        if self.proto < 3:
            if (module, name) in _compat_pickle.NAME_MAPPING:
                module, name = _compat_pickle.NAME_MAPPING[(module, name)]
            elif module in _compat_pickle.IMPORT_MAPPING:
                module = _compat_pickle.IMPORT_MAPPING[module]
        key = module + "." + name
        if key in BUILTINS:
            return BUILTINS[key]
        return generic_class(module, name)

    def load_empty_set(self):
        self.append(OrderedSet())

    dispatch[pickle.EMPTY_SET[0]] = load_empty_set

    def load_frozenset(self):
        self.append(OrderedSet(self.pop_mark(), frozen=True))

    dispatch[pickle.FROZENSET[0]] = load_frozenset

    def load_additems(self):
        items = self.pop_mark()
        self.stack[-1].update(items) if isinstance(self.stack[-1], OrderedSet) else [
            self.stack[-1].add(i) for i in items
        ]

    dispatch[pickle.ADDITEMS[0]] = load_additems


def unpickle(data):
    u = OracleUnpickler(io.BytesIO(data), fix_imports=True, encoding="utf-8", errors="surrogateescape")
    value = u.load()
    return value, u.proto


# ---------------------------------------------------------------- canonical JSON


def is_container(v):
    return isinstance(v, (list, tuple, dict, OrderedSet, Generic))


def sorted_attrs(obj):
    return sorted(obj._p_attrs.items(), key=lambda kv: kv[0])


def children(v):
    if isinstance(v, (list, tuple)):
        return list(v)
    if isinstance(v, OrderedSet):
        return list(v.items)
    if isinstance(v, dict):
        return [x for kv in v.items() for x in kv]
    out = list(v._p_args)
    out += [x for kv in v._p_kwargs.items() for x in kv]
    out += [val for _, val in sorted_attrs(v)]
    if v._p_state is not MISSING:
        out.append(v._p_state)
    if v._p_list is not None:
        out += v._p_list
    if v._p_dict is not None:
        out += [x for kv in v._p_dict.items() for x in kv]
    if v._p_set is not None:
        out += v._p_set
    return out


def scalar(v):
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, int):
        return v if abs(v) <= 2 ** 53 - 1 else {"$int": str(v)}
    if isinstance(v, float):
        if math.isnan(v):
            return {"$float": "nan"}
        if math.isinf(v):
            return {"$float": "inf" if v > 0 else "-inf"}
        return {"$float": v}
    if isinstance(v, bytearray):
        return {"$bytearray": bytes(v).hex()}
    if isinstance(v, bytes):
        return {"$bytes": v.hex()}
    if isinstance(v, type) and issubclass(v, Generic):
        return {"$global": v._p_module + "." + v._p_name}
    if id(v) in BUILTIN_NAMES:
        return {"$global": BUILTIN_NAMES[id(v)]}
    raise TypeError("unexpected value %r" % (v,))


def canonical(root):
    ref_count, parent_of, order = {}, {}, []
    objects = {}
    if is_container(root):
        ref_count[id(root)] = 1
        parent_of[id(root)] = None
        objects[id(root)] = root
        order.append(root)
        i = 0
        while i < len(order):
            current = order[i]
            i += 1
            for child in children(current):
                if not is_container(child):
                    continue
                if id(child) in ref_count:
                    ref_count[id(child)] += 1
                else:
                    ref_count[id(child)] = 1
                    parent_of[id(child)] = id(current)
                    objects[id(child)] = child
                    order.append(child)
    ids = {}
    for c in order:
        if ref_count[id(c)] > 1:
            ids[id(c)] = len(ids)
    written = set()

    def emit_child(child, parent, depth):
        if not is_container(child):
            return scalar(child)
        if parent_of.get(id(child)) == id(parent) and id(child) not in written:
            return emit(child, depth + 1)
        return {"$ref": ids.get(id(child), -1)}

    def emit_pairs(items, parent, depth):
        return [
            [emit_child(items[i], parent, depth), emit_child(items[i + 1], parent, depth)]
            for i in range(0, len(items), 2)
        ]

    def emit(v, depth):
        written.add(id(v))
        if depth > MAX_DEPTH:
            return {"$truncated": True}
        ident = ids.get(id(v))

        def with_id(body):
            if ident is None:
                return body
            out = {"$id": ident}
            out.update(body)
            return out

        def all_(items):
            return [emit_child(c, v, depth) for c in items]

        if isinstance(v, list):
            return all_(v) if ident is None else {"$id": ident, "$list": all_(v)}
        if isinstance(v, tuple):
            return with_id({"$tuple": all_(v)})
        if isinstance(v, OrderedSet):
            return with_id({"$frozenset" if v.frozen else "$set": all_(v.items)})
        if isinstance(v, dict):
            return with_id({"$dict": emit_pairs([x for kv in v.items() for x in kv], v, depth)})
        body = {"$class": type(v)._p_module + "." + type(v)._p_name}
        if v._p_args:
            body["args"] = all_(v._p_args)
        if v._p_kwargs:
            body["kwargs"] = emit_pairs([x for kv in v._p_kwargs.items() for x in kv], v, depth)
        attrs = sorted_attrs(v)
        if attrs:
            body["attrs"] = dict((k, emit_child(val, v, depth)) for k, val in attrs)
        if v._p_state is not MISSING:
            body["state"] = emit_child(v._p_state, v, depth)
        if v._p_list is not None:
            body["list"] = all_(v._p_list)
        if v._p_dict is not None:
            body["dict"] = emit_pairs([x for kv in v._p_dict.items() for x in kv], v, depth)
        if v._p_set is not None:
            body["set"] = all_(v._p_set)
        return with_id(body)

    return emit(root, 0) if is_container(root) else scalar(root)


# ---------------------------------------------------------------- containers


def rpyc_payload(data, slots=(1, 2)):
    """renpy/script.py read_rpyc_data, trying slot 1 then 2 like unrpyc."""
    if data[:10] != b"RENPY RPC2":
        return 1, zlib.decompress(data)
    header = data[:1024]
    table = {}
    pos = 10
    while pos + 12 <= len(header):
        slot, start, length = struct.unpack("<III", header[pos : pos + 12])
        if slot == 0:
            break
        table[slot] = (start, length)
        pos += 12
    for slot in slots:
        if slot in table:
            start, length = table[slot]
            return slot, zlib.decompress(data[start : start + length])
    raise ValueError("no slot")


def rpa_entries(path):
    """renpy/loader.py RPAv3/RPAv2 handlers; yields (name, bytes)."""
    with open(path, "rb") as f:
        l = f.read(40)
        if l.startswith(b"RPA-3.0 "):
            offset, key = int(l[8:24], 16), int(l[25:33], 16)
        elif l.startswith(b"RPA-2.0 "):
            offset, key = int(l[8:24], 16), 0
        else:
            return
        f.seek(offset)
        index = pickle.loads(zlib.decompress(f.read()), encoding="bytes")
        for name, parts in index.items():
            if isinstance(name, bytes):
                name = name.decode("utf-8", "surrogateescape")
            chunks = []
            for t in parts:
                o, n = t[0] ^ key, t[1] ^ key
                if len(t) > 2 and t[2]:
                    chunks.append(t[2] if isinstance(t[2], bytes) else t[2].encode("latin-1"))
                f.seek(o)
                chunks.append(f.read(n))
            yield name, b"".join(chunks)


def dump(data, out_path):
    slot, payload = rpyc_payload(data)
    value, proto = unpickle(payload)
    doc = {"slot": slot, "protocol": proto, "payload": canonical(value)}
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def main(root, out_dir):
    count = 0
    for dirpath, _, filenames in os.walk(root):
        for filename in sorted(filenames):
            full = os.path.join(dirpath, filename)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if filename.endswith((".rpyc", ".rpymc")):
                with open(full, "rb") as f:
                    dump(f.read(), os.path.join(out_dir, rel + ".json"))
                count += 1
            elif filename.endswith(".rpa"):
                for name, data in rpa_entries(full):
                    if name.endswith((".rpyc", ".rpymc")):
                        dump(data, os.path.join(out_dir, rel, name + ".json"))
                        count += 1
    sys.stderr.write("%d scripts dumped to %s\n" % (count, out_dir))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
