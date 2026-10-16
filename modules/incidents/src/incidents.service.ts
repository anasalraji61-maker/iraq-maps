/**
 * IncidentsService – stores and queries traffic incidents.
 *
 * Uses raw SQL via db-kit's `Db` (Drizzle with PostgreSQL driver).
 * Raw SQL keeps this independent of Drizzle ORM schema types that require
 * PostGIS column definitions not exported by db-kit.
 *
 * Incident lifecycle:
 *  - Incidents expire automatically after ttlHours (default 2 h).
 *  - Disputed incidents expire early once disputed_count >= DISPUTE_THRESHOLD.
 *  - Confirmed incidents get a ttl extension of up to CONFIRM_TTL_BONUS_HOURS.
 *  - expireOldIncidents() is a maintenance task that marks incidents inactive.
 */
import type {
  ContributorEntry,
  Incident,
  IncidentId,
  IncidentSeverity,
  IncidentType,
  LeaderboardResponse,
  UserId,
} from '@iraq-maps/contracts';
import { sql, type SQLWrapper } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum dispute votes needed to halve the expiry time. */
const DISPUTE_THRESHOLD = 3;
/** Bonus hours added to expiry when an incident reaches CONFIRM_THRESHOLD. */
const CONFIRM_TTL_BONUS_HOURS = 1;
/** Minimum confirmation votes needed to extend expiry. */
const CONFIRM_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Internal row shapes returned from the DB
// ---------------------------------------------------------------------------

interface IncidentDbRow {
  id: string;
  type: string;
  severity: string;
  description: string | null;
  reported_by: string | null;
  anonymous: boolean;
  created_at: Date;
  expires_at: Date;
  confirmed_count: number;
  disputed_count: number;
  lng: number;
  lat: number;
}

interface VoteDbRow {
  user_id: string;
  incident_id: string;
  is_confirm: boolean;
}

