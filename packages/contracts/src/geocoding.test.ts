/**
 * Unit tests for geocoding contract schemas.
 */
import { describe, expect, it } from 'vitest';
import {
  AddressComponent,
  AddressSuggestion,
  AddressValidationResult,
  AutocompleteQuery,
  FormattedAddress,
  GeocodeQuery,
  GeocodeResult,
  IraqAdminDivision,
  IraqGovernorateId,
  NamedBBox,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
  StructuredGeocodeQuery,
} from './geocoding';

// ── IraqGovernorateId ─────────────────────────────────────────────────────────

describe('IraqGovernorateId', () => {
  it('accepts baghdad', () => expect(IraqGovernorateId.parse('baghdad')).toBe('baghdad'));
  it('accepts halabja', () => expect(IraqGovernorateId.parse('halabja')).toBe('halabja'));
  it('rejects unknown', () => expect(() => IraqGovernorateId.parse('london')).toThrow());
});

// ── AddressComponent ──────────────────────────────────────────────────────────

describe('AddressComponent', () => {
  it('accepts all optional fields empty', () => {
    expect(() => AddressComponent.parse({})).not.toThrow();
  });

  it('accepts a full Iraqi address', () => {
    const comp = AddressComponent.parse({
      governorate: 'بغداد',
      governorateId: 'baghdad',
      city: 'الكرادة',
      district: 'الرصافة',
      neighborhood: 'حي الكرادة',
      street: 'شارع السعدون',
      houseNumber: '14',
      landmark: 'بجانب جامع الرحمن',
    });
    expect(comp.governorate).toBe('بغداد');
    expect(comp.houseNumber).toBe('14');
  });

  it('rejects too-long street name', () => {
    expect(() => AddressComponent.parse({ street: 'x'.repeat(201) })).toThrow();
  });
});

// ── FormattedAddress ──────────────────────────────────────────────────────────

describe('FormattedAddress', () => {
  const VALID = {
    full: 'بغداد، الكرادة، شارع السعدون، 14',
    short: 'الكرادة، شارع السعدون',
    components: {},
  };

  it('parses a valid formatted address', () => {
    const r = FormattedAddress.parse(VALID);
    expect(r.full).toContain('بغداد');
    expect(r.short).toContain('الكرادة');
  });

  it('rejects empty full', () => {
    expect(() => FormattedAddress.parse({ ...VALID, full: '' })).toThrow();
  });
});

// ── GeocodeResult ─────────────────────────────────────────────────────────────

describe('GeocodeResult', () => {
  const VALID = {
    id: 'node/12345',
    location: [44.38, 33.30],
    address: {
      full: 'بغداد، الكرادة',
      short: 'الكرادة',
      components: {},
    },
    confidence: 0.9,
  };

  it('parses a valid result', () => {
    const r = GeocodeResult.parse(VALID);
    expect(r.confidence).toBe(0.9);
    expect(r.location).toEqual([44.38, 33.30]);
  });

  it('rejects confidence > 1', () => {
    expect(() => GeocodeResult.parse({ ...VALID, confidence: 1.1 })).toThrow();
  });

  it('accepts optional bbox', () => {
    const r = GeocodeResult.parse({ ...VALID, bbox: [44.35, 33.27, 44.42, 33.33] });
    expect(r.bbox).toHaveLength(4);
  });
});

// ── ReverseGeocodeResult ───────────────────────────────────────────────────────

describe('ReverseGeocodeResult', () => {
  const VALID = {
    location: [44.38, 33.30],
    address: { full: 'بغداد', short: 'بغداد', components: {} },
    distanceM: 15.5,
  };

  it('parses valid result', () => {
    expect(() => ReverseGeocodeResult.parse(VALID)).not.toThrow();
  });

  it('rejects negative distanceM', () => {
    expect(() => ReverseGeocodeResult.parse({ ...VALID, distanceM: -1 })).toThrow();
  });
});

// ── GeocodeQuery ──────────────────────────────────────────────────────────────

describe('GeocodeQuery', () => {
  it('defaults limit to 5 and locale to ar', () => {
    const q = GeocodeQuery.parse({ q: 'الكرادة' });
    expect(q.limit).toBe(5);
    expect(q.locale).toBe('ar');
  });

  it('rejects empty q', () => {
    expect(() => GeocodeQuery.parse({ q: '' })).toThrow();
  });

  it('rejects limit > 10', () => {
    expect(() => GeocodeQuery.parse({ q: 'x', limit: 11 })).toThrow();
  });
});

// ── ReverseGeocodeQuery ───────────────────────────────────────────────────────

describe('ReverseGeocodeQuery', () => {
  it('parses valid Baghdad coordinate', () => {
    const q = ReverseGeocodeQuery.parse({ lat: 33.3, lng: 44.4 });
    expect(q.locale).toBe('ar');
  });

  it('rejects lat > 90', () => {
    expect(() => ReverseGeocodeQuery.parse({ lat: 91, lng: 44 })).toThrow();
  });
});

// ── AutocompleteQuery ─────────────────────────────────────────────────────────

describe('AutocompleteQuery', () => {
  it('parses with defaults', () => {
    const q = AutocompleteQuery.parse({ partial: 'ك' });
    expect(q.limit).toBe(5);
    expect(q.locale).toBe('ar');
  });

  it('rejects empty partial', () => {
    expect(() => AutocompleteQuery.parse({ partial: '' })).toThrow();
  });
});

// ── StructuredGeocodeQuery ────────────────────────────────────────────────────

describe('StructuredGeocodeQuery', () => {
  it('accepts all-empty structured query', () => {
    const q = StructuredGeocodeQuery.parse({});
    expect(q.locale).toBe('ar');
  });
});

// ── AddressSuggestion ─────────────────────────────────────────────────────────

describe('AddressSuggestion', () => {
  it('parses a valid suggestion', () => {
    const s = AddressSuggestion.parse({
      id: 'node/1',
      label: 'الكرادة الداخلية',
      location: [44.38, 33.30],
    });
    expect(s.sublabel).toBeUndefined();
  });
});

// ── IraqAdminDivision ─────────────────────────────────────────────────────────

describe('IraqAdminDivision', () => {
  it('parses a valid division', () => {
    const div = IraqAdminDivision.parse({
      id: 'baghdad',
      names: { ar: 'بغداد', en: 'Baghdad' },
      center: [44.37, 33.31],
      bbox: [44.09, 33.06, 44.65, 33.56],
      districts: [],
    });
    expect(div.id).toBe('baghdad');
  });
});

// ── NamedBBox ─────────────────────────────────────────────────────────────────

describe('NamedBBox', () => {
  it('accepts a valid named bbox', () => {
    const nb = NamedBBox.parse({
      name: 'بغداد',
      bbox: [44.09, 33.06, 44.65, 33.56],
      center: [44.37, 33.31],
      level: 'governorate',
    });
    expect(nb.level).toBe('governorate');
  });

  it('rejects invalid level', () => {
    expect(() =>
      NamedBBox.parse({ name: 'x', bbox: [0, 0, 0, 0], center: [0, 0], level: 'country' }),
    ).toThrow();
  });
});

// ── AddressValidationResult ────────────────────────────────────────────────────

describe('AddressValidationResult', () => {
  it('parses valid=true result', () => {
    const r = AddressValidationResult.parse({ valid: true, inIraq: true });
    expect(r.valid).toBe(true);
  });

  it('parses invalid result with issues', () => {
    const r = AddressValidationResult.parse({
      valid: false,
      inIraq: false,
      issues: { address: 'outside_iraq' },
    });
    expect(r.issues?.address).toBe('outside_iraq');
  });
});
