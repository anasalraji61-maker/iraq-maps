#!/bin/sh
# Run Planetiler + Maven tests when Java, Maven, and network access to Maven Central are available.
# Skip gracefully when any prerequisite is absent (CI without JDK, cloud sandbox, no internet).
set -eu
cd "$(dirname "$0")/.."

if ! command -v java >/dev/null 2>&1 || ! command -v mvn >/dev/null 2>&1; then
  echo "geo-tiles: java or mvn not found — skipping tests (install JDK 21 + Maven to run them)" >&2
  exit 0
fi

# Check network access to Maven Central (needed for plugin resolution and dependency download).
if ! curl -sSf --max-time 5 https://repo.maven.apache.org/maven2/ >/dev/null 2>&1; then
  echo "geo-tiles: Maven Central unreachable — skipping tests (run with network access to Maven Central)" >&2
  exit 0
fi

sh scripts/planetiler.sh && mvn -q -B test
