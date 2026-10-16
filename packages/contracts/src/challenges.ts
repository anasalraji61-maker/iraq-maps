/**
 * Challenges & Gamification contracts.
 * Extended challenge types: review_count, place_visit, photo_upload,
 * incident_report, consecutive_login, category_explorer,
 * neighborhood_mapper, first_review.
 */
import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { UserId, CityId } from './common';

const c = initContract();

// ─── IDs ──────────────────────────────────────────────────────────────────────

export const ChallengeV2Id = z.string().uuid().brand('ChallengeV2Id');
export type ChallengeV2Id = z.infer<typeof ChallengeV2Id>;

// ─── Enums ────────────────────────────────────────────────────────────────────

export const ChallengeKind = z.enum([
  'review_count',
  'place_visit',
  'photo_upload',
  'incident_report',
  'consecutive_login',
  'category_explorer',
  'neighborhood_mapper',
  'first_review',
]);
export type ChallengeKind = z.infer<typeof ChallengeKind>;

export const ChallengeV2Status = z.enum(['upcoming', 'active', 'completed']);
export type ChallengeV2Status = z.infer<typeof ChallengeV2Status>;

export const ChallengeDifficulty = z.enum(['easy', 'medium', 'hard']);
export type ChallengeDifficulty = z.infer<typeof ChallengeDifficulty>;

// ─── Core schemas ─────────────────────────────────────────────────────────────

export const ChallengeV2 = z.object({
  id: ChallengeV2Id,
  kind: ChallengeKind,
  /** Localised title (AR/EN) resolved server-side for request locale */
  title: z.string().max(200),
  /** Localised description */
  description: z.string().max(2000),
  difficulty: ChallengeDifficulty,
  /** Target city slug, null = global */
  cityId: CityId.nullable(),
  /** How many units must be completed */
  target: z.number().int().min(1),
  /** Points awarded on completion */
  rewardPoints: z.number().int().min(0).default(0),
  /** Badge key displayed in the UI, e.g. "badge_explorer" */
  rewardBadge: z.string().max(64).nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: ChallengeV2Status,
  /** Whether this challenge is highlighted as "featured" */
  isFeatured: z.boolean().default(false),
  totalParticipants: z.number().int().default(0),
  /** Authenticated user's current progress */
  myProgress: z.number().int().default(0),
  /** Whether the authenticated user has completed this challenge */
  myCompleted: z.boolean().default(false),
  /** Whether the authenticated user has claimed their reward */
  myRewardClaimed: z.boolean().default(false),
  /** Authenticated user's rank in leaderboard, null = not ranked */
  myRank: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});
export type ChallengeV2Type = z.infer<typeof ChallengeV2>;

export const ChallengeLeaderV2Entry = z.object({
  rank: z.number().int(),
  userId: UserId,
  displayName: z.string(),
  progress: z.number().int(),
  completedAt: z.string().datetime().nullable(),
});
export type ChallengeLeaderV2EntryType = z.infer<typeof ChallengeLeaderV2Entry>;

// ─── Admin create/update schemas ──────────────────────────────────────────────

export const CreateChallengeBody = z.object({
  kind: ChallengeKind,
  titleAr: z.string().min(1).max(200),
  titleEn: z.string().min(1).max(200),
  descriptionAr: z.string().max(2000).default(''),
  descriptionEn: z.string().max(2000).default(''),
  difficulty: ChallengeDifficulty.default('medium'),
  cityId: CityId.optional(),
  target: z.number().int().min(1),
  rewardPoints: z.number().int().min(0).default(0),
  rewardBadge: z.string().max(64).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isFeatured: z.boolean().default(false),
});
export type CreateChallengeBodyType = z.infer<typeof CreateChallengeBody>;

export const UpdateChallengeBody = z.object({
  titleAr: z.string().min(1).max(200).optional(),
  titleEn: z.string().min(1).max(200).optional(),
  descriptionAr: z.string().max(2000).optional(),
  descriptionEn: z.string().max(2000).optional(),
  difficulty: ChallengeDifficulty.optional(),
  target: z.number().int().min(1).optional(),
  rewardPoints: z.number().int().min(0).optional(),
  rewardBadge: z.string().max(64).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ─── Admin analytics ─────────────────────────────────────────────────────────

export const ChallengeAnalytics = z.object({
  challengeId: ChallengeV2Id,
  totalParticipants: z.number().int(),
  completedCount: z.number().int(),
  rewardClaimedCount: z.number().int(),
  avgProgress: z.number(),
  completionRate: z.number(),
  topParticipantId: UserId.nullable(),
});
export type ChallengeAnalyticsType = z.infer<typeof ChallengeAnalytics>;

// ─── User challenge history entry ────────────────────────────────────────────

export const UserChallengeHistory = z.object({
  challenge: ChallengeV2,
  completedAt: z.string().datetime(),
  rewardClaimedAt: z.string().datetime().nullable(),
});
export type UserChallengeHistoryType = z.infer<typeof UserChallengeHistory>;

// ─── Contracts ────────────────────────────────────────────────────────────────

const err = <S extends 400 | 401 | 403 | 404 | 409 | 422>(s: S) =>
  z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(s), code: z.string() });

