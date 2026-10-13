import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { routeReport, runRoutes, samplePairs } from '../src/route-bench.ts';

// ---------------------------------------------------------------------------
// samplePairs
// ---------------------------------------------------------------------------
describe('samplePairs', () => {
  it('returns the requested count of pairs', () => {
    expect(samplePairs(10, { west: 44.0, south: 33.0, east: 44.5, north: 33.5 })).toHaveLength(10);
  });

  it('all coordinates are within the bbox', () => {
    const bbox = { west: 44.0, south: 33.0, east: 44.5, north: 33.5 };
    for (const [origin, destination] of samplePairs(50, bbox)) {
      expect(origin[0]).toBeGreaterThanOrEqual(bbox.west);
      expect(origin[0]).toBeLessThanOrEqual(bbox.east);
      expect(origin[1]).toBeGreaterThanOrEqual(bbox.south);
      expect(origin[1]).toBeLessThanOrEqual(bbox.north);
      expect(destination[0]).toBeGreaterThanOrEqual(bbox.west);
      expect(destination[0]).toBeLessThanOrEqual(bbox.east);
      expect(destination[1]).toBeGreaterThanOrEqual(bbox.south);
      expect(destination[1]).toBeLessThanOrEqual(bbox.north);
    }
  });

  it('is deterministic for the same seed', () => {
    const bbox = { west: 44.0, south: 33.0, east: 44.5, north: 33.5 };
    expect(samplePairs(5, bbox, 7)).toEqual(samplePairs(5, bbox, 7));
  });

  it('differs with different seeds', () => {
    const bbox = { west: 44.0, south: 33.0, east: 44.5, north: 33.5 };
    expect(samplePairs(5, bbox, 1)).not.toEqual(samplePairs(5, bbox, 2));
  });

  it('returns empty array for count 0', () => {
    expect(samplePairs(0, { west: 44.0, south: 33.0, east: 44.5, north: 33.5 })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// routeReport
// ---------------------------------------------------------------------------
describe('routeReport', () => {
  it('computes p50/p95/max using nearest-rank', () => {
    const r = routeReport(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(r.p50Ms).toBe(50);
    expect(r.p95Ms).toBe(95);
    expect(r.maxMs).toBe(100);
  });

  it('rounds to one decimal place', () => {
    const r = routeReport([100.123, 200.456]);
    expect(r.p50Ms.toString()).toMatch(/^\d+(\.\d)?$/);
  });

  it('handles a single-element array', () => {
    const r = routeReport([42]);
    expect(r.p50Ms).toBe(42);
    expect(r.p95Ms).toBe(42);
    expect(r.maxMs).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// runRoutes
// ---------------------------------------------------------------------------
describe('runRoutes', () => {
  it('counts HTTP errors as errors and returns latency for successes', async () => {
    const server = createServer((_req, res) => res.writeHead(503).end('{}'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { times, errors } = await runRoutes(api, [[[44.36, 33.31], [44.4, 33.35]]], 1);
    server.close();
    expect(errors).toBe(1);
    expect(times).toHaveLength(0);
  });

  it('returns latency samples for contract-valid 200 responses', async () => {
    const validBody = JSON.stringify({
      polyline6: 'abc123',
      distanceM: 1000,
      durationS: 120,
      bbox: [44.0, 33.0, 44.5, 33.5],
      maneuvers: [
        { type: 'depart', streetNames: [], distanceM: 500, durationS: 60, beginShapeIndex: 0 },
        { type: 'arrive', streetNames: [], distanceM: 500, durationS: 60, beginShapeIndex: 10 },
      ],
    });
    const server = createServer((_req, res) => res.writeHead(200).end(validBody));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { times, errors } = await runRoutes(api, [[[44.36, 33.31], [44.4, 33.35]]], 1);
    server.close();
    expect(errors).toBe(0);
    expect(times).toHaveLength(1);
    expect(times[0]).toBeGreaterThan(0);
  });
});
