#!/usr/bin/env bash
# Builds the Phanes fixtures with pinned Ren'Py SDKs.
#
# For every SDK version and every game in fixtures/games, writes:
#   fixtures/build/<version>/<game>/project/  the project after `compile`
#                                             (.rpy + .rpyc, log.txt)
#   fixtures/build/<version>/<game>/dist/     the Linux distribution built by the
#                                             launcher (archives, loose files),
#                                             without lib/ and most of renpy/
#
# and, for the games the SDK ships (CORPUS below), a realistic corpus:
#   fixtures/corpus/<version>/<game>/         the compiled scripts as shipped,
#                                             renpy/ version files, and files.json
#                                             (path and size of every other file,
#                                             read back as empty virtual files)
#
# A game with a sdks.txt file is only built with the versions it lists.
#
# Usage: tools/fixtures/build.sh [--corpus | --game NAME] [VERSION...]
#   (default: all pinned versions; --corpus only rebuilds the corpus,
#   --game only rebuilds one game of fixtures/games)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CACHE="$ROOT/tools/fixtures/.cache"
OUT="$ROOT/fixtures/build"
CORPUS_OUT="$ROOT/fixtures/corpus"

declare -A SHA256=(
  [6.99.14.3]=5cbeea134a1907e8a14458248013e37f39f0c2d023c7b68f6ee2bee574f7a381
  [7.4.11]=a73378f06a5925ea0d163b5825c298ed65dafb3d0cdccd9f34d7eace46adef1f
  [8.3.7]=13a221c1e2ac6730e7d369fef93153b79940fa8ae3ec3660abd94c67dea58f4e
  [8.5.3]=eb0a9be7f0fb13632fe25ceade9a8bed5a1b4d6b6e83bd19eeeb29e1a1bb4a45
)

# Games shipped with each SDK, compiled by that SDK, kept as a test corpus.
declare -A CORPUS=(
  [6.99.14.3]="the_question"
  [7.4.11]="the_question"
  [8.3.7]="the_question"
  [8.5.3]="the_question tutorial"
)

ONLY_CORPUS=false
ONLY_GAME=""
if [ "${1:-}" = "--corpus" ]; then
  ONLY_CORPUS=true
  shift
elif [ "${1:-}" = "--game" ]; then
  ONLY_GAME=$2
  shift 2
fi
if [ "$#" -gt 0 ]; then VERSIONS=("$@"); else VERSIONS=(6.99.14.3 7.4.11 8.3.7 8.5.3); fi

export SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy

fetch_sdk() {
  local v=$1 tarball="$CACHE/renpy-$1-sdk.tar.bz2"
  mkdir -p "$CACHE"
  if [ ! -f "$tarball" ]; then
    curl -sSfL -o "$tarball" "https://www.renpy.org/dl/$v/renpy-$v-sdk.tar.bz2"
  fi
  echo "${SHA256[$v]}  $tarball" | sha256sum -c --quiet -
  if [ ! -d "$CACHE/renpy-$v-sdk" ]; then tar -xjf "$tarball" -C "$CACHE"; fi
}

copy_tree() { # copy_tree SRC DEST, skipping caches and saves
  mkdir -p "$2"
  (cd "$1" && find . -type f ! -path './cache/*' ! -path './saves/*' ! -name '*.bak' -print0 |
    xargs -0 -I{} cp --parents {} "$2")
}

build_game() {
  local v=$1 game=$2 sdk="$CACHE/renpy-$1-sdk"
  local work dest
  work=$(mktemp -d)
  dest="$OUT/$v/$game"
  cp -r "$ROOT/fixtures/games/$game" "$work/$game"

  echo "== $v / $game: compile"
  (cd "$sdk" && ./renpy.sh "$work/$game" compile >/dev/null)

  echo "== $v / $game: distribute"
  local format=()
  if grep -q -- '"--format"' "$sdk/launcher/game/distribute.rpy"; then format=(--format directory); fi
  (cd "$sdk" && ./renpy.sh launcher distribute "$work/$game" --package linux \
    --destination "$work/dist" --no-update "${format[@]}" >/dev/null)
  for archive in "$work"/dist/*.tar.bz2; do [ -f "$archive" ] && tar -xjf "$archive" -C "$work/dist"; done
  for archive in "$work"/dist/*.zip; do [ -f "$archive" ] && (cd "$work/dist" && unzip -q "$archive"); done
  local distdir
  distdir=$(find "$work/dist" -mindepth 1 -maxdepth 1 -type d | head -n 1)

  rm -rf "$dest"
  mkdir -p "$dest/project" "$dest/dist"
  copy_tree "$work/$game/game" "$dest/project/game"
  [ -f "$work/$game/log.txt" ] && cp "$work/$game/log.txt" "$dest/project/log.txt"
  copy_tree "$distdir/game" "$dest/dist/game"
  for f in renpy/vc_version.py renpy/__init__.py; do
    if [ -f "$distdir/$f" ]; then mkdir -p "$dest/dist/renpy" && cp "$distdir/$f" "$dest/dist/$f"; fi
  done
  find "$distdir" -maxdepth 1 -type f \( -name '*.sh' -o -name '*.py' \) -exec cp {} "$dest/dist/" \;
  rm -rf "$work"
}

build_corpus() { # build_corpus VERSION GAME
  local v=$1 game=$2 sdk="$CACHE/renpy-$1-sdk"
  local dest="$CORPUS_OUT/$v/$game"
  echo "== $v / $game: corpus"
  rm -rf "$dest"
  mkdir -p "$dest/renpy"
  (cd "$sdk/$game" && find . -type f \( -name '*.rpyc' -o -name '*.rpymc' \) -print0 |
    xargs -0 -I{} cp --parents {} "$dest")
  cp "$sdk/renpy/vc_version.py" "$dest/renpy/"
  # Up to 7.x, vc_version.py only has the commit number: the version is in __init__.py.
  grep -q '^version = ' "$sdk/renpy/vc_version.py" || cp "$sdk/renpy/__init__.py" "$dest/renpy/"
  python3 -I - "$sdk/$game" "$dest/files.json" <<'PY'
import json, os, sys
root, out = sys.argv[1], sys.argv[2]
files = []
for dirpath, dirnames, filenames in os.walk(root):
    dirnames.sort()
    for name in sorted(filenames):
        if name.endswith((".rpyc", ".rpymc")):
            continue
        full = os.path.join(dirpath, name)
        files.append([os.path.relpath(full, root).replace(os.sep, "/"), os.path.getsize(full)])
with open(out, "w", encoding="utf-8") as f:
    f.write("[\n" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in files) + "\n]\n")
PY
}

for v in "${VERSIONS[@]}"; do
  fetch_sdk "$v"
  if ! $ONLY_CORPUS; then
    for game in "$ROOT"/fixtures/games/*/; do
      name=$(basename "$game")
      if [ -n "$ONLY_GAME" ] && [ "$name" != "$ONLY_GAME" ]; then continue; fi
      if [ -f "$game/sdks.txt" ] && ! grep -qx "$v" "$game/sdks.txt"; then continue; fi
      build_game "$v" "$name"
    done
  fi
  if [ -z "$ONLY_GAME" ]; then
    for game in ${CORPUS[$v]:-}; do build_corpus "$v" "$game"; done
  fi
done
echo "fixtures written to $OUT and $CORPUS_OUT"
