/**
 * Tour3DService – stores and queries 3D virtual tour scenes.
 *
 * Uses raw SQL via db-kit's Db (Drizzle with PostgreSQL driver).
 * Raw SQL keeps this independent of ORM schema types and gives full
 * control of PostGIS geography operations.
 */
import type {
  CityId,
  Tour3DAnnotation,
  Tour3DAnnotationId,
  Tour3DAsset,
  Tour3DAssetId,
  Tour3DAssetType,
  Tour3DCategory,
  Tour3DIconType,
  Tour3DScene,
  Tour3DSceneDetail,
  Tour3DSceneId,
} from '@iraq-maps/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';

// ---------------------------------------------------------------------------
// Internal DB row shapes
// ---------------------------------------------------------------------------

interface SceneRow {
  id: string;
  name_ar: string;
  name_ckb: string | null;
  name_en: string | null;
  description_ar: string | null;
  lng: number;
  lat: number;
  altitude: number;
  city: string;
  category: string;
  thumbnail_url: string | null;
  view_count: number;
  asset_count?: number;
  created_at: Date;
}

interface AssetRow {
  id: string;
  scene_id: string;
  type: string;
  url: string;
  heading: number;
  pitch: number;
  altitude: number;
  sequence_order: number;
  label_ar: string | null;
  label_en: string | null;
  created_at: Date;
}

