import type { LocationShare, ShareId, UserId } from '@iraq-maps/contracts';
import { sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';

interface ShareDbRow extends Record<string, unknown> {
  share_id: string;
  owner_id: string | null;
  lng: number | null;
  lat: number | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

function rowToShare(row: ShareDbRow): LocationShare {
  return {
    shareId: row.share_id as ShareId,
    ownerId: (row.owner_id ?? null) as UserId | null,
    location: row.lng != null && row.lat != null ? [Number(row.lng), Number(row.lat)] : null,
    expiresAt: (row.expires_at as Date).toISOString(),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export class LocationShareService {
  constructor(private readonly db: Db) {}

  async create(opts: { ttlHours: number; ownerId?: string }): Promise<LocationShare> {
    const expiresAt = new Date(Date.now() + opts.ttlHours * 3_600_000);
    const { rows } = await this.db.execute<ShareDbRow>(
      sql`
        INSERT INTO location_share.share (owner_id, expires_at)
        VALUES (${opts.ownerId ?? null}::uuid, ${expiresAt})
        RETURNING
          share_id, owner_id, expires_at, created_at, updated_at,
          NULL::float8 AS lng, NULL::float8 AS lat
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('location share insert returned no rows');
    return rowToShare(row);
  }

  async get(shareId: string): Promise<LocationShare | null | 'expired'> {
    const { rows } = await this.db.execute<ShareDbRow>(
      sql`
        SELECT
          share_id, owner_id, expires_at, created_at, updated_at,
          ST_X(location::geometry) AS lng,
          ST_Y(location::geometry) AS lat
        FROM location_share.share
        WHERE share_id = ${shareId}::uuid
      `,
    );
    if (!rows[0]) return null;
    const row = rows[0];
    if ((row.expires_at as Date) < new Date()) return 'expired';
    return rowToShare(row);
  }

  async update(opts: { shareId: string; lng: number; lat: number; requesterId?: string }): Promise<LocationShare | null | 'expired' | 'forbidden'> {
    const existing = await this.get(opts.shareId);
    if (existing === null) return null;
    if (existing === 'expired') return 'expired';
    if (existing.ownerId && opts.requesterId && existing.ownerId !== opts.requesterId) return 'forbidden';

    const { rows } = await this.db.execute<ShareDbRow>(
      sql`
        UPDATE location_share.share
        SET
          location = ST_SetSRID(ST_MakePoint(${opts.lng}::float8, ${opts.lat}::float8), 4326)::geography,
          updated_at = now()
        WHERE share_id = ${opts.shareId}::uuid
        RETURNING
          share_id, owner_id, expires_at, created_at, updated_at,
          ST_X(location::geometry) AS lng,
          ST_Y(location::geometry) AS lat
      `,
    );
    const row = rows[0];
    if (!row) return null;
    return rowToShare(row);
  }
}
