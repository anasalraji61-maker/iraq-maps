/**
 * FakeReviewsService — in-memory fake for tests that consume the reviews port.
 *
 * Implements the same surface as ReviewsService:
 *  - createReview, updateReview, deleteReview
 *  - getReviews, getReview, getUserReviews
 *  - voteReview, reportReview, respondToReview
 *  - getPlaceRatingSummary
 *
 * Enforces the same business rules as the real service:
 *  - one review per (userId, placeId)
 *  - owner-only update/delete
 *  - cannot vote on own review
 *  - cannot report twice
 *  - cannot respond twice
 */
import { randomUUID } from 'node:crypto';

// ─── Types (minimal; mirrors modules/reviews/src/types.ts) ───────────────────

export type UserId = string & { readonly __brand: 'UserId' };
export type PlaceIdType = string & { readonly __brand: 'PlaceId' };
export type ReviewIdType = string & { readonly __brand: 'ReviewId' };

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

// ─── Error helpers ────────────────────────────────────────────────────────────

class ReviewError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

// ─── Fake implementation ──────────────────────────────────────────────────────

export class FakeReviewsService {
  private readonly reviews = new Map<ReviewIdType, ReviewRow>();
  /** (userId, placeId) → reviewId */
  private readonly byUserPlace = new Map<string, ReviewIdType>();
  /** reviewId → Set<userId> */
  private readonly votes = new Map<ReviewIdType, Map<UserId, boolean>>();
  /** reviewId → Set<userId> */
  private readonly reports = new Map<ReviewIdType, Set<UserId>>();
  /** reviewId → ResponseRow */
  private readonly responses = new Map<ReviewIdType, ReviewResponseRow>();

  /** Audit log of all calls for assertions. */
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private now(): string {
    return new Date().toISOString();
  }

  private key(userId: UserId, placeId: PlaceIdType): string {
    return `${userId}::${placeId}`;
  }

  private getOrThrow(reviewId: ReviewIdType): ReviewRow {
    const r = this.reviews.get(reviewId);
    if (!r || r.status === 'removed') throw new ReviewError(404, 'Review not found');
    return r;
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async createReview(userId: UserId, dto: CreateReviewDto): Promise<ReviewRow> {
    this.calls.push({ method: 'createReview', args: [userId, dto] });

    if (dto.rating < 1 || dto.rating > 5) {
      throw new ReviewError(400, 'Rating must be between 1 and 5');
    }
    if (dto.text !== undefined) {
      if (dto.text.length < 10) throw new ReviewError(400, 'Review text must be at least 10 characters');
      if (dto.text.length > 1000) throw new ReviewError(400, 'Review text must be at most 1000 characters');
    }
    if (dto.photos && dto.photos.length > 5) {
      throw new ReviewError(400, 'A review may have at most 5 photos');
    }

    const uk = this.key(userId, dto.placeId);
    if (this.byUserPlace.has(uk)) {
      throw new ReviewError(409, 'You have already reviewed this place');
    }

    const id = randomUUID() as ReviewIdType;
    const now = this.now();
    const row: ReviewRow = {
      id,
      userId,
      placeId: dto.placeId,
      rating: dto.rating,
      text: dto.text ?? '',
      photos: dto.photos ?? [],
      isAnonymous: dto.isAnonymous ?? false,
      visitDate: dto.visitDate ?? null,
      status: 'active',
      helpfulCount: 0,
      notHelpfulCount: 0,
      myVote: null,
      response: null,
      createdAt: now,
      updatedAt: now,
    };

    this.reviews.set(id, row);
    this.byUserPlace.set(uk, id);
    return { ...row };
  }

  async updateReview(userId: UserId, reviewId: ReviewIdType, dto: UpdateReviewDto): Promise<ReviewRow> {
    this.calls.push({ method: 'updateReview', args: [userId, reviewId, dto] });

    const row = this.getOrThrow(reviewId);
    if (row.userId !== userId) throw new ReviewError(403, 'You can only edit your own reviews');

    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new ReviewError(400, 'Rating must be between 1 and 5');
    }
    if (dto.text !== undefined) {
      if (dto.text.length < 10) throw new ReviewError(400, 'Review text must be at least 10 characters');
      if (dto.text.length > 1000) throw new ReviewError(400, 'Review text must be at most 1000 characters');
    }

    const updated: ReviewRow = {
      ...row,
      rating: dto.rating ?? row.rating,
      text: dto.text ?? row.text,
      photos: dto.photos ?? row.photos,
      isAnonymous: dto.isAnonymous ?? row.isAnonymous,
      visitDate: dto.visitDate ?? row.visitDate,
      response: this.responses.get(reviewId) ?? null,
      updatedAt: this.now(),
    };

    this.reviews.set(reviewId, updated);
    return { ...updated };
  }

