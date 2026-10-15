/**
 * Unit tests for common.ts schemas: branded types, IraqiPhone, LngLat, BBox, Locale, Role, paginated.
 */
import { describe, expect, it } from 'vitest';
import { UserId, PlaceId, CityId, IraqiPhone, LngLat, BBox, Locale, Role, Problem, paginated } from './common';
import { z } from 'zod';

describe('UserId', () => {
  it('accepts a valid UUID', () => {
    expect(() => UserId.parse('00000000-0000-0000-0000-000000000001')).not.toThrow();
  });
  it('rejects a non-UUID string', () => {
    expect(() => UserId.parse('not-a-uuid')).toThrow();
  });
  it('rejects empty string', () => {
    expect(() => UserId.parse('')).toThrow();
  });
});

describe('PlaceId', () => {
  it('accepts a short OSM-style id like n12345', () => {
    expect(PlaceId.parse('n12345')).toBeDefined();
  });
  it('rejects empty string', () => {
    expect(() => PlaceId.parse('')).toThrow();
  });
});

describe('CityId', () => {
  it('accepts lowercase-alphanumeric-hyphen id', () => {
    expect(CityId.parse('baghdad')).toBeDefined();
  });
  it('accepts id with hyphens', () => {
    expect(CityId.parse('al-anbar')).toBeDefined();
  });
  it('rejects id starting with digit', () => {
    expect(() => CityId.parse('3city')).toThrow();
  });
  it('rejects uppercase', () => {
    expect(() => CityId.parse('Baghdad')).toThrow();
  });
});

describe('IraqiPhone', () => {
  it('accepts a valid Iraqi mobile number', () => {
    expect(IraqiPhone.parse('+9647701234567')).toBeDefined();
  });
  it('rejects a number without country code', () => {
    expect(() => IraqiPhone.parse('07701234567')).toThrow();
  });
  it('rejects a non-Iraqi country code', () => {
    expect(() => IraqiPhone.parse('+447701234567')).toThrow();
  });
  it('rejects too short', () => {
    expect(() => IraqiPhone.parse('+96477012345')).toThrow();
  });
});

describe('LngLat', () => {
  it('accepts valid [lng, lat]', () => {
    expect(LngLat.parse([44.4, 33.3])).toEqual([44.4, 33.3]);
  });
  it('rejects lng > 180', () => {
    expect(() => LngLat.parse([200, 33.3])).toThrow();
  });
  it('rejects lat > 90', () => {
    expect(() => LngLat.parse([44.4, 91])).toThrow();
  });
  it('rejects non-array', () => {
    expect(() => LngLat.parse({ lng: 44, lat: 33 })).toThrow();
  });
});

describe('BBox', () => {
  it('accepts a 4-element bbox', () => {
    expect(BBox.parse([44.2, 33.2, 44.6, 33.5])).toHaveLength(4);
  });
  it('rejects fewer than 4 elements', () => {
    expect(() => BBox.parse([44.2, 33.2, 44.6])).toThrow();
  });
});

describe('Locale', () => {
  it('accepts ar', () => expect(Locale.parse('ar')).toBe('ar'));
  it('accepts ckb', () => expect(Locale.parse('ckb')).toBe('ckb'));
  it('accepts en', () => expect(Locale.parse('en')).toBe('en'));
  it('rejects fr', () => expect(() => Locale.parse('fr')).toThrow());
});

describe('Role', () => {
  it('accepts user', () => expect(Role.parse('user')).toBe('user'));
  it('accepts admin', () => expect(Role.parse('admin')).toBe('admin'));
  it('rejects superuser', () => expect(() => Role.parse('superuser')).toThrow());
});

describe('Problem', () => {
  it('parses a valid problem object', () => {
    const p = Problem.parse({ title: 'Not Found', status: 404 });
    expect(p.status).toBe(404);
    expect(p.type).toBe('about:blank'); // default
  });
  it('accepts optional code and detail', () => {
    const p = Problem.parse({ title: 'Not Found', status: 404, code: 'place_not_found', detail: 'Place n999 does not exist' });
    expect(p.code).toBe('place_not_found');
  });
  it('rejects missing title', () => {
    expect(() => Problem.parse({ status: 404 })).toThrow();
  });
  it('rejects missing status', () => {
    expect(() => Problem.parse({ title: 'Error' })).toThrow();
  });
});

describe('paginated', () => {
  const PagedString = paginated(z.string());

  it('parses a valid paginated response with items and null cursor', () => {
    const r = PagedString.parse({ items: ['a', 'b'], nextCursor: null });
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toBeNull();
  });

  it('parses a paginated response with a next cursor', () => {
    const r = PagedString.parse({ items: [], nextCursor: 'abc123' });
    expect(r.nextCursor).toBe('abc123');
  });

  it('rejects missing items', () => {
    expect(() => PagedString.parse({ nextCursor: null })).toThrow();
  });
});
