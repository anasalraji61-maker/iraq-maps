/**
 * DiscoveryService — smart place discovery for Iraq Smart Maps.
 *
 * Provides personalized feeds, weekly highlights, contextual suggestions,
 * hidden gems, trending places, collaborative filtering, and seasonal
 * recommendations tailored for Iraqi users (Arabic UI, Iraq seasons,
 * Ramadan awareness).
 *
 * All queries are read-only. The service never writes to the database.
 * Prices and crowding are not read here — the insights module owns those.
 *
 * Seasonal notes for Iraq:
 *   Summer (Jun–Sep): extreme heat (45–50 °C), users seek AC, shaded cafes,
 *                     indoor malls, ice cream.
 *   Ramadan (Hijri month 9): mosques, iftar restaurants, sweets shops get a
 *                            strong evening boost.
 *   Spring/Autumn: outdoor parks, riverside walks, street food.
 *   Winter (Dec–Feb): warm cafes, indoor family restaurants.
 */

import { Injectable } from '@nestjs/common';
import type { Db } from '@iraq-maps/db-kit';
import { sql } from 'drizzle-orm';
import type {
  DiscoveryPlaceCard,
  WeeklyHighlight,
  WeeklyHighlightsResult,
  ContextualSuggestionsResult,
  PersonalizedFeedResult,
  SeasonalResult,
} from '@iraq-maps/contracts';
import type { CityId, PlaceId, UserId } from '@iraq-maps/contracts';
import type { PlaceCategory } from '@iraq-maps/contracts';

// ─── Internal row types returned by raw SQL ──────────────────────────────────

interface PlaceRow extends Record<string, unknown> {
  id: string;
  name_ar: string | null;
  name_ckb: string | null;
  name: string | null;
  category: string | null;
  lng: number;
  lat: number;
  distance_m: number | null;
  thumbnail_asset_id: string | null;
  avg_rating: number | null;
  review_count: number;
  visit_count: number;
  save_count_7d: number;
  opened_at: string | null;
}

interface UserInteractionRow extends Record<string, unknown> {
  place_id: string;
  visit_count: number;
  last_visit_at: string | null;
  saved: boolean;
  rated: boolean;
  searched: boolean;
}

interface AdminPickRow extends Record<string, unknown> {
  id: string;
  place_id: string;
  city_id: string;
  headline: string;
  week_label: string | null;
  created_by: string;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum number of reviews required before a rating is trusted. */
const MIN_REVIEW_THRESHOLD = 3;

/**
 * Hidden gem: place must have a rating above this and fewer visits than
 * MAX_HIDDEN_GEM_VISITS to qualify.
 */
const MIN_HIDDEN_GEM_RATING = 4.0;
const MAX_DEFAULT_HIDDEN_GEM_VISITS = 50;

/** Similarity threshold for collaborative filtering. */
const MIN_JACCARD_SIMILARITY = 0.15;

/** Hot weather threshold (°C) — triggers AC/indoor boosting. */
const HOT_TEMP_THRESHOLD = 38;

/** Categories strongly associated with Ramadan (iftar, sweets, mosques). */
const _RAMADAN_BOOSTED_CATEGORIES: PlaceCategory[] = ['food', 'tourism'];

/**
 * Categories boosted on Friday (family outings, lunches).
 * ISO day 5 = Friday.
 */
const _FRIDAY_BOOSTED_CATEGORIES: PlaceCategory[] = ['food', 'tourism', 'shopping'];

/** Map from ISO weekday to its name in Arabic (used in contextLabel). */
const ARABIC_DAY_NAMES: Record<number, string> = {
  1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء',
  4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد',
};

// ─── Helper functions ────────────────────────────────────────────────────────

/** Convert a raw database row to the DiscoveryPlaceCard wire type. */
function toCard(row: PlaceRow, opts: { visitedByMe: boolean; savedByMe: boolean; reason: string | null; openedWithinDays: number }): DiscoveryPlaceCard {
  const name = row.name_ar ?? row.name_ckb ?? row.name ?? row.id;
  const openedDaysAgo = row.opened_at ? Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 86_400_000) : null;
  const isNew = openedDaysAgo !== null && openedDaysAgo <= opts.openedWithinDays;
  const rating = row.review_count >= MIN_REVIEW_THRESHOLD && row.avg_rating != null ? row.avg_rating : null;

