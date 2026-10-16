/**
 * Promotions & offers contracts.
 * Typed contracts for creating, browsing and redeeming promotions.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, LngLat, paginated, Problem, UserId } from './common';
import { ProviderId } from './providers';

const c = initContract();

// ── IDs ───────────────────────────────────────────────────────────────────────

export const PromotionId = z.string().uuid().brand<'PromotionId'>();
export type PromotionId = z.infer<typeof PromotionId>;

export const RedemptionId = z.string().uuid().brand<'RedemptionId'>();
export type RedemptionId = z.infer<typeof RedemptionId>;

// ── Enums ─────────────────────────────────────────────────────────────────────

export const PromotionType = z.enum([
  'percentage_discount',
  'fixed_discount',
  'buy_one_get_one',
  'free_item',
  'happy_hour',
  'first_visit',
]);
export type PromotionType = z.infer<typeof PromotionType>;

export const PromotionCategory = z.enum(['food', 'shopping', 'services', 'entertainment', 'other']);
export type PromotionCategory = z.infer<typeof PromotionCategory>;

export const PromotionStatus = z.enum(['active', 'expired', 'scheduled', 'deleted']);
export type PromotionStatus = z.infer<typeof PromotionStatus>;

// ── Day-of-week bitmask (Sun=0 … Sat=6) ──────────────────────────────────────

/** Each bit corresponds to a day: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
 *  0 = any day. */
export const DaysOfWeekMask = z.number().int().min(0).max(127);
export type DaysOfWeekMask = z.infer<typeof DaysOfWeekMask>;

// ── Text helper ────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();

// ── Promotion summary (list views) ────────────────────────────────────────────

export const PromotionSummary = z.object({
  id: PromotionId,
  providerId: ProviderId,
  providerNameAr: z.string(),
  providerNameEn: z.string().optional(),
  providerVerified: z.boolean(),
  type: PromotionType,
  category: PromotionCategory,
  titleAr: text(200),
  titleEn: text(200).optional(),
  discountValue: z.number().nonnegative().nullable(),
  /** Promo code — null when the promotion is auto-applied. */
  code: z.string().max(32).nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  /** Days of week bitmask. 0 = every day. */
  daysOfWeek: DaysOfWeekMask,
  /** 'HH:MM' or null if all day. */
  hoursFrom: z.string().nullable(),
  hoursTo: z.string().nullable(),
  isActive: z.boolean(),
  redeemedCount: z.number().int().nonnegative(),
  maxRedemptions: z.number().int().positive().nullable(),
  /** Provider location (for map view). */
  lngLat: LngLat.nullable(),
  /** Primary photo URL of the provider. */
  photoUrl: z.string().url().nullable(),
  isFeatured: z.boolean(),
  createdAt: z.string().datetime(),
});
export type PromotionSummary = z.infer<typeof PromotionSummary>;

// ── Promotion detail (single view) ────────────────────────────────────────────

export const PromotionDetail = PromotionSummary.extend({
  descriptionAr: text(1000).optional(),
  descriptionEn: text(1000).optional(),
  cityId: CityId,
});
export type PromotionDetail = z.infer<typeof PromotionDetail>;

/** Backward-compat alias used by ProviderPromotionsScreen */
export const Promotion = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  discountPct: z.number().nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  conditions: z.string().optional(),
  status: PromotionStatus,
  code: z.string().nullable().optional(),
  redeemedCount: z.number().int().nonnegative().optional(),
});
export type Promotion = z.infer<typeof Promotion>;

// ── Redemption stats ──────────────────────────────────────────────────────────

export const RedemptionStats = z.object({
  promotionId: PromotionId,
  totalRedemptions: z.number().int().nonnegative(),
  uniqueUsers: z.number().int().nonnegative(),
  /** Daily breakdown for the last 30 days: [{date: 'YYYY-MM-DD', count: n}] */
  dailyBreakdown: z.array(z.object({ date: z.string(), count: z.number().int().nonnegative() })),
  maxRedemptions: z.number().int().positive().nullable(),
  remainingRedemptions: z.number().int().nonnegative().nullable(),
});
export type RedemptionStats = z.infer<typeof RedemptionStats>;

