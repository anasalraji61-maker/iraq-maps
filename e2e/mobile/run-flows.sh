#!/usr/bin/env bash
# Runs inside the emulator (reactivecircus/android-emulator-runner): installs the APK, then every Maestro flow,
# e2e/mobile/flows/*.yaml and each feature's mobile-features/*/maestro/*.yaml. JUnit reports, logs and Maestro
# debug output (screenshots, view hierarchy) go to <out-dir>.
# A flow is rerun once only when its log shows a known emulator-infrastructure failure (INFRA: adb lost the device,
# or the Maestro driver on the device stopped answering). An app or assertion failure is never retried.
# Usage: e2e/mobile/run-flows.sh <apk> <out-dir>
set -uo pipefail
apk=$1 out=$2
cd "$(dirname "$0")/../.."
INFRA='device offline|device .* not found|no devices/emulators found|io\.grpc\.StatusRuntimeException: (UNAVAILABLE|DEADLINE_EXCEEDED)'
mkdir -p "$out"
adb install -r "$apk" || exit 1
failed=0
for flow in e2e/mobile/flows/*.yaml mobile-features/*/maestro/*.yaml; do
  [ -e "$flow" ] || continue
  name=$(echo "${flow%.yaml}" | tr / _)
  run() { maestro test --format junit --output "$out/$name.xml" --debug-output "$out/$name" "$flow" 2>&1 | tee "$out/$name.log"; }
  if run; then continue; fi
  if grep -Eq "$INFRA" "$out/$name.log"; then
    echo "::warning title=Emulator infrastructure failure::$flow, rerunning once"
    run && continue
  fi
  echo "::error title=Maestro flow failed::$flow"
  failed=1
done
exit $failed
