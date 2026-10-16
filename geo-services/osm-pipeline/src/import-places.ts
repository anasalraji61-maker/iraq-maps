/**
 * OSM → PlaceImportRecord converter for Iraq.
 *
 * Parses an OSM JSON export (Overpass API format) or a pre-processed NDJSON
 * file and produces records that are compatible with `PlaceImportRecord` from
 * packages/contracts, ready for bulk insert via modules/places.
 *
 * Supported element types
 * -----------------------
 *   - nodes       → places (amenity/shop/tourism/leisure/office/healthcare)
 *   - ways        → streets (named highway ways) + closed-way areas
 *   - relations   → areas (boundary/place=suburb/quarter/neighbourhood)
 *
 * Name extraction priority
 * ------------------------
 *   1. name:ar   (Arabic, preferred per product spec)
 *   2. name:ckb  (Kurdish Sorani)
 *   3. name:ku   (Kurdish Latin — used as ckb fallback)
 *   4. name:en   (English fallback)
 *   5. name      (tag language-neutral fallback)
 *
 * Iraq bbox
 * ---------
 * All features outside 29.0–37.5 °N, 38.5–48.8 °E are rejected.
 *
 * ODbL compliance
 * ---------------
 * - OSM-derived features go to `places.osm_features` (ODbL data).
 * - Provider-submitted data goes to `places.provider_features` (our own terms).
 * - The two tables are NEVER joined in a way that forces share-alike on our user data.
 * - Attribution must be shown at all times: "Map data © OpenStreetMap contributors"
 *
 * @module import-places
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

import {
  extractNames,
  extractPhone,
  extractWebsite,
  extractOpeningHours,
  isInsideIraq,
  isInsideBBox,
  isValidCoordinate,
  isValidOsmId,
  validateOsmFeature,
  deduplicateByOsmId,
  newImportStats,
  recordSkip,
  recordImported,
  recordError,
  recordProcessed,
  type ImportStats,
  type BBox,
} from './validators.js';
import {
  mapCategory,
  buildAllowedSet,
  INTERESTING_KEYS,
  type PlaceCategory,
} from './tag-mapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors PlaceImportRecord from packages/contracts (reproduced to avoid a
 *  circular workspace dependency at pipeline build time). */
export interface OsmPlaceRecord {
  /** e.g. "n123456", "w654321", "r99" */
  id: string;
  kind: 'place' | 'street' | 'area';
  category: PlaceCategory | null;
  names: {
    name: string;
    ar?: string;
    ckb?: string;
    en?: string;
  };
  /** [longitude, latitude] */
  location: [number, number];
  /** ODbL — always "osm". */
  source: 'osm';
  /** SPDX identifier of the data licence. */
  license: 'ODbL-1.0';
  /** Attribution string shown in-app. */
  attribution: 'Map data © OpenStreetMap contributors';
  tags: {
    opening_hours?: string;
    phone?: string;
    website?: string;
  };
  /** Confidence envelope required by the no-invented-data rule. */
  osmMeta: {
    osmId: string;
    osmType: 'node' | 'way' | 'relation';
    observedAt: string; // ISO-8601 date of the import run
  };
}

// ---------------------------------------------------------------------------
// Overpass / OSM JSON element shapes
// ---------------------------------------------------------------------------

interface OsmJsonNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OsmJsonWayNode {
  lat: number;
  lon: number;
  ref?: number;
}

interface OsmJsonWay {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: OsmJsonWayNode[];
  tags?: Record<string, string>;
  /** When the way is closed (first node = last node), set by the Overpass `geom` output. */
  center?: { lat: number; lon: number };
}

