---
milestone: M41
slug: comments-skeleton
owned_paths:
  - mobile-features/discover/src/**
---

# M41 — Comments Screen Skeleton Loading

## Goal
Replace the ActivityIndicator spinner in CommentsScreen with animated skeleton
comment row placeholders.

## Changes
- `CommentsScreen.tsx`: Added `SkeletonBlock` and `SkeletonCommentRow` components
  (testID=skeleton-comment-row). Loading branch now renders 4 skeleton rows.

## Acceptance criteria
- [x] `testID="skeleton-comment-row"` visible during initial comment load.
- [x] All 6 discover tests pass; lint and typecheck clean.
