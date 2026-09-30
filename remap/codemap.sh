#!/usr/bin/env sh
# REMAP's wrapper for `pnpm codemap` — use it instead of the plain command in this copy.
#
# `pnpm codemap` also runs tools/gen-handover-html.mjs, which rebuilds REMAP_HANDOVER.html
# and embeds the four diagrams from diagrams/. That folder is missing from the download, so
# the regenerated page silently loses them. Until the folder is fetched from Josh's server,
# this puts the committed page back after the maps regenerate. Josh's tools are not edited.
#
# Run from anywhere:  sh remap/codemap.sh
set -e
cd "$(dirname "$0")/../jstack-app"
pnpm codemap
if [ ! -d ../diagrams ]; then
  git checkout -- ../REMAP_HANDOVER.html
  echo "codemap.sh: diagrams/ is missing — restored the committed REMAP_HANDOVER.html"
fi
