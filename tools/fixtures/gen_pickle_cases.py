# -*- coding: utf-8 -*-
"""Generates pickle test cases for the Phanes unpickler.

Runs under Python 2.7 (the interpreter bundled with the Ren'Py 7 SDK) and
Python 3. For every value and protocol it writes the pickle bytes and the
expected decoding, in the canonical form used by the TypeScript tests:

  None/bool/str -> JSON; int -> number, or {"$int": "..."} beyond 2**53
  float -> {"$float": number | "nan" | "inf" | "-inf"}
  bytes -> {"$bytes": hex} (Python 2 str too: the tests decode them as bytes)
  bytearray -> {"$bytearray": hex}; tuple -> {"$tuple": [...]}; list -> [...]
  dict -> {"$dict": [[k, v], ...]}; set/frozenset -> {"$set"/"$frozenset": sorted}
  instance -> {"$object": "module.Class", "args": [...], "attrs": {...},
               "state": ..., "list": [...], "dict": [[k, v], ...]}

Usage: python gen_pickle_cases.py OUTPUT.json
"""
from __future__ import unicode_literals

import binascii
import json
import math
import pickle
import sys
import types

PY2 = sys.version_info[0] == 2
if PY2:
    import copy_reg as copyreg
    text_type = unicode  # noqa: F821
    binary_type = str
    integer_types = (int, long)  # noqa: F821
else:
    import copyreg
    text_type = str
    binary_type = bytes
    integer_types = (int,)

# A fake module, so instances pickle as "phanes_test.<Class>".
mod = types.ModuleType(str("phanes_test"))
sys.modules[str("phanes_test")] = mod


def register(cls):
    cls.__module__ = str("phanes_test")
    setattr(mod, cls.__name__, cls)
    return cls


@register
class Plain(object):
    def __init__(self):
        self.name = "plain"
        self.count = 3


@register
class Slotted(object):
    __slots__ = [str("who"), str("what")]

    def __init__(self):
        self.who = "e"
        self.what = "Hello"


@register
class Reduced(object):
    def __init__(self, label):
        self.label = label

    def __reduce__(self):
        return (Reduced, (self.label,))


@register
class Expr(text_type):
    """Like renpy.ast.PyExpr: a str subclass with __getnewargs__."""

    __slots__ = [str("filename"), str("linenumber")]

    def __new__(cls, s, filename, linenumber):
        self = text_type.__new__(cls, s)
        self.filename = filename
        self.linenumber = linenumber
        return self

    def __getnewargs__(self):
        return (text_type(self), self.filename, self.linenumber)


@register
class Items(list):
    """Like RevertableList: a list subclass with an attribute."""

    def __init__(self, items):
        list.__init__(self, items)
        self.tag = "t"


@register
class Mapping(dict):
    pass


@register
class WithState(object):
    """Like renpy.ast.PyCode: __getstate__ returns a tuple."""

    def __init__(self):
        self.source = "x = 1"

    def __getstate__(self):
        return (1, self.source, ("game/script.rpy", 12), "exec")

    def __setstate__(self, state):
        self.source = state[1]


def hexlify(data):
    return binascii.hexlify(data).decode("ascii")


