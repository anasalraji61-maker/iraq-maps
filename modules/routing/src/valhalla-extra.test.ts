/**
 * Additional unit tests for ValhallaClient — maneuver type edge cases not
 * covered by routing.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValhallaClient } from './valhalla';
import type { RouteRequest } from '@iraq-maps/contracts';

const BASE_REQUEST: RouteRequest = {
  origin: [44.4, 33.3],
  destination: [44.41, 33.31],
  waypoints: [],
  mode: 'car',
};

const ARRIVE = { type: 4, instruction: 'Arrive.', street_names: [], length: 0, time: 0, begin_shape_index: 1 };

/** Build a minimal Valhalla response with the given maneuvers plus an arrive maneuver at the end. */
function makeResponse(maneuvers: object[]) {
  return {
    trip: {
      status: 0,
      legs: [
        {
          shape: 'wvzlBemr{Ai@aB',
          maneuvers: [...maneuvers, ARRIVE],
          summary: { length: 1.5, time: 120 },
        },
      ],
      summary: { length: 1.5, time: 120, min_lat: 33.3, min_lon: 44.4, max_lat: 33.31, max_lon: 44.41 },
    },
  };
}

function mockFetch(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

describe('ValhallaClient — maneuver type mapping', () => {
  let client: ValhallaClient;

  beforeEach(() => {
    client = new ValhallaClient('http://valhalla.test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const maneuverCase = (desc: string, type: number, expected: string) =>
    it(desc, async () => {
      vi.stubGlobal('fetch', mockFetch(makeResponse([
        { type, instruction: 'Go.', street_names: [], length: 1.5, time: 120, begin_shape_index: 0 },
      ])));
      const result = await client.route(BASE_REQUEST);
      expect(result!.maneuvers[0]!.type).toBe(expected);
    });

  maneuverCase('type 2 (continue) → continue', 2, 'continue');
  maneuverCase('type 10 (keep straight) → continue', 10, 'continue');
  maneuverCase('type 5 (turn slight left) → turn', 5, 'turn');
  maneuverCase('type 7 (turn sharp right) → turn', 7, 'turn');
  maneuverCase('type 21 (uturn) → uturn', 21, 'uturn');
  maneuverCase('type 11 (merge onto ramp) → ramp', 11, 'ramp');
  maneuverCase('type 12 (exit ramp) → ramp', 12, 'ramp');
  maneuverCase('type 13 (exit roundabout) → exit', 13, 'exit');
  maneuverCase('type 14 (exit transition) → exit', 14, 'exit');
  maneuverCase('type 15 (stay on fork) → fork', 15, 'fork');
  maneuverCase('type 16 (take fork) → fork', 16, 'fork');
  maneuverCase('type 19 (merge) → merge', 19, 'merge');
  maneuverCase('type 20 (merge right) → merge', 20, 'merge');
  maneuverCase('type 23 (roundabout enter 2) → roundabout_enter', 23, 'roundabout_enter');
  maneuverCase('type 24 (roundabout exit) → roundabout_exit', 24, 'roundabout_exit');
  maneuverCase('type 25 (roundabout exit 2) → roundabout_exit', 25, 'roundabout_exit');
  maneuverCase('type 26 (ferry enter) → ferry_enter', 26, 'ferry_enter');
  maneuverCase('type 27 (ferry enter 2) → ferry_enter', 27, 'ferry_enter');
  maneuverCase('type 28 (ferry exit) → ferry_exit', 28, 'ferry_exit');
  maneuverCase('type 29 (ferry exit 2) → ferry_exit', 29, 'ferry_exit');
  maneuverCase('unknown type (99) → continue', 99, 'continue');

  it('maps modifier strings to ManeuverModifier', async () => {
    vi.stubGlobal('fetch', mockFetch(makeResponse([
      { type: 3, modifier: 'slight right', instruction: 'Bear right.', street_names: [], length: 0.5, time: 60, begin_shape_index: 0 },
    ])));
    const result = await client.route(BASE_REQUEST);
    expect(result!.maneuvers[0]!.modifier).toBe('slight_right');
  });

  it('omits modifier when unknown modifier string supplied', async () => {
    vi.stubGlobal('fetch', mockFetch(makeResponse([
      { type: 3, modifier: 'zigzag', instruction: 'Zigzag.', street_names: [], length: 0.5, time: 60, begin_shape_index: 0 },
    ])));
    const result = await client.route(BASE_REQUEST);
    expect(result!.maneuvers[0]!.modifier).toBeUndefined();
  });

  it('throws when Valhalla returns no legs', async () => {
    vi.stubGlobal('fetch', mockFetch({ trip: { status: 0, legs: [], summary: { length: 0, time: 0, min_lat: 0, min_lon: 0, max_lat: 0, max_lon: 0 } } }));
    await expect(client.route(BASE_REQUEST)).rejects.toThrow('no legs');
  });

  it('converts distance km→m and time to integer seconds', async () => {
    vi.stubGlobal('fetch', mockFetch(makeResponse([
      { type: 1, instruction: 'Depart.', street_names: [], length: 1.234, time: 74.7, begin_shape_index: 0 },
    ])));
    const result = await client.route(BASE_REQUEST);
    expect(result!.maneuvers[0]!.distanceM).toBe(1234);
    expect(result!.maneuvers[0]!.durationS).toBe(75);
  });
});