interface ContributorDbRow {
  user_id: string;
  city_id: string;
  incident_count: number;
  review_count: number;
  place_count: number;
  photo_count: number;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToIncident(
  row: IncidentDbRow,
  myVote?: VoteDbRow | null,
): Incident {
  const now = new Date();
  return {
    id: row.id as IncidentId,
    type: row.type as IncidentType,
    severity: row.severity as IncidentSeverity,
    location: [Number(row.lng), Number(row.lat)],
    description: row.description ?? null,
    reportedBy: row.anonymous ? null : ((row.reported_by ?? null) as UserId | null),
    anonymous: row.anonymous,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    active: row.expires_at > now,
    confirmedCount: Number(row.confirmed_count),
    disputedCount: Number(row.disputed_count),
    confirmedByMe: myVote?.is_confirm === true,
    disputedByMe: myVote?.is_confirm === false,
  };
}

function pointsForTier(
  incidentCount: number,
  reviewCount: number,
  placeCount: number,
  photoCount: number,
): number {
  return incidentCount * 10 + reviewCount * 15 + placeCount * 20 + photoCount * 5;
}

function badgeTier(
  totalPoints: number,
): 'bronze' | 'silver' | 'gold' | 'platinum' {
  if (totalPoints >= 2000) return 'platinum';
  if (totalPoints >= 500) return 'gold';
  if (totalPoints >= 100) return 'silver';
  return 'bronze';
}

function rowToContributor(
  row: ContributorDbRow,
  rank: number,
): ContributorEntry {
  const total = pointsForTier(
    Number(row.incident_count),
    Number(row.review_count),
    Number(row.place_count),
    Number(row.photo_count),
  );
  return {
    userId: row.user_id as UserId,
    displayName: null, // enriched at the API layer if needed
    incidentCount: Number(row.incident_count),
    reviewCount: Number(row.review_count),
    placeCount: Number(row.place_count),
    photoCount: Number(row.photo_count),
    totalPoints: total,
    rank,
    badgeTier: badgeTier(total),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IncidentsService {
  constructor(private readonly db: Db) {}

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  /**
   * Report a new incident.
   * `reportedBy` is stored only when `anonymous` is false.
   */
  async reportIncident(opts: {
    type: IncidentType;
    severity: IncidentSeverity;
    lng: number;
    lat: number;
    description?: string;
    reportedBy?: string;
    ttlHours: number;
    anonymous: boolean;
  }): Promise<Incident> {
    const { type, severity, lng, lat, description, reportedBy, ttlHours, anonymous } = opts;
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
    const storedReporter = anonymous ? null : (reportedBy ?? null);

    const insertSql: SQLWrapper = sql`
      INSERT INTO incidents.incident
        (type, severity, location, description, reported_by, anonymous, expires_at)
      VALUES (
        ${type},
        ${severity},
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
        ${description ?? null},
        ${storedReporter}::uuid,
        ${anonymous},
        ${expiresAt}
      )
      RETURNING
        id, type, severity, description, reported_by, anonymous,
        created_at, expires_at, confirmed_count, disputed_count,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(insertSql as any);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];

    const row = (rows as IncidentDbRow[])[0];
    if (!row) throw new Error('incident insert returned no rows');

    // Update contributor stats if not anonymous
    if (!anonymous && reportedBy) {
      await this.incrementContributorStat(reportedBy, 'incident_count');
    }

    return rowToIncident(row, null);
  }

  /** @deprecated alias kept for backward-compat with existing controller */
  async create(opts: {
    type: IncidentType;
    lng: number;
    lat: number;
    description?: string;
    reportedBy?: string;
    ttlHours: number;
  }): Promise<Incident> {
    return this.reportIncident({
      ...opts,
      severity: 'moderate',
      anonymous: false,
    });
  }

  // -------------------------------------------------------------------------
  // Vote
  // -------------------------------------------------------------------------

  /**
   * Cast or toggle a confirm/dispute vote on an incident.
   * - If no prior vote: insert new vote, increment counter.
   * - If same vote: remove vote (toggle off), decrement counter.
   * - If opposite vote: update vote, adjust both counters.
   * - Disputed incidents with disputed_count >= DISPUTE_THRESHOLD expire early.
   * - Confirmed incidents with confirmed_count >= CONFIRM_THRESHOLD get a ttl bonus.
   */
  async voteIncident(
    userId: string,
    incidentId: string,
    isConfirm: boolean,
  ): Promise<Incident> {
    // Fetch existing vote
    const existingVoteSql: SQLWrapper = sql`
      SELECT user_id, incident_id, is_confirm
      FROM incidents.incident_vote
      WHERE user_id = ${userId}::uuid
        AND incident_id = ${incidentId}::uuid
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const voteResult = await this.db.execute(existingVoteSql as any);
    const voteRows = Array.isArray(voteResult)
      ? voteResult
      : (voteResult as { rows?: unknown[] }).rows ?? [];
    const existingVote = (voteRows as VoteDbRow[])[0] ?? null;

    if (!existingVote) {
      // Insert new vote
      const insertVoteSql: SQLWrapper = sql`
        INSERT INTO incidents.incident_vote (user_id, incident_id, is_confirm)
        VALUES (${userId}::uuid, ${incidentId}::uuid, ${isConfirm})
        ON CONFLICT (user_id, incident_id) DO UPDATE SET is_confirm = ${isConfirm}
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.db.execute(insertVoteSql as any);

      // Increment counter
      const colName = isConfirm ? sql`confirmed_count` : sql`disputed_count`;
      const updateSql: SQLWrapper = sql`
        UPDATE incidents.incident
        SET ${colName} = ${colName} + 1
        WHERE id = ${incidentId}::uuid
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.db.execute(updateSql as any);
    } else if (existingVote.is_confirm === isConfirm) {
      // Toggle off – remove vote, decrement counter
      const deleteVoteSql: SQLWrapper = sql`
        DELETE FROM incidents.incident_vote
        WHERE user_id = ${userId}::uuid AND incident_id = ${incidentId}::uuid
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.db.execute(deleteVoteSql as any);

      const colName = isConfirm ? sql`confirmed_count` : sql`disputed_count`;
      const updateSql: SQLWrapper = sql`
        UPDATE incidents.incident
        SET ${colName} = GREATEST(0, ${colName} - 1)
        WHERE id = ${incidentId}::uuid
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.db.execute(updateSql as any);
    } else {
      // Switch vote
      const updateVoteSql: SQLWrapper = sql`
        UPDATE incidents.incident_vote
        SET is_confirm = ${isConfirm}
        WHERE user_id = ${userId}::uuid AND incident_id = ${incidentId}::uuid
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.db.execute(updateVoteSql as any);

      if (isConfirm) {
        // was dispute, now confirm
        const updateSql: SQLWrapper = sql`
          UPDATE incidents.incident
          SET confirmed_count = confirmed_count + 1,
              disputed_count  = GREATEST(0, disputed_count - 1)
          WHERE id = ${incidentId}::uuid
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.db.execute(updateSql as any);
      } else {
        // was confirm, now dispute
        const updateSql: SQLWrapper = sql`
          UPDATE incidents.incident
          SET disputed_count  = disputed_count + 1,
              confirmed_count = GREATEST(0, confirmed_count - 1)
          WHERE id = ${incidentId}::uuid
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.db.execute(updateSql as any);
      }
    }

    // Apply side-effects: early expiry on dispute, ttl bonus on confirm
    await this.applyVoteSideEffects(incidentId);

    return this.getIncidentById(incidentId, userId);
  }

  /** Shortcut: confirm an incident. */
  async confirmIncident(userId: string, incidentId: string): Promise<Incident> {
    return this.voteIncident(userId, incidentId, true);
  }

  /** Shortcut: dispute an incident (mark as no longer there). */
  async disputeIncident(userId: string, incidentId: string): Promise<Incident> {
    return this.voteIncident(userId, incidentId, false);
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  /** Return active incidents within radiusKm of (lat, lng), optionally filtered by types. */
  async getActiveIncidents(opts: {
    lat: number;
    lng: number;
    radiusKm: number;
    types?: IncidentType[];
    userId?: string;
  }): Promise<Incident[]> {
    const { lat, lng, radiusKm, types, userId } = opts;
    const radiusM = radiusKm * 1000;

    const typeFilter =
      types && types.length > 0
        ? sql`AND type = ANY(ARRAY[${sql.raw(types.map((t) => `'${t}'`).join(','))}]::text[])`
        : sql``;

    const selectSql: SQLWrapper = sql`
      SELECT
        i.id, i.type, i.severity, i.description, i.reported_by, i.anonymous,
        i.created_at, i.expires_at, i.confirmed_count, i.disputed_count,
        ST_X(i.location::geometry) AS lng,
        ST_Y(i.location::geometry) AS lat
      FROM incidents.incident i
      WHERE
        i.expires_at > now()
        AND ST_DWithin(
          i.location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${radiusM}
        )
        ${typeFilter}
      ORDER BY i.created_at DESC
      LIMIT 200
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(selectSql as any);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    const incidentRows = rows as IncidentDbRow[];

    if (!userId || incidentRows.length === 0) {
      return incidentRows.map((r) => rowToIncident(r, null));
    }

    // Fetch votes for this user in one query
    const ids = incidentRows.map((r) => r.id);
    const votesSql: SQLWrapper = sql`
      SELECT user_id, incident_id, is_confirm
      FROM incidents.incident_vote
      WHERE user_id = ${userId}::uuid
        AND incident_id = ANY(ARRAY[${sql.raw(ids.map((id) => `'${id}'`).join(','))}]::uuid[])
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const votesResult = await this.db.execute(votesSql as any);
    const voteRows = Array.isArray(votesResult)
      ? votesResult
      : (votesResult as { rows?: unknown[] }).rows ?? [];
    const voteMap = new Map<string, VoteDbRow>();
    for (const v of voteRows as VoteDbRow[]) {
      voteMap.set(v.incident_id, v);
    }

    return incidentRows.map((r) => rowToIncident(r, voteMap.get(r.id) ?? null));
  }

  /** @deprecated alias kept for backward-compat with existing controller */
  async listNear(opts: {
    lat: number;
    lng: number;
    radiusKm: number;
  }): Promise<Incident[]> {
    return this.getActiveIncidents(opts);
  }

  /**
   * Return active incidents whose location is within 200 m of any point on
   * the route (a polyline encoded as an array of [lng, lat] pairs).
   */
  async getIncidentsByRoute(
    route: Array<[number, number]>,
    userId?: string,
  ): Promise<Incident[]> {
    if (route.length === 0) return [];

    // Build a linestring WKT from the route points
    const wktPoints = route.map(([lng, lat]) => `${lng} ${lat}`).join(',');
    const lineWkt = `LINESTRING(${wktPoints})`;

    const selectSql: SQLWrapper = sql`
      SELECT
        id, type, severity, description, reported_by, anonymous,
        created_at, expires_at, confirmed_count, disputed_count,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
      FROM incidents.incident
      WHERE
        expires_at > now()
        AND ST_DWithin(
          location,
          ST_GeomFromText(${lineWkt}, 4326)::geography,
          200
        )
      ORDER BY created_at DESC
      LIMIT 100
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(selectSql as any);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    const incidentRows = rows as IncidentDbRow[];

    if (!userId || incidentRows.length === 0) {
      return incidentRows.map((r) => rowToIncident(r, null));
    }

    const ids = incidentRows.map((r) => r.id);
    const votesSql: SQLWrapper = sql`
      SELECT user_id, incident_id, is_confirm
      FROM incidents.incident_vote
      WHERE user_id = ${userId}::uuid
        AND incident_id = ANY(ARRAY[${sql.raw(ids.map((id) => `'${id}'`).join(','))}]::uuid[])
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const votesResult = await this.db.execute(votesSql as any);
    const voteRows = Array.isArray(votesResult)
      ? votesResult
      : (votesResult as { rows?: unknown[] }).rows ?? [];
    const voteMap = new Map<string, VoteDbRow>();
    for (const v of voteRows as VoteDbRow[]) {
      voteMap.set(v.incident_id, v);
    }

    return incidentRows.map((r) => rowToIncident(r, voteMap.get(r.id) ?? null));
  }

  /** Fetch a single incident by id. */
  async getIncidentById(incidentId: string, userId?: string): Promise<Incident> {
    const selectSql: SQLWrapper = sql`
      SELECT
        id, type, severity, description, reported_by, anonymous,
        created_at, expires_at, confirmed_count, disputed_count,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
      FROM incidents.incident
      WHERE id = ${incidentId}::uuid
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(selectSql as any);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    const row = (rows as IncidentDbRow[])[0];
    if (!row) throw new Error(`incident not found: ${incidentId}`);

    let myVote: VoteDbRow | null = null;
    if (userId) {
      const voteSql: SQLWrapper = sql`
        SELECT user_id, incident_id, is_confirm
        FROM incidents.incident_vote
        WHERE user_id = ${userId}::uuid AND incident_id = ${incidentId}::uuid
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const voteResult = await this.db.execute(voteSql as any);
      const voteRows = Array.isArray(voteResult)
        ? voteResult
        : (voteResult as { rows?: unknown[] }).rows ?? [];
      myVote = (voteRows as VoteDbRow[])[0] ?? null;
    }

    return rowToIncident(row, myVote);
  }

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------

  /**
   * Expire incidents whose expires_at has passed.
   * Returns the count of expired incidents.
   * Run this on a schedule (e.g. every 5 minutes via a cron job).
   */
  async expireOldIncidents(): Promise<number> {
    const deleteSql: SQLWrapper = sql`
      DELETE FROM incidents.incident
      WHERE expires_at <= now()
      RETURNING id
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(deleteSql as any);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    return rows.length;
  }

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------

  /**
   * Top contributors for a city over a time period.
   * Returns the top 50 by total points, plus the requesting user's own entry.
   */
  async getTopContributors(opts: {
    cityId: string;
    period: 'week' | 'month' | 'allTime';
    userId?: string;
  }): Promise<LeaderboardResponse> {
    const { cityId, period, userId } = opts;

    const cutoff =
      period === 'week'
        ? sql`now() - interval '7 days'`
        : period === 'month'
          ? sql`now() - interval '30 days'`
          : sql`'1970-01-01'::timestamptz`;

    // Use contributor_stats for allTime; for week/month use incident table
    // (simplified: we always use contributor_stats for now, refreshed externally)
    const topSql: SQLWrapper = sql`
      SELECT
        user_id, city_id,
        incident_count, review_count, place_count, photo_count
      FROM incidents.contributor_stats
      WHERE city_id = ${cityId}
        AND updated_at >= ${cutoff}
      ORDER BY
        (incident_count * 10 + review_count * 15 + place_count * 20 + photo_count * 5) DESC
      LIMIT 50
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topResult = await this.db.execute(topSql as any);
    const topRows = Array.isArray(topResult)
      ? topResult
      : (topResult as { rows?: unknown[] }).rows ?? [];
    const entries = (topRows as ContributorDbRow[]).map((r, i) =>
      rowToContributor(r, i + 1),
    );

    let myEntry: ContributorEntry | null = null;
    if (userId) {
      const mySql: SQLWrapper = sql`
        SELECT user_id, city_id, incident_count, review_count, place_count, photo_count
        FROM incidents.contributor_stats
        WHERE user_id = ${userId}::uuid AND city_id = ${cityId}
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const myResult = await this.db.execute(mySql as any);
      const myRows = Array.isArray(myResult)
        ? myResult
        : (myResult as { rows?: unknown[] }).rows ?? [];
      const myRow = (myRows as ContributorDbRow[])[0] ?? null;
      if (myRow) {
        // Find rank in top list or compute separately
        const myPoints = pointsForTier(
          Number(myRow.incident_count),
          Number(myRow.review_count),
          Number(myRow.place_count),
          Number(myRow.photo_count),
        );
        // Count how many users have more points
        const rankSql: SQLWrapper = sql`
          SELECT COUNT(*)::int AS rank
          FROM incidents.contributor_stats
          WHERE city_id = ${cityId}
            AND (incident_count * 10 + review_count * 15 + place_count * 20 + photo_count * 5) > ${myPoints}
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rankResult = await this.db.execute(rankSql as any);
        const rankRows = Array.isArray(rankResult)
          ? rankResult
          : (rankResult as { rows?: unknown[] }).rows ?? [];
        const rank = (rankRows[0] as { rank: number } | undefined)?.rank ?? 0;
        myEntry = rowToContributor(myRow, rank + 1);
      }
    }

    return { cityId, period, entries, myEntry };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async applyVoteSideEffects(incidentId: string): Promise<void> {
    // Fetch updated counts
    const fetchSql: SQLWrapper = sql`
      SELECT confirmed_count, disputed_count, expires_at
      FROM incidents.incident
      WHERE id = ${incidentId}::uuid
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.db.execute(fetchSql as any);
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
    const row = (rows as Array<{ confirmed_count: number; disputed_count: number; expires_at: Date }>)[0];
    if (!row) return;

    const confirmed = Number(row.confirmed_count);
    const disputed = Number(row.disputed_count);
    const expiresAt = new Date(row.expires_at);
    const now = new Date();

    if (disputed >= DISPUTE_THRESHOLD) {
      // Halve remaining time (expire early)
      const remaining = expiresAt.getTime() - now.getTime();
      if (remaining > 0) {
        const newExpiry = new Date(now.getTime() + remaining / 2);
        const updateSql: SQLWrapper = sql`
          UPDATE incidents.incident
          SET expires_at = ${newExpiry}
          WHERE id = ${incidentId}::uuid
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.db.execute(updateSql as any);
      }
    } else if (confirmed >= CONFIRM_THRESHOLD) {
      // Extend by bonus hours (idempotent: only if not already extended past bonus)
      const bonus = CONFIRM_TTL_BONUS_HOURS * 3_600_000;
      const extended = new Date(expiresAt.getTime() + bonus);
      // Cap extension: no more than 24h from now
      const cap = new Date(now.getTime() + 24 * 3_600_000);
      const newExpiry = extended < cap ? extended : cap;
      if (newExpiry > expiresAt) {
        const updateSql: SQLWrapper = sql`
          UPDATE incidents.incident
          SET expires_at = ${newExpiry}
          WHERE id = ${incidentId}::uuid
        `;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.db.execute(updateSql as any);
      }
    }
  }

  private async incrementContributorStat(
    userId: string,
    field: 'incident_count' | 'review_count' | 'place_count' | 'photo_count',
  ): Promise<void> {
    const updateSql: SQLWrapper = sql`
      INSERT INTO incidents.contributor_stats (user_id, city_id, ${sql.raw(field)})
      VALUES (${userId}::uuid, 'baghdad', 1)
      ON CONFLICT (user_id) DO UPDATE
        SET ${sql.raw(field)} = incidents.contributor_stats.${sql.raw(field)} + 1,
            updated_at = now()
    `;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.db.execute(updateSql as any);
  }
}