  return {
    placeId: row.id as PlaceId,
    name,
    category: (row.category as PlaceCategory) ?? null,
    location: [row.lng, row.lat],
    distanceM: row.distance_m ?? null,
    thumbnailAssetId: row.thumbnail_asset_id ?? null,
    rating,
    reviewCount: row.review_count,
    visitCount: row.visit_count,
    saveCount7d: row.save_count_7d,
    isNew,
    openedDaysAgo,
    visitedByMe: opts.visitedByMe,
    savedByMe: opts.savedByMe,
    reason: opts.reason,
  };
}

/** ISO week string, e.g. "2024-W42". */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day of week, shifting so Monday = 1
  const dayNum = (d.getUTCDay() + 6) % 7;
  // Set to nearest Thursday (ISO week rule)
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round((d.getTime() - jan4.getTime()) / 604_800_000);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Determine Iraq's broad season from a Gregorian month (1–12). */
function iraqSeason(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 9) return 'summer';
  if (month >= 10 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * Cursor: base64-encode a {offset, seed} pair so callers cannot craft
 * arbitrary SQL offsets.
 */
function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (typeof parsed === 'object' && parsed !== null && 'offset' in parsed && typeof (parsed as Record<string, unknown>).offset === 'number') {
      return Math.max(0, (parsed as { offset: number }).offset);
    }
  } catch {
    // ignore malformed
  }
  return 0;
}

// ─── Discovery options interfaces ─────────────────────────────────────────────

export interface PersonalizedFeedOptions {
  near?: [number, number];
  limit?: number;
  cursor?: string;
  hourOfDay?: number;
  dayOfWeek?: number;
  /** Hijri month 1–12; 9 = Ramadan. */
  hijriMonth?: number;
  temperatureC?: number;
}

export interface ContextualSuggestionsContext {
  lat: number;
  lng: number;
  hourOfDay: number;
  dayOfWeek: number;
  isRamadan: boolean;
  temperatureC?: number;
}

export interface NearbyByCategoryOptions {
  radiusM?: number;
  limit?: number;
}

export interface HiddenGemsOptions {
  category?: PlaceCategory;
  minRating?: number;
  maxVisits?: number;
  limit?: number;
}

export interface TrendingOptions {
  category?: PlaceCategory;
  windowDays?: number;
  limit?: number;
}

