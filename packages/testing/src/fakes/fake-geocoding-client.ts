/**
 * FakeGeocodingClient — in-memory fake for tests that consume the GeocoderClient port.
 *
 * Implements the GeocoderClient interface from @iraq-maps/contracts:
 *  - geocode: free-form text → GeocodeResult[]
 *  - reverseGeocode: lat/lng → ReverseGeocodeResult | null
 *  - autocomplete: partial text → AddressSuggestion[]
 *
 * Pre-seeded with a handful of Baghdad locations. Tests can add their own
 * locations via `seed()` and inspect calls via `calls`.
 */
import { randomUUID } from 'node:crypto';

// ─── Types (mirrors packages/contracts/src/geocoding.ts) ────────────────────

export type Locale = 'ar' | 'ckb' | 'en';

export interface LngLat {
  lng: number;
  lat: number;
}

export interface AddressComponent {
  governorate?: string;
  governorateId?: string;
  city?: string;
  district?: string;
  neighborhood?: string;
  street?: string;
  houseNumber?: string;
  postcode?: string;
  landmark?: string;
}

export interface FormattedAddress {
  full: string;
  short: string;
  components: AddressComponent;
}

export interface GeocodeResult {
  id: string;
  location: LngLat;
  bbox?: [number, number, number, number];
  address: FormattedAddress;
  confidence: number;
  osmRef?: string;
}

export interface ReverseGeocodeResult {
  location: LngLat;
  address: FormattedAddress;
  distanceM: number;
  osmRef?: string;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  sublabel?: string;
  location: LngLat;
  bbox?: [number, number, number, number];
}

export interface GeocodeQuery {
  q: string;
  near?: LngLat;
  governorateId?: string;
  limit?: number;
  locale?: Locale;
}

export interface ReverseGeocodeQuery {
  lat: number;
  lng: number;
  locale?: Locale;
}

export interface AutocompleteQuery {
  partial: string;
  governorateId?: string;
  near?: LngLat;
  limit?: number;
  locale?: Locale;
}

// ─── Seeded location record ──────────────────────────────────────────────────

export interface FakeLocation {
  id: string;
  names: string[];          // matched substrings (Arabic, English, etc.)
  location: LngLat;
  address: FormattedAddress;
  osmRef?: string;
}

// ─── Error helpers ────────────────────────────────────────────────────────────

class GeocodingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

// ─── Default Baghdad seed data ────────────────────────────────────────────────

function baghdadAddress(
  full: string,
  short: string,
  neighborhood: string,
  district?: string,
): FormattedAddress {
  return {
    full,
    short,
    components: {
      governorate: 'بغداد',
      governorateId: 'baghdad',
      city: 'بغداد',
      district,
      neighborhood,
    },
  };
}

const DEFAULT_LOCATIONS: FakeLocation[] = [
  {
    id: 'node/123001',
    names: ['قلعه', 'قلعة', 'القلعة', 'qala', 'castle'],
    location: { lng: 44.3661, lat: 33.3406 },
    address: baghdadAddress(
      'القلعة، الكرادة، بغداد',
      'القلعة، الكرادة',
      'الكرادة',
      'قضاء الكرادة',
    ),
    osmRef: 'node/123001',
  },
  {
    id: 'node/123002',
    names: ['ساحة التحرير', 'تحرير', 'tahrir', 'liberation square'],
    location: { lng: 44.3976, lat: 33.3409 },
    address: baghdadAddress(
      'ساحة التحرير، الرصافة، بغداد',
      'ساحة التحرير',
      'الرصافة',
      'قضاء الرصافة',
    ),
    osmRef: 'node/123002',
  },
  {
    id: 'node/123003',
    names: ['المنطقة الخضراء', 'green zone', 'international zone'],
    location: { lng: 44.3843, lat: 33.3152 },
    address: baghdadAddress(
      'المنطقة الخضراء، الكرخ، بغداد',
      'المنطقة الخضراء',
      'الكرخ',
      'قضاء الكرخ',
    ),
    osmRef: 'way/123003',
  },
  {
    id: 'node/123004',
    names: ['شارع المتنبي', 'متنبي', 'mutanabbi', 'al-mutanabbi'],
    location: { lng: 44.3922, lat: 33.3388 },
    address: baghdadAddress(
      'شارع المتنبي، الرصافة، بغداد',
      'شارع المتنبي',
      'الرصافة',
      'قضاء الرصافة',
    ),
    osmRef: 'way/123004',
  },
  {
    id: 'node/123005',
    names: ['مطار بغداد', 'مطار', 'baghdad airport', 'biap'],
    location: { lng: 44.2346, lat: 33.2625 },
    address: {
      full: 'مطار بغداد الدولي، بغداد',
      short: 'مطار بغداد الدولي',
      components: {
        governorate: 'بغداد',
        governorateId: 'baghdad',
        city: 'بغداد',
      },
    },
    osmRef: 'node/123005',
  },
];

