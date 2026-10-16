/**
 * Unit tests for the challenges system using FakeChallengesService.
 *
 * Coverage:
 *   - Create challenge → appears in active list
 *   - Update progress → percentage correct
 *   - Complete challenge → reward claimable
 *   - Claim reward → participant updated, points info returned
 *   - Expired challenge → not active, cannot join
 *   - Double-claim prevention
 *   - Leaderboard ordering and rank
 *   - Capacity enforcement (maxParticipants)
 *   - Admin update (edit title, status)
 *   - Stats aggregation
 *   - Reset clears state
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeChallengesService,
  type Challenge,
  type ChallengeParticipant,
} from '@iraq-maps/testing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(s: string): string {
  return `user-${s}`;
}

function futureDate(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 3_600_000);
}

function pastDate(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 3_600_000);
}

function activeChallenge(svc: FakeChallengesService, opts: Partial<Parameters<typeof svc.createChallenge>[0]> = {}): Challenge {
  return svc.createChallenge({
    titleAr: 'تحدي المراجعات',
    titleEn: 'Review Challenge',
    type: 'review_count',
    targetCount: 5,
    reward: { type: 'points', points: 100 },
    startsAt: pastDate(1), // started 1 hour ago
    endsAt: futureDate(24), // ends in 24 hours
    ...opts,
  });
}

// ── Create challenge ──────────────────────────────────────────────────────────

describe('FakeChallengesService – create challenge', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('creates a challenge with a generated id', () => {
    const challenge = activeChallenge(svc);
    expect(typeof challenge.id).toBe('string');
    expect(challenge.id.length).toBeGreaterThan(0);
  });

  it('new active challenge appears in listActiveChallenges', () => {
    const challenge = activeChallenge(svc);
    const list = svc.listActiveChallenges();
    expect(list.some((c) => c.id === challenge.id)).toBe(true);
  });

  it('challenge that has not started yet has draft status', () => {
    const c = svc.createChallenge({
      titleAr: 'تحدي مستقبلي',
      titleEn: 'Future Challenge',
      type: 'review_count',
      targetCount: 3,
      reward: { type: 'points', points: 50 },
      startsAt: futureDate(2),
      endsAt: futureDate(10),
    });
    expect(c.status).toBe('draft');
  });

  it('challenge that started in the past and ends in the future has active status', () => {
    const c = activeChallenge(svc);
    expect(c.status).toBe('active');
  });

  it('creating a challenge with endsAt before startsAt throws INVALID_RANGE', () => {
    expect(() =>
      svc.createChallenge({
        titleAr: 'خطأ',
        titleEn: 'Error',
        type: 'review_count',
        targetCount: 3,
        reward: { type: 'points', points: 50 },
        startsAt: futureDate(5),
        endsAt: futureDate(2), // before startsAt
      }),
    ).toThrow();
    try {
      svc.createChallenge({
        titleAr: 'خطأ',
        titleEn: 'Error',
        type: 'review_count',
        targetCount: 3,
        reward: { type: 'points', points: 50 },
        startsAt: futureDate(5),
        endsAt: futureDate(2),
      });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('INVALID_RANGE');
    }
  });

  it('creating a challenge with targetCount=0 throws INVALID_TARGET', () => {
    expect(() =>
      svc.createChallenge({
        titleAr: 'صفر',
        titleEn: 'Zero',
        type: 'review_count',
        targetCount: 0,
        reward: { type: 'points', points: 50 },
        startsAt: pastDate(1),
        endsAt: futureDate(10),
      }),
    ).toThrow();
  });

  it('challenge with cityId filter only appears for that city', () => {
    const baghdadChallenge = activeChallenge(svc, { cityId: 'baghdad' });
    const basraChallenge = activeChallenge(svc, { cityId: 'basra' });
    const globalChallenge = activeChallenge(svc, { cityId: undefined }); // no city restriction

    const baghdadList = svc.listActiveChallenges({ cityId: 'baghdad' });
    const basraList = svc.listActiveChallenges({ cityId: 'basra' });

    // Baghdad challenge and global challenge appear for Baghdad
    expect(baghdadList.some((c) => c.id === baghdadChallenge.id)).toBe(true);
    expect(baghdadList.some((c) => c.id === globalChallenge.id)).toBe(true);
    expect(baghdadList.some((c) => c.id === basraChallenge.id)).toBe(false);

    // Basra challenge and global challenge appear for Basra
    expect(basraList.some((c) => c.id === basraChallenge.id)).toBe(true);
    expect(basraList.some((c) => c.id === globalChallenge.id)).toBe(true);
    expect(basraList.some((c) => c.id === baghdadChallenge.id)).toBe(false);
  });

  it('expired challenge does not appear in listActiveChallenges', () => {
    // Create an already-expired challenge (started and ended in the past)
    const expired = svc.createChallenge({
      titleAr: 'منتهي',
      titleEn: 'Expired',
      type: 'review_count',
      targetCount: 3,
      reward: { type: 'points', points: 50 },
      startsAt: pastDate(48),
      endsAt: pastDate(2), // ended 2 hours ago
    });
    // Manually set status to expired since the fake computes at create time
    svc.expireChallenge(expired.id);
    const list = svc.listActiveChallenges();
    expect(list.some((c) => c.id === expired.id)).toBe(false);
  });

  it('getChallenge returns challenge by id', () => {
    const c = activeChallenge(svc);
    const fetched = svc.getChallenge(c.id);
    expect(fetched?.id).toBe(c.id);
  });

  it('getChallenge returns null for nonexistent id', () => {
    expect(svc.getChallenge('ghost-challenge')).toBeNull();
  });
});

// ─── Progress tracking ─────────────────────────────────────────────────────────

describe('FakeChallengesService – progress tracking', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('joining a challenge creates a participant with zero progress', () => {
    const user = uid('prog-1');
    const c = activeChallenge(svc);
    const p = svc.joinChallenge(user, c.id);
    expect(p.currentCount).toBe(0);
    expect(p.completedAt).toBeNull();
    expect(p.rewardClaimedAt).toBeNull();
  });

  it('updateProgress increments the count by 1 by default', () => {
    const user = uid('prog-2');
    const c = activeChallenge(svc);
    const p = svc.updateProgress({ userId: user, challengeId: c.id });
    expect(p.currentCount).toBe(1);
  });

  it('updateProgress with custom delta increments by that amount', () => {
    const user = uid('prog-3');
    const c = activeChallenge(svc);
    svc.updateProgress({ userId: user, challengeId: c.id, delta: 3 });
    const p = svc.getProgress(user, c.id);
    expect(p?.currentCount).toBe(3);
  });

  it('getProgressPercentage returns correct value', () => {
    const user = uid('prog-4');
    const c = activeChallenge(svc, { targetCount: 10 });
    svc.updateProgress({ userId: user, challengeId: c.id, delta: 4 });
    const pct = svc.getProgressPercentage(user, c.id);
    expect(pct).toBe(40);
  });

  it('progress is capped at targetCount', () => {
    const user = uid('prog-5');
    const c = activeChallenge(svc, { targetCount: 3 });
    svc.updateProgress({ userId: user, challengeId: c.id, delta: 10 });
    const p = svc.getProgress(user, c.id);
    expect(p?.currentCount).toBe(3);
  });

  it('progress 0 percent when not joined', () => {
    const user = uid('prog-6');
    const c = activeChallenge(svc);
    expect(svc.getProgressPercentage(user, c.id)).toBe(0);
  });

  it('getProgress returns null if not participating', () => {
    const user = uid('prog-7');
    const c = activeChallenge(svc);
    expect(svc.getProgress(user, c.id)).toBeNull();
  });

  it('progress is tracked independently per user', () => {
    const c = activeChallenge(svc, { targetCount: 10 });
    const u1 = uid('prog-8a');
    const u2 = uid('prog-8b');
    svc.updateProgress({ userId: u1, challengeId: c.id, delta: 3 });
    svc.updateProgress({ userId: u2, challengeId: c.id, delta: 7 });

    expect(svc.getProgressPercentage(u1, c.id)).toBe(30);
    expect(svc.getProgressPercentage(u2, c.id)).toBe(70);
  });

  it('updateProgress on a non-active challenge throws CHALLENGE_NOT_ACTIVE', () => {
    const user = uid('prog-9');
    const c = activeChallenge(svc);
    svc.expireChallenge(c.id);

    expect(() => svc.updateProgress({ userId: user, challengeId: c.id })).toThrow();
    try {
      svc.updateProgress({ userId: user, challengeId: c.id });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('CHALLENGE_NOT_ACTIVE');
    }
  });
});

// ─── Completion & reward claiming ─────────────────────────────────────────────

describe('FakeChallengesService – completion and reward claiming', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('completing a challenge sets completedAt', () => {
    const user = uid('comp-1');
    const c = activeChallenge(svc, { targetCount: 3 });
    svc.updateProgress({ userId: user, challengeId: c.id, delta: 3 });
    const p = svc.getProgress(user, c.id);
    expect(p?.completedAt).toBeInstanceOf(Date);
  });

  it('isCompleted returns true after reaching targetCount', () => {
    const user = uid('comp-2');
    const c = activeChallenge(svc, { targetCount: 2 });
    svc.updateProgress({ userId: user, challengeId: c.id });
    expect(svc.isCompleted(user, c.id)).toBe(false);
    svc.updateProgress({ userId: user, challengeId: c.id });
    expect(svc.isCompleted(user, c.id)).toBe(true);
  });

  it('isRewardClaimable returns true after completion and false before', () => {
    const user = uid('comp-3');
    const c = activeChallenge(svc, { targetCount: 1 });
    expect(svc.isRewardClaimable(user, c.id)).toBe(false);
    svc.updateProgress({ userId: user, challengeId: c.id });
    expect(svc.isRewardClaimable(user, c.id)).toBe(true);
  });

  it('claimReward returns the reward and updates participant', () => {
    const user = uid('comp-4');
    const c = activeChallenge(svc, {
      targetCount: 1,
      reward: { type: 'points', points: 500 },
    });
    svc.updateProgress({ userId: user, challengeId: c.id });

    const { reward, participant } = svc.claimReward(user, c.id);
    expect(reward.type).toBe('points');
    expect(reward.points).toBe(500);
    expect(participant.rewardClaimedAt).toBeInstanceOf(Date);
  });

  it('isRewardClaimable returns false after reward has been claimed', () => {
    const user = uid('comp-5');
    const c = activeChallenge(svc, { targetCount: 1 });
    svc.updateProgress({ userId: user, challengeId: c.id });
    svc.claimReward(user, c.id);
    expect(svc.isRewardClaimable(user, c.id)).toBe(false);
  });

  it('claiming reward twice throws ALREADY_CLAIMED', () => {
    const user = uid('comp-6');
    const c = activeChallenge(svc, { targetCount: 1 });
    svc.updateProgress({ userId: user, challengeId: c.id });
    svc.claimReward(user, c.id);

    expect(() => svc.claimReward(user, c.id)).toThrow();
    try {
      svc.claimReward(user, c.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('ALREADY_CLAIMED');
    }
  });

  it('claiming reward on incomplete challenge throws NOT_COMPLETED', () => {
    const user = uid('comp-7');
    const c = activeChallenge(svc, { targetCount: 5 });
    svc.updateProgress({ userId: user, challengeId: c.id, delta: 2 });

    expect(() => svc.claimReward(user, c.id)).toThrow();
    try {
      svc.claimReward(user, c.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('NOT_COMPLETED');
    }
  });

  it('claiming reward for non-participating user throws NOT_PARTICIPATING', () => {
    const user = uid('comp-8');
    const c = activeChallenge(svc);

    expect(() => svc.claimReward(user, c.id)).toThrow();
    try {
      svc.claimReward(user, c.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('NOT_PARTICIPATING');
    }
  });
});

// ─── Expired challenge ────────────────────────────────────────────────────────

describe('FakeChallengesService – expired challenge handling', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('expired challenge is not returned by listActiveChallenges', () => {
    const c = activeChallenge(svc);
    svc.expireChallenge(c.id);
    const list = svc.listActiveChallenges();
    expect(list.some((x) => x.id === c.id)).toBe(false);
  });

  it('joining an expired challenge throws CHALLENGE_NOT_ACTIVE', () => {
    const user = uid('exp-1');
    const c = activeChallenge(svc);
    svc.expireChallenge(c.id);

    expect(() => svc.joinChallenge(user, c.id)).toThrow();
    try {
      svc.joinChallenge(user, c.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('CHALLENGE_NOT_ACTIVE');
    }
  });

  it('expireChallenge sets status to expired', () => {
    const c = activeChallenge(svc);
    const expired = svc.expireChallenge(c.id);
    expect(expired.status).toBe('expired');
  });

  it('expiring a nonexistent challenge throws NOT_FOUND', () => {
    expect(() => svc.expireChallenge('ghost')).toThrow();
    try {
      svc.expireChallenge('ghost');
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('NOT_FOUND');
    }
  });
});

// ─── Capacity enforcement ─────────────────────────────────────────────────────

describe('FakeChallengesService – capacity enforcement', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('challenge with maxParticipants rejects participants beyond the limit', () => {
    const c = activeChallenge(svc, { maxParticipants: 2 });
    svc.joinChallenge(uid('cap-1'), c.id);
    svc.joinChallenge(uid('cap-2'), c.id);

    expect(() => svc.joinChallenge(uid('cap-3'), c.id)).toThrow();
    try {
      svc.joinChallenge(uid('cap-3'), c.id);
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('CHALLENGE_FULL');
    }
  });

  it('challenge with null maxParticipants accepts unlimited participants', () => {
    const c = activeChallenge(svc, { maxParticipants: undefined });
    for (let i = 0; i < 20; i++) {
      expect(() => svc.joinChallenge(uid(`unlimited-${i}`), c.id)).not.toThrow();
    }
  });

  it('joining same challenge twice is idempotent', () => {
    const user = uid('idem-1');
    const c = activeChallenge(svc);
    const p1 = svc.joinChallenge(user, c.id);
    const p2 = svc.joinChallenge(user, c.id);
    expect(p1.id).toBe(p2.id);
  });
});

// ─── Leaderboard ──────────────────────────────────────────────────────────────

describe('FakeChallengesService – challenge leaderboard', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('getChallengeLeaderboard returns participants ordered by currentCount descending', () => {
    const c = activeChallenge(svc, { targetCount: 10 });
    svc.updateProgress({ userId: uid('lb-a'), challengeId: c.id, delta: 7 });
    svc.updateProgress({ userId: uid('lb-b'), challengeId: c.id, delta: 3 });
    svc.updateProgress({ userId: uid('lb-c'), challengeId: c.id, delta: 9 });

    const board = svc.getChallengeLeaderboard(c.id);
    for (let i = 1; i < board.length; i++) {
      expect(board[i - 1]!.currentCount).toBeGreaterThanOrEqual(board[i]!.currentCount);
    }
  });

  it('top participant has rank 1', () => {
    const c = activeChallenge(svc, { targetCount: 10 });
    svc.updateProgress({ userId: uid('rank-top'), challengeId: c.id, delta: 10 });
    svc.updateProgress({ userId: uid('rank-mid'), challengeId: c.id, delta: 5 });

    const board = svc.getChallengeLeaderboard(c.id);
    expect(board[0]!.rank).toBe(1);
    expect(board[0]!.userId).toBe(uid('rank-top'));
  });

  it('leaderboard limit is respected', () => {
    const c = activeChallenge(svc, { targetCount: 10 });
    for (let i = 0; i < 5; i++) {
      svc.updateProgress({ userId: uid(`lb-lim-${i}`), challengeId: c.id, delta: i + 1 });
    }
    const board = svc.getChallengeLeaderboard(c.id, { limit: 3 });
    expect(board.length).toBeLessThanOrEqual(3);
  });

  it('empty challenge has an empty leaderboard', () => {
    const c = activeChallenge(svc);
    expect(svc.getChallengeLeaderboard(c.id)).toHaveLength(0);
  });

  it('leaderboard updates after progress update', () => {
    const c = activeChallenge(svc, { targetCount: 10 });
    const user = uid('lb-upd');

    const before = svc.getChallengeLeaderboard(c.id);
    expect(before.some((e) => e.userId === user)).toBe(false);

    svc.updateProgress({ userId: user, challengeId: c.id });
    const after = svc.getChallengeLeaderboard(c.id);
    expect(after.some((e) => e.userId === user)).toBe(true);
  });
});

// ─── Stats & admin ────────────────────────────────────────────────────────────

describe('FakeChallengesService – stats and admin', () => {
  let svc: FakeChallengesService;

  beforeEach(() => { svc = new FakeChallengesService(); });
  afterEach(() => { svc.reset(); });

  it('getChallengeStats returns correct participantCount and completedCount', () => {
    const c = activeChallenge(svc, { targetCount: 2 });
    const u1 = uid('stats-1');
    const u2 = uid('stats-2');
    const u3 = uid('stats-3');

    svc.updateProgress({ userId: u1, challengeId: c.id, delta: 2 }); // completed
    svc.updateProgress({ userId: u2, challengeId: c.id, delta: 1 }); // partial
    svc.updateProgress({ userId: u3, challengeId: c.id, delta: 2 }); // completed

    const stats = svc.getChallengeStats(c.id);
    expect(stats.participantCount).toBe(3);
    expect(stats.completedCount).toBe(2);
  });

  it('getChallengeStats claimedCount reflects reward claims', () => {
    const c = activeChallenge(svc, { targetCount: 1 });
    const u1 = uid('claim-stats-1');
    const u2 = uid('claim-stats-2');

    svc.updateProgress({ userId: u1, challengeId: c.id });
    svc.updateProgress({ userId: u2, challengeId: c.id });
    svc.claimReward(u1, c.id);

    const stats = svc.getChallengeStats(c.id);
    expect(stats.claimedCount).toBe(1);
    expect(stats.completedCount).toBe(2);
  });

  it('adminUpdateChallenge can update title', () => {
    const c = activeChallenge(svc);
    const updated = svc.adminUpdateChallenge(c.id, { titleAr: 'عنوان جديد' });
    expect(updated.titleAr).toBe('عنوان جديد');
    expect(svc.getChallenge(c.id)?.titleAr).toBe('عنوان جديد');
  });

  it('adminUpdateChallenge can update status', () => {
    const c = activeChallenge(svc);
    svc.adminUpdateChallenge(c.id, { status: 'draft' });
    // paused doesn't appear in active list
    const list = svc.listActiveChallenges();
    expect(list.some((x) => x.id === c.id)).toBe(false);
  });

  it('adminUpdateChallenge on nonexistent challenge throws NOT_FOUND', () => {
    expect(() => svc.adminUpdateChallenge('ghost', { titleEn: 'test' })).toThrow();
    try {
      svc.adminUpdateChallenge('ghost', { titleEn: 'test' });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe('NOT_FOUND');
    }
  });

  it('getUserChallenges returns all challenges for a user', () => {
    const user = uid('user-challenges');
    const c1 = activeChallenge(svc, { targetCount: 5 });
    const c2 = activeChallenge(svc, { targetCount: 3 });
    svc.updateProgress({ userId: user, challengeId: c1.id });
    svc.updateProgress({ userId: user, challengeId: c2.id, delta: 3 }); // complete

    const all = svc.getUserChallenges(user);
    expect(all.length).toBe(2);

    const active = svc.getUserChallenges(user, { status: 'active' });
    const completed = svc.getUserChallenges(user, { status: 'completed' });
    expect(active.length).toBe(1);
    expect(completed.length).toBe(1);
  });

  it('reset clears all challenges and participants', () => {
    const c = activeChallenge(svc);
    svc.updateProgress({ userId: uid('reset-u'), challengeId: c.id });
    svc.reset();
    expect(svc.allChallenges).toHaveLength(0);
    expect(svc.allParticipants).toHaveLength(0);
    expect(svc.allEvents).toHaveLength(0);
  });
});
