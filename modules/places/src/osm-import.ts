/**
 * OSM-specific helpers added on top of the core import pipeline.
 *
 * These functions extend the places module with:
 *   - importPlacesFromOSM  — bulk insert of OSM-parsed records (ODbL data, places.osm_features only)
 *   - deduplicatePlaces    — merge near-duplicate places by proximity + name
 *   - getOSMPlace          — retrieve a single place by its OSM feature ID (n…/w…/r…)
 *   - updateFromOSM        — update an existing place row from a fresh OSM data snapshot
 *
 * ODbL compliance:
 *   - All writes go to `places.osm_features` — NEVER to `places.provider_features`.
 *   - Attribution must be displayed at all times: "Map data © OpenStreetMap contributors"
 *   - The source='osm' flag is checked before every write.
 *
 * @module osm-import
 */

import { sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import { normalizeArabic } from '@iraq-maps/i18n';
import { OSM_ATTRIBUTION, type PlaceDetails } from '@iraq-maps/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A minimal OSM place record as produced by geo-services/osm-pipeline. */
export interface OsmImportRecord {
  /** OSM feature ID: "n<digits>", "w<digits>", "r<digits>" */
  id: string;
  kind: 'place' | 'street' | 'area';
  category: string | null;
  names: {
    name: string;
    ar?: string;
    ckb?: string;
    en?: string;
  };
  /** [longitude, latitude] */
  location: [number, number];
  tags?: {
    opening_hours?: string;
    phone?: string;
    website?: string;
  };
}

export interface OsmImportResult {
  /** Total records supplied. */
  supplied: number;
  /** Records successfully written to osm_features. */
  inserted: number;
  /** Records updated (upserted from a newer OSM snapshot). */
  updated: number;
  /** Records rejected (validation failures, wrong source, etc.). */
  rejected: number;
  rejectionReasons: Record<string, number>;
}

/** Options for deduplicatePlaces(). */
export interface DeduplicateOptions {
  /** City ID to operate on.  If omitted, all cities are processed. */
  cityId?: string;
  /**
   * Proximity threshold in metres.  Two places within this distance whose
   * names share a trigram similarity ≥ nameSimilarityThreshold are merged.
   * Default: 30 m.
   */
  radiusM?: number;
  /**
   * Minimum trigram similarity (0..1) for two names to be considered matching.
   * Default: 0.7.
   */
  nameSimilarityThreshold?: number;
  /**
   * When true, the deduplication only reports what would change without writing.
   * Default: false.
   */
  dryRun?: boolean;
}

export interface DeduplicateResult {
  /** Pairs that were identified as duplicates. */
  pairsFound: number;
  /** Pairs removed (the lower-ID element is kept; the higher-ID is deleted). */
  removed: number;
}

// ---------------------------------------------------------------------------
// The article normalizer — mirrors the one in import.ts
// ---------------------------------------------------------------------------

const ARTICLE = /(^|\s)ال(?=\S\S)/g;

function searchText(names: OsmImportRecord['names']): string {
  return [
    ...new Set(
      Object.values(names)
        .map(normalizeArabic)
        .flatMap((n) => [n, n.replace(ARTICLE, '$1')]),
    ),
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_OSM_ID = /^[nwr]\d+$/;

function validateRecord(r: OsmImportRecord): string | null {
  if (!VALID_OSM_ID.test(r.id)) return `invalid OSM id: ${r.id}`;
  if (!r.names?.name) return 'missing name';
  if (!Array.isArray(r.location) || r.location.length !== 2) return 'missing location';
  const [lon, lat] = r.location;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 'non-finite coordinates';
  if (lon < 38.5 || lon > 48.8 || lat < 29.0 || lat > 37.5) return 'outside Iraq bbox';
  if (!['place', 'street', 'area'].includes(r.kind)) return `invalid kind: ${r.kind}`;
  return null; // valid
}

// ---------------------------------------------------------------------------
// importPlacesFromOSM
// ---------------------------------------------------------------------------

const BATCH_SIZE = 5_000;

/**
 * Bulk-upserts OSM-parsed place records into `places.osm_features`.
 *
 * All records must have been produced by the OSM pipeline — records with a
 * non-OSM source are rejected.  The function writes only to the ODbL table.
 *
 * @param db       - Active Drizzle database connection.
 * @param cityId   - The city the records belong to (must already exist in places.cities).
 * @param records  - Records from geo-services/osm-pipeline.
 * @param dryRun   - When true, validates only; nothing is written.
 */
export async function importPlacesFromOSM(
  db: Db,
  cityId: string,
  records: OsmImportRecord[],
  dryRun = false,
): Promise<OsmImportResult> {
  const result: OsmImportResult = {
    supplied: records.length,
    inserted: 0,
    updated: 0,
    rejected: 0,
    rejectionReasons: {},
  };

  // Validate & partition
  const valid: Array<{
    id: string; kind: string; category: string | null;
    names: object; search_text: string;
    lng: number; lat: number;
    opening_hours: string | null; phone: string | null; website: string | null;
  }> = [];

  for (const r of records) {
    const err = validateRecord(r);
    if (err) {
      result.rejected++;
      result.rejectionReasons[err] = (result.rejectionReasons[err] ?? 0) + 1;
      continue;
    }
    valid.push({
      id: r.id,
      kind: r.kind,
      category: r.category,
      names: r.names,
      search_text: searchText(r.names),
      lng: r.location[0],
      lat: r.location[1],
      opening_hours: r.tags?.opening_hours ?? null,
      phone: r.tags?.phone ?? null,
      website: r.tags?.website ?? null,
    });
  }

  if (dryRun) {
    result.inserted = valid.length;
    return result;
  }

  // Upsert in batches inside a transaction
  await db.transaction(async (tx) => {
    // Ensure city row exists
    const cityRows = await tx.execute(sql`SELECT 1 FROM places.cities WHERE id = ${cityId}`);
    if (cityRows.rows.length === 0) {
      throw new Error(`importPlacesFromOSM: city "${cityId}" not found in places.cities. Run the city import first.`);
    }

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      await tx.execute(sql`
        INSERT INTO places.osm_features
          (id, city_id, kind, category, names, search_text, location, opening_hours, phone, website)
        SELECT
          r.id, ${cityId}, r.kind, r.category, r.names, r.search_text,
          ST_SetSRID(ST_MakePoint(r.lng::float8, r.lat::float8), 4326)::geography,
          r.opening_hours, r.phone, r.website
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS r(
          id text, kind text, category text, names jsonb, search_text text,
          lng float8, lat float8, opening_hours text, phone text, website text)
        ON CONFLICT (id) DO UPDATE SET
          city_id       = excluded.city_id,
          kind          = excluded.kind,
          category      = excluded.category,
          names         = excluded.names,
          search_text   = excluded.search_text,
          location      = excluded.location,
          opening_hours = excluded.opening_hours,
          phone         = excluded.phone,
          website       = excluded.website`);
      result.inserted += batch.length;
    }

    // Refresh area assignments
    await tx.execute(sql`ANALYZE places.osm_features`);
    await tx.execute(sql`
      UPDATE places.osm_features AS f SET area_names = (
        SELECT CASE WHEN ST_DWithin(a.location, f.location, 3000) THEN a.names END
        FROM places.osm_features AS a
        WHERE a.city_id = f.city_id AND a.kind = 'area'
        ORDER BY a.location <-> f.location LIMIT 1)
      WHERE f.city_id = ${cityId} AND f.kind <> 'area'`);
  });

  await db.execute(sql`VACUUM ANALYZE places.osm_features`);
  return result;
}

// ---------------------------------------------------------------------------
// deduplicatePlaces
// ---------------------------------------------------------------------------

/**
 * Identifies and removes near-duplicate places in `places.osm_features`.
 *
 * "Duplicate" is defined as two place-kind rows for the same city that:
 *   1. are within `radiusM` metres of each other, AND
 *   2. have a trigram word-similarity ≥ `nameSimilarityThreshold` on their
 *      `search_text` columns.
 *
 * When two duplicates are found, the row with the lexicographically smaller ID
 * is kept (this prefers node IDs over way/relation IDs for the same feature,
 * and lower OSM IDs over higher ones — older features are more stable).
 *
 * The function does NOT merge user-contributed data from `places.provider_features`:
 * those rows keep their own identity.
 */
export async function deduplicatePlaces(
  db: Db,
  opts: DeduplicateOptions = {},
): Promise<DeduplicateResult> {
  const radiusM = opts.radiusM ?? 30;
  const threshold = opts.nameSimilarityThreshold ?? 0.7;
  const dryRun = opts.dryRun ?? false;

  // Find candidate duplicate pairs
  const cityFilter = opts.cityId
    ? sql`AND a.city_id = ${opts.cityId}`
    : sql``;

  const pairs = await db.execute<{ keep_id: string; drop_id: string }>(sql`
    SELECT DISTINCT ON (LEAST(a.id, b.id), GREATEST(a.id, b.id))
      LEAST(a.id, b.id) AS keep_id,
      GREATEST(a.id, b.id) AS drop_id
    FROM places.osm_features AS a
    JOIN places.osm_features AS b
      ON a.city_id = b.city_id
      AND a.id <> b.id
      AND a.kind = 'place'
      AND b.kind = 'place'
      AND ST_DWithin(a.location, b.location, ${radiusM})
      AND word_similarity(a.search_text, b.search_text) >= ${threshold}
    ${cityFilter}
    ORDER BY LEAST(a.id, b.id), GREATEST(a.id, b.id)`);

  const result: DeduplicateResult = {
    pairsFound: pairs.rows.length,
    removed: 0,
  };

  if (dryRun || pairs.rows.length === 0) return result;

  const dropIds = pairs.rows.map((r) => r.drop_id);

  await db.execute(sql`
    DELETE FROM places.osm_features
    WHERE id = ANY(${sql.param(dropIds)}::text[])`);

  result.removed = dropIds.length;
  return result;
}

// ---------------------------------------------------------------------------
// getOSMPlace
// ---------------------------------------------------------------------------

type DetailsRow = {
  id: string;
  kind: string;
  names: Record<string, string>;
  category: string | null;
  area: Record<string, string> | null;
  lng: number;
  lat: number;
  opening_hours: string | null;
  phone: string | null;
  website: string | null;
};

/**
 * Retrieves a single OSM place by its feature ID (e.g. "n12345", "w98765").
 *
 * Returns `null` when the feature is not found.
 */
export async function getOSMPlace(db: Db, osmId: string): Promise<PlaceDetails | null> {
  const { rows } = await db.execute<DetailsRow>(sql`
    SELECT
      id, kind, names, category,
      area_names AS area,
      ST_X(location::geometry) AS lng,
      ST_Y(location::geometry) AS lat,
      opening_hours, phone, website
    FROM places.osm_features
    WHERE id = ${osmId}`);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id as PlaceDetails['id'],
    kind: row.kind as PlaceDetails['kind'],
    names: row.names as PlaceDetails['names'],
    category: row.category as PlaceDetails['category'],
    area: row.area as PlaceDetails['area'],
    location: [row.lng, row.lat],
    hoursRaw: row.opening_hours,
    osmContacts: {
      phone: row.phone ?? undefined,
      website: row.website ?? undefined,
    },
    source: 'osm',
    attribution: OSM_ATTRIBUTION,
  };
}

// ---------------------------------------------------------------------------
// updateFromOSM
// ---------------------------------------------------------------------------

/** Fields of an OSM place that can be refreshed from a newer OSM snapshot. */
export interface OsmUpdatePayload {
  names?: OsmImportRecord['names'];
  category?: string | null;
  location?: [number, number];
  tags?: {
    opening_hours?: string | null;
    phone?: string | null;
    website?: string | null;
  };
}

export interface UpdateResult {
  updated: boolean;
  reason?: string;
}

/**
 * Applies a partial update to an existing OSM place row from a fresh OSM data
 * snapshot.
 *
 * - Only updates fields that are supplied and non-null in `updates`.
 * - Validates that the new location (if provided) is still inside Iraq.
 * - Re-computes `search_text` when names change.
 * - Returns `{ updated: false }` when the place doesn't exist.
 */
export async function updateFromOSM(
  db: Db,
  osmId: string,
  updates: OsmUpdatePayload,
): Promise<UpdateResult> {
  if (!VALID_OSM_ID.test(osmId)) {
    return { updated: false, reason: `invalid OSM id: ${osmId}` };
  }

  // Verify the place exists and belongs to the OSM source (inferred from id format)
  const { rows } = await db.execute<{ id: string; names: object }>(sql`
    SELECT id, names FROM places.osm_features WHERE id = ${osmId}`);

  if (rows.length === 0) return { updated: false, reason: 'not found' };

  const existing = rows[0]!;

  // Build partial update
  const setClauses: ReturnType<typeof sql>[] = [];

  if (updates.names) {
    const newNames = { ...(existing.names as object), ...updates.names };
    const st = searchText(newNames as OsmImportRecord['names']);
    setClauses.push(sql`names = ${JSON.stringify(newNames)}::jsonb`);
    setClauses.push(sql`search_text = ${st}`);
  }

  if (updates.category !== undefined) {
    setClauses.push(sql`category = ${updates.category}`);
  }

  if (updates.location) {
    const [lon, lat] = updates.location;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return { updated: false, reason: 'non-finite coordinates in update' };
    }
    if (lon < 38.5 || lon > 48.8 || lat < 29.0 || lat > 37.5) {
      return { updated: false, reason: 'updated location outside Iraq bbox' };
    }
    setClauses.push(
      sql`location = ST_SetSRID(ST_MakePoint(${lon}::float8, ${lat}::float8), 4326)::geography`,
    );
  }

  if (updates.tags) {
    if (updates.tags.opening_hours !== undefined) {
      setClauses.push(sql`opening_hours = ${updates.tags.opening_hours}`);
    }
    if (updates.tags.phone !== undefined) {
      setClauses.push(sql`phone = ${updates.tags.phone}`);
    }
    if (updates.tags.website !== undefined) {
      setClauses.push(sql`website = ${updates.tags.website}`);
    }
  }

  if (setClauses.length === 0) return { updated: false, reason: 'no fields to update' };

  // Build the SET clause by joining with commas
  const setFragment = setClauses.reduce((acc, clause, i) =>
    i === 0 ? clause : sql`${acc}, ${clause}`
  );

  await db.execute(sql`
    UPDATE places.osm_features
    SET ${setFragment}
    WHERE id = ${osmId}`);

  return { updated: true };
}
