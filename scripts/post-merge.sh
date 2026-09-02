#!/usr/bin/env bash
set -Eeuo pipefail

echo "[post-merge] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[post-merge] Synchronizing the development database schema..."
if ! pnpm --filter @workspace/db run push-force; then
  echo "[post-merge] ERROR: development database schema synchronization failed." >&2
  echo "[post-merge] The preview may not start correctly until the database matches lib/db/src/schema." >&2
  exit 1
fi

echo "[post-merge] Setup completed successfully."
