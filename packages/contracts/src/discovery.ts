/**
 * Discovery contracts — personalized place feeds, weekly highlights,
 * contextual suggestions, hidden gems, trending, collaborative filtering.
 *
 * @public M-discovery
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, LngLat, PlaceId, UserId } from './common';
import { PlaceCategory } from './geo-data';

const c = initContract();

// ─── Shared value types ────────────────────────────────────────────────────────

export const DiscoveryPlaceCard = z.object({
  placeId: PlaceId,
  /** Best available name in the request locale. */
  name: z.string(),
  category: PlaceCategory.nullable(),
  location: LngLat,
  /** Metres from the user's current position; null when position unknown. */
  distanceM: z.number().nonnegative().nullable(),
  /** OSM-derived or provider-supplied thumbnail asset id; null when none. */
  thumbnailAssetId: z.string().uuid().nullable(),
  /** Average rating 1–5; null when fewer than 3 reviews. */
  rating: z.number().min(1).max(5).nullable(),
  /** Total number of reviews. */
  reviewCount: z.number().int().nonnegative(),
  /** Total check-ins / visits recorded in the insights table. */
  visitCount: z.number().int().nonnegative(),
  /** Save/bookmark count (last 7 days). */
  saveCount7d: z.number().int().nonnegative(),
  /** True when the place opened in the last `openedWithinDays` days. */
  isNew: z.boolean(),
  /** Days since opening, or null when unknown. */
  openedDaysAgo: z.number().int().nonnegative().nullable(),
  /** True when the requesting user has already visited this place. */
  visitedByMe: z.boolean(),
  /** True when the requesting user has saved/bookmarked this place. */
  savedByMe: z.boolean(),
  /** Algorithmic reason this card appears in the list. Displayed to the user. */
  reason: z.string().nullable(),
});
export type DiscoveryPlaceCard = z.infer<typeof DiscoveryPlaceCard>;

// ─── Personalized feed ────────────────────────────────────────────────────────

export const PersonalizedFeedQuery = z.object({
  city: CityId,
  /** User's current position for proximity scoring. */
  near: LngLat.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  /** Hour of day 0–23 in the user's local time (passed by client). */
  hourOfDay: z.coerce.number().int().min(0).max(23).optional(),
  /** ISO day of week 1 (Mon) – 7 (Sun). */
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
  /** Current Hijri month 1–12 (client computes). Presence signals Ramadan when 9. */
  hijriMonth: z.coerce.number().int().min(1).max(12).optional(),
  /** Approximate temperature in Celsius; used for heat-related boosts. */
  temperatureC: z.coerce.number().optional(),
});
export type PersonalizedFeedQuery = z.infer<typeof PersonalizedFeedQuery>;

export const PersonalizedFeedResult = z.object({
  items: z.array(DiscoveryPlaceCard),
  nextCursor: z.string().nullable(),
});
export type PersonalizedFeedResult = z.infer<typeof PersonalizedFeedResult>;

// ─── Weekly highlights ────────────────────────────────────────────────────────

export const WeeklyHighlightKind = z.enum([
  'featured',       // admin-curated pick of the week
  'new_this_week',  // opened in the last 7 days
  'hidden_gem',     // high rating, low visit count
  'trending',       // most saved this week
]);
export type WeeklyHighlightKind = z.infer<typeof WeeklyHighlightKind>;

export const WeeklyHighlight = z.object({
  kind: WeeklyHighlightKind,
  place: DiscoveryPlaceCard,
  /** Editorial headline set by admin for 'featured'; null otherwise. */
  headline: z.string().max(120).nullable(),
  /** ISO week string, e.g. "2024-W42". */
  weekLabel: z.string(),
});
export type WeeklyHighlight = z.infer<typeof WeeklyHighlight>;

export const WeeklyHighlightsResult = z.object({
  featured: WeeklyHighlight.nullable(),
  newThisWeek: z.array(WeeklyHighlight),
  hiddenGems: z.array(WeeklyHighlight),
  trending: z.array(WeeklyHighlight),
  /** ISO timestamp for cache TTL (expires at Sunday midnight Iraq time). */
  expiresAt: z.string().datetime(),
});
export type WeeklyHighlightsResult = z.infer<typeof WeeklyHighlightsResult>;

// ─── Contextual suggestions ───────────────────────────────────────────────────

