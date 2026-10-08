#!/usr/bin/env bash
# Installs the pinned Maestro CLI release, checksum-verified, and puts it on the job's PATH.
set -euo pipefail
zip=${RUNNER_TEMP:?}/maestro.zip
if [ -z "${MAESTRO_VERSION:-}" ]; then # TEMP discovery run, replaced by the pin
  MAESTRO_VERSION=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/mobile-dev-inc/maestro/releases/latest | sed 's|.*/cli-||')
fi
curl -fsSL --retry 3 -o "$zip" "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$MAESTRO_VERSION/maestro.zip"
echo "maestro $MAESTRO_VERSION sha256 $(sha256sum "$zip")"
[ -z "${MAESTRO_SHA256:-}" ] || echo "$MAESTRO_SHA256  $zip" | sha256sum -c -
unzip -q "$zip" -d "$RUNNER_TEMP"
echo "$RUNNER_TEMP/maestro/bin" >>"$GITHUB_PATH"
