---
milestone: M37
slug: activity-skeleton
owned_paths:
  - mobile-features/activity/src/**
---

# M37 — Activity Screen Notifications Skeleton Loading

## Goal
Replace the spinner in the Notifications tab of ActivityScreen with animated
skeleton rows, consistent with M34–M36 skeleton pattern.

## Changes
- `ActivityScreen.tsx`: Added `SkeletonBox` and `SkeletonNotifRow` components.
  NotificationsTab loading branch now renders 4 skeleton rows.
- `activity.test.tsx`: Added "shows skeleton rows while notifications are loading" test.

## Acceptance criteria
- [x] Skeleton rows (`testID=skeleton-notif-row`) visible on initial notifications load.
- [x] After data loads, real notification items (or empty state) replace skeletons.
- [x] All 10 existing tests pass.
