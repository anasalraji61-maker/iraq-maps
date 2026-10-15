---
id: M180
slug: post-delete-confirm
owned_paths:
  - mobile-features/discover/src/screens/DiscoverFeedScreen.tsx
  - mobile-features/discover/src/i18n/ar.json
  - mobile-features/discover/src/i18n/en.json
  - mobile-features/discover/src/i18n/ckb.json
---

# M180 — Post delete confirmation dialog

## Features
- Deleting a post now shows a confirmation Alert ("Delete post? / This cannot be undone.") before calling the API.
- New i18n keys: `post.deleteConfirmTitle`, `post.deleteConfirmMsg`, `post.deleteConfirmOk` in all three locales.

## Acceptance criteria
- [x] Tapping "Delete post" shows confirmation dialog
- [x] Tapping cancel in confirmation dialog aborts the delete
- [x] Tapping "Delete" in confirmation dialog proceeds with deletion
- [x] All three i18n locales updated
- [x] All 41 discover tests pass
