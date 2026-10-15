---
milestone: M35
slug: messages-skeleton
owned_paths:
  - mobile-features/messages/src/**
---

# M35 — Messages List Skeleton Loading

## Goal
Replace the blank/missing loading state in InquiriesListScreen with animated
skeleton placeholder cards, consistent with the Discover feed improvement in M34.

## Changes
- `InquiriesListScreen.tsx`: Added `SkeletonLine` and `SkeletonInquiryCard` components.
  Initial `loading` state is now `true` so skeleton shows immediately. Added a dedicated
  loading branch that renders 3 skeleton cards before any data arrives.
- `ar.json`, `ckb.json`, `en.json`: Added `list.loading` key used as accessibility label
  on the skeleton container.
- `InquiriesListScreen.test.tsx`: Added "shows skeleton cards while loading" test.

## Acceptance criteria
- [x] Skeleton cards (`testID=skeleton-inquiry-card`) visible on first render before API response.
- [x] After data loads, real inquiry items (or empty state) replace skeletons.
- [x] All existing tests pass.
