#!/usr/bin/env bash
# Runs inside the emulator (reactivecircus/android-emulator-runner): sets the system locale of an Iraqi phone (ar-IQ),
# installs the APK, then runs every Maestro flow: e2e/mobile/flows/*.yaml (launch-tabs) first, then each feature's
# mobile-features/*/maestro/*.yaml in path order (account/login, map/search-place, ...). The app's data is cleared
# before each flow, so every flow starts like a fresh install: signed out and in the device locale (Arabic), whatever
# the flow before it left behind. Flows get the job's fixed e2e OTP as ${OTP_CODE}. Each flow's screenshots
# (takeScreenshot with a relative name; Maestro 2 refuses paths outside its output folder), JUnit report, log and
# Maestro debug output go to <out-dir>, and screenshots-summary.sh then puts the screenshots in the job summary and log.
# A flow is rerun once only when its log shows a known emulator-infrastructure failure (INFRA: adb lost the device,
# or the Maestro driver on the device stopped answering). An app or assertion failure is never retried.
# Usage: e2e/mobile/run-flows.sh <apk> <out-dir>
set -uo pipefail
apk=$1 out=$2
cd "$(dirname "$0")/../.." || exit 1
INFRA='device offline|device .* not found|no devices/emulators found|io\.grpc\.StatusRuntimeException: (UNAVAILABLE|DEADLINE_EXCEEDED)'

# persist.sys.locale is read at boot; google_apis images allow adb root. Waits for the old boot to go away first,
# because sys.boot_completed is still 1 until the reboot has started.
set_system_locale() {
  adb root >/dev/null && adb wait-for-device && adb shell setprop persist.sys.locale "$1" && adb reboot || return 1
  for _ in $(seq 60); do adb shell true 2>/dev/null || break; sleep 1; done
  adb wait-for-device
  for _ in $(seq 150); do
    [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
    sleep 2
  done
  [ "$(adb shell getprop persist.sys.locale | tr -d '\r')" = "$1" ] && echo "system locale: $1"
}

mkdir -p "$out"
set_system_locale ar-IQ || exit 1
adb install -r "$apk" || exit 1
run() {
  mkdir -p "$out/$name"
  { adb shell pm clear iq.iraqmaps.app && maestro test -e OTP_CODE="${OTP_FIXED_CODE:?}" --test-output-dir "$out/$name" \
    --debug-output "$out/$name" --format junit --output "$out/$name.xml" "$flow"; } 2>&1 | tee "$out/$name.log"
}
failed=0
for flow in e2e/mobile/flows/*.yaml mobile-features/*/maestro/*.yaml; do
  [ -e "$flow" ] || continue
  name=$(echo "${flow%.yaml}" | tr / _)
  if run; then continue; fi
  if grep -Eq "$INFRA" "$out/$name.log"; then
    echo "::warning title=Emulator infrastructure failure::$flow, rerunning once"
    run && continue
  fi
  echo "::error title=Maestro flow failed::$flow"
  failed=1
done
e2e/mobile/screenshots-summary.sh "$out" || echo "::warning title=Screenshot summary::could not write the screenshots"
exit $failed