interface AnnotationRow {
  id: string;
  scene_id: string;
  lng: number;
  lat: number;
  altitude: number;
  label_ar: string;
  label_ckb: string | null;
  label_en: string | null;
  icon_type: string;
  linked_place_id: string | null;
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function rowToScene(row: SceneRow & { asset_count?: number }): Tour3DScene {
  return {
    id: row.id as Tour3DSceneId,
    nameAr: row.name_ar,
    nameCkb: row.name_ckb,
    nameEn: row.name_en,
    descriptionAr: row.description_ar,
    location: [Number(row.lng), Number(row.lat)],
    altitude: Number(row.altitude),
    city: row.city as CityId,
    category: row.category as Tour3DCategory,
    thumbnailUrl: row.thumbnail_url,
    viewCount: Number(row.view_count),
    assetCount: Number(row.asset_count ?? 0),
    createdAt: row.created_at.toISOString(),
  };
}

function rowToAsset(row: AssetRow): Tour3DAsset {
  return {
    id: row.id as Tour3DAssetId,
    sceneId: row.scene_id as Tour3DSceneId,
    type: row.type as Tour3DAssetType,
    url: row.url,
    heading: Number(row.heading),
    pitch: Number(row.pitch),
    altitude: Number(row.altitude),
    sequenceOrder: Number(row.sequence_order),
    labelAr: row.label_ar,
    labelEn: row.label_en,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToAnnotation(row: AnnotationRow): Tour3DAnnotation {
  return {
    id: row.id as Tour3DAnnotationId,
    sceneId: row.scene_id as Tour3DSceneId,
    location: [Number(row.lng), Number(row.lat)],
    altitude: Number(row.altitude),
    labelAr: row.label_ar,
    labelCkb: row.label_ckb,
    labelEn: row.label_en,
    iconType: row.icon_type as Tour3DIconType,
    linkedPlaceId: row.linked_place_id as import('@iraq-maps/contracts').PlaceId | null,
  };
}

// ---------------------------------------------------------------------------
// Helper: extract rows from Drizzle execute result
// ---------------------------------------------------------------------------
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: unknown[] };
  return (r.rows ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Cache (in-memory TTL, 1 hour)
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tour route types
// ---------------------------------------------------------------------------

export interface TourRouteRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  scene_ids: string[];
  city: string;
  category: string;
  cover_photo: string | null;
  view_count: number;
  created_at: Date;
}

export interface TourRatingRow {
  user_id: string;
  tour_id: string;
  rating: number;
  created_at: Date;
}

export interface TourRoute {
  id: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sceneIds: string[];
  city: string;
  category: string;
  coverPhoto: string | null;
  viewCount: number;
  createdAt: string;
}

function rowToRoute(row: TourRouteRow): TourRoute {
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en,
    sceneIds: row.scene_ids ?? [],
    city: row.city,
    category: row.category,
    coverPhoto: row.cover_photo,
    viewCount: Number(row.view_count),
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateTourRouteData {
  nameAr: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  sceneIds: string[];
  city: string;
  category: string;
  coverPhoto?: string;
}

export interface ListTourRoutesFilters {
  city?: string;
  category?: string;
  limit?: number;
}

export interface DownloadTourData {
  route: TourRoute;
  scenes: Tour3DSceneDetail[];
}

export interface ListScenesFilters {
  city?: string;
  category?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  cursor?: string;
  limit?: number;
}

export interface CreateSceneData {
  nameAr: string;
  nameCkb?: string;
  nameEn?: string;
  descriptionAr?: string;
  lng: number;
  lat: number;
  altitude?: number;
  city: string;
  category: string;
  thumbnailUrl?: string;
}

export interface AddAssetData {
  type: string;
  url: string;
  heading?: number;
  pitch?: number;
  altitude?: number;
  sequenceOrder?: number;
  labelAr?: string;
  labelEn?: string;
}

export class Tour3DService {
  private readonly popularCache = new SimpleCache<Tour3DScene[]>(3600);

  constructor(private readonly db: Db) {}

  /**
   * List scenes with optional city/category/geo filters.
   * Cursor-based pagination using created_at + id for stable ordering.
   */
  async listScenes(filters: ListScenesFilters): Promise<{ items: Tour3DScene[]; nextCursor: string | null }> {
    const limit = Math.min(filters.limit ?? 20, 50);

    let cursorClause = sql`TRUE`;
    if (filters.cursor) {
      try {
        const [cursorTs, cursorId] = Buffer.from(filters.cursor, 'base64url')
          .toString('utf8')
          .split('|');
        if (cursorTs && cursorId) {
          cursorClause = sql`(s.created_at, s.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)`;
        }
      } catch {
        // ignore bad cursor
      }
    }

    let cityClause = sql`TRUE`;
    if (filters.city) {
      cityClause = sql`s.city = ${filters.city}`;
    }

    let categoryClause = sql`TRUE`;
    if (filters.category) {
      categoryClause = sql`s.category = ${filters.category}`;
    }

    let geoClause = sql`TRUE`;
    if (filters.lat !== undefined && filters.lng !== undefined && filters.radiusKm !== undefined) {
      const radiusM = filters.radiusKm * 1000;
      geoClause = sql`ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${filters.lng}::float8, ${filters.lat}::float8), 4326)::geography,
        ${radiusM}::float8
      )`;
    }

    const querySql = sql`
      SELECT
        s.id, s.name_ar, s.name_ckb, s.name_en, s.description_ar,
        ST_X(s.location::geometry) AS lng,
        ST_Y(s.location::geometry) AS lat,
        s.altitude, s.city, s.category, s.thumbnail_url, s.view_count, s.created_at,
        COUNT(a.id)::int AS asset_count
      FROM tour3d.scene s
      LEFT JOIN tour3d.asset a ON a.scene_id = s.id
      WHERE ${cursorClause} AND ${cityClause} AND ${categoryClause} AND ${geoClause}
      GROUP BY s.id
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${limit + 1}
    `;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(querySql as any);
    const rows = extractRows<SceneRow & { asset_count: number }>(result);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(rowToScene);

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = rows[limit - 1];
      if (last) {
        nextCursor = Buffer.from(`${last.created_at.toISOString()}|${last.id}`).toString('base64url');
      }
    }

    return { items, nextCursor };
  }

  /**
   * Get a single scene with all its assets and annotations.
   * Returns null if not found.
   */
  async getScene(id: string): Promise<Tour3DSceneDetail | null> {
    const sceneSql = sql`
      SELECT
        s.id, s.name_ar, s.name_ckb, s.name_en, s.description_ar,
        ST_X(s.location::geometry) AS lng,
        ST_Y(s.location::geometry) AS lat,
        s.altitude, s.city, s.category, s.thumbnail_url, s.view_count, s.created_at,
        COUNT(DISTINCT a.id)::int AS asset_count
      FROM tour3d.scene s
      LEFT JOIN tour3d.asset a ON a.scene_id = s.id
      WHERE s.id = ${id}::uuid
      GROUP BY s.id
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sceneResult = await this.db.execute(sceneSql as any);
    const sceneRows = extractRows<SceneRow & { asset_count: number }>(sceneResult);
    if (!sceneRows[0]) return null;

    const [assets, annotations] = await Promise.all([
      this._fetchAssets(id, 0, 100),
      this._fetchAnnotations(id),
    ]);

    return {
      ...rowToScene(sceneRows[0]),
      assets,
      annotations,
    };
  }

  /**
   * Paginated assets for a scene.
   */
  async getSceneAssets(
    sceneId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: Tour3DAsset[]; nextCursor: string | null }> {
    const safeLimit = Math.min(limit, 50);

    let cursorClause = sql`TRUE`;
    if (cursor) {
      try {
        const [seqStr, cursorId] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
        const seq = parseInt(seqStr ?? '', 10);
        if (!isNaN(seq) && cursorId) {
          cursorClause = sql`(a.sequence_order, a.id) > (${seq}, ${cursorId}::uuid)`;
        }
      } catch {
        // ignore
      }
    }

    const assetSql = sql`
      SELECT a.id, a.scene_id, a.type, a.url, a.heading, a.pitch, a.altitude,
             a.sequence_order, a.label_ar, a.label_en, a.created_at
      FROM tour3d.asset a
      WHERE a.scene_id = ${sceneId}::uuid AND ${cursorClause}
      ORDER BY a.sequence_order ASC, a.id ASC
      LIMIT ${safeLimit + 1}
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(assetSql as any);
    const rows = extractRows<AssetRow>(result);

    const hasMore = rows.length > safeLimit;
    const items = rows.slice(0, safeLimit).map(rowToAsset);

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = rows[safeLimit - 1];
      if (last) {
        nextCursor = Buffer.from(`${last.sequence_order}|${last.id}`).toString('base64url');
      }
    }

    return { items, nextCursor };
  }

  /**
   * Find scenes within a radius of a coordinate.
   */
  async getNearbyScenes(lat: number, lng: number, radiusKm: number): Promise<Tour3DScene[]> {
    const radiusM = radiusKm * 1000;
    const nearbySql = sql`
      SELECT
        s.id, s.name_ar, s.name_ckb, s.name_en, s.description_ar,
        ST_X(s.location::geometry) AS lng,
        ST_Y(s.location::geometry) AS lat,
        s.altitude, s.city, s.category, s.thumbnail_url, s.view_count, s.created_at,
        COUNT(a.id)::int AS asset_count
      FROM tour3d.scene s
      LEFT JOIN tour3d.asset a ON a.scene_id = s.id
      WHERE ST_DWithin(
        s.location,
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
        ${radiusM}::float8
      )
      GROUP BY s.id
      ORDER BY ST_Distance(
        s.location,
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
      ) ASC
      LIMIT 20
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(nearbySql as any);
    return extractRows<SceneRow & { asset_count: number }>(result).map(rowToScene);
  }

  /**
   * Create a new scene (admin only).
   */
  async createScene(data: CreateSceneData): Promise<Tour3DScene> {
    const insertSql = sql`
      INSERT INTO tour3d.scene (
        name_ar, name_ckb, name_en, description_ar,
        location, altitude, city, category, thumbnail_url
      ) VALUES (
        ${data.nameAr},
        ${data.nameCkb ?? null},
        ${data.nameEn ?? null},
        ${data.descriptionAr ?? null},
        ST_SetSRID(ST_MakePoint(${data.lng}::float8, ${data.lat}::float8), 4326)::geography,
        ${data.altitude ?? 0}::numeric,
        ${data.city},
        ${data.category},
        ${data.thumbnailUrl ?? null}
      )
      RETURNING
        id, name_ar, name_ckb, name_en, description_ar,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat,
        altitude, city, category, thumbnail_url, view_count, created_at
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(insertSql as any);
    const rows = extractRows<SceneRow>(result);
    const row = rows[0];
    if (!row) throw new Error('tour3d: scene insert returned no rows');

    this.popularCache.invalidate(data.city);
    return rowToScene({ ...row, asset_count: 0 });
  }

  /**
   * Add an asset to an existing scene (admin only).
   * Returns null if the scene does not exist.
   */
  async addAsset(sceneId: string, data: AddAssetData): Promise<Tour3DAsset | null> {
    // Verify scene exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const check = await this.db.execute(sql`SELECT id FROM tour3d.scene WHERE id = ${sceneId}::uuid` as any);
    const checkRows = extractRows<{ id: string }>(check);
    if (!checkRows[0]) return null;

    const insertSql = sql`
      INSERT INTO tour3d.asset (
        scene_id, type, url, heading, pitch, altitude, sequence_order, label_ar, label_en
      ) VALUES (
        ${sceneId}::uuid,
        ${data.type},
        ${data.url},
        ${data.heading ?? 0}::numeric,
        ${data.pitch ?? 0}::numeric,
        ${data.altitude ?? 0}::numeric,
        ${data.sequenceOrder ?? 0},
        ${data.labelAr ?? null},
        ${data.labelEn ?? null}
      )
      RETURNING id, scene_id, type, url, heading, pitch, altitude, sequence_order,
                label_ar, label_en, created_at
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(insertSql as any);
    const rows = extractRows<AssetRow>(result);
    const row = rows[0];
    if (!row) throw new Error('tour3d: asset insert returned no rows');
    return rowToAsset(row);
  }

  /**
   * Increment the view count for a scene (fire-and-forget).
   * Returns false if the scene does not exist.
   */
  async incrementViewCount(id: string): Promise<boolean> {
    const updateSql = sql`
      UPDATE tour3d.scene SET view_count = view_count + 1
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(updateSql as any);
    const rows = extractRows<{ id: string }>(result);
    if (rows[0]) {
      // Invalidate popular caches since view count changed
      this.popularCache.invalidate('__all__');
      return true;
    }
    return false;
  }

  /**
   * Get the most-viewed scenes for a city.
   * Cached for 1 hour.
   */
  async getPopularScenes(city: string): Promise<Tour3DScene[]> {
    const cacheKey = `popular:${city}`;
    const cached = this.popularCache.get(cacheKey);
    if (cached) return cached;

    const popularSql = sql`
      SELECT
        s.id, s.name_ar, s.name_ckb, s.name_en, s.description_ar,
        ST_X(s.location::geometry) AS lng,
        ST_Y(s.location::geometry) AS lat,
        s.altitude, s.city, s.category, s.thumbnail_url, s.view_count, s.created_at,
        COUNT(a.id)::int AS asset_count
      FROM tour3d.scene s
      LEFT JOIN tour3d.asset a ON a.scene_id = s.id
      WHERE s.city = ${city}
      GROUP BY s.id
      ORDER BY s.view_count DESC, s.created_at DESC
      LIMIT 10
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(popularSql as any);
    const scenes = extractRows<SceneRow & { asset_count: number }>(result).map(rowToScene);
    this.popularCache.set(cacheKey, scenes);
    return scenes;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Tour routes
  // ---------------------------------------------------------------------------

  /**
   * Create a curated multi-scene tour route.
   */
  async createTourRoute(data: CreateTourRouteData): Promise<TourRoute> {
    const insertSql = sql`
      INSERT INTO tour3d.tour_route (
        name_ar, name_en, description_ar, description_en,
        scene_ids, city, category, cover_photo
      ) VALUES (
        ${data.nameAr},
        ${data.nameEn ?? null},
        ${data.descriptionAr ?? null},
        ${data.descriptionEn ?? null},
        ${JSON.stringify(data.sceneIds)}::jsonb,
        ${data.city},
        ${data.category},
        ${data.coverPhoto ?? null}
      )
      RETURNING id, name_ar, name_en, description_ar, description_en,
                scene_ids, city, category, cover_photo, view_count, created_at
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(insertSql as any);
    const rows = extractRows<TourRouteRow>(result);
    const row = rows[0];
    if (!row) throw new Error('tour3d: tour_route insert returned no rows');
    return rowToRoute(row);
  }

  /**
   * Browse curated tour routes with optional city/category filter.
   */
  async getTourRoutes(filters: ListTourRoutesFilters): Promise<TourRoute[]> {
    const limit = Math.min(filters.limit ?? 20, 50);

    let cityClause = sql`TRUE`;
    if (filters.city) {
      cityClause = sql`city = ${filters.city}`;
    }

    let categoryClause = sql`TRUE`;
    if (filters.category) {
      categoryClause = sql`category = ${filters.category}`;
    }

    const querySql = sql`
      SELECT id, name_ar, name_en, description_ar, description_en,
             scene_ids, city, category, cover_photo, view_count, created_at
      FROM tour3d.tour_route
      WHERE ${cityClause} AND ${categoryClause}
      ORDER BY view_count DESC, created_at DESC
      LIMIT ${limit}
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(querySql as any);
    return extractRows<TourRouteRow>(result).map(rowToRoute);
  }

  /**
   * Get all scene details for a tour route (for offline caching).
   * Returns null if the route does not exist.
   */
  async downloadTourData(tourId: string): Promise<DownloadTourData | null> {
    const routeSql = sql`
      SELECT id, name_ar, name_en, description_ar, description_en,
             scene_ids, city, category, cover_photo, view_count, created_at
      FROM tour3d.tour_route
      WHERE id = ${tourId}::uuid
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routeResult = await this.db.execute(routeSql as any);
    const routeRows = extractRows<TourRouteRow>(routeResult);
    if (!routeRows[0]) return null;

    const route = rowToRoute(routeRows[0]);

    // Fetch all scenes in parallel (up to the first 20 for safety)
    const sceneIds = route.sceneIds.slice(0, 20);
    const scenes = await Promise.all(
      sceneIds.map((id) => this.getScene(id).catch(() => null)),
    );

    return {
      route,
      scenes: scenes.filter((s): s is Tour3DSceneDetail => s !== null),
    };
  }

  /**
   * Increment the view count for a tour route.
   */
  async incrementTourRouteViews(routeId: string): Promise<boolean> {
    const updateSql = sql`
      UPDATE tour3d.tour_route
      SET view_count = view_count + 1
      WHERE id = ${routeId}::uuid
      RETURNING id
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(updateSql as any);
    const rows = extractRows<{ id: string }>(result);
    return !!rows[0];
  }

  /**
   * Get the average rating for a tour route.
   * Returns null if no ratings exist.
   */
  async getRating(tourId: string): Promise<{ average: number; count: number } | null> {
    const ratingSql = sql`
      SELECT
        AVG(rating)::numeric(3,2) AS average,
        COUNT(*)::int AS count
      FROM tour3d.tour_rating
      WHERE tour_id = ${tourId}::uuid
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(ratingSql as any);
    const rows = extractRows<{ average: string | null; count: number }>(result);
    const row = rows[0];
    if (!row || row.average === null || row.count === 0) return null;
    return { average: parseFloat(row.average), count: Number(row.count) };
  }

  /**
   * Submit or update a rating for a tour route (1–5 stars).
   * Returns the new average.
   */
  async rateTour(
    userId: string,
    tourId: string,
    rating: number,
  ): Promise<{ average: number; count: number }> {
    const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));