export const ContextualSuggestionsQuery = z.object({
  city: CityId,
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  /** Hour of day 0–23. */
  hourOfDay: z.coerce.number().int().min(0).max(23),
  /** ISO day of week 1–7. */
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  /** True when current Hijri month is Ramadan (9). */
  isRamadan: z.coerce.boolean().default(false),
  temperatureC: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type ContextualSuggestionsQuery = z.infer<typeof ContextualSuggestionsQuery>;

export const ContextualSuggestionsResult = z.object({
  /** Greeting or context phrase, e.g. "صباح الخير! هذه الأماكن مثالية للإفطار". */
  contextLabel: z.string(),
  items: z.array(DiscoveryPlaceCard),
});
export type ContextualSuggestionsResult = z.infer<typeof ContextualSuggestionsResult>;

// ─── Nearby by category ───────────────────────────────────────────────────────

export const NearbyByCategoryQuery = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  category: PlaceCategory,
  radiusM: z.coerce.number().int().min(100).max(10000).default(2000),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NearbyByCategoryQuery = z.infer<typeof NearbyByCategoryQuery>;

// ─── Recently opened ──────────────────────────────────────────────────────────

export const RecentlyOpenedQuery = z.object({
  city: CityId,
  days: z.coerce.number().int().min(1).max(60).default(14),
  category: PlaceCategory.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RecentlyOpenedQuery = z.infer<typeof RecentlyOpenedQuery>;

// ─── Hidden gems ──────────────────────────────────────────────────────────────

export const HiddenGemsQuery = z.object({
  city: CityId,
  category: PlaceCategory.optional(),
  /** Minimum average rating threshold (default 4.0). */
  minRating: z.coerce.number().min(1).max(5).default(4.0),
  /** Maximum visit count to still qualify as "hidden" (default 50). */
  maxVisits: z.coerce.number().int().min(0).default(50),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
export type HiddenGemsQuery = z.infer<typeof HiddenGemsQuery>;

// ─── Trending ─────────────────────────────────────────────────────────────────

export const TrendingQuery = z.object({
  city: CityId,
  category: PlaceCategory.optional(),
  /** Window in days (default 7). */
  windowDays: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});
export type TrendingQuery = z.infer<typeof TrendingQuery>;

// ─── Similar-user recommendations (collaborative filtering) ───────────────────

export const SimilarUsersQuery = z.object({
  city: CityId,
  limit: z.coerce.number().int().min(1).max(30).default(15),
});
export type SimilarUsersQuery = z.infer<typeof SimilarUsersQuery>;

// ─── Seasonal ─────────────────────────────────────────────────────────────────

export const SeasonalQuery = z.object({
  city: CityId,
  /** Gregorian month 1–12. */
  month: z.coerce.number().int().min(1).max(12),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});
export type SeasonalQuery = z.infer<typeof SeasonalQuery>;

export const SeasonalResult = z.object({
  /** e.g. "أماكن رمضانية", "أبرد ما في بغداد صيفاً". */
  seasonLabel: z.string(),
  items: z.array(DiscoveryPlaceCard),
});
export type SeasonalResult = z.infer<typeof SeasonalResult>;

// ─── Admin-curated editorial picks ───────────────────────────────────────────

export const AdminPickId = z.string().uuid().brand('AdminPickId');
export type AdminPickId = z.infer<typeof AdminPickId>;

export const AdminPick = z.object({
  id: AdminPickId,
  placeId: PlaceId,
  city: CityId,
  headline: z.string().max(120),
  /** ISO week string (e.g. "2024-W42"); null = current week. */
  weekLabel: z.string().nullable(),
  createdBy: UserId,
  createdAt: z.string().datetime(),
});
export type AdminPick = z.infer<typeof AdminPick>;

// ─── ts-rest contract ─────────────────────────────────────────────────────────

const Problem400 = z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() });
const Problem401 = z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() });
const Problem403 = z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() });
const Problem404 = z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() });