// ─── Fake implementation ──────────────────────────────────────────────────────

export class FakeGeocodingClient {
  readonly kind = 'fake' as const;

  private readonly locations: FakeLocation[] = [...DEFAULT_LOCATIONS];

  /** Audit log of all calls for assertions. */
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  // ─── Seed helpers ─────────────────────────────────────────────────────────

  /**
   * Add one or more locations to the fake's in-memory index.
   * The location is matched by any of the strings in `names` (case-insensitive,
   * substring match — same as the real Photon behaviour for short queries).
   */
  seed(...locs: FakeLocation[]): this {
    this.locations.push(...locs);
    return this;
  }

  /** Remove all seeded locations (restores the default Baghdad set). */
  reset(): void {
    this.locations.length = 0;
    this.locations.push(...DEFAULT_LOCATIONS);
    this.calls.length = 0;
  }

  /** Clear everything, including the defaults. Useful for strict unit tests. */
  clear(): void {
    this.locations.length = 0;
    this.calls.length = 0;
  }

  // ─── GeocoderClient interface ─────────────────────────────────────────────

  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    this.calls.push({ method: 'geocode', args: [query] });

    const limit = Math.min(query.limit ?? 5, 10);
    const q = query.q.toLowerCase().trim();
    if (!q) return [];

    const matches = this.locations
      .filter((loc) => loc.names.some((n) => n.toLowerCase().includes(q)))
      .slice(0, limit)
      .map((loc, i) => this.toGeocodeResult(loc, 1 - i * 0.05));

    return matches;
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> {
    this.calls.push({ method: 'reverseGeocode', args: [query] });

    // Return the nearest seeded location (Euclidean distance, good enough for a fake)
    let nearest: FakeLocation | null = null;
    let minDist = Infinity;

    for (const loc of this.locations) {
      const d = Math.hypot(loc.location.lng - query.lng, loc.location.lat - query.lat);
      if (d < minDist) {
        minDist = d;
        nearest = loc;
      }
    }

    if (!nearest) return null;

    // Rough conversion: 1 degree ≈ 111 km
    const distanceM = minDist * 111_000;

    return {
      location: nearest.location,
      address: nearest.address,
      distanceM: Math.round(distanceM),
      osmRef: nearest.osmRef,
    };
  }

  async autocomplete(query: AutocompleteQuery): Promise<AddressSuggestion[]> {
    this.calls.push({ method: 'autocomplete', args: [query] });

    const limit = Math.min(query.limit ?? 5, 10);
    const partial = query.partial.toLowerCase().trim();
    if (!partial) return [];

    return this.locations
      .filter((loc) => loc.names.some((n) => n.toLowerCase().includes(partial)))
      .slice(0, limit)
      .map((loc) => ({
        id: loc.id,
        label: loc.address.full,
        sublabel: loc.address.components.district ?? loc.address.components.governorate,
        location: loc.location,
      }));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toGeocodeResult(loc: FakeLocation, confidence: number): GeocodeResult {
    return {
      id: loc.id,
      location: loc.location,
      address: loc.address,
      confidence: Math.max(0, Math.min(1, confidence)),
      osmRef: loc.osmRef,
    };
  }

  // ─── Test helpers (not part of GeocoderClient) ────────────────────────────

  /** Build a minimal FakeLocation from just a name and coordinates. */
  static makeLocation(
    nameParts: string[],
    location: LngLat,
    overrides: Partial<FakeLocation> = {},
  ): FakeLocation {
    return {
      id: randomUUID(),
      names: nameParts,
      location,
      address: {
        full: nameParts[0] ?? 'موقع مجهول',
        short: nameParts[0] ?? 'موقع مجهول',
        components: {},
      },
      ...overrides,
    };
  }
}
