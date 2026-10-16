/**
 * ChallengesService — backend logic for the challenges & gamification module.
 *
 * Challenge kinds:
 *   review_count       – write N reviews
 *   place_visit        – check in to N different places
 *   photo_upload       – upload N photos
 *   incident_report    – report N incidents
 *   consecutive_login  – log in N days in a row
 *   category_explorer  – visit places from N different categories
 *   neighborhood_mapper – add/edit places in a specific neighbourhood
 *   first_review       – be the first to review a new place
 */
import {
  type ChallengeV2Id,
  type ChallengeKind,
  type ChallengeDifficulty,
  type ChallengeV2Status,
  type CityId,
  type UserId,
} from '@iraq-maps/contracts';
import { type Db } from '@iraq-maps/db-kit';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { challengeTable, userChallengeTable } from './schema';
import type { z } from 'zod';

// ─── Internal types ───────────────────────────────────────────────────────────

type ChallengeRow = typeof challengeTable.$inferSelect;
type UserChallengeRow = typeof userChallengeTable.$inferSelect;

type ChallengeDto = {
  id: ChallengeV2Id;
  kind: ChallengeKind;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  cityId: CityId | null;
  target: number;
  rewardPoints: number;
  rewardBadge: string | null;
  startsAt: string;
  endsAt: string;
  status: ChallengeV2Status;
  isFeatured: boolean;
  totalParticipants: number;
  myProgress: number;
  myCompleted: boolean;
  myRewardClaimed: boolean;
  myRank: number | null;
  createdAt: string;
};

