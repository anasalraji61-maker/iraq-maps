---
id: M181
slug: report-price-button
owned_paths:
  - mobile-features/map/src/PlaceScreen.tsx
  - mobile-features/map/src/i18n/ar.json
  - mobile-features/map/src/i18n/en.json
  - mobile-features/map/src/i18n/ckb.json
---

# M181 — "Report a price" button on place detail screen

## Features
- InsightsSection now has a "Report a price" button alongside "Report: busy now".
- Tapping it shows an Alert with the four price levels (Budget / Mid-range / Expensive / Luxury).
- Selecting a level calls `POST /insights/reports` with `kind: 'price'` and the chosen `priceLevel`.
- New i18n keys: `place.reportPriceTitle`, `place.reportPriceSuccess` in ar/ckb/en.

## Acceptance criteria
- [x] Button visible in InsightsSection (both no-data and with-data states)
- [x] Tapping shows price level picker alert
- [x] Selecting a level fires the API call
- [x] All three i18n locales updated
- [x] All 82 map tests pass, lint and typecheck clean
