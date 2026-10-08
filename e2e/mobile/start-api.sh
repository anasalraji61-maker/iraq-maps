#!/usr/bin/env bash
# The API for the emulator flows, inside the CI job: migrations on the job's PostGIS, the fixture city, then the server
# in the background (APP_ENV=e2e with the fixed OTP sender, all from the job env). Returns once /health answers.
# The fixture city is the pipeline's output for the CC0 fixture baghdad-mini.osm.xml (places.ndjson, city.json and the
# clipped baghdad.osm.pbf in geo-services/pipeline/tests/fixtures/baghdad-mini). Its tiles and glyphs are built with
# the CliContracts commands (tiles build, tiles glyphs; ADR-0008) and the places are imported, then the API serves the
# tiles and glyphs through its fallback routes (TILES_SOURCE, GLYPHS_SOURCE), so the map needs no network.
# Everything goes to $CITY_DATA, and a build step is skipped when its output is already there, so a prebuilt data
# directory (an unzipped data-baghdad-<date> artifact) can stand in. Tiles need Java 21 and Maven. Logs: $API_LOG.
set -euo pipefail
cd "$(dirname "$0")/../.."
. e2e/mobile/lib.sh
log=${API_LOG:?}
data=${CITY_DATA:-${RUNNER_TEMP:-/tmp}/city-data}
mkdir -p "$(dirname "$log")" "$data"
data=$(realpath "$data") # the CLIs run from their own package directories
pnpm --filter @iraq-maps/api migrate

[ -s "$data/places.ndjson" ] || cp geo-services/pipeline/tests/fixtures/baghdad-mini/* "$data/"
[ -s "$data/baghdad.pmtiles" ] ||
  pnpm --filter @iraq-maps/geo-tiles tiles build --input "$data/baghdad.osm.pbf" --output "$data/baghdad.pmtiles" \
    --bbox "$(jq -r '.bbox | join(",")' "$data/city.json")"
[ -d "$data/glyphs" ] || pnpm --filter @iraq-maps/geo-tiles tiles glyphs --output "$data/glyphs"
# `run`: a bare `pnpm import` is pnpm's own command.
pnpm --filter @iraq-maps/places run import --city "$data/city.json" --input "$data/places.ndjson"

export TILES_SOURCE="$data/{city}.pmtiles" GLYPHS_SOURCE="$data/glyphs"
nohup pnpm --filter @iraq-maps/api start >"$log" 2>&1 &
for _ in $(seq 90); do
  curl -fs -o /dev/null "http://localhost:${API_PORT:-3000}/health" && exit 0
  sleep 1
done
fail_with_tail "API did not become healthy" "$log"
