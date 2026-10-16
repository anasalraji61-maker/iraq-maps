import {
  type EventBus,
  type UserId,
  type PlaceId,
  PortTokens,
} from '@iraq-maps/contracts';
type PlaceIdType = PlaceId;
import { type Db } from '@iraq-maps/db-kit';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  reviewReportTable,
  reviewResponseTable,
  reviewTable,
  reviewVoteTable,
} from './schema';
import type {
  ReviewIdType,
  CreateReviewDto,
  UpdateReviewDto,
  GetReviewsQuery,
  VoteReviewDto,
  ReportReviewDto,
  RespondToReviewDto,
  ReviewRow,
  ReviewResponseRow,
  RatingSummary,
  TopReviewer,
  ReviewPage,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Maximum photos per review. */
const MAX_PHOTOS = 5;

/** Maximum provider response length (chars). */
const MAX_RESPONSE_LENGTH = 500;

/** Maximum review text length (chars). */
const MAX_TEXT_LENGTH = 1000;

/** Minimum review text length (chars). */
const MIN_TEXT_LENGTH = 10;

const noopEventBus: EventBus = { publish: async () => {}, subscribe: () => () => {} };

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function mapReview(row: typeof reviewTable.$inferSelect, myVote?: boolean | null, response?: ReviewResponseRow | null): ReviewRow {
  return {
    id: row.id as ReviewIdType,
    userId: row.userId as UserId,
    placeId: row.placeId as PlaceIdType,
    rating: row.rating,
    text: row.text,
    photos: Array.isArray(row.photosJson) ? (row.photosJson as string[]) : [],
    isAnonymous: row.isAnonymous,
    visitDate: row.visitDate ?? null,
    status: row.status as 'active' | 'removed' | 'hidden',
    helpfulCount: row.helpfulCount,
    notHelpfulCount: row.notHelpfulCount,
    myVote: myVote ?? null,
    response: response ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ReviewsService {
  constructor(
    @Inject('REVIEWS_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus = noopEventBus,
  ) {}

  // ── Write ──────────────────────────────────────────────────────────────────

  /**
   * Create a new review. One review per user per place is enforced.
   * Emits `reviews.review.created.v1`.
   */
  async createReview(userId: UserId, dto: CreateReviewDto): Promise<ReviewRow> {
    // Validate input lengths
    if (dto.text && dto.text.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(`Review text must be at most ${MAX_TEXT_LENGTH} characters`);
    }
    if (dto.text && dto.text.length < MIN_TEXT_LENGTH) {
      throw new BadRequestException(`Review text must be at least ${MIN_TEXT_LENGTH} characters`);
    }
    if (dto.photos && dto.photos.length > MAX_PHOTOS) {
      throw new BadRequestException(`A review may have at most ${MAX_PHOTOS} photos`);
    }

    // Validate rating
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Check for existing review by same user for the same place
    const existing = await this.db
      .select({ id: reviewTable.id })
      .from(reviewTable)
      .where(and(eq(reviewTable.userId, userId), eq(reviewTable.placeId, dto.placeId)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('You have already reviewed this place');
    }

    const id = randomUUID() as ReviewIdType;
    const now = new Date();

    const [row] = await this.db
      .insert(reviewTable)
      .values({
        id,
        userId,
        placeId: dto.placeId,
        rating: dto.rating,
        text: dto.text ?? '',
        photosJson: dto.photos ?? [],
        isAnonymous: dto.isAnonymous ?? false,
        visitDate: dto.visitDate ?? null,
        status: 'active',
        helpfulCount: 0,
        notHelpfulCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!row) throw new Error('Insert failed');

    // Emit domain event (cast: reviews.review.created.v1 not yet registered in events.ts)
    await (this.eventBus.publish as (e: unknown) => Promise<void>)({
      id: randomUUID(),
      name: 'reviews.review.created.v1',
      occurredAt: now.toISOString(),
      payload: {
        reviewId: id,
        userId,
        placeId: dto.placeId,
        rating: dto.rating,
        isAnonymous: dto.isAnonymous ?? false,
      },
    });

    return mapReview(row);
  }

  /**
   * Update a review's rating and/or text. Owner-only.
   */
  async updateReview(userId: UserId, reviewId: ReviewIdType, dto: UpdateReviewDto): Promise<ReviewRow> {
    if (dto.text !== undefined) {
      if (dto.text.length > MAX_TEXT_LENGTH) {
        throw new BadRequestException(`Review text must be at most ${MAX_TEXT_LENGTH} characters`);
      }
      if (dto.text.length < MIN_TEXT_LENGTH) {
        throw new BadRequestException(`Review text must be at least ${MIN_TEXT_LENGTH} characters`);
      }
    }
    if (dto.rating !== undefined && (dto.rating < 1 || dto.rating > 5)) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const [existing] = await this.db
      .select()
      .from(reviewTable)
      .where(eq(reviewTable.id, reviewId))
      .limit(1);

    if (!existing) throw new NotFoundException('Review not found');
    if (existing.userId !== userId) throw new ForbiddenException('You can only edit your own reviews');
    if (existing.status === 'removed') throw new BadRequestException('Removed reviews cannot be edited');

    const updates: Partial<typeof reviewTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.rating !== undefined) updates.rating = dto.rating;
    if (dto.text !== undefined) updates.text = dto.text;
    if (dto.photos !== undefined) {
      if (dto.photos.length > MAX_PHOTOS) {
        throw new BadRequestException(`A review may have at most ${MAX_PHOTOS} photos`);
      }
      updates.photosJson = dto.photos;
    }
    if (dto.visitDate !== undefined) updates.visitDate = dto.visitDate;
    if (dto.isAnonymous !== undefined) updates.isAnonymous = dto.isAnonymous;

    const [updated] = await this.db
      .update(reviewTable)
      .set(updates)
      .where(eq(reviewTable.id, reviewId))
      .returning();

    if (!updated) throw new Error('Update failed');

    // Fetch response if any
    const response = await this.fetchResponse(reviewId);
    return mapReview(updated, null, response);
  }

  /**
   * Soft-delete a review. Owner-only.
   */
  async deleteReview(userId: UserId, reviewId: ReviewIdType): Promise<void> {
    const [existing] = await this.db
      .select({ userId: reviewTable.userId, status: reviewTable.status })
      .from(reviewTable)
      .where(eq(reviewTable.id, reviewId))
      .limit(1);

    if (!existing) throw new NotFoundException('Review not found');
    if (existing.userId !== userId) throw new ForbiddenException('You can only delete your own reviews');
    if (existing.status === 'removed') return; // idempotent

    await this.db
      .update(reviewTable)
      .set({ status: 'removed', updatedAt: new Date() })
      .where(eq(reviewTable.id, reviewId));
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * List reviews for a place with sorting, filtering, and cursor-based pagination.
   */
  async getReviews(
    placeId: PlaceIdType,
    query: GetReviewsQuery,
    viewerUserId?: UserId,
  ): Promise<ReviewPage> {
    const limit = Math.min(query.limit ?? 20, 50);
    const sort = query.sort ?? 'newest';
    const ratingFilter = query.rating;

    // Build base conditions
    const conditions = [
      eq(reviewTable.placeId, placeId),
      eq(reviewTable.status, 'active'),
    ];

    if (ratingFilter) {
      conditions.push(eq(reviewTable.rating, ratingFilter));
    }

    // Determine ORDER BY
    let orderBy;
    switch (sort) {
      case 'highest':
        orderBy = [desc(reviewTable.rating), desc(reviewTable.createdAt)];
        break;
      case 'lowest':
        orderBy = [asc(reviewTable.rating), desc(reviewTable.createdAt)];
        break;
      case 'most_helpful':
        orderBy = [desc(reviewTable.helpfulCount), desc(reviewTable.createdAt)];
        break;
      case 'newest':
      default:
        orderBy = [desc(reviewTable.createdAt)];
        break;
    }

    // Cursor-based pagination: cursor is a ISO timestamp for newest/most_helpful, or rating+timestamp for others
    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf8')) as Record<string, unknown>;
        if (sort === 'newest' && decoded.createdAt) {
          conditions.push(sql`${reviewTable.createdAt} < ${decoded.createdAt}`);
        } else if (sort === 'highest' && decoded.rating !== undefined && decoded.createdAt) {
          conditions.push(
            sql`(${reviewTable.rating}, ${reviewTable.createdAt}) < (${decoded.rating}, ${decoded.createdAt})`,
          );
        } else if (sort === 'lowest' && decoded.rating !== undefined && decoded.createdAt) {
          conditions.push(
            sql`(${reviewTable.rating}, ${reviewTable.createdAt}) > (${decoded.rating}, ${decoded.createdAt})`,
          );
        } else if (sort === 'most_helpful' && decoded.helpfulCount !== undefined && decoded.createdAt) {
          conditions.push(
            sql`(${reviewTable.helpfulCount}, ${reviewTable.createdAt}) < (${decoded.helpfulCount}, ${decoded.createdAt})`,
          );
        }
      } catch {
        // Invalid cursor — ignore, start from beginning
      }
    }

    const rows = await this.db
      .select()
      .from(reviewTable)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Fetch votes for the viewer
    const myVoteMap = new Map<string, boolean>();
    if (viewerUserId && items.length > 0) {
      const reviewIds = items.map((r) => r.id);
      const votes = await this.db
        .select({ reviewId: reviewVoteTable.reviewId, isHelpful: reviewVoteTable.isHelpful })
        .from(reviewVoteTable)
        .where(
          and(
            inArray(reviewVoteTable.reviewId, reviewIds),
            eq(reviewVoteTable.userId, viewerUserId),
          ),
        );
      for (const v of votes) {
        myVoteMap.set(v.reviewId, v.isHelpful);
      }
    }

    // Fetch responses
    const responseMap = await this.fetchResponseMap(items.map((r) => r.id));

    const mapped = items.map((r) =>
      mapReview(r, myVoteMap.get(r.id) ?? null, responseMap.get(r.id) ?? null),
    );

    // Build next cursor
    let nextCursor: string | undefined;
    const lastItem = hasMore && items.length > 0 ? items[items.length - 1] : undefined;
    if (lastItem) {
      const payload: Record<string, unknown> = { createdAt: toIso(lastItem.createdAt) };
      if (sort === 'highest' || sort === 'lowest') payload.rating = lastItem.rating;
      if (sort === 'most_helpful') payload.helpfulCount = lastItem.helpfulCount;
      nextCursor = Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    return { items: mapped, nextCursor };
  }

  /**
   * Get all reviews authored by a user with cursor pagination.
   */
  async getUserReviews(userId: UserId, query: { cursor?: string; limit?: number }): Promise<ReviewPage> {
    const limit = Math.min(query.limit ?? 20, 50);
    const conditions = [
      eq(reviewTable.userId, userId),
      eq(reviewTable.status, 'active'),
    ];

    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf8')) as { createdAt: string };
        if (decoded.createdAt) {
          conditions.push(sql`${reviewTable.createdAt} < ${decoded.createdAt}`);
        }
      } catch {
        // invalid cursor — ignore
      }
    }

    const rows = await this.db
      .select()
      .from(reviewTable)
      .where(and(...conditions))
      .orderBy(desc(reviewTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Fetch responses
    const responseMap = await this.fetchResponseMap(items.map((r) => r.id));

    const mapped = items.map((r) => mapReview(r, null, responseMap.get(r.id) ?? null));

    let nextCursor: string | undefined;
    const lastUserItem = hasMore && items.length > 0 ? items[items.length - 1] : undefined;
    if (lastUserItem) {
      nextCursor = Buffer.from(JSON.stringify({ createdAt: toIso(lastUserItem.createdAt) })).toString('base64');
    }

    return { items: mapped, nextCursor };
  }

  /**
   * Get a single review by ID.
   */
  async getReview(reviewId: ReviewIdType, viewerUserId?: UserId): Promise<ReviewRow> {
    const [row] = await this.db
      .select()
      .from(reviewTable)
      .where(and(eq(reviewTable.id, reviewId), eq(reviewTable.status, 'active')))
      .limit(1);

    if (!row) throw new NotFoundException('Review not found');

    let myVote: boolean | null = null;
    if (viewerUserId) {
      const [vote] = await this.db
        .select({ isHelpful: reviewVoteTable.isHelpful })
        .from(reviewVoteTable)
        .where(and(eq(reviewVoteTable.reviewId, reviewId), eq(reviewVoteTable.userId, viewerUserId)))
        .limit(1);
      myVote = vote?.isHelpful ?? null;
    }

    const response = await this.fetchResponse(reviewId);
    return mapReview(row, myVote, response);
  }

  // ── Votes ──────────────────────────────────────────────────────────────────

  /**
   * Cast a helpful vote on a review. Toggling the same vote removes it.
   */
  async voteReview(userId: UserId, reviewId: ReviewIdType, dto: VoteReviewDto): Promise<{ helpfulCount: number; notHelpfulCount: number; myVote: boolean | null }> {
    const [review] = await this.db
      .select({ id: reviewTable.id, userId: reviewTable.userId, status: reviewTable.status })
      .from(reviewTable)
      .where(eq(reviewTable.id, reviewId))
      .limit(1);

    if (!review) throw new NotFoundException('Review not found');
    if (review.status !== 'active') throw new BadRequestException('Cannot vote on an inactive review');
    if (review.userId === userId) throw new BadRequestException('You cannot vote on your own review');

    const [existing] = await this.db
      .select({ isHelpful: reviewVoteTable.isHelpful })
      .from(reviewVoteTable)
      .where(and(eq(reviewVoteTable.reviewId, reviewId), eq(reviewVoteTable.userId, userId)))
      .limit(1);

    let newVote: boolean | null;

    if (existing === undefined) {
      // New vote
      await this.db.insert(reviewVoteTable).values({
        reviewId,
        userId,
        isHelpful: dto.isHelpful,
        createdAt: new Date(),
      });
      newVote = dto.isHelpful;
    } else if (existing.isHelpful === dto.isHelpful) {
      // Toggle off — remove vote
      await this.db
        .delete(reviewVoteTable)
        .where(and(eq(reviewVoteTable.reviewId, reviewId), eq(reviewVoteTable.userId, userId)));
      newVote = null;
    } else {
      // Change vote
      await this.db
        .update(reviewVoteTable)
        .set({ isHelpful: dto.isHelpful, createdAt: new Date() })
        .where(and(eq(reviewVoteTable.reviewId, reviewId), eq(reviewVoteTable.userId, userId)));
      newVote = dto.isHelpful;
    }

    // Recount votes
    const [counts] = await this.db
      .select({
        helpfulCount: sql<number>`count(*) filter (where ${reviewVoteTable.isHelpful} = true)::int`,
        notHelpfulCount: sql<number>`count(*) filter (where ${reviewVoteTable.isHelpful} = false)::int`,
      })
      .from(reviewVoteTable)
      .where(eq(reviewVoteTable.reviewId, reviewId));

    const helpfulCount = counts?.helpfulCount ?? 0;
    const notHelpfulCount = counts?.notHelpfulCount ?? 0;

    // Update denormalized counters
    await this.db
      .update(reviewTable)
      .set({ helpfulCount, notHelpfulCount, updatedAt: new Date() })
      .where(eq(reviewTable.id, reviewId));

    return { helpfulCount, notHelpfulCount, myVote: newVote };
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  /**
   * Report a review as inappropriate.
   */
  async reportReview(userId: UserId, reviewId: ReviewIdType, dto: ReportReviewDto): Promise<void> {
    const [review] = await this.db
      .select({ id: reviewTable.id, status: reviewTable.status })
      .from(reviewTable)
      .where(eq(reviewTable.id, reviewId))
      .limit(1);

    if (!review) throw new NotFoundException('Review not found');
    if (review.status !== 'active') throw new BadRequestException('Cannot report an inactive review');

    // Upsert — prevent duplicate reports
    try {
      await this.db.insert(reviewReportTable).values({
        id: randomUUID(),
        reporterId: userId,
        reviewId,
        reason: dto.reason,
        createdAt: new Date(),
      });
    } catch {
      // Unique constraint: already reported by this user
      throw new ConflictException('You have already reported this review');
    }
  }

  // ── Rating summary ─────────────────────────────────────────────────────────

  /**
   * Get rating breakdown and average for a place.
   */
  async getPlaceRatingSummary(placeId: PlaceIdType): Promise<RatingSummary> {
    const rows = await this.db
      .select({
        rating: reviewTable.rating,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewTable)
      .where(and(eq(reviewTable.placeId, placeId), eq(reviewTable.status, 'active')))
      .groupBy(reviewTable.rating);

    const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;

    for (const row of rows) {
      const r = row.rating as 1 | 2 | 3 | 4 | 5;
      breakdown[r] = row.count;
      total += row.count;
      sum += row.rating * row.count;
    }

    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;

    return { placeId, average, total, breakdown };
  }

  // ── Top reviewers ──────────────────────────────────────────────────────────

  /**
   * Return users with the most active reviews, for leaderboard display.
   */
  async getTopReviewers(limit = 10): Promise<TopReviewer[]> {
    const rows = await this.db
      .select({
        userId: reviewTable.userId,
        reviewCount: sql<number>`count(*)::int`,
        avgRating: sql<number>`round(avg(${reviewTable.rating})::numeric, 1)::float`,
      })
      .from(reviewTable)
      .where(eq(reviewTable.status, 'active'))
      .groupBy(reviewTable.userId)
      .orderBy(desc(sql`count(*)`))
      .limit(Math.min(limit, 50));

    return rows.map((r, idx) => ({
      userId: r.userId as UserId,
      reviewCount: r.reviewCount,
      avgRating: r.avgRating,
      rank: idx + 1,
    }));
  }

  // ── Provider responses ─────────────────────────────────────────────────────

  /**
   * A provider adds or updates their response to a review for their place.
   */
  async respondToReview(
    providerId: string,
    reviewId: ReviewIdType,
    dto: RespondToReviewDto,
  ): Promise<ReviewResponseRow> {
    if (dto.text.length > MAX_RESPONSE_LENGTH) {
      throw new BadRequestException(`Response must be at most ${MAX_RESPONSE_LENGTH} characters`);
    }
    if (dto.text.trim().length === 0) {
      throw new BadRequestException('Response text cannot be empty');
    }

    const [review] = await this.db
      .select({ id: reviewTable.id, status: reviewTable.status })
      .from(reviewTable)
      .where(eq(reviewTable.id, reviewId))
      .limit(1);

    if (!review) throw new NotFoundException('Review not found');
    if (review.status !== 'active') throw new BadRequestException('Cannot respond to an inactive review');

    const now = new Date();

    // Upsert: a review can have only one provider response
    const existing = await this.db
      .select({ id: reviewResponseTable.id })
      .from(reviewResponseTable)
      .where(eq(reviewResponseTable.reviewId, reviewId))
      .limit(1);

    let row: typeof reviewResponseTable.$inferSelect;

    if (existing.length > 0) {
      const [updated] = await this.db
        .update(reviewResponseTable)
        .set({ text: dto.text, updatedAt: now })
        .where(eq(reviewResponseTable.reviewId, reviewId))
        .returning();
      if (!updated) throw new Error('Update failed');
      row = updated;
    } else {
      const [inserted] = await this.db
        .insert(reviewResponseTable)
        .values({
          id: randomUUID(),
          reviewId,
          providerId,
          text: dto.text,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!inserted) throw new Error('Insert failed');
      row = inserted;
    }

    return {
      id: row.id,
      reviewId: row.reviewId as ReviewIdType,
      providerId: row.providerId,
      text: row.text,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  /**
   * Get reviews for a provider's place(s), for provider review management screen.
   */
  async getProviderPlaceReviews(
    placeId: PlaceIdType,
    query: { cursor?: string; limit?: number; includeResponded?: boolean },
  ): Promise<ReviewPage> {
    const limit = Math.min(query.limit ?? 20, 50);
    const conditions = [
      eq(reviewTable.placeId, placeId),
      eq(reviewTable.status, 'active'),
    ];

    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf8')) as { createdAt: string };
        if (decoded.createdAt) {
          conditions.push(sql`${reviewTable.createdAt} < ${decoded.createdAt}`);
        }
      } catch {
        // ignore bad cursor
      }
    }

    const rows = await this.db
      .select()
      .from(reviewTable)
      .where(and(...conditions))
      .orderBy(desc(reviewTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Fetch responses
    const responseMap = await this.fetchResponseMap(items.map((r) => r.id));

    // Optionally filter to only unresponded reviews
    let filtered = items;
    if (query.includeResponded === false) {
      filtered = items.filter((r) => !responseMap.has(r.id));
    }

    const mapped = filtered.map((r) => mapReview(r, null, responseMap.get(r.id) ?? null));

    let nextCursor: string | undefined;
    const lastProviderItem = hasMore && items.length > 0 ? items[items.length - 1] : undefined;
    if (lastProviderItem) {
      nextCursor = Buffer.from(JSON.stringify({ createdAt: toIso(lastProviderItem.createdAt) })).toString('base64');
    }

    return { items: mapped, nextCursor };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async fetchResponseMap(reviewIds: string[]): Promise<Map<string, ReviewResponseRow>> {
    const map = new Map<string, ReviewResponseRow>();
    if (reviewIds.length === 0) return map;
    const responses = await this.db
      .select()
      .from(reviewResponseTable)
      .where(inArray(reviewResponseTable.reviewId, reviewIds));
    for (const resp of responses) {
      map.set(resp.reviewId, {
        id: resp.id,
        reviewId: resp.reviewId as ReviewIdType,
        providerId: resp.providerId,
        text: resp.text,
        createdAt: toIso(resp.createdAt),
        updatedAt: toIso(resp.updatedAt),
      });
    }
    return map;
  }

  private async fetchResponse(reviewId: ReviewIdType): Promise<ReviewResponseRow | null> {
    const [resp] = await this.db
      .select()
      .from(reviewResponseTable)
      .where(eq(reviewResponseTable.reviewId, reviewId))
      .limit(1);

    if (!resp) return null;

    return {
      id: resp.id,
      reviewId: resp.reviewId as ReviewIdType,
      providerId: resp.providerId,
      text: resp.text,
      createdAt: toIso(resp.createdAt),
      updatedAt: toIso(resp.updatedAt),
    };
  }
}
