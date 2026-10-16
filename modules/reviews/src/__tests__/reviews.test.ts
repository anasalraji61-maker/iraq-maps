/**
 * Unit tests for ReviewsService.
 * Runs against a local PostgreSQL schema — skips when DATABASE_URL is not set.
 */
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ReviewsService } from '../reviews.service';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import type { ReviewIdType, CreateReviewDto } from '../types';
import type { UserId, PlaceId } from '@iraq-maps/contracts';
type PlaceIdType = PlaceId;

// ─── Module-level variable declarations ──────────────────────────────────────

// eslint-disable-next-line prefer-const
let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
// eslint-disable-next-line prefer-const
let svc: ReviewsService;

// ─── Skip guard ───────────────────────────────────────────────────────────────

const skip = !process.env.DATABASE_URL;

// ─── Migration path ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const reviewsMigrationsDir = resolve(__dirname, '../../../migrations');

// Fake IDs
const uid = (n: number) => `00000000-0000-0000-0001-${String(n).padStart(12, '0')}` as UserId;
const pid = (n: number) => `00000000-0000-0000-0002-${String(n).padStart(12, '0')}` as PlaceIdType;

/** Minimal valid CreateReviewDto */
function reviewDto(placeId: PlaceIdType, overrides: Partial<CreateReviewDto> = {}): CreateReviewDto {
  return {
    placeId,
    rating: 4,
    text: 'نص تجريبي لاختبار الوحدة طويل بما يكفي',
    ...overrides,
  };
}

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({
    modules: [{ schema: 'reviews', migrationsDir: reviewsMigrationsDir }],
  });
  svc = new ReviewsService(tdb.db as never, { publish: async () => {}, subscribe: () => () => {} });
}, 60_000);

afterAll(async () => {
  if (!skip) await tdb?.drop();
});

afterEach(async () => {
  if (skip) return;
  // Clean all reviews between tests for isolation
  await tdb.db.execute(sql`TRUNCATE reviews.review_report, reviews.review_response, reviews.review_vote, reviews.review CASCADE`);
});

// ─── createReview ─────────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.createReview', () => {
  it('creates a review with correct fields', async () => {
    const userId = uid(1);
    const placeId = pid(1);

    const result = await svc.createReview(userId, reviewDto(placeId, { rating: 5, text: 'مكان رائع جداً وأنصح الجميع بزيارته' }));

    expect(result.userId).toBe(userId);
    expect(result.placeId).toBe(placeId);
    expect(result.rating).toBe(5);
    expect(result.status).toBe('active');
    expect(result.helpfulCount).toBe(0);
    expect(result.notHelpfulCount).toBe(0);
    expect(result.myVote).toBeNull();
    expect(result.response).toBeNull();
    expect(typeof result.id).toBe('string');
    expect(typeof result.createdAt).toBe('string');
  });

  it('stores isAnonymous flag', async () => {
    const result = await svc.createReview(
      uid(2),
      reviewDto(pid(2), { isAnonymous: true, text: 'تقييم مجهول المصدر لاختبار الخاصية' }),
    );
    expect(result.isAnonymous).toBe(true);
  });

  it('stores visitDate when provided', async () => {
    const result = await svc.createReview(
      uid(3),
      reviewDto(pid(3), { visitDate: '2026-08-10', text: 'زيارة صيفية ممتعة لهذا المكان' }),
    );
    expect(result.visitDate).toBe('2026-08-10');
  });

  it('throws BadRequest when text is too short', async () => {
    await expect(
      svc.createReview(uid(4), reviewDto(pid(4), { text: 'قصير' })),
    ).rejects.toThrow();
  });

  it('throws BadRequest when text is too long', async () => {
    await expect(
      svc.createReview(uid(4), reviewDto(pid(4), { text: 'ط'.repeat(1001) })),
    ).rejects.toThrow();
  });

  it('throws BadRequest when rating is below 1', async () => {
    await expect(
      svc.createReview(uid(5), reviewDto(pid(5), { rating: 0 })),
    ).rejects.toThrow();
  });

  it('throws BadRequest when rating is above 5', async () => {
    await expect(
      svc.createReview(uid(5), reviewDto(pid(5), { rating: 6 })),
    ).rejects.toThrow();
  });

  it('emits reviews.review.created.v1 event on creation', async () => {
    const published: unknown[] = [];
    const bus = { publish: async (e: unknown) => { published.push(e); }, subscribe: () => () => {} };
    const localSvc = new ReviewsService(tdb.db as never, bus);

    await localSvc.createReview(uid(6), reviewDto(pid(6), { text: 'تقييم لاختبار إرسال الحدث' }));

    expect(published.length).toBeGreaterThanOrEqual(1);
    const event = published[0] as { type: string; payload: { reviewId: string } };
    expect(event.type).toBe('reviews.review.created.v1');
    expect(typeof event.payload.reviewId).toBe('string');
  });
});

