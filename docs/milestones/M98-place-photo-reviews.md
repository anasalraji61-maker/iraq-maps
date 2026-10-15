---
milestone: M98
slug: place-photo-reviews
owned_paths:
  - mobile-features/map/src/components/ReviewsSection.tsx
  - mobile-features/map/src/i18n/
  - docs/contract-requests/M98-place-photo-reviews.md
---

# M98 — Place photos from users

## Feature

Users can attach up to 4 photos when writing a place review.

## Acceptance criteria

- [x] Photo picker appears in the review form (ImagePicker, media library)
- [x] Photos are uploaded via `uploadAsset` and shown as thumbnails in the form
- [x] Tap a thumbnail to remove it before submitting
- [x] After submit, the new review card shows the attached photos (optimistic display)
- [x] Photo picker respects the MAX_PHOTOS=4 cap
- [x] All strings go through `t()`, no hardcoded user-facing text
- [x] RTL safe (uses `start`/`end` not `left`/`right`)
- [x] lint + typecheck + test pass

## Notes

- Contract request filed at `docs/contract-requests/M98-place-photo-reviews.md` to add
  `mediaAssetIds` to review submit body and `place_review_photo` to `MediaPurpose`.
- Until contract is updated: photos are stored in local component state only (optimistic).
  Backend does not yet persist them cross-session.
- Upload uses `provider_photo` purpose as a temporary stand-in.

## Status

Complete (local display). Backend persistence pending contract approval.
