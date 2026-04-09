#!/usr/bin/env bash
# Build and start Radio Calico in production mode.
# The app is available at http://localhost:3000 (override with PORT=XXXX ./start.sh)
set -euo pipefail

echo "Building production image..."
docker compose build prod

echo "Starting postgres + prod..."
docker compose up -d

echo "Done. Logs: docker compose logs -f prod"
