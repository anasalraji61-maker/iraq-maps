# @iraq-maps/geo

Pure geometry helpers for the server and the app (no React, no Node APIs). Coordinates are `[lng, lat]` (WGS84) and
boxes are `[west, south, east, north]`, the `LngLat` and `BBox` types of `@iraq-maps/contracts`. The antimeridian is
not handled: the MVP cities are in Iraq.

| Export | What it does |
|---|---|
| `haversineM(a, b)` | Great-circle distance in metres on a sphere of the mean Earth radius. It stays within 0.5% of the WGS84 geodesic (Baghdad to Erbil is 320.7 km). |
| `bboxOf(points)` | The smallest box that contains every point. Throws a `RangeError` on an empty list. |
| `bboxContains(bbox, point)` | Whether the point is in the box. Edges and corners count as inside. |
| `cameraBounds(bbox, padRatio = 0.1)` | The box grown on each side by `padRatio` of its width and height, clamped to valid coordinates. `MapCanvas` (`@iraq-maps/map-kit`) uses it as MapLibre `maxBounds`. |

**Ports:** none. **Env:** none. Tests: `pnpm --filter @iraq-maps/geo test` (Vitest).
