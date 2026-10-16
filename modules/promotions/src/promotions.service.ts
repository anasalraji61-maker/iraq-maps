/**
 * PromotionsService — all business logic for provider promotions and offers.
 *
 * Responsibilities:
 *  - CRUD for promotions (scoped to providerId for writes)
 *  - Browse active promotions by city / category / location
 *  - Featured promotions for the Discover feed
 *  - Single-promotion detail
 *  - Redemption with code verification and limits
 *  - Redemption statistics per promotion
 *  - Auto-deactivation of expired promotions
 *
 * Data rules:
 *  - Writes are always scoped to providerId; no promotion is mutated by a different provider.
 *  - Soft-delete: is_deleted = true; all queries filter WHERE NOT is_deleted.
 *  - Provider display name / verified status are denormalised via ProviderSummaryPort.
 *    If the port is not injected, stubs are used so the module stays independently deployable.
 *  - Expired promotions (valid_to < NOW()) are auto-deactivated on read through
 *    maybeDeactivateExpired(), which runs at most once per 60 seconds per process.
 */

import type { Db } from '@iraq-maps/db-kit';
import {
  type BrowsePromotionsQuery,
  type CityId,
  type CreatePromotionBody,
  type Promotion,
  type PromotionDetail,
  type PromotionId,
  type PromotionSummary,
  type ProviderId,
  type RedemptionStats,
  type UpdatePromotionBody,
  type UserId,
} from '@iraq-maps/contracts';
import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { promotionTable, redemptionTable, type PromotionRow } from './schema';

// ── Optional ports ─────────────────────────────────────────────────────────────