export const discoveryContract = c.router({
  personalizedFeed: {
    method: 'GET',
    path: '/discovery/feed',
    query: PersonalizedFeedQuery,
    responses: {
      200: PersonalizedFeedResult,
      400: Problem400,
      401: Problem401,
    },
    summary: 'Personalized place feed for the authenticated user',
  },

  weeklyHighlights: {
    method: 'GET',
    path: '/discovery/weekly-highlights',
    query: z.object({ city: CityId }),
    responses: {
      200: WeeklyHighlightsResult,
      400: Problem400,
    },
    summary: 'Admin-curated + algorithmic weekly highlight sections',
  },

  contextualSuggestions: {
    method: 'GET',
    path: '/discovery/contextual',
    query: ContextualSuggestionsQuery,
    responses: {
      200: ContextualSuggestionsResult,
      400: Problem400,
      401: Problem401,
    },
    summary: 'Context-aware suggestions based on time, day, season and weather',
  },

  nearbyByCategory: {
    method: 'GET',
    path: '/discovery/nearby',
    query: NearbyByCategoryQuery,
    responses: {
      200: z.object({ items: z.array(DiscoveryPlaceCard) }),
      400: Problem400,
    },
    summary: 'Closest places in a category within a given radius',
  },

  recentlyOpened: {
    method: 'GET',
    path: '/discovery/recently-opened',
    query: RecentlyOpenedQuery,
    responses: {
      200: z.object({ items: z.array(DiscoveryPlaceCard) }),
      400: Problem400,
    },
    summary: 'Businesses that opened in the last N days',
  },

  hiddenGems: {
    method: 'GET',
    path: '/discovery/hidden-gems',
    query: HiddenGemsQuery,
    responses: {
      200: z.object({ items: z.array(DiscoveryPlaceCard) }),
      400: Problem400,
    },
    summary: 'High-rated, low-traffic places ("hidden gems")',
  },

  trending: {
    method: 'GET',
    path: '/discovery/trending',
    query: TrendingQuery,
    responses: {
      200: z.object({ items: z.array(DiscoveryPlaceCard) }),
      400: Problem400,
    },
    summary: 'Places trending by saves/views in the last N days',
  },

  popularWithSimilarUsers: {
    method: 'GET',
    path: '/discovery/similar-users',
    query: SimilarUsersQuery,
    responses: {
      200: z.object({ items: z.array(DiscoveryPlaceCard) }),
      400: Problem400,
      401: Problem401,
    },
    summary: 'Places popular with users who have similar visit patterns',
  },

  seasonal: {
    method: 'GET',
    path: '/discovery/seasonal',
    query: SeasonalQuery,
    responses: {
      200: SeasonalResult,
      400: Problem400,
    },
    summary: 'Month-specific recommendations (Ramadan, hot summer, etc.)',
  },
});

// ─── Admin sub-contract ────────────────────────────────────────────────────────

export const adminDiscoveryContract = c.router({
  setFeaturedPick: {
    method: 'PUT',
    path: '/admin/discovery/featured',
    body: z.object({ placeId: PlaceId, city: CityId, headline: z.string().min(1).max(120), weekLabel: z.string().nullable() }),
    responses: {
      200: AdminPick,
      400: Problem400,
      401: Problem401,
      403: Problem403,
      404: Problem404,
    },
    summary: 'Set the featured "place of the week" (admin only)',
  },

  clearFeaturedPick: {
    method: 'DELETE',
    path: '/admin/discovery/featured',
    query: z.object({ city: CityId }),
    responses: {
      204: z.undefined(),
      401: Problem401,
      403: Problem403,
    },
    summary: 'Remove the current featured pick',
  },

  listAdminPicks: {
    method: 'GET',
    path: '/admin/discovery/picks',
    query: z.object({ city: CityId, limit: z.coerce.number().int().max(50).default(20) }),
    responses: {
      200: z.object({ items: z.array(AdminPick) }),
      401: Problem401,
      403: Problem403,
    },
    summary: 'List all admin-curated editorial picks',
  },
});

export type DiscoveryPlaceCardType = z.infer<typeof DiscoveryPlaceCard>;
export type WeeklyHighlightType = z.infer<typeof WeeklyHighlight>;
export type WeeklyHighlightsResultType = z.infer<typeof WeeklyHighlightsResult>;
export type ContextualSuggestionsResultType = z.infer<typeof ContextualSuggestionsResult>;
export type PersonalizedFeedResultType = z.infer<typeof PersonalizedFeedResult>;
export type SeasonalResultType = z.infer<typeof SeasonalResult>;
export type AdminPickType = z.infer<typeof AdminPick>;
