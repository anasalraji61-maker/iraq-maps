#!/usr/bin/env bash
# store-assets.sh — copies Maestro e2e screenshots into the Play Store screenshots folder.
# Run after a Maestro e2e run to populate store/screenshots/ with the best shots.
# Usage: scripts/store-assets.sh <e2e-output-dir>
set -euo pipefail
out=${1:?Usage: store-assets.sh <e2e-output-dir>}
target=store/screenshots
mkdir -p "$target"

# Map: flow output name → store screenshot label (what this screenshot shows)
declare -A MAP=(
  ["e2e_mobile_flows_mvp-journey/map-home"]="01-map-home"
  ["e2e_mobile_flows_mvp-journey/search-results"]="02-search-results"
  ["e2e_mobile_flows_mvp-journey/place-card"]="03-place-card"
  ["e2e_mobile_flows_mvp-journey/assistant-response"]="04-assistant"
  ["e2e_mobile_flows_mvp-journey/messaging-confirm"]="05-messaging"
  ["e2e_mobile_flows_mvp-journey/messaging-sent"]="06-messaging-sent"
  ["mobile-features_messages_maestro_send-inquiry/messaging-confirm"]="07-inquiry-confirm"
  ["mobile-features_provider_maestro_reply/provider-reply-sent"]="08-provider-inbox"
  ["mobile-features_discover_maestro_create-post/discover-post-created"]="09-discover"
  ["mobile-features_assistant_maestro_chat/assistant-chat"]="10-assistant-chat"
)

copied=0
for flow_path in "${!MAP[@]}"; do
  label="${MAP[$flow_path]}"
  src="$out/$flow_path.png"
  if [ -f "$src" ]; then
    cp "$src" "$target/$label.png"
    echo "  ✓ $label.png"
    copied=$((copied + 1))
  else
    echo "  ✗ missing: $src"
  fi
done

echo ""
echo "store-assets: $copied screenshot(s) copied to $target/"
echo "Upload these to Play Console → Store listing → Phone screenshots (1080×1920 required)."
echo "Minimum 2 screenshots required for Play Store review."
