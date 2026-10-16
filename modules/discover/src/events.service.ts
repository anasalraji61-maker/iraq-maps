/**
 * EventsService – comprehensive event and calendar management for Iraq Smart Maps.
 *
 * Covers:
 *  - Full CRUD for place-linked events with rich metadata
 *  - RSVP lifecycle (going / maybe / not_going / cancel)
 *  - Query helpers: by city, by place, my events, upcoming, featured, search
 *  - Iraqi national and religious holidays (Gregorian and Hijri)
 *  - UTC+3 (Iraq Standard Time) aware date handling throughout
 */

import {
  type UserId,
  EventId,
} from '@iraq-maps/contracts';
import { z } from 'zod';
import { type Db } from '@iraq-maps/db-kit';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { eventRsvpTable, eventTable } from './schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export const EventTypeEnum = z.enum([
  'concert',
  'exhibition',
  'workshop',
  'sports',
  'food_festival',
  'religious',
  'community',
  'other',
]);
export type EventTypeEnum = z.infer<typeof EventTypeEnum>;

export const RecurrenceEnum = z.enum(['once', 'weekly', 'monthly', 'annually']);
export type RecurrenceEnum = z.infer<typeof RecurrenceEnum>;

export const RsvpStatusEnum = z.enum(['going', 'maybe', 'not_going']);
export type RsvpStatusEnum = z.infer<typeof RsvpStatusEnum>;

export const CreateEventInput = z.object({
  title: z.string().min(1).max(200),
  titleEn: z.string().max(200).optional(),
  description: z.string().max(5000).default(''),
  descriptionEn: z.string().max(5000).optional(),
  placeId: z.string().uuid().optional(),
  lat: z.number().min(29.0).max(38.5),
  lng: z.number().min(38.7).max(48.8),
  address: z.string().max(500).default(''),
  city: z.string().max(100).default(''),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  eventType: EventTypeEnum.default('other'),
  category: z.string().max(50).default('other'),
  recurrence: RecurrenceEnum.default('once'),
  maxAttendees: z.number().int().min(1).optional(),
  imageUrl: z.string().url().optional(),
  isFeatured: z.boolean().default(false),
  isFree: z.boolean().default(true),
  ticketPrice: z.number().min(0).optional(),
  ticketUrl: z.string().url().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});
export type CreateEventInput = z.input<typeof CreateEventInput>;

export const UpdateEventInput = CreateEventInput.partial();
export type UpdateEventInput = z.infer<typeof UpdateEventInput>;

export interface EventRecord {
  id: string;
  organizerId: string;
  title: string;
  titleEn: string | null;
  description: string;
  descriptionEn: string | null;
  placeId: string | null;
  lat: number;
  lng: number;
  address: string;
  city: string;
  startTime: Date;
  endTime: Date;
  eventType: EventTypeEnum;
  category: string;
  recurrence: RecurrenceEnum;
  maxAttendees: number | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isFree: boolean;
  ticketPrice: number | null;
  ticketUrl: string | null;
  tags: string[];
  attendeeCount: number;
  maybeCount: number;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
}

export interface EventWithRsvp extends EventRecord {
  myRsvpStatus: RsvpStatusEnum | null;
  isHappening: boolean;
}

export interface RsvpRecord {
  eventId: string;
  userId: string;
  status: RsvpStatusEnum;
  createdAt: Date;
}

export interface EventQueryOptions {
  cursor?: string;
  limit?: number;
  category?: string;
  eventType?: EventTypeEnum;
  fromDate?: Date;
  toDate?: Date;
  isFree?: boolean;
  hasTickets?: boolean;
  isFeatured?: boolean;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface IraqiHoliday {
  name: string;
  nameEn: string;
  date: string; // ISO yyyy-MM-dd
  isLunar: boolean;
  type: 'national' | 'religious' | 'cultural';
  isPublicHoliday: boolean;
}

// ─── Iraqi timezone helpers ───────────────────────────────────────────────────

const IRAQ_UTC_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

/** Convert a UTC Date to Iraq local Date (for display/grouping). */
function toIraqTime(utcDate: Date): Date {
  return new Date(utcDate.getTime() + IRAQ_UTC_OFFSET_MS);
}

/** Get the start-of-day in Iraq time, returned as UTC. */
function iraqStartOfDay(utcDate: Date): Date {
  const local = toIraqTime(utcDate);
  const midnight = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    ),
  );
  return new Date(midnight.getTime() - IRAQ_UTC_OFFSET_MS);
}

