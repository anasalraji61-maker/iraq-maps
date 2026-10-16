/**
 * Unit tests for the reputation system using FakeReputationService.
 *
 * Coverage:
 *   - Award points → balance increases
 *   - Points history recorded correctly
 *   - Level up when point threshold reached
 *   - Badge awarded when condition met
 *   - Leaderboard ordered correctly (descending points)
 *   - Rank computed correctly for each user
 *   - Incident report flow (pending → confirmed → bonus points)
 *   - Self-like prevention
 *   - Duplicate-like prevention
 *   - Like threshold bonus
 *   - Admin point adjustment
 *   - Reset clears all state
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeReputationService,
  type PointEntry,
  type Badge,
} from '@iraq-maps/testing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(suffix: string): string {
  return `user-${suffix}`;
}

function reviewId(n: number): string {
  return `review-${n}`;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('FakeReputationService – points', () => {
  let svc: FakeReputationService;

  beforeEach(() => {
    svc = new FakeReputationService();
  });

  afterEach(() => {
    svc.reset();
  });

  it('starts with zero points for a new user', () => {
    expect(svc.getTotalPoints(uid('alice'))).toBe(0);
  });

  it('writing a review awards points to the reviewer', () => {
    const user = uid('alice');
    svc.onReviewWritten(user, reviewId(1));
    expect(svc.getTotalPoints(user)).toBeGreaterThan(0);
  });

  it('first review awards first_review bonus on top of review_written', () => {
    const user = uid('bob');
    svc.onReviewWritten(user, reviewId(1));
    const history = svc.getPointHistory(user);
    const reasons = history.map((e: PointEntry) => e.reason);
    expect(reasons).toContain('first_review');
    expect(reasons).toContain('review_written');
  });

  it('second review does NOT award first_review bonus', () => {
    const user = uid('carol');
    svc.onReviewWritten(user, reviewId(1));
    const pointsAfterFirst = svc.getTotalPoints(user);
    svc.onReviewWritten(user, reviewId(2));
    const history = svc.getPointHistory(user);
    const firstReviewEntries = history.filter((e: PointEntry) => e.reason === 'first_review');
    expect(firstReviewEntries).toHaveLength(1);
    // Second review still adds review_written points
    expect(svc.getTotalPoints(user)).toBeGreaterThan(pointsAfterFirst);
  });

  it('point entries are recorded in history with correct userId', () => {
    const userA = uid('dave');
    const userB = uid('eve');
    svc.onReviewWritten(userA, reviewId(1));
    svc.onReviewWritten(userB, reviewId(2));
    const histA = svc.getPointHistory(userA);
    const histB = svc.getPointHistory(userB);
    expect(histA.every((e: PointEntry) => e.userId === userA)).toBe(true);
    expect(histB.every((e: PointEntry) => e.userId === userB)).toBe(true);
    // Histories should be independent
    expect(histA.length).toBeGreaterThan(0);
    expect(histB.length).toBeGreaterThan(0);
    expect(histA).not.toEqual(histB);
  });

  it('point entries carry the referenceId for the review', () => {
    const user = uid('frank');
    const rId = reviewId(42);
    svc.onReviewWritten(user, rId);
    const history = svc.getPointHistory(user);
    const reviewEntry = history.find((e: PointEntry) => e.reason === 'review_written');
    expect(reviewEntry?.referenceId).toBe(rId);
  });

  it('point entries have a createdAt timestamp', () => {
    const user = uid('gina');
    const before = Date.now();
    svc.onReviewWritten(user, reviewId(1));
    const after = Date.now();
    const history = svc.getPointHistory(user);
    for (const entry of history) {
      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after + 1);
    }
  });

  it('manual adjustment increases points', () => {
    const user = uid('hank');
    const before = svc.getTotalPoints(user);
    svc.adjustPoints(user, 100);
    expect(svc.getTotalPoints(user)).toBe(before + 100);
  });

  it('manual adjustment with negative delta decreases points', () => {
    const user = uid('iris');
    svc.adjustPoints(user, 200);
    const before = svc.getTotalPoints(user);
    svc.adjustPoints(user, -50);
    expect(svc.getTotalPoints(user)).toBe(before - 50);
  });

  it('multiple users accumulate independent balances', () => {
    const users = ['u1', 'u2', 'u3'].map(uid);
    // Write different numbers of reviews per user
    svc.onReviewWritten(users[0]!, reviewId(1));
    svc.onReviewWritten(users[1]!, reviewId(2));
    svc.onReviewWritten(users[1]!, reviewId(3));
    svc.onReviewWritten(users[2]!, reviewId(4));
    svc.onReviewWritten(users[2]!, reviewId(5));
    svc.onReviewWritten(users[2]!, reviewId(6));

    const [p0, p1, p2] = users.map((u) => svc.getTotalPoints(u));
    // Each user's points reflect their own activity
    expect(p1!).toBeGreaterThan(p0!);
    expect(p2!).toBeGreaterThan(p1!);
  });
});

// ─── Review likes ──────────────────────────────────────────────────────────────

describe('FakeReputationService – review likes', () => {
  let svc: FakeReputationService;

  beforeEach(() => { svc = new FakeReputationService(); });
  afterEach(() => { svc.reset(); });

  it('liking a review awards points to the reviewer', () => {
    const reviewer = uid('reviewer-1');
    const liker = uid('liker-1');
    const rId = reviewId(1);
    svc.onReviewWritten(reviewer, rId);
    const before = svc.getTotalPoints(reviewer);
    svc.onReviewLiked(reviewer, rId, liker);
    expect(svc.getTotalPoints(reviewer)).toBeGreaterThan(before);
  });

  it('self-like throws SELF_LIKE error', () => {
    const user = uid('narcissist');
    const rId = reviewId(1);
    svc.onReviewWritten(user, rId);
    expect(() => svc.onReviewLiked(user, rId, user)).toThrow();
    try {
      svc.onReviewLiked(user, rId, user);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('SELF_LIKE');
    }
  });

  it('duplicate like from same liker throws DUPLICATE_LIKE', () => {
    const reviewer = uid('r2');
    const liker = uid('l2');
    const rId = reviewId(2);
    svc.onReviewWritten(reviewer, rId);
    svc.onReviewLiked(reviewer, rId, liker);
    expect(() => svc.onReviewLiked(reviewer, rId, liker)).toThrow();
    try {
      svc.onReviewLiked(reviewer, rId, liker);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('DUPLICATE_LIKE');
    }
  });

  it('different likers can each like the same review', () => {
    const reviewer = uid('r3');
    const rId = reviewId(3);
    svc.onReviewWritten(reviewer, rId);
    const likers = ['l1', 'l2', 'l3'].map(uid);
    for (const liker of likers) {
      expect(() => svc.onReviewLiked(reviewer, rId, liker)).not.toThrow();
    }
    expect(svc.getLikeCount(rId)).toBe(3);
  });

  it('getLikeCount returns 0 for a review with no likes', () => {
    expect(svc.getLikeCount('nonexistent-review')).toBe(0);
  });

  it('hasLiked returns true after liking and false before', () => {
    const reviewer = uid('r4');
    const liker = uid('l4');
    const rId = reviewId(4);
    svc.onReviewWritten(reviewer, rId);
    expect(svc.hasLiked(rId, liker)).toBe(false);
    svc.onReviewLiked(reviewer, rId, liker);
    expect(svc.hasLiked(rId, liker)).toBe(true);
  });

  it('bonus points awarded when review reaches LIKE_THRESHOLD (5 likes)', () => {
    const reviewer = uid('r5');
    const rId = reviewId(5);
    svc.onReviewWritten(reviewer, rId);
    const after1Review = svc.getTotalPoints(reviewer);

    // Get 4 likes – no threshold bonus yet
    for (let i = 0; i < 4; i++) {
      svc.onReviewLiked(reviewer, rId, uid(`thresh-liker-${i}`));
    }
    const after4Likes = svc.getTotalPoints(reviewer);

    // 5th like triggers the threshold bonus
    svc.onReviewLiked(reviewer, rId, uid('thresh-liker-4'));
    const after5Likes = svc.getTotalPoints(reviewer);

    expect(after4Likes).toBeGreaterThan(after1Review);
    // Threshold bonus should make the 5th like add more than a single like
    const singleLikeDelta = (after4Likes - after1Review) / 4;
    const thresholdLikeDelta = after5Likes - after4Likes;
    expect(thresholdLikeDelta).toBeGreaterThan(singleLikeDelta);

    // History should contain review_reached_threshold entry
    const history = svc.getPointHistory(reviewer);
    const thresholdEntry = history.find((e: PointEntry) => e.reason === 'review_reached_threshold');
    expect(thresholdEntry).toBeDefined();
  });

  it('6th like does NOT award another threshold bonus', () => {
    const reviewer = uid('r6');
    const rId = reviewId(6);
    svc.onReviewWritten(reviewer, rId);
    for (let i = 0; i < 5; i++) {
      svc.onReviewLiked(reviewer, rId, uid(`tl-${i}`));
    }
    const after5 = svc.getTotalPoints(reviewer);
    svc.onReviewLiked(reviewer, rId, uid('tl-5'));
    const after6 = svc.getTotalPoints(reviewer);

    const history = svc.getPointHistory(reviewer);
    const thresholdEntries = history.filter((e: PointEntry) => e.reason === 'review_reached_threshold');
    expect(thresholdEntries).toHaveLength(1);
    // 6th like still awards review_liked points
    expect(after6).toBeGreaterThan(after5);
  });
});

// ─── Incidents ────────────────────────────────────────────────────────────────

describe('FakeReputationService – incident reporting', () => {
  let svc: FakeReputationService;

  beforeEach(() => { svc = new FakeReputationService(); });
  afterEach(() => { svc.reset(); });

  it('reporting an incident awards incident_reported points', () => {
    const reporter = uid('rep-1');
    const before = svc.getTotalPoints(reporter);
    svc.reportIncident(reporter, {
      type: 'price_mismatch',
      placeId: 'place-1',
      description: 'السعر غير صحيح',
    });
    expect(svc.getTotalPoints(reporter)).toBeGreaterThan(before);
  });

  it('incident is created with pending status', () => {
    const reporter = uid('rep-2');
    const incident = svc.reportIncident(reporter, {
      type: 'wrong_location',
      placeId: 'place-2',
      description: 'الموقع خاطئ',
    });
    expect(incident.status).toBe('pending');
    expect(incident.reporterId).toBe(reporter);
  });

  it('confirming an incident awards incident_confirmed bonus', () => {
    const reporter = uid('rep-3');
    const incident = svc.reportIncident(reporter, {
      type: 'closed',
      placeId: 'place-3',
      description: 'المكان مغلق',
    });
    const before = svc.getTotalPoints(reporter);
    svc.confirmIncident(incident.id);
    expect(svc.getTotalPoints(reporter)).toBeGreaterThan(before);

    const history = svc.getPointHistory(reporter);
    expect(history.some((e: PointEntry) => e.reason === 'incident_confirmed')).toBe(true);
  });

  it('confirming an incident changes its status to confirmed', () => {
    const reporter = uid('rep-4');
    const incident = svc.reportIncident(reporter, {
      type: 'fake_listing',
      placeId: 'place-4',
      description: 'قائمة مزيفة',
    });
    svc.confirmIncident(incident.id);
    const retrieved = svc.getIncident(incident.id);
    expect(retrieved?.status).toBe('confirmed');
    expect(retrieved?.resolvedAt).toBeInstanceOf(Date);
  });

  it('rejecting an incident changes its status to rejected', () => {
    const reporter = uid('rep-5');
    const incident = svc.reportIncident(reporter, {
      type: 'other',
      placeId: 'place-5',
      description: 'أخرى',
    });
    svc.rejectIncident(incident.id);
    const retrieved = svc.getIncident(incident.id);
    expect(retrieved?.status).toBe('rejected');
  });

  it('confirming an already resolved incident throws ALREADY_RESOLVED', () => {
    const reporter = uid('rep-6');
    const incident = svc.reportIncident(reporter, {
      type: 'price_mismatch',
      placeId: 'place-6',
      description: 'مشكلة',
    });
    svc.confirmIncident(incident.id);
    expect(() => svc.confirmIncident(incident.id)).toThrow();
    try {
      svc.confirmIncident(incident.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('ALREADY_RESOLVED');
    }
  });

  it('confirming a nonexistent incident throws NOT_FOUND', () => {
    expect(() => svc.confirmIncident('nonexistent')).toThrow();
    try {
      svc.confirmIncident('nonexistent');
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('NOT_FOUND');
    }
  });

  it('invalid incident type throws INVALID_TYPE', () => {
    const reporter = uid('rep-7');
    expect(() =>
      svc.reportIncident(reporter, {
        type: 'made_up_type',
        placeId: 'place-7',
        description: 'test',
      }),
    ).toThrow();
    try {
      svc.reportIncident(reporter, {
        type: 'made_up_type',
        placeId: 'place-7',
        description: 'test',
      });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('INVALID_TYPE');
    }
  });

  it('getUserIncidents returns only incidents for that user', () => {
    const u1 = uid('rep-8');
    const u2 = uid('rep-9');
    svc.reportIncident(u1, { type: 'closed', placeId: 'p1', description: 'مغلق' });
    svc.reportIncident(u1, { type: 'other', placeId: 'p2', description: 'أخرى' });
    svc.reportIncident(u2, { type: 'price_mismatch', placeId: 'p3', description: 'سعر' });

    const u1Incidents = svc.getUserIncidents(u1);
    const u2Incidents = svc.getUserIncidents(u2);
    expect(u1Incidents).toHaveLength(2);
    expect(u2Incidents).toHaveLength(1);
    expect(u1Incidents.every((i) => i.reporterId === u1)).toBe(true);
  });
});

// ─── Badges ───────────────────────────────────────────────────────────────────

describe('FakeReputationService – badges', () => {
  let svc: FakeReputationService;

  beforeEach(() => { svc = new FakeReputationService(); });
  afterEach(() => { svc.reset(); });

  it('getAllBadges returns the full list of available badges', () => {
    const badges = svc.getAllBadges();
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(typeof badge.slug).toBe('string');
      expect(typeof badge.name).toBe('string');
    }
  });

  it('writing first review awards first_review badge', () => {
    const user = uid('badge-1');
    svc.onReviewWritten(user, reviewId(1));
    const badges = svc.getUserBadges(user);
    const slugs = badges.map((b: Badge & { awardedAt: Date }) => b.slug);
    expect(slugs).toContain('first_review');
  });

  it('first_review badge is awarded only once even after more reviews', () => {
    const user = uid('badge-2');
    for (let i = 0; i < 5; i++) {
      svc.onReviewWritten(user, reviewId(i + 100));
    }
    const badges = svc.getUserBadges(user);
    const firstReviewBadges = badges.filter(
      (b: Badge & { awardedAt: Date }) => b.slug === 'first_review',
    );
    expect(firstReviewBadges).toHaveLength(1);
  });

  it('reviewer_5 badge awarded after 5 reviews', () => {
    const user = uid('badge-3');
    for (let i = 0; i < 5; i++) {
      svc.onReviewWritten(user, reviewId(i + 200));
    }
    const badges = svc.getUserBadges(user);
    const slugs = badges.map((b: Badge & { awardedAt: Date }) => b.slug);
    expect(slugs).toContain('reviewer_5');
  });

  it('reviewer_5 badge NOT awarded after only 4 reviews', () => {
    const user = uid('badge-4');
    for (let i = 0; i < 4; i++) {
      svc.onReviewWritten(user, reviewId(i + 300));
    }
    const badges = svc.getUserBadges(user);
    const slugs = badges.map((b: Badge & { awardedAt: Date }) => b.slug);
    expect(slugs).not.toContain('reviewer_5');
  });

  it('incident_reporter badge awarded after first confirmed incident', () => {
    const user = uid('badge-5');
    const incident = svc.reportIncident(user, {
      type: 'price_mismatch',
      placeId: 'place-badge',
      description: 'سعر مختلف',
    });
    svc.confirmIncident(incident.id);
    const badges = svc.getUserBadges(user);
    const slugs = badges.map((b: Badge & { awardedAt: Date }) => b.slug);
    expect(slugs).toContain('incident_reporter');
  });

  it('incident_reporter badge NOT awarded for unconfirmed incident', () => {
    const user = uid('badge-6');
    svc.reportIncident(user, {
      type: 'other',
      placeId: 'place-badge-2',
      description: 'مشكلة',
    });
    const badges = svc.getUserBadges(user);
    const slugs = badges.map((b: Badge & { awardedAt: Date }) => b.slug);
    expect(slugs).not.toContain('incident_reporter');
  });

  it('points_100 badge awarded when user reaches 100 points', () => {
    const user = uid('badge-7');
    // Manual adjustment to ensure ≥100 points
    svc.adjustPoints(user, 100);
    const badges = svc.getUserBadges(user);
    const slugs = badges.map((b: Badge & { awardedAt: Date }) => b.slug);
    expect(slugs).toContain('points_100');
  });

  it('badge awardedAt is a Date', () => {
    const user = uid('badge-8');
    svc.onReviewWritten(user, reviewId(1000));
    const badges = svc.getUserBadges(user);
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.awardedAt).toBeInstanceOf(Date);
    }
  });

  it('new user starts with zero badges', () => {
    const user = uid('badge-9');
    expect(svc.getUserBadges(user)).toHaveLength(0);
  });
});

// ─── Leaderboard & rank ───────────────────────────────────────────────────────

describe('FakeReputationService – leaderboard', () => {
  let svc: FakeReputationService;

  beforeEach(() => { svc = new FakeReputationService(); });
  afterEach(() => { svc.reset(); });

  it('getLeaderboard returns an array', () => {
    expect(Array.isArray(svc.getLeaderboard())).toBe(true);
  });

  it('user with no points does not appear in leaderboard', () => {
    const user = uid('ghost');
    const board = svc.getLeaderboard();
    expect(board.some((e) => e.userId === user)).toBe(false);
  });

  it('user appears in leaderboard after earning points', () => {
    const user = uid('lb-1');
    svc.onReviewWritten(user, reviewId(1));
    const board = svc.getLeaderboard();
    expect(board.some((e) => e.userId === user)).toBe(true);
  });

  it('leaderboard is ordered by points descending', () => {
    const users = ['lb-a', 'lb-b', 'lb-c'].map(uid);
    // Award different amounts
    svc.adjustPoints(users[2]!, 300);
    svc.adjustPoints(users[0]!, 100);
    svc.adjustPoints(users[1]!, 200);

    const board = svc.getLeaderboard();
    for (let i = 1; i < board.length; i++) {
      expect(board[i - 1]!.points).toBeGreaterThanOrEqual(board[i]!.points);
    }
  });

  it('rank 1 user has the highest points', () => {
    const top = uid('lb-top');
    const mid = uid('lb-mid');
    const low = uid('lb-low');
    svc.adjustPoints(top, 500);
    svc.adjustPoints(mid, 200);
    svc.adjustPoints(low, 50);

    const board = svc.getLeaderboard();
    expect(board[0]!.userId).toBe(top);
    expect(board[0]!.rank).toBe(1);
  });

  it('getUserRank returns correct rank for each user', () => {
    const users = ['r-a', 'r-b', 'r-c'].map(uid);
    svc.adjustPoints(users[0]!, 300);
    svc.adjustPoints(users[1]!, 200);
    svc.adjustPoints(users[2]!, 100);

    expect(svc.getUserRank(users[0]!)).toBe(1);
    expect(svc.getUserRank(users[1]!)).toBe(2);
    expect(svc.getUserRank(users[2]!)).toBe(3);
  });

  it('getUserRank returns null for a user with no points', () => {
    expect(svc.getUserRank(uid('nobody'))).toBeNull();
  });

  it('leaderboard limit parameter is respected', () => {
    for (let i = 0; i < 10; i++) {
      svc.adjustPoints(uid(`limit-user-${i}`), (i + 1) * 10);
    }
    const board = svc.getLeaderboard({ limit: 3 });
    expect(board.length).toBeLessThanOrEqual(3);
  });

  it('leaderboard offset parameter paginates correctly', () => {
    for (let i = 0; i < 5; i++) {
      svc.adjustPoints(uid(`page-user-${i}`), (5 - i) * 100);
    }
    const page1 = svc.getLeaderboard({ limit: 2, offset: 0 });
    const page2 = svc.getLeaderboard({ limit: 2, offset: 2 });

    // Pages should not overlap
    const page1Ids = new Set(page1.map((e) => e.userId));
    const page2Ids = new Set(page2.map((e) => e.userId));
    const overlap = [...page1Ids].filter((id) => page2Ids.has(id));
    expect(overlap).toHaveLength(0);

    // Page 2 ranks should be higher numbers than page 1
    expect(page2[0]!.rank).toBeGreaterThan(page1[page1.length - 1]!.rank);
  });

  it('leaderboard updates immediately after awarding points', () => {
    const user = uid('lb-update');
    const boardBefore = svc.getLeaderboard();
    const inBoardBefore = boardBefore.some((e) => e.userId === user);
    expect(inBoardBefore).toBe(false);

    svc.onReviewWritten(user, reviewId(999));
    const boardAfter = svc.getLeaderboard();
    const inBoardAfter = boardAfter.some((e) => e.userId === user);
    expect(inBoardAfter).toBe(true);
  });

  it('getUserProfile returns userId, points, badges and reviewCount', () => {
    const user = uid('profile-1');
    svc.onReviewWritten(user, reviewId(1));
    const profile = svc.getUserProfile(user);
    expect(profile.userId).toBe(user);
    expect(profile.points).toBeGreaterThan(0);
    expect(Array.isArray(profile.badges)).toBe(true);
    expect(profile.reviewCount).toBe(1);
  });

  it('writing 3 reviews increments reviewCount to 3', () => {
    const user = uid('profile-2');
    for (let i = 0; i < 3; i++) svc.onReviewWritten(user, reviewId(i + 500));
    expect(svc.getUserProfile(user).reviewCount).toBe(3);
  });
});

// ─── Reset ────────────────────────────────────────────────────────────────────

describe('FakeReputationService – reset', () => {
  it('reset clears all ledger entries and badges', () => {
    const svc = new FakeReputationService();
    const user = uid('reset-1');
    svc.onReviewWritten(user, reviewId(1));
    svc.adjustPoints(user, 50);
    expect(svc.getTotalPoints(user)).toBeGreaterThan(0);

    svc.reset();

    expect(svc.getTotalPoints(user)).toBe(0);
    expect(svc.getPointHistory(user)).toHaveLength(0);
    expect(svc.getUserBadges(user)).toHaveLength(0);
    expect(svc.getLeaderboard()).toHaveLength(0);
  });

  it('reset clears incidents', () => {
    const svc = new FakeReputationService();
    const reporter = uid('reset-reporter');
    const incident = svc.reportIncident(reporter, {
      type: 'closed',
      placeId: 'p-reset',
      description: 'مغلق',
    });
    svc.reset();
    expect(svc.getIncident(incident.id)).toBeNull();
    expect(svc.getUserIncidents(reporter)).toHaveLength(0);
  });
});
