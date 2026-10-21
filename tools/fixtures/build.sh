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
# Usage: tools/fixtures/build.sh [VERSION...]   (default: all pinned versions)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CACHE="$ROOT/tools/fixtures/.cache"
OUT="$ROOT/fixtures/build"

declare -A SHA256=(
  [6.99.14.3]=5cbeea134a1907e8a14458248013e37f39f0c2d023c7b68f6ee2bee574f7a381
  [7.4.11]=a73378f06a5925ea0d163b5825c298ed65dafb3d0cdccd9f34d7eace46adef1f
  [8.3.7]=13a221c1e2ac6730e7d369fef93153b79940fa8ae3ec3660abd94c67dea58f4e
  [8.5.3]=eb0a9be7f0fb13632fe25ceade9a8bed5a1b4d6b6e83bd19eeeb29e1a1bb4a45
)

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

for v in "${VERSIONS[@]}"; do
  fetch_sdk "$v"
  for game in "$ROOT"/fixtures/games/*/; do build_game "$v" "$(basename "$game")"; done
done
echo "fixtures written to $OUT"
