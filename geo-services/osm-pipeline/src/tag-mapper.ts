/**
 * OSM tag → PlaceCategory mapper and icon selector.
 *
 * Mirrors the rules in packages/contracts/schemas/osm-categories.json so that the
 * TypeScript pipeline produces the same category assignments as the Python pipeline
 * and the Planetiler tiles profile.
 *
 * RULE ORDER: the first matching rule wins; an exact value beats "*"; ignoredValues
 * never match. This is identical to the Python `category()` function in extract.py.
 *
 * ODbL compliance: this file maps data attributes only — it never combines OSM data
 * with non-ODbL data or modifies the data in a way that would affect share-alike.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single category rule from osm-categories.json. */
export interface CategoryRule {
  key: string;
  values: Record<string, string>;
}

/** The full osm-categories.json schema. */
export interface OsmCategories {
  ignoredValues: string[];
  rules: CategoryRule[];
}

/** A PlaceCategory value as defined in packages/contracts. */
export type PlaceCategory =
  | 'food'
  | 'cafe'
  | 'lodging'
  | 'shopping'
  | 'tourism'
  | 'health'
  | 'finance'
  | 'fuel'
  | 'office'
  | 'worship'
  | 'education'
  | 'government'
  | 'transport'
  | 'entertainment'
  | 'other';

/** Icon name (from Material Symbols / SF Symbols) per category. */
export type CategoryIcon =
  | 'restaurant'
  | 'local_cafe'
  | 'hotel'
  | 'shopping_cart'
  | 'attractions'
  | 'local_hospital'
  | 'account_balance'
  | 'local_gas_station'
  | 'business_center'
  | 'mosque'
  | 'school'
  | 'account_balance_wallet'
  | 'directions_bus'
  | 'theaters'
  | 'place';

// ---------------------------------------------------------------------------
// Load the shared categories JSON (build-time path resolution)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In production build the JSON lives two hops above src/; in dev it's the same.
function loadOsmCategories(): OsmCategories {
  const candidates = [
    // Repo-relative: geo-services/osm-pipeline/src/../../.. → repo root
    join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'schemas', 'osm-categories.json'),
    // Fallback: adjacent to this file (for tests that bundle the JSON)
    join(__dirname, 'osm-categories.json'),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')) as OsmCategories;
    } catch {
      // try next
    }
  }
  throw new Error('osm-pipeline: cannot find osm-categories.json');
}

const OSM_CATEGORIES: OsmCategories = loadOsmCategories();

// ---------------------------------------------------------------------------
// Ignored values set (O(1) lookup)
// ---------------------------------------------------------------------------

const IGNORED = new Set(OSM_CATEGORIES.ignoredValues);

// ---------------------------------------------------------------------------
// Icon map — one icon per PlaceCategory
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<PlaceCategory, CategoryIcon> = {
  food: 'restaurant',
  cafe: 'local_cafe',
  lodging: 'hotel',
  shopping: 'shopping_cart',
  tourism: 'attractions',
  health: 'local_hospital',
  finance: 'account_balance',
  fuel: 'local_gas_station',
  office: 'business_center',
  worship: 'mosque',
  education: 'school',
  government: 'account_balance_wallet',
  transport: 'directions_bus',
  entertainment: 'theaters',
  other: 'place',
};

// ---------------------------------------------------------------------------
// Allowed-categories set builder (passed from city config)
// ---------------------------------------------------------------------------

export function buildAllowedSet(categories: string[]): Set<string> {
  return new Set(categories);
}

// ---------------------------------------------------------------------------
// Core mapping function
// ---------------------------------------------------------------------------

/**
 * Returns the PlaceCategory for a given OSM tag set, or `null` if no rule
 * matches or the matched category is not in `allowed`.
 *
 * @param tags   - The OSM tag dictionary for a single element.
 * @param allowed - The set of categories the city config lists. Pass `null` to
 *                  skip the allowlist check (used in tests and the CLI's
 *                  `--all-categories` mode).
 */
export function mapCategory(
  tags: Record<string, string>,
  allowed: Set<string> | null,
): PlaceCategory | null {
  for (const rule of OSM_CATEGORIES.rules) {
    const v = tags[rule.key];
    if (!v || IGNORED.has(v)) continue;
    const hit = rule.values[v] ?? rule.values['*'];
    if (!hit) continue;
    if (allowed && !allowed.has(hit)) return null;
    return hit as PlaceCategory;
  }
  return null;
}

/**
 * Like `mapCategory` but always returns a value — falls back to `'other'`.
 */
export function mapCategoryOrOther(
  tags: Record<string, string>,
  allowed: Set<string> | null,
): PlaceCategory {
  return mapCategory(tags, allowed) ?? 'other';
}

// ---------------------------------------------------------------------------
// Convenience: category → icon
// ---------------------------------------------------------------------------

export function iconForCategory(category: PlaceCategory): CategoryIcon {
  return CATEGORY_ICONS[category];
}

// ---------------------------------------------------------------------------
// Full tag-to-metadata mapper
// ---------------------------------------------------------------------------

