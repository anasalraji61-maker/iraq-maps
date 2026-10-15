---
id: M179
slug: provider-verified-badge
owned_paths:
  - mobile-features/map/src/PlaceScreen.tsx
  - mobile-features/map/src/i18n/ar.json
  - mobile-features/map/src/i18n/en.json
  - mobile-features/map/src/i18n/ckb.json
---

# M179 — Provider verified badge on place detail screen

## Features
- `PlaceScreen` now shows "Verified Provider ✓" badge (via `source.provider` i18n key) when `place.source === 'provider'`, replacing the generic "From OpenStreetMap" badge.
- Badge text localised in Arabic, Kurdish Sorani, and English.

## Acceptance criteria
- [x] Verified provider places show distinct badge label on place detail screen
- [x] OSM places continue to show "From OpenStreetMap" badge
- [x] All three i18n locales updated
- [x] No TypeScript or lint errors
- [x] All existing map tests pass (82 tests)

## Notes
`source` is a `PlaceDetails` field only (not `PlaceSummary`), so the badge is surfaced at detail-view time — which is the appropriate UX moment for trust signals.
