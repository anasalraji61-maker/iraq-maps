import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, Locale, PlaceId, Problem, UserId } from './common';
import { PlaceCategory } from './geo-data';

const c = initContract();

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const SearchResultType = z.enum(['place', 'post', 'user', 'event', 'listing', 'tour']);
export type SearchResultType = z.infer<typeof SearchResultType>;

export const SearchFilters = z.object({
  type: SearchResultType.optional(),
  category: PlaceCategory.optional(),
  city: CityId.optional(),
  /** lng,lat */
  near: z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,15})?,-?\d{1,2}(\.\d{1,15})?$/)
    .optional(),
  radiusM: z.coerce.number().int().min(50).max(50_000).default(5_000).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  /** 1–5 minimum rating */
  ratingMin: z.coerce.number().min(1).max(5).optional(),
  openNow: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .optional(),
  lang: Locale.default('ar'),
});
export type SearchFilters = z.infer<typeof SearchFilters>;

// ---------------------------------------------------------------------------
// Result variants
// ---------------------------------------------------------------------------

export const PlaceSearchResult = z.object({
  type: z.literal('place'),
  id: PlaceId,
  name: z.string(),
  category: PlaceCategory.nullable(),
  distanceM: z.number().nullable(),
  location: z.tuple([z.number(), z.number()]),
  openNow: z.boolean().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
  city: CityId,
});
export type PlaceSearchResult = z.infer<typeof PlaceSearchResult>;

export const PostSearchResult = z.object({
  type: z.literal('post'),
  id: z.string().uuid(),
  authorName: z.string(),
  authorId: UserId,
  excerpt: z.string().max(200),
  createdAt: z.string().datetime(),
  likeCount: z.number().int().nonnegative(),
});
export type PostSearchResult = z.infer<typeof PostSearchResult>;

export const UserSearchResult = z.object({
  type: z.literal('user'),
  id: UserId,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  bio: z.string().max(160).nullable(),
  followerCount: z.number().int().nonnegative(),
  isProvider: z.boolean(),
});
export type UserSearchResult = z.infer<typeof UserSearchResult>;

