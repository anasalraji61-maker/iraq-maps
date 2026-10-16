/**
 * Iraqi address formatter.
 *
 * Builds a structured and human-readable Arabic address from OSM tags,
 * following the Iraqi postal hierarchy:
 *   Governorate → City/Qadha → District/Nahiya → Neighbourhood → Street → Building
 *
 * Examples:
 *   "شارع الرشيد، الكرادة، بغداد"
 *   "شارع النضال، حي الجامعة، الموصل، نينوى"
 *   "مبنى 14، شارع المتحف، الكرخ، بغداد"
 *
 * ODbL compliance: formats OSM tag data only; does not mix with non-ODbL sources.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured Iraqi address parts, all optional except at least one must exist. */
export interface IraqiAddress {
  /** Top-level administrative division, e.g. "بغداد", "البصرة" */
  governorate?: string;
  /** City or qadha (district town), e.g. "الموصل", "كربلاء" */
  city?: string;
  /** Urban district or nahiya, e.g. "الكرادة", "الكرخ" */
  district?: string;
  /** Neighbourhood / quarter, e.g. "حي الجامعة", "منطقة العلاوي" */
  neighbourhood?: string;
  /** Street name, e.g. "شارع الرشيد", "شارع النضال" */
  street?: string;
  /** House/building number, e.g. "14", "مبنى أ" */
  houseNumber?: string;
  /** Full formatted string, derived by formatAddress(). */
  formatted?: string;
}