    const upsertSql = sql`
      INSERT INTO tour3d.tour_rating (user_id, tour_id, rating)
      VALUES (${userId}::uuid, ${tourId}::uuid, ${clampedRating})
      ON CONFLICT (user_id, tour_id)
      DO UPDATE SET rating = EXCLUDED.rating, created_at = now()
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.db.execute(upsertSql as any);

    const newRating = await this.getRating(tourId);
    return newRating ?? { average: clampedRating, count: 1 };
  }

  // ---------------------------------------------------------------------------
  // Private helpers (continued)
  // ---------------------------------------------------------------------------

  private async _fetchAssets(sceneId: string, offset: number, limit: number): Promise<Tour3DAsset[]> {
    const assetSql = sql`
      SELECT id, scene_id, type, url, heading, pitch, altitude,
             sequence_order, label_ar, label_en, created_at
      FROM tour3d.asset
      WHERE scene_id = ${sceneId}::uuid
      ORDER BY sequence_order ASC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(assetSql as any);
    return extractRows<AssetRow>(result).map(rowToAsset);
  }

  private async _fetchAnnotations(sceneId: string): Promise<Tour3DAnnotation[]> {
    const annotSql = sql`
      SELECT
        id, scene_id,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat,
        altitude, label_ar, label_ckb, label_en, icon_type, linked_place_id
      FROM tour3d.annotation
      WHERE scene_id = ${sceneId}::uuid
      ORDER BY id ASC
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(annotSql as any);
    return extractRows<AnnotationRow>(result).map(rowToAnnotation);
  }
}
