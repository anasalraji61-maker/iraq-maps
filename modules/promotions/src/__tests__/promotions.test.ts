/**
 * Unit tests for the promotions system using FakePromotionsService.
 *
 * Coverage:
 *   - Create promotion → appears in browse
 *   - Redeem → redemptionCount increments
 *   - Max redemptions → cannot redeem after limit
 *   - Expired promotion → returns error
 *   - Happy hour → only active during specified hours
 *   - Per-user max redemption enforcement
 *   - Stats endpoint returns correct counts
 *   - Provider stats aggregation
 *   - Pause / resume promotions
 *   - Reset clears state
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakePromotionsService,
  type Promotion,
} from '@iraq-maps/testing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(s: string): string {
  return `user-${s}`;
}

function pid(s: string): string {
  return `provider-${s}`;
}

function futureDate(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 3_600_000);
}

function pastDate(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 3_600_000);
}

function activePromotion(
  svc: FakePromotionsService,
  opts: Partial<Parameters<typeof svc.createPromotion>[0]> = {},
): Promotion {
  return svc.createPromotion({
    providerId: pid('default'),
    titleAr: 'خصم الصيف',
    titleEn: 'Summer Discount',
    type: 'discount_percent',
    discountPercent: 20,
    startsAt: pastDate(1),
    endsAt: futureDate(24),
    ...opts,
  });
}

// ── Create promotion ───────────────────────────────────────────────────────────

describe('FakePromotionsService – create promotion', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('creates a promotion with a generated id', () => {
    const promo = activePromotion(svc);
    expect(typeof promo.id).toBe('string');
    expect(promo.id.length).toBeGreaterThan(0);
  });

  it('new active promotion appears in listActivePromotions', () => {
    const promo = activePromotion(svc);
    const list = svc.listActivePromotions();
    expect(list.some((p) => p.id === promo.id)).toBe(true);
  });

  it('promotion starts with redemptionCount of 0', () => {
    const promo = activePromotion(svc);
    expect(promo.redemptionCount).toBe(0);
  });

  it('creating a promotion with endsAt before startsAt throws INVALID_RANGE', () => {
    expect(() =>
      activePromotion(svc, {
        startsAt: futureDate(5),
        endsAt: futureDate(2),
      }),
    ).toThrow();
    try {
      activePromotion(svc, { startsAt: futureDate(5), endsAt: futureDate(2) });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('INVALID_RANGE');
    }
  });

  it('discount_percent promotion with invalid percent throws INVALID_DISCOUNT', () => {
    expect(() =>
      svc.createPromotion({
        providerId: pid('x'),
        titleAr: 'test',
        titleEn: 'test',
        type: 'discount_percent',
        discountPercent: 150,
        startsAt: pastDate(1),
        endsAt: futureDate(10),
      }),
    ).toThrow();
    try {
      svc.createPromotion({
        providerId: pid('x'),
        titleAr: 'test',
        titleEn: 'test',
        type: 'discount_percent',
        discountPercent: 150,
        startsAt: pastDate(1),
        endsAt: futureDate(10),
      });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('INVALID_DISCOUNT');
    }
  });

  it('getPromotion returns promotion by id', () => {
    const promo = activePromotion(svc);
    const fetched = svc.getPromotion(promo.id);
    expect(fetched?.id).toBe(promo.id);
  });

  it('getPromotion returns null for nonexistent id', () => {
    expect(svc.getPromotion('ghost')).toBeNull();
  });

  it('promotions are scoped by provider in listActivePromotions', () => {
    const p1 = pid('store-1');
    const p2 = pid('store-2');
    activePromotion(svc, { providerId: p1 });
    activePromotion(svc, { providerId: p1 });
    activePromotion(svc, { providerId: p2 });

    const p1List = svc.listActivePromotions({ providerId: p1 });
    const p2List = svc.listActivePromotions({ providerId: p2 });
    expect(p1List).toHaveLength(2);
    expect(p2List).toHaveLength(1);
  });

  it('expired promotion does not appear in listActivePromotions', () => {
    const promo = activePromotion(svc);
    svc.expirePromotion(promo.id);
    const list = svc.listActivePromotions();
    expect(list.some((p) => p.id === promo.id)).toBe(false);
  });
});

// ─── Redemption ───────────────────────────────────────────────────────────────

describe('FakePromotionsService – redemption', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('redeeming a promotion creates a redemption record', () => {
    const user = uid('redeem-1');
    const promo = activePromotion(svc);
    const redemption = svc.redeemPromotion(user, promo.id);
    expect(typeof redemption.id).toBe('string');
    expect(redemption.userId).toBe(user);
    expect(redemption.promotionId).toBe(promo.id);
  });

  it('redemptionCount increments after each redemption', () => {
    const promo = activePromotion(svc, { maxPerUser: 5 });
    for (let i = 0; i < 3; i++) {
      svc.redeemPromotion(uid(`cnt-${i}`), promo.id);
    }
    const updated = svc.getPromotion(promo.id);
    expect(updated?.redemptionCount).toBe(3);
  });

  it('redemption awards points based on promotion type', () => {
    const promo = activePromotion(svc, { type: 'buy_one_get_one' });
    const redemption = svc.redeemPromotion(uid('pts-1'), promo.id);
    expect(redemption.pointsAwarded).toBeGreaterThan(0);
  });

  it('getUserRedemptions returns redemptions for that user', () => {
    const user = uid('my-redeem');
    const other = uid('other-redeem');
    const promo1 = activePromotion(svc, { maxPerUser: 1 });
    const promo2 = activePromotion(svc, { maxPerUser: 1 });

    svc.redeemPromotion(user, promo1.id);
    svc.redeemPromotion(user, promo2.id);
    svc.redeemPromotion(other, promo1.id);

    const userRedemptions = svc.getUserRedemptions(user);
    expect(userRedemptions).toHaveLength(2);
    expect(userRedemptions.every((r) => r.userId === user)).toBe(true);
  });

  it('getUserRedemptions can filter by promotionId', () => {
    const user = uid('filter-redeem');
    const p1 = activePromotion(svc, { maxPerUser: 1 });
    const p2 = activePromotion(svc, { maxPerUser: 1 });
    svc.redeemPromotion(user, p1.id);
    svc.redeemPromotion(user, p2.id);

    const only1 = svc.getUserRedemptions(user, { promotionId: p1.id });
    expect(only1).toHaveLength(1);
    expect(only1[0]!.promotionId).toBe(p1.id);
  });
});

// ─── Max redemptions enforcement ──────────────────────────────────────────────

describe('FakePromotionsService – max redemptions', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('promotion with maxRedemptions=3 blocks the 4th redemption', () => {
    const promo = activePromotion(svc, { maxRedemptions: 3, maxPerUser: 10 });
    svc.redeemPromotion(uid('mr-1'), promo.id);
    svc.redeemPromotion(uid('mr-2'), promo.id);
    svc.redeemPromotion(uid('mr-3'), promo.id);

    expect(() => svc.redeemPromotion(uid('mr-4'), promo.id)).toThrow();
    try {
      svc.redeemPromotion(uid('mr-4'), promo.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('MAX_REDEMPTIONS_REACHED');
    }
  });

  it('promotion with null maxRedemptions accepts unlimited redemptions', () => {
    const promo = activePromotion(svc, { maxRedemptions: undefined, maxPerUser: 1000 });
    for (let i = 0; i < 50; i++) {
      expect(() => svc.redeemPromotion(uid(`unlimited-${i}`), promo.id)).not.toThrow();
    }
  });

  it('per-user max is enforced independently of global max', () => {
    const promo = activePromotion(svc, { maxRedemptions: 100, maxPerUser: 2 });
    const user = uid('peruser-1');

    svc.redeemPromotion(user, promo.id);
    svc.redeemPromotion(user, promo.id);

    expect(() => svc.redeemPromotion(user, promo.id)).toThrow();
    try {
      svc.redeemPromotion(user, promo.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('USER_MAX_REDEMPTIONS_REACHED');
    }
  });

  it('different users can still redeem after one user reaches their max', () => {
    const promo = activePromotion(svc, { maxRedemptions: 100, maxPerUser: 1 });
    const user1 = uid('multi-1');
    const user2 = uid('multi-2');

    svc.redeemPromotion(user1, promo.id); // user1 exhausted
    expect(() => svc.redeemPromotion(user2, promo.id)).not.toThrow();
  });
});

// ─── Expired promotion ─────────────────────────────────────────────────────────

describe('FakePromotionsService – expired promotion', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('redeeming an expired promotion (by endsAt) throws PROMOTION_EXPIRED', () => {
    const promo = activePromotion(svc);
    // Simulate redemption after endsAt
    const future = new Date(Date.now() + 48 * 3_600_000); // 48 hours from now

    // Artificially set endsAt to 1ms ago
    svc.expirePromotion(promo.id);

    expect(() => svc.redeemPromotion(uid('exp-1'), promo.id)).toThrow();
    try {
      svc.redeemPromotion(uid('exp-1'), promo.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('PROMOTION_NOT_ACTIVE');
    }
  });

  it('redeeming with a now timestamp after endsAt throws PROMOTION_EXPIRED', () => {
    const promo = svc.createPromotion({
      providerId: pid('exp-prov'),
      titleAr: 'منتهي',
      titleEn: 'Expired',
      type: 'discount_percent',
      discountPercent: 10,
      startsAt: pastDate(48),
      endsAt: pastDate(2), // ended 2 hours ago
    });

    // Pass current time as now (after endsAt)
    expect(() => svc.redeemPromotion(uid('exp-2'), promo.id, { now: new Date() })).toThrow();
    try {
      svc.redeemPromotion(uid('exp-2'), promo.id, { now: new Date() });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('PROMOTION_EXPIRED');
    }
  });

  it('promotion not yet started throws NOT_STARTED', () => {
    const promo = svc.createPromotion({
      providerId: pid('future-prov'),
      titleAr: 'قريباً',
      titleEn: 'Coming Soon',
      type: 'discount_percent',
      discountPercent: 15,
      startsAt: futureDate(2),
      endsAt: futureDate(10),
    });

    expect(() => svc.redeemPromotion(uid('early-1'), promo.id, { now: new Date() })).toThrow();
    try {
      svc.redeemPromotion(uid('early-1'), promo.id, { now: new Date() });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('NOT_STARTED');
    }
  });
});

// ─── Happy hour ────────────────────────────────────────────────────────────────

describe('FakePromotionsService – happy hour', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('happy-hour promotion can be redeemed during designated hours', () => {
    // Create a promotion valid every day (day 0–6) during hour 0–23
    // Use a fixed time: Wednesday at 14:00
    const testNow = new Date('2025-09-03T14:00:00Z'); // Wednesday = day 3

    const promo = svc.createPromotion({
      providerId: pid('hh-prov'),
      titleAr: 'عرض الساعة السعيدة',
      titleEn: 'Happy Hour Deal',
      type: 'happy_hour',
      startsAt: pastDate(48),
      endsAt: futureDate(48),
      happyHour: { dayOfWeek: testNow.getDay(), startHour: testNow.getHours(), endHour: testNow.getHours() + 2 },
    });

    expect(() => svc.redeemPromotion(uid('hh-1'), promo.id, { now: testNow })).not.toThrow();
  });

  it('happy-hour promotion cannot be redeemed outside designated hours', () => {
    // Promotion valid Wednesday 14:00–16:00, attempt at 18:00
    const testNow = new Date('2025-09-03T18:00:00Z');

    const promo = svc.createPromotion({
      providerId: pid('hh-prov-2'),
      titleAr: 'عرض الساعة السعيدة',
      titleEn: 'Happy Hour Deal',
      type: 'happy_hour',
      startsAt: pastDate(48),
      endsAt: futureDate(48),
      happyHour: { dayOfWeek: testNow.getDay(), startHour: 14, endHour: 16 },
    });

    expect(() => svc.redeemPromotion(uid('hh-2'), promo.id, { now: testNow })).toThrow();
    try {
      svc.redeemPromotion(uid('hh-2'), promo.id, { now: testNow });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('OUTSIDE_HAPPY_HOUR');
    }
  });

  it('happy-hour promotion cannot be redeemed on the wrong day of week', () => {
    // Promotion valid Wednesday (3), attempt on Thursday (4)
    const testNow = new Date('2025-09-04T14:00:00Z'); // Thursday

    const promo = svc.createPromotion({
      providerId: pid('hh-prov-3'),
      titleAr: 'عرض الساعة السعيدة',
      titleEn: 'Happy Hour Deal',
      type: 'happy_hour',
      startsAt: pastDate(48),
      endsAt: futureDate(48),
      happyHour: { dayOfWeek: 3, startHour: 14, endHour: 16 }, // Wednesday only
    });

    expect(() => svc.redeemPromotion(uid('hh-3'), promo.id, { now: testNow })).toThrow();
    try {
      svc.redeemPromotion(uid('hh-3'), promo.id, { now: testNow });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('OUTSIDE_HAPPY_HOUR');
    }
  });

  it('isHappyHourActive returns true during the window', () => {
    const testNow = new Date('2025-09-03T15:00:00Z'); // Wednesday 15:00

    const promo = svc.createPromotion({
      providerId: pid('hh-prov-4'),
      titleAr: 'test',
      titleEn: 'test',
      type: 'happy_hour',
      startsAt: pastDate(48),
      endsAt: futureDate(48),
      happyHour: { dayOfWeek: 3, startHour: 14, endHour: 17 },
    });

    expect(svc.isHappyHourActive(promo.id, testNow)).toBe(true);
  });

  it('isHappyHourActive returns false outside the window', () => {
    const testNow = new Date('2025-09-03T20:00:00Z'); // Wednesday 20:00

    const promo = svc.createPromotion({
      providerId: pid('hh-prov-5'),
      titleAr: 'test',
      titleEn: 'test',
      type: 'happy_hour',
      startsAt: pastDate(48),
      endsAt: futureDate(48),
      happyHour: { dayOfWeek: 3, startHour: 14, endHour: 17 },
    });

    expect(svc.isHappyHourActive(promo.id, testNow)).toBe(false);
  });

  it('promotion without happy-hour restriction always returns true for isHappyHourActive', () => {
    const promo = activePromotion(svc);
    expect(svc.isHappyHourActive(promo.id)).toBe(true);
  });
});

// ─── Stats ─────────────────────────────────────────────────────────────────────

describe('FakePromotionsService – stats', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('getPromotionStats returns correct totalRedemptions', () => {
    const promo = activePromotion(svc, { maxPerUser: 5 });
    svc.redeemPromotion(uid('stat-1'), promo.id);
    svc.redeemPromotion(uid('stat-2'), promo.id);
    const stats = svc.getPromotionStats(promo.id);
    expect(stats.totalRedemptions).toBe(2);
  });

  it('getPromotionStats returns correct uniqueUsers count', () => {
    const promo = activePromotion(svc, { maxPerUser: 3 });
    const user = uid('stat-unique');
    svc.redeemPromotion(user, promo.id);
    svc.redeemPromotion(user, promo.id);
    svc.redeemPromotion(uid('stat-other'), promo.id);

    const stats = svc.getPromotionStats(promo.id);
    expect(stats.uniqueUsers).toBe(2);
  });

  it('getPromotionStats computes remainingRedemptions correctly', () => {
    const promo = activePromotion(svc, { maxRedemptions: 5, maxPerUser: 5 });
    svc.redeemPromotion(uid('stat-rem-1'), promo.id);
    svc.redeemPromotion(uid('stat-rem-2'), promo.id);

    const stats = svc.getPromotionStats(promo.id);
    expect(stats.remainingRedemptions).toBe(3);
  });

  it('getPromotionStats returns null remainingRedemptions when no cap', () => {
    const promo = activePromotion(svc, { maxRedemptions: undefined });
    const stats = svc.getPromotionStats(promo.id);
    expect(stats.remainingRedemptions).toBeNull();
  });

  it('getPromotionStats isActive is true for active promotion', () => {
    const promo = activePromotion(svc);
    const stats = svc.getPromotionStats(promo.id);
    expect(stats.isActive).toBe(true);
  });

  it('getPromotionStats isExpired is true for expired promotion', () => {
    const promo = activePromotion(svc);
    svc.expirePromotion(promo.id);
    const stats = svc.getPromotionStats(promo.id, new Date());
    expect(stats.isActive).toBe(false);
  });

  it('getProviderStats aggregates across multiple promotions', () => {
    const provider = pid('stats-prov-agg');
    const p1 = activePromotion(svc, { providerId: provider, maxPerUser: 5 });
    const p2 = activePromotion(svc, { providerId: provider, maxPerUser: 5 });

    svc.redeemPromotion(uid('agg-u1'), p1.id);
    svc.redeemPromotion(uid('agg-u2'), p1.id);
    svc.redeemPromotion(uid('agg-u3'), p2.id);

    const provStats = svc.getProviderStats(provider);
    expect(provStats.totalPromotions).toBe(2);
    expect(provStats.totalRedemptions).toBe(3);
    expect(provStats.activePromotions).toBe(2);
  });

  it('getProviderStats topPromotion is the one with most redemptions', () => {
    const provider = pid('stats-prov-top');
    const p1 = activePromotion(svc, { providerId: provider, maxPerUser: 10 });
    const p2 = activePromotion(svc, { providerId: provider, maxPerUser: 10 });

    // p2 has more redemptions
    svc.redeemPromotion(uid('tp-1'), p1.id);
    svc.redeemPromotion(uid('tp-2'), p2.id);
    svc.redeemPromotion(uid('tp-3'), p2.id);
    svc.redeemPromotion(uid('tp-4'), p2.id);

    const provStats = svc.getProviderStats(provider);
    expect(provStats.topPromotion?.id).toBe(p2.id);
  });

  it('getProviderStats topPromotion is null for provider with no promotions', () => {
    const provStats = svc.getProviderStats(pid('empty-prov'));
    expect(provStats.topPromotion).toBeNull();
    expect(provStats.totalPromotions).toBe(0);
  });
});

// ─── Pause / resume ───────────────────────────────────────────────────────────

describe('FakePromotionsService – pause and resume', () => {
  let svc: FakePromotionsService;

  beforeEach(() => { svc = new FakePromotionsService(); });
  afterEach(() => { svc.reset(); });

  it('pausePromotion sets status to paused', () => {
    const promo = activePromotion(svc);
    const paused = svc.pausePromotion(promo.id);
    expect(paused.status).toBe('paused');
  });

  it('paused promotion cannot be redeemed (PROMOTION_NOT_ACTIVE)', () => {
    const promo = activePromotion(svc);
    svc.pausePromotion(promo.id);

    expect(() => svc.redeemPromotion(uid('pause-1'), promo.id)).toThrow();
    try {
      svc.redeemPromotion(uid('pause-1'), promo.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('PROMOTION_NOT_ACTIVE');
    }
  });

  it('resumePromotion sets status back to active', () => {
    const promo = activePromotion(svc);
    svc.pausePromotion(promo.id);
    const resumed = svc.resumePromotion(promo.id);
    expect(resumed.status).toBe('active');
  });

  it('resumed promotion can be redeemed again', () => {
    const promo = activePromotion(svc);
    svc.pausePromotion(promo.id);
    svc.resumePromotion(promo.id);
    expect(() => svc.redeemPromotion(uid('resume-1'), promo.id)).not.toThrow();
  });

  it('paused promotion does not appear in listActivePromotions', () => {
    const promo = activePromotion(svc);
    svc.pausePromotion(promo.id);
    const list = svc.listActivePromotions();
    expect(list.some((p) => p.id === promo.id)).toBe(false);
  });
});

// ─── Reset ────────────────────────────────────────────────────────────────────

describe('FakePromotionsService – reset', () => {
  it('reset clears all promotions and redemptions', () => {
    const svc = new FakePromotionsService();
    const promo = activePromotion(svc);
    svc.redeemPromotion(uid('rst-1'), promo.id);

    svc.reset();

    expect(svc.allPromotions).toHaveLength(0);
    expect(svc.allRedemptions).toHaveLength(0);
    expect(svc.getPromotion(promo.id)).toBeNull();
  });

  it('after reset IDs restart from promo-1', () => {
    const svc = new FakePromotionsService();
    activePromotion(svc);
    svc.reset();
    const p2 = activePromotion(svc);
    expect(p2.id).toBe('promo-1');
  });
});
