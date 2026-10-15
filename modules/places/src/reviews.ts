/**
 * M75: Place reviews and ratings service.
 * One review per user per place; subsequent submissions are an upsert.
 */
import { type PlaceId, type Review, type ReviewId, type RatingSummary, type UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { avg, count, desc, eq, and, lt } from 'drizzle-orm';
import { pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const placesSchema = pgSchema('places');

export const reviewTable = placesSchema.table('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: text('place_id').notNull(),
  userId: uuid('user_id').notNull(),
  rating: smallint('rating').notNull(),
  text: text('text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export class ReviewsService {
  constructor(private readonly db: Db) {}

  async submit(
    placeId: PlaceId,
    userId: UserId,
    rating: number,
    reviewText?: string,
  ): Promise<Review> {
    const [row] = await this.db
      .insert(reviewTable)
      .values({ placeId, userId, rating, text: reviewText ?? null })
      .onConflictDoUpdate({
        target: [reviewTable.placeId, reviewTable.userId],
        set: { rating, text: reviewText ?? null, createdAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('review upsert failed');
    return this.toShape(row);
  }

  async list(placeId: PlaceId, cursor?: string): Promise<{ items: Review[]; nextCursor?: string; summary: RatingSummary }> {
    const limit = 20;
    const rows = await this.db
      .select()
      .from(reviewTable)
      .where(
        cursor
          ? and(eq(reviewTable.placeId, placeId), lt(reviewTable.createdAt, new Date(cursor)))
          : eq(reviewTable.placeId, placeId),
      )
      .orderBy(desc(reviewTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const [agg] = await this.db
      .select({ count: count(), average: avg(reviewTable.rating) })
      .from(reviewTable)
      .where(eq(reviewTable.placeId, placeId));

    const summary: RatingSummary = {
      placeId,
      count: Number(agg?.count ?? 0),
      average: agg?.average != null ? Math.round(Number(agg.average) * 10) / 10 : null,
    };

    return {
      items: items.map((r) => this.toShape(r)),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
      summary,
    };
  }

  async deleteOwn(placeId: PlaceId, userId: UserId): Promise<boolean> {
    const result = await this.db
      .delete(reviewTable)
      .where(and(eq(reviewTable.placeId, placeId), eq(reviewTable.userId, userId)))
      .returning({ id: reviewTable.id });
    return result.length > 0;
  }

  private toShape(row: typeof reviewTable.$inferSelect): Review {
    return {
      id: row.id as ReviewId,
      placeId: row.placeId as PlaceId,
      userId: row.userId,
      rating: Number(row.rating),
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
