#!/bin/sh
# Downloads an OSM extract and its .md5 (Geofabrik layout) with retries, checks the md5 and prints the file info.
#   sh scripts/fetch-extract.sh https://download.geofabrik.de/asia/iraq-latest.osm.pbf <dir>
set -eu
url=$1 dir=$2
f=$dir/${url##*/}
mkdir -p "$dir"
get() { curl -fsSL --retry 5 --retry-delay 20 --retry-all-errors --connect-timeout 30 -o "$1" "$2"; }
get "$f" "$url"
get "$f.md5" "$url.md5"
(cd "$dir" && md5sum -c "${f##*/}.md5")
osmium fileinfo "$f"
