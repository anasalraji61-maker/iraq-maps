/**
 * Crowding heatmap contracts.
 * All crowding values carry source, observedAt and confidence (CLAUDE.md rule 5).
 * @module crowding
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { BBox, estimate, PlaceId, Problem } from './common';

const c = initContract();

// ── Intensity ──────────────────────────────────────────────────────────────────

/** Normalised crowding intensity 0 (empty) – 1 (packed). */
export const CrowdingIntensity = z.number().min(0).max(1).brand<'CrowdingIntensity'>();
export type CrowdingIntensity = z.infer<typeof CrowdingIntensity>;

// ── Heatmap point ──────────────────────────────────────────────────────────────

/**
 * A single geospatial crowding reading used to build the heatmap.
 * intensity is Estimate<CrowdingIntensity> so it always carries provenance.
 * @public frozen contract
 */
export const CrowdingPoint = z.object({
  /** Longitude, Baghdad area is roughly 44.2–44.6 °E. */
  lng: z.number().min(-180).max(180),
  /** Latitude, Baghdad area is roughly 33.1–33.5 °N. */
  lat: z.number().min(-90).max(90),
  /** Normalised intensity 0–1 with full provenance. */
  intensity: estimate(CrowdingIntensity),
  /** Optional place id this point is anchored to. */
  placeId: PlaceId.optional(),
  /** Place category tag (mosque, restaurant, …) — drives Iraq-specific boosts. */
  category: z.string().optional(),
});
export type CrowdingPoint = z.infer<typeof CrowdingPoint>;

// ── Area polygon ───────────────────────────────────────────────────────────────

/** Weekday index 0 (Sunday) – 6 (Saturday), matching JS Date.getDay(). */
export const WeekdayIndex = z.number().int().min(0).max(6);
export type WeekdayIndex = z.infer<typeof WeekdayIndex>;

/**
 * 7 × 24 crowd-score matrix (weekday × hour).
 * Index [d][h] is a score 0–100 for day d, hour h (Baghdad UTC+3).
 */
export const WeeklyPattern = z.array(z.array(z.number().min(0).max(100)).length(24)).length(7);
export type WeeklyPattern = z.infer<typeof WeeklyPattern>;

/**
 * Crowding summary for a named district or geofence area.
 * @public frozen contract
 */
export const CrowdingArea = z.object({
  id: z.string().min(1).max(64),
  /** Human-readable name (Arabic). */
  nameAr: z.string(),
  /** Area type drives display style. */
  type: z.enum(['district', 'market', 'religious_site', 'park', 'transit_hub', 'commercial']),
  /**
   * Polygon as [lng, lat] pairs — first and last point must be equal (closed ring).
   * Coordinates stay within Iraq's bounding box (~38–49 °E, 29–38 °N).
   */
  polygon: z.array(z.tuple([z.number(), z.number()])).min(4),
  /** Hour of day (0–23, Baghdad UTC+3) when this area is typically busiest. */
  peakHour: z.number().int().min(0).max(23),
  /** 7 × 24 historical pattern — null when insufficient data (<14 days). */
  weeklyPattern: WeeklyPattern.nullable(),
  /** Representative point (centroid or entrance) for map label placement. */
  centroid: z.tuple([z.number(), z.number()]),
  /** Current crowding estimate (null = no live data). */
  currentIntensity: estimate(CrowdingIntensity).nullable(),
});
export type CrowdingArea = z.infer<typeof CrowdingArea>;

// ── Per-place crowding history ─────────────────────────────────────────────────

/**
 * All-week crowding pattern for a single place.
 * Returned by GET /crowding/place/:id.
 * @public frozen contract
 */
