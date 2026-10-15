/**
 * Unit tests for SatelliteLayer and imagery contracts.
 */
import { describe, expect, it } from 'vitest';
import { SatelliteLayer } from './imagery';

const VALID_LAYER = {
  url: 'pmtiles://https://example.com/city.pmtiles',
  attribution: 'Contains modified Copernicus Sentinel data 2026',
  resolutionM: 10,
  capturedAt: '2026-09-01',
};

describe('SatelliteLayer', () => {
  it('accepts a valid pmtiles url', () => {
    expect(SatelliteLayer.safeParse(VALID_LAYER).success).toBe(true);
  });

  it('accepts a root-relative raster XYZ template', () => {
    const layer = { ...VALID_LAYER, url: '/tiles/{z}/{x}/{y}.webp' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(true);
  });

  it('accepts an absolute https raster XYZ template', () => {
    const layer = { ...VALID_LAYER, url: 'https://cdn.example.com/sat/{z}/{x}/{y}' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(true);
  });

  it('rejects a URL without {z}/{x}/{y} placeholders (non-pmtiles)', () => {
    const layer = { ...VALID_LAYER, url: 'https://example.com/tiles/map.png' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });

  it('rejects an empty attribution', () => {
    const layer = { ...VALID_LAYER, attribution: '' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });

  it('rejects attribution longer than 300 characters', () => {
    const layer = { ...VALID_LAYER, attribution: 'x'.repeat(301) };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });

  it('rejects non-positive resolutionM', () => {
    const layer = { ...VALID_LAYER, resolutionM: 0 };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });

  it('rejects negative resolutionM', () => {
    const layer = { ...VALID_LAYER, resolutionM: -10 };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });

  it('rejects invalid capturedAt date format', () => {
    const layer = { ...VALID_LAYER, capturedAt: '01-09-2026' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });

  it('rejects capturedAt with datetime instead of date', () => {
    const layer = { ...VALID_LAYER, capturedAt: '2026-09-01T00:00:00Z' };
    expect(SatelliteLayer.safeParse(layer).success).toBe(false);
  });
});
