# -*- coding: utf-8 -*-
"""Generates small RPA archives for the Phanes RPA reader tests.

The RPA-3.0 writer follows Ren'Py's own archiver (launcher/game/archiver.rpy,
Copyright Tom Rothamel, MIT license); the other variants follow the readers in
renpy/loader.py. Runs under Python 2.7 (Ren'Py 7 SDK) and Python 3.

Usage: python gen_rpa_cases.py OUTPUT_DIR TAG
Writes OUTPUT_DIR/<TAG>-*.rpa/.rpi plus OUTPUT_DIR/<TAG>-manifest.json.
"""
from __future__ import unicode_literals

import binascii
import hashlib
import json
import os
import pickle
import sys
import zlib

PY2 = sys.version_info[0] == 2
out_dir, tag = sys.argv[1], sys.argv[2]

FILES = [
    ("script.rpyc", b"RENPY RPC2 fake compiled script"),
    ("images/bg room.png", b"\x89PNG fake image"),
    ("audio/théme.ogg", b"OggS fake audio"),
    ("empty.txt", b""),
]


def name_key(name):
    # Ren'Py 7 (Python 2) passes byte strings or unicode depending on the
    # caller; keep both shapes covered: py2 str for ASCII names.
    if PY2:
        try:
            return name.encode("ascii").decode("ascii").encode("ascii")
        except UnicodeError:
            return name
    return name


def write_v3(path, key, prefix_len):
    index = {}
    with open(path, "wb") as f:
        f.write(b"RPA-3.0 XXXXXXXXXXXXXXXX XXXXXXXX\n")
        for name, data in FILES:
            f.write(b"Made with Ren'Py.")
            offset = f.tell()
            start = data[:prefix_len]
            rest = data[prefix_len:]
            f.write(rest)
            index[name_key(name)] = [(offset ^ key, len(rest) ^ key, start)]
        indexoff = f.tell()
        f.write(zlib.compress(pickle.dumps(index, pickle.HIGHEST_PROTOCOL)))
        f.seek(0)
        f.write(b"RPA-3.0 %016x %08x\n" % (indexoff, key))


def write_v2(path):
    index = {}
    with open(path, "wb") as f:
        f.write(b"RPA-2.0 XXXXXXXXXXXXXXXX\n")
        for name, data in FILES:
            offset = f.tell()
            f.write(data)
            index[name_key(name)] = [(offset, len(data))]
        indexoff = f.tell()
        f.write(zlib.compress(pickle.dumps(index, 2)))
        f.seek(0)
        f.write(b"RPA-2.0 %016x\n" % indexoff)


def write_v1(rpa_path, rpi_path):
    index = {}
    with open(rpa_path, "wb") as f:
        for name, data in FILES:
            offset = f.tell()
            f.write(data)
            index[name_key(name)] = [(offset, len(data))]
    with open(rpi_path, "wb") as f:
        f.write(zlib.compress(pickle.dumps(index, 2)))


def write_multipart(path, key):
    """Several (offset, length) segments for one file, plus a prefix."""
    index = {}
    payload = b"0123456789abcdef"
    with open(path, "wb") as f:
        f.write(b"RPA-3.0 XXXXXXXXXXXXXXXX XXXXXXXX\n")
        a = f.tell()
        f.write(payload[2:8])
        b = f.tell()
        f.write(payload[8:])
        index[name_key("split.bin")] = [(a ^ key, 6 ^ key, payload[:2]), (b ^ key, 8 ^ key)]
        indexoff = f.tell()
        f.write(zlib.compress(pickle.dumps(index, pickle.HIGHEST_PROTOCOL)))
        f.seek(0)
        f.write(b"RPA-3.0 %016x %08x\n" % (indexoff, key))
    return [("split.bin", payload)]


def write_big_index(path, key):
    """A zlib-compressed index for a virtual archive larger than 4 GiB."""
    entries = {
        "far/away.png": (5 * 2 ** 30 + 123, 4096),
        "near.rpyc": (40, 10),
        "edge.ogg": (6 * 2 ** 30 - 100, 100),
    }
    index = dict((name_key(n), [(o ^ key, l ^ key, b"")]) for n, (o, l) in entries.items())
    with open(path, "wb") as f:
        f.write(zlib.compress(pickle.dumps(index, pickle.HIGHEST_PROTOCOL)))
    return entries


manifest = {"python": "%d.%d" % sys.version_info[:2], "files": {}, "archives": {}}
for name, data in FILES:
    manifest["files"][name] = binascii.hexlify(data).decode("ascii")

base = os.path.join(out_dir, tag)
write_v3(base + "-v3.rpa", 0x42424242, 0)
manifest["archives"][tag + "-v3.rpa"] = {"version": "RPA-3.0", "key": 0x42424242}
write_v3(base + "-v3-prefix.rpa", 0x1BADB002, 4)
manifest["archives"][tag + "-v3-prefix.rpa"] = {"version": "RPA-3.0", "key": 0x1BADB002}
write_v2(base + "-v2.rpa")
manifest["archives"][tag + "-v2.rpa"] = {"version": "RPA-2.0", "key": None}
write_v1(base + "-v1.rpa", base + "-v1.rpi")
manifest["archives"][tag + "-v1.rpa"] = {"version": "RPA-1.0", "key": None, "rpi": tag + "-v1.rpi"}
split = write_multipart(base + "-multipart.rpa", 0x0F0F0F0F)
manifest["multipart"] = dict((n, binascii.hexlify(d).decode("ascii")) for n, d in split)
big = write_big_index(base + "-big-index.zlib", 0x42424242)
manifest["bigIndex"] = {"key": 0x42424242, "entries": dict((n, [o, l]) for n, (o, l) in big.items())}

with open(base + "-manifest.json", "wb") as f:
    f.write(json.dumps(manifest, indent=1, sort_keys=True, ensure_ascii=False).encode("utf-8"))
sys.stderr.write("written %s-*\n" % base)