export interface ProviderSummaryPort {
  getSummary(
    providerId: string,
  ): Promise<{ nameAr: string; nameEn?: string; verified: boolean; lngLat: [number, number] | null; photoUrl: string | null } | null>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const FEATURED_LIMIT = 10;
const DEACTIVATE_INTERVAL_MS = 60_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPromotionId(raw: string): PromotionId {
  return raw as unknown as PromotionId;
}

function toProviderId(raw: string): ProviderId {
  return raw as unknown as ProviderId;
}

function toCityId(raw: string): CityId {
  return raw as unknown as CityId;
}

function toUserId(raw: string): UserId {
  return raw as unknown as UserId;
}

/** Map a DB row + provider data to a PromotionSummary. */
function rowToSummary(
  row: PromotionRow,
  provider: { nameAr: string; nameEn?: string; verified: boolean; lngLat: [number, number] | null; photoUrl: string | null } | null,
): PromotionSummary {
  return {
    id: toPromotionId(row.id),
    providerId: toProviderId(row.providerId),
    providerNameAr: provider?.nameAr ?? 'مزوّد',
    providerNameEn: provider?.nameEn,
    providerVerified: provider?.verified ?? false,
    type: row.type,
    category: row.category,
    titleAr: row.titleAr,
    titleEn: row.titleEn ?? undefined,
    discountValue: row.discountValue != null ? Number(row.discountValue) : null,
    code: row.code,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo.toISOString(),
    daysOfWeek: row.daysOfWeek,
    hoursFrom: row.hoursFrom,
    hoursTo: row.hoursTo,
    isActive: row.isActive,
    redeemedCount: row.redeemedCount,
    maxRedemptions: row.maxRedemptions,
    lngLat: provider?.lngLat ?? null,
    photoUrl: provider?.photoUrl ?? null,
    isFeatured: row.isFeatured,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Map a DB row to the legacy Promotion shape expected by ProviderPromotionsScreen. */
function rowToLegacy(row: PromotionRow): Promotion {
  const now = new Date();
  let status: 'active' | 'expired' | 'deleted' = 'active';
  if (row.isDeleted) status = 'deleted';
  else if (row.validTo < now || !row.isActive) status = 'expired';

  return {
    id: row.id,
    title: row.titleAr,
    description: row.descriptionAr ?? undefined,
    discountPct: row.type === 'percentage_discount' && row.discountValue != null ? Number(row.discountValue) : null,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo.toISOString(),
    conditions: undefined,
    status,
    code: row.code ?? null,
    redeemedCount: row.redeemedCount,
  };
}

/** Check whether a promotion is valid right now given days-of-week bitmask and hours. */
function isValidNow(row: Pick<PromotionRow, 'daysOfWeek' | 'hoursFrom' | 'hoursTo'>): boolean {
  const now = new Date();

  // Check day-of-week bitmask (0 = any day).
  if (row.daysOfWeek !== 0) {
    const dayBit = 1 << now.getDay(); // Sun=1, Mon=2, …
    if ((row.daysOfWeek & dayBit) === 0) return false;
  }

  // Check hours window.
  if (row.hoursFrom && row.hoursTo) {
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (hhmm < row.hoursFrom || hhmm >= row.hoursTo) return false;
  }

  return true;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class PromotionsService {
  private lastDeactivatedAt = 0;

  constructor(
    private readonly db: Db,
    private readonly providerSummary?: ProviderSummaryPort,
  ) {}

  // ── Housekeeping ─────────────────────────────────────────────────────────────

  /**
   * Auto-deactivate expired promotions at most once per 60 s to avoid per-request overhead.
   * Returns the number of rows updated (0 when skipped due to rate-limit).
   */
  async maybeDeactivateExpired(): Promise<number> {
    if (Date.now() - this.lastDeactivatedAt < DEACTIVATE_INTERVAL_MS) return 0;
    this.lastDeactivatedAt = Date.now();

    const result = await this.db
      .update(promotionTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(promotionTable.isActive, true),
          eq(promotionTable.isDeleted, false),
          lte(promotionTable.validTo, new Date()),
        ),
      )
      .returning({ id: promotionTable.id });

    return result.length;
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  async createPromotion(providerId: string, data: CreatePromotionBody): Promise<Promotion> {
    const now = new Date();
    if (new Date(data.validTo) <= new Date(data.validFrom)) {
      throw Object.assign(new Error('valid_to must be after valid_from'), { code: 'INVALID_DATE_RANGE', status: 422 });
    }
    if (new Date(data.validTo) <= now) {
      throw Object.assign(new Error('Promotion is already expired'), { code: 'PROMOTION_EXPIRED', status: 422 });
    }

    const [row] = await this.db
      .insert(promotionTable)
      .values({
        providerId,
        cityId: data.cityId,
        type: data.type,
        category: data.category,
        titleAr: data.titleAr,
        titleEn: data.titleEn ?? null,
        descriptionAr: data.descriptionAr ?? null,
        descriptionEn: data.descriptionEn ?? null,
        discountValue: data.discountValue != null ? String(data.discountValue) : null,
        code: data.code ?? null,
        maxRedemptions: data.maxRedemptions ?? null,
        validFrom: new Date(data.validFrom),
        validTo: new Date(data.validTo),
        daysOfWeek: data.daysOfWeek ?? 0,
        hoursFrom: data.hoursFrom ?? null,
        hoursTo: data.hoursTo ?? null,
        isActive: true,
      })
      .returning();

    if (!row) throw new Error('Insert returned no row');
    return rowToLegacy(row);
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  async updatePromotion(providerId: string, promoId: string, data: UpdatePromotionBody): Promise<Promotion> {
    const existing = await this.db
      .select()
      .from(promotionTable)
      .where(and(eq(promotionTable.id, promoId), eq(promotionTable.isDeleted, false)))
      .then((rows) => rows[0] ?? null);

    if (!existing) throw Object.assign(new Error('Promotion not found'), { code: 'NOT_FOUND', status: 404 });
    if (existing.providerId !== providerId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 });
    }

    const patch: Partial<typeof promotionTable.$inferInsert> = { updatedAt: new Date() };

    if (data.titleAr !== undefined) patch.titleAr = data.titleAr;
    if (data.titleEn !== undefined) patch.titleEn = data.titleEn ?? null;
    if (data.descriptionAr !== undefined) patch.descriptionAr = data.descriptionAr ?? null;
    if (data.descriptionEn !== undefined) patch.descriptionEn = data.descriptionEn ?? null;
    if (data.type !== undefined) patch.type = data.type;
    if (data.category !== undefined) patch.category = data.category;
    if (data.discountValue !== undefined) patch.discountValue = data.discountValue != null ? String(data.discountValue) : null;
    if (data.code !== undefined) patch.code = data.code ?? null;
    if (data.maxRedemptions !== undefined) patch.maxRedemptions = data.maxRedemptions ?? null;
    if (data.validFrom !== undefined) patch.validFrom = new Date(data.validFrom);
    if (data.validTo !== undefined) patch.validTo = new Date(data.validTo);
    if (data.daysOfWeek !== undefined) patch.daysOfWeek = data.daysOfWeek;
    if (data.hoursFrom !== undefined) patch.hoursFrom = data.hoursFrom ?? null;
    if (data.hoursTo !== undefined) patch.hoursTo = data.hoursTo ?? null;
    if (data.isActive !== undefined) patch.isActive = data.isActive;

    if (patch.validFrom && patch.validTo && patch.validTo <= patch.validFrom) {
      throw Object.assign(new Error('valid_to must be after valid_from'), { code: 'INVALID_DATE_RANGE', status: 422 });
    }

    const [updated] = await this.db
      .update(promotionTable)
      .set(patch)
      .where(eq(promotionTable.id, promoId))
      .returning();

    if (!updated) throw new Error('Update returned no row');
    return rowToLegacy(updated);
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async deletePromotion(providerId: string, promoId: string): Promise<void> {
    const existing = await this.db
      .select({ ownerId: promotionTable.providerId })
      .from(promotionTable)
      .where(and(eq(promotionTable.id, promoId), eq(promotionTable.isDeleted, false)))
      .then((rows) => rows[0] ?? null);

    if (!existing) throw Object.assign(new Error('Promotion not found'), { code: 'NOT_FOUND', status: 404 });
    if (existing.ownerId !== providerId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 });
    }

    await this.db
      .update(promotionTable)
      .set({ isDeleted: true, isActive: false, updatedAt: new Date() })
      .where(eq(promotionTable.id, promoId));
  }

  // ── Browse ────────────────────────────────────────────────────────────────────

  async getActivePromotions(
    query: BrowsePromotionsQuery,
  ): Promise<{ items: PromotionSummary[]; nextCursor: string | null }> {
    await this.maybeDeactivateExpired();

    const limit = Math.min(query.limit ?? PAGE_DEFAULT, PAGE_MAX);
    const now = new Date();

    const conditions = [
      eq(promotionTable.cityId, query.cityId),
      eq(promotionTable.isActive, true),
      eq(promotionTable.isDeleted, false),
      lte(promotionTable.validFrom, now),
      gte(promotionTable.validTo, now),
    ];

    if (query.category) {
      conditions.push(eq(promotionTable.category, query.category));
    }

    if (query.endingSoon) {
      const in24h = new Date(now.getTime() + 86_400_000);
      conditions.push(lte(promotionTable.validTo, in24h));
    }

    if (query.cursor) {
      conditions.push(lte(promotionTable.createdAt, new Date(Buffer.from(query.cursor, 'base64').toString())));
    }

    const rows = await this.db
      .select()
      .from(promotionTable)
      .where(and(...conditions))
      .orderBy(desc(promotionTable.isFeatured), desc(promotionTable.createdAt))
      .limit(limit + 1);

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      if (last) nextCursor = Buffer.from(last.createdAt.toISOString()).toString('base64');
    }

    const items = await this.enrichRows(rows, query.nearbyKm, query.lat, query.lng);
    return { items, nextCursor };
  }

  // ── Provider's own promotions ─────────────────────────────────────────────────

  async getProviderPromotions(providerId: string): Promise<Promotion[]> {
    await this.maybeDeactivateExpired();

    const rows = await this.db
      .select()
      .from(promotionTable)
      .where(and(eq(promotionTable.providerId, providerId), eq(promotionTable.isDeleted, false)))
      .orderBy(desc(promotionTable.createdAt));

    return rows.map(rowToLegacy);
  }

  // ── Single promotion ──────────────────────────────────────────────────────────

  async getPromotion(promoId: string): Promise<PromotionDetail | null> {
    await this.maybeDeactivateExpired();

    const row = await this.db
      .select()
      .from(promotionTable)
      .where(and(eq(promotionTable.id, promoId), eq(promotionTable.isDeleted, false)))
      .then((rows) => rows[0] ?? null);

    if (!row) return null;

    const provider = await this.providerSummary?.getSummary(row.providerId) ?? null;
    const summary = rowToSummary(row, provider);

    return {
      ...summary,
      descriptionAr: row.descriptionAr ?? undefined,
      descriptionEn: row.descriptionEn ?? undefined,
      cityId: toCityId(row.cityId),
    };
  }

  // ── Redeem ────────────────────────────────────────────────────────────────────

  async redeemPromotion(
    userId: string,
    promoId: string,
    code?: string,
  ): Promise<{ redemptionId: string; message: string }> {
    const row = await this.db
      .select()
      .from(promotionTable)
      .where(and(eq(promotionTable.id, promoId), eq(promotionTable.isDeleted, false)))
      .then((rows) => rows[0] ?? null);

    if (!row) throw Object.assign(new Error('Promotion not found'), { code: 'NOT_FOUND', status: 404 });

    const now = new Date();
    if (!row.isActive || row.validTo < now) {
      throw Object.assign(new Error('Promotion is no longer active'), { code: 'PROMOTION_INACTIVE', status: 409 });
    }
    if (row.validFrom > now) {
      throw Object.assign(new Error('Promotion has not started yet'), { code: 'PROMOTION_NOT_STARTED', status: 409 });
    }

    // Code check.
    if (row.code && row.code !== code) {
      throw Object.assign(new Error('Invalid promo code'), { code: 'INVALID_CODE', status: 400 });
    }

    // Redemption limit check.
    if (row.maxRedemptions !== null && row.redeemedCount >= row.maxRedemptions) {
      throw Object.assign(new Error('Promotion has reached its redemption limit'), { code: 'REDEMPTION_LIMIT_REACHED', status: 409 });
    }

    // Check days / hours.
    if (!isValidNow(row)) {
      throw Object.assign(new Error('Promotion is not valid at this time'), { code: 'PROMOTION_OUT_OF_HOURS', status: 409 });
    }

    // Idempotency: check existing redemption.
    const existing = await this.db
      .select({ id: redemptionTable.id })
      .from(redemptionTable)
      .where(and(eq(redemptionTable.userId, userId), eq(redemptionTable.promotionId, promoId)))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      throw Object.assign(new Error('Already redeemed'), { code: 'ALREADY_REDEEMED', status: 409 });
    }

    // Insert redemption — trigger increments redeemed_count.
    const [redemption] = await this.db
      .insert(redemptionTable)
      .values({ userId, promotionId: promoId })
      .returning({ id: redemptionTable.id });

    if (!redemption) throw new Error('Redemption insert returned no row');

    return {
      redemptionId: redemption.id,
      message: 'تم الاسترداد بنجاح',
    };
  }

