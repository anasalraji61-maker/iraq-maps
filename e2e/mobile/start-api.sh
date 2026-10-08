#!/usr/bin/env bash
# The API for the emulator flows, inside the CI job: migrations on the job's PostGIS, then the server in the
# background (APP_ENV=e2e with the fixed OTP sender, all from the job env). Returns once /health answers.
# M0 needs no seed data: login creates the user. Server logs: $API_LOG.
set -euo pipefail
cd "$(dirname "$0")/../.."
. e2e/mobile/lib.sh
log=${API_LOG:?}
mkdir -p "$(dirname "$log")"
pnpm --filter @iraq-maps/api migrate
nohup pnpm --filter @iraq-maps/api start >"$log" 2>&1 &
for _ in $(seq 90); do
  curl -fs -o /dev/null "http://localhost:${API_PORT:-3000}/health" && exit 0
  sleep 1
done
fail_with_tail "API did not become healthy" "$log"
