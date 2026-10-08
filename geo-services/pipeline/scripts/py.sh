#!/bin/sh
# Runs Python inside geo-services/pipeline/.venv, (re)creating it when requirements.txt changes.
set -eu
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ] || [ requirements.txt -nt .venv/.stamp ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
  touch .venv/.stamp
fi
exec .venv/bin/python "$@"
