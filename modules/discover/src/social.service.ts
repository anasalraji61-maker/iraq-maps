/**
 * Social features service: Events, Challenges, Marketplace
 */
import { type UserId } from '@iraq-maps/contracts';
import { type Db } from '@iraq-maps/db-kit';
import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { and, desc, eq, gte, lte, lt, sql } from 'drizzle-orm';
import { challengeProgressTable, challengeTable, eventRsvpTable, eventTable, listingTable } from './schema';
import type {
  ChallengeId,
  EventId,
  ListingId,
} from '@iraq-maps/contracts';
import type { z } from 'zod';

type EventIdType = z.infer<typeof EventId>;
type ChallengeIdType = z.infer<typeof ChallengeId>;
type ListingIdType = z.infer<typeof ListingId>;

@Injectable()
export class SocialService {
  constructor(@Inject('DISCOVER_DB') private readonly db: Db) {}

  // ─── Events ────────────────────────────────────────────────────────────────

  async createEvent(
    organizerId: UserId,
    body: {
      title: string;
      description: string;
      lat: number;
      lng: number;
      address: string;
      startTime: string;
      endTime: string;
      maxAttendees?: number;
      imageUrl?: string;
      category: string;
    },
  ) {
    if (new Date(body.endTime) <= new Date(body.startTime)) {
      throw new BadRequestException('endTime must be after startTime');
    }
    const [row] = await this.db
      .insert(eventTable)
      .values({
        organizerId,
        title: body.title,
        description: body.description,
        lat: body.lat,
        lng: body.lng,
        address: body.address,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        maxAttendees: body.maxAttendees ?? null,
        imageUrl: body.imageUrl ?? null,
        category: body.category,
      })
      .returning();
    return this.toEventDto(row!, organizerId, 0, false);
  }

  async listEvents(
    userId: UserId,
    opts: {
      cursor?: string;
      limit: number;
      category?: string;
      fromDate?: string;
      toDate?: string;
    },
  ) {
    const where = [];
    if (opts.category) where.push(eq(eventTable.category, opts.category));
    if (opts.fromDate) where.push(gte(eventTable.startTime, new Date(opts.fromDate)));
    if (opts.toDate) where.push(lte(eventTable.startTime, new Date(opts.toDate)));
    if (opts.cursor) where.push(lt(eventTable.createdAt, new Date(opts.cursor)));

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(and(...where))
      .orderBy(desc(eventTable.startTime))
      .limit(opts.limit + 1);

    const rsvps = await this.db
      .select()
      .from(eventRsvpTable)
      .where(eq(eventRsvpTable.userId, userId));
    const myRsvpSet = new Set(rsvps.map((r) => r.eventId));

    const counts = await this.db
      .select({ eventId: eventRsvpTable.eventId, count: sql<number>`count(*)::int` })
      .from(eventRsvpTable)
      .groupBy(eventRsvpTable.eventId);
    const countMap = new Map(counts.map((c) => [c.eventId, c.count]));

    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map((r) =>
      this.toEventDto(r, userId, countMap.get(r.id) ?? 0, myRsvpSet.has(r.id)),
    );
    return { items, nextCursor: hasMore ? rows[opts.limit - 1]!.createdAt.toISOString() : undefined };
  }

