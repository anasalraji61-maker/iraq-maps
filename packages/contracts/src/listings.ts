/**
 * Listings & marketplace contracts.
 * Frozen after M-listings milestone.
 *
 * NOTE: `ProvListingId`, `ProvListingType`, `ProvListingCategory` are renamed
 * from `ListingId`, `ListingType`, `ListingCategory` to avoid conflicts with
 * the same-named exports in social.ts.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, LngLat, paginated, Problem } from './common';
import { ProviderId } from './providers';

const c = initContract();

// ── IDs ──────────────────────────────────────────────────────────────────────

export const ProvListingId = z.string().uuid().brand<'ProvListingId'>();
export type ProvListingId = z.infer<typeof ProvListingId>;

export const ListingCategoryId = z.string().uuid().brand<'ListingCategoryId'>();
export type ListingCategoryId = z.infer<typeof ListingCategoryId>;

// ── Enums ─────────────────────────────────────────────────────────────────────

/** The kind of thing being listed. */
export const ProvListingType = z.enum(['product', 'service', 'food_item', 'rental', 'package']);
export type ProvListingType = z.infer<typeof ProvListingType>;

export const ListingSortMode = z.enum(['newest', 'price_asc', 'price_desc', 'popularity']);
export type ListingSortMode = z.infer<typeof ListingSortMode>;

// ── Shared text helper ────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}]*$/u);

// ── Category ──────────────────────────────────────────────────────────────────

export const ProvListingCategory = z.object({
  id: ListingCategoryId,
  nameAr: text(120),
  nameEn: text(120),
  icon: z.string().max(10), // emoji or icon key
  parentId: ListingCategoryId.nullable(),
  slug: z.string().max(80).regex(/^[a-z0-9-]+$/),
});
export type ProvListingCategory = z.infer<typeof ProvListingCategory>;

// ── Listing summary (list views) ──────────────────────────────────────────────

