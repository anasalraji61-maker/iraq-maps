# @iraq-maps/feature-navigation

Turn-by-turn navigation within the map tab. Calculates routes via the backend Valhalla engine and guides the
user with step-by-step maneuver instructions in Arabic, Kurdish Sorani, or English.

---

## What This Package Does

- Accepts an origin and destination (coordinates or place IDs) and mode (car / walk).
- Calls `POST /v1/routes` and decodes the polyline6 response.
- Renders the route on the map as a line layer.
- Displays a maneuver panel (next turn instruction, distance, street name).
- Updates the active maneuver as the user's GPS position advances along the route.
- Shows a summary panel (total distance, estimated time) before starting.
- Supports up to 5 waypoints.
- Works offline: a loaded route continues to navigate using device GPS even without network. Re-routing requires network.
- Caches the last route in SQLite with a 2-hour TTL.

---

## Key Screens and Components

### Screens

| Export                  | Route                 | Description                                           |
|-------------------------|-----------------------|-------------------------------------------------------|
| `RoutePlannerScreen`    | `/navigate/plan`      | Summary: pick mode, see distance/time, start          |
| `ActiveNavigationScreen`| `/navigate/active`    | Live turn-by-turn with maneuver panel                 |

### Components

| Component            | Description                                                      |
|----------------------|------------------------------------------------------------------|
| `RouteLayer`         | MapLibre line layer that draws the route polyline                |
| `ManeuverPanel`      | Sticky bottom panel: turn icon + street name + distance          |
| `RouteSummaryCard`   | Pre-navigation summary: distance, ETA, mode picker               |
| `TurnIcon`           | Directional arrow icon that mirrors in RTL for left/right turns  |
| `WaypointList`       | Ordered list of waypoints with drag-to-reorder                   |
| `EtaBar`             | Top bar during active navigation: ETA + remaining distance       |
| `RerouteButton`      | Recalculates route when user leaves the planned path (needs network) |

---

## Ports Consumed

| Port              | Package                | Used for                                     |
|-------------------|------------------------|----------------------------------------------|
| `routesContract`  | `@iraq-maps/contracts` | `POST /v1/routes` — get route + maneuvers    |
| `placesContract`  | `@iraq-maps/contracts` | Reverse geocode destination when given coords|
| `map-kit`         | `@iraq-maps/map-kit`   | `MapCanvas` + `useMapRef` for route overlay  |
| `mobile-kit`      | `@iraq-maps/mobile-kit`| `SqliteCache` for offline route caching      |

---

## Environment Variables

This package does not read environment variables directly. All API calls go through `@iraq-maps/api-client`,
which reads `EXPO_PUBLIC_API_URL` from the app shell.

The GPS location is provided by `expo-location` (permission: `ACCESS_FINE_LOCATION`).

---

## Maneuver Localisation

Maneuver text is built locally from i18n templates — the API never returns localised instruction strings
(ADR-0006). Each `ManeuverType` × `ManeuverModifier` combination has a template:

```json
// ar.json
{
  "maneuver": {
    "turn_right": "انعطف يميناً في {{street}}",
    "turn_left": "انعطف يساراً في {{street}}",
    "continue": "استمر على {{street}}",
    "roundabout_enter": "ادخل الدوار وخذ المخرج {{exit}}",
    "arrive": "وصلت إلى وجهتك",
    "depart": "انطلق على {{street}}"
  }
}
```

Distance values in instruction strings use Western Arabic numerals even in Arabic locale (they are technical/
directional values). Wrap in `<Text style={{ writingDirection: 'ltr' }}>` per ADR-0011 and ADR-0013.

---

## RTL Behaviour

- `TurnIcon` mirrors horizontally (`scaleX(-1)`) in RTL for `left`, `sharp_left`, `slight_left`,
  `right`, `sharp_right`, `slight_right` modifiers. `straight`, `depart`, and `arrive` icons are never mirrored.
- `ManeuverPanel` text is right-aligned in Arabic/Kurdish, left-aligned in English.
- Distance values in `EtaBar` and `ManeuverPanel` are always LTR regardless of locale.

---

## i18n Namespaces

Namespace: `feature-navigation`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `maneuver.*` — turn-by-turn instruction templates per maneuver type and modifier
- `mode.*` — travel mode labels (car / walk)
- `summary.*` — distance, ETA, start button
- `error.*` — no_route, routing_unavailable, reroute_unavailable_offline
- `offline.*` — offline navigation notice, reroute blocked notice

---

## How to Test

```bash
cd mobile-features/navigation
pnpm test
```

Key test files:

- `maneuver.test.ts` — maneuver text generation for all type/modifier combinations, RTL mirroring
- `RouteSummaryCard.test.tsx` — distance formatting, ETA calculation
- `RouteLayer.test.tsx` — polyline decoding, correct lat/lng order for MapLibre
- `offlineCache.test.ts` — route caching and offline retrieval

E2E:

```bash
maestro test mobile-features/navigation/maestro/car-route.yaml
maestro test mobile-features/navigation/maestro/walk-route.yaml
```