  async getEvent(userId: UserId, eventId: EventIdType) {
    const [row] = await this.db.select().from(eventTable).where(eq(eventTable.id, eventId));
    if (!row) throw new NotFoundException('Event not found');
    const [rsvpRow] = await this.db
      .select()
      .from(eventRsvpTable)
      .where(and(eq(eventRsvpTable.eventId, eventId), eq(eventRsvpTable.userId, userId)));
    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventRsvpTable)
      .where(eq(eventRsvpTable.eventId, eventId));
    return this.toEventDto(row, userId, countRow?.count ?? 0, !!rsvpRow);
  }

  async rsvpEvent(userId: UserId, eventId: EventIdType) {
    const [event] = await this.db.select().from(eventTable).where(eq(eventTable.id, eventId));
    if (!event) throw new NotFoundException('Event not found');

    if (event.maxAttendees !== null) {
      const [countRow2] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventRsvpTable)
        .where(eq(eventRsvpTable.eventId, eventId));
      if ((countRow2?.count ?? 0) >= event.maxAttendees) {
        throw new BadRequestException('Event is full');
      }
    }

    await this.db
      .insert(eventRsvpTable)
      .values({ eventId, userId })
      .onConflictDoNothing();
  }

  async cancelRsvp(userId: UserId, eventId: EventIdType) {
    const [event] = await this.db.select().from(eventTable).where(eq(eventTable.id, eventId));
    if (!event) throw new NotFoundException('Event not found');
    await this.db
      .delete(eventRsvpTable)
      .where(and(eq(eventRsvpTable.eventId, eventId), eq(eventRsvpTable.userId, userId)));
  }

  private toEventDto(
    row: typeof eventTable.$inferSelect,
    _userId: UserId,
    attendeeCount: number,
    isAttending: boolean,
  ) {
    return {
      id: row.id as EventIdType,
      organizerId: row.organizerId as UserId,
      title: row.title,
      description: row.description,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      maxAttendees: row.maxAttendees,
      attendeeCount,
      isAttending,
      imageUrl: row.imageUrl,
      category: row.category as 'cultural' | 'sport' | 'food' | 'business' | 'education' | 'entertainment' | 'social' | 'other',
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ─── Challenges ───────────────────────────────────────────────────────────

  async listChallenges(userId: UserId, statusFilter?: string) {
    const now = new Date();
    let rows = await this.db.select().from(challengeTable).orderBy(desc(challengeTable.startsAt));

    if (statusFilter) {
      rows = rows.filter((r) => this.getChallengeStatus(r, now) === statusFilter);
    }

    const myProgress = await this.db
      .select()
      .from(challengeProgressTable)
      .where(eq(challengeProgressTable.userId, userId));
    const progressMap = new Map(myProgress.map((p) => [p.challengeId, p.progress]));

    const totalParticipants = await this.db
      .select({ challengeId: challengeProgressTable.challengeId, count: sql<number>`count(*)::int` })
      .from(challengeProgressTable)
      .groupBy(challengeProgressTable.challengeId);
    const totalMap = new Map(totalParticipants.map((p) => [p.challengeId, p.count]));

    return {
      items: rows.map((r) =>
        this.toChallengeDto(r, progressMap.get(r.id) ?? 0, totalMap.get(r.id) ?? 0, null),
      ),
    };
  }

  async getChallenge(userId: UserId, challengeId: ChallengeIdType) {
    const [row] = await this.db.select().from(challengeTable).where(eq(challengeTable.id, challengeId));
    if (!row) throw new NotFoundException('Challenge not found');

    const [myP] = await this.db
      .select()
      .from(challengeProgressTable)
      .where(and(eq(challengeProgressTable.challengeId, challengeId), eq(challengeProgressTable.userId, userId)));

    const allProgress = await this.db
      .select()
      .from(challengeProgressTable)
      .where(eq(challengeProgressTable.challengeId, challengeId))
      .orderBy(desc(challengeProgressTable.progress))
      .limit(20);

    const myRank = allProgress.findIndex((p) => p.userId === userId) + 1 || null;

    const leaderboard = allProgress.map((p, i) => ({
      rank: i + 1,
      userId: p.userId as UserId,
      displayName: `user_${p.userId.slice(0, 6)}`,
      progress: p.progress,
    }));

    const challenge = this.toChallengeDto(
      row,
      myP?.progress ?? 0,
      allProgress.length,
      myRank,
    );

    return { challenge, leaderboard };
  }

  async recordProgress(userId: UserId, challengeId: ChallengeIdType, increment: number) {
    const [row] = await this.db.select().from(challengeTable).where(eq(challengeTable.id, challengeId));
    if (!row) throw new NotFoundException('Challenge not found');

    const now = new Date();
    if (now < row.startsAt || now > row.endsAt) {
      throw new BadRequestException('Challenge is not active');
    }

    const [existing] = await this.db
      .select()
      .from(challengeProgressTable)
      .where(and(eq(challengeProgressTable.challengeId, challengeId), eq(challengeProgressTable.userId, userId)));

    const currentProgress = existing?.progress ?? 0;
    const newProgress = currentProgress + increment;

    await this.db
      .insert(challengeProgressTable)
      .values({ challengeId, userId, progress: newProgress, updatedAt: now })
      .onConflictDoUpdate({
        target: [challengeProgressTable.challengeId, challengeProgressTable.userId],
        set: { progress: newProgress, updatedAt: now },
      });

    return { newProgress, completed: newProgress >= row.targetCount };
  }

  private getChallengeStatus(row: typeof challengeTable.$inferSelect, now: Date): 'upcoming' | 'active' | 'completed' {
    if (now < row.startsAt) return 'upcoming';
    if (now > row.endsAt) return 'completed';
    return 'active';
  }

  private toChallengeDto(
    row: typeof challengeTable.$inferSelect,
    myProgress: number,
    totalParticipants: number,
    myRank: number | null,
  ) {
    const now = new Date();
    return {
      id: row.id as ChallengeIdType,
      title: row.title,
      description: row.description,
      type: row.type as 'photo' | 'checkin' | 'review',
      targetCount: row.targetCount,
      reward: row.reward,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: this.getChallengeStatus(row, now),
      totalParticipants,
      myProgress,
      myRank,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ─── Marketplace ──────────────────────────────────────────────────────────

  async createListing(
    sellerId: UserId,
    body: {
      title: string;
      description: string;
      price: number;
      currency?: string;
      category: string;
      images?: string[];
      lat?: number;
      lng?: number;
    },
    sellerName: string,
  ) {
    const [row] = await this.db
      .insert(listingTable)
      .values({
        sellerId,
        sellerName,
        title: body.title,
        description: body.description,
        price: String(body.price),
        currency: body.currency ?? 'IQD',
        category: body.category,
        images: body.images ?? [],
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        status: 'active',
      })
      .returning();
    return this.toListingDto(row!);
  }

  async listListings(opts: {
    cursor?: string;
    limit: number;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    sellerId?: string;
  }) {
    const where = [eq(listingTable.status, 'active')];
    if (opts.category) where.push(eq(listingTable.category, opts.category));
    if (opts.sellerId) where.push(eq(listingTable.sellerId, opts.sellerId));
    if (opts.cursor) where.push(lt(listingTable.createdAt, new Date(opts.cursor)));

    const rows = await this.db
      .select()
      .from(listingTable)
      .where(and(...where))
      .orderBy(desc(listingTable.createdAt))
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map((r) => this.toListingDto(r));
    return { items, nextCursor: hasMore ? rows[opts.limit - 1]!.createdAt.toISOString() : undefined };
  }

  async getListing(listingId: ListingIdType) {
    const [row] = await this.db.select().from(listingTable).where(eq(listingTable.id, listingId));
    if (!row) throw new NotFoundException('Listing not found');
    return this.toListingDto(row);
  }

  async updateListing(
    userId: UserId,
    listingId: ListingIdType,
    body: {
      title?: string;
      description?: string;
      price?: number;
      status?: string;
      images?: string[];
    },
  ) {
    const [row] = await this.db.select().from(listingTable).where(eq(listingTable.id, listingId));
    if (!row) throw new NotFoundException('Listing not found');
    if (row.sellerId !== userId) throw new ForbiddenException('Not your listing');

    const updates: Partial<typeof listingTable.$inferInsert> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.price !== undefined) updates.price = String(body.price);
    if (body.status !== undefined) updates.status = body.status;
    if (body.images !== undefined) updates.images = body.images;

    const [updated] = await this.db
      .update(listingTable)
      .set(updates)
      .where(eq(listingTable.id, listingId))
      .returning();
    return this.toListingDto(updated!);
  }

  private toListingDto(row: typeof listingTable.$inferSelect) {
    return {
      id: row.id as ListingIdType,
      sellerId: row.sellerId as UserId,
      sellerName: row.sellerName,
      title: row.title,
      description: row.description,
      price: Number(row.price),
      currency: row.currency,
      category: row.category as 'electronics' | 'clothing' | 'vehicles' | 'furniture' | 'food' | 'services' | 'real_estate' | 'other',
      images: row.images,
      lat: row.lat,
      lng: row.lng,
      status: row.status as 'active' | 'sold' | 'removed',
      createdAt: row.createdAt.toISOString(),
    };
  }
}
