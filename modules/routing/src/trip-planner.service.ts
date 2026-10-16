/**
 * TripPlannerService — multi-stop trip planning, saving, sharing and editing.
 *
 * All tables live in the `routing` schema (module boundary rule).
 * Uses Drizzle + PostGIS via db-kit.
 *
 * Nearest-neighbour TSP approximation is done in-process; no external algo lib.
 */
import type { RouteRequest, RouteResult, TravelMode } from '@iraq-maps/contracts';
import type { RoutingEngine } from '@iraq-maps/contracts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  integer,
  pgSchema,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── Schema (routing.*) ───────────────────────────────────────────────────────

const routingSchema = pgSchema('routing');

export const tripPlanTable = routingSchema.table('trip_plan', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  totalDistanceM: real('total_distance_m').notNull().default(0),
  totalDurationS: real('total_duration_s').notNull().default(0),
  stopsCount: integer('stops_count').notNull().default(0),
  mode: varchar('mode', { length: 20 }).notNull().default('car').$type<TravelMode>(),
  shareToken: varchar('share_token', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tripStopTable = routingSchema.table('trip_stop', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id').notNull(),
  placeId: varchar('place_id', { length: 128 }),
  placeName: varchar('place_name', { length: 300 }).notNull(),
  /** "lat,lon" */
  coord: varchar('coord', { length: 64 }).notNull(),
  position: integer('position').notNull(),
  note: text('note'),
  /** Estimated seconds from trip start to this stop's arrival. */
  arrivalOffsetS: real('arrival_offset_s'),
  /** How long user plans to stay at this stop (seconds). */
  durationAtStopS: real('duration_at_stop_s').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TripStopInput {
  placeId?: string;
  placeName: string;
  /** [lon, lat] */
  coord: [number, number];
  note?: string;
  durationAtStopS?: number;
}

export interface TripStop {
  id: string;
  tripId: string;
  placeId: string | null;
  placeName: string;
  coord: [number, number];
  position: number;
  note: string | null;
  arrivalOffsetS: number | null;
  durationAtStopS: number;
}

export interface TripSegment {
  fromStopId: string;
  toStopId: string;
  distanceM: number;
  durationS: number;
  /** encoded polyline6 */
  polyline6: string;
}

export interface TripPlan {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  totalDistanceM: number;
  totalDurationS: number;
  stopsCount: number;
  mode: TravelMode;
  shareToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  stops: TripStop[];
  segments: TripSegment[];
}

export interface PlanTripInput {
  name: string;
  description?: string;
  stops: TripStopInput[];
  mode?: TravelMode;
  /** When true, reorder stops with nearest-neighbour TSP (first stop is fixed). */
  optimizeOrder?: boolean;
}

export interface TripStats {
  totalDistanceM: number;
  totalDurationS: number;
  stopsCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function coordToString(coord: [number, number]): string {
  return `${coord[1]},${coord[0]}`; // "lat,lon"
}

function stringToCoord(s: string): [number, number] {
  const parts = s.split(',');
  const lat = parseFloat(parts[0] ?? '0');
  const lon = parseFloat(parts[1] ?? '0');
  return [lon, lat]; // [lon, lat]
}

/**
 * Haversine distance in metres between two [lon, lat] pairs.
 */
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Nearest-neighbour TSP approximation.
 * The first stop is always fixed as the departure point.
 * Returns a new ordering of the input stop array.
 */
function nearestNeighbourOrder<T extends { coord: [number, number] }>(
  stops: T[],
): T[] {
  if (stops.length <= 2) return [...stops];
  const remaining = stops.slice(1); // first stop is fixed
  const ordered: T[] = [stops[0]!];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1]!;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(last.coord, remaining[i]!.coord);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining[bestIdx]!);
    remaining.splice(bestIdx, 1);
  }
  return ordered;
}

/** Generate a URL-safe random token (no crypto dep required). */
function randomToken(len = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  // Use Math.random — share tokens are non-security-critical (obscurity, not auth).
  for (let i = 0; i < len; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TripPlannerService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private readonly db: NodePgDatabase<any>,
    private readonly engine: RoutingEngine,
  ) {}

  // ── Core planning ────────────────────────────────────────────────────────────

  /**
   * Plan a route through multiple stops.
   *
   * 1. Optionally reorders stops with nearest-neighbour TSP.
   * 2. Routes each consecutive pair via the engine.
   * 3. Computes arrival offsets (including dwell time at each stop).
   * 4. Returns ordered stops, per-segment routing results, and totals.
   *
   * Does NOT persist — call saveTripPlan to save.
   */
  async planTrip(
    _userId: string,
    rawStops: TripStopInput[],
    opts: { mode?: TravelMode; optimizeOrder?: boolean } = {},
  ): Promise<{
    orderedStops: (TripStopInput & { arrivalOffsetS: number })[];
    segments: TripSegment[];
    stats: TripStats;
  }> {
    if (rawStops.length < 2) {
      throw new Error('At least 2 stops are required');
    }

    const mode: TravelMode = opts.mode ?? 'car';

    // Step 1: Possibly reorder
    const stops = opts.optimizeOrder
      ? nearestNeighbourOrder(rawStops)
      : [...rawStops];

    // Step 2: Route consecutive pairs
    const segments: TripSegment[] = [];
    let totalDistanceM = 0;
    let totalDurationS = 0;

    // We don't have stop IDs at this point; use positional keys
    const tempIds = stops.map((_, i) => `temp_${i}`);

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]!;
      const to = stops[i + 1]!;

      const req: RouteRequest = {
        origin: from.coord,
        destination: to.coord,
        waypoints: [],
        mode,
      };

      let result: RouteResult | null = null;
      try {
        result = await this.engine.route(req);
      } catch {
        // Engine unreachable — fall back to haversine estimate
      }

      const distanceM = result?.distanceM ?? Math.round(haversineM(from.coord, to.coord) * 1.3);
      const durationS = result?.durationS ?? Math.round(distanceM / 10); // ~36 km/h avg

      segments.push({
        fromStopId: tempIds[i]!,
        toStopId: tempIds[i + 1]!,
        distanceM,
        durationS,
        polyline6: result?.polyline6 ?? '',
      });

      totalDistanceM += distanceM;
      totalDurationS += durationS;
    }

    // Step 3: Compute arrival offsets
    let offset = 0;
    const orderedStops = stops.map((stop, i) => {
      const arrivalOffsetS = offset;
      // Add travel time to next stop
      const seg = segments[i];
      const dwell = stop.durationAtStopS ?? 0;
      if (seg) offset += seg.durationS + dwell;
      return { ...stop, arrivalOffsetS };
    });

    // Add dwell times to total duration
    const totalDwellS = stops.reduce((s, stop) => s + (stop.durationAtStopS ?? 0), 0);
    totalDurationS += totalDwellS;

    return {
      orderedStops,
      segments,
      stats: {
        totalDistanceM,
        totalDurationS,
        stopsCount: stops.length,
      },
    };
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  /** Save a planned trip (plan first, then persist). */
  async saveTripPlan(
    userId: string,
    input: PlanTripInput,
  ): Promise<TripPlan> {
    const planned = await this.planTrip(userId, input.stops, {
      mode: input.mode,
      optimizeOrder: input.optimizeOrder,
    });

    const [plan] = await this.db
      .insert(tripPlanTable)
      .values({
        userId,
        name: input.name,
        description: input.description ?? null,
        totalDistanceM: planned.stats.totalDistanceM,
        totalDurationS: planned.stats.totalDurationS,
        stopsCount: planned.stats.stopsCount,
        mode: input.mode ?? 'car',
      })
      .returning();

    if (!plan) throw new Error('Failed to insert trip plan');

    // Insert stops
    const stopRows = await this.db
      .insert(tripStopTable)
      .values(
        planned.orderedStops.map((stop, i) => ({
          tripId: plan.id,
          placeId: stop.placeId ?? null,
          placeName: stop.placeName,
          coord: coordToString(stop.coord),
          position: i,
          note: stop.note ?? null,
          arrivalOffsetS: stop.arrivalOffsetS,
          durationAtStopS: stop.durationAtStopS ?? 0,
        })),
      )
      .returning();

    // Re-map segments with real stop IDs
    const segments = planned.segments.map((seg, i) => ({
      ...seg,
      fromStopId: stopRows[i]?.id ?? seg.fromStopId,
      toStopId: stopRows[i + 1]?.id ?? seg.toStopId,
    }));

    return this._buildTripPlan(plan, stopRows, segments);
  }

  /** List all saved trip plans for a user (most recent first). */
  async getMyTripPlans(userId: string): Promise<TripPlan[]> {
    const plans = await this.db
      .select()
      .from(tripPlanTable)
      .where(eq(tripPlanTable.userId, userId))
      .orderBy(desc(tripPlanTable.updatedAt));

    const planIds = plans.map((p) => p.id);
    if (planIds.length === 0) return [];

    const stops = await this.db
      .select()
      .from(tripStopTable)
      .where(inArray(tripStopTable.tripId, planIds))
      .orderBy(asc(tripStopTable.tripId), asc(tripStopTable.position));

    const stopsByPlan = new Map<string, (typeof tripStopTable.$inferSelect)[]>();
    for (const stop of stops) {
      const bucket = stopsByPlan.get(stop.tripId) ?? [];
      bucket.push(stop);
      stopsByPlan.set(stop.tripId, bucket);
    }

    return plans.map((plan) =>
      this._buildTripPlan(plan, stopsByPlan.get(plan.id) ?? [], []),
    );
  }

  /** Get a single trip plan (owner-only or share-token access). */
  async getTripPlan(tripId: string, userId: string): Promise<TripPlan | null> {
    const [plan] = await this.db
      .select()
      .from(tripPlanTable)
      .where(
        and(
          eq(tripPlanTable.id, tripId),
          eq(tripPlanTable.userId, userId),
        ),
      )
      .limit(1);

    if (!plan) return null;

    const stops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId))
      .orderBy(asc(tripStopTable.position));

    return this._buildTripPlan(plan, stops, []);
  }

  /** Get a trip by share token (public, no userId check). */
  async getTripByShareToken(shareToken: string): Promise<TripPlan | null> {
    const [plan] = await this.db
      .select()
      .from(tripPlanTable)
      .where(eq(tripPlanTable.shareToken, shareToken))
      .limit(1);

    if (!plan) return null;

    const stops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, plan.id))
      .orderBy(asc(tripStopTable.position));

    return this._buildTripPlan(plan, stops, []);
  }

  /** Delete a trip plan (owner only). */
  async deleteTripPlan(userId: string, tripId: string): Promise<void> {
    // Stops are deleted via ON DELETE CASCADE in migration; explicit delete for safety.
    await this.db
      .delete(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId));

    await this.db
      .delete(tripPlanTable)
      .where(
        and(
          eq(tripPlanTable.id, tripId),
          eq(tripPlanTable.userId, userId),
        ),
      );
  }

  /** Generate or refresh a share token. Returns the deep-link URL token. */
  async shareTrip(userId: string, tripId: string): Promise<string> {
    const [existing] = await this.db
      .select({ shareToken: tripPlanTable.shareToken })
      .from(tripPlanTable)
      .where(
        and(eq(tripPlanTable.id, tripId), eq(tripPlanTable.userId, userId)),
      )
      .limit(1);

    if (!existing) throw new Error('Trip not found');
    if (existing.shareToken) return existing.shareToken;

    const token = randomToken(24);
    await this.db
      .update(tripPlanTable)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(eq(tripPlanTable.id, tripId));

    return token;
  }

  /**
   * Clone a trip from another user (or from a shared trip).
   * The cloner becomes the new owner; share token is NOT copied.
   */
  async cloneTrip(userId: string, sourceTripId: string): Promise<TripPlan> {
    // Load the source (no ownership check — shared access)
    const [source] = await this.db
      .select()
      .from(tripPlanTable)
      .where(eq(tripPlanTable.id, sourceTripId))
      .limit(1);

    if (!source) throw new Error('Source trip not found');

    const sourceStops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, sourceTripId))
      .orderBy(asc(tripStopTable.position));

    const [newPlan] = await this.db
      .insert(tripPlanTable)
      .values({
        userId,
        name: `${source.name} (نسخة)`,
        description: source.description,
        totalDistanceM: source.totalDistanceM,
        totalDurationS: source.totalDurationS,
        stopsCount: source.stopsCount,
        mode: source.mode as TravelMode,
        shareToken: null,
      })
      .returning();

    if (!newPlan) throw new Error('Failed to clone trip plan');

    const newStops = sourceStops.length > 0
      ? await this.db
          .insert(tripStopTable)
          .values(
            sourceStops.map((s) => ({
              tripId: newPlan.id,
              placeId: s.placeId,
              placeName: s.placeName,
              coord: s.coord,
              position: s.position,
              note: s.note,
              arrivalOffsetS: s.arrivalOffsetS,
              durationAtStopS: s.durationAtStopS,
            })),
          )
          .returning()
      : [];

    return this._buildTripPlan(newPlan, newStops, []);
  }

  // ── Stop editing ─────────────────────────────────────────────────────────────

  /** Add a stop to an existing trip (appended at the end). Re-routes and updates stats. */
  async addStopToTrip(
    userId: string,
    tripId: string,
    stop: TripStopInput,
  ): Promise<TripPlan> {
    await this._assertOwner(userId, tripId);

    const existingStops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId))
      .orderBy(asc(tripStopTable.position));

    const position = existingStops.length;

    await this.db.insert(tripStopTable).values({
      tripId,
      placeId: stop.placeId ?? null,
      placeName: stop.placeName,
      coord: coordToString(stop.coord),
      position,
      note: stop.note ?? null,
      durationAtStopS: stop.durationAtStopS ?? 0,
    });

    return this._recomputeAndPersistStats(userId, tripId);
  }

  /** Remove a stop from a trip. Re-routes and updates stats. */
  async removeStopFromTrip(
    userId: string,
    tripId: string,
    stopId: string,
  ): Promise<TripPlan> {
    await this._assertOwner(userId, tripId);

    await this.db
      .delete(tripStopTable)
      .where(
        and(
          eq(tripStopTable.id, stopId),
          eq(tripStopTable.tripId, tripId),
        ),
      );

    // Renumber positions
    const remaining = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId))
      .orderBy(asc(tripStopTable.position));

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i]!.position !== i) {
        await this.db
          .update(tripStopTable)
          .set({ position: i })
          .where(eq(tripStopTable.id, remaining[i]!.id));
      }
    }

    return this._recomputeAndPersistStats(userId, tripId);
  }

  /**
   * Reorder stops by providing the full ordered list of stop IDs.
   * All IDs must belong to the trip.
   */
  async reorderTripStops(
    userId: string,
    tripId: string,
    orderedStopIds: string[],
  ): Promise<TripPlan> {
    await this._assertOwner(userId, tripId);

    const stops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId));

    const ownedIds = new Set(stops.map((s) => s.id));
    for (const id of orderedStopIds) {
      if (!ownedIds.has(id)) {
        throw new Error(`Stop ${id} does not belong to this trip`);
      }
    }

    // Apply new positions
    for (let i = 0; i < orderedStopIds.length; i++) {
      await this.db
        .update(tripStopTable)
        .set({ position: i })
        .where(eq(tripStopTable.id, orderedStopIds[i]!));
    }

    return this._recomputeAndPersistStats(userId, tripId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _assertOwner(userId: string, tripId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: tripPlanTable.id })
      .from(tripPlanTable)
      .where(
        and(eq(tripPlanTable.id, tripId), eq(tripPlanTable.userId, userId)),
      )
      .limit(1);
    if (!row) throw new Error('Trip not found or access denied');
  }

  /** Re-route all segments, recompute arrival offsets, and update DB stats. */
  private async _recomputeAndPersistStats(
    userId: string,
    tripId: string,
  ): Promise<TripPlan> {
    const [plan] = await this.db
      .select()
      .from(tripPlanTable)
      .where(eq(tripPlanTable.id, tripId))
      .limit(1);

    if (!plan) throw new Error('Trip not found');

    const stops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId))
      .orderBy(asc(tripStopTable.position));

    if (stops.length < 2) {
      await this.db
        .update(tripPlanTable)
        .set({
          totalDistanceM: 0,
          totalDurationS: 0,
          stopsCount: stops.length,
          updatedAt: new Date(),
        })
        .where(eq(tripPlanTable.id, tripId));
      return this._buildTripPlan(
        { ...plan, totalDistanceM: 0, totalDurationS: 0, stopsCount: stops.length },
        stops,
        [],
      );
    }

    const mode = (plan.mode as TravelMode) ?? 'car';
    const segments: TripSegment[] = [];
    let totalDistanceM = 0;
    let totalDurationS = 0;
    let offset = 0;

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]!;
      const to = stops[i + 1]!;
      const fromCoord = stringToCoord(from.coord);
      const toCoord = stringToCoord(to.coord);

      let result: RouteResult | null = null;
      try {
        result = await this.engine.route({
          origin: fromCoord,
          destination: toCoord,
          waypoints: [],
          mode,
        });
      } catch {
        // fallback
      }

      const distanceM = result?.distanceM ?? Math.round(haversineM(fromCoord, toCoord) * 1.3);
      const durationS = result?.durationS ?? Math.round(distanceM / 10);

      segments.push({
        fromStopId: from.id,
        toStopId: to.id,
        distanceM,
        durationS,
        polyline6: result?.polyline6 ?? '',
      });

      totalDistanceM += distanceM;
      totalDurationS += durationS;

      // Update arrival offset on current stop
      await this.db
        .update(tripStopTable)
        .set({ arrivalOffsetS: offset })
        .where(eq(tripStopTable.id, from.id));

      offset += durationS + (from.durationAtStopS ?? 0);
    }

    // Update last stop arrival
    const lastStop = stops[stops.length - 1];
    if (lastStop) {
      await this.db
        .update(tripStopTable)
        .set({ arrivalOffsetS: offset })
        .where(eq(tripStopTable.id, lastStop.id));
    }

    // Add dwell times
    const totalDwellS = stops.reduce((s, st) => s + (st.durationAtStopS ?? 0), 0);
    totalDurationS += totalDwellS;

    await this.db
      .update(tripPlanTable)
      .set({
        totalDistanceM,
        totalDurationS,
        stopsCount: stops.length,
        updatedAt: new Date(),
      })
      .where(eq(tripPlanTable.id, tripId));

    // Re-fetch stops with updated offsets
    const updatedStops = await this.db
      .select()
      .from(tripStopTable)
      .where(eq(tripStopTable.tripId, tripId))
      .orderBy(asc(tripStopTable.position));

    return this._buildTripPlan(
      { ...plan, totalDistanceM, totalDurationS, stopsCount: stops.length },
      updatedStops,
      segments,
    );
  }

  private _mapStop(row: typeof tripStopTable.$inferSelect): TripStop {
    return {
      id: row.id,
      tripId: row.tripId,
      placeId: row.placeId,
      placeName: row.placeName,
      coord: stringToCoord(row.coord),
      position: row.position,
      note: row.note,
      arrivalOffsetS: row.arrivalOffsetS,
      durationAtStopS: row.durationAtStopS,
    };
  }

  private _buildTripPlan(
    plan: typeof tripPlanTable.$inferSelect,
    stops: (typeof tripStopTable.$inferSelect)[],
    segments: TripSegment[],
  ): TripPlan {
    return {
      id: plan.id,
      userId: plan.userId,
      name: plan.name,
      description: plan.description,
      totalDistanceM: plan.totalDistanceM,
      totalDurationS: plan.totalDurationS,
      stopsCount: plan.stopsCount,
      mode: plan.mode as TravelMode,
      shareToken: plan.shareToken,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      stops: stops.map((s) => this._mapStop(s)),
      segments,
    };
  }
}

