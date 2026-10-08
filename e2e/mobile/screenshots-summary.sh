#!/usr/bin/env bash
# Puts the flows' screenshots where reviewers can see them without the artifact host, which the auditors' network
# blocks (M0 follow-up). Every PNG under <out-dir> (takeScreenshot output and Maestro's failure screenshots) becomes a
# JPEG thumbnail (Thumbnails.java) that goes:
# - into $GITHUB_STEP_SUMMARY as a data-URI image: 480 px wide when all of them fit in ~900 KB (GitHub drops a step
#   summary over 1 MiB), else 240 px, and any that still do not fit are listed by name;
# - into the job log as base64 (480 px), one collapsed group per screenshot, which GitHub MCP get_job_logs can read.
# run-flows.sh calls it last. Usage: e2e/mobile/screenshots-summary.sh <out-dir>
set -euo pipefail
out=$1
summary=${GITHUB_STEP_SUMMARY:-/dev/null}
mapfile -t pngs < <(find "$out" -name '*.png' | sort)
[ ${#pngs[@]} -gt 0 ] || exit 0
thumbs=$(mktemp -d)
java -Djava.awt.headless=true "$(dirname "$0")/Thumbnails.java" "$thumbs" "${pngs[@]}"
budget=900000 # base64 characters
width=480
[ "$(cat "$thumbs"/*-480.jpg | wc -c)" -le $((budget * 3 / 4)) ] || width=240
printf '### Maestro screenshots (%s, %s px)\n\n' "${#pngs[@]}" "$width" >>"$summary"
for i in "${!pngs[@]}"; do
  name=${pngs[$i]#"$out"/}
  echo "::group::screenshot $name (480 px JPEG, base64)"
  base64 "$thumbs/$i-480.jpg"
  echo "::endgroup::"
  b64=$(base64 -w0 "$thumbs/$i-$width.jpg")
  if [ ${#b64} -le "$budget" ]; then
    budget=$((budget - ${#b64}))
    printf '**%s**\n\n<img src="data:image/jpeg;base64,%s" alt="%s">\n\n' "$name" "$b64" "$name" >>"$summary"
  else
    printf -- '- %s (not embedded: the summary is full; see the job log)\n' "$name" >>"$summary"
  fi
done
rm -rf "$thumbs"