export interface RecentlyOpenedOptions {
  days?: number;
  category?: PlaceCategory;
  limit?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class DiscoveryService {
  constructor(private readonly db: Db) {}

  // ── 1. Personalized feed ─────────────────────────────────────────────────

  /**
   * Returns a personalized list of places for `userId` in `city`.
   *
   * Scoring factors (higher = more likely to appear early):
   *  +0.40 not yet visited
   *  +0.20 saved by user (they liked it but haven't gone)
   *  +0.15 recently opened (within 14 days)
   *  +0.10 save count this week (relative, capped at 0.10)
   *  +0.08 rating above 4.0
   *  +0.07 proximity boost (tapers off at 5 km)
   *  +0.05 category affinity from search / visit history
   *  Seasonal / contextual factors applied on top.
   *
   * Places the user has visited more than once get a mild revisit penalty
   * so the feed stays fresh.
   */
  async getPersonalizedFeed(
    userId: UserId,
    city: CityId,
    opts: PersonalizedFeedOptions = {},
  ): Promise<PersonalizedFeedResult> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = decodeCursor(opts.cursor);
    const [lngParam, latParam] = opts.near ?? [null, null];

    // Load the user's interaction history (visits, saves, ratings, searches).
    const interactions = await this._loadUserInteractions(userId);
    const visitedIds = new Set(interactions.filter((r) => r.visit_count > 0).map((r) => r.place_id));
    const savedIds = new Set(interactions.filter((r) => r.saved).map((r) => r.place_id));
    const _visitCountMap = new Map(interactions.map((r) => [r.place_id, r.visit_count]));

    // Determine category affinity from interactions.
    const affinityCategories = await this._computeCategoryAffinity(userId);

    // Build the scoring expression in SQL to leverage the database index.
    // We use a materialized CTE to compute scores, then page over it.
    const proximityExpr = lngParam != null && latParam != null
      ? sql`0.07 * EXP(-ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lngParam}::float8, ${latParam}::float8), 4326)::geography) / 5000.0)`
      : sql`0`;

    // Ramadan boost: evening food/mosque places
    const isRamadan = opts.hijriMonth === 9;
    const isHot = typeof opts.temperatureC === 'number' && opts.temperatureC >= HOT_TEMP_THRESHOLD;
    const isFriday = opts.dayOfWeek === 5;
    const isMorning = typeof opts.hourOfDay === 'number' && opts.hourOfDay >= 5 && opts.hourOfDay < 11;
    const _isEvening = typeof opts.hourOfDay === 'number' && opts.hourOfDay >= 18 && opts.hourOfDay < 24;

    const seasonalExpr = isRamadan
      ? sql`CASE WHEN p.category IN ('food', 'tourism') THEN 0.12 ELSE 0 END`
      : isHot
        ? sql`CASE WHEN p.tags ? 'air_conditioning' THEN 0.10 WHEN p.category IN ('food', 'shopping') THEN 0.05 ELSE 0 END`
        : isFriday
          ? sql`CASE WHEN p.category IN ('food', 'tourism', 'shopping') THEN 0.06 ELSE 0 END`
          : sql`0`;

    // Category affinity boost (flat 0.05 if category matches user preferences)
    const affinityCategoriesArr = affinityCategories.length > 0 ? affinityCategories : ['__none__'];
    const affinityExpr = sql`CASE WHEN p.category = ANY(${affinityCategoriesArr}::text[]) THEN 0.05 ELSE 0 END`;

    // Rating boost
    const ratingExpr = sql`CASE WHEN i.avg_rating >= 4.0 AND i.review_count >= ${MIN_REVIEW_THRESHOLD} THEN 0.08 ELSE 0 END`;

    // New-place boost (opened within last 14 days)
    const newPlaceExpr = sql`CASE WHEN p.opened_at IS NOT NULL AND p.opened_at >= NOW() - INTERVAL '14 days' THEN 0.15 ELSE 0 END`;

    // Save count trending boost (normalised 0–0.10)
    const saveBoostExpr = sql`LEAST(0.10, (COALESCE(i.save_count_7d, 0)::float / GREATEST(1, (SELECT MAX(save_count_7d) FROM places.discovery_stats WHERE city_id = ${city}))) * 0.10)`;

    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'  AS name_ar,
        p.names->>'ckb' AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        ${lngParam != null && latParam != null
          ? sql`ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lngParam}::float8, ${latParam}::float8), 4326)::geography)`
          : sql`NULL`} AS distance_m,
        p.thumbnail_asset_id,
        COALESCE(i.avg_rating, NULL) AS avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.city_id = ${city}
        AND p.kind = 'place'
      ORDER BY (
        -- Not-yet-visited bonus
        CASE WHEN p.id = ANY(${[...visitedIds]}::text[]) THEN 0 ELSE 0.40 END
        -- Saved-but-not-visited bonus
        + CASE WHEN p.id = ANY(${[...savedIds]}::text[]) AND NOT (p.id = ANY(${[...visitedIds]}::text[])) THEN 0.20 ELSE 0 END
        -- Revisit penalty (visited 2+ times)
        - CASE WHEN COALESCE((SELECT visit_count FROM unnest(${interactions.map(r => `${r.place_id}:${r.visit_count}`)}::text[]) AS t(v) WHERE split_part(t.v,':',1) = p.id LIMIT 1), '0')::int >= 2 THEN 0.15 ELSE 0 END
        + ${newPlaceExpr}
        + ${saveBoostExpr}
        + ${ratingExpr}
        + ${proximityExpr}
        + ${affinityExpr}
        + ${seasonalExpr}
      ) DESC,
      p.id -- stable tiebreaker
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `);

    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) =>
      toCard(row, {
        visitedByMe: visitedIds.has(row.id),
        savedByMe: savedIds.has(row.id),
        openedWithinDays: 14,
        reason: this._personalizedReason(row, visitedIds, savedIds, isRamadan, isHot, isFriday, isMorning),
      }),
    );

    return {
      items,
      nextCursor: hasMore ? encodeCursor(offset + limit) : null,
    };
  }

  // ── 2. Weekly highlights ─────────────────────────────────────────────────

  /**
   * Returns the four editorial sections for the current ISO week:
   *  - featured: admin-curated pick of the week
   *  - newThisWeek: businesses that opened in the last 7 days
   *  - hiddenGems: high rating + low visit count
   *  - trending: most saved/viewed this week
   *
   * Results are stable for the same week (good for CDN caching).
   */
  async getWeeklyHighlights(city: CityId): Promise<WeeklyHighlightsResult> {
    const now = new Date();
    const week = isoWeek(now);

    // Compute expiry: next Monday 00:00 Iraq time (UTC+3)
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + daysUntilMonday);
    expiresAt.setUTCHours(21, 0, 0, 0); // 00:00 Iraq time = 21:00 previous day UTC

    // Load all sections in parallel
    const [featuredRow, newRows, gemRows, trendRows] = await Promise.all([
      this._loadAdminFeatured(city, week),
      this._queryRecentlyOpened(city, 7, undefined, 5),
      this._queryHiddenGems(city, undefined, MIN_HIDDEN_GEM_RATING, MAX_DEFAULT_HIDDEN_GEM_VISITS, 5),
      this._queryTrending(city, undefined, 7, 5),
    ]);

    const toHighlight = (kind: WeeklyHighlight['kind'], row: PlaceRow, headline: string | null): WeeklyHighlight => ({
      kind,
      place: toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 7, reason: null }),
      headline,
      weekLabel: week,
    });

    let featured: WeeklyHighlight | null = null;
    if (featuredRow) {
      const placeRow = await this._loadSinglePlaceRow(featuredRow.place_id as PlaceId, city);
      if (placeRow) {
        featured = toHighlight('featured', placeRow, featuredRow.headline);
      }
    }

    return {
      featured,
      newThisWeek: newRows.map((r) => toHighlight('new_this_week', r, null)),
      hiddenGems: gemRows.map((r) => toHighlight('hidden_gem', r, null)),
      trending: trendRows.map((r) => toHighlight('trending', r, null)),
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ── 3. Contextual suggestions ────────────────────────────────────────────

  /**
   * Returns time/day/season-aware place suggestions with a greeting label.
   *
   * Time slots:
   *   05–11  morning  → breakfast places (إفطار), bakeries, cafes
   *   11–14  midday   → lunch restaurants, fast food
   *   14–17  afternoon → cafes, desserts, parks (if not hot)
   *   17–21  evening  → cafes, shisha (مضايف), restaurants
   *   21–24  night    → late restaurants, sweets, shisha
   *
   * Overlaid by:
   *   Ramadan evening (18–24)  → iftar restaurants, mosques
   *   Hot day (≥38 °C)         → AC cafes, indoor malls, ice cream
   *   Friday                   → family restaurants, parks, malls
   */
  async getContextualSuggestions(
    userId: UserId,
    context: ContextualSuggestionsContext,
  ): Promise<ContextualSuggestionsResult> {
    const { lat, lng, hourOfDay, dayOfWeek, isRamadan, temperatureC } = context;
    const limit = 10;

    const isHot = typeof temperatureC === 'number' && temperatureC >= HOT_TEMP_THRESHOLD;
    const isFriday = dayOfWeek === 5;

    let contextLabel: string;
    let targetCategories: PlaceCategory[];
    let tagBoost: string | null = null;

    // Determine slot and label
    if (isRamadan && hourOfDay >= 18) {
      contextLabel = 'وقت الإفطار! هذه الأماكن مثالية لإفطار رمضان';
      targetCategories = ['food', 'tourism'];
      tagBoost = 'iftar';
    } else if (isRamadan && hourOfDay >= 1 && hourOfDay < 5) {
      contextLabel = 'وقت السحور — ابحث عن مطاعم السحور القريبة';
      targetCategories = ['food'];
      tagBoost = 'suhur';
    } else if (isHot && hourOfDay >= 12 && hourOfDay < 20) {
      contextLabel = 'الجو حار جداً — أماكن بتكييف مركزي';
      targetCategories = ['food', 'shopping', 'entertainment'];
      tagBoost = 'air_conditioning';
    } else if (isFriday && hourOfDay >= 10 && hourOfDay < 15) {
      contextLabel = 'جمعة مباركة! مطاعم عائلية مميزة بالقرب منك';
      targetCategories = ['food', 'tourism'];
    } else if (hourOfDay >= 5 && hourOfDay < 11) {
      contextLabel = 'صباح الخير! هذه الأماكن مثالية للإفطار';
      targetCategories = ['food'];
      tagBoost = 'breakfast';
    } else if (hourOfDay >= 11 && hourOfDay < 14) {
      contextLabel = 'وقت الغداء — أفضل المطاعم القريبة';
      targetCategories = ['food'];
    } else if (hourOfDay >= 14 && hourOfDay < 17) {
      contextLabel = 'فترة ما بعد الظهر — مقاهٍ وحلويات';
      targetCategories = ['food'];
      tagBoost = 'cafe';
    } else if (hourOfDay >= 17 && hourOfDay < 21) {
      contextLabel = 'مساء الخير! استمتع بأمسيتك';
      targetCategories = ['food', 'tourism', 'shopping'];
    } else {
      contextLabel = 'أماكن رائجة بالقرب منك';
      targetCategories = ['food', 'tourism'];
    }

    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
        ) AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.kind = 'place'
        AND p.category = ANY(${targetCategories}::text[])
        AND ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          3000
        )
        ${tagBoost != null ? sql`AND p.tags ? ${tagBoost}` : sql``}
      ORDER BY
        -- proximity + rating + saves
        (0.5 * EXP(-ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography) / 2000.0))
        + (CASE WHEN COALESCE(i.avg_rating, 0) >= 4.0 THEN 0.3 ELSE 0 END)
        + (LEAST(0.2, COALESCE(i.save_count_7d, 0)::float / 20.0))
        DESC,
        p.id
      LIMIT ${limit}
    `);

