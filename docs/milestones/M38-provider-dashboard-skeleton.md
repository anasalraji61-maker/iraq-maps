---
milestone: M38
slug: provider-dashboard-skeleton
owned_paths:
  - mobile-features/provider/src/**
---

# M38 — Provider Dashboard Skeleton Loading

## Goal
Replace the blank loading state in ProviderDashboardScreen with animated skeleton
blocks, consistent with M34–M37 skeleton pattern.

## Changes
- `ProviderDashboardScreen.tsx`: Added `SkeletonBlock` and `DashboardSkeleton` components.
  Loading branch now renders a skeleton grid of 4 analytics card placeholders.
- `dashboard.test.tsx`: Added "shows skeleton while loading" test; removed invalid
  second-argument call to `setup()` and replaced with direct `renderWithProviders`.

## Acceptance criteria
- [x] `testID="skeleton-dashboard"` visible on initial load before `providers.me` resolves.
- [x] After data loads, real dashboard content replaces skeleton.
- [x] All 15 provider tests pass.
