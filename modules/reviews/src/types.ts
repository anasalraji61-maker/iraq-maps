import type { PlaceId, UserId } from '@iraq-maps/contracts';
export type PlaceIdType = PlaceId;
import { z } from 'zod';

export const ReviewId = z.string().uuid().brand('ReviewId');
export type ReviewIdType = z.infer<typeof ReviewId>;

export interface CreateReviewDto {
  placeId: PlaceIdType;
  rating: number;
  text?: string;
  photos?: string[];
  isAnonymous?: boolean;
  visitDate?: string;
}

export interface UpdateReviewDto {
  rating?: number;
  text?: string;
  photos?: string[];
  isAnonymous?: boolean;
  visitDate?: string;
}

export interface GetReviewsQuery {
  sort?: 'newest' | 'highest' | 'lowest' | 'most_helpful';
  rating?: number;
  cursor?: string;
  limit?: number;
}

export interface VoteReviewDto {
  isHelpful: boolean;
}

export interface ReportReviewDto {
  reason: 'spam' | 'fake' | 'inappropriate' | 'other';
}

export interface RespondToReviewDto {
  text: string;
}

export interface ReviewResponseRow {
  id: string;
  reviewId: ReviewIdType;
  providerId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRow {
  id: ReviewIdType;
  userId: UserId;
  placeId: PlaceIdType;
  rating: number;
  text: string;
  photos: string[];
  isAnonymous: boolean;
  visitDate: string | null;
  status: 'active' | 'removed' | 'hidden';
  helpfulCount: number;
  notHelpfulCount: number;
  myVote: boolean | null;
  response: ReviewResponseRow | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewPage {
  items: ReviewRow[];
  nextCursor?: string;
}

export interface RatingSummary {
  placeId: PlaceIdType;
  average: number;
  total: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface TopReviewer {
  userId: UserId;
  reviewCount: number;
  avgRating: number;
  rank: number;
}
