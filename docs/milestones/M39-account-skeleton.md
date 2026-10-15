---
milestone: M39
slug: account-skeleton
owned_paths:
  - mobile-features/account/src/**
---

# M39 — Account Screen Skeleton Loading

## Goal
Replace the blank loading state in AccountScreen with an animated skeleton
showing an avatar circle and list-item placeholders, consistent with M34–M38.

## Changes
- `AccountScreen.tsx`: Added `SkeletonBlock` and `AccountSkeleton` components
  (testID=skeleton-account). Loading branch now renders the skeleton.
- `account.test.tsx`: Added "shows skeleton while session is loading" test using
  `renderWithProviders` with `state.status === 'loading'`.

## Acceptance criteria
- [x] `testID="skeleton-account"` visible when session state is `loading`.
- [x] All 43 account tests pass.
