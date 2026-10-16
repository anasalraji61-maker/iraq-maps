/**
 * In-memory fake GeocoderClient for tests and local dev (no Photon needed).
 * Implements the same interface as PhotonClient.
 * Returns seeded Baghdad results so UI and integration tests work offline.
 */
import type {
  AddressSuggestion,
  AutocompleteQuery,
  GeocoderClient,
  GeocodeQuery,
  GeocodeResult,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
} from '@iraq-maps/contracts';
import { formatIraqAddress } from './address-format';

const SEED_RESULTS: GeocodeResult[] = [
  {
    id: 'node/1',
    location: [44.38, 33.30],
    address: formatIraqAddress({
      governorate: 'بغداد',
      neighborhood: 'الكرادة',
      street: 'شارع الكرادة الداخلي',
      houseNumber: '14',
    }),
    confidence: 0.9,
    osmRef: 'node/1',
  },
  {
    id: 'node/2',
    location: [44.33, 33.32],
    address: formatIraqAddress({
      governorate: 'بغداد',
      neighborhood: 'المنصور',
      street: 'شارع 14 تموز',
    }),
    confidence: 0.85,
    osmRef: 'node/2',
  },
  {
    id: 'node/3',
    location: [44.40, 33.35],
    address: formatIraqAddress({
      governorate: 'بغداد',
      neighborhood: 'الأعظمية',
      street: 'شارع الإمام الأعظم',
    }),
    confidence: 0.8,
    osmRef: 'node/3',
  },
];

export class FakeGeocoderClient implements GeocoderClient {
  readonly kind = 'fake' as const;

  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    const q = query.q.toLowerCase();
    return SEED_RESULTS.filter(
      (r) =>
        r.address.full.includes(query.q) ||
        r.address.short.includes(query.q) ||
        q.includes('بغداد') ||
        q.includes('baghdad'),
    ).slice(0, query.limit);
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> {
    // Return the nearest seed result within 5 km
    const nearest = SEED_RESULTS.find((r) => {
      const [lng, lat] = r.location;
      return Math.abs(lat - query.lat) < 0.05 && Math.abs(lng - query.lng) < 0.05;
    });
    if (!nearest) return null;
    const [lng, lat] = nearest.location;
    const dLat = (query.lat - lat) * 111_000;
    const dLng = (query.lng - lng) * 111_000 * Math.cos(lat * (Math.PI / 180));
    return {
      location: nearest.location,
      address: nearest.address,
      distanceM: Math.sqrt(dLat ** 2 + dLng ** 2),
      osmRef: nearest.osmRef,
    };
  }

  async autocomplete(query: AutocompleteQuery): Promise<AddressSuggestion[]> {
    const q = query.partial.toLowerCase();
    return SEED_RESULTS.filter(
      (r) => r.address.full.includes(query.partial) || r.address.short.includes(query.partial) || q.length < 2,
    )
      .slice(0, query.limit)
      .map((r) => ({
        id: r.id,
        label: r.address.short,
        sublabel: r.address.components.governorate,
        location: r.location,
      }));
  }
}
