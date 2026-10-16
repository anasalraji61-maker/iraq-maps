/**
 * Validation utilities for OSM place records.
 *
 * - Iraq bounding-box check (WGS84)
 * - Coordinate range check
 * - Required-field check
 * - Deduplication by OSM ID
 * - Phone normalisation for Iraq numbers
 *
 * ODbL: validation logic only; no OSM data is modified here.
 * Attribution: Map data © OpenStreetMap contributors (ODbL 1.0)
 */

// ---------------------------------------------------------------------------
// Iraq bounding box
// ---------------------------------------------------------------------------

/**
 * The Iraq country-level bounding box in WGS84 [minLon, minLat, maxLon, maxLat].
 *
 * From the task spec: 29.0–37.5 °N, 38.5–48.8 °E.
 */
export const IRAQ_BBOX = {
  minLon: 38.5,
  maxLon: 48.8,
  minLat: 29.0,
  maxLat: 37.5,
} as const;

/** Returns true when (lon, lat) lies within the Iraq country bounding box. */
export function isInsideIraq(lon: number, lat: number): boolean {
  return (
    lon >= IRAQ_BBOX.minLon &&
    lon <= IRAQ_BBOX.maxLon &&
    lat >= IRAQ_BBOX.minLat &&
    lat <= IRAQ_BBOX.maxLat
  );
}

// ---------------------------------------------------------------------------
// City bounding box (narrower check used in the import runner)
// ---------------------------------------------------------------------------

export interface BBox {
  /** [minLon, minLat, maxLon, maxLat] */
  coords: [number, number, number, number];
}

/** Returns true when (lon, lat) lies within the given city bbox. */
export function isInsideBBox(lon: number, lat: number, bbox: BBox): boolean {
  const [x0, y0, x1, y1] = bbox.coords;
  return lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1;
}

// ---------------------------------------------------------------------------
// Coordinate sanity
// ---------------------------------------------------------------------------

/**
 * Returns true when the coordinate pair is a valid WGS84 position.
 * Rejects (0, 0) because that is the OSM "null island" sentinel for missing locations.
 */
export function isValidCoordinate(lon: number, lat: number): boolean {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (lon < -180 || lon > 180) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon === 0 && lat === 0) return false; // OSM null island
  return true;
}

// ---------------------------------------------------------------------------
// OSM ID format
// ---------------------------------------------------------------------------

/**
 * Returns true when the string looks like a valid OSM feature ID as used by
 * our pipeline: 'n<digits>' (node), 'w<digits>' (way), 'r<digits>' (relation).
 */
export function isValidOsmId(id: string): boolean {
  return /^[nwr]\d+$/.test(id);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Whitespace characters stripped by our trimmer (mirrors the Python pipeline). */
const WS_RE = /^[\s﻿]+|[\s﻿]+$/g;

/** Trims and caps at 255 UTF-16 code units (mirrors zod max(255) + trim). */
export function trimText(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.replace(WS_RE, '');
  // cap at 255 UTF-16 code units
  const buf = Buffer.from(trimmed, 'utf16le');
  if (buf.length <= 510) return trimmed || null;
  return Buffer.from(buf.subarray(0, 510)).toString('utf16le').replace(WS_RE, '') || null;
}

export interface OsmNames {
  /** Canonical display name (derived from `name` tag or fallback chain ar→ckb→en). */
  name: string;
  ar?: string;
  ckb?: string;
  en?: string;
}

/**
 * Extracts the multilingual name object from an OSM tag map.
 *
 * Arabic is preferred, then Kurdish Sorani (ckb), then English.  The canonical
 * `name` field is taken from the `name` tag if present, otherwise from the
 * best available localised name.
 *
 * Returns `null` when no name can be derived (unnamed features are skipped).
 */
export function extractNames(tags: Record<string, string>): OsmNames | null {
  const ar = trimText(tags['name:ar']);
  const ckb = trimText(tags['name:ckb'] ?? tags['name:ku']);
  const en = trimText(tags['name:en']);
  const nameTag = trimText(tags['name']);
  const name = nameTag ?? ar ?? ckb ?? en;
  if (!name) return null;
  const result: OsmNames = { name };
  if (ar) result.ar = ar;
  if (ckb) result.ckb = ckb;
  if (en) result.en = en;
  return result;
}

// ---------------------------------------------------------------------------
// Contact fields
// ---------------------------------------------------------------------------

const PHONE_KEYS = ['phone', 'contact:phone', 'mobile', 'contact:mobile'] as const;
const WEBSITE_KEYS = ['website', 'contact:website', 'url'] as const;
const HOURS_KEYS = ['opening_hours'] as const;

/** Picks the first non-null value from a list of tag keys. */
function firstTag(tags: Record<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = trimText(tags[key]);
    if (v) return v;
  }
  return null;
}

