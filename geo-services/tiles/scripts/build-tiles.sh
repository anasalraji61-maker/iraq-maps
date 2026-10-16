#!/usr/bin/env bash
# build-tiles.sh — Generate PMTiles for Iraq using Planetiler.
#
# Input:  iraq-latest.osm.pbf  (from download-iraq.sh)
# Output: iraq.pmtiles          (served via serve-tiles.sh or uploaded to S3)
#
# Planetiler: https://github.com/onthegomap/planetiler
# License: Apache 2.0; OSM data remains ODbL.
# Attribution: "Map data © OpenStreetMap contributors"
#
# Usage:
#   ./scripts/build-tiles.sh [--input <pbf>] [--output <pmtiles>] [--config <yml>]
#
# Environment variables:
#   PLANETILER_JAR    Path to the Planetiler jar (default: /opt/planetiler/planetiler.jar)
#   OSM_DATA_DIR      OSM data directory (default: ./data/osm)
#   TILES_OUTPUT_DIR  Output directory (default: ./data/tiles)
#   JAVA_OPTS         Extra JVM options (default: -Xmx6g)
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PLANETILER_JAR="${PLANETILER_JAR:-/opt/planetiler/planetiler.jar}"
DATA_DIR="${OSM_DATA_DIR:-$(dirname "$0")/../data/osm}"
OUTPUT_DIR="${TILES_OUTPUT_DIR:-$(dirname "$0")/../data/tiles}"
CONFIG_DIR="$(dirname "$0")/../configs"

INPUT_PBF="${DATA_DIR}/iraq-latest.osm.pbf"
OUTPUT_PMTILES="${OUTPUT_DIR}/iraq.pmtiles"
CONFIG_YML="${CONFIG_DIR}/planetiler-iraq.yml"

JAVA_OPTS="${JAVA_OPTS:--Xmx6g}"

# Iraq bbox: minLon minLat maxLon maxLat
BBOX="38.5,29.0,48.8,37.5"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)   INPUT_PBF="$2";      shift 2 ;;
    --output)  OUTPUT_PMTILES="$2"; shift 2 ;;
    --config)  CONFIG_YML="$2";     shift 2 ;;
    *)         echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [[ ! -f "${INPUT_PBF}" ]]; then
  echo "[build-tiles] ERROR: Input PBF not found: ${INPUT_PBF}" >&2
  echo "[build-tiles] Run download-iraq.sh first." >&2
  exit 1
fi

if [[ ! -f "${PLANETILER_JAR}" ]]; then
  echo "[build-tiles] ERROR: Planetiler JAR not found: ${PLANETILER_JAR}" >&2
  echo "[build-tiles] Download from https://github.com/onthegomap/planetiler/releases" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
echo "[build-tiles] Input:   ${INPUT_PBF}"
echo "[build-tiles] Output:  ${OUTPUT_PMTILES}"
echo "[build-tiles] Config:  ${CONFIG_YML}"
echo "[build-tiles] Bbox:    ${BBOX}"
echo "[build-tiles] Java:    ${JAVA_OPTS}"
echo "[build-tiles] Starting Planetiler …"

java ${JAVA_OPTS} \
  -jar "${PLANETILER_JAR}" \
  --config="${CONFIG_YML}" \
  --osm-path="${INPUT_PBF}" \
  --output="${OUTPUT_PMTILES}" \
  --bounds="${BBOX}" \
  --threads="$(nproc)" \
  --force \
  --nodemap-type=array \
  --nodemap-storage=mmap

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ -f "${OUTPUT_PMTILES}" ]]; then
  SIZE=$(du -sh "${OUTPUT_PMTILES}" | cut -f1)
  echo "[build-tiles] Output file: ${OUTPUT_PMTILES} (${SIZE})"
  echo "[build-tiles] Attribution: Map data © OpenStreetMap contributors (ODbL)"
  echo "[build-tiles] Done. Serve with: ./scripts/serve-tiles.sh"
else
  echo "[build-tiles] ERROR: Output file not created." >&2
  exit 1
fi
