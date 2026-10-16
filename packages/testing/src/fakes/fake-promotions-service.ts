/**
 * FakePromotionsService — in-memory promotions system fake for testing.
 * Covers promotion creation, browsing, redemption, max-redemption enforcement,
 * expiry, happy-hour constraints, and stats.
 */

type UserId = string;
type PromotionId = string;
type RedemptionId = string;
type ProviderId = string;

export type PromotionType =
  | 'discount_percent'
  | 'discount_fixed'
  | 'buy_one_get_one'
  | 'free_item'
  | 'happy_hour'
  | 'loyalty_bonus';

export type PromotionStatus = 'active' | 'paused' | 'expired' | 'draft';

export interface HappyHourSchedule {
  /** Day of week 0–6 (0 = Sunday) */
  dayOfWeek: number;
  startHour: number; // 0–23
  endHour: number;   // 1–24 (exclusive)
}

export interface Promotion {
  id: PromotionId;
  providerId: ProviderId;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  type: PromotionType;
  discountPercent?: number;
  discountFixed?: number;
  code?: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  maxPerUser: number;
  status: PromotionStatus;
  cityId: string | null;
  happyHour: HappyHourSchedule | null;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Redemption {
  id: RedemptionId;
  promotionId: PromotionId;
  userId: UserId;
  redeemedAt: Date;
  pointsAwarded: number;
}

export interface PromotionStats {
  promotionId: PromotionId;
  totalRedemptions: number;
  uniqueUsers: number;
  remainingRedemptions: number | null;
  isActive: boolean;
  isExpired: boolean;
}

export interface CreatePromotionInput {
  providerId: ProviderId;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  type: PromotionType;
  discountPercent?: number;
  discountFixed?: number;
  code?: string;
  maxRedemptions?: number;
  maxPerUser?: number;
  cityId?: string;
  happyHour?: HappyHourSchedule;
  startsAt: Date;
  endsAt: Date;
}

export class FakePromotionsService {
  private readonly promotions = new Map<PromotionId, Promotion>();
  private readonly redemptions = new Map<RedemptionId, Redemption>();
  private promotionSeq = 0;
  private redemptionSeq = 0;

  // ─── Promotion management ─────────────────────────────────────────────────

  createPromotion(input: CreatePromotionInput): Promotion {
    if (input.endsAt <= input.startsAt) {
      throw Object.assign(new Error('endsAt must be after startsAt'), { code: 'INVALID_RANGE' });
    }
    if (input.type === 'discount_percent') {
      if (!input.discountPercent || input.discountPercent <= 0 || input.discountPercent > 100) {
        throw Object.assign(new Error('discountPercent must be 1–100'), { code: 'INVALID_DISCOUNT' });
      }
    }

    const id: PromotionId = `promo-${++this.promotionSeq}`;
    const now = new Date();
    const promotion: Promotion = {
      id,
      providerId: input.providerId,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr ?? '',
      descriptionEn: input.descriptionEn ?? '',
      type: input.type,
      discountPercent: input.discountPercent,
      discountFixed: input.discountFixed,
      code: input.code,
      maxRedemptions: input.maxRedemptions ?? null,
      redemptionCount: 0,
      maxPerUser: input.maxPerUser ?? 1,
      status: now >= input.startsAt && now < input.endsAt ? 'active' : 'draft',
      cityId: input.cityId ?? null,
      happyHour: input.happyHour ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: now,
      updatedAt: now,
    };
    this.promotions.set(id, promotion);
    return promotion;
  }

  getPromotion(promotionId: PromotionId): Promotion | null {
    return this.promotions.get(promotionId) ?? null;
  }

