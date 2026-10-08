#!/bin/sh
# The contents of the data-<city>-<date> artifact (ADR-0008), built from an OSM extract by geo-data.yml or locally:
#   sh scripts/city-data.sh <city id> <extract .osm.pbf|.osm, absolute> <output dir, absolute>
# 1. pipeline extract (CliContracts.pipelineExtract): <city>.osm.pbf (the clip), places.ndjson, city.json.
# 2. tiles build and glyphs (CliContracts.tilesBuild, glyphsBuild): <city>.pmtiles and glyphs/. Skipped with a
#    notice while geo-services/tiles/scripts/tiles.sh is still the frozen M1 stub.
# 3. ATTRIBUTION.txt: OSM (ODbL 1.0), and the font (OFL 1.1) when glyphs were built.
set -eu
city=$1 src=$2 out=$3
cd "$(dirname "$0")/.."
sh scripts/py.sh -m pipeline.extract --city "$city" --input "$src" --output "$out"
if grep -q 'not implemented' ../tiles/scripts/tiles.sh; then
  echo "::notice::geo-services/tiles is not implemented yet: the artifact has no PMTiles or glyphs"
else
  bbox=$(jq -r '.bbox | map(tostring) | join(",")' "$out/city.json")
  pnpm --filter @iraq-maps/geo-tiles tiles build --input "$out/$city.osm.pbf" --output "$out/$city.pmtiles" --bbox "$bbox"
  pnpm --filter @iraq-maps/geo-tiles tiles glyphs --output "$out/glyphs"
fi
ts=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$src")
{
  echo "Map data © OpenStreetMap contributors, https://www.openstreetmap.org/copyright"
  echo "places.ndjson is a derivative database of OpenStreetMap data, available under the Open Database License 1.0"
  echo "(https://opendatacommons.org/licenses/odbl/1-0/). $city.pmtiles, when present, is a produced work from the same data."
  echo "Source extract: ${src##*/}, OSM data as of ${ts:-unknown}."
  if [ -d "$out/glyphs" ]; then
    echo "glyphs/ is generated from Noto Sans Arabic, Copyright 2022 The Noto Project Authors,"
    echo "under the SIL Open Font License 1.1 (https://openfontlicense.org)."
  fi
} >"$out/ATTRIBUTION.txt"
