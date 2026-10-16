#!/usr/bin/env bash
# serve-tiles.sh — Serve iraq.pmtiles locally for development.
#
# Uses martin (https://maplibre.org/martin/) as the PMTiles tile server.
# License: Apache 2.0; tiles remain ODbL.
# Attribution: "Map data © OpenStreetMap contributors"
#
# Usage:
#   ./scripts/serve-tiles.sh [--port <port>] [--tiles <pmtiles-file>]
#
# Environment variables:
#   TILES_PORT        Port to listen on (default: 3000)
#   TILES_OUTPUT_DIR  Directory containing iraq.pmtiles (default: ./data/tiles)
#   MARTIN_BIN        Path to martin binary (default: martin)
set -euo pipefail

TILES_PORT="${TILES_PORT:-3000}"
OUTPUT_DIR="${TILES_OUTPUT_DIR:-$(dirname "$0")/../data/tiles}"
PMTILES_FILE="${OUTPUT_DIR}/iraq.pmtiles"
MARTIN="${MARTIN_BIN:-martin}"
CONFIG_FILE="$(dirname "$0")/../configs/tile-server.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)  TILES_PORT="$2";  shift 2 ;;
    --tiles) PMTILES_FILE="$2"; shift 2 ;;
    *)       echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f "${PMTILES_FILE}" ]]; then
  echo "[serve-tiles] ERROR: PMTiles file not found: ${PMTILES_FILE}" >&2
  echo "[serve-tiles] Run build-tiles.sh first." >&2
  exit 1
fi

if ! command -v "${MARTIN}" &> /dev/null; then
  echo "[serve-tiles] ERROR: 'martin' not found. Install from: https://maplibre.org/martin/" >&2
  exit 1
fi

echo "[serve-tiles] Serving: ${PMTILES_FILE}"
echo "[serve-tiles] Port:    ${TILES_PORT}"
echo "[serve-tiles] URL:     http://localhost:${TILES_PORT}"
echo "[serve-tiles] Attribution: Map data © OpenStreetMap contributors (ODbL)"
echo "[serve-tiles] Press Ctrl-C to stop."

exec "${MARTIN}" \
  --config "${CONFIG_FILE}" \
  --listen-addresses "0.0.0.0:${TILES_PORT}" \
  "${PMTILES_FILE}"
