/**
 * Reputation contract — points, levels, badges and leaderboards.
 */
import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { UserId, Problem } from './common';

const c = initContract();

// ── Enums ─────────────────────────────────────────────────────────────────────

export const ReputationLevel = z.enum([
  'explorer',
  'contributor',
  'scout',
  'local_guide',
  'expert',
  'ambassador',
]);
export type ReputationLevel = z.infer<typeof ReputationLevel>;

export const LeaderboardPeriod = z.enum(['week', 'month', 'all_time']);
export type LeaderboardPeriod = z.infer<typeof LeaderboardPeriod>;

export const BadgeCategory = z.enum([
  'contribution',
  'social',
  'explorer',
  'safety',
  'special',
]);
export type BadgeCategory = z.infer<typeof BadgeCategory>;

// ── Shapes ────────────────────────────────────────────────────────────────────

export const LevelProgress = z.object({
  currentMin: z.number().int(),
  nextMin: z.number().int().nullable(),
  percentage: z.number().min(0).max(100),
});
export type LevelProgress = z.infer<typeof LevelProgress>;

export const ReputationSummary = z.object({
  userId: UserId,
  totalPoints: z.number().int().min(0),
  level: ReputationLevel,
  levelProgress: LevelProgress,
  badgeCount: z.number().int().min(0),
  updatedAt: z.string().datetime(),
});
export type ReputationSummary = z.infer<typeof ReputationSummary>;

export const BadgeDefinition = z.object({
  id: z.string(),
  nameAr: z.string(),
  nameCkb: z.string(),
  nameEn: z.string(),
  descriptionAr: z.string(),
  descriptionCkb: z.string(),
  descriptionEn: z.string(),
  emoji: z.string(),
  category: BadgeCategory,
  threshold: z.number().int().optional(),
  sortOrder: z.number().int(),
});
export type BadgeDefinition = z.infer<typeof BadgeDefinition>;

export const UserBadge = BadgeDefinition.extend({
  earned: z.boolean(),
  awardedAt: z.string().datetime().nullable(),
});
export type UserBadge = z.infer<typeof UserBadge>;

export const PointsEntry = z.object({
  id: z.string().uuid(),
  points: z.number().int(),
  reason: z.string(),
  meta: z.record(z.unknown()),
  city: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PointsEntry = z.infer<typeof PointsEntry>;

export const LeaderboardEntry = z.object({
  rank: z.number().int().min(1),
  userId: UserId,
  periodPoints: z.number().int().min(0),
  level: ReputationLevel,
  topBadgeId: z.string().nullable(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

export const LeaderboardResult = z.object({
  items: z.array(LeaderboardEntry),
  period: LeaderboardPeriod,
  city: z.string(),
});
export type LeaderboardResult = z.infer<typeof LeaderboardResult>;

// ── Contract ──────────────────────────────────────────────────────────────────

export const reputationContract = c.router({
  getReputation: {
    method: 'GET',
    path: '/users/:userId/reputation',
    pathParams: z.object({ userId: UserId }),
    query: z.object({}),
    responses: {
      200: ReputationSummary,
      404: Problem,
    },
    summary: 'Get reputation summary for a user',
  },

  getMyReputation: {
    method: 'GET',
    path: '/me/reputation',
    query: z.object({}),
    responses: {
      200: ReputationSummary,
      401: Problem,
    },
    summary: 'Get own reputation summary',
  },

  getUserBadges: {
    method: 'GET',
    path: '/users/:userId/badges',
    pathParams: z.object({ userId: UserId }),
    query: z.object({}),
    responses: {
      200: z.object({ items: z.array(UserBadge) }),
      404: Problem,
    },
    summary: 'List all badges (earned + locked) for a user',
  },

  getPointsHistory: {
    method: 'GET',
    path: '/users/:userId/points-history',
    pathParams: z.object({ userId: UserId }),
    query: z.object({
      limit: z.coerce.number().int().max(100).default(20),
      cursor: z.string().optional(),
    }),
    responses: {
      200: z.object({
        items: z.array(PointsEntry),
        nextCursor: z.string().nullable(),
      }),
      401: Problem,
      403: Problem,
    },
    summary: 'Paginated points ledger for own account',
  },

  getLeaderboard: {
    method: 'GET',
    path: '/leaderboard',
    query: z.object({
      city: z.string(),
      period: LeaderboardPeriod.default('all_time'),
      category: z.string().optional(),
      limit: z.coerce.number().int().max(100).default(50),
    }),
    responses: {
      200: LeaderboardResult,
    },
    summary: 'Get top users for a city / period',
  },

  getMyRank: {
    method: 'GET',
    path: '/me/rank',
    query: z.object({
      city: z.string(),
      period: LeaderboardPeriod.default('all_time'),
    }),
    responses: {
      200: z.object({
        rank: z.number().int().min(1).nullable(),
        periodPoints: z.number().int().min(0),
      }),
      401: Problem,
    },
    summary: 'Get own rank in a leaderboard',
  },
});