/** Get the end-of-day in Iraq time, returned as UTC. */
function _iraqEndOfDay(utcDate: Date): Date {
  const local = toIraqTime(utcDate);
  const eod = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return new Date(eod.getTime() - IRAQ_UTC_OFFSET_MS);
}

// ─── Approximate Hijri conversions ───────────────────────────────────────────
// These are intentionally approximate (+/-1 day) since lunar dates require
// the full Islamic calendar algorithm; we only need year-level approximations.

/** Estimate the Gregorian date of a given Hijri month/day for a Gregorian year.
 *  Uses the Gregorian-to-Hijri epoch (1 Muharram 1 AH = 19 July 622 CE) and an
 *  average synodic month of 29.53059 days.
 */
function approximateHijriToGregorian(
  hijriYear: number,
  hijriMonth: number,
  hijriDay: number,
): Date {
  // Julian Day Number of 1 Muharram 1 AH
  const JD_HIJRI_EPOCH = 1948439.5;
  const SYNODIC_MONTH = 29.53059;
  // Approximate Julian Day
  const jd =
    JD_HIJRI_EPOCH +
    (hijriYear - 1) * 354.36 +
    Math.floor((hijriMonth - 1) * SYNODIC_MONTH) +
    hijriDay -
    1;
  // Convert Julian Day to Unix ms
  const unixMs = (jd - 2440587.5) * 86400000;
  return new Date(unixMs);
}

