/**
 * UserRoutesService — saved routes, navigation history, trip stats.
 *
 * Uses Drizzle + PostGIS (provided by db-kit). Each method is a thin
 * wrapper around SQL so the controller/tests stay clean.
 *
 * All tables live in the `routing` schema (module boundary rule).
 */
import type { TravelMode } from '@iraq-maps/contracts';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  integer,
  pgSchema,
  real,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── Schema (routing.*) ───────────────────────────────────────────────────────

export const routingSchema = pgSchema('routing');

export const savedRoutesTable = routingSchema.table('saved_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  originName: varchar('origin_name', { length: 300 }).notNull(),
  destinationName: varchar('destination_name', { length: 300 }).notNull(),
  /** Serialised as "lat,lon" string for portability without PostGIS dependency in the type layer. */
  originCoord: varchar('origin_coord', { length: 64 }).notNull(),
  destinationCoord: varchar('destination_coord', { length: 64 }).notNull(),
  mode: varchar('mode', { length: 20 }).notNull().$type<TravelMode>(),
  distanceM: real('distance_m').notNull(),
  durationS: real('duration_s').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tripHistoryTable = routingSchema.table('trip_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  originName: varchar('origin_name', { length: 300 }).notNull(),
  destinationName: varchar('destination_name', { length: 300 }).notNull(),
  distanceM: real('distance_m').notNull(),
  estimatedDurationS: real('estimated_duration_s').notNull(),
  actualDurationS: real('actual_duration_s'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  rating: integer('rating'),
  savedRouteId: uuid('saved_route_id'),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedRoute {
  id: string;
  userId: string;
  name: string;
  originName: string;
  destinationName: string;
  originCoord: string;
  destinationCoord: string;
  mode: TravelMode;
  distanceM: number;
  durationS: number;
  createdAt: Date;
}

export interface TripHistoryEntry {
  id: string;
  userId: string;
  originName: string;
  destinationName: string;
  distanceM: number;
  estimatedDurationS: number;
  actualDurationS: number | null;
  startedAt: Date;
  endedAt: Date | null;
  rating: number | null;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface MonthlyStats {
  totalKm: number;
  tripCount: number;
  avgDurationMinutes: number;
  longestKm: number;
}

export interface BestDepartureTime {
  nowClear: boolean;
  bestInMinutes: number | null;
  message: string;
}

export interface SaveRouteInput {
  name: string;
  originName: string;
  destinationName: string;
  originCoord: string;
  destinationCoord: string;
  mode: TravelMode;
  distanceM: number;
  durationS: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class UserRoutesService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: NodePgDatabase<any>) {}

  // ── Saved routes ────────────────────────────────────────────────────────────

  async saveRoute(userId: string, input: SaveRouteInput): Promise<SavedRoute> {
    const [row] = await this.db
      .insert(savedRoutesTable)
      .values({
        userId,
        name: input.name,
        originName: input.originName,
        destinationName: input.destinationName,
        originCoord: input.originCoord,
        destinationCoord: input.destinationCoord,
        mode: input.mode,
        distanceM: input.distanceM,
        durationS: input.durationS,
      })
      .returning();
    if (!row) throw new Error('insert failed');
    return this._mapSavedRoute(row);
  }

  async getSavedRoutes(userId: string): Promise<SavedRoute[]> {
    const rows = await this.db
      .select()
      .from(savedRoutesTable)
      .where(eq(savedRoutesTable.userId, userId))
      .orderBy(desc(savedRoutesTable.createdAt));
    return rows.map((r) => this._mapSavedRoute(r));
  }

  async deleteSavedRoute(userId: string, routeId: string): Promise<void> {
    await this.db
      .delete(savedRoutesTable)
      .where(
        and(eq(savedRoutesTable.id, routeId), eq(savedRoutesTable.userId, userId)),
      );
  }

  // ── Trip history ─────────────────────────────────────────────────────────────

  async getRouteHistory(
    userId: string,
    pagination: PaginationParams,
  ): Promise<TripHistoryEntry[]> {
    const rows = await this.db
      .select()
      .from(tripHistoryTable)
      .where(eq(tripHistoryTable.userId, userId))
      .orderBy(desc(tripHistoryTable.startedAt))
      .limit(pagination.limit)
      .offset(pagination.offset);
    return rows.map((r) => this._mapTripHistory(r));
  }

  /** Record the start of a trip; returns the new tripId. */
  async recordTripStart(
    userId: string,
    input: {
      originName: string;
      destinationName: string;
      distanceM: number;
      estimatedDurationS: number;
      savedRouteId?: string;
    },
  ): Promise<string> {
    const [row] = await this.db
      .insert(tripHistoryTable)
      .values({
        userId,
        originName: input.originName,
        destinationName: input.destinationName,
        distanceM: input.distanceM,
        estimatedDurationS: input.estimatedDurationS,
        savedRouteId: input.savedRouteId ?? null,
        startedAt: new Date(),
      })
      .returning({ id: tripHistoryTable.id });
    if (!row) throw new Error('insert failed');
    return row.id;
  }

  /** Record the end of a trip (actualDuration, endedAt). */
  async recordTripEnd(
    userId: string,
    tripId: string,
    actualDurationS: number,
  ): Promise<void> {
    await this.db
      .update(tripHistoryTable)
      .set({
        actualDurationS,
        endedAt: new Date(),
      })
      .where(
        and(
          eq(tripHistoryTable.id, tripId),
          eq(tripHistoryTable.userId, userId),
        ),
      );
  }

  /** Save a star rating (1–5) for a completed trip. */
  async rateTripRoute(
    userId: string,
    tripId: string,
    rating: number,
  ): Promise<void> {
    const clamped = Math.max(1, Math.min(5, Math.round(rating)));
    await this.db
      .update(tripHistoryTable)
      .set({ rating: clamped })
      .where(
        and(
          eq(tripHistoryTable.id, tripId),
          eq(tripHistoryTable.userId, userId),
        ),
      );
  }

  // ── Stats ────────────────────────────────────────────────────────────────────

  async getMonthlyStats(userId: string): Promise<MonthlyStats> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await this.db
      .select({
        totalDistanceM: sql<number>`sum(${tripHistoryTable.distanceM})`,
        tripCount: sql<number>`count(*)`,
        avgDurationS: sql<number>`avg(coalesce(${tripHistoryTable.actualDurationS}, ${tripHistoryTable.estimatedDurationS}))`,
        maxDistanceM: sql<number>`max(${tripHistoryTable.distanceM})`,
      })
      .from(tripHistoryTable)
      .where(
        and(
          eq(tripHistoryTable.userId, userId),
          gte(tripHistoryTable.startedAt, monthStart),
        ),
      );

    const row = rows[0];
    if (!row || !row.tripCount) {
      return { totalKm: 0, tripCount: 0, avgDurationMinutes: 0, longestKm: 0 };
    }

    return {
      totalKm: parseFloat(((row.totalDistanceM ?? 0) / 1000).toFixed(1)),
      tripCount: Number(row.tripCount),
      avgDurationMinutes: parseFloat(
        ((row.avgDurationS ?? 0) / 60).toFixed(1),
      ),
      longestKm: parseFloat(((row.maxDistanceM ?? 0) / 1000).toFixed(1)),
    };
  }

  // ── Best departure time ───────────────────────────────────────────────────────

  /**
   * Returns the best time to leave based on historical traffic patterns.
   *
   * Currently uses a stub heuristic: if we have past trip data for this
   * saved route and the average duration in the next 30 minutes matches
   * the shortest recorded duration, return "now". Otherwise return the
   * minute offset to the best historical departure window.
   *
   * In production this would call a traffic prediction service.
   */
  async getBestDepartureTime(
    userId: string,
    routeId: string,
  ): Promise<BestDepartureTime> {
    // Fetch recent history for this saved route
    const rows = await this.db
      .select({
        startedAt: tripHistoryTable.startedAt,
        actualDurationS: tripHistoryTable.actualDurationS,
        estimatedDurationS: tripHistoryTable.estimatedDurationS,
      })
      .from(tripHistoryTable)
      .where(
        and(
          eq(tripHistoryTable.userId, userId),
          eq(tripHistoryTable.savedRouteId, routeId),
        ),
      )
      .orderBy(desc(tripHistoryTable.startedAt))
      .limit(20);

    if (rows.length === 0) {
      return { nowClear: true, bestInMinutes: null, message: 'لا توجد بيانات كافية' };
    }

    // Build departure-hour → avg duration map
    const byHour = new Map<number, number[]>();
    for (const row of rows) {
      const hour = new Date(row.startedAt).getHours();
      const duration = row.actualDurationS ?? row.estimatedDurationS;
      const bucket = byHour.get(hour) ?? [];
      bucket.push(duration);
      byHour.set(hour, bucket);
    }

    let bestHour = -1;
    let bestAvg = Infinity;
    for (const [hour, durations] of byHour.entries()) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (avg < bestAvg) {
        bestAvg = avg;
        bestHour = hour;
      }
    }

    const currentHour = new Date().getHours();
    if (bestHour === -1 || bestHour === currentHour) {
      return { nowClear: true, bestInMinutes: null, message: 'الوقت المثالي للمغادرة الآن' };
    }

    // Compute minutes to best hour
    let diffH = bestHour - currentHour;
    if (diffH < 0) diffH += 24;
    const minutesUntil = diffH * 60;

    // If more than 3 hours away, just say "now is fine"
    if (minutesUntil > 180) {
      return { nowClear: true, bestInMinutes: null, message: 'المرور مقبول الآن' };
    }

    return {
      nowClear: false,
      bestInMinutes: minutesUntil,
      message: `أفضل وقت للمغادرة بعد ${minutesUntil} دقيقة`,
    };
  }

  // ── Private mappers ──────────────────────────────────────────────────────────

  private _mapSavedRoute(row: typeof savedRoutesTable.$inferSelect): SavedRoute {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      originName: row.originName,
      destinationName: row.destinationName,
      originCoord: row.originCoord,
      destinationCoord: row.destinationCoord,
      mode: row.mode as TravelMode,
      distanceM: row.distanceM,
      durationS: row.durationS,
      createdAt: row.createdAt,
    };
  }

  private _mapTripHistory(row: typeof tripHistoryTable.$inferSelect): TripHistoryEntry {
    return {
      id: row.id,
      userId: row.userId,
      originName: row.originName,
      destinationName: row.destinationName,
      distanceM: row.distanceM,
      estimatedDurationS: row.estimatedDurationS,
      actualDurationS: row.actualDurationS ?? null,
      startedAt: row.startedAt,
      endedAt: row.endedAt ?? null,
      rating: row.rating ?? null,
    };
  }
}
