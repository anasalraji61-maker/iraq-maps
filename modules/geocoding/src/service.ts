/**
 * GeocodingService — the main domain service for geocoding in Iraq Smart Maps.
 *
 * Exposes:
 *   - reverseGeocode     coordinate → FormattedAddress
 *   - structuredGeocode  form fields → GeocodeResult[]
 *   - autocompleteAddress partial text → AddressSuggestion[]
 *   - getIraqAdminDivisions  full governorate/district tree
 *   - validateIraqAddress    sanity-check a candidate address
 *   - getBoundingBox         name → BBox + center
 *   - getNeighborhoods       city/governorate → neighborhoods list
 *
 * All Photon calls pass through the GeocoderClient port; never called from mobile.
 */
import type {
  AddressSuggestion,
  AddressValidationResult,
  AutocompleteQuery,
  GeocoderClient,
  GeocodeResult,
  IraqAdminDivision,
  IraqNeighborhood,
  NamedBBox,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
  StructuredGeocodeQuery,
} from '@iraq-maps/contracts';
import { formatIraqAddress, isInIraq } from './address-format';
import { IRAQ_ADMIN_DIVISIONS } from './iraq-admin';
import { IRAQ_NEIGHBORHOODS } from './iraq-neighborhoods';

export class GeocodingService {
  constructor(private readonly geocoder: GeocoderClient) {}

  // ── Reverse geocoding ──────────────────────────────────────────────────────

  async reverseGeocode(lat: number, lng: number, locale: 'ar' | 'ckb' | 'en' = 'ar'): Promise<ReverseGeocodeResult | null> {
    if (!isInIraq(lat, lng)) return null;
    const query: ReverseGeocodeQuery = { lat, lng, locale };
    return this.geocoder.reverseGeocode(query);
  }

  // ── Structured geocoding ───────────────────────────────────────────────────

  async structuredGeocode(q: StructuredGeocodeQuery): Promise<GeocodeResult[]> {
    // Build a natural-language query from the structured fields then forward to Photon.
    const parts: string[] = [];
    // Order: building → street → neighbourhood → district → city → governorate
    // (specific first for best Photon results)
    if (q.houseNumber) parts.push(q.houseNumber);
    if (q.street) parts.push(q.street);
    if (q.neighborhood) parts.push(q.neighborhood);
    if (q.district) parts.push(q.district);
    if (q.city) parts.push(q.city);

    // Add governorate name in Arabic if only an id was given
    if (q.governorateId) {
      const gov = IRAQ_ADMIN_DIVISIONS.find((d) => d.id === q.governorateId);
      if (gov) {
        const govName = q.locale === 'en' ? gov.names.en : (q.locale === 'ckb' ? (gov.names.ckb ?? gov.names.ar) : gov.names.ar);
        if (!parts.includes(govName)) parts.push(govName);
      }
    }

    if (parts.length === 0) return [];

    const govDiv = q.governorateId ? IRAQ_ADMIN_DIVISIONS.find((d) => d.id === q.governorateId) : undefined;

    return this.geocoder.geocode({
      q: parts.join(' '),
      near: govDiv ? govDiv.center : undefined,
      governorateId: q.governorateId,
      limit: 5,
      locale: q.locale,
    });
  }

  // ── Autocomplete ────────────────────────────────────────────────────────────

  async autocompleteAddress(
    partial: string,
    governorateId?: string,
    near?: [number, number],
    limit = 5,
    locale: 'ar' | 'ckb' | 'en' = 'ar',
  ): Promise<AddressSuggestion[]> {
    if (partial.trim().length === 0) return [];

    const query: AutocompleteQuery = {
      partial: partial.trim(),
      near,
      limit,
      locale,
    };

    // Narrow to governorate if supplied and valid
    if (governorateId) {
      const gov = IRAQ_ADMIN_DIVISIONS.find((d) => d.id === governorateId);
      if (gov && !near) {
        query.near = gov.center;
      }
    }

    return this.geocoder.autocomplete(query);
  }

  // ── Admin divisions ────────────────────────────────────────────────────────

  getIraqAdminDivisions(): IraqAdminDivision[] {
    return IRAQ_ADMIN_DIVISIONS;
  }

  getGovernorateById(id: string): IraqAdminDivision | undefined {
    return IRAQ_ADMIN_DIVISIONS.find((d) => d.id === id);
  }

  // ── Address validation ─────────────────────────────────────────────────────