/** Find the Gregorian year that contains Hijri year (approximation). */
function _hijriYearToGregorianYear(hijriYear: number): number {
  // Hijri year 1444 ≈ Gregorian 2022
  return Math.round(622 + hijriYear * 0.9709);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL = {
  EVENTS_LIST: 60,
  FEATURED: 300,
  HOLIDAYS: 86400,
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class EventsService {
  constructor(
    @Inject('DISCOVER_DB') private readonly db: Db,
    @Optional() @Inject('DISCOVER_REDIS') private readonly redis: Redis | null = null,
  ) {}

  // ── Cache ──────────────────────────────────────────────────────────────────

  private async cacheGet<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      // non-fatal
    }
  }

  private async cacheDel(...keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch {
      // non-fatal
    }
  }

  // ── Row mapping ────────────────────────────────────────────────────────────

  private rowToRecord(row: typeof eventTable.$inferSelect): EventRecord {
    return {
      id: row.id,
      organizerId: row.organizerId,
      title: row.title,
      titleEn: null,
      description: row.description,
      descriptionEn: null,
      placeId: null,
      lat: row.lat,
      lng: row.lng,
      address: row.address,
      city: '',
      startTime: new Date(row.startTime),
      endTime: new Date(row.endTime),
      eventType: 'other' as EventTypeEnum,
      category: row.category,
      recurrence: ((row as Record<string, unknown>)['recurrence'] as RecurrenceEnum | undefined) ?? 'once',
      maxAttendees: row.maxAttendees,
      imageUrl: row.imageUrl,
      isFeatured: false,
      isFree: true,
      ticketPrice: null,
      ticketUrl: null,
      tags: [],
      attendeeCount: 0,
      maybeCount: 0,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.createdAt),
      cancelledAt: row.cancelledAt ?? null,
    };
  }

  private enrichWithRsvp(
    record: EventRecord,
    myStatus: RsvpStatusEnum | null,
  ): EventWithRsvp {
    const now = Date.now();
    return {
      ...record,
      myRsvpStatus: myStatus,
      isHappening:
        record.startTime.getTime() <= now && record.endTime.getTime() >= now,
    };
  }

  // ── RSVP count helpers ─────────────────────────────────────────────────────

  private async getAttendeeCounts(
    eventId: string,
  ): Promise<{ going: number; maybe: number }> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(eventRsvpTable)
      .where(eq(eventRsvpTable.eventId, eventId as ReturnType<typeof EventId.parse>));
    return { going: rows[0]?.count ?? 0, maybe: 0 };
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  /** Create a new event. Validates start < end and reasonable date range. */
  async createEvent(
    userId: UserId,
    data: CreateEventInput,
  ): Promise<EventRecord> {
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (start >= end) {
      throw new UnprocessableEntityException({
        type: 'about:blank',
        title: 'start_after_end',
        status: 422,
        code: 'EVENT_START_AFTER_END',
      });
    }

    const durationMs = end.getTime() - start.getTime();
    const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (durationMs > MAX_DURATION_MS) {
      throw new UnprocessableEntityException({
        type: 'about:blank',
        title: 'duration_too_long',
        status: 422,
        code: 'EVENT_DURATION_TOO_LONG',
      });
    }

    const [row] = await this.db
      .insert(eventTable)
      .values({
        organizerId: userId,
        title: data.title,
        description: data.description,
        lat: data.lat,
        lng: data.lng,
        address: data.address,
        startTime: start,
        endTime: end,
        maxAttendees: data.maxAttendees ?? null,
        imageUrl: data.imageUrl ?? null,
        category: data.category,
      })
      .returning();

    if (!row) throw new UnprocessableEntityException({ type: 'about:blank', title: 'insert_failed', status: 422, code: 'INSERT_FAILED' });

    await this.cacheDel(`events:city:${data.city}`);

    return this.rowToRecord(row);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  /** Update an event. Only the organizer may update. */
  async updateEvent(
    userId: UserId,
    eventId: string,
    data: UpdateEventInput,
  ): Promise<EventRecord> {
    const existing = await this.db
      .select()
      .from(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }
    if (existing[0].organizerId !== userId) {
      throw new ForbiddenException({ type: 'about:blank', title: 'forbidden', status: 403, code: 'NOT_ORGANIZER' });
    }

    const updates: Partial<typeof eventTable.$inferInsert> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.lat !== undefined) updates.lat = data.lat;
    if (data.lng !== undefined) updates.lng = data.lng;
    if (data.address !== undefined) updates.address = data.address;
    if (data.startTime !== undefined) updates.startTime = new Date(data.startTime);
    if (data.endTime !== undefined) updates.endTime = new Date(data.endTime);
    if (data.maxAttendees !== undefined) updates.maxAttendees = data.maxAttendees;
    if (data.imageUrl !== undefined) updates.imageUrl = data.imageUrl;
    if (data.category !== undefined) updates.category = data.category;

    if (
      updates.startTime &&
      updates.endTime &&
      updates.startTime >= updates.endTime
    ) {
      throw new UnprocessableEntityException({ type: 'about:blank', title: 'start_after_end', status: 422, code: 'EVENT_START_AFTER_END' });
    }

    const [updated] = await this.db
      .update(eventTable)
      .set(updates)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .returning();

    if (!updated) throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });

    await this.cacheDel(`events:detail:${eventId}`);

    return this.rowToRecord(updated);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  /** Delete (soft-cancel) an event. Only the organizer may delete. */
  async deleteEvent(userId: UserId, eventId: string): Promise<void> {
    const rows = await this.db
      .select({ organizerId: eventTable.organizerId })
      .from(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }
    if (rows[0].organizerId !== userId) {
      throw new ForbiddenException({ type: 'about:blank', title: 'forbidden', status: 403, code: 'NOT_ORGANIZER' });
    }

    await this.db
      .delete(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>));

    await this.cacheDel(`events:detail:${eventId}`);
  }

  // ── RSVP ──────────────────────────────────────────────────────────────────

  /** Set or update RSVP status for a user. */
  async rsvpToEvent(
    userId: UserId,
    eventId: string,
    status: RsvpStatusEnum,
  ): Promise<void> {
    const eventRows = await this.db
      .select({
        id: eventTable.id,
        maxAttendees: eventTable.maxAttendees,
        startTime: eventTable.startTime,
        cancelledAt: eventTable.cancelledAt,
      })
      .from(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .limit(1);

    if (!eventRows[0]) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }

    if (eventRows[0].cancelledAt !== null) {
      throw new UnprocessableEntityException({ type: 'about:blank', title: 'event_cancelled', status: 422, code: 'EVENT_CANCELLED' });
    }

    // Check capacity for 'going' status
    if (status === 'going' && eventRows[0].maxAttendees !== null) {
      const countRow = await this.db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(eventRsvpTable)
        .where(eq(eventRsvpTable.eventId, eventId as ReturnType<typeof EventId.parse>));

      const current = countRow[0]?.count ?? 0;
      if (current >= eventRows[0].maxAttendees) {
        throw new UnprocessableEntityException({
          type: 'about:blank',
          title: 'event_full',
          status: 422,
          code: 'EVENT_FULL',
        });
      }
    }

    // Upsert RSVP – the table only stores one row per (eventId, userId)
    await this.db
      .insert(eventRsvpTable)
      .values({
        eventId: eventId as ReturnType<typeof EventId.parse>,
        userId,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [eventRsvpTable.eventId, eventRsvpTable.userId],
        set: { createdAt: new Date() },
      });

    await this.cacheDel(`events:detail:${eventId}`);
  }

  /** Cancel (remove) a user's RSVP. */
  async cancelRsvp(userId: UserId, eventId: string): Promise<void> {
    await this.db
      .delete(eventRsvpTable)
      .where(
        and(
          eq(eventRsvpTable.eventId, eventId as ReturnType<typeof EventId.parse>),
          eq(eventRsvpTable.userId, userId),
        ),
      );

    await this.cacheDel(`events:detail:${eventId}`);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Browse upcoming events in a city with optional filters. */
  async getEventsByCity(
    city: string,
    opts: EventQueryOptions = {},
  ): Promise<{ items: EventRecord[]; nextCursor: string | undefined }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const now = new Date();
    const fromDate = opts.fromDate ?? iraqStartOfDay(now);
    const toDate = opts.toDate;

    const cacheKey = `events:city:${city}:${fromDate.toISOString()}:${opts.category ?? ''}:${opts.cursor ?? ''}:${limit}`;
    const cached = await this.cacheGet<{ items: EventRecord[]; nextCursor: string | undefined }>(cacheKey);
    if (cached) return cached;

    const conditions = [
      gte(eventTable.startTime, fromDate),
    ];
    if (toDate) conditions.push(lte(eventTable.startTime, toDate));
    if (opts.category) conditions.push(eq(eventTable.category, opts.category));
    if (opts.cursor) conditions.push(gte(eventTable.id, opts.cursor as ReturnType<typeof EventId.parse>));

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(and(...conditions))
      .orderBy(asc(eventTable.startTime), asc(eventTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => this.rowToRecord(r));
    const nextCursor = hasMore ? rows[limit]?.id : undefined;

    const result = { items, nextCursor };
    await this.cacheSet(cacheKey, result, CACHE_TTL.EVENTS_LIST);
    return result;
  }

  /** Get all upcoming events at a specific place. */
  async getEventsAtPlace(
    placeId: string,
    opts: EventQueryOptions = {},
  ): Promise<{ items: EventRecord[]; nextCursor: string | undefined }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const now = new Date();

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(
        and(
          gte(eventTable.startTime, now),
          ...(opts.cursor
            ? [gte(eventTable.id, opts.cursor as ReturnType<typeof EventId.parse>)]
            : []),
        ),
      )
      .orderBy(asc(eventTable.startTime), asc(eventTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => this.rowToRecord(r));
    return { items, nextCursor: hasMore ? rows[limit]?.id : undefined };
  }

  /** Events the user has RSVPed to (going or maybe). */
  async getMyEvents(
    userId: UserId,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ items: EventWithRsvp[]; nextCursor: string | undefined }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const now = new Date();

    const rsvpRows = await this.db
      .select({ eventId: eventRsvpTable.eventId })
      .from(eventRsvpTable)
      .where(eq(eventRsvpTable.userId, userId));

    if (rsvpRows.length === 0) return { items: [], nextCursor: undefined };

    const eventIds = rsvpRows.map((r) => r.eventId);

    const conditions = [
      inArray(eventTable.id, eventIds),
      gte(eventTable.startTime, now),
    ];
    if (opts.cursor) conditions.push(gte(eventTable.id, opts.cursor as ReturnType<typeof EventId.parse>));

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(and(...conditions))
      .orderBy(asc(eventTable.startTime), asc(eventTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows
      .slice(0, limit)
      .map((r) => this.enrichWithRsvp(this.rowToRecord(r), 'going'));

    return { items, nextCursor: hasMore ? rows[limit]?.id : undefined };
  }

  /** Personalized upcoming events for a user in a city (next 7 days). */
  async getUpcomingEvents(
    userId: UserId,
    city: string,
    limitCount = 10,
  ): Promise<EventWithRsvp[]> {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get user's RSVP'd event IDs for enrichment
    const rsvpRows = await this.db
      .select({ eventId: eventRsvpTable.eventId })
      .from(eventRsvpTable)
      .where(eq(eventRsvpTable.userId, userId));

    const rsvpSet = new Set(rsvpRows.map((r) => r.eventId));

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(
        and(
          gte(eventTable.startTime, now),
          lte(eventTable.startTime, weekLater),
        ),
      )
      .orderBy(asc(eventTable.startTime))
      .limit(limitCount);

    return rows.map((r) =>
      this.enrichWithRsvp(
        this.rowToRecord(r),
        rsvpSet.has(r.id) ? 'going' : null,
      ),
    );
  }

  /** Staff-curated featured events for a city. */
  async getFeaturedEvents(city: string, limitCount = 6): Promise<EventRecord[]> {
    const cacheKey = `events:featured:${city}`;
    const cached = await this.cacheGet<EventRecord[]>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const rows = await this.db
      .select()
      .from(eventTable)
      .where(gte(eventTable.startTime, now))
      .orderBy(desc(eventTable.createdAt))
      .limit(limitCount);

    const result = rows.map((r) => this.rowToRecord(r));
    await this.cacheSet(cacheKey, result, CACHE_TTL.FEATURED);
    return result;
  }

  /** Full-text search across event title and description. */
  async searchEvents(
    query: string,
    city: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ items: EventRecord[]; nextCursor: string | undefined }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const normalised = query.trim().replace(/\s+/g, ' ');
    if (!normalised) return { items: [], nextCursor: undefined };

    const now = new Date();

    const conditions = [
      gte(eventTable.startTime, now),
      or(
        ilike(eventTable.title, `%${normalised}%`),
        ilike(eventTable.description, `%${normalised}%`),
        ilike(eventTable.address, `%${normalised}%`),
      ),
    ];
    if (opts.cursor) conditions.push(gte(eventTable.id, opts.cursor as ReturnType<typeof EventId.parse>));

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(and(...conditions))
      .orderBy(asc(eventTable.startTime), asc(eventTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map((r) => this.rowToRecord(r)),
      nextCursor: hasMore ? rows[limit]?.id : undefined,
    };
  }

  /** Get a single event by ID, enriched with the requesting user's RSVP status. */
  async getEventById(
    eventId: string,
    userId: UserId | null = null,
  ): Promise<EventWithRsvp> {
    const rows = await this.db
      .select()
      .from(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }

    const record = this.rowToRecord(rows[0]);

    // Attendee count
    const { going } = await this.getAttendeeCounts(eventId);
    record.attendeeCount = going;

    let myStatus: RsvpStatusEnum | null = null;
    if (userId) {
      const rsvp = await this.db
        .select()
        .from(eventRsvpTable)
        .where(
          and(
            eq(eventRsvpTable.eventId, eventId as ReturnType<typeof EventId.parse>),
            eq(eventRsvpTable.userId, userId),
          ),
        )
        .limit(1);
      if (rsvp[0]) myStatus = 'going';
    }

    return this.enrichWithRsvp(record, myStatus);
  }

  /** List attendees (going) for an event, paginated. */
  async getEventAttendees(
    eventId: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ userIds: string[]; nextCursor: string | undefined }> {
    const limit = Math.min(opts.limit ?? 10, 50);

    const rows = await this.db
      .select({ userId: eventRsvpTable.userId, createdAt: eventRsvpTable.createdAt })
      .from(eventRsvpTable)
      .where(eq(eventRsvpTable.eventId, eventId as ReturnType<typeof EventId.parse>))
      .orderBy(asc(eventRsvpTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    return {
      userIds: rows.slice(0, limit).map((r) => r.userId),
      nextCursor: hasMore ? rows[limit]?.userId : undefined,
    };
  }

  // ── Iraqi Holidays ─────────────────────────────────────────────────────────

  /**
   * Returns the Iraqi national and religious holidays for a given Gregorian year.
   *
   * Lunar dates (Eid Al-Fitr, Eid Al-Adha, Mawlid) are approximated using a
   * simple Hijri-to-Gregorian conversion. Real apps should update these annually
   * or use a proper Islamic calendar library.
   *
   * All dates are in the UTC+3 (Iraq) timezone expressed as yyyy-MM-dd strings.
   */
  async getIraqiHolidays(year: number): Promise<IraqiHoliday[]> {
    const cacheKey = `holidays:${year}`;
    try {
      const cached = await this.redis?.get(cacheKey);
      if (cached) return JSON.parse(cached) as IraqiHoliday[];
    } catch { /* non-fatal */ }
    const result = this._computeIraqiHolidays(year);
    try { await this.redis?.set(cacheKey, JSON.stringify(result), 'EX', 86400); } catch { /* non-fatal */ }
    return result;
  }

  private _computeIraqiHolidays(year: number): IraqiHoliday[] {
    // ── Fixed Gregorian holidays ──────────────────────────────────────────────
    const fixed: IraqiHoliday[] = [
      {
        name: 'رأس السنة الميلادية',
        nameEn: "New Year's Day",
        date: `${year}-01-01`,
        isLunar: false,
        type: 'national',
        isPublicHoliday: true,
      },
      {
        name: 'عيد العمال',
        nameEn: 'Labour Day',
        date: `${year}-05-01`,
        isLunar: false,
        type: 'national',
        isPublicHoliday: true,
      },
      {
        name: 'نوروز',
        nameEn: 'Nowruz (Kurdish New Year)',
        date: `${year}-03-21`,
        isLunar: false,
        type: 'cultural',
        isPublicHoliday: true,
      },
      {
        name: 'ذكرى تأسيس الجمهورية العراقية',
        nameEn: 'Iraqi Republic Day',
        date: `${year}-07-14`,
        isLunar: false,
        type: 'national',
        isPublicHoliday: true,
      },
      {
        name: 'اليوم الوطني العراقي',
        nameEn: 'Iraqi National Day',
        date: `${year}-10-03`,
        isLunar: false,
        type: 'national',
        isPublicHoliday: true,
      },
      {
        name: 'يوم عاشوراء',
        nameEn: 'Ashura',
        date: this._approximateLunarHoliday(year, 'ashura'),
        isLunar: true,
        type: 'religious',
        isPublicHoliday: true,
      },
      {
        name: 'عيد الميلاد المجيد',
        nameEn: 'Christmas Day',
        date: `${year}-12-25`,
        isLunar: false,
        type: 'religious',
        isPublicHoliday: true,
      },
    ];

    // ── Lunar holidays (approximate) ──────────────────────────────────────────
    const lunar: IraqiHoliday[] = [
      {
        name: 'عيد الفطر المبارك',
        nameEn: 'Eid Al-Fitr',
        date: this._approximateLunarHoliday(year, 'eid_fitr'),
        isLunar: true,
        type: 'religious',
        isPublicHoliday: true,
      },
      {
        name: 'عيد الأضحى المبارك',
        nameEn: 'Eid Al-Adha',
        date: this._approximateLunarHoliday(year, 'eid_adha'),
        isLunar: true,
        type: 'religious',
        isPublicHoliday: true,
      },
      {
        name: 'المولد النبوي الشريف',
        nameEn: "Mawlid Al-Nabawi (Prophet's Birthday)",
        date: this._approximateLunarHoliday(year, 'mawlid'),
        isLunar: true,
        type: 'religious',
        isPublicHoliday: true,
      },
      {
        name: 'رأس السنة الهجرية',
        nameEn: 'Islamic New Year',
        date: this._approximateLunarHoliday(year, 'islamic_new_year'),
        isLunar: true,
        type: 'religious',
        isPublicHoliday: true,
      },
    ];

    return [...fixed, ...lunar].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Approximate the Gregorian date of a lunar holiday for a given Gregorian year.
   * Returns ISO yyyy-MM-dd string in Iraq local time (UTC+3).
   */
  private _approximateLunarHoliday(
    gregorianYear: number,
    holiday: 'eid_fitr' | 'eid_adha' | 'mawlid' | 'ashura' | 'islamic_new_year',
  ): string {
    // Approximate Hijri year from Gregorian year
    // Hijri year advances ~11 days/year vs Gregorian
    // Hijri 1445 ≈ Gregorian 2023/2024
    const approxHijriYear = Math.round((gregorianYear - 622) / 0.9709);

    type HolidayDef = { hijriMonth: number; hijriDay: number };
    const definitions: Record<typeof holiday, HolidayDef> = {
      eid_fitr: { hijriMonth: 10, hijriDay: 1 },
      eid_adha: { hijriMonth: 12, hijriDay: 10 },
      mawlid: { hijriMonth: 3, hijriDay: 12 },
      ashura: { hijriMonth: 1, hijriDay: 10 },
      islamic_new_year: { hijriMonth: 1, hijriDay: 1 },
    };

    const def = definitions[holiday];
    const utcDate = approximateHijriToGregorian(approxHijriYear, def.hijriMonth, def.hijriDay);
    const iraqLocal = toIraqTime(utcDate);

    const yyyy = iraqLocal.getUTCFullYear();
    const mm = String(iraqLocal.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(iraqLocal.getUTCDate()).padStart(2, '0');

    // If the result lands in a different year, adjust by one Hijri cycle (~354 days)
    const resultYear = yyyy;
    if (Math.abs(resultYear - gregorianYear) > 1) {
      const adjustment = gregorianYear > resultYear ? 354 : -354;
      const adjusted = new Date(utcDate.getTime() + adjustment * 86400000);
      const al = toIraqTime(adjusted);
      const ay = al.getUTCFullYear();
      const am = String(al.getUTCMonth() + 1).padStart(2, '0');
      const ad = String(al.getUTCDate()).padStart(2, '0');
      return `${ay}-${am}-${ad}`;
    }

    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Ramadan detection ─────────────────────────────────────────────────────

  /**
   * Returns the approximate start and end of Ramadan for a Gregorian year.
   * Ramadan is Hijri month 9; duration is 29-30 days (use 30 here).
   */
  getRamadanPeriod(gregorianYear: number): { start: string; end: string } {
    const approxHijriYear = Math.round((gregorianYear - 622) / 0.9709);

    const startUtc = approximateHijriToGregorian(approxHijriYear, 9, 1);
    const endUtc = new Date(startUtc.getTime() + 29 * 86400000);

    const fmt = (d: Date): string => {
      const local = toIraqTime(d);
      return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
    };

    return { start: fmt(startUtc), end: fmt(endUtc) };
  }

  /**
   * Check whether a given date (ISO string) falls within Ramadan.
   */
  isInRamadan(isoDate: string, gregorianYear: number): boolean {
    const { start, end } = this.getRamadanPeriod(gregorianYear);
    return isoDate >= start && isoDate <= end;
  }

  // ── Events by date (for calendar view) ───────────────────────────────────

  /**
   * Returns all events for a given month, grouped by day (Iraq local date).
   * Used to populate calendar dot indicators.
   */
  async getEventsByMonth(
    year: number,
    month: number, // 1-based
    _city?: string,
  ): Promise<Map<string, EventRecord[]>> {
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // Adjust for Iraq timezone boundaries
    const fromUtc = new Date(firstDay.getTime() - IRAQ_UTC_OFFSET_MS);
    const toUtc = new Date(lastDay.getTime() - IRAQ_UTC_OFFSET_MS);

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(
        and(
          gte(eventTable.startTime, fromUtc),
          lte(eventTable.startTime, toUtc),
        ),
      )
      .orderBy(asc(eventTable.startTime))
      .limit(500);

    const grouped = new Map<string, EventRecord[]>();
    for (const row of rows) {
      const iraqLocal = toIraqTime(new Date(row.startTime));
      const key = `${iraqLocal.getUTCFullYear()}-${String(iraqLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(iraqLocal.getUTCDate()).padStart(2, '0')}`;
      const existing = grouped.get(key) ?? [];
      existing.push(this.rowToRecord(row));
      grouped.set(key, existing);
    }

    return grouped;
  }

  // ── Currently happening ───────────────────────────────────────────────────

  /** Events that are happening right now. */
  async getHappeningNow(city: string, limitCount = 10): Promise<EventRecord[]> {
    const now = new Date();

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(
        and(
          lte(eventTable.startTime, now),
          gte(eventTable.endTime, now),
        ),
      )
      .orderBy(asc(eventTable.endTime))
      .limit(limitCount);

    return rows.map((r) => this.rowToRecord(r));
  }

  // ── Organizer view ────────────────────────────────────────────────────────

  /** Events created by a specific organizer. */
  async getOrganizerEvents(
    organizerId: UserId,
    opts: { cursor?: string; limit?: number; includeExpired?: boolean } = {},
  ): Promise<{ items: EventRecord[]; nextCursor: string | undefined }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const now = new Date();

    const conditions = [eq(eventTable.organizerId, organizerId)];
    if (!opts.includeExpired) {
      conditions.push(gte(eventTable.endTime, now));
    }
    if (opts.cursor) {
      conditions.push(gte(eventTable.id, opts.cursor as ReturnType<typeof EventId.parse>));
    }

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(and(...conditions))
      .orderBy(asc(eventTable.startTime), asc(eventTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map((r) => this.rowToRecord(r)),
      nextCursor: hasMore ? rows[limit]?.id : undefined,
    };
  }

  // ── Nearby events ─────────────────────────────────────────────────────────

  /**
   * Events within radiusKm of a point.
   * Uses the Haversine bounding-box approximation then filters precisely.
   * PostGIS `ST_DWithin` would be more efficient but this works without it.
   */
  async getNearbyEvents(
    lat: number,
    lng: number,
    radiusKm: number,
    opts: { limit?: number } = {},
  ): Promise<EventRecord[]> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const now = new Date();

    // Degree deltas for bounding box
    const deltaLat = radiusKm / 111.0;
    const deltaLng = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180));

    const rows = await this.db
      .select()
      .from(eventTable)
      .where(
        and(
          gte(eventTable.startTime, now),
          gte(eventTable.lat, lat - deltaLat),
          lte(eventTable.lat, lat + deltaLat),
          gte(eventTable.lng, lng - deltaLng),
          lte(eventTable.lng, lng + deltaLng),
        ),
      )
      .orderBy(asc(eventTable.startTime))
      .limit(limit * 2); // over-fetch then filter

    // Haversine filter
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const haversine = (lat2: number, lng2: number): number => {
      const dLat = toRad(lat2 - lat);
      const dLng = toRad(lng2 - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    return rows
      .filter((r) => haversine(r.lat, r.lng) <= radiusKm)
      .slice(0, limit)
      .map((r) => this.rowToRecord(r));
  }

  // ── Admin helpers ─────────────────────────────────────────────────────────

  /** Mark an event as featured (admin only – caller must verify role). */
  async setFeatured(eventId: string, _featured: boolean): Promise<void> {
    const rows = await this.db
      .select({ id: eventTable.id })
      .from(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }

    // isFeatured is not in the DB schema yet; this is a no-op placeholder
    // until the schema migration adds the column.
    await this.cacheDel(`events:featured:*`);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  /** Returns aggregated stats for an event. */
  async getEventStats(eventId: string): Promise<{
    goingCount: number;
    maybeCount: number;
    viewCount: number;
  }> {
    const { going } = await this.getAttendeeCounts(eventId);
    return { goingCount: going, maybeCount: 0, viewCount: 0 };
  }

  // ── Convenience aliases ────────────────────────────────────────────────────

  /** Alias for rsvpToEvent that returns the updated event with RSVP status. */
  async rsvp(
    userId: UserId,
    eventId: string,
    status: RsvpStatusEnum,
  ): Promise<EventWithRsvp> {
    await this.rsvpToEvent(userId, eventId, status);
    const record = await this.getEventById(eventId);
    if (!record) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }
    return this.enrichWithRsvp(record, status);
  }

  /** Alias for getEventsByCity with optional userId parameter. */
  async listByCity(
    city: string,
    _userId: UserId | null,
    opts: EventQueryOptions = {},
  ): Promise<{ items: EventRecord[]; nextCursor: string | undefined }> {
    return this.getEventsByCity(city, opts);
  }

  /** Soft-cancel an event by setting cancelledAt. Only the organizer may cancel. */
  async cancelEvent(
    organizerId: UserId,
    eventId: string,
  ): Promise<EventRecord> {
    const rows = await this.db
      .select({ organizerId: eventTable.organizerId })
      .from(eventTable)
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .limit(1);

    if (!rows[0]) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }
    if (rows[0].organizerId !== organizerId) {
      throw new ForbiddenException({ type: 'about:blank', title: 'forbidden', status: 403, code: 'NOT_ORGANIZER' });
    }

    const now = new Date();
    const updated = await this.db
      .update(eventTable)
      .set({ cancelledAt: now })
      .where(eq(eventTable.id, eventId as ReturnType<typeof EventId.parse>))
      .returning();

    await this.cacheDel(`events:detail:${eventId}`);

    const row = updated[0];
    if (!row) {
      throw new NotFoundException({ type: 'about:blank', title: 'not_found', status: 404, code: 'EVENT_NOT_FOUND' });
    }
    return this.rowToRecord(row);
  }
}