export const ListingSummary = z.object({
  id: ProvListingId,
  providerId: ProviderId,
  providerName: text(200),
  providerVerified: z.boolean(),
  type: ProvListingType,
  titleAr: text(200),
  titleEn: text(200),
  priceIqd: z.number().int().nonnegative(),
  /** First photo URL (signed, short-lived). Null when no photos. */
  coverPhotoUrl: z.string().url().nullable(),
  category: ProvListingCategory.pick({ id: true, nameAr: true, nameEn: true, icon: true }),
  isAvailable: z.boolean(),
  deliveryAvailable: z.boolean(),
  cityId: CityId,
  viewCount: z.number().int().nonnegative(),
  inquiryCount: z.number().int().nonnegative(),
  isFeatured: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ListingSummary = z.infer<typeof ListingSummary>;

// ── Listing detail (single listing view) ─────────────────────────────────────

export const ListingDetail = ListingSummary.extend({
  descriptionAr: z.string().max(3000),
  descriptionEn: z.string().max(3000),
  /** Up to 8 signed URLs. */
  photoUrls: z.array(z.string().url()).max(8),
  location: LngLat.nullable(),
  deliveryNotes: z.string().max(500).nullable(),
  /** Provider's average response time in hours. */
  avgResponseHours: z.number().int().positive().nullable(),
});
export type ListingDetail = z.infer<typeof ListingDetail>;

// ── Write payloads ────────────────────────────────────────────────────────────

export const CreateListingBody = z.object({
  type: ProvListingType,
  titleAr: text(200),
  titleEn: text(200),
  descriptionAr: z.string().max(3000).default(''),
  descriptionEn: z.string().max(3000).default(''),
  priceIqd: z.number().int().nonnegative(),
  categoryId: ListingCategoryId,
  isAvailable: z.boolean().default(true),
  deliveryAvailable: z.boolean().default(false),
  deliveryNotes: z.string().max(500).optional(),
  cityId: CityId,
  location: LngLat.optional(),
  /** Asset IDs already uploaded via media module. Max 8. */
  photoAssetIds: z.array(z.string().uuid()).max(8).default([]),
});
export type CreateListingBody = z.infer<typeof CreateListingBody>;

export const UpdateListingBody = CreateListingBody.partial();
export type UpdateListingBody = z.infer<typeof UpdateListingBody>;

// ── Browse / search filters ───────────────────────────────────────────────────

export const ListingFilters = z.object({
  categoryId: ListingCategoryId.optional(),
  type: ProvListingType.optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
  cityId: CityId.optional(),
  inStock: z.coerce.boolean().optional(),
  hasDelivery: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  sort: ListingSortMode.optional().default('newest'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListingFilters = z.infer<typeof ListingFilters>;

export const SearchListingsQuery = ListingFilters.extend({
  q: z.string().trim().min(1).max(200),
});
export type SearchListingsQuery = z.infer<typeof SearchListingsQuery>;

// ── Per-listing analytics (provider view) ────────────────────────────────────

export const ListingAnalytics = z.object({
  listingId: ProvListingId,
  viewsTotal: z.number().int().nonnegative(),
  viewsLast7d: z.number().int().nonnegative(),
  inquiriesTotal: z.number().int().nonnegative(),
  inquiriesLast7d: z.number().int().nonnegative(),
  /** Daily view counts for last 7 days, oldest first. */
  viewsByDay: z.array(z.number().int().nonnegative()).length(7),
});
export type ListingAnalytics = z.infer<typeof ListingAnalytics>;

// ── HTTP contract ─────────────────────────────────────────────────────────────

export const listingsContract = c.router({
  // ── Public / buyer ──────────────────────────────────────────────────────────

  /** Browse the marketplace with optional filters and pagination. */
  browse: {
    method: 'GET',
    path: '/listings',
    query: ListingFilters,
    responses: {
      200: paginated(ListingSummary),
      400: Problem,
    },
  },

  /** Full-text search across listing titles and descriptions. */
  search: {
    method: 'GET',
    path: '/listings/search',
    query: SearchListingsQuery,
    responses: {
      200: paginated(ListingSummary),
      400: Problem,
    },
  },

  /** Featured listings for a city (admin-curated). */
  featured: {
    method: 'GET',
    path: '/listings/featured',
    query: z.object({ cityId: CityId }),
    responses: {
      200: z.object({ items: z.array(ListingSummary) }),
      400: Problem,
    },
  },

  /** Browse by category (one level). */
  byCategory: {
    method: 'GET',
    path: '/listings/category/:categoryId',
    pathParams: z.object({ categoryId: ListingCategoryId }),
    query: z.object({
      cityId: CityId.optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      sort: ListingSortMode.optional().default('newest'),
    }),
    responses: {
      200: paginated(ListingSummary),
      404: Problem,
    },
  },

  /** Get single listing detail. */
  get: {
    method: 'GET',
    path: '/listings/:id',
    pathParams: z.object({ id: ProvListingId }),
    responses: {
      200: ListingDetail,
      404: Problem,
    },
  },

  /** All available categories (tree). */
  categories: {
    method: 'GET',
    path: '/listings/categories',
    responses: {
      200: z.object({ items: z.array(ProvListingCategory) }),
    },
  },

  // ── Provider (requires auth + provider role) ─────────────────────────────

  /** Create a new listing for the authenticated provider. */
  create: {
    method: 'POST',
    path: '/provider/listings',
    body: CreateListingBody,
    responses: {
      201: ListingDetail,
      400: Problem,
      403: Problem,
    },
  },

  /** Update an existing listing owned by the authenticated provider. */
  update: {
    method: 'PATCH',
    path: '/provider/listings/:id',
    pathParams: z.object({ id: ProvListingId }),
    body: UpdateListingBody,
    responses: {
      200: ListingDetail,
      400: Problem,
      403: Problem,
      404: Problem,
    },
  },

  /** Soft-delete a listing. */
  delete: {
    method: 'DELETE',
    path: '/provider/listings/:id',
    pathParams: z.object({ id: ProvListingId }),
    body: z.object({}),
    responses: {
      204: z.void(),
      403: Problem,
      404: Problem,
    },
  },

  /** Get all listings owned by the authenticated provider. */
  myListings: {
    method: 'GET',
    path: '/provider/listings',
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: paginated(ListingSummary),
      403: Problem,
    },
  },

  /** Toggle in-stock / out-of-stock without a full update. */
  toggleAvailability: {
    method: 'POST',
    path: '/provider/listings/:id/availability',
    pathParams: z.object({ id: ProvListingId }),
    body: z.object({}),
    responses: {
      200: z.object({ isAvailable: z.boolean() }),
      403: Problem,
      404: Problem,
    },
  },

  /** Per-listing view + inquiry analytics. */
  analytics: {
    method: 'GET',
    path: '/provider/listings/:id/analytics',
    pathParams: z.object({ id: ProvListingId }),
    responses: {
      200: ListingAnalytics,
      403: Problem,
      404: Problem,
    },
  },
});

export type ListingsContract = typeof listingsContract;
