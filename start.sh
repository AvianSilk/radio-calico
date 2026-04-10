#!/usr/bin/env bash
# Build and start Radio Calico in production mode.
# The app is available at http://localhost:3000 (override with PORT=XXXX ./start.sh)
set -euo pipefail

echo "Building production images (app + nginx)..."
docker compose build app nginx

echo "Starting postgres + app + nginx..."
docker compose up -d

echo "Done. App is available at http://localhost:${PORT:-80}"
echo "Logs: docker compose logs -f app nginx"
