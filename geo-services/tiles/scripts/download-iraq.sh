#!/usr/bin/env bash
# download-iraq.sh — Download the latest Iraq OSM extract from Geofabrik.
#
# Data source: Geofabrik (https://download.geofabrik.de/asia/iraq.html)
# License: ODbL 1.0 — © OpenStreetMap contributors
# Attribution must be shown at all times in the app.
#
# Never use tile.openstreetmap.org or any other OSM tile CDN.
# Iraq bbox: 29.0–37.5 N, 38.5–48.8 E
#
# Usage:
#   ./scripts/download-iraq.sh [--output-dir <dir>] [--verify]
#
# Environment variables:
#   GEOFABRIK_BASE_URL   Override Geofabrik base URL (default: https://download.geofabrik.de)
#   OSM_DATA_DIR         Directory to store downloaded files (default: ./data/osm)
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GEOFABRIK_BASE="${GEOFABRIK_BASE_URL:-https://download.geofabrik.de}"
REGION="asia/iraq"
EXTRACT_URL="${GEOFABRIK_BASE}/${REGION}-latest.osm.pbf"
MD5_URL="${GEOFABRIK_BASE}/${REGION}-latest.osm.pbf.md5"

DATA_DIR="${OSM_DATA_DIR:-$(dirname "$0")/../data/osm}"
PBF_FILE="${DATA_DIR}/iraq-latest.osm.pbf"
MD5_FILE="${DATA_DIR}/iraq-latest.osm.pbf.md5"

DO_VERIFY=false

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      DATA_DIR="$2"; PBF_FILE="${DATA_DIR}/iraq-latest.osm.pbf"; MD5_FILE="${DATA_DIR}/iraq-latest.osm.pbf.md5"
      shift 2 ;;
    --verify)
      DO_VERIFY=true; shift ;;
    *)
      echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mkdir -p "${DATA_DIR}"
echo "[download-iraq] Data directory: ${DATA_DIR}"
echo "[download-iraq] Source: ${EXTRACT_URL}"

# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------
echo "[download-iraq] Downloading Iraq OSM extract …"
curl \
  --location \
  --progress-bar \
  --retry 3 \
  --retry-delay 10 \
  --user-agent "IraqSmartMaps/1.0 (geo-pipeline; ODbL)" \
  --output "${PBF_FILE}" \
  "${EXTRACT_URL}"

echo "[download-iraq] Downloading MD5 checksum …"
curl \
  --location \
  --silent \
  --retry 3 \
  --output "${MD5_FILE}" \
  "${MD5_URL}"

# ---------------------------------------------------------------------------
# Verify checksum
# ---------------------------------------------------------------------------
if [[ "${DO_VERIFY}" == "true" ]]; then
  echo "[download-iraq] Verifying MD5 checksum …"
  pushd "${DATA_DIR}" > /dev/null
  md5sum --check "$(basename "${MD5_FILE}")" || {
    echo "[download-iraq] ERROR: checksum verification failed!" >&2
    exit 1
  }
  popd > /dev/null
  echo "[download-iraq] Checksum OK."
fi

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
PBF_SIZE=$(du -sh "${PBF_FILE}" | cut -f1)
echo "[download-iraq] Downloaded: ${PBF_FILE} (${PBF_SIZE})"
echo "[download-iraq] Attribution: Map data © OpenStreetMap contributors (ODbL)"
echo "[download-iraq] Done."
