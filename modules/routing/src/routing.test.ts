/**
 * Unit tests for modules/routing.
 * Uses recorded Valhalla response shapes (no live HTTP calls).
 */
import { type RouteRequest } from '@iraq-maps/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValhallaClient } from './valhalla';

// ---------------------------------------------------------------------------
// Recorded Valhalla response fixture
// ---------------------------------------------------------------------------
const VALHALLA_ROUTE_RESPONSE = {
  trip: {
    status: 0,
    status_message: 'Found route between points',
    units: 'kilometers',
    language: 'en-US',
    legs: [
      {
        maneuvers: [
          {
            type: 1, // depart
            instruction: 'Drive east on West Road.',
            street_names: ['West Road'],
            length: 0.5,
            time: 60,
            begin_shape_index: 0,
          },
          {
            type: 3, // turn
            modifier: 'right',
            instruction: 'Turn right onto North Road.',
            street_names: ['North Road'],
            length: 0.8,
            time: 96,
            begin_shape_index: 5,
          },
          {
            type: 4, // arrive
            instruction: 'Your destination is on the right.',
            street_names: [],
            length: 0.0,
            time: 0,
            begin_shape_index: 12,
          },
        ],
        shape: 'wvzlBemr{Ai@aB', // dummy polyline6
        summary: { length: 1.3, time: 156 },
      },
    ],
    summary: {
      length: 1.3,
      time: 156,
      min_lat: 33.3,
      min_lon: 44.4,
      max_lat: 33.305,
      max_lon: 44.408,
    },
  },
};

const VALHALLA_ROUNDABOUT_RESPONSE = {
  trip: {
    status: 0,
    status_message: 'Found route',
    units: 'kilometers',
    language: 'en-US',
    legs: [
      {
        maneuvers: [
          { type: 1, instruction: 'Depart.', street_names: ['Main St'], length: 0.2, time: 24, begin_shape_index: 0 },
          { type: 22, instruction: 'Enter roundabout.', street_names: ['Circle'], length: 0.1, time: 12, begin_shape_index: 2, roundabout_exit_count: 3 },
          { type: 24, instruction: 'Exit roundabout.', street_names: ['Side St'], length: 0.3, time: 36, begin_shape_index: 4 },
          { type: 4, instruction: 'Arrive.', street_names: [], length: 0.0, time: 0, begin_shape_index: 8 },
        ],
        shape: 'abcdef',
        summary: { length: 0.6, time: 72 },
      },
    ],
    summary: { length: 0.6, time: 72, min_lat: 33.3, min_lon: 44.4, max_lat: 33.302, max_lon: 44.404 },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CAR_REQUEST: RouteRequest = {
  origin: [44.4, 33.3],
  destination: [44.408, 33.305],
  waypoints: [],
  mode: 'car',
};

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ValhallaClient', () => {
  let client: ValhallaClient;

  beforeEach(() => {
    client = new ValhallaClient('http://valhalla.test:8002');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a car route response to RouteResult', async () => {
    vi.stubGlobal('fetch', mockFetch(VALHALLA_ROUTE_RESPONSE));

    const result = await client.route(CAR_REQUEST);
    expect(result).not.toBeNull();
    expect(result!.distanceM).toBe(1300); // 1.3 km → 1300 m
    expect(result!.durationS).toBe(156);
    expect(result!.bbox).toEqual([44.4, 33.3, 44.408, 33.305]);
    expect(result!.polyline6).toBe('wvzlBemr{Ai@aB');
    expect(result!.maneuvers).toHaveLength(3);
  });

  it('maps maneuver types correctly', async () => {
    vi.stubGlobal('fetch', mockFetch(VALHALLA_ROUTE_RESPONSE));
    const result = await client.route(CAR_REQUEST);
    const types = result!.maneuvers.map((m) => m.type);
    expect(types).toEqual(['depart', 'turn', 'arrive']);
  });

  it('maps maneuver modifiers and street names', async () => {
    vi.stubGlobal('fetch', mockFetch(VALHALLA_ROUTE_RESPONSE));
    const result = await client.route(CAR_REQUEST);
    const turnManeuver = result!.maneuvers[1]!;
    expect(turnManeuver.modifier).toBe('right');
    expect(turnManeuver.streetNames).toEqual(['North Road']);
  });

  it('maps roundabout_enter with exit count', async () => {
    vi.stubGlobal('fetch', mockFetch(VALHALLA_ROUNDABOUT_RESPONSE));
    const result = await client.route(CAR_REQUEST);
    const roundabout = result!.maneuvers.find((m) => m.type === 'roundabout_enter');
    expect(roundabout).toBeDefined();
    expect(roundabout!.roundaboutExit).toBe(3);
  });

  it('returns null when Valhalla returns 400 (no route)', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 400));
    const result = await client.route(CAR_REQUEST);
    expect(result).toBeNull();
  });

  it('throws routing_unavailable when Valhalla returns 5xx', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 503));
    await expect(client.route(CAR_REQUEST)).rejects.toThrow('Routing engine error');
  });

  it('throws when fetch itself fails (engine unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(client.route(CAR_REQUEST)).rejects.toThrow('unreachable');
  });

  it('sends walk request with pedestrian costing', async () => {
    const fetcher = mockFetch(VALHALLA_ROUTE_RESPONSE);
    vi.stubGlobal('fetch', fetcher);

    await client.route({ ...CAR_REQUEST, mode: 'walk' });

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { costing: string };
    expect(body.costing).toBe('pedestrian');
  });

  it('sends waypoints in the locations array', async () => {
    const fetcher = mockFetch(VALHALLA_ROUTE_RESPONSE);
    vi.stubGlobal('fetch', fetcher);

    await client.route({ ...CAR_REQUEST, waypoints: [[44.404, 33.302]] });

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { locations: unknown[] };
    expect(body.locations).toHaveLength(3); // origin + 1 waypoint + dest
  });
});