def canon(value):
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, integer_types):
        if abs(value) <= 2 ** 53 - 1:
            return int(value)
        return {"$int": text_type(value)}
    if isinstance(value, float):
        if math.isnan(value):
            return {"$float": "nan"}
        if math.isinf(value):
            return {"$float": "inf" if value > 0 else "-inf"}
        return {"$float": value}
    if type(value) is text_type:
        return value
    if type(value) is binary_type:
        return {"$bytes": hexlify(value)}
    if type(value) is bytearray:
        return {"$bytearray": hexlify(bytes(value))}
    if type(value) is tuple:
        return {"$tuple": [canon(v) for v in value]}
    if type(value) is list:
        return [canon(v) for v in value]
    if type(value) is dict:
        return {"$dict": [[canon(k), canon(v)] for k, v in value.items()]}
    if type(value) in (set, frozenset):
        items = sorted(
            (canon(v) for v in value),
            key=lambda c: json.dumps(c, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
        )
        return {"$set" if type(value) is set else "$frozenset": items}
    return canon_object(value)


def merge_attrs(state):
    """Mirrors the unpickler's BUILD: (dict|None, dict|None) or dict -> attrs."""
    parts = list(state) if isinstance(state, tuple) and len(state) == 2 else [state]
    if not all(p is None or isinstance(p, dict) for p in parts):
        return None
    attrs = {}
    for part in parts:
        for k, v in (part or {}).items():
            attrs[k] = canon(v)
    return attrs


def canon_object(obj, protocol=None):
    rv = obj.__reduce_ex__(PROTOCOL)
    func, args = rv[0], rv[1]
    state = rv[2] if len(rv) > 2 else None
    listitems = rv[3] if len(rv) > 3 else None
    dictitems = rv[4] if len(rv) > 4 else None
    if func is copyreg.__newobj__:
        cls, cargs = args[0], list(args[1:])
    elif func is copyreg._reconstructor:
        cls = args[0]
        cargs = [] if args[1] is object or args[2] is None else [args[2]]
    else:
        cls, cargs = func, list(args)
    out = {"$object": "%s.%s" % (cls.__module__, cls.__name__), "args": [canon(a) for a in cargs]}
    if state is not None:
        attrs = merge_attrs(state)
        if attrs is None:
            out["state"] = canon(state)
        else:
            out["attrs"] = attrs
    if listitems is not None:
        out["list"] = [canon(v) for v in listitems]
    if dictitems is not None:
        out["dict"] = [[canon(k), canon(v)] for k, v in dictitems]
    return out


def values():
    big = 2 ** 70
    yield "none", None
    yield "bools", [True, False]
    yield "small_ints", [0, 1, 255, 256, 65535, 65536, -1, -255, 2 ** 31 - 1, -(2 ** 31), 2 ** 31]
    yield "big_ints", [2 ** 53 - 1, 2 ** 53, -(2 ** 53), big, -big, 2 ** 64 + 7]
    yield "floats", [0.0, 1.5, -2.25, 1e300, 1e-300, float("inf"), float("-inf"), float("nan")]
    yield "text", ["", "ascii", "accents: éàü", "cjk: 日本語", "emoji: \U0001F600", "nl\nquote'\"\\"]
    yield "bytes", [b"", b"\x00\x01\xff", b"plain"]
    yield "bytearray", bytearray(b"\x00ab\xfe")
    yield "tuples", [(), (1,), (1, 2), (1, 2, 3), (1, 2, 3, 4)]
    yield "nested", {"a": [1, {"b": (2, [3])}], "c": None}
    yield "dict_keys", {1: "int", "s": "str", (1, 2): "tuple", None: "none"}
    yield "sets", [set([1, 2, 3]), frozenset(["x", "y"]), set()]
    yield "shared", (lambda l: [l, l])([1, 2])
    yield "plain_object", Plain()
    yield "reduced_object", Reduced("start")
    yield "with_state", WithState()
    yield "mapping", Mapping(a=1)
    if PY2:
        yield "py2_str", [str("hello"), b"caf\xc3\xa9", b"\xff\xfe", "unicode"]


def protocols_for(name):
    for protocol in range(0, pickle.HIGHEST_PROTOCOL + 1):
        yield protocol


# Classes that need protocol >= 2 (slots without __getstate__, newargs).
NEEDS_PROTO2 = set(["slotted_object", "expr", "items"])


def slot_values():
    yield "slotted_object", Slotted()
    yield "expr", Expr("x + 1", "game/script.rpy", 7)
    yield "items", Items([1, 2])


cases = []
for name, value in list(values()) + list(slot_values()):
    for PROTOCOL in protocols_for(name):
        if name in NEEDS_PROTO2 and PROTOCOL < 2:
            continue
        try:
            data = pickle.dumps(value, PROTOCOL)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("skip %s/%d: %s\n" % (name, PROTOCOL, e))
            continue
        cases.append(
            {
                "name": name,
                "protocol": PROTOCOL,
                "python": "%d.%d" % sys.version_info[:2],
                "hex": hexlify(data),
                "expected": canon(value),
            }
        )

with open(sys.argv[1], "wb") as f:
    f.write(json.dumps(cases, indent=1, sort_keys=True, ensure_ascii=False).encode("utf-8"))
sys.stderr.write("%d cases written to %s\n" % (len(cases), sys.argv[1]))