  async validateIraqAddress(address: string, locale: 'ar' | 'ckb' | 'en' = 'ar'): Promise<AddressValidationResult> {
    if (!address || address.trim().length === 0) {
      return { valid: false, inIraq: false, issues: { address: 'empty' } };
    }

    // Fast path: attempt a geocode and see if the top result is in Iraq.
    const results = await this.geocoder.geocode({ q: address, limit: 1, locale });
    if (results.length === 0) {
      return { valid: false, inIraq: false, issues: { address: 'not_found' } };
    }

    const top = results[0]!;
    const [lng, lat] = top.location;
    const inIraq = isInIraq(lat, lng);

    return {
      valid: inIraq && top.confidence >= 0.5,
      inIraq,
      suggestion: inIraq ? top : undefined,
      issues: !inIraq ? { address: 'outside_iraq' } : undefined,
    };
  }

  // ── Bounding box ────────────────────────────────────────────────────────────

  getBoundingBox(name: string, locale: 'ar' | 'ckb' | 'en' = 'ar'): NamedBBox | null {
    const q = name.trim().toLowerCase();
    if (!q) return null;

    // Search admin divisions first (fast, no network)
    for (const gov of IRAQ_ADMIN_DIVISIONS) {
      const govName = locale === 'en' ? gov.names.en : (locale === 'ckb' ? (gov.names.ckb ?? gov.names.ar) : gov.names.ar);
      if (govName.toLowerCase().includes(q) || gov.names.ar.includes(name)) {
        return {
          name: govName,
          bbox: gov.bbox,
          center: gov.center,
          level: 'governorate',
        };
      }

      for (const dist of gov.districts) {
        const distName = locale === 'en' ? dist.names.en : (locale === 'ckb' ? (dist.names.ckb ?? dist.names.ar) : dist.names.ar);
        if (distName.toLowerCase().includes(q) || dist.names.ar.includes(name)) {
          return {
            name: distName,
            bbox: dist.bbox ?? [
              gov.center[0] - 0.05,
              gov.center[1] - 0.05,
              gov.center[0] + 0.05,
              gov.center[1] + 0.05,
            ],
            center: dist.center,
            level: 'district',
          };
        }
      }
    }

    // Search neighbourhoods
    for (const nb of IRAQ_NEIGHBORHOODS) {
      const nbName = locale === 'en' ? nb.names.en : (locale === 'ckb' ? (nb.names.ckb ?? nb.names.ar) : nb.names.ar);
      if (nbName.toLowerCase().includes(q) || nb.names.ar.includes(name)) {
        const [cx, cy] = nb.center;
        return {
          name: nbName,
          bbox: nb.bbox ?? [cx - 0.02, cy - 0.02, cx + 0.02, cy + 0.02],
          center: nb.center,
          level: 'neighborhood',
        };
      }
    }

    return null;
  }

  // ── Neighbourhoods ─────────────────────────────────────────────────────────

  getNeighborhoods(city: string, locale: 'ar' | 'ckb' | 'en' = 'ar'): IraqNeighborhood[] {
    const q = city.trim().toLowerCase();
    if (!q) return IRAQ_NEIGHBORHOODS;

    // Match by governorate names, district names, or city names
    const matchingGovIds = new Set<string>();
    for (const gov of IRAQ_ADMIN_DIVISIONS) {
      const govName = locale === 'en' ? gov.names.en : (locale === 'ckb' ? (gov.names.ckb ?? gov.names.ar) : gov.names.ar);
      if (govName.toLowerCase().includes(q) || gov.names.ar.includes(city)) {
        matchingGovIds.add(gov.id);
      }
      for (const dist of gov.districts) {
        const distName = locale === 'en' ? dist.names.en : (locale === 'ckb' ? (dist.names.ckb ?? dist.names.ar) : dist.names.ar);
        if (distName.toLowerCase().includes(q) || dist.names.ar.includes(city)) {
          matchingGovIds.add(gov.id);
        }
      }
    }

    if (matchingGovIds.size === 0) return [];
    const firstId = [...matchingGovIds][0] ?? '';
    return IRAQ_NEIGHBORHOODS.filter((nb) => nb.id.startsWith(firstId));
  }

  /** Build a formatted address from components (no network call). */
  formatComponents(
    governorate: string | undefined,
    district: string | undefined,
    neighborhood: string | undefined,
    street: string | undefined,
    building: string | undefined,
    landmark: string | undefined,
  ) {
    return formatIraqAddress({
      governorate,
      district,
      neighborhood,
      street,
      houseNumber: building,
      landmark,
    });
  }
}
