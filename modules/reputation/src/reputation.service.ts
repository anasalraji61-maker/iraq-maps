/**
 * ReputationService — core logic for points, levels, badges and leaderboards.
 *
 * Points reasons (stable keys – used in DB and event payloads):
 *   add_place            +50
 *   write_review         +20
 *   review_helpful_10    +50   (review received 10 helpful votes)
 *   report_incident      +10
 *   incident_confirmed   +30
 *   first_review_bonus   +30   (first reviewer at a place)
 *   post_likes_50        +25   (post reached 50 likes)
 *   login_streak_7       +100  (7-day login streak)
 *   complete_profile     +50
 *
 * Levels (by total points):
 *   explorer      0+
 *   contributor   100+
 *   scout         500+
 *   local_guide   2000+
 *   expert        5000+
 *   ambassador    10000+
 */

import {
  type EventBus,
  type UserId,
  PortTokens,
} from '@iraq-maps/contracts';
import { type Db } from '@iraq-maps/db-kit';
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, sql, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  userReputationTable,
  pointsLedgerTable,
  badgeDefinitionTable,
  userBadgeTable,
} from './schema';
import type {
  ReputationLevel,
  ReputationSummary,
  BadgeDefinition,
  UserBadge,
  PointsEntry,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardResult,
  BadgeCheckContext,
} from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Points awarded per action. */
export const POINT_VALUES: Record<string, number> = {
  add_place:           50,
  write_review:        20,
  review_helpful_10:   50,
  report_incident:     10,
  incident_confirmed:  30,
  first_review_bonus:  30,
  post_likes_50:       25,
  login_streak_7:      100,
  complete_profile:    50,
} as const;

/** Level thresholds – ascending order. */
const LEVEL_THRESHOLDS: Array<{ level: ReputationLevel; min: number }> = [
  { level: 'explorer',    min: 0 },
  { level: 'contributor', min: 100 },
  { level: 'scout',       min: 500 },
  { level: 'local_guide', min: 2000 },
  { level: 'expert',      min: 5000 },
  { level: 'ambassador',  min: 10000 },
];

/** Next level thresholds by current level (null = already at max). */
const NEXT_LEVEL_THRESHOLD: Record<ReputationLevel, number | null> = {
  explorer:    100,
  contributor: 500,
  scout:       2000,
  local_guide: 5000,
  expert:      10000,
  ambassador:  null,
};

