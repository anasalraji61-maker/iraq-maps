/**
 * OfflineSearch – SQLite-backed full-text search over cached places.
 *
 * Features:
 *  - SQLite FTS5 index with Arabic, English and Kurdish (Sorani) name columns.
 *  - Full-text search returning results compatible with the PlaceSummary contract.
 *  - Haversine proximity queries (PostGIS-like distance ordering).
 *  - Autocomplete from the index (prefix match).
 *  - Incremental index update when online (upsert by place id).
 *  - Graceful no-op when expo-sqlite is not installed or db is not yet initialised.
 *
 * NOTE: LngLat in @iraq-maps/contracts is a [lng, lat] tuple (not an object).
 * location fields stored here follow the same convention.
 */

// expo-sqlite/legacy may not be installed in all environments; load dynamically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SQLiteDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SQLiteTx = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _SQLite: { openDatabase(name: string): SQLiteDb } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  _SQLite = require('expo-sqlite/legacy') as any;
} catch {
  // expo-sqlite not available — all public functions will no-op gracefully.
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SearchOptions {
  /** Max results returned (default 20). */
  limit?: number;
  /** If provided, sort results by distance from this point. */
  near?: { lat: number; lng: number };
  /** Category filter. */
  category?: string;
}

/** Minimal shape returned by offline search, compatible with contract PlaceSummary. */
export interface OfflinePlaceSummary {
  id: string;
  kind: 'place' | 'street' | 'area';
  names: { ar: string; en: string; ckb: string };
  /** Null for streets/areas. */
  category: string | null;
  area: null;
  /** [lng, lat] — matches the LngLat contract tuple. */
  location: [number, number];
  /** Metres from the query's `near` point, or null. */
  distanceM: number | null;
}

export interface OfflineSearchResult {
  place: OfflinePlaceSummary;
  distanceMetres: number | null;
}

export interface AutocompleteResult {
  id: string;
  name: string;
  category: string | null;
  /** [lng, lat] */
  location: [number, number];
}

export interface IndexStats {
  totalPlaces: number;
  lastUpdatedAt: string | null;
}

/** Minimal PlaceSummary-like input shape (superset of what the contracts expose). */
export interface IndexablePlaceSummary {
  id: string;
  kind?: string;
  names?: { ar?: string; en?: string; ckb?: string };
  category?: string | null;
  /** [lng, lat] tuple OR object with lat/lng fields. */
  location?: [number, number] | { lat: number; lng: number };
}

// ---------------------------------------------------------------------------
// Internal DB handle
// ---------------------------------------------------------------------------

let _db: SQLiteDb | null = null;

function getDb(): SQLiteDb | null {
  if (!_SQLite) return null;
  if (!_db) _db = _SQLite.openDatabase('offline_search.db');
  return _db;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const CREATE_PLACES = `
  CREATE TABLE IF NOT EXISTS places (
    id         TEXT PRIMARY KEY,
    name_ar    TEXT NOT NULL DEFAULT '',
    name_en    TEXT NOT NULL DEFAULT '',
    name_ckb   TEXT NOT NULL DEFAULT '',
    category   TEXT,
    kind       TEXT NOT NULL DEFAULT 'place',
    lng        REAL NOT NULL,
    lat        REAL NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS places_fts
  USING fts5(
    id UNINDEXED,
    name_ar,
    name_en,
    name_ckb,
    content='places',
    content_rowid='rowid'
  );
`;

// FTS triggers (apply individually, ignoring "already exists" errors)
const FTS_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS places_ai AFTER INSERT ON places BEGIN
     INSERT INTO places_fts(rowid,id,name_ar,name_en,name_ckb)
     VALUES (new.rowid,new.id,new.name_ar,new.name_en,new.name_ckb);
   END`,
  `CREATE TRIGGER IF NOT EXISTS places_ad AFTER DELETE ON places BEGIN
     INSERT INTO places_fts(places_fts,rowid,id,name_ar,name_en,name_ckb)
     VALUES ('delete',old.rowid,old.id,old.name_ar,old.name_en,old.name_ckb);
   END`,
  `CREATE TRIGGER IF NOT EXISTS places_au AFTER UPDATE ON places BEGIN
     INSERT INTO places_fts(places_fts,rowid,id,name_ar,name_en,name_ckb)
     VALUES ('delete',old.rowid,old.id,old.name_ar,old.name_en,old.name_ckb);
     INSERT INTO places_fts(rowid,id,name_ar,name_en,name_ckb)
     VALUES (new.rowid,new.id,new.name_ar,new.name_en,new.name_ckb);
   END`,
];

const CREATE_META = `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initOfflineSearch(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx: SQLiteTx) => {
        tx.executeSql(CREATE_PLACES);
        tx.executeSql(CREATE_FTS);
        tx.executeSql(CREATE_META);
        for (const sql of FTS_TRIGGERS) {
          tx.executeSql(sql, [], undefined, () => false); // ignore errors
        }
      },
      (e: unknown) => reject(e),
      () => resolve(),
    );
  });
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

