# shellcheck shell=bash
# Sourced by the e2e/mobile scripts.

# fail_with_tail <title> <log>: a ::error annotation carrying the log's last lines, then exit 1.
fail_with_tail() {
  echo "::error title=$1::$(tail -n 60 "$2" | sed 's/%/%25/g; s/\r//g' | awk '{ printf "%s%%0A", $0 }')"
  exit 1
}