// ── Request bodies ─────────────────────────────────────────────────────────────

export const CreatePromotionBody = z.object({
  type: PromotionType,
  category: PromotionCategory,
  titleAr: text(200),
  titleEn: optText(200),
  descriptionAr: optText(1000),
  descriptionEn: optText(1000),
  /** Required for percentage_discount (0..100) and fixed_discount (IQD amount). */
  discountValue: z.number().nonnegative().nullable().optional(),
  code: z.string().max(32).nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  daysOfWeek: DaysOfWeekMask.optional().default(0),
  hoursFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  hoursTo: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  cityId: CityId,
});
export type CreatePromotionBody = z.infer<typeof CreatePromotionBody>;

export const UpdatePromotionBody = CreatePromotionBody.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdatePromotionBody = z.infer<typeof UpdatePromotionBody>;

// ── Browse query ──────────────────────────────────────────────────────────────

export const BrowsePromotionsQuery = z.object({
  cityId: CityId,
  category: PromotionCategory.optional(),
  /** Filter to promotions valid right now. */
  activeNow: z.coerce.boolean().optional(),
  /** Filter to promotions ending within 24 h. */
  endingSoon: z.coerce.boolean().optional(),
  /** Nearby: require lngLat too. */
  nearbyKm: z.coerce.number().positive().max(50).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
export type BrowsePromotionsQuery = z.infer<typeof BrowsePromotionsQuery>;

// ── HTTP contract ─────────────────────────────────────────────────────────────

export const promotionsContract = c.router(
  {
    /** Browse active promotions (public). */
    browse: {
      method: 'GET',
      path: '/promotions',
      query: BrowsePromotionsQuery,
      responses: {
        200: paginated(PromotionSummary),
        400: Problem,
      },
    },

    /** Featured promotions for the Discover feed (public). */
    featured: {
      method: 'GET',
      path: '/promotions/featured',
      query: z.object({ cityId: CityId }),
      responses: {
        200: z.array(PromotionSummary),
        400: Problem,
      },
    },

    /** Single promotion detail (public). */
    get: {
      method: 'GET',
      path: '/promotions/:id',
      pathParams: z.object({ id: PromotionId }),
      responses: {
        200: PromotionDetail,
        404: Problem,
      },
    },

    /** Redeem a promotion (authenticated user). */
    redeem: {
      method: 'POST',
      path: '/promotions/:id/redeem',
      pathParams: z.object({ id: PromotionId }),
      body: z.object({ code: z.string().optional() }),
      responses: {
        200: z.object({ redemptionId: RedemptionId, message: z.string() }),
        400: Problem,
        404: Problem,
        409: Problem,
        429: Problem,
      },
    },

    // ── Provider-scoped endpoints (require provider auth) ─────────────────────

    /** List promotions owned by the authenticated provider. */
    listActive: {
      method: 'GET',
      path: '/provider/promotions',
      responses: {
        200: z.array(Promotion),
        401: Problem,
      },
    },

    /** Create a new promotion. */
    create: {
      method: 'POST',
      path: '/provider/promotions',
      body: CreatePromotionBody,
      responses: {
        201: Promotion,
        400: Problem,
        401: Problem,
        422: Problem,
      },
    },

    /** Update a promotion. */
    update: {
      method: 'PATCH',
      path: '/provider/promotions/:id',
      pathParams: z.object({ id: PromotionId }),
      body: UpdatePromotionBody,
      responses: {
        200: Promotion,
        400: Problem,
        401: Problem,
        403: Problem,
        404: Problem,
      },
    },

    /** Delete a promotion (soft-delete). */
    delete: {
      method: 'DELETE',
      path: '/provider/promotions/:id',
      pathParams: z.object({ id: PromotionId }),
      body: c.noBody(),
      responses: {
        204: c.noBody(),
        401: Problem,
        403: Problem,
        404: Problem,
      },
    },

    /** Redemption statistics for a promotion. */
    stats: {
      method: 'GET',
      path: '/provider/promotions/:id/stats',
      pathParams: z.object({ id: PromotionId }),
      responses: {
        200: RedemptionStats,
        401: Problem,
        403: Problem,
        404: Problem,
      },
    },
  },
  { pathPrefix: '/v1' },
);