interface OsmJsonRelation {
  type: 'relation';
  id: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

type OsmJsonElement = OsmJsonNode | OsmJsonWay | OsmJsonRelation;

interface OsmJsonRoot {
  version?: number;
  elements: OsmJsonElement[];
}

// ---------------------------------------------------------------------------
// Import options
// ---------------------------------------------------------------------------

export interface ImportOptions {
  /** ISO-8601 timestamp of the import run (written into osmMeta.observedAt). */
  observedAt?: string;
  /** City bounding box — records outside it are dropped. */
  cityBBox?: BBox;
  /** Only emit records whose category is in this set. `null` = all categories. */
  allowedCategories?: Set<string> | null;
  /** When true, areas (suburbs/boundaries) are included. Default: true. */
  includeAreas?: boolean;
  /** When true, streets are included. Default: true. */
  includeStreets?: boolean;
  /** Max number of records to emit (for testing / dry-run previews). */
  limit?: number;
}

const STREET_TYPES = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street', 'road', 'pedestrian',
]);

const AREA_PLACES = new Set(['suburb', 'quarter', 'neighbourhood']);
const ADMIN_LEVELS = new Set(['6', '7', '8', '9', '10']);

const ATTRIBUTION = 'Map data © OpenStreetMap contributors' as const;
const LICENSE = 'ODbL-1.0' as const;
const SOURCE = 'osm' as const;

// ---------------------------------------------------------------------------
// Single-element converters
// ---------------------------------------------------------------------------

function nodeToRecord(
  node: OsmJsonNode,
  opts: ImportOptions,
  observedAt: string,
): OsmPlaceRecord | null {
  const tags = node.tags ?? {};
  // Quick pre-filter: skip elements with no interesting keys
  if (!hasInterestingKey(tags)) return null;

  const lon = node.lon;
  const lat = node.lat;
  if (!isValidCoordinate(lon, lat)) return null;
  if (!isInsideIraq(lon, lat)) return null;
  if (opts.cityBBox && !isInsideBBox(lon, lat, opts.cityBBox)) return null;

  const osmId = `n${node.id}`;
  const names = extractNames(tags);
  if (!names) return null;

  // Area check (place=suburb etc.)
  if (isAreaTags(tags)) {
    if (!opts.includeAreas) return null;
    return {
      id: osmId,
      kind: 'area',
      category: null,
      names,
      location: [roundCoord(lon), roundCoord(lat)],
      source: SOURCE,
      license: LICENSE,
      attribution: ATTRIBUTION,
      tags: {},
      osmMeta: { osmId, osmType: 'node', observedAt },
    };
  }

  const category = mapCategory(tags, opts.allowedCategories ?? null);
  if (!category) return null;

  return {
    id: osmId,
    kind: 'place',
    category,
    names,
    location: [roundCoord(lon), roundCoord(lat)],
    source: SOURCE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    tags: contactTags(tags),
    osmMeta: { osmId, osmType: 'node', observedAt },
  };
}

function wayToRecord(
  way: OsmJsonWay,
  opts: ImportOptions,
  observedAt: string,
): OsmPlaceRecord | null {
  const tags = way.tags ?? {};

  // Street detection
  const highway = tags['highway'];
  if (highway && STREET_TYPES.has(highway)) {
    if (!opts.includeStreets) return null;
    const names = extractNames(tags);
    if (!names) return null;

    // Compute location from geometry midpoint (prefer geometry over center)
    const loc = wayMidpoint(way);
    if (!loc) return null;
    const [lon, lat] = loc;
    if (!isValidCoordinate(lon, lat)) return null;
    if (!isInsideIraq(lon, lat)) return null;
    if (opts.cityBBox && !isInsideBBox(lon, lat, opts.cityBBox)) return null;

    return {
      id: `w${way.id}`,
      kind: 'street',
      category: null,
      names,
      location: [roundCoord(lon), roundCoord(lat)],
      source: SOURCE,
      license: LICENSE,
      attribution: ATTRIBUTION,
      tags: {},
      osmMeta: { osmId: `w${way.id}`, osmType: 'way', observedAt },
    };
  }

  // Closed way = potential place or area
  if (!hasInterestingKey(tags)) return null;

  const loc = way.center ?? closedWayCenter(way.geometry);
  if (!loc) return null;
  const [lon, lat] = [loc.lon, loc.lat];
  if (!isValidCoordinate(lon, lat)) return null;
  if (!isInsideIraq(lon, lat)) return null;
  if (opts.cityBBox && !isInsideBBox(lon, lat, opts.cityBBox)) return null;

  const names = extractNames(tags);
  if (!names) return null;

  if (isAreaTags(tags)) {
    if (!opts.includeAreas) return null;
    return {
      id: `w${way.id}`,
      kind: 'area',
      category: null,
      names,
      location: [roundCoord(lon), roundCoord(lat)],
      source: SOURCE,
      license: LICENSE,
      attribution: ATTRIBUTION,
      tags: {},
      osmMeta: { osmId: `w${way.id}`, osmType: 'way', observedAt },
    };
  }

  const category = mapCategory(tags, opts.allowedCategories ?? null);
  if (!category) return null;

  return {
    id: `w${way.id}`,
    kind: 'place',
    category,
    names,
    location: [roundCoord(lon), roundCoord(lat)],
    source: SOURCE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    tags: contactTags(tags),
    osmMeta: { osmId: `w${way.id}`, osmType: 'way', observedAt },
  };
}

