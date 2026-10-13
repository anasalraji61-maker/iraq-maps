/**
 * E2E: POST /v1/routes on a minimal NestJS app that wires only routingModule.
 * All tests skip when VALHALLA_URL is not set (the real engine is not available in the gate).
 * They run in CI only when the geo-data workflow has started a Valhalla instance.
 */
import { routingModule } from '@iraq-maps/routing';
import { RouteResult, ManeuverType, type LngLat } from '@iraq-maps/contracts';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skip = !process.env.VALHALLA_URL;

// ---------------------------------------------------------------------------
// Minimal app that wires only the routing module (no DB, no identity).
// ---------------------------------------------------------------------------
let app: NestFastifyApplication;

beforeAll(async () => {
  if (skip) return;

  const mod = routingModule({ env: { VALHALLA_URL: process.env.VALHALLA_URL } });

  @Module({ imports: [mod] })
  class AppModule {}

  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }), { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 30_000);

afterAll(async () => { await app?.close(); });

type Method = 'GET' | 'POST';
const post = (url: string, payload: object) =>
  app.inject({ method: 'POST' as Method, url, payload });

/** Baghdad centre to Tahrir Square — well-connected points in the fixture tiles. */
const FROM: LngLat = [44.361, 33.341];
const TO: LngLat = [44.394, 33.341];
/** Point outside the fixture tile coverage. */
const OUTSIDE: LngLat = [0.0, 0.0];

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/routes', () => {
  it('returns 200 with a valid RouteResult for car mode', async () => {
    const res = await post('/v1/routes', { origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    expect(res.statusCode).toBe(200);
    const body: unknown = res.json();
    expect(RouteResult.safeParse(body).success).toBe(true);
  });

  it('returns 200 with a valid RouteResult for walk mode', async () => {
    const res = await post('/v1/routes', { origin: FROM, destination: TO, waypoints: [], mode: 'walk' });
    expect(res.statusCode).toBe(200);
    const body: unknown = res.json();
    expect(RouteResult.safeParse(body).success).toBe(true);
  });

  it('returns 200 with car mode faster than walk mode', async () => {
    const [carRes, walkRes] = await Promise.all([
      post('/v1/routes', { origin: FROM, destination: TO, waypoints: [], mode: 'car' }),
      post('/v1/routes', { origin: FROM, destination: TO, waypoints: [], mode: 'walk' }),
    ]);
    expect(carRes.statusCode).toBe(200);
    expect(walkRes.statusCode).toBe(200);
    const car = RouteResult.parse(carRes.json());
    const walk = RouteResult.parse(walkRes.json());
    expect(car.durationS).toBeLessThan(walk.durationS);
  });

  it('returns 404 with code no_route for impossible coordinates', async () => {
    const res = await post('/v1/routes', { origin: OUTSIDE, destination: [0.01, 0.01], waypoints: [], mode: 'car' });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code?: string };
    expect(body.code).toBe('no_route');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await post('/v1/routes', { origin: FROM });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for out-of-range coordinates', async () => {
    const res = await post('/v1/routes', { origin: [200, 100], destination: TO, waypoints: [], mode: 'car' });
    expect(res.statusCode).toBe(400);
  });

  it('maneuvers contain only valid ManeuverType values', async () => {
    const res = await post('/v1/routes', { origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    expect(res.statusCode).toBe(200);
    const route = RouteResult.parse(res.json());
    const validTypes = ManeuverType.options;
    for (const m of route.maneuvers) {
      expect(validTypes).toContain(m.type);
    }
  });

  it('polyline6 geometry is non-empty and decodable ASCII', async () => {
    const res = await post('/v1/routes', { origin: FROM, destination: TO, waypoints: [], mode: 'car' });
    expect(res.statusCode).toBe(200);
    const route = RouteResult.parse(res.json());
    expect(route.polyline6.length).toBeGreaterThan(0);
    // polyline6 only contains printable ASCII (chars 63–126)
    for (const ch of route.polyline6) {
      expect(ch.charCodeAt(0)).toBeGreaterThanOrEqual(63);
      expect(ch.charCodeAt(0)).toBeLessThanOrEqual(126);
    }
  });
});