export function extractPhone(tags: Record<string, string>): string | null {
  return firstTag(tags, PHONE_KEYS);
}

export function extractWebsite(tags: Record<string, string>): string | null {
  return firstTag(tags, WEBSITE_KEYS);
}

export function extractOpeningHours(tags: Record<string, string>): string | null {
  return firstTag(tags, HOURS_KEYS);
}

// ---------------------------------------------------------------------------
// Required-field validation
// ---------------------------------------------------------------------------

export interface FieldValidationResult {
  valid: boolean;
  missing: string[];
}

/** Checks that a candidate record has all required fields populated. */
export function validateRequiredFields(candidate: {
  id?: unknown;
  names?: unknown;
  location?: unknown;
  kind?: unknown;
}): FieldValidationResult {
  const missing: string[] = [];
  if (!candidate.id || typeof candidate.id !== 'string') missing.push('id');
  if (!candidate.names || typeof candidate.names !== 'object') missing.push('names');
  if (!Array.isArray(candidate.location) || candidate.location.length !== 2) missing.push('location');
  if (!candidate.kind || typeof candidate.kind !== 'string') missing.push('kind');
  return { valid: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Deduplication by OSM ID
// ---------------------------------------------------------------------------

/**
 * Deduplicates an iterable of records by OSM ID.
 *
 * When the same ID appears more than once (e.g. a closed way parsed both as a
 * way and as an area), the first occurrence wins — same as the Python pipeline
 * where `unique.setdefault(r["id"], r)` preserves insertion order.
 *
 * Records with an invalid ID are dropped and reported in `dropped`.
 */
export function deduplicateByOsmId<T extends { id: string }>(
  records: Iterable<T>,
): { unique: T[]; dropped: string[] } {
  const seen = new Map<string, T>();
  const dropped: string[] = [];
  for (const r of records) {
    if (!isValidOsmId(r.id)) {
      dropped.push(r.id);
      continue;
    }
    if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return { unique: [...seen.values()], dropped };
}

// ---------------------------------------------------------------------------
// Composite validator used by the import pipeline
// ---------------------------------------------------------------------------

export type ValidationOutcome =
  | { ok: true; reason?: never }
  | { ok: false; reason: string };

/** Full validation check for a single parsed OSM feature. */
export function validateOsmFeature(f: {
  id: string;
  lon: number;
  lat: number;
  names: OsmNames | null;
  cityBBox?: BBox;
}): ValidationOutcome {
  if (!isValidOsmId(f.id)) {
    return { ok: false, reason: `invalid OSM id: ${f.id}` };
  }
  if (!isValidCoordinate(f.lon, f.lat)) {
    return { ok: false, reason: `invalid coordinates: lon=${f.lon} lat=${f.lat}` };
  }
  if (!isInsideIraq(f.lon, f.lat)) {
    return {
      ok: false,
      reason: `outside Iraq bbox: lon=${f.lon.toFixed(5)} lat=${f.lat.toFixed(5)}`,
    };
  }
  if (f.cityBBox && !isInsideBBox(f.lon, f.lat, f.cityBBox)) {
    return {
      ok: false,
      reason: `outside city bbox: lon=${f.lon.toFixed(5)} lat=${f.lat.toFixed(5)}`,
    };
  }
  if (!f.names) {
    return { ok: false, reason: 'no name' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stats accumulator (used by the import runner for progress reporting)
// ---------------------------------------------------------------------------

export interface ImportStats {
  totalProcessed: number;
  imported: number;
  skipped: number;
  errors: number;
  /** Reason → count breakdown for skipped records. */
  skipReasons: Record<string, number>;
}

export function newImportStats(): ImportStats {
  return { totalProcessed: 0, imported: 0, skipped: 0, errors: 0, skipReasons: {} };
}

export function recordSkip(stats: ImportStats, reason: string): void {
  stats.skipped++;
  stats.skipReasons[reason] = (stats.skipReasons[reason] ?? 0) + 1;
}

export function recordImported(stats: ImportStats): void {
  stats.imported++;
}

export function recordError(stats: ImportStats): void {
  stats.errors++;
}

export function recordProcessed(stats: ImportStats): void {
  stats.totalProcessed++;
}

/** Returns a compact summary string suitable for console output. */
export function formatStats(stats: ImportStats): string {
  const lines: string[] = [
    `  processed : ${stats.totalProcessed}`,
    `  imported  : ${stats.imported}`,
    `  skipped   : ${stats.skipped}`,
    `  errors    : ${stats.errors}`,
  ];
  if (Object.keys(stats.skipReasons).length > 0) {
    lines.push('  skip breakdown:');
    for (const [reason, count] of Object.entries(stats.skipReasons).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${reason}: ${count}`);
    }
  }
  return lines.join('\n');
}