export const PlaceCrowdingHistory = z.object({
  placeId: PlaceId,
  /** 7 × 24 crowd-score matrix. null when < 7 days of data. */
  weeklyPattern: WeeklyPattern.nullable(),
  /** Hour (0–23, Baghdad UTC+3) with highest historical score. */
  peakHour: z.number().int().min(0).max(23).nullable(),
  /** Best 2-hour window to visit: [startHour, endHour], both 0–23. */
  bestVisitWindow: z.tuple([z.number().int(), z.number().int()]).nullable(),
  /** Estimated queue/wait time at peak in minutes. 0 = walk-in. */
  peakWaitMinutes: z.number().int().min(0),
  /** Live crowd estimate right now (null = no recent report). */
  now: estimate(CrowdingIntensity).nullable(),
  /** ISO datetime of oldest data point used. */
  dataFrom: z.string().datetime().nullable(),
  /** Total report count backing this history. */
  reportCount: z.number().int().min(0),
  /** Least-crowded alternative place ids (up to 3, same category). */
  alternatives: z.array(PlaceId).max(3),
});
export type PlaceCrowdingHistory = z.infer<typeof PlaceCrowdingHistory>;

// ── User crowding report ───────────────────────────────────────────────────────

/**
 * Payload for POST /crowding/report — a user reports current crowding.
 * Requires authentication; rate-limited to 1 per place per 30 min per user.
 * @public frozen contract
 */
export const CrowdingReport = z.object({
  placeId: PlaceId,
  /**
   * Approximate people count visible to the reporter.
   * Drives the Estimate confidence — more precise data = higher confidence.
   */
  observedCount: z.number().int().min(0).max(9999).optional(),
  /** Subjective level — used when count is not supplied. */
  level: z.enum(['low', 'medium', 'high']),
  /**
   * Actual observation time (ISO 8601, must be within the last 2 hours).
   * Defaults to server time when omitted.
   */
  observedAt: z.string().datetime().optional(),
});
export type CrowdingReport = z.infer<typeof CrowdingReport>;

/** Successful report acknowledgement. */
export const CrowdingReportAck = z.object({
  reportId: z.string().uuid(),
  /** Resulting intensity estimate after merging this report. */
  updatedIntensity: estimate(CrowdingIntensity).nullable(),
  /** Gamification: XP awarded for the report. */
  xpAwarded: z.number().int().min(0),
});
export type CrowdingReportAck = z.infer<typeof CrowdingReportAck>;

// ── Heatmap query ──────────────────────────────────────────────────────────────

/**
 * Query params for GET /crowding/heatmap.
 * @public frozen contract
 */
export const HeatmapQuery = z.object({
  /**
   * Bounding box as "west,south,east,north" (URL-encoded comma-separated floats).
   * Maximum span: 1 ° lat × 1 ° lng (approx 111 km × 90 km in Baghdad).
   */
  bbox: z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
  /**
   * ISO datetime to project crowding for (optional).
   * When omitted the server returns live/current data.
   * When provided, returns the historical pattern for that weekday+hour (Baghdad UTC+3).
   */
  time: z.string().datetime().optional(),
  /**
   * Minimum intensity to include (0–1). Omit low-noise points for sparse areas.
   * Defaults to 0.1.
   */
  minIntensity: z.coerce.number().min(0).max(1).optional(),
});
export type HeatmapQuery = z.infer<typeof HeatmapQuery>;

/** Heatmap response envelope. */
export const HeatmapResponse = z.object({
  /** GeoJSON-like points ready for MapLibre heatmap source. */
  points: z.array(CrowdingPoint),
  /**
   * Server time the data was aggregated (ISO 8601).
   * Client uses this to know when to refresh (TTL = 5 min for live, 24 h for historic).
   */
  generatedAt: z.string().datetime(),
  /** True when the data reflects real-time reports vs historical averages. */
  isLive: z.boolean(),
  /** Number of distinct user reports contributing to this snapshot. */
  reportCount: z.number().int().min(0),
});
export type HeatmapResponse = z.infer<typeof HeatmapResponse>;

