#!/bin/sh
# Build the demo widgets into single-file ES modules that MyST can embed.
#
#     scripts/build_widgets.sh            # bundle widgets/src/* -> widgets/*.js
#     scripts/build_widgets.sh --sync     # first refresh widgets/framesig/ from Frame_validation
#
# widgets/framesig/ is a copy of Frame_validation's browser implementation
# (web/framesig/), so the site builds without access to that repository. The
# demo keys and sample files in demo/ come from Frame_validation's
# tools/make_site_demo.py. Set FRAMESIG_REPO if Frame_validation is not
# checked out next to this repository.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
cd "$HERE"

if [ "${1:-}" = "--sync" ]; then
  SRC=${FRAMESIG_REPO:-"$HERE/../Frame_validation"}
  rm -rf widgets/framesig
  mkdir -p widgets/framesig
  cp "$SRC"/web/framesig/*.js widgets/framesig/
  commit=$(git -C "$SRC" rev-parse HEAD)
  changes=$(git -C "$SRC" status --porcelain web/framesig)
  {
    echo "Copied from Frame_validation web/framesig/ at commit $commit."
    if [ -n "$changes" ]; then echo "The copy included uncommitted changes:"; echo "$changes"; fi
  } > widgets/framesig/SOURCE.txt
  echo "synced widgets/framesig/ from $SRC ($commit)"
fi

for w in verify-demo sign-demo; do
  npx --yes esbuild@0.24.0 "widgets/src/$w.js" --bundle --format=esm --target=es2020 \
    --loader:.pem=text --loader:.cbf=base64 --legal-comments=none \
    --banner:js="// Built by scripts/build_widgets.sh from widgets/src/$w.js. Do not edit." \
    --outfile="widgets/$w.js" --log-level=warning
  echo "built widgets/$w.js ($(wc -c < "widgets/$w.js" | tr -d ' ') bytes)"
done