const LEVEL_ORDER: ReputationLevel[] = [
  'explorer', 'contributor', 'scout', 'local_guide', 'expert', 'ambassador',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function periodToDate(period: LeaderboardPeriod): Date | null {
  if (period === 'all_time') return null;
  const d = new Date();
  if (period === 'week') {
    d.setDate(d.getDate() - 7);
  } else {
    d.setMonth(d.getMonth() - 1);
  }
  return d;
}

// ── Service ───────────────────────────────────────────────────────────────────

const noopEventBus: EventBus = {
  publish: async () => {},
  subscribe: () => () => {},
};

@Injectable()
export class ReputationService {
  constructor(
    @Inject('REPUTATION_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly bus: EventBus,
  ) {}

  // ── Level calculation ───────────────────────────────────────────────────────

  /**
   * Derive level from total points.
   * Returns the highest level whose min threshold is <= points.
   */
  calculateLevel(points: number): ReputationLevel {
    let level: ReputationLevel = 'explorer';
    for (const entry of LEVEL_THRESHOLDS) {
      if (points >= entry.min) {
        level = entry.level;
      } else {
        break;
      }
    }
    return level;
  }

  /**
   * Progress toward next level: { current, target, percentage }.
   * Returns null for ambassador (already max).
   */
  levelProgress(points: number): {
    currentMin: number;
    nextMin: number | null;
    percentage: number;
  } {
    const level = this.calculateLevel(points);
    const currentMin = LEVEL_THRESHOLDS.find((l) => l.level === level)!.min;
    const nextMin = NEXT_LEVEL_THRESHOLD[level];
    if (nextMin === null) {
      return { currentMin, nextMin: null, percentage: 100 };
    }
    const percentage = Math.min(
      100,
      Math.round(((points - currentMin) / (nextMin - currentMin)) * 100),
    );
    return { currentMin, nextMin, percentage };
  }

  // ── Reputation summary ──────────────────────────────────────────────────────

  /**
   * Fetch (or lazily create) a user's reputation record.
   * Returns points, level, progress and earned badge count.
   */
  async getReputation(userId: UserId): Promise<ReputationSummary> {
    const [row] = await this.db
      .select()
      .from(userReputationTable)
      .where(eq(userReputationTable.userId, userId as string))
      .limit(1);

    if (!row) {
      // Lazily create the record on first read
      await this.db
        .insert(userReputationTable)
        .values({ userId: userId as string })
        .onConflictDoNothing();
      const progress = this.levelProgress(0);
      return {
        userId,
        totalPoints: 0,
        level: 'explorer',
        levelProgress: progress,
        badgeCount: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    const points = row.totalPoints;
    const level = this.calculateLevel(points);
    const progress = this.levelProgress(points);

    const badgeCountRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userBadgeTable)
      .where(eq(userBadgeTable.userId, userId as string));
    const badgeCount = badgeCountRows[0]?.count ?? 0;

    return {
      userId,
      totalPoints: points,
      level,
      levelProgress: progress,
      badgeCount,
      updatedAt: toIso(row.updatedAt),
    };
  }

  // ── Award points ────────────────────────────────────────────────────────────

  /**
   * Award points to a user.
   * Creates the reputation row if it doesn't exist.
   * Emits `reputation.points.awarded.v1`.
   * Then triggers badge checks.
   *
   * @param userId   - target user
   * @param reason   - one of the POINT_VALUES keys (or custom)
   * @param points   - amount to award (must be > 0)
   * @param meta     - arbitrary payload stored with the ledger entry
   * @param city     - optional city for leaderboard partitioning
   */
  async awardPoints(
    userId: UserId,
    reason: string,
    points: number,
    meta: Record<string, unknown> = {},
    city?: string,
  ): Promise<{ newTotal: number; newLevel: ReputationLevel; leveled_up: boolean }> {
    if (points <= 0) {
      throw new Error('points must be positive');
    }

    // Upsert reputation row
    await this.db
      .insert(userReputationTable)
      .values({ userId: userId as string })
      .onConflictDoNothing();

    // Insert ledger entry
    const entryId = randomUUID();
    await this.db.insert(pointsLedgerTable).values({
      id: entryId,
      userId: userId as string,
      points,
      reason,
      meta,
      city: city ?? null,
    });

    // Update totals and recalculate level
    const updatedRows = await this.db
      .update(userReputationTable)
      .set({
        totalPoints: sql`${userReputationTable.totalPoints} + ${points}`,
        updatedAt: sql`now()`,
      })
      .where(eq(userReputationTable.userId, userId as string))
      .returning();

    const updated = updatedRows[0];
    if (!updated) throw new Error('reputation row missing after upsert');

    const newTotal = updated.totalPoints;
    const oldLevel = updated.level as ReputationLevel;
    const newLevel = this.calculateLevel(newTotal);
    const leveled_up = newLevel !== oldLevel && LEVEL_ORDER.indexOf(newLevel) > LEVEL_ORDER.indexOf(oldLevel);

    if (leveled_up) {
      await this.db
        .update(userReputationTable)
        .set({ level: newLevel, updatedAt: sql`now()` })
        .where(eq(userReputationTable.userId, userId as string));
    }

    // Emit domain event
    await this.bus.publish({
      name: 'reputation.points.awarded.v1',
      payload: {
        userId,
        points,
        reason,
        newTotal,
        newLevel,
        leveledUp: leveled_up,
        city: city ?? null,
        meta,
      },
    } as any);

    // Async badge check (fire and forget – errors are non-fatal)
    this.checkAndAwardBadges(userId, { city }).catch(() => {});

    return { newTotal, newLevel, leveled_up };
  }

  // ── Badges ──────────────────────────────────────────────────────────────────

  /**
   * Return all badge definitions with earned/locked status for the user.
   */
  async getUserBadges(userId: UserId): Promise<UserBadge[]> {
    const [definitions, earned] = await Promise.all([
      this.db
        .select()
        .from(badgeDefinitionTable)
        .orderBy(asc(badgeDefinitionTable.sortOrder)),
      this.db
        .select()
        .from(userBadgeTable)
        .where(eq(userBadgeTable.userId, userId as string)),
    ]);

    const earnedSet = new Map(
      earned.map((e) => [e.badgeId, toIso(e.awardedAt)]),
    );

    return definitions.map((def) => ({
      id: def.id,
      nameAr: def.nameAr,
      nameCkb: def.nameCkb,
      nameEn: def.nameEn,
      descriptionAr: def.descriptionAr,
      descriptionCkb: def.descriptionCkb,
      descriptionEn: def.descriptionEn,
      emoji: def.emoji,
      category: def.category as BadgeDefinition['category'],
      threshold: def.threshold ?? undefined,
      sortOrder: def.sortOrder,
      earned: earnedSet.has(def.id),
      awardedAt: earnedSet.get(def.id) ?? null,
    }));
  }

  /**
   * Check badge eligibility for a user and grant any newly-earned badges.
   * Each badge is idempotent: already-earned badges are skipped.
   *
   * ctx.counters can be supplied to avoid extra DB queries when the caller
   * already has fresh counts.
   */
  async checkAndAwardBadges(
    userId: UserId,
    ctx: BadgeCheckContext = {},
  ): Promise<string[]> {
    // Fetch current reputation + counts in parallel
    const [repRow, earnedRows] = await Promise.all([
      this.db
        .select()
        .from(userReputationTable)
        .where(eq(userReputationTable.userId, userId as string))
        .limit(1),
      this.db
        .select({ badgeId: userBadgeTable.badgeId })
        .from(userBadgeTable)
        .where(eq(userBadgeTable.userId, userId as string)),
    ]);

    const earned = new Set(earnedRows.map((r) => r.badgeId));
    const rep = repRow[0];
    const points = rep?.totalPoints ?? 0;
    const level = this.calculateLevel(points);

    // Fetch counters from DB if not provided
    const counters = await this._fetchCounters(userId, ctx);

    const toGrant: string[] = [];

    // ── Badge eligibility rules ──────────────────────────────────────────────

    if (!earned.has('first_steps') && counters.checkins >= 1) {
      toGrant.push('first_steps');
    }
    if (!earned.has('reviewer') && counters.reviews >= 5) {
      toGrant.push('reviewer');
    }
    if (!earned.has('top_reviewer') && counters.reviews >= 50) {
      toGrant.push('top_reviewer');
    }
    if (!earned.has('safety_first') && counters.incidents >= 10) {
      toGrant.push('safety_first');
    }
    if (!earned.has('explorer') && counters.distinctPlaces >= 10) {
      toGrant.push('explorer');
    }
    if (!earned.has('baghdad_pro') && counters.baghdadVisits >= 50) {
      toGrant.push('baghdad_pro');
    }
    if (!earned.has('photographer') && counters.photos >= 20) {
      toGrant.push('photographer');
    }
    if (!earned.has('conversationalist') && counters.messages >= 100) {
      toGrant.push('conversationalist');
    }
    if (!earned.has('community_pillar') && counters.helpfulVotes >= 500) {
      toGrant.push('community_pillar');
    }
    if (
      !earned.has('local_expert') &&
      ['expert', 'ambassador'].includes(level)
    ) {
      toGrant.push('local_expert');
    }

    // Grant all eligible new badges
    if (toGrant.length > 0) {
      await this.db
        .insert(userBadgeTable)
        .values(
          toGrant.map((badgeId) => ({
            userId: userId as string,
            badgeId,
          })),
        )
        .onConflictDoNothing();

      // Emit events
      for (const badgeId of toGrant) {
        await this.bus.publish({
          name: 'reputation.badge.awarded.v1',
          payload: { userId, badgeId },
        } as any);
      }
    }

    return toGrant;
  }

  // ── Points history ──────────────────────────────────────────────────────────

  /**
   * Return recent points ledger entries for a user, newest first.
   */
  async getPointsHistory(
    userId: UserId,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: PointsEntry[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 100);

    let query = this.db
      .select()
      .from(pointsLedgerTable)
      .where(
        opts.cursor
          ? and(
              eq(pointsLedgerTable.userId, userId as string),
              lt(pointsLedgerTable.createdAt, new Date(opts.cursor)),
            )
          : eq(pointsLedgerTable.userId, userId as string),
      )
      .orderBy(desc(pointsLedgerTable.createdAt))
      .limit(limit + 1);

    const rows = await query;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    return {
      items: items.map((r) => ({
        id: r.id,
        points: r.points,
        reason: r.reason,
        meta: r.meta as Record<string, unknown>,
        city: r.city ?? null,
        createdAt: toIso(r.createdAt),
      })),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt?.toISOString() ?? null : null,
    };
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────────

  /**
   * Return top users by points for a city / period.
   * `category` is reserved for future per-category boards; currently unused.
   */
  async getLeaderboard(
    city: string,
    _category: string,
    period: LeaderboardPeriod,
    opts: { limit?: number } = {},
  ): Promise<LeaderboardResult> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const since = periodToDate(period);

    // Aggregate points from ledger (filtered by city + period)
    const rows = await this.db
      .select({
        userId: pointsLedgerTable.userId,
        totalPoints: sql<number>`sum(${pointsLedgerTable.points})::int`,
      })
      .from(pointsLedgerTable)
      .where(
        since
          ? and(
              eq(pointsLedgerTable.city, city),
              gte(pointsLedgerTable.createdAt, since),
            )
          : eq(pointsLedgerTable.city, city),
      )
      .groupBy(pointsLedgerTable.userId)
      .orderBy(desc(sql`sum(${pointsLedgerTable.points})`))
      .limit(limit);

    if (rows.length === 0) {
      return { items: [], period, city };
    }

    const userIds = rows.map((r) => r.userId);

    // Batch-load levels
    const repRows = await this.db
      .select({
        userId: userReputationTable.userId,
        level: userReputationTable.level,
        totalPoints: userReputationTable.totalPoints,
      })
      .from(userReputationTable)
      .where(inArray(userReputationTable.userId, userIds));

    const repByUser = new Map(repRows.map((r) => [r.userId, r]));

    // Batch-load top badge per user (latest awarded)
    const badgeRows = await this.db
      .select({
        userId: userBadgeTable.userId,
        badgeId: userBadgeTable.badgeId,
        awardedAt: userBadgeTable.awardedAt,
      })
      .from(userBadgeTable)
      .where(inArray(userBadgeTable.userId, userIds))
      .orderBy(desc(userBadgeTable.awardedAt));

    // Keep only the most-recently-awarded badge per user
    const topBadgeByUser = new Map<string, string>();
    for (const b of badgeRows) {
      if (!topBadgeByUser.has(b.userId)) {
        topBadgeByUser.set(b.userId, b.badgeId);
      }
    }

    const items: LeaderboardEntry[] = rows.map((r, i) => {
      const rep = repByUser.get(r.userId);
      const level = rep ? (rep.level as ReputationLevel) : 'explorer';
      return {
        rank: i + 1,
        userId: r.userId as UserId,
        periodPoints: r.totalPoints,
        level,
        topBadgeId: topBadgeByUser.get(r.userId) ?? null,
      };
    });

    return { items, period, city };
  }

  /**
   * Find a specific user's rank in the leaderboard for a given city + period.
   * Returns null if the user has no points in the given scope.
   */
  async getMyRank(
    userId: UserId,
    city: string,
    period: LeaderboardPeriod,
  ): Promise<{ rank: number; periodPoints: number } | null> {
    const since = periodToDate(period);

    // Count users with strictly more points than this user
    const [myRow] = await this.db
      .select({
        totalPoints: sql<number>`sum(${pointsLedgerTable.points})::int`,
      })
      .from(pointsLedgerTable)
      .where(
        since
          ? and(
              eq(pointsLedgerTable.userId, userId as string),
              eq(pointsLedgerTable.city, city),
              gte(pointsLedgerTable.createdAt, since),
            )
          : and(
              eq(pointsLedgerTable.userId, userId as string),
              eq(pointsLedgerTable.city, city),
            ),
      )
      .groupBy(pointsLedgerTable.userId);

    if (!myRow) return null;

    const myPoints = myRow.totalPoints;

    const rankRows = await this.db
      .select({
        rank: sql<number>`count(*)::int + 1`,
      })
      .from(
        this.db
          .select({
            userId: pointsLedgerTable.userId,
            pts: sql<number>`sum(${pointsLedgerTable.points})`.as('pts'),
          })
          .from(pointsLedgerTable)
          .where(
            since
              ? and(
                  eq(pointsLedgerTable.city, city),
                  gte(pointsLedgerTable.createdAt, since),
                )
              : eq(pointsLedgerTable.city, city),
          )
          .groupBy(pointsLedgerTable.userId)
          .as('sub'),
      )
      .where(sql`sub.pts > ${myPoints}`);
    const rank = rankRows[0]?.rank ?? 1;

    return { rank: rank ?? 1, periodPoints: myPoints };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Fetch action counters for badge evaluation.
   * Values in ctx.counters override DB queries for that key.
   */
  private async _fetchCounters(
    userId: UserId,
    ctx: BadgeCheckContext,
  ): Promise<{
    checkins: number;
    reviews: number;
    incidents: number;
    distinctPlaces: number;
    baghdadVisits: number;
    photos: number;
    messages: number;
    helpfulVotes: number;
  }> {
    const supplied = ctx.counters ?? {};

    // Build parallel queries only for the counters we need
    const queries: Array<Promise<[string, number]>> = [];

    if (supplied.checkins === undefined) {
      queries.push(
        this._countByReason(userId, 'first_steps').then((n) => ['checkins', n]),
      );
    }
    if (supplied.reviews === undefined) {
      queries.push(
        this._countByReason(userId, 'write_review').then((n) => ['reviews', n]),
      );
    }
    if (supplied.incidents === undefined) {
      queries.push(
        this._countByReason(userId, 'report_incident').then((n) => ['incidents', n]),
      );
    }
    if (supplied.distinctPlaces === undefined) {
      // Approximate: count all place-related ledger entries (write_review, add_place)
      queries.push(
        this._countByReasons(userId, ['write_review', 'add_place']).then((n) => ['distinctPlaces', n]),
      );
    }
    if (supplied.baghdadVisits === undefined) {
      queries.push(
        this._countByCityReason(userId, 'baghdad', 'write_review').then((n) => ['baghdadVisits', n]),
      );
    }
    if (supplied.photos === undefined) {
      queries.push(
        this._countByReason(userId, 'upload_photo').then((n) => ['photos', n]),
      );
    }
    if (supplied.messages === undefined) {
      queries.push(
        this._countByReason(userId, 'send_message').then((n) => ['messages', n]),
      );
    }
    if (supplied.helpfulVotes === undefined) {
      queries.push(
        this._countByReason(userId, 'review_helpful_10').then((n) => ['helpfulVotes', n * 10]),
      );
    }

    const results = await Promise.all(queries);
    const fetched = Object.fromEntries(results);

    return {
      checkins:       supplied.checkins       ?? fetched['checkins']       ?? 0,
      reviews:        supplied.reviews        ?? fetched['reviews']        ?? 0,
      incidents:      supplied.incidents      ?? fetched['incidents']      ?? 0,
      distinctPlaces: supplied.distinctPlaces ?? fetched['distinctPlaces'] ?? 0,
      baghdadVisits:  supplied.baghdadVisits  ?? fetched['baghdadVisits']  ?? 0,
      photos:         supplied.photos         ?? fetched['photos']         ?? 0,
      messages:       supplied.messages       ?? fetched['messages']       ?? 0,
      helpfulVotes:   supplied.helpfulVotes   ?? fetched['helpfulVotes']   ?? 0,
    };
  }

  private async _countByReason(userId: UserId, reason: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pointsLedgerTable)
      .where(
        and(
          eq(pointsLedgerTable.userId, userId as string),
          eq(pointsLedgerTable.reason, reason),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  private async _countByReasons(userId: UserId, reasons: string[]): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pointsLedgerTable)
      .where(
        and(
          eq(pointsLedgerTable.userId, userId as string),
          inArray(pointsLedgerTable.reason, reasons),
        ),
      );
    return rows[0]?.count ?? 0;
  }

  private async _countByCityReason(userId: UserId, city: string, reason: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(pointsLedgerTable)
      .where(
        and(
          eq(pointsLedgerTable.userId, userId as string),
          eq(pointsLedgerTable.city, city),
          eq(pointsLedgerTable.reason, reason),
        ),
      );
    return rows[0]?.count ?? 0;
  }
}