// ─── Duplicate prevention ─────────────────────────────────────────────────────

describe.skipIf(skip)("ReviewsService — can't review the same place twice", () => {
  it('throws ConflictException when the same user reviews the same place twice', async () => {
    const userId = uid(10);
    const placeId = pid(10);

    await svc.createReview(userId, reviewDto(placeId, { text: 'التقييم الأول للمكان بنجاح' }));

    await expect(
      svc.createReview(userId, reviewDto(placeId, { text: 'محاولة التقييم مرة ثانية للمكان' })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('allows the same user to review different places', async () => {
    const userId = uid(11);

    const r1 = await svc.createReview(userId, reviewDto(pid(11), { text: 'تقييم المكان الأول' }));
    const r2 = await svc.createReview(userId, reviewDto(pid(12), { text: 'تقييم المكان الثاني' }));

    expect(r1.placeId).not.toBe(r2.placeId);
  });

  it('allows different users to review the same place', async () => {
    const placeId = pid(13);

    const r1 = await svc.createReview(uid(12), reviewDto(placeId, { text: 'تقييم المستخدم الأول' }));
    const r2 = await svc.createReview(uid(13), reviewDto(placeId, { text: 'تقييم المستخدم الثاني' }));

    expect(r1.userId).not.toBe(r2.userId);
    expect(r1.placeId).toBe(r2.placeId);
  });
});

// ─── updateReview ─────────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.updateReview', () => {
  it('owner can update rating and text', async () => {
    const userId = uid(20);
    const created = await svc.createReview(userId, reviewDto(pid(20), { rating: 3, text: 'نص أولي قبل التعديل' }));

    const updated = await svc.updateReview(userId, created.id, {
      rating: 5,
      text: 'نص محدث بعد زيارة إضافية للمكان',
    });

    expect(updated.rating).toBe(5);
    expect(updated.text).toBe('نص محدث بعد زيارة إضافية للمكان');
    expect(updated.id).toBe(created.id);
  });

  it('throws ForbiddenException when non-owner tries to update', async () => {
    const owner = uid(21);
    const other = uid(22);
    const created = await svc.createReview(owner, reviewDto(pid(21), { text: 'تقييم المالك الأصلي' }));

    await expect(
      svc.updateReview(other, created.id, { rating: 1, text: 'تعديل غير مصرح من مستخدم آخر' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws NotFoundException when review does not exist', async () => {
    await expect(
      svc.updateReview(uid(23), crypto.randomUUID() as ReviewIdType, { rating: 2 }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─── deleteReview ─────────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.deleteReview', () => {
  it('owner can delete review (soft delete to removed status)', async () => {
    const userId = uid(30);
    const created = await svc.createReview(userId, reviewDto(pid(30), { text: 'تقييم سيتم حذفه بطريقة ناعمة' }));

    await svc.deleteReview(userId, created.id);

    // Deleted review should not appear in listing
    const page = await svc.getReviews(pid(30), {});
    expect(page.items.find((r) => r.id === created.id)).toBeUndefined();
  });

  it('throws ForbiddenException when non-owner tries to delete', async () => {
    const owner = uid(31);
    const other = uid(32);
    const created = await svc.createReview(owner, reviewDto(pid(31), { text: 'تقييم محمي من الحذف' }));

    await expect(svc.deleteReview(other, created.id)).rejects.toMatchObject({ status: 403 });
  });

  it('is idempotent — deleting twice does not throw', async () => {
    const userId = uid(33);
    const created = await svc.createReview(userId, reviewDto(pid(33), { text: 'تقييم سيتم حذفه مرتين' }));

    await svc.deleteReview(userId, created.id);
    await expect(svc.deleteReview(userId, created.id)).resolves.toBeUndefined();
  });
});

// ─── getReviews ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.getReviews', () => {
  it('returns empty page for a place with no reviews', async () => {
    const page = await svc.getReviews(pid(40), {});
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });

  it('returns created review in the listing', async () => {
    const placeId = pid(41);
    const created = await svc.createReview(uid(40), reviewDto(placeId, { text: 'تقييم يظهر في القائمة' }));

    const page = await svc.getReviews(placeId, {});
    expect(page.items.some((r) => r.id === created.id)).toBe(true);
  });

  it('sorts by highest rating when sort=highest', async () => {
    const placeId = pid(42);
    await svc.createReview(uid(41), reviewDto(placeId, { rating: 2, text: 'تقييم منخفض للمكان' }));
    await svc.createReview(uid(42), reviewDto(placeId, { rating: 5, text: 'تقييم عالي للمكان' }));
    await svc.createReview(uid(43), reviewDto(placeId, { rating: 3, text: 'تقييم متوسط للمكان' }));

    const page = await svc.getReviews(placeId, { sort: 'highest' });
    const ratings = page.items.map((r) => r.rating);
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i - 1]).toBeGreaterThanOrEqual(ratings[i]!);
    }
  });

  it('filters by rating when rating param is given', async () => {
    const placeId = pid(43);
    await svc.createReview(uid(44), reviewDto(placeId, { rating: 1, text: 'تقييم سيء للمكان' }));
    await svc.createReview(uid(45), reviewDto(placeId, { rating: 5, text: 'تقييم ممتاز للمكان' }));

    const page = await svc.getReviews(placeId, { rating: 5 });
    expect(page.items.every((r) => r.rating === 5)).toBe(true);
  });

  it('paginates with cursor', async () => {
    const placeId = pid(44);
    // Create 5 reviews
    for (let i = 0; i < 5; i++) {
      await svc.createReview(uid(46 + i), reviewDto(placeId, { text: `تقييم رقم ${i + 1} لاختبار الصفحات` }));
    }

    const page1 = await svc.getReviews(placeId, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await svc.getReviews(placeId, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    // IDs must not overlap
    const ids1 = new Set(page1.items.map((r) => r.id));
    const ids2 = page2.items.map((r) => r.id);
    expect(ids2.every((id) => !ids1.has(id))).toBe(true);
  });
});

// ─── getRatingSummary ─────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.getPlaceRatingSummary', () => {
  it('computes correct average and breakdown', async () => {
    const placeId = pid(50);
    const users = [uid(51), uid(52), uid(53), uid(54)];
    const ratings = [5, 4, 3, 2];
    const texts = [
      'تقييم خمسة نجوم للملخص',
      'تقييم أربع نجوم',
      'تقييم ثلاث نجوم',
      'تقييم نجمتين',
    ];

    for (let i = 0; i < users.length; i++) {
      await svc.createReview(users[i]!, reviewDto(placeId, { rating: ratings[i]!, text: texts[i]! }));
    }

    const summary = await svc.getPlaceRatingSummary(placeId);
    expect(summary.total).toBe(4);
    // average = (5+4+3+2)/4 = 3.5
    expect(summary.average).toBeCloseTo(3.5, 1);
    expect(summary.breakdown[5]).toBe(1);
    expect(summary.breakdown[4]).toBe(1);
    expect(summary.breakdown[3]).toBe(1);
    expect(summary.breakdown[2]).toBe(1);
    expect(summary.breakdown[1]).toBe(0);
  });

  it('returns zero total and zero average for a place with no reviews', async () => {
    const summary = await svc.getPlaceRatingSummary(pid(55));
    expect(summary.total).toBe(0);
    expect(summary.average).toBe(0);
  });

  it('updates after a new review is created', async () => {
    const placeId = pid(56);

    const before = await svc.getPlaceRatingSummary(placeId);
    expect(before.total).toBe(0);

    await svc.createReview(uid(57), reviewDto(placeId, { rating: 5, text: 'تقييم يحدّث الملخص' }));

    const after = await svc.getPlaceRatingSummary(placeId);
    expect(after.total).toBe(1);
    expect(after.average).toBe(5);
  });
});

// ─── voteReview ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.voteReview', () => {
  it('increments helpfulCount when voted helpful', async () => {
    const author = uid(60);
    const voter = uid(61);
    const created = await svc.createReview(author, reviewDto(pid(60), { text: 'تقييم سيحصل على صوت مفيد' }));

    const result = await svc.voteReview(voter, created.id, { isHelpful: true });

    expect(result.helpfulCount).toBe(1);
    expect(result.notHelpfulCount).toBe(0);
    expect(result.myVote).toBe(true);
  });

  it('increments notHelpfulCount when voted not helpful', async () => {
    const author = uid(62);
    const voter = uid(63);
    const created = await svc.createReview(author, reviewDto(pid(61), { text: 'تقييم سيحصل على صوت غير مفيد' }));

    const result = await svc.voteReview(voter, created.id, { isHelpful: false });

    expect(result.helpfulCount).toBe(0);
    expect(result.notHelpfulCount).toBe(1);
    expect(result.myVote).toBe(false);
  });

  it('toggles vote off when voting the same way twice', async () => {
    const author = uid(64);
    const voter = uid(65);
    const created = await svc.createReview(author, reviewDto(pid(62), { text: 'تقييم لاختبار إلغاء الصوت' }));

    await svc.voteReview(voter, created.id, { isHelpful: true });
    const result = await svc.voteReview(voter, created.id, { isHelpful: true });

    expect(result.helpfulCount).toBe(0);
    expect(result.myVote).toBeNull();
  });

  it('allows changing vote from helpful to not helpful', async () => {
    const author = uid(66);
    const voter = uid(67);
    const created = await svc.createReview(author, reviewDto(pid(63), { text: 'تقييم لاختبار تغيير الصوت' }));

    await svc.voteReview(voter, created.id, { isHelpful: true });
    const result = await svc.voteReview(voter, created.id, { isHelpful: false });

    expect(result.helpfulCount).toBe(0);
    expect(result.notHelpfulCount).toBe(1);
    expect(result.myVote).toBe(false);
  });

  it('throws BadRequest when user votes on their own review', async () => {
    const userId = uid(68);
    const created = await svc.createReview(userId, reviewDto(pid(64), { text: 'تقييم الشخص نفسه لا يجوز' }));

    await expect(svc.voteReview(userId, created.id, { isHelpful: true })).rejects.toThrow();
  });

  it('throws NotFoundException for non-existent review', async () => {
    await expect(
      svc.voteReview(uid(69), crypto.randomUUID() as ReviewIdType, { isHelpful: true }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('multiple voters each contribute to helpfulCount', async () => {
    const author = uid(70);
    const placeId = pid(65);
    const created = await svc.createReview(author, reviewDto(placeId, { text: 'تقييم سيحصل على عدة أصوات' }));

    for (let i = 71; i <= 73; i++) {
      await svc.voteReview(uid(i), created.id, { isHelpful: true });
    }

    const result = await svc.voteReview(uid(74), created.id, { isHelpful: true });
    expect(result.helpfulCount).toBe(4);
  });
});

// ─── reportReview ─────────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.reportReview', () => {
  it('reporter can report a review', async () => {
    const author = uid(80);
    const reporter = uid(81);
    const created = await svc.createReview(author, reviewDto(pid(70), { text: 'تقييم سيتم الإبلاغ عنه' }));

    await expect(svc.reportReview(reporter, created.id, { reason: 'spam' })).resolves.toBeUndefined();
  });

  it('prevents same user from reporting the same review twice', async () => {
    const author = uid(82);
    const reporter = uid(83);
    const created = await svc.createReview(author, reviewDto(pid(71), { text: 'تقييم سيتم إبلاغ مزدوج' }));

    await svc.reportReview(reporter, created.id, { reason: 'fake' });

    await expect(
      svc.reportReview(reporter, created.id, { reason: 'fake' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('throws NotFoundException for non-existent review', async () => {
    await expect(
      svc.reportReview(uid(84), crypto.randomUUID() as ReviewIdType, { reason: 'other' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ─── respondToReview ──────────────────────────────────────────────────────────

describe.skipIf(skip)('ReviewsService.respondToReview', () => {
  it('provider can add a response to a review', async () => {
    const author = uid(90);
    const provider = uid(91);
    const created = await svc.createReview(author, reviewDto(pid(80), { text: 'تقييم سيرد عليه المزود' }));

    const response = await svc.respondToReview(provider, created.id, {
      text: 'شكراً على تقييمك، سنعمل على تحسين خدماتنا',
    });

    expect(response.reviewId).toBe(created.id);
    expect(response.providerId).toBe(provider);
    expect(response.text).toBe('شكراً على تقييمك، سنعمل على تحسين خدماتنا');
  });

  it('response appears when fetching review details', async () => {
    const author = uid(92);
    const provider = uid(93);
    const placeId = pid(81);
    const created = await svc.createReview(author, reviewDto(placeId, { text: 'تقييم للتحقق من الرد' }));

    await svc.respondToReview(provider, created.id, {
      text: 'رد المزود على هذا التقييم المحدد',
    });

    const review = await svc.getReview(created.id);
    expect(review.response).not.toBeNull();
    expect(review.response?.text).toBe('رد المزود على هذا التقييم المحدد');
  });

  it('throws NotFoundException for non-existent review', async () => {
    await expect(
      svc.respondToReview(uid(94), crypto.randomUUID() as ReviewIdType, { text: 'رد على تقييم غير موجود' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