    const items = rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 14, reason: contextLabel }),
    );

    return { contextLabel, items };
  }

  // ── 4. Nearby by category ────────────────────────────────────────────────

  /**
   * Returns places of a given category sorted by distance from (lat, lng).
   */
  async getNearbyByCategory(
    lat: number,
    lng: number,
    category: PlaceCategory,
    radiusM = 2000,
    limit = 20,
  ): Promise<DiscoveryPlaceCard[]> {
    const safeLimit = Math.min(limit, 50);
    const safeRadius = Math.min(radiusM, 10_000);

    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        ST_Distance(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
        ) AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.kind = 'place'
        AND p.category = ${category}
        AND ST_DWithin(
          p.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${safeRadius}
        )
      ORDER BY distance_m ASC, p.id
      LIMIT ${safeLimit}
    `);

    return rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 14, reason: null }),
    );
  }

  // ── 5. Recently opened places ────────────────────────────────────────────

  /**
   * Returns places that were created in the last `days` days, ordered
   * newest first, then by save count.
   */
  async getRecentlyOpenedPlaces(
    city: CityId,
    days = 14,
    opts: RecentlyOpenedOptions = {},
  ): Promise<DiscoveryPlaceCard[]> {
    const rows = await this._queryRecentlyOpened(city, days, opts.category, opts.limit ?? 20);
    return rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: days, reason: 'جديد في منطقتك' }),
    );
  }

  // ── 6. Hidden gems ───────────────────────────────────────────────────────

  /**
   * High-rated places (≥ minRating) with fewer than maxVisits check-ins.
   * These are genuinely good places that have not been over-exposed.
   */
  async getHiddenGems(
    city: CityId,
    category?: PlaceCategory,
    opts: HiddenGemsOptions = {},
  ): Promise<DiscoveryPlaceCard[]> {
    const rows = await this._queryHiddenGems(
      city,
      category ?? opts.category,
      opts.minRating ?? MIN_HIDDEN_GEM_RATING,
      opts.maxVisits ?? MAX_DEFAULT_HIDDEN_GEM_VISITS,
      opts.limit ?? 15,
    );
    return rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 999, reason: 'جوهرة خفية — قيّم عالٍ وزيارات قليلة' }),
    );
  }

  // ── 7. Trending this week ────────────────────────────────────────────────

  /**
   * Places with the highest save + view momentum in the last `windowDays`.
   * Sorted by a weighted score: 2×saves + 1×views.
   */
  async getTrendingThisWeek(
    city: CityId,
    category?: PlaceCategory,
    opts: TrendingOptions = {},
  ): Promise<DiscoveryPlaceCard[]> {
    const rows = await this._queryTrending(
      city,
      category ?? opts.category,
      opts.windowDays ?? 7,
      opts.limit ?? 15,
    );
    return rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 999, reason: 'رائج هذا الأسبوع' }),
    );
  }

  // ── 8. Collaborative filtering ───────────────────────────────────────────

  /**
   * Finds users with a Jaccard similarity of visited places ≥ 0.15,
   * then recommends places they visited that the requesting user has not.
   *
   * Only explicit interactions (check-ins) are used — no inferred data.
   *
   * Returns up to `limit` distinct place cards, scored by how many
   * similar users visited each one.
   */
  async getPopularWithSimilarUsers(
    userId: UserId,
    city: CityId,
    limit = 15,
  ): Promise<DiscoveryPlaceCard[]> {
    const safeLimit = Math.min(limit, 30);

    // Load the user's own visited place ids
    const myInteractions = await this._loadUserInteractions(userId);
    const myVisited = new Set(myInteractions.filter((r) => r.visit_count > 0).map((r) => r.place_id));

    if (myVisited.size === 0) {
      // Cold start: fall back to trending
      return this.getTrendingThisWeek(city, undefined, { limit: safeLimit });
    }

    const myVisitedArr = [...myVisited];

    // Find other users who visited at least one of the same places
    const { rows: similarRows } = await this.db.execute<{ other_user_id: string; shared: number; other_total: number }>(sql`
      SELECT
        ui.user_id   AS other_user_id,
        COUNT(*)     AS shared,
        COUNT(*) OVER (PARTITION BY ui.user_id) AS other_total
      FROM places.user_interactions ui
      WHERE ui.place_id = ANY(${myVisitedArr}::text[])
        AND ui.user_id <> ${userId}
        AND ui.visit_count > 0
      GROUP BY ui.user_id
      HAVING COUNT(*) >= 2
      ORDER BY shared DESC
      LIMIT 50
    `);

    // Compute Jaccard: |A ∩ B| / |A ∪ B|  (A = my visits, B = their visits)
    const similarUserIds = similarRows
      .filter((r) => {
        const shared = Number(r.shared);
        const otherTotal = Number(r.other_total);
        const union = myVisited.size + otherTotal - shared;
        return union > 0 && shared / union >= MIN_JACCARD_SIMILARITY;
      })
      .map((r) => r.other_user_id);

    if (similarUserIds.length === 0) {
      return this.getTrendingThisWeek(city, undefined, { limit: safeLimit });
    }

    // Fetch places those similar users visited that I have not
    const { rows } = await this.db.execute<PlaceRow & { similar_visit_count: number }>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        NULL::float8                AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at,
        COUNT(ui.user_id) AS similar_visit_count
      FROM places.user_interactions ui
      JOIN places.osm_features p ON p.id = ui.place_id
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE ui.user_id = ANY(${similarUserIds}::text[])
        AND ui.visit_count > 0
        AND p.city_id = ${city}
        AND p.kind = 'place'
        AND NOT (p.id = ANY(${myVisitedArr}::text[]))
      GROUP BY p.id, i.avg_rating, i.review_count, i.visit_count, i.save_count_7d
      ORDER BY similar_visit_count DESC, COALESCE(i.avg_rating, 0) DESC, p.id
      LIMIT ${safeLimit}
    `);

    return rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 999, reason: 'مشهور بين أشخاص مثلك' }),
    );
  }

  // ── 9. Seasonal recommendations ─────────────────────────────────────────

  /**
   * Month-specific recommendations reflecting Iraq's climate and cultural
   * calendar:
   *
   *   Jan–Feb (winter)  : warm restaurants, cafes, hot drinks, indoor malls
   *   Mar–May (spring)  : outdoor parks, riverside walks, picnic spots
   *   Jun–Sep (summer)  : AC venues, malls, ice cream, indoor entertainment
   *   Oct–Nov (autumn)  : street food, markets, light outdoor venues
   *   Ramadan (any month, passed via hijriMonth in personalized feed):
   *                       mosques, iftar restaurants, sweets shops
   */
  async getSeasonalRecommendations(
    city: CityId,
    month: number,
    limit = 15,
  ): Promise<SeasonalResult> {
    const safeLimit = Math.min(limit, 30);
    const season = iraqSeason(month);

    let seasonLabel: string;
    let categories: PlaceCategory[];
    let tagFilter: string | null = null;

    switch (season) {
      case 'spring':
        seasonLabel = 'أماكن الربيع — نزهات وهواء طلق';
        categories = ['tourism', 'food'];
        tagFilter = 'outdoor_seating';
        break;
      case 'summer':
        seasonLabel = 'أبرد ما في بغداد صيفاً — أماكن بتكييف';
        categories = ['food', 'shopping', 'entertainment'];
        tagFilter = 'air_conditioning';
        break;
      case 'autumn':
        seasonLabel = 'أماكن الخريف — أسواق شعبية وطعام الشوارع';
        categories = ['food', 'shopping', 'tourism'];
        break;
      case 'winter':
      default:
        seasonLabel = 'أماكن دافئة لفصل الشتاء';
        categories = ['food', 'entertainment'];
        tagFilter = 'indoor';
        break;
    }

    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        NULL::float8                AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.city_id = ${city}
        AND p.kind = 'place'
        AND p.category = ANY(${categories}::text[])
        ${tagFilter != null ? sql`AND p.tags ? ${tagFilter}` : sql``}
      ORDER BY
        (COALESCE(i.avg_rating, 0) * 0.5)
        + (LEAST(0.3, COALESCE(i.save_count_7d, 0)::float / 30.0))
        + (CASE WHEN COALESCE(i.review_count, 0) >= 5 THEN 0.2 ELSE 0 END)
        DESC,
        p.id
      LIMIT ${safeLimit}
    `);

    const items = rows.map((row) =>
      toCard(row, { visitedByMe: false, savedByMe: false, openedWithinDays: 999, reason: seasonLabel }),
    );

    return { seasonLabel, items };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _loadUserInteractions(userId: UserId): Promise<UserInteractionRow[]> {
    const { rows } = await this.db.execute<UserInteractionRow>(sql`
      SELECT
        place_id,
        visit_count,
        last_visit_at,
        saved,
        rated,
        searched
      FROM places.user_interactions
      WHERE user_id = ${userId}
    `);
    return rows;
  }

  /**
   * Returns the top-3 categories the user has interacted with most
   * (visits + saves), used as affinity signals for the personalized feed.
   */
  private async _computeCategoryAffinity(userId: UserId): Promise<string[]> {
    const { rows } = await this.db.execute<{ category: string; score: number }>(sql`
      SELECT p.category, SUM(ui.visit_count + CASE WHEN ui.saved THEN 2 ELSE 0 END) AS score
      FROM places.user_interactions ui
      JOIN places.osm_features p ON p.id = ui.place_id
      WHERE ui.user_id = ${userId}
        AND p.category IS NOT NULL
      GROUP BY p.category
      ORDER BY score DESC
      LIMIT 3
    `);
    return rows.map((r) => r.category);
  }

  private async _loadAdminFeatured(city: CityId, week: string): Promise<AdminPickRow | null> {
    const { rows } = await this.db.execute<AdminPickRow>(sql`
      SELECT id, place_id, city_id, headline, week_label, created_by, created_at
      FROM places.admin_picks
      WHERE city_id = ${city}
        AND (week_label = ${week} OR week_label IS NULL)
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async _loadSinglePlaceRow(placeId: PlaceId, city: CityId): Promise<PlaceRow | null> {
    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        NULL::float8                AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.id = ${placeId} AND p.city_id = ${city}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async _queryRecentlyOpened(
    city: CityId,
    days: number,
    category: PlaceCategory | undefined,
    limit: number,
  ): Promise<PlaceRow[]> {
    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        NULL::float8                AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      LEFT JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.city_id = ${city}
        AND p.kind = 'place'
        AND p.opened_at IS NOT NULL
        AND p.opened_at >= NOW() - (${days} || ' days')::interval
        ${category != null ? sql`AND p.category = ${category}` : sql``}
      ORDER BY p.opened_at DESC, COALESCE(i.save_count_7d, 0) DESC, p.id
      LIMIT ${limit}
    `);
    return rows;
  }

  private async _queryHiddenGems(
    city: CityId,
    category: PlaceCategory | undefined,
    minRating: number,
    maxVisits: number,
    limit: number,
  ): Promise<PlaceRow[]> {
    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        NULL::float8                AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      JOIN places.discovery_stats i ON i.place_id = p.id
      WHERE p.city_id = ${city}
        AND p.kind = 'place'
        AND i.avg_rating >= ${minRating}
        AND i.review_count >= ${MIN_REVIEW_THRESHOLD}
        AND COALESCE(i.visit_count, 0) <= ${maxVisits}
        ${category != null ? sql`AND p.category = ${category}` : sql``}
      ORDER BY i.avg_rating DESC, i.review_count DESC, p.id
      LIMIT ${limit}
    `);
    return rows;
  }

  private async _queryTrending(
    city: CityId,
    category: PlaceCategory | undefined,
    windowDays: number,
    limit: number,
  ): Promise<PlaceRow[]> {
    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        p.id,
        p.names->>'ar'   AS name_ar,
        p.names->>'ckb'  AS name_ckb,
        p.names->>'name' AS name,
        p.category,
        ST_X(p.location::geometry) AS lng,
        ST_Y(p.location::geometry) AS lat,
        NULL::float8                AS distance_m,
        p.thumbnail_asset_id,
        i.avg_rating,
        COALESCE(i.review_count, 0)  AS review_count,
        COALESCE(i.visit_count, 0)   AS visit_count,
        COALESCE(i.save_count_7d, 0) AS save_count_7d,
        p.opened_at
      FROM places.osm_features p
      JOIN places.discovery_stats i ON i.place_id = p.id
      JOIN (
        SELECT place_id,
               SUM(CASE WHEN event_type = 'save' THEN 2 ELSE 1 END) AS momentum
        FROM places.place_events
        WHERE occurred_at >= NOW() - (${windowDays} || ' days')::interval
        GROUP BY place_id
      ) ev ON ev.place_id = p.id
      WHERE p.city_id = ${city}
        AND p.kind = 'place'
        ${category != null ? sql`AND p.category = ${category}` : sql``}
      ORDER BY ev.momentum DESC, COALESCE(i.avg_rating, 0) DESC, p.id
      LIMIT ${limit}
    `);
    return rows;
  }

  /**
   * Compose a human-readable reason string for a feed card based on the
   * signals that pushed it into the user's personalized feed.
   */
  private _personalizedReason(
    row: PlaceRow,
    visitedIds: Set<string>,
    savedIds: Set<string>,
    isRamadan: boolean,
    isHot: boolean,
    isFriday: boolean,
    isMorning: boolean,
  ): string | null {
    if (isRamadan && (row.category === 'food' || row.category === 'tourism')) {
      return 'مقترح رمضاني';
    }
    if (isHot && row.category === 'food') {
      return 'مكيَّف — مثالي للحر';
    }
    if (isFriday && (row.category === 'food' || row.category === 'tourism')) {
      return 'مقترح لعطلة الجمعة';
    }
    if (isMorning && row.category === 'food') {
      return 'مثالي للإفطار';
    }
    if (savedIds.has(row.id) && !visitedIds.has(row.id)) {
      return 'حفظته ولم تزره بعد';
    }
    if (!visitedIds.has(row.id) && row.save_count_7d > 5) {
      return 'رائج هذا الأسبوع';
    }
    if (!visitedIds.has(row.id) && row.avg_rating != null && row.avg_rating >= 4.5) {
      return 'تقييم ممتاز';
    }
    if (row.opened_at != null) {
      const daysAgo = Math.floor((Date.now() - new Date(row.opened_at).getTime()) / 86_400_000);
      if (daysAgo <= 14) return 'جديد في منطقتك';
    }
    return null;
  }

  // ─── UNUSED day-name helper (kept for future label generation) ────────────

  /** @internal */
  _arabicDayName(isoDay: number): string {
    return ARABIC_DAY_NAMES[isoDay] ?? '';
  }
}
