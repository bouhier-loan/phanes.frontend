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
  user [line, line_text], then its code_block and subparse blocks
  layeredimage [line, name, [layer...]]: always [image], attribute [name, group, variant,
    default, image], auto [group, variant], condition [condition, image]
  translate [line, identifier, language]
  translate-string [line, language, old, new]
  screen [line, name, [element...]], its SL2 statements flattened:
    displayable [line, name, [positional], [[keyword, value]]], condition [line, code],
    for [line, variable, code], use [line, target, [args]], python [line, code],
    default [line, variable, code]
  other statements: [kind, line]

Usage: python3 tools/oracle/semantic.py UNRPYC_DIR ROOT OUT
When OUT ends with .json.gz, writes a single gzipped JSON object mapping each
script path to its projection instead (the corpus references).
"""
import ast
import gzip
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
    elif kind == "user" and layered(get("parsed")) is not None:
        name, layers = layered(get("parsed"))
        out.append(["layeredimage", line, name, layers])
    elif kind == "user":
        out.append(["user", line, text(get("line"))])
        walk(get("code_block") or [], out)
        for sub in get("subparses") or []:
            walk(getattr(sub, "block", None) or [], out)
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
        elements = []
        screen_elements(screen, elements, 0)
        out.append(["screen", line, text(getattr(screen, "name", None)), elements])
    else:
        out.append([kind, line])
        block = get("block")
        if isinstance(block, list):
            walk(block, out)


# Statement names of SL2 displayables, for screens compiled before Ren'Py 8
# stored them (renpy/sl2/sldisplayables.py).
STATEMENTS = {
    "renpy.display.layout.Null": "null", "renpy.text.text.Text": "text",
    "renpy.display.layout.Grid": "grid", "renpy.display.layout.Side": "side",
    "renpy.ui._key": "key", "renpy.display.behavior.Timer": "timer",
    "renpy.display.behavior.Input": "input", "renpy.display.behavior.Button": "button",
    "renpy.ui._imagebutton": "imagebutton", "renpy.ui._textbutton": "textbutton",
    "renpy.ui._label": "label", "renpy.sl2.sldisplayables.sl2bar": "bar",
    "renpy.sl2.sldisplayables.sl2vbar": "vbar", "renpy.sl2.sldisplayables.sl2viewport": "viewport",
    "renpy.sl2.sldisplayables.sl2vpgrid": "vpgrid", "renpy.sl2.sldisplayables.sl2add": "add",
    "renpy.ui._imagemap": "imagemap", "renpy.ui._hotspot": "hotspot", "renpy.ui._hotbar": "hotbar",
    "renpy.display.motion.Transform": "transform", "renpy.display.dragdrop.Drag": "drag",
    "renpy.display.dragdrop.DragGroup": "draggroup",
    "renpy.display.behavior.MouseArea": "mousearea", "renpy.display.behavior.OnEvent": "on",
}
BY_STYLE = {
    "renpy.display.layout.MultiBox": ("hbox", "vbox", "fixed"),
    "renpy.display.layout.Window": ("frame", "window"),
}


def statement_name(node):
    name = getattr(node, "name", None)
    if name:
        return text(name)
    d = getattr(node, "displayable", None)
    if d is None:
        return ""
    qualified = d.__module__ + "." + d.__name__ if hasattr(d, "__name__") else None
    if qualified is None:
        return ""
    style = text(getattr(node, "style", None))
    if qualified in BY_STYLE and style in BY_STYLE[qualified]:
        return style
    return STATEMENTS.get(qualified, qualified.rsplit(".", 1)[-1].lower())


def screen_elements(node, out, depth):
    """Flattened SL2 statements: same projection as acl-oracle.test.ts."""
    if node is None or depth > 200:
        return
    cls = type(node).__name__
    loc = getattr(node, "location", None)
    line = loc[1] if loc else 0
    children = lambda: [screen_elements(c, out, depth + 1) for c in getattr(node, "children", None) or []]  # noqa: E731
    if cls in ("SLScreen", "SLBlock", "SLDisplayable"):
        keywords = [[text(k), text(v)] for k, v in getattr(node, "keyword", None) or [] if v is not None]
        positional = [text(p) for p in getattr(node, "positional", None) or []]
        name = "screen" if cls == "SLScreen" else "" if cls == "SLBlock" else statement_name(node)
        if cls == "SLDisplayable" or keywords:
            out.append(["displayable", line, name, positional, keywords])
        children()
    elif cls in ("SLIf", "SLShowIf"):
        for condition, block in node.entries:
            if condition is not None:
                out.append(["condition", line, text(condition)])
            screen_elements(block, out, depth + 1)
    elif cls == "SLFor":
        out.append(["for", line, text(node.variable), text(node.expression)])
        children()
    elif cls in ("SLUse", "SLCustomUse"):
        args = getattr(node, "args", None)
        if args is not None:
            sources = [text(e) for _, e in args.arguments]
        else:
            sources = [text(p) for p in getattr(node, "positional", None) or []]
        out.append(["use", line, text(node.target), sources])
        screen_elements(getattr(node, "block", None), out, depth + 1)
    elif cls == "SLPython":
        out.append(["python", line, text(node.code)])
    elif cls == "SLDefault":
        out.append(["default", line, text(node.variable), text(node.expression)])
    else:
        children()


def layered_props(node):
    """Properties as Python sources (same rules as acl/layered.ts)."""
    props = {}
    for attr in ("properties", "expr_properties"):
        for k, v in dict(getattr(node, attr, None) or {}).items():
            if text(v) is not None:
                props[text(k)] = text(v)
    for k, v in dict(getattr(node, "final_properties", None) or {}).items():
        if isinstance(v, bool):
            props[text(k)] = "True" if v else "False"
        elif isinstance(v, (str, bytes)):
            props[text(k)] = json.dumps(text(v))
        elif isinstance(v, int):
            props[text(k)] = str(v)
    return props


def flag(props, name):
    source = props.get(name)
    return source is not None and source.strip() not in ("False", "None", "0")


def variant_of(props):
    source = props.get("variant")
    if source is None:
        return None
    try:
        value = ast.literal_eval(source.strip())
    except (ValueError, SyntaxError):
        return None
    return value if isinstance(value, str) else None


def layered(parsed):
    """[name, layers] of a layeredimage statement's RawLayeredImage, else None."""
    if not isinstance(parsed, tuple) or len(parsed) != 2 or type(parsed[1]).__name__ != "RawLayeredImage":
        return None
    root = parsed[1]
    layers = []
    image = lambda n: text(getattr(n, "image", None))  # noqa: E731

    def attribute(node, group, inherited):
        props = dict(inherited)
        props.update(layered_props(node))
        layers.append(["attribute", text(node.name), group, variant_of(props), flag(props, "default"), image(node)])

    for child in root.children:
        cls = type(child).__name__
        if cls == "RawAlways":
            layers.append(["always", image(child)])
        elif cls == "RawAttribute":
            attribute(child, None, {})
        elif cls == "RawAttributeGroup":
            props = layered_props(child)
            name = text(getattr(child, "group_name", None) or getattr(child, "group", None))
            group = None if flag(props, "multiple") else name
            inherited = dict((k, v) for k, v in props.items() if k not in ("default", "auto"))
            for a in child.children:
                if type(a).__name__ == "RawAttribute":
                    attribute(a, group, inherited)
            if flag(props, "auto"):
                layers.append(["auto", name, variant_of(props)])
        elif cls == "RawConditionGroup":
            for c in child.conditions:
                layers.append(["condition", text(c.condition), image(c)])
        elif cls == "RawCondition":
            layers.append(["condition", text(child.condition), image(child)])
    return [text(root.name), layers]


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


def main(root, out_path):
    projections = {}
    for dirpath, dirnames, files in os.walk(root):
        dirnames.sort()
        for filename in sorted(files):
            if not filename.endswith((".rpyc", ".rpymc")):
                continue
            full = os.path.join(dirpath, filename)
            with open(full, "rb") as f:
                _, stmts = pickle_safe_loads(payload(f.read()))
            out = []
            walk(stmts, out)
            projections[os.path.relpath(full, root).replace(os.sep, "/")] = out
    if out_path.endswith(".json.gz"):
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        text = json.dumps(projections, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
        with open(out_path, "wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as f:
                f.write(text.encode("ascii"))
    else:
        for rel, out in projections.items():
            target = os.path.join(out_path, rel + ".json")
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=0)
    sys.stderr.write("%d scripts projected to %s\n" % (len(projections), out_path))


if __name__ == "__main__":
    main(sys.argv[2], sys.argv[3])
