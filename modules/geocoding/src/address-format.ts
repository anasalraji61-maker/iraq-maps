/**
 * Iraqi address formatting utilities.
 * Arabic-first: components are ordered city → district → neighbourhood → street → building.
 * RTL output; uses U+2068 FSI / U+2069 PDI around numbers.
 */
import type { AddressComponent, FormattedAddress } from '@iraq-maps/contracts';

/** Wrap non-Arabic segments (numbers, Latin) in FSI/PDI for correct RTL display. */
function isolate(s: string): string {
  return `⁨${s}⁩`;
}

/**
 * Format Iraqi address components into full and short strings.
 * Arabic follows the convention: المحافظة، المدينة، الحي، الشارع، رقم البناء
 */
export function formatIraqAddress(components: AddressComponent): FormattedAddress {
  const parts: string[] = [];

  if (components.governorate) parts.push(components.governorate);
  if (components.city && components.city !== components.governorate) parts.push(components.city);
  if (components.district) parts.push(components.district);
  if (components.neighborhood) parts.push(components.neighborhood);
  if (components.street) parts.push(components.street);
  if (components.houseNumber) parts.push(isolate(components.houseNumber));
  if (components.landmark) parts.push(components.landmark);

  const full = parts.join('، ') || '';

  // Short: neighbourhood + street, falling back to city, then landmark
  const shortParts: string[] = [];
  if (components.neighborhood) shortParts.push(components.neighborhood);
  else if (components.district) shortParts.push(components.district);
  else if (components.city) shortParts.push(components.city);

  if (components.street) shortParts.push(components.street);
  if (shortParts.length === 0 && components.landmark) shortParts.push(components.landmark);

  const short = shortParts.join('، ') || full;

  return { full, short, components };
}

/**
 * Parse a Photon GeoJSON feature's `properties` into AddressComponent.
 * Photon returns `city`, `district`, `street`, `housenumber`, `postcode`, `name`, `country`.
 */
export function photonPropsToComponents(
  props: Record<string, unknown>,
  locale: 'ar' | 'ckb' | 'en',
): AddressComponent {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

  // Photon may return `name` as the POI name; for reverse geocoding we use neighbourhood/street.
  // Locale-specific name fields are `name:ar`, `name:ckb`, `name:en`.
  const locName = (base: string): string | undefined =>
    str(props[`${base}:${locale}`]) ?? str(props[base]);

  return {
    governorate: locName('state') ?? locName('county'),
    city: locName('city') ?? locName('town') ?? locName('village'),
    district: locName('district'),
    neighborhood: locName('suburb') ?? locName('quarter') ?? locName('neighbourhood'),
    street: locName('street'),
    houseNumber: str(props['housenumber']),
    postcode: str(props['postcode']),
  };
}

/**
 * Build a simple "landmark reference" phrase used in Iraq:
 *   "بجانب مسجد/مدرسة X، شارع Y" → informal landmark address.
 */
export function buildLandmarkPhrase(landmark: string, street?: string): string {
  if (!street) return landmark;
  return `${landmark}، ${street}`;
}

/** Returns true if lat/lng is within Iraq's bounding box (with a 0.5° margin). */
export function isInIraq(lat: number, lng: number): boolean {
  // [west, south, east, north] + 0.5° margin
  return lng >= 38.29 && lng <= 49.07 && lat >= 28.56 && lat <= 37.88;
}