function relationToRecord(
  rel: OsmJsonRelation,
  opts: ImportOptions,
  observedAt: string,
): OsmPlaceRecord | null {
  const tags = rel.tags ?? {};

  if (!isAreaTags(tags) && !hasInterestingKey(tags)) return null;

  // Compute center
  let lon: number, lat: number;
  if (rel.center) {
    lon = rel.center.lon;
    lat = rel.center.lat;
  } else if (rel.bounds) {
    lon = (rel.bounds.minlon + rel.bounds.maxlon) / 2;
    lat = (rel.bounds.minlat + rel.bounds.maxlat) / 2;
  } else {
    return null; // no geometry info
  }

  if (!isValidCoordinate(lon, lat)) return null;
  if (!isInsideIraq(lon, lat)) return null;
  if (opts.cityBBox && !isInsideBBox(lon, lat, opts.cityBBox)) return null;

  const names = extractNames(tags);
  if (!names) return null;

  const osmId = `r${rel.id}`;

  if (isAreaTags(tags)) {
    if (!opts.includeAreas) return null;
    return {
      id: osmId,
      kind: 'area',
      category: null,
      names,
      location: [roundCoord(lon), roundCoord(lat)],
      source: SOURCE,
      license: LICENSE,
      attribution: ATTRIBUTION,
      tags: {},
      osmMeta: { osmId, osmType: 'relation', observedAt },
    };
  }

  const category = mapCategory(tags, opts.allowedCategories ?? null);
  if (!category) return null;

  return {
    id: osmId,
    kind: 'place',
    category,
    names,
    location: [roundCoord(lon), roundCoord(lat)],
    source: SOURCE,
    license: LICENSE,
    attribution: ATTRIBUTION,
    tags: contactTags(tags),
    osmMeta: { osmId, osmType: 'relation', observedAt },
  };
}

// ---------------------------------------------------------------------------
// Main parsing entry points
// ---------------------------------------------------------------------------

/**
 * Parses a full Overpass API JSON response.
 *
 * The returned array is deduplicated by OSM ID (closed-way-as-place wins over
 * closed-way-as-street, same ID policy as the Python pipeline).
 */
