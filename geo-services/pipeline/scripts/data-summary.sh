#!/bin/sh
# What a data-<city>-<date> directory holds, as Markdown for the job log and $GITHUB_STEP_SUMMARY (geo-data.yml city-data):
#   sh scripts/data-summary.sh <dir written by city-data.sh>
# Imported records by kind (with how many have a name and a name:ar), places by category, then the files, the glyph
# range files with OFL.txt, and the head of ATTRIBUTION.txt.
set -eu
cd "$1"
fence() { echo "#### $1"; echo '```'; }
fence "places.ndjson: records by kind, with a name and with name:ar"
jq -sr 'group_by(.kind)[] | "\(.[0].kind): \(length) records, \(map(select((.names.name // "") != "")) | length) named, \(map(select((.names.ar // "") != "")) | length) with name:ar"' \
  places.ndjson
echo '```'
fence "places by category"
jq -r 'select(.kind == "place") | .category' places.ndjson | sort | uniq -c | sort -rn
echo '```'
fence "files"
du -sh *
for d in glyphs/*/; do
  echo "$(ls "$d" | grep -c '\.pbf$') range files in $d"
  ls -l "${d}OFL.txt"
done
echo '```'
fence "ATTRIBUTION.txt (first 20 lines)"
sed -n 1,20p ATTRIBUTION.txt
echo '```'
