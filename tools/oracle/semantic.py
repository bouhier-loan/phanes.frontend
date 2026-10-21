"""Semantic reference for the Phanes anti-corruption layer, built with unrpyc.

Loads every loose compiled script under ROOT with unrpyc (MIT), which knows
Ren'Py's AST classes, and writes a projection of each statement, in source
order, to OUT_DIR/<path>.json. packages/core/test/acl-oracle.test.ts projects
Phanes' domain model the same way and requires an exact match.

Projection (one list per statement, pre-order, nested blocks included):
  say [line, who, what]            label [line, name]
  menu [line, [[text, condition, has_block], ...]]
  jump/call [line, target, expression]     return [line]
  if [line, [conditions]]          init [line, priority]
  define/default [line, store, name, value]   python [line, code]
  scene/show/hide [line, [name...]]  image [line, [name...], value]
  user [line, line_text]           translate [line, identifier, language]
  translate-string [line, language, old, new]   screen [line, name]
  other statements: [kind, line]

Usage: python3 tools/oracle/semantic.py UNRPYC_DIR ROOT OUT_DIR
"""
import json
import os
import struct
import sys
import zlib

sys.path.insert(0, sys.argv[1])
from decompiler.renpycompat import pickle_safe_loads  # noqa: E402

KINDS = {
    "Say": "say", "TranslateSay": "say", "Label": "label", "Menu": "menu", "Jump": "jump",
    "Call": "call", "Return": "return", "If": "if", "While": "while", "Init": "init",
    "Define": "define", "Default": "default", "Python": "python", "EarlyPython": "python",
    "Scene": "scene", "Show": "show", "Hide": "hide", "With": "with", "Image": "image",
    "Transform": "transform", "UserStatement": "user", "Translate": "translate",
    "TranslateString": "translate-string", "TranslateBlock": "translate-block",
    "TranslateEarlyBlock": "translate-block", "TranslatePython": "translate-block",
    "EndTranslate": "end-translate", "Pass": "pass", "Screen": "screen", "Style": "style",
}


def text(v):
    if v is None:
        return None
    if isinstance(v, bytes):
        return v.decode("utf-8", "surrogateescape")
    if hasattr(v, "source") and not isinstance(v, str):  # PyCode
        return text(v.source)
    return str(v)


def name_tokens(imspec):
    return [str(t) for t in imspec[0]] if imspec else []


def project(node, out):
    cls = type(node).__name__
    kind = KINDS.get(cls, "unknown")
    line = getattr(node, "linenumber", 0)
    get = lambda name, default=None: getattr(node, name, default)  # noqa: E731
    if kind == "say":
        out.append(["say", line, text(get("who")), text(get("what"))])
    elif kind == "label":
        out.append(["label", line, text(get("name"))])
        walk(get("block") or [], out)
    elif kind == "menu":
        items = [[text(l), text(c) if c is not None else "True", b is not None] for l, c, b in get("items")]
        out.append(["menu", line, items])
        for _, _, block in get("items"):
            if block is not None:
                walk(block, out)
    elif kind in ("jump", "call"):
        target = get("target") if kind == "jump" else get("label")
        out.append([kind, line, text(target), bool(get("expression", False))])
    elif kind == "return":
        out.append(["return", line])
    elif kind == "if":
        out.append(["if", line, [text(c) for c, _ in get("entries")]])
        for _, block in get("entries"):
            walk(block, out)
    elif kind == "while":
        out.append(["while", line])
        walk(get("block"), out)
    elif kind == "init":
        out.append(["init", line, get("priority", 0)])
        walk(get("block"), out)
    elif kind in ("define", "default"):
        out.append([kind, line, get("store", "store"), get("varname"), text(get("code"))])
    elif kind == "python":
        out.append(["python", line, text(get("code"))])
    elif kind in ("scene", "show", "hide"):
        out.append([kind, line, name_tokens(get("imspec"))])
    elif kind == "image":
        code = get("code")
        out.append(["image", line, [str(t) for t in get("imgname")], text(code) if code is not None else None])
    elif kind == "user":
        out.append(["user", line, text(get("line"))])
    elif kind == "translate":
        out.append(["translate", line, text(get("identifier")), text(get("language"))])
        walk(get("block"), out)
    elif kind == "translate-string":
        out.append(["translate-string", line, text(get("language")), text(get("old")), text(get("new"))])
    elif kind == "translate-block":
        out.append(["translate-block", line])
        walk(get("block") or [], out)
    elif kind == "screen":
        screen = get("screen")
        out.append(["screen", line, text(getattr(screen, "name", None))])
    else:
        out.append([kind, line])
        block = get("block")
        if isinstance(block, list):
            walk(block, out)


def walk(block, out):
    for node in block:
        project(node, out)


def payload(data):
    if data[:10] != b"RENPY RPC2":
        return zlib.decompress(data)
    pos = 10
    while True:
        slot, start, length = struct.unpack("<III", data[pos : pos + 12])
        if slot in (0, 1):
            break
        pos += 12
    return zlib.decompress(data[start : start + length])


def main(root, out_dir):
    count = 0
    for dirpath, _, files in os.walk(root):
        for filename in sorted(files):
            if not filename.endswith((".rpyc", ".rpymc")):
                continue
            full = os.path.join(dirpath, filename)
            with open(full, "rb") as f:
                _, stmts = pickle_safe_loads(payload(f.read()))
            out = []
            walk(stmts, out)
            target = os.path.join(out_dir, os.path.relpath(full, root) + ".json")
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=0)
            count += 1
    sys.stderr.write("%d scripts projected to %s\n" % (count, out_dir))


if __name__ == "__main__":
    main(sys.argv[2], sys.argv[3])