type LeaderEntry = {
  rank: number;
  userId: UserId;
  displayName: string;
  progress: number;
  completedAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(row: ChallengeRow, now: Date): ChallengeV2Status {
  if (!row.isActive) return 'completed';
  if (now < row.startsAt) return 'upcoming';
  if (now > row.endsAt) return 'completed';
  return 'active';
}

function toDto(
  row: ChallengeRow,
  locale: 'ar' | 'en',
  myProgress: number,
  myCompleted: boolean,
  myRewardClaimed: boolean,
  myRank: number | null,
  totalParticipants: number,
): ChallengeDto {
  const now = new Date();
  return {
    id: row.id as ChallengeV2Id,
    kind: row.kind as ChallengeKind,
    title: locale === 'ar' ? row.titleAr : row.titleEn,
    description: locale === 'ar' ? row.descriptionAr : row.descriptionEn,
    difficulty: row.difficulty as ChallengeDifficulty,
    cityId: (row.cityId ?? null) as CityId | null,
    target: row.target,
    rewardPoints: row.rewardPoints,
    rewardBadge: row.rewardBadge ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: computeStatus(row, now),
    isFeatured: row.isFeatured,
    totalParticipants,
    myProgress,
    myCompleted,
    myRewardClaimed,
    myRank,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ChallengesService {
  constructor(@Inject('CHALLENGES_DB') private readonly db: Db) {}

  // ─── Public: list challenges with user progress ───────────────────────────

  async getActiveChallenges(
    userId: UserId,
    opts: {
      status?: string;
      kind?: string;
      cityId?: string;
      featured?: boolean;
      cursor?: string;
      limit: number;
      locale?: 'ar' | 'en';
    },
  ) {
    const now = new Date();
    const locale = opts.locale ?? 'ar';

    const where: ReturnType<typeof eq>[] = [];
    where.push(eq(challengeTable.isActive, true));

    if (opts.cityId) {
      where.push(eq(challengeTable.cityId, opts.cityId));
    }
    if (opts.kind) {
      where.push(eq(challengeTable.kind, opts.kind));
    }
    if (opts.featured) {
      where.push(eq(challengeTable.isFeatured, true));
    }
    if (opts.cursor) {
      where.push(lt(challengeTable.createdAt, new Date(opts.cursor)));
    }

    let rows = await this.db
      .select()
      .from(challengeTable)
      .where(and(...where))
      .orderBy(desc(challengeTable.isFeatured), desc(challengeTable.startsAt))
      .limit(opts.limit + 1);

    // Status filter applied in-memory so we can compute status per row
    if (opts.status) {
      rows = rows.filter((r) => computeStatus(r, now) === opts.status);
    }

    // Batch: my progress
    const myProgressRows = userId
      ? await this.db
          .select()
          .from(userChallengeTable)
          .where(eq(userChallengeTable.userId, userId))
          .limit(5000)
      : [];
    const myProgressMap = new Map(myProgressRows.map((p) => [p.challengeId, p]));

    // Batch: participant counts
    const participantCounts = await this.db
      .select({
        challengeId: userChallengeTable.challengeId,
        count: sql<number>`count(*)::int`,
      })
      .from(userChallengeTable)
      .groupBy(userChallengeTable.challengeId);
    const countMap = new Map(participantCounts.map((c) => [c.challengeId, c.count]));

    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map((r) => {
      const uc = myProgressMap.get(r.id);
      return toDto(
        r,
        locale,
        uc?.progress ?? 0,
        uc?.completedAt !== null && uc?.completedAt !== undefined,
        uc?.rewardClaimedAt !== null && uc?.rewardClaimedAt !== undefined,
        null,
        countMap.get(r.id) ?? 0,
      );
    });

    return {
      items,
      nextCursor: hasMore ? rows[opts.limit - 1]!.createdAt.toISOString() : undefined,
    };
  }

  // ─── Public: challenge detail with leaderboard ────────────────────────────

  async getChallengeDetail(
    challengeId: string,
    userId: UserId,
    leaderboardLimit = 20,
    locale: 'ar' | 'en' = 'ar',
  ) {
    const [row] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!row) throw new NotFoundException('Challenge not found');

    const [myUc] = await this.db
      .select()
      .from(userChallengeTable)
      .where(
        and(
          eq(userChallengeTable.challengeId, challengeId),
          eq(userChallengeTable.userId, userId),
        ),
      )
      .limit(1);

    // Leaderboard: top participants by progress desc
    const topRows = await this.db
      .select()
      .from(userChallengeTable)
      .where(eq(userChallengeTable.challengeId, challengeId))
      .orderBy(desc(userChallengeTable.progress), asc(userChallengeTable.completedAt))
      .limit(leaderboardLimit);

    const totalCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userChallengeTable)
      .where(eq(userChallengeTable.challengeId, challengeId))
      .limit(1);

    const myRankIdx = topRows.findIndex((p) => p.userId === userId);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;

    const leaderboard: LeaderEntry[] = topRows.map((p, i) => ({
      rank: i + 1,
      userId: p.userId as UserId,
      displayName: `user_${p.userId.slice(0, 6)}`,
      progress: p.progress,
      completedAt: p.completedAt?.toISOString() ?? null,
    }));

    const challenge = toDto(
      row,
      locale,
      myUc?.progress ?? 0,
      myUc?.completedAt !== null && myUc?.completedAt !== undefined,
      myUc?.rewardClaimedAt !== null && myUc?.rewardClaimedAt !== undefined,
      myRank,
      totalCount[0]?.count ?? 0,
    );

    return { challenge, leaderboard };
  }

  // ─── Public: record progress ──────────────────────────────────────────────

  async updateProgress(userId: UserId, challengeId: string, increment: number) {
    if (increment < 1) throw new BadRequestException('increment must be >= 1');

    const [row] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!row) throw new NotFoundException('Challenge not found');

    const now = new Date();
    const status = computeStatus(row, now);
    if (status !== 'active') {
      throw new BadRequestException(`Challenge is ${status}, not active`);
    }

    const [existing] = await this.db
      .select()
      .from(userChallengeTable)
      .where(
        and(
          eq(userChallengeTable.challengeId, challengeId),
          eq(userChallengeTable.userId, userId),
        ),
      )
      .limit(1);

    const currentProgress = existing?.progress ?? 0;
    // Don't exceed the target
    const newProgress = Math.min(currentProgress + increment, row.target);
    const completed = newProgress >= row.target;
    const completedAt = completed && !existing?.completedAt ? now : (existing?.completedAt ?? null);

    await this.db
      .insert(userChallengeTable)
      .values({
        userId,
        challengeId,
        progress: newProgress,
        completedAt,
        rewardClaimedAt: existing?.rewardClaimedAt ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userChallengeTable.userId, userChallengeTable.challengeId],
        set: {
          progress: newProgress,
          completedAt: completedAt ?? undefined,
          updatedAt: now,
        },
      });

    const pointsEarned = completed && !existing?.completedAt ? row.rewardPoints : 0;
    return { newProgress, target: row.target, completed, pointsEarned };
  }

  // ─── Public: claim reward ─────────────────────────────────────────────────

  async claimReward(userId: UserId, challengeId: string) {
    const [row] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!row) throw new NotFoundException('Challenge not found');

    const [uc] = await this.db
      .select()
      .from(userChallengeTable)
      .where(
        and(
          eq(userChallengeTable.challengeId, challengeId),
          eq(userChallengeTable.userId, userId),
        ),
      )
      .limit(1);

    if (!uc || !uc.completedAt) {
      throw new BadRequestException('Challenge not yet completed');
    }
    if (uc.rewardClaimedAt) {
      throw new ConflictException('Reward already claimed');
    }

    const now = new Date();
    await this.db
      .update(userChallengeTable)
      .set({ rewardClaimedAt: now, updatedAt: now })
      .where(
        and(
          eq(userChallengeTable.challengeId, challengeId),
          eq(userChallengeTable.userId, userId),
        ),
      );

    return { pointsAwarded: row.rewardPoints, badge: row.rewardBadge ?? null };
  }

  // ─── Public: completed history ────────────────────────────────────────────

  async getMyCompletedChallenges(
    userId: UserId,
    opts: { cursor?: string; limit: number; locale?: 'ar' | 'en' },
  ) {
    const locale = opts.locale ?? 'ar';

    const where = [
      eq(userChallengeTable.userId, userId),
      isNotNull(userChallengeTable.completedAt),
    ];
    if (opts.cursor) {
      where.push(lt(userChallengeTable.completedAt!, new Date(opts.cursor)));
    }

    const rows = await this.db
      .select()
      .from(userChallengeTable)
      .where(and(...where))
      .orderBy(desc(userChallengeTable.completedAt))
      .limit(opts.limit + 1);

    if (rows.length === 0) return { items: [], nextCursor: undefined };

    const challengeIds = rows.map((r) => r.challengeId);
    const challenges = await this.db
      .select()
      .from(challengeTable)
      .where(sql`${challengeTable.id} = ANY(${challengeIds})`);
    const challengeMap = new Map(challenges.map((c) => [c.id, c]));

    const hasMore = rows.length > opts.limit;
    const items = rows
      .slice(0, opts.limit)
      .map((uc) => {
        const cRow = challengeMap.get(uc.challengeId);
        if (!cRow) return null;
        return {
          challenge: toDto(cRow, locale, uc.progress, true, !!uc.rewardClaimedAt, null, 0),
          completedAt: uc.completedAt!.toISOString(),
          rewardClaimedAt: uc.rewardClaimedAt?.toISOString() ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      items,
      nextCursor: hasMore ? rows[opts.limit - 1]!.completedAt!.toISOString() : undefined,
    };
  }

  // ─── Public: leaderboard ─────────────────────────────────────────────────

  async getTopParticipants(challengeId: string, limit: number) {
    const [row] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!row) throw new NotFoundException('Challenge not found');

    const topRows = await this.db
      .select()
      .from(userChallengeTable)
      .where(eq(userChallengeTable.challengeId, challengeId))
      .orderBy(desc(userChallengeTable.progress), asc(userChallengeTable.completedAt))
      .limit(limit);

    const items: LeaderEntry[] = topRows.map((p, i) => ({
      rank: i + 1,
      userId: p.userId as UserId,
      displayName: `user_${p.userId.slice(0, 6)}`,
      progress: p.progress,
      completedAt: p.completedAt?.toISOString() ?? null,
    }));

    return { items };
  }

  // ─── Admin: create challenge ──────────────────────────────────────────────

  async createChallenge(
    adminId: UserId,
    data: {
      kind: string;
      titleAr: string;
      titleEn: string;
      descriptionAr: string;
      descriptionEn: string;
      difficulty: string;
      cityId?: string;
      target: number;
      rewardPoints: number;
      rewardBadge?: string;
      startsAt: string;
      endsAt: string;
      isFeatured: boolean;
    },
    locale: 'ar' | 'en' = 'ar',
  ) {
    if (new Date(data.endsAt) <= new Date(data.startsAt)) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    const [row] = await this.db
      .insert(challengeTable)
      .values({
        kind: data.kind,
        titleAr: data.titleAr,
        titleEn: data.titleEn,
        descriptionAr: data.descriptionAr,
        descriptionEn: data.descriptionEn,
        difficulty: data.difficulty,
        cityId: data.cityId ?? null,
        target: data.target,
        rewardPoints: data.rewardPoints,
        rewardBadge: data.rewardBadge ?? null,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        isFeatured: data.isFeatured,
        isActive: true,
        createdBy: adminId,
      })
      .returning();

    return toDto(row!, locale, 0, false, false, null, 0);
  }

  // ─── Admin: update challenge ──────────────────────────────────────────────

  async updateChallenge(
    challengeId: string,
    updates: {
      titleAr?: string;
      titleEn?: string;
      descriptionAr?: string;
      descriptionEn?: string;
      difficulty?: string;
      target?: number;
      rewardPoints?: number;
      rewardBadge?: string;
      startsAt?: string;
      endsAt?: string;
      isFeatured?: boolean;
      isActive?: boolean;
    },
    locale: 'ar' | 'en' = 'ar',
  ) {
    const [existing] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!existing) throw new NotFoundException('Challenge not found');

    if (updates.startsAt && updates.endsAt) {
      if (new Date(updates.endsAt) <= new Date(updates.startsAt)) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
    }

    const set: Partial<typeof challengeTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.titleAr !== undefined) set.titleAr = updates.titleAr;
    if (updates.titleEn !== undefined) set.titleEn = updates.titleEn;
    if (updates.descriptionAr !== undefined) set.descriptionAr = updates.descriptionAr;
    if (updates.descriptionEn !== undefined) set.descriptionEn = updates.descriptionEn;
    if (updates.difficulty !== undefined) set.difficulty = updates.difficulty;
    if (updates.target !== undefined) set.target = updates.target;
    if (updates.rewardPoints !== undefined) set.rewardPoints = updates.rewardPoints;
    if (updates.rewardBadge !== undefined) set.rewardBadge = updates.rewardBadge;
    if (updates.startsAt !== undefined) set.startsAt = new Date(updates.startsAt);
    if (updates.endsAt !== undefined) set.endsAt = new Date(updates.endsAt);
    if (updates.isFeatured !== undefined) set.isFeatured = updates.isFeatured;
    if (updates.isActive !== undefined) set.isActive = updates.isActive;

    const [updated] = await this.db
      .update(challengeTable)
      .set(set)
      .where(eq(challengeTable.id, challengeId))
      .returning();

    const totalCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userChallengeTable)
      .where(eq(userChallengeTable.challengeId, challengeId))
      .limit(1);

    return toDto(updated!, locale, 0, false, false, null, totalCount[0]?.count ?? 0);
  }

  // ─── Admin: force-complete for a user ────────────────────────────────────

  async forceComplete(adminId: UserId, challengeId: string, targetUserId: string) {
    const [row] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!row) throw new NotFoundException('Challenge not found');

    const now = new Date();
    await this.db
      .insert(userChallengeTable)
      .values({
        userId: targetUserId,
        challengeId,
        progress: row.target,
        completedAt: now,
        rewardClaimedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userChallengeTable.userId, userChallengeTable.challengeId],
        set: {
          progress: row.target,
          completedAt: now,
          updatedAt: now,
        },
      });

    return { progress: row.target, completed: true };
  }

  // ─── Admin: analytics ────────────────────────────────────────────────────

  async getChallengeAnalytics(challengeId: string) {
    const [row] = await this.db
      .select()
      .from(challengeTable)
      .where(eq(challengeTable.id, challengeId))
      .limit(1);
    if (!row) throw new NotFoundException('Challenge not found');

    const stats = await this.db
      .select({
        totalParticipants: sql<number>`count(*)::int`,
        completedCount: sql<number>`count(${userChallengeTable.completedAt})::int`,
        rewardClaimedCount: sql<number>`count(${userChallengeTable.rewardClaimedAt})::int`,
        avgProgress: sql<number>`coalesce(avg(${userChallengeTable.progress}), 0)`,
      })
      .from(userChallengeTable)
      .where(eq(userChallengeTable.challengeId, challengeId))
      .limit(1);

    const s = stats[0] ?? { totalParticipants: 0, completedCount: 0, rewardClaimedCount: 0, avgProgress: 0 };

    const topUser = await this.db
      .select({ userId: userChallengeTable.userId })
      .from(userChallengeTable)
      .where(eq(userChallengeTable.challengeId, challengeId))
      .orderBy(desc(userChallengeTable.progress))
      .limit(1);

    const completionRate = s.totalParticipants > 0
      ? s.completedCount / s.totalParticipants
      : 0;

    return {
      challengeId: challengeId as ChallengeV2Id,
      totalParticipants: s.totalParticipants,
      completedCount: s.completedCount,
      rewardClaimedCount: s.rewardClaimedCount,
      avgProgress: Number(s.avgProgress),
      completionRate,
      topParticipantId: (topUser[0]?.userId ?? null) as UserId | null,
    };
  }

  // ─── Admin: list all challenges ───────────────────────────────────────────

  async listChallengesAdmin(opts: {
    status?: string;
    cursor?: string;
    limit: number;
    locale?: 'ar' | 'en';
  }) {
    const locale = opts.locale ?? 'ar';
    const now = new Date();

    const where: ReturnType<typeof eq>[] = [];
    if (opts.cursor) where.push(lt(challengeTable.createdAt, new Date(opts.cursor)));

    let rows = await this.db
      .select()
      .from(challengeTable)
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(desc(challengeTable.createdAt))
      .limit(opts.limit + 1);

    if (opts.status) {
      rows = rows.filter((r) => computeStatus(r, now) === opts.status);
    }

    const participantCounts = await this.db
      .select({
        challengeId: userChallengeTable.challengeId,
        count: sql<number>`count(*)::int`,
      })
      .from(userChallengeTable)
      .groupBy(userChallengeTable.challengeId);
    const countMap = new Map(participantCounts.map((c) => [c.challengeId, c.count]));

    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map((r) =>
      toDto(r, locale, 0, false, false, null, countMap.get(r.id) ?? 0),
    );

    return {
      items,
      nextCursor: hasMore ? rows[opts.limit - 1]!.createdAt.toISOString() : undefined,
    };
  }
}
