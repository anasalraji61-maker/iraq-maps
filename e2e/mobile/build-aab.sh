#!/usr/bin/env bash
# build-aab.sh — builds an Android App Bundle (AAB) for upload to Google Play.
# Like build-apk.sh but runs bundleRelease instead of assembleRelease.
# Signing: same env-var pattern — KEYSTORE_BASE64/KEYSTORE_ALIAS/KEYSTORE_PASSWORD/KEY_PASSWORD
# when set (GitHub Secrets), otherwise falls back to the debug key.
# Usage: EXPO_PUBLIC_APP_ENV=production e2e/mobile/build-aab.sh <out.aab>
set -euo pipefail
out=${1:?Usage: EXPO_PUBLIC_APP_ENV=production e2e/mobile/build-aab.sh <out.aab>}
: "${EXPO_PUBLIC_APP_ENV:?set the app environment of the build explicitly}"
cd "$(dirname "$0")/../.."
. e2e/mobile/lib.sh
log=${RUNNER_TEMP:-/tmp}/android-build-aab.log
keystore_file=""

# Set up production keystore if all four secrets are present.
if [ -n "${KEYSTORE_BASE64:-}" ] && [ -n "${KEYSTORE_ALIAS:-}" ] && \
   [ -n "${KEYSTORE_PASSWORD:-}" ] && [ -n "${KEY_PASSWORD:-}" ]; then
  keystore_file=$(mktemp --suffix=.jks)
  echo "$KEYSTORE_BASE64" | base64 -d > "$keystore_file"
  export ANDROID_STORE_FILE="$keystore_file"
  export ANDROID_STORE_PASSWORD="$KEYSTORE_PASSWORD"
  export ANDROID_KEY_ALIAS="$KEYSTORE_ALIAS"
  export ANDROID_KEY_PASSWORD="$KEY_PASSWORD"
  echo "build-aab: using production keystore (alias: $KEYSTORE_ALIAS)"
else
  echo "build-aab: KEYSTORE_BASE64 not set — using debug key (not suitable for Play Store upload)"
fi

cleanup() { [ -n "$keystore_file" ] && rm -f "$keystore_file"; }
trap cleanup EXIT

rm -rf "${TMPDIR:-/tmp}/metro-cache"
{
  pnpm --filter @iraq-maps/mobile exec expo prebuild -p android --clean --no-install &&
    (cd apps/mobile/android && ./gradlew :app:bundleRelease --no-daemon)
} 2>&1 | tee "$log" || fail_with_tail "Android AAB build failed" "$log"
cp apps/mobile/android/app/build/outputs/bundle/release/app-release.aab "$out"