export function parseOsmJson(
  json: OsmJsonRoot,
  opts: ImportOptions = {},
  stats?: ImportStats,
): OsmPlaceRecord[] {
  const observedAt = opts.observedAt ?? new Date().toISOString();
  const st = stats ?? newImportStats();
  const allowedCategories =
    opts.allowedCategories !== undefined
      ? opts.allowedCategories
      : null;

  const raw: OsmPlaceRecord[] = [];

  for (const el of json.elements) {
    recordProcessed(st);
    if (opts.limit && raw.length >= opts.limit) break;

    try {
      let rec: OsmPlaceRecord | null = null;
      if (el.type === 'node') {
        rec = nodeToRecord(el as OsmJsonNode, { ...opts, allowedCategories }, observedAt);
      } else if (el.type === 'way') {
        rec = wayToRecord(el as OsmJsonWay, { ...opts, allowedCategories }, observedAt);
      } else if (el.type === 'relation') {
        rec = relationToRecord(el as OsmJsonRelation, { ...opts, allowedCategories }, observedAt);
      }

      if (rec) {
        raw.push(rec);
        recordImported(st);
      } else {
        recordSkip(st, 'filtered');
      }
    } catch (err) {
      recordError(st);
      // Don't rethrow — a bad element should not abort the whole import.
    }
  }

  const { unique, dropped } = deduplicateByOsmId(raw);
  for (const _ of dropped) recordSkip(st, 'duplicate-id');

  return sortRecords(unique);
}

/**
 * Parses a stream of OSM JSON lines (one JSON object per line, Overpass NDJSON
 * format or a pre-extracted file).  Memory-efficient for large datasets.
 */
export async function parseOsmNdjson(
  inputPath: string,
  opts: ImportOptions = {},
  stats?: ImportStats,
): Promise<OsmPlaceRecord[]> {
  const observedAt = opts.observedAt ?? new Date().toISOString();
  const st = stats ?? newImportStats();
  const allowedCategories = opts.allowedCategories ?? null;

  const raw: OsmPlaceRecord[] = [];
  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    recordProcessed(st);
    if (opts.limit && raw.length >= opts.limit) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      recordError(st);
      continue;
    }

    try {
      const el = parsed as OsmJsonElement;
      let rec: OsmPlaceRecord | null = null;
      if (el.type === 'node') {
        rec = nodeToRecord(el as OsmJsonNode, { ...opts, allowedCategories }, observedAt);
      } else if (el.type === 'way') {
        rec = wayToRecord(el as OsmJsonWay, { ...opts, allowedCategories }, observedAt);
      } else if (el.type === 'relation') {
        rec = relationToRecord(el as OsmJsonRelation, { ...opts, allowedCategories }, observedAt);
      }

      if (rec) {
        raw.push(rec);
        recordImported(st);
      } else {
        recordSkip(st, 'filtered');
      }
    } catch (err) {
      recordError(st);
    }
  }

  const { unique, dropped } = deduplicateByOsmId(raw);
  for (const _ of dropped) recordSkip(st, 'duplicate-id');

  return sortRecords(unique);
}

// ---------------------------------------------------------------------------
// Streaming NDJSON output writer
// ---------------------------------------------------------------------------

/**
 * Writes an array of OsmPlaceRecords to an NDJSON file (one JSON per line),
 * ready for `importFiles()` in modules/places.
 *
 * The output is compatible with the `places.ndjson` format expected by the
 * modules/places import CLI (`import --input <path>`).
 */
export async function writeOsmNdjson(
  records: OsmPlaceRecord[],
  outputPath: string,
): Promise<void> {
  const lines = records.map((r) => JSON.stringify(r, null, 0)).join('\n') + '\n';
  await writeFile(outputPath, lines, { encoding: 'utf8' });
}

/**
 * Streaming variant: converts an OsmJsonRoot directly to an NDJSON file
 * without holding all records in memory.
 */
export async function streamOsmJsonToNdjson(
  json: OsmJsonRoot,
  outputPath: string,
  opts: ImportOptions = {},
  stats?: ImportStats,
): Promise<void> {
  const records = parseOsmJson(json, opts, stats);
  await writeOsmNdjson(records, outputPath);
}

// ---------------------------------------------------------------------------
// Bulk import wrapper (calls modules/places via the PlaceImportRecord schema)
// ---------------------------------------------------------------------------

/**
 * Converts OsmPlaceRecords to the PlaceImportRecord shape expected by
 * modules/places `importCity()`.
 *
 * The mapping is intentionally thin: we preserve all fields and add the
 * ODbL-required `source` / `attribution` fields as top-level tags.
 */
