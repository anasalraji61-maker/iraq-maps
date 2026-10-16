/**
 * Unit tests for geocoding module — service, address formatting, admin data.
 * Uses FakeGeocoderClient; no network.
 */
import { describe, expect, it } from 'vitest';
import { formatIraqAddress, isInIraq, buildLandmarkPhrase } from './address-format';
import { IRAQ_ADMIN_DIVISIONS } from './iraq-admin';
import { IRAQ_NEIGHBORHOODS } from './iraq-neighborhoods';
import { FakeGeocoderClient } from './fake-geocoder';
import { GeocodingService } from './service';

const svc = new GeocodingService(new FakeGeocoderClient());

// ── formatIraqAddress ─────────────────────────────────────────────────────────

describe('formatIraqAddress', () => {
  it('formats full Iraqi address', () => {
    const result = formatIraqAddress({
      governorate: 'بغداد',
      neighborhood: 'الكرادة',
      street: 'شارع السعدون',
      houseNumber: '22',
    });
    expect(result.full).toContain('بغداد');
    expect(result.full).toContain('الكرادة');
    expect(result.full).toContain('شارع السعدون');
    expect(result.short).toContain('الكرادة');
  });

  it('short falls back to district when no neighbourhood', () => {
    const result = formatIraqAddress({ district: 'الرصافة', street: 'شارع النضال' });
    expect(result.short).toContain('الرصافة');
  });

  it('handles empty components gracefully', () => {
    const result = formatIraqAddress({});
    expect(result.full).toBe('');
    expect(result.short).toBe('');
  });

  it('includes landmark in full address', () => {
    const result = formatIraqAddress({ neighborhood: 'الكرادة', landmark: 'بجانب جامع الرحمن' });
    expect(result.full).toContain('بجانب جامع الرحمن');
  });
});

// ── isInIraq ─────────────────────────────────────────────────────────────────

describe('isInIraq', () => {
  it('returns true for Baghdad center', () => {
    expect(isInIraq(33.31, 44.36)).toBe(true);
  });

  it('returns true for Erbil', () => {
    expect(isInIraq(36.19, 44.01)).toBe(true);
  });

  it('returns false for London', () => {
    expect(isInIraq(51.5, -0.12)).toBe(false);
  });

  it('returns false for north of Iran', () => {
    expect(isInIraq(38.5, 50.0)).toBe(false);
  });
});

// ── buildLandmarkPhrase ────────────────────────────────────────────────────────

describe('buildLandmarkPhrase', () => {
  it('joins landmark and street', () => {
    expect(buildLandmarkPhrase('بجانب مسجد الرحمن', 'شارع فلسطين')).toBe('بجانب مسجد الرحمن، شارع فلسطين');
  });

  it('returns landmark alone when no street', () => {
    expect(buildLandmarkPhrase('قرب السوق', undefined)).toBe('قرب السوق');
  });
});

// ── IRAQ_ADMIN_DIVISIONS ──────────────────────────────────────────────────────

describe('IRAQ_ADMIN_DIVISIONS', () => {
  it('has 19 governorates', () => {
    expect(IRAQ_ADMIN_DIVISIONS).toHaveLength(19);
  });

  it('every governorate has a bbox and center', () => {
    for (const gov of IRAQ_ADMIN_DIVISIONS) {
      expect(gov.bbox).toHaveLength(4);
      expect(gov.center).toHaveLength(2);
    }
  });

  it('every governorate has Arabic name', () => {
    for (const gov of IRAQ_ADMIN_DIVISIONS) {
      expect(gov.names.ar.length).toBeGreaterThan(0);
    }
  });

  it('Baghdad has at least 5 districts', () => {
    const baghdad = IRAQ_ADMIN_DIVISIONS.find((d) => d.id === 'baghdad');
    expect(baghdad).toBeDefined();
    expect(baghdad!.districts.length).toBeGreaterThanOrEqual(5);
  });
});

// ── IRAQ_NEIGHBORHOODS ────────────────────────────────────────────────────────

describe('IRAQ_NEIGHBORHOODS', () => {
  it('contains Baghdad neighbourhoods', () => {
    const baghdadNbs = IRAQ_NEIGHBORHOODS.filter((nb) => nb.id.startsWith('baghdad'));
    expect(baghdadNbs.length).toBeGreaterThan(5);
  });

  it('every neighbourhood has Arabic name and center', () => {
    for (const nb of IRAQ_NEIGHBORHOODS) {
      expect(nb.names.ar.length).toBeGreaterThan(0);
      expect(nb.center).toHaveLength(2);
    }
  });
});

// ── GeocodingService ──────────────────────────────────────────────────────────

describe('GeocodingService.reverseGeocode', () => {
  it('returns null for location outside Iraq', async () => {
    const result = await svc.reverseGeocode(51.5, -0.12);
    expect(result).toBeNull();
  });

  it('returns a result for Baghdad center', async () => {
    const result = await svc.reverseGeocode(33.30, 44.38);
    expect(result).not.toBeNull();
    expect(result!.address.full.length).toBeGreaterThan(0);
  });
});

describe('GeocodingService.structuredGeocode', () => {
  it('returns results for a structured Baghdad query', async () => {
    const results = await svc.structuredGeocode({
      governorateId: 'baghdad',
      neighborhood: 'الكرادة',
      locale: 'ar',
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array for empty query', async () => {
    const results = await svc.structuredGeocode({ locale: 'ar' });
    expect(results).toHaveLength(0);
  });
});

describe('GeocodingService.autocompleteAddress', () => {
  it('returns empty array for empty partial', async () => {
    const results = await svc.autocompleteAddress('');
    expect(results).toHaveLength(0);
  });

  it('returns suggestions for partial Baghdad text', async () => {
    const results = await svc.autocompleteAddress('بغداد');
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('GeocodingService.getIraqAdminDivisions', () => {
  it('returns all 19 governorates', () => {
    expect(svc.getIraqAdminDivisions()).toHaveLength(19);
  });
});

describe('GeocodingService.getBoundingBox', () => {
  it('finds Baghdad by Arabic name', () => {
    const result = svc.getBoundingBox('بغداد');
    expect(result).not.toBeNull();
    expect(result!.level).toBe('governorate');
  });

  it('finds Erbil by English name', () => {
    const result = svc.getBoundingBox('Erbil', 'en');
    expect(result).not.toBeNull();
    expect(result!.center[0]).toBeGreaterThan(43);
  });

  it('returns null for unknown area', () => {
    expect(svc.getBoundingBox('nowhere-land')).toBeNull();
  });

  it('finds a district', () => {
    const result = svc.getBoundingBox('الكرخ');
    expect(result).not.toBeNull();
    expect(result!.level).toBe('district');
  });
});

describe('GeocodingService.getNeighborhoods', () => {
  it('returns Baghdad neighbourhoods', () => {
    const nbs = svc.getNeighborhoods('بغداد');
    expect(nbs.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown city', () => {
    expect(svc.getNeighborhoods('xyzunknown')).toHaveLength(0);
  });
});

describe('GeocodingService.validateIraqAddress', () => {
  it('returns inIraq=false for empty address', async () => {
    const result = await svc.validateIraqAddress('');
    expect(result.valid).toBe(false);
    expect(result.inIraq).toBe(false);
  });

  it('validates a Baghdad address', async () => {
    const result = await svc.validateIraqAddress('الكرادة، بغداد');
    expect(typeof result.valid).toBe('boolean');
  });
});
