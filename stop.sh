#!/usr/bin/env bash
# Stop all Radio Calico containers (prod and/or dev + postgres).
# Pass --volumes to also remove the postgres data volume.
set -euo pipefail

docker compose --profile dev down "$@"
echo "All containers stopped."