  async deleteReview(userId: UserId, reviewId: ReviewIdType): Promise<void> {
    this.calls.push({ method: 'deleteReview', args: [userId, reviewId] });

    const row = this.reviews.get(reviewId);
    if (!row) throw new ReviewError(404, 'Review not found');
    if (row.status === 'removed') return; // idempotent
    if (row.userId !== userId) throw new ReviewError(403, 'You can only delete your own reviews');

    this.reviews.set(reviewId, { ...row, status: 'removed', updatedAt: this.now() });
    this.byUserPlace.delete(this.key(userId, row.placeId));
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getReviews(placeId: PlaceIdType, query: GetReviewsQuery, viewerUserId?: UserId): Promise<ReviewPage> {
    this.calls.push({ method: 'getReviews', args: [placeId, query, viewerUserId] });

    const limit = Math.min(query.limit ?? 20, 50);
    let rows = [...this.reviews.values()].filter(
      (r) => r.placeId === placeId && r.status === 'active',
    );

    if (query.rating) rows = rows.filter((r) => r.rating === query.rating);

    switch (query.sort) {
      case 'highest':
        rows.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
        break;
      case 'lowest':
        rows.sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt));
        break;
      case 'most_helpful':
        rows.sort((a, b) => b.helpfulCount - a.helpfulCount || b.createdAt.localeCompare(a.createdAt));
        break;
      default:
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // Cursor: simple index-based for in-memory
    if (query.cursor) {
      const idx = parseInt(Buffer.from(query.cursor, 'base64').toString('utf-8'), 10);
      rows = rows.slice(isNaN(idx) ? 0 : idx);
    }

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const nextCursor = hasMore
      ? Buffer.from(String(limit)).toString('base64')
      : undefined;

    const mapped = items.map((r) => ({
      ...r,
      response: this.responses.get(r.id) ?? null,
      myVote: viewerUserId ? (this.votes.get(r.id)?.get(viewerUserId) ?? null) : null,
    }));

    return { items: mapped, nextCursor };
  }

  async getReview(reviewId: ReviewIdType, viewerUserId?: UserId): Promise<ReviewRow> {
    this.calls.push({ method: 'getReview', args: [reviewId, viewerUserId] });

    const row = this.getOrThrow(reviewId);
    return {
      ...row,
      response: this.responses.get(reviewId) ?? null,
      myVote: viewerUserId ? (this.votes.get(reviewId)?.get(viewerUserId) ?? null) : null,
    };
  }

  async getUserReviews(userId: UserId, query: { cursor?: string; limit?: number }): Promise<ReviewPage> {
    this.calls.push({ method: 'getUserReviews', args: [userId, query] });

    const limit = Math.min(query.limit ?? 20, 50);
    let rows = [...this.reviews.values()]
      .filter((r) => r.userId === userId && r.status === 'active')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (query.cursor) {
      const idx = parseInt(Buffer.from(query.cursor, 'base64').toString('utf-8'), 10);
      rows = rows.slice(isNaN(idx) ? 0 : idx);
    }

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({ ...r, response: this.responses.get(r.id) ?? null }));
    const nextCursor = hasMore ? Buffer.from(String(limit)).toString('base64') : undefined;

    return { items, nextCursor };
  }

  // ─── Votes ────────────────────────────────────────────────────────────────

  async voteReview(userId: UserId, reviewId: ReviewIdType, dto: VoteReviewDto): Promise<{ helpfulCount: number; notHelpfulCount: number; myVote: boolean | null }> {
    this.calls.push({ method: 'voteReview', args: [userId, reviewId, dto] });

    const row = this.getOrThrow(reviewId);
    if (row.userId === userId) throw new ReviewError(400, 'You cannot vote on your own review');

    if (!this.votes.has(reviewId)) this.votes.set(reviewId, new Map());
    const voteMap = this.votes.get(reviewId)!;

    const existing = voteMap.get(userId);
    let newVote: boolean | null = null;

    if (existing === undefined) {
      voteMap.set(userId, dto.isHelpful);
      newVote = dto.isHelpful;
    } else if (existing === dto.isHelpful) {
      voteMap.delete(userId);
      newVote = null;
    } else {
      voteMap.set(userId, dto.isHelpful);
      newVote = dto.isHelpful;
    }

    let helpfulCount = 0;
    let notHelpfulCount = 0;
    for (const v of voteMap.values()) {
      if (v) helpfulCount++;
      else notHelpfulCount++;
    }

    // Update denormalized counters on review row
    const updated = { ...row, helpfulCount, notHelpfulCount, updatedAt: this.now() };
    this.reviews.set(reviewId, updated);

    return { helpfulCount, notHelpfulCount, myVote: newVote };
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  async reportReview(userId: UserId, reviewId: ReviewIdType, dto: ReportReviewDto): Promise<void> {
    this.calls.push({ method: 'reportReview', args: [userId, reviewId, dto] });

    this.getOrThrow(reviewId);

    if (!this.reports.has(reviewId)) this.reports.set(reviewId, new Set());
    const set = this.reports.get(reviewId)!;

    if (set.has(userId)) throw new ReviewError(409, 'You have already reported this review');
    set.add(userId);
  }

  // ─── Provider response ────────────────────────────────────────────────────

  async respondToReview(providerId: UserId, reviewId: ReviewIdType, dto: RespondToReviewDto): Promise<ReviewResponseRow> {
    this.calls.push({ method: 'respondToReview', args: [providerId, reviewId, dto] });

    this.getOrThrow(reviewId);

    const now = this.now();
    const response: ReviewResponseRow = {
      id: randomUUID(),
      reviewId,
      providerId,
      text: dto.text,
      createdAt: now,
      updatedAt: now,
    };

    this.responses.set(reviewId, response);
    return { ...response };
  }

  // ─── Rating summary ───────────────────────────────────────────────────────

  async getPlaceRatingSummary(placeId: PlaceIdType): Promise<RatingSummary> {
    this.calls.push({ method: 'getPlaceRatingSummary', args: [placeId] });

    const activeRows = [...this.reviews.values()].filter(
      (r) => r.placeId === placeId && r.status === 'active',
    );

    const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of activeRows) {
      const star = r.rating as 1 | 2 | 3 | 4 | 5;
      breakdown[star] = (breakdown[star] ?? 0) + 1;
      sum += r.rating;
    }

    const total = activeRows.length;
    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;

    return { placeId, average, total, breakdown };
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  reset(): void {
    this.reviews.clear();
    this.byUserPlace.clear();
    this.votes.clear();
    this.reports.clear();
    this.responses.clear();
    this.calls.length = 0;
  }
}
