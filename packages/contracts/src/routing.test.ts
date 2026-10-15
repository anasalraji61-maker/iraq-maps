/**
 * Unit tests for routing contract schemas: RouteRequest, RouteResult, TravelMode, ManeuverType.
 */
import { describe, expect, it } from 'vitest';
import { RouteRequest, RouteResult, TravelMode, ManeuverType, ManeuverModifier } from './routing';

const DEPART: object = { type: 'depart', streetNames: [], distanceM: 1000, durationS: 60, beginShapeIndex: 0 };
const ARRIVE: object = { type: 'arrive', streetNames: [], distanceM: 0, durationS: 0, beginShapeIndex: 1 };

const VALID_RESULT = {
  polyline6: 'wvzlBemr{Ai@aB',
  distanceM: 1000,
  durationS: 60,
  bbox: [44.38, 33.3, 44.41, 33.34],
  maneuvers: [DEPART, ARRIVE],
};

describe('TravelMode', () => {
  it('accepts car', () => expect(TravelMode.parse('car')).toBe('car'));
  it('accepts walk', () => expect(TravelMode.parse('walk')).toBe('walk'));
  it('rejects unknown mode', () => expect(() => TravelMode.parse('bike')).toThrow());
});

describe('ManeuverType', () => {
  it('accepts depart', () => expect(ManeuverType.parse('depart')).toBe('depart'));
  it('accepts arrive', () => expect(ManeuverType.parse('arrive')).toBe('arrive'));
  it('accepts turn', () => expect(ManeuverType.parse('turn')).toBe('turn'));
  it('accepts roundabout_enter', () => expect(ManeuverType.parse('roundabout_enter')).toBe('roundabout_enter'));
  it('rejects unknown type', () => expect(() => ManeuverType.parse('fly')).toThrow());
});

describe('ManeuverModifier', () => {
  it('accepts straight', () => expect(ManeuverModifier.parse('straight')).toBe('straight'));
  it('accepts slight_left', () => expect(ManeuverModifier.parse('slight_left')).toBe('slight_left'));
  it('rejects bad value', () => expect(() => ManeuverModifier.parse('north')).toThrow());
});

describe('RouteRequest', () => {
  const BASE = { origin: [44.4, 33.3], destination: [44.5, 33.4], mode: 'car' };

  it('parses a valid request', () => {
    const r = RouteRequest.parse(BASE);
    expect(r.mode).toBe('car');
    expect(r.waypoints).toEqual([]);
  });

  it('accepts waypoints up to 5', () => {
    const wpts = Array.from({ length: 5 }, (_, i) => [44 + i * 0.01, 33.3]);
    expect(() => RouteRequest.parse({ ...BASE, waypoints: wpts })).not.toThrow();
  });

  it('rejects more than 5 waypoints', () => {
    const wpts = Array.from({ length: 6 }, (_, i) => [44 + i * 0.01, 33.3]);
    expect(() => RouteRequest.parse({ ...BASE, waypoints: wpts })).toThrow();
  });

  it('rejects invalid origin longitude (> 180)', () => {
    expect(() => RouteRequest.parse({ ...BASE, origin: [200, 33.3] })).toThrow();
  });

  it('rejects unknown travel mode', () => {
    expect(() => RouteRequest.parse({ ...BASE, mode: 'boat' })).toThrow();
  });
});

describe('RouteResult', () => {
  it('parses a valid result', () => {
    const r = RouteResult.parse(VALID_RESULT);
    expect(r.distanceM).toBe(1000);
    expect(r.maneuvers).toHaveLength(2);
  });

  it('rejects empty polyline6', () => {
    expect(() => RouteResult.parse({ ...VALID_RESULT, polyline6: '' })).toThrow();
  });

  it('rejects negative distanceM', () => {
    expect(() => RouteResult.parse({ ...VALID_RESULT, distanceM: -1 })).toThrow();
  });

  it('rejects fewer than 2 maneuvers', () => {
    expect(() => RouteResult.parse({ ...VALID_RESULT, maneuvers: [DEPART] })).toThrow();
  });

  it('accepts a maneuver with an optional modifier', () => {
    const withModifier = { ...DEPART, modifier: 'slight_right' };
    expect(() => RouteResult.parse({ ...VALID_RESULT, maneuvers: [withModifier, ARRIVE] })).not.toThrow();
  });
});
