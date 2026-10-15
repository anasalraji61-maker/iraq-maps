#!/usr/bin/env bash
# Release APK for one ABI, the ADR-0009 way: CNG (expo prebuild), then Gradle with the JS bundle embedded through
# Metro + Hermes. Signing:
#   - If KEYSTORE_BASE64, KEYSTORE_ALIAS, KEYSTORE_PASSWORD, KEY_PASSWORD are all set, signs with the production
#     keystore (decoded from base64 into a temp file that is removed after the build). KEYSTORE_BASE64 must come
#     from a GitHub Secret — never put a keystore in the repo.
#   - Otherwise signs with the template debug key (no secrets needed, for CI on forks and dev builds).
# EXPO_PUBLIC_* values in the environment are inlined into the bundle, so EXPO_PUBLIC_APP_ENV must be set and
# Metro's transform cache, which does not key on them, is cleared first. On failure, a ::error annotation carries
# the Gradle/Metro log tail.
# Usage: EXPO_PUBLIC_APP_ENV=<env> e2e/mobile/build-apk.sh <abi> <out.apk>
set -euo pipefail
abi=$1 out=$2
: "${EXPO_PUBLIC_APP_ENV:?set the app environment of the build explicitly}"
cd "$(dirname "$0")/../.."
. e2e/mobile/lib.sh
log=${RUNNER_TEMP:-/tmp}/android-build-$abi.log
keystore_file=""

# Set up production keystore if all four secrets are present.
if [ -n "${KEYSTORE_BASE64:-}" ] && [ -n "${KEYSTORE_ALIAS:-}" ] && \
   [ -n "${KEYSTORE_PASSWORD:-}" ] && [ -n "${KEY_PASSWORD:-}" ]; then
  keystore_file=$(mktemp --suffix=.jks)
  echo "$KEYSTORE_BASE64" | base64 -d > "$keystore_file"
  # Gradle signing properties (read by apps/mobile/android/app/build.gradle via signingConfigs.release)
  export ANDROID_STORE_FILE="$keystore_file"
  export ANDROID_STORE_PASSWORD="$KEYSTORE_PASSWORD"
  export ANDROID_KEY_ALIAS="$KEYSTORE_ALIAS"
  export ANDROID_KEY_PASSWORD="$KEY_PASSWORD"
  echo "build-apk: using production keystore (alias: $KEYSTORE_ALIAS)"
else
  echo "build-apk: KEYSTORE_BASE64 not set — using debug key (dev/e2e build)"
fi

cleanup() { [ -n "$keystore_file" ] && rm -f "$keystore_file"; }
trap cleanup EXIT

rm -rf "${TMPDIR:-/tmp}/metro-cache"
{
  pnpm --filter @iraq-maps/mobile exec expo prebuild -p android --clean --no-install &&
    (cd apps/mobile/android && ./gradlew :app:assembleRelease -PreactNativeArchitectures="$abi" --no-daemon)
} 2>&1 | tee "$log" || fail_with_tail "Android $abi build failed" "$log"
cp apps/mobile/android/app/build/outputs/apk/release/app-release.apk "$out"
