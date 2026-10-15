---
milestone: M34
slug: discover-skeleton
owned_paths:
  - mobile-features/discover/src/**
---

# M34 — Discover Feed Skeleton Loading

## Goal
Replace the spinner + text loading state in the Discover feed with animated skeleton
placeholder cards, improving perceived performance and reducing layout shift.

## Changes
- `DiscoverFeedScreen.tsx`: Added `SkeletonBlock`, `SkeletonCard`, `SkeletonFeed` components
  with a pulsing opacity animation. Feed renders 3 skeleton cards while the initial API call
  is in-flight, replacing the previous `ActivityIndicator` + text.
- `discover.test.tsx`: Added "shows skeleton cards while loading" test that verifies skeleton
  cards are present during the loading state.

## Acceptance criteria
- [x] Skeleton cards (testID `skeleton-card`) visible immediately before data loads.
- [x] After data loads, real posts replace skeletons.
- [x] Loading indicator still shown in footer when loading more pages.
- [x] All existing tests pass.

## Completed
<!-- sha filled by integrator -->
