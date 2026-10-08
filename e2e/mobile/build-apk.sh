#!/usr/bin/env bash
# Release APK for one ABI, the ADR-0009 way: CNG (expo prebuild), then Gradle with the JS bundle embedded through
# Metro + Hermes, signed with the template debug key (no secrets). EXPO_PUBLIC_* values in the environment are
# inlined into the bundle. On failure, a ::error annotation carries the Gradle/Metro log tail.
# Usage: e2e/mobile/build-apk.sh <abi> <out.apk>
set -euo pipefail
abi=$1 out=$2
cd "$(dirname "$0")/../.."
. e2e/mobile/lib.sh
log=${RUNNER_TEMP:-/tmp}/android-build-$abi.log
{
  pnpm --filter @iraq-maps/mobile exec expo prebuild -p android --clean --no-install &&
    (cd apps/mobile/android && ./gradlew :app:assembleRelease -PreactNativeArchitectures="$abi" --no-daemon)
} 2>&1 | tee "$log" || fail_with_tail "Android $abi build failed" "$log"
cp apps/mobile/android/app/build/outputs/apk/release/app-release.apk "$out"