export function toPlaceImportRecord(rec: OsmPlaceRecord): Record<string, unknown> {
  return {
    id: rec.id,
    kind: rec.kind,
    category: rec.category,
    names: rec.names,
    location: rec.location,
    tags: {
      ...rec.tags,
      // ODbL provenance fields surfaced to query layer
      source: rec.source,
      license: rec.license,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: does an element have any key we care about?
// ---------------------------------------------------------------------------

function hasInterestingKey(tags: Record<string, string>): boolean {
  for (const k of Object.keys(tags)) {
    if (INTERESTING_KEYS.has(k)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helper: is this element an administrative area?
// ---------------------------------------------------------------------------

function isAreaTags(tags: Record<string, string>): boolean {
  const place = tags['place'];
  if (place && AREA_PLACES.has(place)) return true;
  const boundary = tags['boundary'];
  const adminLevel = tags['admin_level'];
  if (boundary === 'administrative' && adminLevel && ADMIN_LEVELS.has(adminLevel)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helper: extract contact tags
// ---------------------------------------------------------------------------

function contactTags(tags: Record<string, string>): OsmPlaceRecord['tags'] {
  const result: OsmPlaceRecord['tags'] = {};
  const phone = extractPhone(tags);
  if (phone) result.phone = phone;
  const website = extractWebsite(tags);
  if (website) result.website = website;
  const openingHours = extractOpeningHours(tags);
  if (openingHours) result.opening_hours = openingHours;
  return result;
}

// ---------------------------------------------------------------------------
// Helper: way geometry → midpoint
// ---------------------------------------------------------------------------

function wayMidpoint(way: OsmJsonWay): [number, number] | null {
  if (way.center) return [way.center.lon, way.center.lat];
  const geom = way.geometry;
  if (!geom || geom.length === 0) return null;
  const sumLon = geom.reduce((s, p) => s + p.lon, 0) / geom.length;
  const sumLat = geom.reduce((s, p) => s + p.lat, 0) / geom.length;
  // Pick the point closest to the mean
  let bestDist = Infinity;
  let best: OsmJsonWayNode = geom[0];
  for (const p of geom) {
    const d = (p.lon - sumLon) ** 2 + (p.lat - sumLat) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return [best.lon, best.lat];
}

/** Returns the centroid of a closed way ring (array of [lon, lat] geometry). */
function closedWayCenter(
  geom: OsmJsonWayNode[] | undefined,
): { lon: number; lat: number } | null {
  if (!geom || geom.length < 3) return null;
  const pts = geom[0].lat === geom[geom.length - 1].lat &&
    geom[0].lon === geom[geom.length - 1].lon
    ? geom.slice(0, -1)  // closed ring: skip duplicate final node
    : geom;
  const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  return { lon, lat };
}

// ---------------------------------------------------------------------------
// Helper: sort output (mirrors Python pipeline sort order)
// ---------------------------------------------------------------------------

const KIND_ORDER: Record<string, number> = { place: 0, street: 1, area: 2 };

function sortRecords(records: OsmPlaceRecord[]): OsmPlaceRecord[] {
  return [...records].sort((a, b) => {
    const kd = (KIND_ORDER[a.kind] ?? 3) - (KIND_ORDER[b.kind] ?? 3);
    if (kd !== 0) return kd;
    const prefixOrder = (id: string) => ({ n: 0, w: 1, r: 2 }[id[0]] ?? 3);
    const pd = prefixOrder(a.id) - prefixOrder(b.id);
    if (pd !== 0) return pd;
    return parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10);
  });
}

// ---------------------------------------------------------------------------
// Helper: round coordinates to 7 decimal places (sub-metre precision)
// ---------------------------------------------------------------------------

function roundCoord(v: number): number {
  return Math.round(v * 1e7) / 1e7;
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export { buildAllowedSet } from './tag-mapper.js';
export type { ImportStats } from './validators.js';
