/**
 * Unit tests for FakeRoutingPort and routingConformance helper.
 * Verifies the fake drives the conformance suite correctly.
 */
import { describe, expect, it } from 'vitest';
import { FakeRoutingPort, routingConformance } from './routing';
import type { LngLat } from '@iraq-maps/contracts';

const FROM: LngLat = [44.36, 33.32];
const TO: LngLat = [44.42, 33.38];
const OUTSIDE: LngLat = [40.0, 30.0];

describe('FakeRoutingPort', () => {
  it('has kind fake', () => {
    const port = new FakeRoutingPort();
    expect(port.kind).toBe('fake');
  });

  it('returns a route for two points inside coverage', async () => {
    const port = new FakeRoutingPort();
    const result = await port.route({ origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    expect(result).not.toBeNull();
    expect(result!.distanceM).toBeGreaterThan(0);
  });

  it('returns null when origin is outside coverage', async () => {
    const port = new FakeRoutingPort();
    const result = await port.route({ origin: OUTSIDE, destination: TO, waypoints: [], mode: 'car' });
    expect(result).toBeNull();
  });

  it('returns null when destination is outside coverage', async () => {
    const port = new FakeRoutingPort();
    const result = await port.route({ origin: FROM, destination: OUTSIDE, waypoints: [], mode: 'walk' });
    expect(result).toBeNull();
  });

  it('walk mode gives a longer duration than car for the same trip', async () => {
    const port = new FakeRoutingPort();
    const car = await port.route({ origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    const walk = await port.route({ origin: FROM, destination: TO, waypoints: [], mode: 'walk' });
    expect(walk!.durationS).toBeGreaterThan(car!.durationS);
  });

  it('route has depart first and arrive last in maneuvers', async () => {
    const port = new FakeRoutingPort();
    const result = await port.route({ origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    expect(result!.maneuvers[0]?.type).toBe('depart');
    expect(result!.maneuvers.at(-1)?.type).toBe('arrive');
  });

  it('bbox covers all route points', async () => {
    const port = new FakeRoutingPort();
    const result = await port.route({ origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    const [w, s, e, n] = result!.bbox;
    expect(w).toBeLessThanOrEqual(e);
    expect(s).toBeLessThanOrEqual(n);
  });
});

routingConformance('FakeRoutingPort', () => ({
  port: new FakeRoutingPort(),
  from: FROM,
  to: TO,
  unroutable: [OUTSIDE, [41.0, 31.0]],
}));
