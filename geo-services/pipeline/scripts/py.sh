#!/bin/sh
# Runs Python inside geo-services/pipeline/.venv. The venv is (re)built from requirements.txt when
# its stamp is missing or older than requirements.txt. Setup is serialized with a lock because
# turbo runs `test` and `lint` in parallel.
set -eu
cd "$(dirname "$0")/.."
ready() { [ -f .venv/.stamp ] && [ ! requirements.txt -nt .venv/.stamp ]; }
if ! ready; then
  if command -v flock >/dev/null 2>&1; then
    exec 9>.venv.lock
    flock 9
  else # macOS has no flock
    until mkdir .venv.lockdir 2>/dev/null; do sleep 1; done
    trap 'rmdir .venv.lockdir' EXIT
  fi
  if ! ready; then
    rm -rf .venv
    python3 -m venv .venv
    .venv/bin/python -m pip install -q -r requirements.txt
    touch .venv/.stamp
  fi
  if [ -d .venv.lockdir ]; then trap - EXIT; rmdir .venv.lockdir; fi
  exec 9>&-
fi
exec .venv/bin/python "$@"