  // ── Redemption stats ──────────────────────────────────────────────────────────

  async getRedemptionStats(promoId: string, providerId: string): Promise<RedemptionStats> {
    const row = await this.db
      .select()
      .from(promotionTable)
      .where(and(eq(promotionTable.id, promoId), eq(promotionTable.isDeleted, false)))
      .then((rows) => rows[0] ?? null);

    if (!row) throw Object.assign(new Error('Promotion not found'), { code: 'NOT_FOUND', status: 404 });
    if (row.providerId !== providerId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 });
    }

    const since30d = new Date(Date.now() - 30 * 86_400_000);

    const [totals] = await this.db
      .select({
        totalRedemptions: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct user_id)::int`,
      })
      .from(redemptionTable)
      .where(eq(redemptionTable.promotionId, promoId));

    const daily = await this.db
      .select({
        date: sql<string>`date_trunc('day', redeemed_at)::date::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(redemptionTable)
      .where(and(eq(redemptionTable.promotionId, promoId), gte(redemptionTable.redeemedAt, since30d)))
      .groupBy(sql`date_trunc('day', redeemed_at)`)
      .orderBy(sql`date_trunc('day', redeemed_at)`);

    const remaining =
      row.maxRedemptions !== null
        ? Math.max(0, row.maxRedemptions - row.redeemedCount)
        : null;

    return {
      promotionId: toPromotionId(promoId),
      totalRedemptions: totals?.totalRedemptions ?? 0,
      uniqueUsers: totals?.uniqueUsers ?? 0,
      dailyBreakdown: daily.map((d) => ({ date: d.date, count: d.count })),
      maxRedemptions: row.maxRedemptions,
      remainingRedemptions: remaining,
    };
  }

  // ── Featured promotions ───────────────────────────────────────────────────────

  async getFeaturedPromotions(cityId: string): Promise<PromotionSummary[]> {
    await this.maybeDeactivateExpired();

    const now = new Date();
    const rows = await this.db
      .select()
      .from(promotionTable)
      .where(
        and(
          eq(promotionTable.cityId, cityId),
          eq(promotionTable.isActive, true),
          eq(promotionTable.isFeatured, true),
          eq(promotionTable.isDeleted, false),
          lte(promotionTable.validFrom, now),
          gte(promotionTable.validTo, now),
        ),
      )
      .orderBy(desc(promotionTable.createdAt))
      .limit(FEATURED_LIMIT);

    return this.enrichRows(rows);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  /**
   * Enrich a batch of rows with provider data.
   * Optional proximity filter: only include rows whose provider lngLat is within nearbyKm.
   */
  private async enrichRows(
    rows: PromotionRow[],
    nearbyKm?: number,
    lat?: number,
    lng?: number,
  ): Promise<PromotionSummary[]> {
    if (rows.length === 0) return [];

    const uniqueProviderIds = [...new Set(rows.map((r) => r.providerId))];
    const providerMap = new Map<string, {
      nameAr: string; nameEn?: string; verified: boolean;
      lngLat: [number, number] | null; photoUrl: string | null;
    }>();

    if (this.providerSummary) {
      await Promise.all(
        uniqueProviderIds.map(async (pid) => {
          const summary = await this.providerSummary!.getSummary(pid);
          if (summary) providerMap.set(pid, summary);
        }),
      );
    }

    const summaries: PromotionSummary[] = [];
    for (const row of rows) {
      const provider = providerMap.get(row.providerId) ?? null;

      // Optional proximity filter.
      if (nearbyKm !== undefined && lat !== undefined && lng !== undefined && provider?.lngLat) {
        const [pLng, pLat] = provider.lngLat;
        const dist = haversineKm(lat, lng, pLat, pLng);
        if (dist > nearbyKm) continue;
      }

      summaries.push(rowToSummary(row, provider));
    }
    return summaries;
  }
}

// ── Haversine distance ────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
