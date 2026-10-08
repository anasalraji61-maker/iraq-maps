#!/bin/sh
# Unified build CLI (CliContracts.tilesBuild and glyphsBuild in packages/contracts). It runs from the package directory,
# like pnpm does, so callers pass absolute paths.
#   tiles build --input <clipped.osm.pbf> --output <city.pmtiles> --bbox w,s,e,n   Planetiler (Java 21 + Maven)
#   tiles glyphs --output <dir>                                                    fontnik, Noto Sans Arabic (ADR-0008)
set -eu
cd "$(dirname "$0")/.."
usage() { echo "tiles: $1" >&2; sed -n 's/^#   tiles/usage: tiles/p' scripts/tiles.sh >&2; exit 2; }
case "${1:-}" in
  build)
    shift
    sh scripts/planetiler.sh
    mvn -q -B compile
    exec java -cp target/classes:.cache/planetiler.jar iq.iraqmaps.tiles.TilesCli "$@" ;;
  glyphs)
    [ $# -eq 3 ] && [ "$2" = --output ] && [ -n "$3" ] || usage "glyphs needs exactly --output <dir>"
    exec node scripts/glyphs.mjs "$3" ;;
  *) usage "unknown command '${1:-}'" ;;
esac
