// M2 contracts: directions and turn-by-turn navigation.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { BBox, LngLat, Problem } from './common';

const c = initContract();

/** @public frozen contract (M2) */
export const TravelMode = z.enum(['car', 'walk']);
export type TravelMode = z.infer<typeof TravelMode>;

/**
 * Closed maneuver set (ADR-0006). modules/routing maps the engine's maneuvers onto it, and the app words every type
 * from i18n templates in ar, ckb and en. Engine narrative text and engine types never cross the contract.
 * @public frozen contract (M2)
 */
export const ManeuverType = z.enum([
  'depart',
  'arrive',
  'continue',
  'turn',
  'uturn',
  'ramp',
  'exit',
  'fork',
  'merge',
  'roundabout_enter',
  'roundabout_exit',
  'ferry_enter',
  'ferry_exit',
]);
export type ManeuverType = z.infer<typeof ManeuverType>;

/** @public frozen contract (M2) */
export const ManeuverModifier = z.enum(['straight', 'slight_left', 'left', 'sharp_left', 'slight_right', 'right', 'sharp_right']);
export type ManeuverModifier = z.infer<typeof ManeuverModifier>;

/** @public frozen contract (M2) */
export const Maneuver = z.object({
  type: ManeuverType,
  modifier: ManeuverModifier.optional(),
  /** roundabout_enter only: the exit to take, 1 = first. */
  roundaboutExit: z.number().int().min(1).max(20).optional(),
  /** Names of the road after the maneuver, most specific first; empty for an unnamed road. */
  streetNames: z.array(z.string().max(255)).max(5),
  distanceM: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
  /** Index into the decoded polyline6 where the maneuver starts. */
  beginShapeIndex: z.number().int().nonnegative(),
});
export type Maneuver = z.infer<typeof Maneuver>;

/** @public frozen contract (M2) */
export const RouteRequest = z.object({
  origin: LngLat,
  destination: LngLat,
  waypoints: z.array(LngLat).max(5).default([]),
  mode: TravelMode,
});
export type RouteRequest = z.infer<typeof RouteRequest>;

/** @public frozen contract (M2) */
export const RouteResult = z.object({
  /** Google polyline encoding at precision 6 (1e-6 degrees), the format Valhalla returns. */
  polyline6: z.string().min(1),
  distanceM: z.number().nonnegative(),
  durationS: z.number().nonnegative(),
  bbox: BBox,
  /** depart first, arrive last, beginShapeIndex non-decreasing. */
  maneuvers: z.array(Maneuver).min(2),
});
export type RouteResult = z.infer<typeof RouteResult>;

/** 404 `no_route`: no route between the points (or outside the routing tiles). 503 `routing_unavailable`: the
 * engine timed out or is down.
 * @public frozen contract (M2), served by modules/routing */
export const routesContract = c.router(
  {
    create: {
      method: 'POST',
      path: '/routes',
      body: RouteRequest,
      responses: { 200: RouteResult, 400: Problem, 404: Problem, 429: Problem, 503: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** modules/routing's port for other modules (the assistant's plan_route from M5). null: no route between the points. */
export interface RoutingPort {
  route(request: RouteRequest): Promise<RouteResult | null>;
}

/** The external routing service behind modules/routing (Valhalla over HTTP, with a timeout). Engine-neutral: the
 * implementation maps its own response to RouteResult. Throws when the engine is unreachable or times out. */
export interface RoutingEngine extends RoutingPort {
  readonly kind: 'valhalla' | 'fake';
}

/** @public frozen contract (M2) */
export const navigationTestIDs = {
  directions: 'place.directions',
  preview: { view: 'route.preview', modeCar: 'route.mode.car', modeWalk: 'route.mode.walk', summary: 'route.summary', start: 'route.start' },
  active: { instruction: 'nav.instruction', next: 'nav.next', reroute: 'nav.reroute', arrived: 'nav.arrived', stop: 'nav.stop' },
} as const;

/**
 * M2 command-line contracts (geo-services/routing, tools/bench, geo-data.yml and the e2e harness). Each CLI runs from
 * its own package directory, so callers pass absolute paths; callers that parse stdout run `pnpm -s`.
 * @public frozen contract (M2)
 */
export const RoutingCliContracts = {
  routingTilesBuild: {
    command: 'pnpm --filter @iraq-maps/geo-routing run tiles',
    args: { '--input': 'clipped .osm.pbf (CliContracts.pipelineExtract)', '--output': 'output directory' },
    outputs: ['<output>/valhalla.json and <output>/valhalla_tiles.tar, built with valhalla_build_tiles from pyvalhalla 3.9.1'],
  },
  routingServe: {
    command: 'pnpm --filter @iraq-maps/geo-routing run serve',
    args: { '--config': '<output>/valhalla.json', '--port': 'TCP port on 127.0.0.1' },
    outputs: ['valhalla_service until killed; GET /status answers 200 once ready, so VALHALLA_URL=http://127.0.0.1:<port>'],
  },
  benchRoute: {
    command: 'pnpm --filter @iraq-maps/bench route',
    args: { '--api': 'API base URL', '--city': 'city id (routes between sampled points inside its bbox)', '--count': 'routes (default 200)', '--budget-ms': 'p95 budget (default 1500)' },
    outputs: ['stdout: JSON { city, count, errors, p50Ms, p95Ms, maxMs } for POST /v1/routes', 'a Markdown table appended to $GITHUB_STEP_SUMMARY when set', 'exit code 1 when p95Ms is at or above the budget, or errors > 0'],
  },
} as const;
