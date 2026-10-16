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

---

## Ports Consumed

| Port              | Package                | Used for                                     |
|-------------------|------------------------|----------------------------------------------|
| `routesContract`  | `@iraq-maps/contracts` | `POST /v1/routes` — get route + maneuvers    |
| `placesContract`  | `@iraq-maps/contracts` | Reverse geocode destination when given coords|
| `map-kit`         | `@iraq-maps/map-kit`   | `MapCanvas` + `useMapRef` for route overlay  |

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
    "arrive": "وصلت إلى وجهتك"
  }
}
```

RTL note: distance values are always LTR numbers even in Arabic text. Use `<Text dir="ltr">` for the distance
component inside the panel.

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
- `error.*` — no_route, routing_unavailable

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

E2E:

```bash
maestro test mobile-features/navigation/maestro/car-route.yaml
maestro test mobile-features/navigation/maestro/walk-route.yaml
```
