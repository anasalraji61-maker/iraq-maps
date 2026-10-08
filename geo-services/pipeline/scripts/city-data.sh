#!/bin/sh
# The contents of the data-<city>-<date> artifact (ADR-0008), built from an OSM extract by geo-data.yml or locally:
#   sh scripts/city-data.sh <city id> <extract .osm.pbf|.osm, absolute> <output dir, absolute>
# 1. pipeline extract (CliContracts.pipelineExtract): <city>.osm.pbf (the clip), places.ndjson, city.json.
# 2. tiles build and glyphs (CliContracts.tilesBuild, glyphsBuild; Java 21 + Maven, node): <city>.pmtiles and
#    glyphs/<fontstack>/ with OFL.txt.
# 3. ATTRIBUTION.txt: OSM (ODbL 1.0, with the ODbL 4.6 method pointer: repository, commit, tools) and the font (OFL 1.1).
set -eu
city=$1 src=$2 out=$3
cd "$(dirname "$0")/.."
sh scripts/py.sh -m pipeline.extract --city "$city" --input "$src" --output "$out"
bbox=$(jq -r '.bbox | map(tostring) | join(",")' "$out/city.json")
pnpm --filter @iraq-maps/geo-tiles tiles build --input "$out/$city.osm.pbf" --output "$out/$city.pmtiles" --bbox "$bbox" \
  --city "$PWD/cities/$city.yaml" # absolute: the tiles CLI runs from geo-services/tiles
pnpm --filter @iraq-maps/geo-tiles tiles glyphs --output "$out/glyphs"
ts=$(osmium fileinfo -g header.option.osmosis_replication_timestamp "$src")
repo=${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-anasalraji61-maker/iraq-maps}
sha=${GITHUB_SHA:-$(git rev-parse HEAD)}
cat >"$out/ATTRIBUTION.txt" <<TXT
Map data © OpenStreetMap contributors, https://www.openstreetmap.org/copyright
places.ndjson (a derivative database) and $city.pmtiles (a produced work) are made from OpenStreetMap data and are
both offered under the Open Database License 1.0 (https://opendatacommons.org/licenses/odbl/1-0/).
Source extract: ${src##*/}, OSM data as of ${ts:-unknown}.
Method (ODbL 4.6): $repo at commit $sha:
geo-services/pipeline (pipeline extract, scripts/city-data.sh) and geo-services/tiles (tiles build, tiles glyphs).
glyphs/ is generated from Noto Sans Arabic, Copyright 2022 The Noto Project Authors, under the SIL Open Font
License 1.1; the full licence text is in glyphs/*/OFL.txt.
TXT