function pickName(names: IndexablePlaceSummary['names'], locale: 'ar' | 'en' | 'ckb'): string {
  return names?.[locale] ?? '';
}

function toLngLat(
  location: IndexablePlaceSummary['location'],
): [number, number] {
  if (!location) return [0, 0];
  if (Array.isArray(location)) return location as [number, number];
  return [(location as { lat: number; lng: number }).lng, (location as { lat: number; lng: number }).lat];
}

// ---------------------------------------------------------------------------
// Index update
// ---------------------------------------------------------------------------

export async function indexPlaces(places: IndexablePlaceSummary[]): Promise<void> {
  if (places.length === 0) return;
  const db = getDb();
  if (!db) return;

  const now = Date.now();

  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx: SQLiteTx) => {
        for (const place of places) {
          const nameAr = pickName(place.names, 'ar');
          const nameEn = pickName(place.names, 'en');
          const nameCkb = pickName(place.names, 'ckb');
          const [lng, lat] = toLngLat(place.location);

          tx.executeSql(
            `INSERT INTO places (id,name_ar,name_en,name_ckb,category,kind,lng,lat,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET
               name_ar=excluded.name_ar,name_en=excluded.name_en,name_ckb=excluded.name_ckb,
               category=excluded.category,kind=excluded.kind,lng=excluded.lng,lat=excluded.lat,
               updated_at=excluded.updated_at;`,
            [
              place.id, nameAr, nameEn, nameCkb,
              place.category ?? null,
              place.kind ?? 'place',
              lng, lat, now,
            ],
          );
        }
        tx.executeSql(
          `INSERT INTO meta(key,value) VALUES('last_updated',?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
          [new Date(now).toISOString()],
        );
      },
      (e: unknown) => reject(e),
      () => resolve(),
    );
  });
}

export async function removeFromIndex(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx: SQLiteTx) => { tx.executeSql('DELETE FROM places WHERE id=?;', [id]); },
      (e: unknown) => reject(e),
      () => resolve(),
    );
  });
}

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------

const R = 6_371_000;

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Row → OfflinePlaceSummary
// ---------------------------------------------------------------------------

interface PlaceRow {
  id: string;
  name_ar: string;
  name_en: string;
  name_ckb: string;
  category: string | null;
  kind: string;
  lng: number;
  lat: number;
}

function rowToSummary(row: PlaceRow): OfflinePlaceSummary {
  return {
    id: row.id,
    kind: (row.kind as OfflinePlaceSummary['kind']) ?? 'place',
    names: { ar: row.name_ar, en: row.name_en, ckb: row.name_ckb },
    category: row.category,
    area: null,
    location: [row.lng, row.lat],
    distanceM: null,
  };
}

// ---------------------------------------------------------------------------
// Full-text search
// ---------------------------------------------------------------------------

export async function searchOffline(
  query: string,
  opts: SearchOptions = {},
): Promise<OfflineSearchResult[]> {
  const limit = opts.limit ?? 20;
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = getDb();
  if (!db) return [];

  const ftsQuery = `"${trimmed.replace(/"/g, '')}*"`;

  return new Promise((resolve, reject) => {
    db.readTransaction((tx: SQLiteTx) => {
      const catFilter = opts.category ? ' AND p.category=?' : '';
      const params: (string | number)[] = [ftsQuery];
      if (opts.category) params.push(opts.category);
      params.push(limit * 3);

      tx.executeSql(
        `SELECT p.id,p.name_ar,p.name_en,p.name_ckb,p.category,p.kind,p.lng,p.lat
         FROM places p
         JOIN places_fts f ON f.id=p.id
         WHERE places_fts MATCH ?${catFilter}
         ORDER BY rank
         LIMIT ?;`,
        params,
        (_: unknown, result: { rows: { length: number; item(i: number): PlaceRow } }) => {
          const rows: PlaceRow[] = [];
          for (let i = 0; i < result.rows.length; i++) rows.push(result.rows.item(i));

          let out: OfflineSearchResult[] = rows.map((row) => {
            const dist = opts.near
              ? haversineMetres(opts.near.lat, opts.near.lng, row.lat, row.lng)
              : null;
            return { place: { ...rowToSummary(row), distanceM: dist }, distanceMetres: dist };
          });

          if (opts.near) out = out.sort((a, b) => (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0));
          resolve(out.slice(0, limit));
        },
        (_: unknown, err: unknown) => { reject(err); return true; },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Proximity queries
// ---------------------------------------------------------------------------

export async function nearbyPlaces(
  lat: number,
  lng: number,
  radiusMetres: number,
  opts: Pick<SearchOptions, 'limit' | 'category'> = {},
): Promise<OfflineSearchResult[]> {
  const limit = opts.limit ?? 20;
  const latDelta = radiusMetres / 111_000;
  const lngDelta = radiusMetres / (111_000 * Math.cos((lat * Math.PI) / 180));

  const db = getDb();
  if (!db) return [];

  const catFilter = opts.category ? ' AND category=?' : '';
  const params: (string | number)[] = [
    lat - latDelta, lat + latDelta,
    lng - lngDelta, lng + lngDelta,
  ];
  if (opts.category) params.push(opts.category);

  return new Promise((resolve, reject) => {
    db.readTransaction((tx: SQLiteTx) => {
      tx.executeSql(
        `SELECT id,name_ar,name_en,name_ckb,category,kind,lng,lat
         FROM places
         WHERE lat BETWEEN ? AND ?
           AND lng BETWEEN ? AND ?${catFilter};`,
        params,
        (_: unknown, result: { rows: { length: number; item(i: number): PlaceRow } }) => {
          const out: OfflineSearchResult[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            const dist = haversineMetres(lat, lng, row.lat, row.lng);
            if (dist <= radiusMetres) {
              out.push({ place: { ...rowToSummary(row), distanceM: dist }, distanceMetres: dist });
            }
          }
          out.sort((a, b) => (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0));
          resolve(out.slice(0, limit));
        },
        (_: unknown, err: unknown) => { reject(err); return true; },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export async function autocomplete(
  prefix: string,
  opts: Pick<SearchOptions, 'limit' | 'near'> = {},
): Promise<AutocompleteResult[]> {
  const limit = opts.limit ?? 8;
  const trimmed = prefix.trim();
  if (trimmed.length < 1) return [];

  const db = getDb();
  if (!db) return [];

  const like = `${trimmed}%`;

  return new Promise((resolve, reject) => {
    db.readTransaction((tx: SQLiteTx) => {
      tx.executeSql(
        `SELECT id,name_ar,name_en,name_ckb,category,lng,lat
         FROM places
         WHERE name_ar LIKE ? OR name_en LIKE ? OR name_ckb LIKE ?
         LIMIT ?;`,
        [like, like, like, limit * 2],
        (_: unknown, result: { rows: { length: number; item(i: number): PlaceRow } }) => {
          const out: AutocompleteResult[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            out.push({
              id: row.id,
              name: row.name_ar || row.name_en || row.id,
              category: row.category ?? null,
              location: [row.lng, row.lat],
            });
          }
          if (opts.near) {
            out.sort(
              (a, b) =>
                haversineMetres(opts.near!.lat, opts.near!.lng, a.location[1], a.location[0]) -
                haversineMetres(opts.near!.lat, opts.near!.lng, b.location[1], b.location[0]),
            );
          }
          resolve(out.slice(0, limit));
        },
        (_: unknown, err: unknown) => { reject(err); return true; },
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getIndexStats(): Promise<IndexStats> {
  const db = getDb();
  if (!db) return { totalPlaces: 0, lastUpdatedAt: null };

  return new Promise((resolve, reject) => {
    db.readTransaction((tx: SQLiteTx) => {
      tx.executeSql(
        `SELECT (SELECT COUNT(*) FROM places) AS total,
                (SELECT value FROM meta WHERE key='last_updated') AS last_updated;`,
        [],
        (_: unknown, result: { rows: { item(i: number): { total: number; last_updated: string | null } } }) => {
          const row = result.rows.item(0);
          resolve({ totalPlaces: row?.total ?? 0, lastUpdatedAt: row?.last_updated ?? null });
        },
        (_: unknown, err: unknown) => { reject(err); return true; },
      );
    });
  });
}

export async function clearSearchIndex(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx: SQLiteTx) => {
        tx.executeSql('DELETE FROM places;');
        tx.executeSql('DELETE FROM meta;');
        tx.executeSql("INSERT INTO places_fts(places_fts) VALUES ('rebuild');");
      },
      (e: unknown) => reject(e),
      () => resolve(),
    );
  });
}
