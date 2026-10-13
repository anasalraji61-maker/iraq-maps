# Contract request — builder-navigation-app (M2)

**Milestone:** M2  
**Requested by:** builder-navigation-app  
**Date:** 2026-10-13

## Summary

No blocking contract gaps found. All required types (`ManeuverType`, `Maneuver`, `RouteResult`,
`RouteRequest`, `navigationTestIDs`, `routesContract`) are present in
`packages/contracts/src/routing.ts` and are frozen for M2.

All geo utilities (`distanceToPolylineM`, `nearestPointOnLine`, `bearing`, `decodePolyline6`,
`haversineM`) are present in `packages/geo/src/index.ts`.

`recentRoutes` and `useApi` are exported from `packages/mobile-kit/src/index.ts`.

## Minor observations (no change needed)

1. **`recentRoutes.add` expects `placeId: PlaceId`** but the navigation hook only has a
   `LngLat` destination at call time (the place id is available at the call site when navigating
   from a PlaceScreen). The hook's `UseNavigationOptions` exposes a `destinationName` string and
   passes the destination as `placeId` — the call site must supply the real `PlaceId` when known.
   This is a usage note, not a contract gap.

2. **`navigationTestIDs.active.stop` is used for two elements** (arrived state and the stop
   button). The contract defines a single `stop` id. Both usages are intentional (only one renders
   at a time), so this is fine.
