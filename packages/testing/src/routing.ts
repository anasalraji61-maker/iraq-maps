// M2: RoutingPort / RoutingEngine fake and conformance suite.
import { RouteResult, type BBox, type LngLat, type RouteRequest, type RoutingEngine, type RoutingPort } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';
import { distanceM } from './geo';

/** Google polyline at precision 6, the encoding RouteResult.polyline6 uses ([lat, lng] per point). */
function encodePolyline6(points: LngLat[]): string {
  let out = '';
  let prev = [0, 0];
  const push = (delta: number) => {
    let n = delta < 0 ? ~(delta << 1) : delta << 1;
    for (; n >= 0x20; n >>= 5) out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    out += String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of points) {
    const next = [Math.round(lat * 1e6), Math.round(lng * 1e6)];
    push(next[0]! - prev[0]!);
    push(next[1]! - prev[1]!);
    prev = next;
  }
  return out;
}

const SPEED_MPS = { car: 10, walk: 1.3 } as const;
const inside = ([w, s, e, n]: BBox, [lng, lat]: LngLat) => lng >= w && lng <= e && lat >= s && lat <= n;

/** Straight lines between the points at a fixed speed per mode; no route (null) when a point is outside `coverage`. */
export class FakeRoutingPort implements RoutingEngine {
  readonly kind = 'fake' as const;
  constructor(private readonly coverage: BBox = [44.22, 33.2, 44.55, 33.45]) {}

  async route(request: RouteRequest): Promise<RouteResult | null> {
    const points = [request.origin, ...request.waypoints, request.destination];
    if (!points.every((p) => inside(this.coverage, p))) return null;
    const legs = points.slice(1).map((p, i) => distanceM(points[i]!, p));
    const leg = (i: number) => ({ distanceM: legs[i] ?? 0, durationS: (legs[i] ?? 0) / SPEED_MPS[request.mode] });
    const total = legs.reduce((a, b) => a + b, 0);
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    return {
      polyline6: encodePolyline6(points),
      distanceM: total,
      durationS: total / SPEED_MPS[request.mode],
      bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      maneuvers: points.map((_, i) => ({
        type: i === 0 ? 'depart' : i === points.length - 1 ? 'arrive' : 'continue',
        streetNames: [],
        beginShapeIndex: i,
        ...leg(i),
      })),
    };
  }
}

export interface RoutingHarness {
  /** The real RoutingPort, the Valhalla RoutingEngine, or the fake. */
  port: Pick<RoutingPort, 'route'>;
  /** Two points the test network connects for both modes. */
  from: LngLat;
  to: LngLat;
  /** Two points with no route between them, e.g. outside the routing tiles. */
  unroutable: [LngLat, LngLat];
}

export function routingConformance(name: string, make: () => RoutingHarness | Promise<RoutingHarness>): void {
  describe(`RoutingPort conformance: ${name}`, () => {
    it('returns a contract-valid route for car and walk: depart first, arrive last, ordered maneuvers', async () => {
      const h = await make();
      for (const mode of ['car', 'walk'] as const) {
        const route = RouteResult.parse(await h.port.route({ origin: h.from, destination: h.to, waypoints: [], mode }));
        expect(route.distanceM).toBeGreaterThan(0);
        expect(route.durationS).toBeGreaterThan(0);
        expect([route.maneuvers[0]?.type, route.maneuvers.at(-1)?.type]).toEqual(['depart', 'arrive']);
        const starts = route.maneuvers.map((m) => m.beginShapeIndex);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
        const [w, s, e, n] = route.bbox;
        expect(w <= e && s <= n).toBe(true);
      }
    });

    it('walking takes longer than driving the same trip', async () => {
      const h = await make();
      const time = async (mode: 'car' | 'walk') => (await h.port.route({ origin: h.from, destination: h.to, waypoints: [], mode }))!.durationS;
      expect(await time('walk')).toBeGreaterThan(await time('car'));
    });

    it('a waypoint never makes the trip faster', async () => {
      const h = await make();
      const via: LngLat = [(h.from[0] + h.to[0]) / 2, (h.from[1] + h.to[1]) / 2];
      const direct = await h.port.route({ origin: h.from, destination: h.to, waypoints: [], mode: 'walk' });
      const viaMid = await h.port.route({ origin: h.from, destination: h.to, waypoints: [via], mode: 'walk' });
      expect(viaMid!.durationS).toBeGreaterThanOrEqual(direct!.durationS * 0.99);
    });

    it('answers null when no route exists', async () => {
      const h = await make();
      const [origin, destination] = h.unroutable;
      expect(await h.port.route({ origin, destination, waypoints: [], mode: 'car' })).toBeNull();
    });
  });
}
