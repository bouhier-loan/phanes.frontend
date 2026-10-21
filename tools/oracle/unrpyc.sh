#!/usr/bin/env bash
# Human-readable references from unrpyc (MIT), pinned to a commit:
#   fixtures/expected/<sdk>/<game>/unrpyc/<path>.txt   `unrpyc --dump --comparable`
#   fixtures/expected/<sdk>/<game>/unrpyc/<path>.rpy   decompiled source
# Usage: tools/oracle/unrpyc.sh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CACHE="$ROOT/tools/oracle/.cache"
UNRPYC_COMMIT=3ae8334ed71a05535927dcc559663d3aca51215b

if [ ! -d "$CACHE/unrpyc" ]; then
  git clone -q https://github.com/CensoredUsername/unrpyc.git "$CACHE/unrpyc"
fi
git -C "$CACHE/unrpyc" checkout -q "$UNRPYC_COMMIT"

for build in "$ROOT"/fixtures/build/*/*/; do
  rel=${build#"$ROOT/fixtures/build/"}
  out="$ROOT/fixtures/expected/${rel%/}/unrpyc"
  work=$(mktemp -d)
  cp -r "$build/project/game" "$work/game"
  find "$work/game" -name '*.rpy' -delete
  (cd "$work" && python3 "$CACHE/unrpyc/unrpyc.py" --dump --comparable game >/dev/null)
  (cd "$work" && python3 "$CACHE/unrpyc/unrpyc.py" game >/dev/null)
  rm -rf "$out"
  mkdir -p "$out"
  (cd "$work/game" && find . \( -name '*.txt' -o -name '*.rpy' \) -print0 | xargs -0 -I{} cp --parents {} "$out")
  rm -rf "$work"
  echo "unrpyc references written to $out"
done
