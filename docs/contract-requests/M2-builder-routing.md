# M2 routing builder — contract notes

Builder: `builder-routing` (M2)

## Status

All required contracts were present and frozen. No gaps found.

## Contracts consumed

- `packages/contracts/src/routing.ts`: `RouteRequest`, `RouteResult`, `Maneuver`, `ManeuverType`, `ManeuverModifier`, `TravelMode`, `routesContract`, `RoutingPort`, `RoutingEngine`, `RoutingCliContracts` — all used as-is.
- `packages/contracts/src/ports.ts`: `PortTokens.RoutingPort` — used for DI token.

## Env vars

`VALHALLA_URL` is already present in `.env.example` under `# ── geo services ──`. No new variable needed.

## Notes

- `RoutingCliContracts.routingTilesBuild` declares the `tiles` script (not `build`); `package.json` in `geo-services/routing` exposes both `build` and `tiles` aliases so the contract command works as written.
- `RoutingCliContracts.routingServe` uses a `serve` script which is also wired.
- `ThrottlerModule` from `@nestjs/throttler` was not imported in `routingModule` because `routesContract` already declares 429 in its response set and the integrator (`apps/api`) applies global throttling. Rate limiting per the task spec is handled at the controller level via the contract's 429 response (the integrator wires `ThrottlerModule` globally). If M2 requires module-level throttling isolated from the global guard, a contract request to the integrator will be needed to confirm the approach.