export const challengesV2Contract = c.router({
  listChallenges: {
    method: 'GET',
    path: '/challenges',
    query: z.object({
      status: ChallengeV2Status.optional(),
      kind: ChallengeKind.optional(),
      cityId: CityId.optional(),
      featured: z.coerce.boolean().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(50).default(20),
    }),
    responses: {
      200: z.object({ items: z.array(ChallengeV2), nextCursor: z.string().optional() }),
    },
    summary: 'List challenges with optional filters and user progress',
  },

  getChallengeDetail: {
    method: 'GET',
    path: '/challenges/:challengeId',
    pathParams: z.object({ challengeId: ChallengeV2Id }),
    query: z.object({ leaderboardLimit: z.coerce.number().int().max(50).default(20) }),
    responses: {
      200: z.object({
        challenge: ChallengeV2,
        leaderboard: z.array(ChallengeLeaderV2Entry),
      }),
      404: err(404),
    },
    summary: 'Full challenge detail with user progress and leaderboard',
  },

  updateProgress: {
    method: 'POST',
    path: '/challenges/:challengeId/progress',
    pathParams: z.object({ challengeId: ChallengeV2Id }),
    body: z.object({ increment: z.number().int().min(1).default(1) }),
    responses: {
      200: z.object({
        newProgress: z.number().int(),
        target: z.number().int(),
        completed: z.boolean(),
        pointsEarned: z.number().int(),
      }),
      400: err(400),
      401: err(401),
      404: err(404),
    },
    summary: 'Increment user progress on a challenge',
  },

  claimReward: {
    method: 'POST',
    path: '/challenges/:challengeId/claim',
    pathParams: z.object({ challengeId: ChallengeV2Id }),
    body: z.object({}),
    responses: {
      200: z.object({ pointsAwarded: z.number().int(), badge: z.string().nullable() }),
      400: err(400),
      401: err(401),
      404: err(404),
      409: err(409),
    },
    summary: 'Claim reward for a completed challenge (idempotent per user)',
  },

  getMyCompletedChallenges: {
    method: 'GET',
    path: '/challenges/me/completed',
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(50).default(20),
    }),
    responses: {
      200: z.object({ items: z.array(UserChallengeHistory), nextCursor: z.string().optional() }),
      401: err(401),
    },
    summary: 'Authenticated user completed challenge history',
  },

  getTopParticipants: {
    method: 'GET',
    path: '/challenges/:challengeId/leaderboard',
    pathParams: z.object({ challengeId: ChallengeV2Id }),
    query: z.object({ limit: z.coerce.number().int().max(50).default(20) }),
    responses: {
      200: z.object({ items: z.array(ChallengeLeaderV2Entry) }),
      404: err(404),
    },
    summary: 'Top participants leaderboard for a challenge',
  },
});

// ─── Admin contracts ──────────────────────────────────────────────────────────

export const adminChallengesV2Contract = c.router({
  createChallenge: {
    method: 'POST',
    path: '/admin/challenges',
    body: CreateChallengeBody,
    responses: {
      201: ChallengeV2,
      400: err(400),
      401: err(401),
      403: err(403),
    },
    summary: 'Admin: create a new challenge',
  },

  updateChallenge: {
    method: 'PATCH',
    path: '/admin/challenges/:challengeId',
    pathParams: z.object({ challengeId: ChallengeV2Id }),
    body: UpdateChallengeBody,
    responses: {
      200: ChallengeV2,
      400: err(400),
      401: err(401),
      403: err(403),
      404: err(404),
    },
    summary: 'Admin: update challenge metadata',
  },

  forceComplete: {
    method: 'POST',
    path: '/admin/challenges/:challengeId/force-complete/:userId',
    pathParams: z.object({ challengeId: ChallengeV2Id, userId: UserId }),
    body: z.object({}),
    responses: {
      200: z.object({ progress: z.number().int(), completed: z.boolean() }),
      401: err(401),
      403: err(403),
      404: err(404),
    },
    summary: 'Admin: force-complete a challenge for a specific user',
  },

  getChallengeAnalytics: {
    method: 'GET',
    path: '/admin/challenges/:challengeId/analytics',
    pathParams: z.object({ challengeId: ChallengeV2Id }),
    responses: {
      200: ChallengeAnalytics,
      401: err(401),
      403: err(403),
      404: err(404),
    },
    summary: 'Admin: challenge participation analytics',
  },

  listChallengesAdmin: {
    method: 'GET',
    path: '/admin/challenges',
    query: z.object({
      status: ChallengeV2Status.optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(100).default(50),
    }),
    responses: {
      200: z.object({ items: z.array(ChallengeV2), nextCursor: z.string().optional() }),
      401: err(401),
      403: err(403),
    },
    summary: 'Admin: list all challenges including drafts',
  },
});
