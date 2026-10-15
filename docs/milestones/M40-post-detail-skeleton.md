---
milestone: M40
slug: post-detail-skeleton
owned_paths:
  - mobile-features/discover/src/**
---

# M40 — Post Detail Screen Skeleton Loading

## Goal
Replace the ActivityIndicator spinner in PostDetailScreen with an animated
skeleton showing post card and comment row placeholders.

## Changes
- `PostDetailScreen.tsx`: Added `SkeletonBlock` and `PostDetailSkeleton`
  components (testID=skeleton-post-detail). Loading branch now renders skeleton.

## Acceptance criteria
- [x] `testID="skeleton-post-detail"` visible on initial load.
- [x] All 6 discover tests pass; lint and typecheck clean.