// ── Area stats response ────────────────────────────────────────────────────────

export const AreaStatsResponse = z.object({
  area: CrowdingArea,
  /** Top 5 busiest places within the area right now. */
  hotspots: z.array(
    z.object({
      placeId: PlaceId,
      nameAr: z.string(),
      intensity: estimate(CrowdingIntensity),
    }),
  ).max(5),
  /** Trend vs same hour last week: positive = busier, negative = quieter. */
  weekOnWeekDelta: z.number().min(-1).max(1).nullable(),
});
export type AreaStatsResponse = z.infer<typeof AreaStatsResponse>;

// ── ts-rest router ────────────────────────────────────────────────────────────

/**
 * Crowding heatmap router.
 * Served by modules/insights; consumed by packages/map-kit and mobile-features/map.
 * @public frozen contract
 */
export const crowdingContract = c.router(
  {
    /** Heatmap points for a bbox, optionally projected to a future time. */
    heatmap: {
      method: 'GET',
      path: '/crowding/heatmap',
      query: HeatmapQuery,
      responses: { 200: HeatmapResponse, 400: Problem },
      summary: 'Crowding heatmap points for a bounding box',
    },

    /** Full crowding history (weekly pattern + best-time) for one place. */
    placeCrowding: {
      method: 'GET',
      path: '/crowding/place/:id',
      pathParams: z.object({ id: z.string().min(1).max(64).pipe(PlaceId) }),
      responses: { 200: PlaceCrowdingHistory, 404: Problem },
      summary: 'Weekly crowding pattern and best-visit window for a place',
    },

    /** Area-level stats (district / market / …). */
    areaStats: {
      method: 'GET',
      path: '/crowding/area/:id',
      pathParams: z.object({ id: z.string().min(1).max(64) }),
      responses: { 200: AreaStatsResponse, 404: Problem },
      summary: 'Area crowding stats including hotspots and week-on-week trend',
    },

    /** User submits a live crowding observation. Requires auth. */
    report: {
      method: 'POST',
      path: '/crowding/report',
      body: CrowdingReport,
      responses: { 200: CrowdingReportAck, 400: Problem, 401: Problem, 429: Problem },
      summary: 'Report current crowding at a place',
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

// ── Helper: parse bbox string ─────────────────────────────────────────────────

/**
 * Parses a "west,south,east,north" string into a typed BBox tuple.
 * Throws when the string is malformed or spans > 1 ° in either direction.
 */
export function parseBboxParam(raw: string): z.infer<typeof BBox> {
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error(`Invalid bbox: "${raw}"`);
  }
  const [west, south, east, north] = parts as [number, number, number, number];
  if (east - west > 1 || north - south > 1) {
    throw new Error('Bbox span must not exceed 1 ° in either direction');
  }
  return [west, south, east, north];
}

// ── Iraq-specific crowding boosts (shared constants) ──────────────────────────

/** Hours (Baghdad UTC+3) when Juma prayer boosts mosque crowding. */
export const JUMA_HOURS: readonly number[] = [11, 12, 13] as const;

/** Days of week (0=Sun, 5=Fri) when Juma applies. */
export const JUMA_DAY = 5 as const;

/** Intensity multiplier for mosques during Juma prayer window. */
export const JUMA_BOOST = 1.6 as const;

/** Hours (Baghdad UTC+3) of iftar rush (Ramadan — active only when flag set). */
export const IFTAR_HOURS: readonly number[] = [18, 19, 20] as const;

/** Intensity multiplier for restaurants during iftar rush. */
export const IFTAR_BOOST = 1.5 as const;

/** Categories where Juma boost applies. */
export const JUMA_CATEGORIES: ReadonlySet<string> = new Set(['mosque', 'worship']);

/** Categories where iftar boost applies. */
export const IFTAR_CATEGORIES: ReadonlySet<string> = new Set(['restaurant', 'cafe', 'food']);
