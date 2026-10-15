/**
 * IncidentsService – stores and queries traffic incidents.
 *
 * Uses raw SQL via db-kit's `Db` (Drizzle with PostgreSQL driver).
 * Raw SQL keeps this independent of Drizzle ORM schema types that require
 * PostGIS column definitions not exported by db-kit.
 */
import type { Incident, IncidentId, IncidentType, UserId } from '@iraq-maps/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';

// ---------------------------------------------------------------------------
// Internal row shape returned from the DB
// ---------------------------------------------------------------------------
interface IncidentDbRow {
  id: string;
  type: string;
  description: string | null;
  reported_by: string | null;
  created_at: Date;
  expires_at: Date;
  lng: number;
  lat: number;
}

function rowToIncident(row: IncidentDbRow): Incident {
  const now = new Date();
  return {
    id: row.id as IncidentId,
    type: row.type as IncidentType,
    location: [Number(row.lng), Number(row.lat)],
    description: row.description ?? null,
    reportedBy: (row.reported_by ?? null) as UserId | null,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    active: row.expires_at > now,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class IncidentsService {
  constructor(private readonly db: Db) {}

  /** Create a new incident and return it. */
  async create(opts: {
    type: IncidentType;
    lng: number;
    lat: number;
    description?: string;
    reportedBy?: string;
    ttlHours: number;
  }): Promise<Incident> {
    const { type, lng, lat, description, reportedBy, ttlHours } = opts;
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

    const result = await this.db.execute(
      sql`
        INSERT INTO incidents.incident (type, location, description, reported_by, expires_at)
        VALUES (
          ${type},
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${description ?? null},
          ${reportedBy ?? null}::uuid,
          ${expiresAt}
        )
        RETURNING
          id, type, description, reported_by, created_at, expires_at,
          ST_X(location::geometry) AS lng,
          ST_Y(location::geometry) AS lat
      `,
    );
    const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];

    const row = (rows as IncidentDbRow[])[0];
    if (!row) throw new Error('incident insert returned no rows');
    return rowToIncident(row);
  }

  /** Return active incidents within radiusKm of (lat, lng). */
  async listNear(opts: {
    lat: number;
    lng: number;
    radiusKm: number;
  }): Promise<Incident[]> {
    const { lat, lng, radiusKm } = opts;
    const radiusM = radiusKm * 1000;

    const result2 = await this.db.execute(
      sql`
        SELECT
          id, type, description, reported_by, created_at, expires_at,
          ST_X(location::geometry) AS lng,
          ST_Y(location::geometry) AS lat
        FROM incidents.incident
        WHERE
          expires_at > now()
          AND ST_DWithin(
            location,
            ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
            ${radiusM}
          )
        ORDER BY created_at DESC
        LIMIT 200
      `,
    );
    const rows2 = Array.isArray(result2) ? result2 : (result2 as { rows?: unknown[] }).rows ?? [];

    return (rows2 as IncidentDbRow[]).map(rowToIncident);
  }
}