export const EventSearchResult = z.object({
  type: z.literal('event'),
  id: z.string().uuid(),
  title: z.string(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  location: z.tuple([z.number(), z.number()]).nullable(),
  venueName: z.string().nullable(),
  city: CityId,
  attendeeCount: z.number().int().nonnegative(),
});
export type EventSearchResult = z.infer<typeof EventSearchResult>;

export const ListingSearchResult = z.object({
  type: z.literal('listing'),
  id: z.string().uuid(),
  title: z.string(),
  priceIqd: z.number().nonnegative().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  sellerName: z.string(),
  city: CityId,
  postedAt: z.string().datetime(),
});
export type ListingSearchResult = z.infer<typeof ListingSearchResult>;

export const TourSearchResult = z.object({
  type: z.literal('tour'),
  id: z.string().uuid(),
  title: z.string(),
  durationMinutes: z.number().int().positive().nullable(),
  city: CityId,
  thumbnailUrl: z.string().url().nullable(),
});
export type TourSearchResult = z.infer<typeof TourSearchResult>;

/** Discriminated union of all search result types. */
export const SearchResultItem = z.discriminatedUnion('type', [
  PlaceSearchResult,
  PostSearchResult,
  UserSearchResult,
  EventSearchResult,
  ListingSearchResult,
  TourSearchResult,
]);
export type SearchResultItem = z.infer<typeof SearchResultItem>;

export const SearchResponse = z.object({
  items: z.array(SearchResultItem),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  query: z.string(),
  durationMs: z.number().int().nonnegative(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export const SearchSuggestion = z.object({
  text: z.string(),
  type: SearchResultType,
  /** Place id when type === 'place' */
  placeId: PlaceId.optional(),
  /** Category when type === 'place' */
  category: PlaceCategory.nullable().optional(),
  city: CityId.optional(),
});
export type SearchSuggestion = z.infer<typeof SearchSuggestion>;

export const SuggestionsResponse = z.object({
  suggestions: z.array(SearchSuggestion),
});
export type SuggestionsResponse = z.infer<typeof SuggestionsResponse>;

// ---------------------------------------------------------------------------
// Trending
// ---------------------------------------------------------------------------

export const TrendingSearch = z.object({
  query: z.string(),
  count: z.number().int().positive(),
  city: CityId.nullable(),
  trend: z.enum(['rising', 'stable', 'falling']),
});
export type TrendingSearch = z.infer<typeof TrendingSearch>;

export const TrendingResponse = z.object({
  trending: z.array(TrendingSearch),
  updatedAt: z.string().datetime(),
});
export type TrendingResponse = z.infer<typeof TrendingResponse>;

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const SearchHistoryEntry = z.object({
  id: z.string().uuid(),
  query: z.string(),
  filters: SearchFilters.partial().optional(),
  searchedAt: z.string().datetime(),
  resultCount: z.number().int().nonnegative().nullable(),
});
export type SearchHistoryEntry = z.infer<typeof SearchHistoryEntry>;

export const SearchHistoryResponse = z.object({
  history: z.array(SearchHistoryEntry),
});
export type SearchHistoryResponse = z.infer<typeof SearchHistoryResponse>;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

const limit = z.coerce.number().int().min(1).max(50).default(20);
const cursor = z.string().optional();

/** @public search contract */
export const searchContract = c.router({
  search: {
    method: 'GET',
    path: '/v1/search',
    query: SearchFilters.extend({
      q: z.string().trim().min(1).max(200),
      limit,
      cursor,
    }),
    responses: {
      200: SearchResponse,
      400: Problem,
      429: Problem,
    },
    summary: 'Unified search across places, posts, users, events, listings and tours',
  },

  suggestions: {
    method: 'GET',
    path: '/v1/search/suggestions',
    query: z.object({
      q: z.string().trim().min(1).max(100),
      city: CityId.optional(),
      lang: Locale.default('ar'),
      limit: z.coerce.number().int().min(1).max(10).default(5),
    }),
    responses: {
      200: SuggestionsResponse,
      429: Problem,
    },
    summary: 'Fast autocomplete suggestions (pg_trgm)',
  },

  trending: {
    method: 'GET',
    path: '/v1/search/trending',
    query: z.object({
      city: CityId.optional(),
      limit: z.coerce.number().int().min(1).max(20).default(10),
    }),
    responses: {
      200: TrendingResponse,
    },
    summary: 'Popular queries, cached hourly',
  },

  getHistory: {
    method: 'GET',
    path: '/v1/search/history',
    headers: z.object({ authorization: z.string() }),
    query: z.object({}),
    responses: {
      200: SearchHistoryResponse,
      401: Problem,
    },
    summary: "Last 20 searches for the authenticated user",
  },

  deleteHistory: {
    method: 'DELETE',
    path: '/v1/search/history',
    headers: z.object({ authorization: z.string() }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      401: Problem,
    },
    summary: "Clear the authenticated user's search history",
  },

  // ── NLP search ──────────────────────────────────────────────────────────────

  nlpSearch: {
    method: 'POST',
    path: '/v1/search/nlp',
    headers: z.object({ authorization: z.string().optional() }),
    body: z.object({
      query: z.string().trim().min(1).max(300),
      /** lng,lat of the user */
      near: z
        .string()
        .regex(/^-?\d{1,3}(\.\d{1,15})?,-?\d{1,2}(\.\d{1,15})?$/)
        .optional(),
      city: CityId.optional(),
      lang: Locale.default('ar'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: z.object({
        parsedIntent: z.object({
          category: PlaceCategory.nullable(),
          nearLabel: z.string().nullable(),
          attributes: z.array(z.string()),
          confidence: z.number().min(0).max(1),
        }),
        items: z.array(SearchResultItem),
        total: z.number().int().nonnegative(),
        durationMs: z.number().int().nonnegative(),
      }),
      400: Problem,
      429: Problem,
    },
    summary: 'NLP-enhanced search — parses intent from Iraqi Arabic dialect',
  },

  // ── Personalised suggestions ─────────────────────────────────────────────

  suggestedSearches: {
    method: 'GET',
    path: '/v1/search/suggested',
    headers: z.object({ authorization: z.string() }),
    query: z.object({
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      limit: z.coerce.number().int().min(1).max(20).default(10),
    }),
    responses: {
      200: z.object({
        suggestions: z.array(
          z.object({
            query: z.string(),
            reason: z.enum(['history', 'location', 'trending', 'category']),
          }),
        ),
      }),
      401: Problem,
    },
    summary: 'Personalised search suggestions based on history + location',
  },

  // ── Autocomplete (multi-source) ──────────────────────────────────────────

  autocomplete: {
    method: 'GET',
    path: '/v1/search/autocomplete',
    query: z.object({
      q: z.string().trim().min(1).max(100),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      city: CityId.optional(),
      lang: Locale.default('ar'),
      limit: z.coerce.number().int().min(1).max(15).default(8),
    }),
    responses: {
      200: z.object({
        groups: z.array(
          z.object({
            groupKey: z.enum(['places', 'neighborhoods', 'categories', 'recent', 'trending']),
            items: z.array(
              z.object({
                text: z.string(),
                secondaryText: z.string().optional(),
                placeId: PlaceId.optional(),
                category: PlaceCategory.nullable().optional(),
                city: CityId.optional(),
                score: z.number().min(0).max(1),
              }),
            ),
          }),
        ),
        durationMs: z.number().int().nonnegative(),
      }),
      429: Problem,
    },
    summary: 'Multi-source autocomplete: places + neighborhoods + categories + history. Target <100ms.',
  },

  // ── Save search alert (notify on new matching places) ────────────────────

  saveAlert: {
    method: 'POST',
    path: '/v1/search/alerts',
    headers: z.object({ authorization: z.string() }),
    body: z.object({
      query: z.string().trim().min(1).max(200),
      filters: SearchFilters.partial().optional(),
    }),
    responses: {
      201: z.object({ alertId: z.string().uuid() }),
      400: Problem,
      401: Problem,
    },
    summary: 'Save a search as an alert — notifies user when new places match',
  },

  deleteAlert: {
    method: 'DELETE',
    path: '/v1/search/alerts/:alertId',
    headers: z.object({ authorization: z.string() }),
    pathParams: z.object({ alertId: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      401: Problem,
      404: Problem,
    },
    summary: 'Delete a saved search alert',
  },
});
