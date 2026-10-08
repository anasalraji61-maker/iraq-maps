#!/usr/bin/env bash
# Installs the pinned Maestro CLI release, checksum-verified, and puts it on the job's PATH.
set -euo pipefail
zip=${RUNNER_TEMP:?}/maestro.zip
curl -fsSL --retry 3 -o "$zip" "https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION:?}/maestro.zip"
echo "${MAESTRO_SHA256:?}  $zip" | sha256sum -c -
unzip -q "$zip" -d "$RUNNER_TEMP"
echo "$RUNNER_TEMP/maestro/bin" >>"$GITHUB_PATH"
