# @iraq-maps/feature-navigation

Turn-by-turn navigation with voice guidance, speed limit display, ETA tracking, geofencing, and favorite route saving.

## Screens

- `NavigationScreen` (`/navigation`): full-screen turn-by-turn navigation overlay. Shows:
  - Next-turn arrow with street name and distance
  - Speed limit badge (pulled from OSM `maxspeed` tags)
  - Current speed (color-coded: green/amber/red)
  - ETA and remaining distance, updated on re-route
  - Voice guidance banner (enabled/disabled toggle)
  - Compass rose (tracks device orientation)
  - Geofence arrival alert when the user nears the destination

- `FavoriteRoutesScreen` (`/navigation/favorites`): saved A→B pairs for quick re-navigation.

## Hooks (in `src/hooks/`)

- `useNavigation(origin, destination)` — fetches the route from the routing engine, tracks location, advances maneuvers, triggers voice.
- `useSpeedLimit(location)` — queries the PostGIS layer for the nearest way's `maxspeed`.
- `useGeofence(destination, radiusMeters)` — fires an arrival event when the device enters the radius.
- `useFavoriteRoutes()` — CRUD for saved routes stored in the server via `POST /v1/routes/favorites`.

## Engine (in `src/engine/`)

Thin wrapper around the Valhalla JSON turn-by-turn API: request, response parsing, maneuver sequencing.

## Ports and dependencies

- Consumes `useApi`, location hooks from `@iraq-maps/mobile-kit`.
- Consumes `@iraq-maps/map-kit` for the map view layer.
- Consumes `@iraq-maps/ui`, `@iraq-maps/i18n`.
- Uses `Route`, `Maneuver`, `FavoriteRoute` schemas from `@iraq-maps/contracts`.
- `expo-speech` for voice guidance (peer dep).
- `expo-sensors` for compass (peer dep).

## Strings

All strings are in the `navigation` namespace. Locale files are in `src/locales/{ar,ckb,en}.json`. `src/strings.test.ts` checks locale parity.

## Tests

`pnpm --filter @iraq-maps/feature-navigation test`

Maestro: `maestro/navigation.yaml` runs a basic A→B route on a seeded map.

## Env vars

None (routing engine URL is configured in `packages/config` under `ROUTING_ENGINE_URL`).
