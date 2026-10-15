---
id: M183
slug: lightbox-multi-photo
owned_paths:
  - mobile-features/discover/src/screens/DiscoverFeedScreen.tsx
---

# M183 — Multi-photo navigation in post lightbox

## Features
- PostItem now accepts `imageUrls[]` instead of a single `firstImageUrl`.
- When a post has multiple photos, the lightbox shows prev/next navigation arrows and a photo counter ("3 photos") using the existing `lightbox.counter` i18n key.
- Single-photo posts are unaffected — no navigation controls shown.

## Acceptance criteria
- [x] Lightbox shows all photos when post has multiple images
- [x] Photo counter displays correctly
- [x] Prev/next buttons disabled at boundaries
- [x] Single-photo posts show no navigation chrome
- [x] All 41 discover tests pass, lint and typecheck clean