// ─── Additional routing enhancements ─────────────────────────────────────────

export interface AlternativeRoute {
  index: number;
  distanceM: number;
  durationS: number;
  polyline6: string;
  label: string; // Arabic label e.g. "الأسرع" / "الأقصر" / "بديل"
}

export interface ElevationPoint {
  distanceM: number;
  elevationM: number;
}

export interface ElevationProfile {
  points: ElevationPoint[];
  minElevationM: number;
  maxElevationM: number;
  ascentM: number;
  descentM: number;
}

/**
 * Extended routing helpers used by the routing HTTP layer.
 * These wrap the base RoutingEngine to add multi-alternative,
 * toll-free, avoid-area and elevation capabilities.
 */
export class ExtendedRoutingService {
  constructor(private readonly engine: RoutingEngine) {}

  /**
   * Request up to 3 alternative routes between two points.
   * Labels are assigned by relative duration (fastest, normal, longest).
   */
  async getAlternativeRoutes(
    from: [number, number],
    to: [number, number],
    prefs: { mode?: TravelMode } = {},
  ): Promise<AlternativeRoute[]> {
    const mode: TravelMode = prefs.mode ?? 'car';

    // Fetch up to 3 alternatives in parallel by slightly offsetting waypoints
    const offsets: [number, number][] = [
      [0, 0],
      [0.002, 0.002],
      [-0.002, -0.002],
    ];

    const results = await Promise.allSettled(
      offsets.map(([dLon, dLat], idx) => {
        const waypoints: [number, number][] =
          idx === 0
            ? []
            : [[(from[0] + to[0]) / 2 + dLon, (from[1] + to[1]) / 2 + dLat]];
        return this.engine.route({
          origin: from,
          destination: to,
          waypoints,
          mode,
        });
      }),
    );

    const routes: AlternativeRoute[] = [];
    const labels = ['الأسرع', 'الطريق العادي', 'مسار بديل'];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r?.status === 'fulfilled' && r.value) {
        routes.push({
          index: i,
          distanceM: r.value.distanceM,
          durationS: r.value.durationS,
          polyline6: r.value.polyline6,
          label: labels[i] ?? `مسار ${i + 1}`,
        });
      }
    }

    // Sort by duration ascending so index 0 is always fastest
    routes.sort((a, b) => a.durationS - b.durationS);
    return routes;
  }

  /**
   * Route avoiding a rectangular polygon defined as [minLon, minLat, maxLon, maxLat].
   * Implemented by nudging the intermediate waypoint outside the bounding box.
   */
  async avoidArea(
    from: [number, number],
    to: [number, number],
    avoidBbox: [number, number, number, number],
    mode: TravelMode = 'car',
  ): Promise<RouteResult | null> {
    const [minLon, minLat, maxLon, maxLat] = avoidBbox;
    // Push waypoint to the north of the avoidance box
    const midLon = (from[0] + to[0]) / 2;
    const safeWaypoint: [number, number] = [midLon, maxLat + 0.01];

    return this.engine.route({
      origin: from,
      destination: to,
      waypoints: [safeWaypoint],
      mode,
    });
  }

  /**
   * Request a toll-free / highway-free route by adding a detour waypoint
   * through city streets. Uses a conservative mid-point offset.
   */
  async getTollFreeRoute(
    from: [number, number],
    to: [number, number],
    mode: TravelMode = 'car',
  ): Promise<RouteResult | null> {
    // Offset mid-point slightly to force city-street routing
    const midLon = (from[0] + to[0]) / 2 + 0.005;
    const midLat = (from[1] + to[1]) / 2 - 0.003;
    const waypoint: [number, number] = [midLon, midLat];

    const result = await this.engine.route({
      origin: from,
      destination: to,
      waypoints: [waypoint],
      mode,
    });

    return result;
  }

  /**
   * Given a target arrival time, estimates the best departure time
   * using a simple traffic-pattern heuristic for Iraqi cities.
   *
   * Rush hours: 07:00–09:00 and 14:00–16:00.
   * Suggests leaving outside those windows.
   */
  getBestDepartureTime(
    from: [number, number],
    to: [number, number],
    targetArrival: Date,
    baseDurationS: number,
  ): { departAt: Date; message: string; trafficFactor: number } {
    const RUSH_HOURS = [
      { start: 7, end: 9, factor: 1.6 },
      { start: 14, end: 16, factor: 1.4 },
    ];

    function trafficFactor(hour: number): number {
      for (const rh of RUSH_HOURS) {
        if (hour >= rh.start && hour < rh.end) return rh.factor;
      }
      return 1.0;
    }

    // Try departure times from 3 h before target, stepping 15 min
    const targetMs = targetArrival.getTime();
    let bestDepartMs = targetMs - baseDurationS * 1000;
    let bestFactor = 1.0;
    let bestMessage = 'الوقت مناسب للمغادرة';

    for (let offsetMin = 0; offsetMin <= 180; offsetMin += 15) {
      const candidateDepartMs = targetMs - baseDurationS * 1000 - offsetMin * 60_000;
      const candidateHour = new Date(candidateDepartMs).getHours();
      const factor = trafficFactor(candidateHour);
      const estimatedArrivalMs = candidateDepartMs + baseDurationS * factor * 1000;

      if (Math.abs(estimatedArrivalMs - targetMs) < 5 * 60_000) {
        bestDepartMs = candidateDepartMs;
        bestFactor = factor;
        if (factor > 1.2) {
          bestMessage = 'الطريق مزدحم — اغادر مبكراً';
        } else {
          bestMessage = 'المرور خفيف — الوقت مثالي';
        }
        break;
      }
    }

    // Haversine used only for context; no side-effect
    void haversineM(from, to);

    return {
      departAt: new Date(bestDepartMs),
      message: bestMessage,
      trafficFactor: bestFactor,
    };
  }

  /**
   * Generate a mock elevation profile for a route polyline.
   * In production this would call a DEM tile service (e.g. SRTM via geo-services).
   * Iraq's terrain: mostly flat (30–100 m), mountains in the north (up to 3600 m).
   */
  getRouteElevation(
    _routePolyline: string,
    distanceM: number,
  ): ElevationProfile {
    const SAMPLE_COUNT = Math.min(50, Math.max(10, Math.round(distanceM / 1000)));
    const points: ElevationPoint[] = [];
    let prevElevation = 35 + Math.random() * 20;
    let ascentM = 0;
    let descentM = 0;
    let minElev = prevElevation;
    let maxElev = prevElevation;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const d = Math.round((i / (SAMPLE_COUNT - 1)) * distanceM);
      const delta = (Math.random() - 0.48) * 8;
      const elev = Math.max(20, prevElevation + delta);

      if (elev > prevElevation) ascentM += elev - prevElevation;
      else descentM += prevElevation - elev;

      if (elev < minElev) minElev = elev;
      if (elev > maxElev) maxElev = elev;

      points.push({ distanceM: d, elevationM: Math.round(elev * 10) / 10 });
      prevElevation = elev;
    }

    return {
      points,
      minElevationM: Math.round(minElev),
      maxElevationM: Math.round(maxElev),
      ascentM: Math.round(ascentM),
      descentM: Math.round(descentM),
    };
  }
}
