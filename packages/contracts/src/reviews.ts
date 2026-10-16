/**
 * Full reviews contract for the reviews module (M-reviews).
 * Uses distinct names to avoid collision with the basic review types in places.ts.
 */
import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { PlaceId, UserId, Problem } from './common';
// Re-use ReviewId from places.ts since it's the same brand
import { ReviewId } from './places';

export type { ReviewId };

const c = initContract();

// ── Enums ─────────────────────────────────────────────────────────────────────

export const ReviewSortOrder = z.enum(['newest', 'highest', 'lowest', 'most_helpful']);
export type ReviewSortOrder = z.infer<typeof ReviewSortOrder>;

export const ReviewReportReason = z.enum(['spam', 'fake', 'inappropriate', 'other']);
export type ReviewReportReason = z.infer<typeof ReviewReportReason>;

export const ReviewStatus = z.enum(['active', 'removed', 'hidden']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

// ── Sub-shapes ────────────────────────────────────────────────────────────────

export const ReviewProviderResponse = z.object({
  id: z.string().uuid(),
  reviewId: ReviewId,
  providerId: z.string().uuid(),
  text: z.string().max(500),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReviewProviderResponse = z.infer<typeof ReviewProviderResponse>;

// ── Full review shape (extended vs the basic Review in places.ts) ─────────────

export const FullReview = z.object({
  id: ReviewId,
  userId: UserId,
  placeId: PlaceId,
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000),
  photos: z.array(z.string()).max(5),
  isAnonymous: z.boolean().default(false),
  visitDate: z.string().nullable(),
  status: ReviewStatus,
  helpfulCount: z.number().int().default(0),
  notHelpfulCount: z.number().int().default(0),
  /** Current viewer's vote: true=helpful, false=not helpful, null=no vote. */
  myVote: z.boolean().nullable(),
  response: ReviewProviderResponse.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FullReview = z.infer<typeof FullReview>;

// ── Rating summary (extended) ─────────────────────────────────────────────────

export const FullRatingSummary = z.object({
  placeId: PlaceId,
  average: z.number().min(0).max(5),
  total: z.number().int().min(0),
  breakdown: z.object({
    1: z.number().int().min(0),
    2: z.number().int().min(0),
    3: z.number().int().min(0),
    4: z.number().int().min(0),
    5: z.number().int().min(0),
  }),
});
export type FullRatingSummary = z.infer<typeof FullRatingSummary>;

// ── Top reviewer ──────────────────────────────────────────────────────────────

export const TopReviewer = z.object({
  userId: UserId,
  reviewCount: z.number().int().min(0),
  avgRating: z.number().min(0).max(5),
  rank: z.number().int().min(1),
});
export type TopReviewer = z.infer<typeof TopReviewer>;

// ── Paginated page ────────────────────────────────────────────────────────────

export const FullReviewPage = z.object({
  items: z.array(FullReview),
  nextCursor: z.string().optional(),
});
export type FullReviewPage = z.infer<typeof FullReviewPage>;

// ── Contract ──────────────────────────────────────────────────────────────────

export const fullReviewsContract = c.router({
  createReview: {
    method: 'POST',
    path: '/reviews',
    body: z.object({
      placeId: PlaceId,
      rating: z.number().int().min(1).max(5),
      text: z.string().min(10).max(1000).optional(),
      photos: z.array(z.string()).max(5).optional(),
      isAnonymous: z.boolean().optional(),
      visitDate: z.string().date().optional(),
    }),
    responses: {
      201: FullReview,
      400: Problem,
      401: Problem,
      409: Problem,
    },
    summary: 'Create a review for a place',
  },

  updateReview: {
    method: 'PUT',
    path: '/reviews/:id',
    pathParams: z.object({ id: ReviewId }),
    body: z.object({
      rating: z.number().int().min(1).max(5).optional(),
      text: z.string().min(10).max(1000).optional(),
      photos: z.array(z.string()).max(5).optional(),
      isAnonymous: z.boolean().optional(),
      visitDate: z.string().date().optional(),
    }),
    responses: {
      200: FullReview,
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Update own review',
  },

  deleteReview: {
    method: 'DELETE',
    path: '/reviews/:id',
    pathParams: z.object({ id: ReviewId }),
    body: z.object({}),
    responses: {
      204: z.object({}),
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Delete own review',
  },

  getPlaceReviews: {
    method: 'GET',
    path: '/places/:placeId/reviews/full',
    pathParams: z.object({ placeId: PlaceId }),
    query: z.object({
      sort: ReviewSortOrder.optional(),
      rating: z.coerce.number().int().min(1).max(5).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(50).default(20),
    }),
    responses: {
      200: FullReviewPage,
    },
    summary: 'List full reviews for a place (extended)',
  },

  getUserReviews: {
    method: 'GET',
    path: '/users/:userId/reviews',
    pathParams: z.object({ userId: UserId }),
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(50).default(20),
    }),
    responses: {
      200: FullReviewPage,
    },
    summary: 'List all reviews by a user',
  },

  voteReview: {
    method: 'POST',
    path: '/reviews/:id/vote',
    pathParams: z.object({ id: ReviewId }),
    body: z.object({ isHelpful: z.boolean() }),
    responses: {
      200: z.object({
        helpfulCount: z.number().int(),
        notHelpfulCount: z.number().int(),
        myVote: z.boolean().nullable(),
      }),
      400: Problem,
      401: Problem,
      404: Problem,
    },
    summary: 'Vote on a review as helpful or not',
  },

  reportReview: {
    method: 'POST',
    path: '/reviews/:id/report',
    pathParams: z.object({ id: ReviewId }),
    body: z.object({ reason: ReviewReportReason }),
    responses: {
      204: z.object({}),
      400: Problem,
      401: Problem,
      404: Problem,
      409: Problem,
    },
    summary: 'Report a review as inappropriate',
  },

  respondToReview: {
    method: 'POST',
    path: '/reviews/:id/respond',
    pathParams: z.object({ id: ReviewId }),
    body: z.object({ text: z.string().min(1).max(500) }),
    responses: {
      200: ReviewProviderResponse,
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Provider responds to a review',
  },

  getPlaceRatingSummary: {
    method: 'GET',
    path: '/places/:placeId/rating-summary',
    pathParams: z.object({ placeId: PlaceId }),
    query: z.object({}),
    responses: {
      200: FullRatingSummary,
    },
    summary: 'Get star rating breakdown for a place',
  },

  getTopReviewers: {
    method: 'GET',
    path: '/reviews/top-reviewers',
    query: z.object({
      limit: z.coerce.number().int().max(50).default(10),
    }),
    responses: {
      200: z.object({ items: z.array(TopReviewer) }),
    },
    summary: 'Get users with the most reviews',
  },
});
