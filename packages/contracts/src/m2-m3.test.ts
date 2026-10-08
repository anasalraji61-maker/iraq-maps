import { describe, expect, it } from 'vitest';
import { CityDescriptor, MAX_UPLOAD_BYTES, apiContract, RouteRequest, SatelliteLayer, StorageKey } from './index';

describe('M2 contracts', () => {
  it('allows at most 5 waypoints and defaults to none', () => {
    const at = [44.36, 33.31];
    expect(RouteRequest.parse({ origin: at, destination: at, mode: 'walk' }).waypoints).toEqual([]);
    expect(RouteRequest.safeParse({ origin: at, destination: at, mode: 'car', waypoints: Array(6).fill(at) }).success).toBe(false);
    expect(RouteRequest.safeParse({ origin: at, destination: at, mode: 'bike' }).success).toBe(false);
  });

  it('describes the satellite layer on the city descriptor, with a dated capture', () => {
    const layer = { url: '/v1/cities/baghdad/satellite/{z}/{x}/{y}', attribution: 'Contains modified Copernicus Sentinel data 2026', resolutionM: 10, capturedAt: '2026-09-14' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(true);
    expect(SatelliteLayer.safeParse({ ...layer, capturedAt: '14/09/2026' }).success).toBe(false);
    expect(CityDescriptor.shape.satellite.isOptional()).toBe(true);
  });
});

describe('M3 contracts', () => {
  it('accepts only flat storage keys', () => {
    for (const key of ['0b6f7c3e-2a8d-4f5b-9c1e-7d3a2b1c0e9f.jpg', 'a-b.webp']) expect(StorageKey.safeParse(key).success).toBe(true);
    for (const key of ['../x.jpg', '/etc/passwd', 'a/b.jpg', '.hidden', 'a..jpg', '']) expect(StorageKey.safeParse(key).success).toBe(false);
  });

  it('bounds uploads by type and size', () => {
    const body = apiContract.media.createUpload.body;
    expect(body.safeParse({ purpose: 'provider_photo', mime: 'image/jpeg', size: MAX_UPLOAD_BYTES }).success).toBe(true);
    expect(body.safeParse({ purpose: 'provider_photo', mime: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 }).success).toBe(false);
    expect(body.safeParse({ purpose: 'provider_photo', mime: 'image/svg+xml', size: 10 }).success).toBe(false);
  });
});
