#!/bin/sh
# Fetches the Planetiler distribution jar into .cache/planetiler.jar and checks its SHA-256 (ADR-0008).
# Keep the version in step with pom.xml.
set -eu
cd "$(dirname "$0")/.."
URL=https://github.com/onthegomap/planetiler/releases/download/v0.10.2/planetiler.jar
SHA=f310bd0413e2e4512b27f4046d418664e8e1d3bf31603c2a70e23de06c167e4d
JAR=.cache/planetiler.jar
sum() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$JAR"; else shasum -a 256 "$JAR"; fi | cut -d' ' -f1; }
[ -f "$JAR" ] && [ "$(sum)" = "$SHA" ] && exit 0
mkdir -p .cache
curl -sSfL --retry 3 -o "$JAR" "$URL"
[ "$(sum)" = "$SHA" ] || { rm -f "$JAR"; echo "planetiler.jar: SHA-256 mismatch" >&2; exit 1; }
