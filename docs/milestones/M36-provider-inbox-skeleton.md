---
milestone: M36
slug: provider-inbox-skeleton
owned_paths:
  - mobile-features/provider/src/**
---

# M36 — Provider Inbox Skeleton Loading

## Goal
Replace the blank `<Screen>{null}</Screen>` loading state in ProviderInboxScreen
with animated skeleton placeholder rows, consistent with M34/M35.

## Changes
- `ProviderInboxScreen.tsx`: Added `SkeletonBox` and `SkeletonInboxRow` components.
  Loading branch now renders 3 skeleton rows with the inbox title instead of a blank screen.
- `inbox.test.tsx`: Added "shows skeleton rows while loading" test.

## Acceptance criteria
- [x] Skeleton rows (`testID=skeleton-inbox-row`) visible on initial load.
- [x] After data loads, real inbox items (or empty state) replace skeletons.
- [x] All existing tests pass.