  listActivePromotions(opts: { cityId?: string; providerId?: string; limit?: number } = {}): Promotion[] {
    const { cityId, providerId, limit = 50 } = opts;
    const now = new Date();
    return [...this.promotions.values()]
      .filter((p) => p.status === 'active')
      .filter((p) => now >= p.startsAt && now < p.endsAt)
      .filter((p) => (cityId ? p.cityId === cityId || p.cityId === null : true))
      .filter((p) => (providerId ? p.providerId === providerId : true))
      .filter((p) => p.maxRedemptions === null || p.redemptionCount < p.maxRedemptions)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // ─── Redemption ───────────────────────────────────────────────────────────

  redeemPromotion(
    userId: UserId,
    promotionId: PromotionId,
    opts: { now?: Date } = {},
  ): Redemption {
    const now = opts.now ?? new Date();
    const promotion = this.promotions.get(promotionId);
    if (!promotion) throw Object.assign(new Error('Promotion not found'), { code: 'NOT_FOUND' });

    // Expiry check
    if (now >= promotion.endsAt) {
      throw Object.assign(new Error('Promotion has expired'), { code: 'PROMOTION_EXPIRED' });
    }
    if (now < promotion.startsAt) {
      throw Object.assign(new Error('Promotion has not started yet'), { code: 'NOT_STARTED' });
    }
    if (promotion.status !== 'active') {
      throw Object.assign(
        new Error(`Promotion is not active: ${promotion.status}`),
        { code: 'PROMOTION_NOT_ACTIVE' },
      );
    }

    // Happy hour check
    if (promotion.happyHour) {
      const { dayOfWeek, startHour, endHour } = promotion.happyHour;
      const day = now.getDay();
      const hour = now.getHours();
      if (day !== dayOfWeek || hour < startHour || hour >= endHour) {
        throw Object.assign(
          new Error(`Promotion only available on day ${dayOfWeek} between ${startHour}:00–${endHour}:00`),
          { code: 'OUTSIDE_HAPPY_HOUR' },
        );
      }
    }

    // Max redemptions check (global)
    if (promotion.maxRedemptions !== null && promotion.redemptionCount >= promotion.maxRedemptions) {
      throw Object.assign(new Error('Promotion has reached max redemptions'), { code: 'MAX_REDEMPTIONS_REACHED' });
    }

    // Per-user max check
    const userRedemptionCount = [...this.redemptions.values()].filter(
      (r) => r.promotionId === promotionId && r.userId === userId,
    ).length;
    if (userRedemptionCount >= promotion.maxPerUser) {
      throw Object.assign(
        new Error(`You have already redeemed this promotion ${promotion.maxPerUser} time(s)`),
        { code: 'USER_MAX_REDEMPTIONS_REACHED' },
      );
    }

    const id: RedemptionId = `redemption-${++this.redemptionSeq}`;
    const redemption: Redemption = {
      id,
      promotionId,
      userId,
      redeemedAt: now,
      pointsAwarded: this.calculatePoints(promotion),
    };
    this.redemptions.set(id, redemption);

    // Increment count on promotion
    const updated: Promotion = {
      ...promotion,
      redemptionCount: promotion.redemptionCount + 1,
      updatedAt: now,
    };
    this.promotions.set(promotionId, updated);

    return redemption;
  }

  getUserRedemptions(
    userId: UserId,
    opts: { promotionId?: string; limit?: number } = {},
  ): Redemption[] {
    const { promotionId, limit = 50 } = opts;
    return [...this.redemptions.values()]
      .filter((r) => r.userId === userId)
      .filter((r) => (promotionId ? r.promotionId === promotionId : true))
      .sort((a, b) => b.redeemedAt.getTime() - a.redeemedAt.getTime())
      .slice(0, limit);
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────

  getPromotionStats(promotionId: PromotionId, now = new Date()): PromotionStats {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) throw Object.assign(new Error('Promotion not found'), { code: 'NOT_FOUND' });

    const promoRedemptions = [...this.redemptions.values()].filter(
      (r) => r.promotionId === promotionId,
    );
    const uniqueUsers = new Set(promoRedemptions.map((r) => r.userId)).size;

    return {
      promotionId,
      totalRedemptions: promotion.redemptionCount,
      uniqueUsers,
      remainingRedemptions:
        promotion.maxRedemptions !== null
          ? Math.max(0, promotion.maxRedemptions - promotion.redemptionCount)
          : null,
      isActive: promotion.status === 'active' && now >= promotion.startsAt && now < promotion.endsAt,
      isExpired: now >= promotion.endsAt,
    };
  }

  getProviderStats(providerId: ProviderId): {
    totalPromotions: number;
    activePromotions: number;
    totalRedemptions: number;
    topPromotion: Promotion | null;
  } {
    const providerPromos = [...this.promotions.values()].filter(
      (p) => p.providerId === providerId,
    );
    const now = new Date();
    const activePromos = providerPromos.filter(
      (p) => p.status === 'active' && now < p.endsAt,
    );
    const top = providerPromos.reduce(
      (best: Promotion | null, p) => (best === null || p.redemptionCount > best.redemptionCount ? p : best),
      null,
    );

    return {
      totalPromotions: providerPromos.length,
      activePromotions: activePromos.length,
      totalRedemptions: providerPromos.reduce((sum, p) => sum + p.redemptionCount, 0),
      topPromotion: top,
    };
  }

  // ─── Happy-hour helpers ───────────────────────────────────────────────────

  isHappyHourActive(promotionId: PromotionId, now = new Date()): boolean {
    const promotion = this.promotions.get(promotionId);
    if (!promotion || !promotion.happyHour) return true; // no restriction → always OK
    const { dayOfWeek, startHour, endHour } = promotion.happyHour;
    return now.getDay() === dayOfWeek && now.getHours() >= startHour && now.getHours() < endHour;
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  pausePromotion(promotionId: PromotionId): Promotion {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    const updated = { ...promotion, status: 'paused' as PromotionStatus, updatedAt: new Date() };
    this.promotions.set(promotionId, updated);
    return updated;
  }

  resumePromotion(promotionId: PromotionId): Promotion {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    const updated = { ...promotion, status: 'active' as PromotionStatus, updatedAt: new Date() };
    this.promotions.set(promotionId, updated);
    return updated;
  }

  expirePromotion(promotionId: PromotionId): Promotion {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    const updated = { ...promotion, status: 'expired' as PromotionStatus, updatedAt: new Date() };
    this.promotions.set(promotionId, updated);
    return updated;
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private calculatePoints(promotion: Promotion): number {
    switch (promotion.type) {
      case 'discount_percent': return Math.round((promotion.discountPercent ?? 10) / 10) * 5;
      case 'discount_fixed': return 10;
      case 'buy_one_get_one': return 20;
      case 'free_item': return 15;
      case 'happy_hour': return 25;
      case 'loyalty_bonus': return 30;
      default: return 5;
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  reset(): void {
    this.promotions.clear();
    this.redemptions.clear();
    this.promotionSeq = 0;
    this.redemptionSeq = 0;
  }

  // ─── Introspection ────────────────────────────────────────────────────────

  get allPromotions(): Promotion[] {
    return [...this.promotions.values()];
  }

  get allRedemptions(): Redemption[] {
    return [...this.redemptions.values()];
  }
}