/** Raw OSM addr:* tags and related name tags. */
export interface OsmAddressTags {
  'addr:housenumber'?: string;
  'addr:street'?: string;
  'addr:city'?: string;
  'addr:suburb'?: string;
  'addr:district'?: string;
  'addr:province'?: string;
  'addr:state'?: string;
  'addr:country'?: string;
  'addr:postcode'?: string;
  'addr:neighbourhood'?: string;
  'addr:quarter'?: string;
  'addr:place'?: string;
  'addr:full'?: string;
  'is_in'?: string;
  'is_in:city'?: string;
  'is_in:county'?: string;
  'is_in:state'?: string;
  'is_in:country'?: string;
  'name'?: string;
  'name:ar'?: string;
  'name:en'?: string;
  [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// Iraq governorate name normalization
// (maps English / transliterated → canonical Arabic)
// ---------------------------------------------------------------------------

const GOVERNORATE_ARABIC: Record<string, string> = {
  // Standard transliterations
  baghdad: 'بغداد',
  basra: 'البصرة',
  basrah: 'البصرة',
  ninewa: 'نينوى',
  nineveh: 'نينوى',
  mosul: 'الموصل',
  erbil: 'أربيل',
  irbil: 'أربيل',
  arbil: 'أربيل',
  sulaymaniyah: 'السليمانية',
  suleimaniyya: 'السليمانية',
  duhok: 'دهوك',
  dohuk: 'دهوك',
  kirkuk: 'كركوك',
  tamim: 'كركوك',
  diyala: 'ديالى',
  anbar: 'الأنبار',
  karbala: 'كربلاء',
  najaf: 'النجف',
  babil: 'بابل',
  babylon: 'بابل',
  wasit: 'واسط',
  qadisiyah: 'القادسية',
  qadisiyyah: 'القادسية',
  muthanna: 'المثنى',
  dhi_qar: 'ذي قار',
  dhiqar: 'ذي قار',
  thi_qar: 'ذي قار',
  maysan: 'ميسان',
  missan: 'ميسان',
  saladin: 'صلاح الدين',
  salahaddin: 'صلاح الدين',
  tikrit: 'صلاح الدين',
  // Direct Arabic matches (passthrough)
  بغداد: 'بغداد',
  البصرة: 'البصرة',
  نينوى: 'نينوى',
  أربيل: 'أربيل',
  السليمانية: 'السليمانية',
  دهوك: 'دهوك',
  كركوك: 'كركوك',
  ديالى: 'ديالى',
  الأنبار: 'الأنبار',
  كربلاء: 'كربلاء',
  النجف: 'النجف',
  بابل: 'بابل',
  واسط: 'واسط',
  القادسية: 'القادسية',
  المثنى: 'المثنى',
  'ذي قار': 'ذي قار',
  ميسان: 'ميسان',
  'صلاح الدين': 'صلاح الدين',
};

// ---------------------------------------------------------------------------
// Common street prefix normalization for Iraqi Arabic
// ---------------------------------------------------------------------------

const STREET_PREFIXES: Record<string, string> = {
  'شارع ': 'شارع ',    // already prefixed
  'ش. ': 'شارع ',      // abbreviation
  'ش ': 'شارع ',       // abbreviation no dot
  'طريق ': 'طريق ',    // highway/road
  'زقاق ': 'زقاق ',    // alley
  'حارة ': 'حارة ',    // narrow lane
  'جادة ': 'جادة ',    // avenue
  'ساحة ': 'ساحة ',    // square/plaza
  'كورنيش ': 'كورنيش ', // corniche
};

const BUILDING_PREFIXES: Record<string, string> = {
  بناية: 'بناية',
  مبنى: 'مبنى',
  عمارة: 'عمارة',
  برج: 'برج',
  مجمع: 'مجمع',
};

// ---------------------------------------------------------------------------
// Core extraction helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a governorate name to its canonical Arabic form.
 * Returns the input unchanged if it's not recognized.
 */
export function normalizeGovernorate(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, '_');
  return GOVERNORATE_ARABIC[lower] ?? GOVERNORATE_ARABIC[trimmed] ?? trimmed;
}

/**
 * Normalize a street name: ensure proper شارع prefix for bare names.
 * If the name already has a recognized prefix, return as-is.
 */
export function normalizeStreetName(raw: string): string {
  const trimmed = raw.trim();
  for (const [abbr, expanded] of Object.entries(STREET_PREFIXES)) {
    if (trimmed.startsWith(abbr)) {
      return expanded + trimmed.slice(abbr.length).trim();
    }
  }
  // If the name contains Arabic letters but no recognized prefix,
  // check if it looks like a bare street name (not a place name)
  const hasArabic = /[؀-ۿ]/.test(trimmed);
  const hasPrefix = Object.values(STREET_PREFIXES).some(p => trimmed.startsWith(p));
  if (hasArabic && !hasPrefix && trimmed.length < 60) {
    // Heuristic: bare Arabic names get شارع prefix only if they don't look like
    // a neighbourhood/district name (which start with حي، منطقة، etc.)
    const neighbourhoodPrefixes = ['حي', 'منطقة', 'محلة', 'قضاء', 'ناحية'];
    const looksLikeNeighbourhood = neighbourhoodPrefixes.some(p => trimmed.startsWith(p));
    if (!looksLikeNeighbourhood) {
      return 'شارع ' + trimmed;
    }
  }
  return trimmed;
}

/**
 * Build a formatted building number / address line.
 * e.g. "14" → "رقم 14", "مبنى أ" → "مبنى أ"
 */
export function formatHouseNumber(raw: string): string {
  const trimmed = raw.trim();
  // If already prefixed with a building word, return as-is
  for (const prefix of Object.keys(BUILDING_PREFIXES)) {
    if (trimmed.startsWith(prefix)) return trimmed;
  }
  // If purely numeric, add رقم prefix
  if (/^\d+([A-Za-z]?)$/.test(trimmed)) {
    return `رقم ${trimmed}`;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Primary extraction from OSM tags
// ---------------------------------------------------------------------------

/**
 * Extract a structured IraqiAddress from raw OSM tags.
 *
 * Tries addr:* tags first, then falls back to is_in:* tags, then name tags.
 */
export function extractAddress(tags: OsmAddressTags): IraqiAddress {
  const result: IraqiAddress = {};

  // Governorate: addr:state or addr:province or is_in:state
  const rawGov =
    tags['addr:state'] ??
    tags['addr:province'] ??
    tags['is_in:state'] ??
    tags['is_in:county'];
  if (rawGov) {
    result.governorate = normalizeGovernorate(rawGov);
  }

  // City: addr:city or is_in:city
  const rawCity = tags['addr:city'] ?? tags['is_in:city'];
  if (rawCity) {
    result.city = rawCity.trim();
    // If city matches a governorate and we don't have governorate yet, treat as governorate
    if (!result.governorate) {
      const normalized = normalizeGovernorate(rawCity);
      if (normalized !== rawCity.trim()) {
        result.governorate = normalized;
        result.city = undefined;
      }
    }
  }

  // District: addr:district or addr:suburb
  const rawDistrict = tags['addr:district'] ?? tags['addr:suburb'];
  if (rawDistrict) {
    result.district = rawDistrict.trim();
  }

  // Neighbourhood: addr:neighbourhood or addr:quarter
  const rawNeighbourhood =
    tags['addr:neighbourhood'] ??
    tags['addr:quarter'] ??
    tags['addr:place'];
  if (rawNeighbourhood) {
    result.neighbourhood = rawNeighbourhood.trim();
  }

  // Street
  const rawStreet = tags['addr:street'];
  if (rawStreet) {
    result.street = normalizeStreetName(rawStreet);
  }

  // House number
  const rawHouseNumber = tags['addr:housenumber'];
  if (rawHouseNumber) {
    result.houseNumber = formatHouseNumber(rawHouseNumber);
  }

  // If we have addr:full, use it as a last resort for the formatted field
  const full = tags['addr:full'];
  if (full && !result.street && !result.city && !result.governorate) {
    result.formatted = full.trim();
    return result;
  }

  // Parse is_in free-text (e.g. "Karrada, Baghdad, Iraq")
  if (!result.city && !result.district && !result.governorate) {
    const isIn = tags['is_in'];
    if (isIn) {
      const parsed = parseIsIn(isIn);
      result.city ??= parsed.city;
      result.district ??= parsed.district;
      result.governorate ??= parsed.governorate;
    }
  }

  result.formatted = formatAddress(result);
  return result;
}

/**
 * Parse the free-text `is_in` tag into partial address components.
 * Format is typically "Neighbourhood, City, Governorate, Iraq" (comma-separated).
 */
function parseIsIn(isIn: string): Partial<IraqiAddress> {
  const parts = isIn
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const result: Partial<IraqiAddress> = {};
  if (parts.length === 0) return result;

  // Last part is often "Iraq" — skip it
  const cleaned = parts.filter(
    (p) => !['iraq', 'العراق', 'iq'].includes(p.toLowerCase()),
  );

  // Heuristic: rightmost = governorate, second from right = city, etc.
  if (cleaned.length >= 1) {
    result.governorate = normalizeGovernorate(cleaned[cleaned.length - 1]);
  }
  if (cleaned.length >= 2) {
    result.city = cleaned[cleaned.length - 2];
  }
  if (cleaned.length >= 3) {
    result.district = cleaned[cleaned.length - 3];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Build a single-line Arabic address string from a structured IraqiAddress.
 *
 * Format priority:
 *   [houseNumber،] [street،] [neighbourhood،] [district،] [city،] [governorate]
 *
 * Comma is the Arabic comma (،) per Arabic typography convention.
 */
export function formatAddress(addr: IraqiAddress): string {
  const parts: string[] = [];

  if (addr.houseNumber) parts.push(addr.houseNumber);
  if (addr.street) parts.push(addr.street);
  if (addr.neighbourhood) parts.push(addr.neighbourhood);
  if (addr.district && addr.district !== addr.neighbourhood) {
    parts.push(addr.district);
  }
  if (addr.city && addr.city !== addr.district) {
    parts.push(addr.city);
  }
  if (addr.governorate && addr.governorate !== addr.city) {
    parts.push(addr.governorate);
  }

  return parts.join('، ');
}

/**
 * Build a two-line address: first line has street + number, second has location.
 */
export function formatAddressMultiLine(addr: IraqiAddress): {
  line1: string;
  line2: string;
} {
  const lineParts1: string[] = [];
  if (addr.houseNumber) lineParts1.push(addr.houseNumber);
  if (addr.street) lineParts1.push(addr.street);

  const lineParts2: string[] = [];
  if (addr.neighbourhood) lineParts2.push(addr.neighbourhood);
  if (addr.district && addr.district !== addr.neighbourhood) {
    lineParts2.push(addr.district);
  }
  if (addr.city && addr.city !== addr.district) {
    lineParts2.push(addr.city);
  }
  if (addr.governorate && addr.governorate !== addr.city) {
    lineParts2.push(addr.governorate);
  }

  return {
    line1: lineParts1.join('، '),
    line2: lineParts2.join('، '),
  };
}

/**
 * Build a short address for map pins / search results (city + district only).
 */
export function formatShortAddress(addr: IraqiAddress): string {
  const parts: string[] = [];
  if (addr.district) parts.push(addr.district);
  else if (addr.neighbourhood) parts.push(addr.neighbourhood);
  if (addr.city && addr.city !== addr.district) parts.push(addr.city);
  else if (addr.governorate && addr.governorate !== addr.district) {
    parts.push(addr.governorate);
  }
  return parts.join('، ');
}

// ---------------------------------------------------------------------------
// Fallback: derive address from context (neighbourhood name)
// ---------------------------------------------------------------------------

/**
 * When no addr:* tags are present, derive a minimal address from the place's
 * context tags (e.g. a neighbourhood node with place=suburb).
 *
 * @param tags  Raw OSM tags for the place itself.
 * @param areaContext  Optional: nearest area record's name/tags for fallback.
 */
export function deriveAddressFromContext(
  tags: OsmAddressTags,
  areaContext?: { name?: string; nameAr?: string; city?: string; governorate?: string },
): IraqiAddress {
  // Try direct addr:* extraction first
  const direct = extractAddress(tags);
  if (direct.street || direct.city || direct.district) {
    return direct;
  }

  // Fall back to area context
  const result: IraqiAddress = {};
  if (areaContext) {
    result.neighbourhood = areaContext.nameAr ?? areaContext.name;
    result.city = areaContext.city;
    result.governorate = areaContext.governorate
      ? normalizeGovernorate(areaContext.governorate)
      : undefined;
  }
  result.formatted = formatAddress(result);
  return result;
}

// ---------------------------------------------------------------------------
// Geocoder reverse-result formatter
// ---------------------------------------------------------------------------

/**
 * Format a reverse-geocode result from Photon (which returns GeoJSON
 * properties) into an IraqiAddress.
 *
 * Photon properties of interest:
 *   name, street, housenumber, city, county, state, country, district, suburb
 */
export function fromPhotonProperties(props: Record<string, unknown>): IraqiAddress {
  const str = (key: string): string | undefined => {
    const v = props[key];
    return typeof v === 'string' && v ? v : undefined;
  };

  const result: IraqiAddress = {
    houseNumber: str('housenumber') ? formatHouseNumber(str('housenumber')!) : undefined,
    street: str('street') ? normalizeStreetName(str('street')!) : undefined,
    neighbourhood: str('suburb') ?? str('district'),
    district: str('district') ?? str('county'),
    city: str('city'),
    governorate: str('state') ? normalizeGovernorate(str('state')!) : undefined,
  };

  result.formatted = formatAddress(result);
  return result;
}

// ---------------------------------------------------------------------------
// Address comparison utilities
// ---------------------------------------------------------------------------

/** Normalize an address string for fuzzy comparison (remove diacritics, extra spaces). */
export function normalizeAddressForSearch(addr: string): string {
  return addr
    .replace(/[ً-ٟ]/g, '') // Arabic diacritics (tashkeel)
    .replace(/\s+/g, ' ')
    .replace(/[،,]/g, '،')
    .trim()
    .toLowerCase();
}

/**
 * Returns true if `candidate` address contains all the components of `query`.
 * Used for fuzzy address search in autocomplete.
 */
export function addressContains(candidate: string, query: string): boolean {
  const normalCandidate = normalizeAddressForSearch(candidate);
  const normalQuery = normalizeAddressForSearch(query);
  const queryParts = normalQuery.split('،').map((p) => p.trim());
  return queryParts.every((part) => normalCandidate.includes(part));
}

// ---------------------------------------------------------------------------
// Iraqi address validation
// ---------------------------------------------------------------------------

/** Returns true if the address has at least city or governorate info. */
export function isLocatable(addr: IraqiAddress): boolean {
  return !!(addr.city || addr.governorate || addr.district);
}

/** Returns true if the address has full street-level detail. */
export function isStreetLevel(addr: IraqiAddress): boolean {
  return !!(addr.street && (addr.city || addr.district));
}
