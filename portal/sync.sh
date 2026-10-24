#!/bin/bash
# Sync the portal extension source (single source of truth: repo portal/extension/)
# into the v3 test env portal app. The portal app never holds local edits.
set -euo pipefail
cd "$(dirname "$0")"
DEST="$HOME/approval-v3-dev/main/src/extensions/nocobase-workflow-approval"
[ -d extension ] || { echo "portal/extension missing — nothing to sync"; exit 1; }
mkdir -p "$(dirname "$DEST")"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete extension/ "$DEST"/
else
  # rsync unavailable (e.g. minimal dev box): mirror via cp with a clean destination
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -a extension/. "$DEST"/
fi
echo "synced portal/extension/ → $DEST"
echo "next: cd ~/approval-v3-dev/main && pnpm build"