/** All metadata we can derive from a single OSM element's tags. */
export interface TagMetadata {
  category: PlaceCategory | null;
  icon: CategoryIcon | null;
  /** Whether the element is a mosque/church/synagogue etc. (useful for direction hints). */
  isReligious: boolean;
  /** Whether the element is a pharmacy specifically (used for health sub-filter). */
  isPharmacy: boolean;
  /** Whether the element is a mosque specifically. */
  isMosque: boolean;
  /** Whether the element is a hospital specifically. */
  isHospital: boolean;
  /** Whether the element is a fuel station specifically. */
  isFuelStation: boolean;
  /** Whether the element is a school (broad: school/university/college). */
  isSchool: boolean;
  /** Whether the element is a bank (not ATM). */
  isBank: boolean;
  /** Whether the element is a restaurant (not cafe/fast_food). */
  isRestaurant: boolean;
  /** Whether the element is a café. */
  isCafe: boolean;
  /** Whether the element is a shop. */
  isShop: boolean;
  /** Whether the element is a tourist attraction. */
  isTouristAttraction: boolean;
  /** Whether the element is a park. */
  isPark: boolean;
  /** Whether the element is a hotel or other lodging. */
  isLodging: boolean;
  /** A short human-readable subtype hint derived from the raw OSM tags, e.g. "pharmacy", "mosque". */
  subtype: string | null;
}

/**
 * Derives all metadata from a single element's tag dictionary.
 *
 * Keeps the tag logic in one place so callers never inspect raw tags.
 */
export function mapTags(
  tags: Record<string, string>,
  allowed: Set<string> | null,
): TagMetadata {
  const category = mapCategory(tags, allowed);
  const amenity = tags['amenity'] ?? '';
  const shop = tags['shop'];
  const tourism = tags['tourism'];
  const leisure = tags['leisure'];
  const religion = tags['religion'];

  const isMosque =
    amenity === 'place_of_worship' &&
    (religion === 'muslim' || religion === 'islam' || !religion);
  const isReligious = amenity === 'place_of_worship';
  const isPharmacy = amenity === 'pharmacy';
  const isHospital = amenity === 'hospital' || amenity === 'clinic';
  const isFuelStation = amenity === 'fuel';
  const isSchool =
    amenity === 'school' || amenity === 'university' || amenity === 'college';
  const isBank = amenity === 'bank';
  const isRestaurant = amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court';
  const isCafe = amenity === 'cafe' || amenity === 'hookah_lounge';
  const isShop = !!shop;
  const isTouristAttraction =
    tourism === 'attraction' ||
    tourism === 'museum' ||
    tourism === 'gallery' ||
    !!tags['historic'];
  const isPark = leisure === 'park';
  const isLodging =
    tourism === 'hotel' ||
    tourism === 'motel' ||
    tourism === 'guest_house' ||
    tourism === 'hostel' ||
    tourism === 'apartment';

  // Subtype: prefer the raw OSM value over the category
  let subtype: string | null = null;
  if (amenity && amenity !== 'yes') subtype = amenity;
  else if (shop && shop !== 'yes') subtype = shop;
  else if (tourism && tourism !== 'yes') subtype = tourism;
  else if (leisure && leisure !== 'yes') subtype = leisure;
  else if (tags['historic']) subtype = tags['historic'];
  else if (tags['office']) subtype = tags['office'];
  else if (tags['healthcare']) subtype = tags['healthcare'];

  return {
    category,
    icon: category ? iconForCategory(category) : null,
    isReligious,
    isPharmacy,
    isMosque,
    isHospital,
    isFuelStation,
    isSchool,
    isBank,
    isRestaurant,
    isCafe,
    isShop,
    isTouristAttraction,
    isPark,
    isLodging,
    subtype,
  };
}

// ---------------------------------------------------------------------------
// Exhaustive tag-key reference (used by the parser to filter elements early)
// ---------------------------------------------------------------------------

/**
 * The set of OSM tag keys that can yield a category.  Used to pre-filter
 * elements before doing full tag inspection — identical to what the Python
 * pipeline does with `osmium.filter.KeyFilter`.
 */
export const CATEGORY_KEYS: ReadonlySet<string> = new Set(
  OSM_CATEGORIES.rules.map((r) => r.key),
);

/** All keys we ever look at on an OSM element. */
export const INTERESTING_KEYS: ReadonlySet<string> = new Set([
  ...CATEGORY_KEYS,
  'highway',
  'place',
  'boundary',
  'admin_level',
  'name',
  'name:ar',
  'name:ku',
  'name:ckb',
  'name:en',
  'phone',
  'contact:phone',
  'mobile',
  'contact:mobile',
  'opening_hours',
  'website',
  'contact:website',
  'url',
  'religion',
]);

// ---------------------------------------------------------------------------
// Extended mapping table (for documentation / CLI --list-mappings)
// ---------------------------------------------------------------------------

/** A human-readable summary row for one tag → category mapping. */
export interface MappingRow {
  key: string;
  value: string;
  category: PlaceCategory;
  icon: CategoryIcon;
  note: string;
}

/** Returns all 50+ mappings as a flat, sorted list. */
export function listAllMappings(): MappingRow[] {
  const rows: MappingRow[] = [];
  for (const rule of OSM_CATEGORIES.rules) {
    for (const [value, category] of Object.entries(rule.values)) {
      rows.push({
        key: rule.key,
        value,
        category: category as PlaceCategory,
        icon: iconForCategory(category as PlaceCategory),
        note: value === '*' ? `any ${rule.key}=* value not otherwise listed` : '',
      });
    }
  }
  rows.sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value));
  return rows;
}
