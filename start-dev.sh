#!/usr/bin/env bash
# Build and start Radio Calico in development mode (nodemon + source bind-mount).
# The app is available at http://localhost:3000 (override with PORT=XXXX ./start-dev.sh)
set -euo pipefail

echo "Building dev image..."
docker compose --profile dev build dev

echo "Starting postgres + dev (attached — Ctrl+C to stop)..."
docker compose --profile dev up dev
