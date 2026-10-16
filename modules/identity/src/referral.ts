/**
 * referral.ts — referral codes, check-ins, and activity feed for the identity module.
 *
 * Functions:
 *   - generateReferralCode(userId)       → unique 8-char uppercase code
 *   - getReferralStats(userId)            → referred count, points earned
 *   - applyReferralCode(userId, code)     → apply someone else's code
 *   - createCheckin(...)                  → check in at a place
 *   - getCheckinHistory(userId, pagination)
 *   - getMyActivity(userId, types, startDate, pagination)
 */
import { randomBytes } from 'node:crypto';
import type { UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { and, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Logger } from '@iraq-maps/observability';

// ── Schema ────────────────────────────────────────────────────────────────────

const identity = pgSchema('identity');

export const referralCodes = identity.table('referral_codes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').$type<UserId>().notNull().unique(),
  code:      text('code').notNull().unique(),              // 8-char uppercase
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const referrals = identity.table('referrals', {
  id:           uuid('id').primaryKey().defaultRandom(),
  referrerId:   uuid('referrer_id').$type<UserId>().notNull(),
  refereeId:    uuid('referee_id').$type<UserId>().notNull().unique(),
  pointsEarned: integer('points_earned').notNull().default(200),
  joinedAt:     timestamp('joined_at', { withTimezone: true }),
  appliedAt:    timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CheckinType   = 'visiting' | 'dining' | 'working';
export type Visibility    = 'public' | 'friends' | 'only_me';
export type ActivityType  = 'review' | 'post' | 'checkin' | 'follow' | 'like' | 'comment' | 'save';

export const checkins = identity.table('checkins', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').$type<UserId>().notNull(),
  placeId:      text('place_id').notNull(),
  type:         text('type', { enum: ['visiting', 'dining', 'working'] }).$type<CheckinType>().notNull(),
  note:         text('note'),
  photoUri:     text('photo_uri'),
  visibility:   text('visibility', { enum: ['public', 'friends', 'only_me'] }).$type<Visibility>().notNull().default('public'),
  shareToFeed:  boolean('share_to_feed').notNull().default(true),
  checkedInAt:  timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userActivity = identity.table('user_activity', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').$type<UserId>().notNull(),
  type:        text('type', { enum: ['review', 'post', 'checkin', 'follow', 'like', 'comment', 'save'] }).$type<ActivityType>().notNull(),
  description: text('description').notNull(),
  targetName:  text('target_name').notNull(),
  targetId:    text('target_id').notNull(),
  privacy:     text('privacy', { enum: ['public', 'friends', 'only_me'] }).$type<Visibility>().notNull().default('public'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Constants ─────────────────────────────────────────────────────────────────

const CODE_LENGTH = 8;
const CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const POINTS_PER_REFERRAL = 200;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => CODE_CHARS[b % CODE_CHARS.length])
    .join('');
}

// ── Types returned by these functions ─────────────────────────────────────────

export type ReferralStats = {
  code: string;
  link: string;
  totalReferred: number;
  totalPoints: number;
  pendingCount: number;
};

export type ReferredFriend = {
  id: string;
  name: string | null;
  joinedAt: string | null;
  pointsEarned: number;
};

export type CheckinRecord = {
  id: string;
  placeId: string;
  type: CheckinType;
  note: string | null;
  photoUri: string | null;
  visibility: Visibility;
  shareToFeed: boolean;
  checkedInAt: string;
};

export type ActivityRecord = {
  id: string;
  type: ActivityType;
  description: string;
  targetName: string;
  targetId: string;
  privacy: Visibility;
  createdAt: string;
};

export type Pagination = { limit: number; offset: number };

// ── Service class ─────────────────────────────────────────────────────────────

export class ReferralService {
  constructor(
    private readonly db: Db,
    private readonly appBaseUrl: string,
    private readonly log: Logger,
  ) {}

  /**
   * Returns (or creates) the referral code for this user.
   * The code is exactly 8 uppercase characters, generated from CODE_CHARS to avoid ambiguous characters.
   */
  async generateReferralCode(userId: UserId): Promise<string> {
    // Return existing code if there is one
    const [existing] = await this.db
      .select({ code: referralCodes.code })
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId));
    if (existing) return existing.code;

    // Generate a unique code (retry on collision — astronomically unlikely)
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const [inserted] = await this.db
        .insert(referralCodes)
        .values({ userId, code })
        .onConflictDoNothing({ target: referralCodes.code })
        .returning({ code: referralCodes.code });
      if (inserted) {
        this.log.info({ userId, code }, 'referral code created');
        return inserted.code;
      }
    }
    throw new Error(`Failed to generate unique referral code for user ${userId}`);
  }

  /**
   * Returns referral stats for the dashboard:
   *   - the user's referral code (creating it if needed)
   *   - total referred (applied + joined)
   *   - total points earned
   *   - pending count (applied but not yet joined)
   *   - shareable link
   */
  async getReferralStats(userId: UserId): Promise<ReferralStats> {
    const code = await this.generateReferralCode(userId);

    const rows = await this.db
      .select({
        joinedAt:     referrals.joinedAt,
        pointsEarned: referrals.pointsEarned,
      })
      .from(referrals)
      .where(eq(referrals.referrerId, userId));

    const totalReferred = rows.length;
    const pendingCount  = rows.filter((r) => !r.joinedAt).length;
    const totalPoints   = rows.reduce((sum, r) => sum + r.pointsEarned, 0);

    return {
      code,
      link: `${this.appBaseUrl}/r/${code}`,
      totalReferred,
      totalPoints,
      pendingCount,
    };
  }

  /**
   * Applies a referral code to a user.
   * - A user may only apply a code once (referee.unique constraint).
   * - A user cannot apply their own code.
   * - Marks the referral as pending (joinedAt = null until the referee completes onboarding).
   */
  async applyReferralCode(userId: UserId, code: string): Promise<{ ok: boolean; reason?: string }> {
    const upperCode = code.trim().toUpperCase();

    const [codeRow] = await this.db
      .select({ userId: referralCodes.userId })
      .from(referralCodes)
      .where(eq(referralCodes.code, upperCode));

    if (!codeRow) return { ok: false, reason: 'code_not_found' };
    if (codeRow.userId === userId) return { ok: false, reason: 'own_code' };

    try {
      await this.db.insert(referrals).values({
        referrerId:   codeRow.userId,
        refereeId:    userId,
        pointsEarned: POINTS_PER_REFERRAL,
        joinedAt:     null,
      });
      this.log.info({ referrerId: codeRow.userId, refereeId: userId }, 'referral applied');
      return { ok: true };
    } catch {
      // unique constraint on refereeId: already applied
      return { ok: false, reason: 'already_applied' };
    }
  }

  /**
   * Marks a referral as fully joined (call this after the referee completes their profile).
   */
  async markReferralJoined(refereeId: UserId): Promise<void> {
    await this.db
      .update(referrals)
      .set({ joinedAt: new Date() })
      .where(and(eq(referrals.refereeId, refereeId), sql`joined_at IS NULL`));
  }

  // ── Check-ins ───────────────────────────────────────────────────────────────

  /**
   * Creates a check-in record for a user at a place.
   * Returns the created check-in id.
   */
  async createCheckin(
    userId:      UserId,
    placeId:     string,
    type:        CheckinType,
    note:        string | null,
    photoUri:    string | null,
    visibility:  Visibility,
    shareToFeed: boolean,
  ): Promise<string> {
    const [row] = await this.db
      .insert(checkins)
      .values({ userId, placeId, type, note, photoUri, visibility, shareToFeed })
      .returning({ id: checkins.id });

    if (!row) throw new Error('checkin insert returned no row');
    this.log.info({ userId, placeId, type }, 'check-in created');
    return row.id;
  }

  /**
   * Returns paginated check-in history for a user, newest first.
   */
  async getCheckinHistory(userId: UserId, pagination: Pagination): Promise<CheckinRecord[]> {
    const rows = await this.db
      .select()
      .from(checkins)
      .where(eq(checkins.userId, userId))
      .orderBy(desc(checkins.checkedInAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return rows.map((r) => ({
      id:          r.id,
      placeId:     r.placeId,
      type:        r.type,
      note:        r.note,
      photoUri:    r.photoUri,
      visibility:  r.visibility,
      shareToFeed: r.shareToFeed,
      checkedInAt: r.checkedInAt.toISOString(),
    }));
  }

  /**
   * Deletes a single check-in. Only the owning user may delete their own check-ins.
   * Returns true if a row was deleted.
   */
  async deleteCheckin(userId: UserId, checkinId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(checkins)
      .where(and(eq(checkins.id, checkinId), eq(checkins.userId, userId)))
      .returning({ id: checkins.id });
    return deleted !== undefined;
  }

  // ── Activity feed ───────────────────────────────────────────────────────────

  /**
   * Writes an activity record for a user (called by other modules or HTTP handlers
   * after an action is taken — review submitted, post created, etc.).
   */
  async recordActivity(
    userId:      UserId,
    type:        ActivityType,
    description: string,
    targetName:  string,
    targetId:    string,
    privacy:     Visibility = 'public',
  ): Promise<void> {
    await this.db.insert(userActivity).values({ userId, type, description, targetName, targetId, privacy });
  }

  /**
   * Returns activity feed items for a user, filtered by type and/or start date.
   * Newest first. Pagination is offset-based.
   */
  async getMyActivity(
    userId:    UserId,
    types:     ActivityType[],
    startDate: Date | null,
    pagination: Pagination,
  ): Promise<ActivityRecord[]> {
    const conditions: SQL[] = [eq(userActivity.userId, userId)];
    if (types.length > 0) conditions.push(inArray(userActivity.type, types));
    if (startDate)        conditions.push(gte(userActivity.createdAt, startDate));

    const rows = await this.db
      .select()
      .from(userActivity)
      .where(and(...conditions))
      .orderBy(desc(userActivity.createdAt))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return rows.map((r) => ({
      id:          r.id,
      type:        r.type,
      description: r.description,
      targetName:  r.targetName,
      targetId:    r.targetId,
      privacy:     r.privacy,
      createdAt:   r.createdAt.toISOString(),
    }));
  }

  /**
   * Updates the privacy level of an activity item. Only the owner may change it.
   * Returns true if a row was updated.
   */
  async setActivityPrivacy(userId: UserId, activityId: string, privacy: Visibility): Promise<boolean> {
    const [updated] = await this.db
      .update(userActivity)
      .set({ privacy })
      .where(and(eq(userActivity.id, activityId), eq(userActivity.userId, userId)))
      .returning({ id: userActivity.id });
    return updated !== undefined;
  }

  /**
   * Deletes an activity item. Only the owner may delete.
   * Returns true if a row was deleted.
   */
  async deleteActivity(userId: UserId, activityId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(userActivity)
      .where(and(eq(userActivity.id, activityId), eq(userActivity.userId, userId)))
      .returning({ id: userActivity.id });
    return deleted !== undefined;
  }

  /**
   * Returns counts of each activity type for the current calendar month.
   * Used for the monthly summary card in ActivityFeedScreen.
   */
  async getMonthlySummary(userId: UserId): Promise<Record<ActivityType, number>> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const rows = await this.db
      .select({
        type:  userActivity.type,
        count: sql<string>`count(*)`,
      })
      .from(userActivity)
      .where(and(eq(userActivity.userId, userId), gte(userActivity.createdAt, startOfMonth)))
      .groupBy(userActivity.type);

    const defaults: Record<ActivityType, number> = {
      review: 0, post: 0, checkin: 0, follow: 0, like: 0, comment: 0, save: 0,
    };
    for (const row of rows) {
      defaults[row.type] = parseInt(row.count, 10);
    }
    return defaults;
  }

  /**
   * Returns the current and best check-in streak for a user (consecutive calendar days).
   */
  async getCheckinStreak(userId: UserId): Promise<{ current: number; best: number; todayDone: boolean }> {
    // Pull the last 365 distinct check-in days, newest first
    const rows = await this.db
      .selectDistinct({ day: sql<string>`date_trunc('day', checked_in_at AT TIME ZONE 'Asia/Baghdad')` })
      .from(checkins)
      .where(and(eq(checkins.userId, userId), gte(checkins.checkedInAt, new Date(Date.now() - 365 * 86_400_000))))
      .orderBy(desc(sql`1`));

    if (rows.length === 0) return { current: 0, best: 0, todayDone: false };

    const today = new Date().toISOString().slice(0, 10);
    const todayDone = rows[0]?.day?.slice(0, 10) === today;

    // Walk backward through days to compute streaks
    let best    = 0;
    let streak  = 0;
    let prev: string | null = null;

    for (const { day } of rows) {
      const d = day?.slice(0, 10) ?? '';
      if (!prev) { streak = 1; prev = d; continue; }
      const prevDate = new Date(prev);
      const curDate  = new Date(d);
      const diffDays = Math.round((prevDate.getTime() - curDate.getTime()) / 86_400_000);
      if (diffDays === 1) { streak++; } else { streak = 1; }
      if (streak > best) best = streak;
      prev = d;
    }
    // Final streak value is the tail (oldest)
    const current = streak;
    if (current > best) best = current;

    return { current, best, todayDone };
  }
}
