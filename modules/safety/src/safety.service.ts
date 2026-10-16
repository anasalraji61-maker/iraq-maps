/**
 * SafetyService – manages safety incidents, alert subscriptions, trusted
 * contacts, and live location sharing.
 *
 * All DB calls use raw SQL via db-kit's `Db` (Drizzle with PostGIS driver)
 * to avoid importing PostGIS column types that are not exported from db-kit.
 *
 * Location data is sensitive. Coordinates are:
 *  - never logged at verbosity INFO or above
 *  - only stored when the user explicitly shares them
 *  - only readable by explicitly-authorised viewer IDs
 */
import type {
  EmergencyAlertId,
  SafetyAlertPrefs,
  SafetyIncident,
  SafetyIncidentId,
  SafetyIncidentSeverity,
  SafetyIncidentStatus,
  SafetyIncidentType,
  SafetyLocationShare,
  SafetyShareId,
  TrustedContact,
  TrustedContactId,
  UserId,
} from '@iraq-maps/contracts';
import { sql, type SQLWrapper } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default TTL (hours) for a new incident. */
const DEFAULT_TTL_HOURS = 4;

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------

interface IncidentRow {
  id: string;
  type: string;
  severity: string;
  status: string;
  city_id: string;
  description: string | null;
  reported_by: string | null;
  anonymous: boolean;
  confirmed_count: number;
  admin_note: string | null;
  created_at: Date;
  expires_at: Date;
  updated_at: Date;
  lng: number;
  lat: number;
}

interface SubscriptionRow {
  user_id: string;
  city_id: string;
  enabled_types: string[];
  min_severity: string;
  radius_km: number;
  push_enabled: boolean;
  updated_at: Date;
}

interface ContactRow {
  id: string;
  user_id: string;
  contact_user_id: string;
  accepted: boolean;
  added_at: Date;
  display_name: string | null;
  phone: string | null;
}

interface ShareRow {
  id: string;
  sharer_id: string;
  viewer_ids: string[];
  last_lng: number | null;
  last_lat: number | null;
  expires_at: Date;
  emergency_triggered: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AlertRow {
  id: string;
  user_id: string;
  type: string;
  last_lng: number | null;
  last_lat: number | null;
  message: string | null;
  notified_contact_ids: string[];
  share_created: boolean;
  share_id: string | null;
  sent_at: Date;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToIncident(row: IncidentRow): SafetyIncident {
  const now = new Date();
  return {
    id: row.id as SafetyIncidentId,
    type: row.type as SafetyIncidentType,
    severity: row.severity as SafetyIncidentSeverity,
    status: row.status as SafetyIncidentStatus,
    location: [Number(row.lng), Number(row.lat)],
    cityId: row.city_id,
    description: row.description ?? null,
    reportedBy: row.anonymous ? null : ((row.reported_by ?? null) as UserId | null),
    anonymous: row.anonymous,
    confirmedCount: Number(row.confirmed_count),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    active: row.expires_at > now && row.status === 'active',
  };
}

function rowToSubscription(row: SubscriptionRow): SafetyAlertPrefs {
  return {
    cityId: row.city_id,
    enabledTypes: (row.enabled_types ?? []) as SafetyIncidentType[],
    minSeverity: row.min_severity as SafetyIncidentSeverity,
    radiusKm: Number(row.radius_km),
    pushEnabled: row.push_enabled,
  };
}

function rowToContact(row: ContactRow): TrustedContact {
  return {
    id: row.id as TrustedContactId,
    userId: row.user_id as UserId,
    contactUserId: row.contact_user_id as UserId,
    displayName: row.display_name ?? null,
    phone: null, // phone numbers not exposed cross-user
    accepted: row.accepted,
    addedAt: row.added_at.toISOString(),
  };
}

function rowToShare(row: ShareRow): SafetyLocationShare {
  const location =
    row.last_lng != null && row.last_lat != null
      ? ([Number(row.last_lng), Number(row.last_lat)] as [number, number])
      : null;
  return {
    shareId: row.id as SafetyShareId,
    sharerId: row.sharer_id as UserId,
    viewerIds: (row.viewer_ids ?? []) as UserId[],
    location,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    emergencyTriggered: row.emergency_triggered,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exec(db: Db, q: SQLWrapper): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.execute(q as any);
}

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: unknown[] }).rows ?? [];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SafetyService {
  constructor(private readonly db: Db) {}

  // ── Incidents ─────────────────────────────────────────────────────────────

  /**
   * Report a new safety incident.
   * Location data is stored only in the DB and never echoed to logs.
   */
  async reportSafetyIncident(opts: {
    type: SafetyIncidentType;
    severity: SafetyIncidentSeverity;
    lng: number;
    lat: number;
    cityId: string;
    description?: string;
    reportedBy?: string;
    ttlHours?: number;
    anonymous: boolean;
  }): Promise<SafetyIncident> {
    const {
      type,
      severity,
      lng,
      lat,
      cityId,
      description,
      reportedBy,
      ttlHours = DEFAULT_TTL_HOURS,
      anonymous,
    } = opts;

    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
    const storedReporter = anonymous ? null : (reportedBy ?? null);

    const q: SQLWrapper = sql`
      INSERT INTO safety.incident
        (type, severity, status, location, city_id, description, reported_by, anonymous, expires_at)
      VALUES (
        ${type},
        ${severity},
        'active',
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
        ${cityId},
        ${description ?? null},
        ${storedReporter}::uuid,
        ${anonymous},
        ${expiresAt}
      )
      RETURNING
        id, type, severity, status, city_id, description,
        reported_by, anonymous, confirmed_count, admin_note,
        created_at, expires_at, updated_at,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
    `;

    const result = rows(await exec(this.db, q));
    const row = (result as IncidentRow[])[0];
    if (!row) throw new Error('incident insert returned no rows');
    return rowToIncident(row);
  }

  /**
   * Get active safety alerts near a location.
   * Optionally filtered by severity and incident types.
   */
  async getSafetyAlerts(opts: {
    lat: number;
    lng: number;
    radiusKm: number;
    cityId?: string;
    severity?: SafetyIncidentSeverity;
    types?: SafetyIncidentType[];
    cursor?: string;
    limit?: number;
  }): Promise<{ items: SafetyIncident[]; nextCursor: string | null }> {
    const { lat, lng, radiusKm, cityId, severity, types, cursor, limit = 50 } = opts;
    const radiusM = radiusKm * 1000;

    const severityOrder: Record<SafetyIncidentSeverity, number> = {
      low: 0, medium: 1, high: 2, critical: 3,
    };
    const minSeverityOrder = severity ? severityOrder[severity] : 0;

    const cityFilter = cityId ? sql`AND city_id = ${cityId}` : sql``;
    const typeFilter =
      types && types.length > 0
        ? sql`AND type = ANY(ARRAY[${sql.raw(types.map((t) => `'${t}'`).join(','))}]::text[])`
        : sql``;
    const cursorFilter = cursor ? sql`AND created_at < ${new Date(cursor)}` : sql``;

    const severityValues = ['low', 'medium', 'high', 'critical'].slice(minSeverityOrder);
    const severityFilter =
      severity
        ? sql`AND severity = ANY(ARRAY[${sql.raw(severityValues.map((s) => `'${s}'`).join(','))}]::text[])`
        : sql``;

    const q: SQLWrapper = sql`
      SELECT
        id, type, severity, status, city_id, description,
        reported_by, anonymous, confirmed_count, admin_note,
        created_at, expires_at, updated_at,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
      FROM safety.incident
      WHERE
        expires_at > now()
        AND status != 'dismissed'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${radiusM}
        )
        ${cityFilter}
        ${typeFilter}
        ${severityFilter}
        ${cursorFilter}
      ORDER BY created_at DESC
      LIMIT ${limit + 1}
    `;

    const result = rows(await exec(this.db, q)) as IncidentRow[];
    const hasMore = result.length > limit;
    const items = result.slice(0, limit).map(rowToIncident);
    const nextCursor = hasMore
      ? items[items.length - 1]?.createdAt ?? null
      : null;

    return { items, nextCursor };
  }

  /** Get a single incident by id. */
  async getIncidentById(id: string): Promise<SafetyIncident | null> {
    const q: SQLWrapper = sql`
      SELECT
        id, type, severity, status, city_id, description,
        reported_by, anonymous, confirmed_count, admin_note,
        created_at, expires_at, updated_at,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
      FROM safety.incident
      WHERE id = ${id}::uuid
    `;
    const result = rows(await exec(this.db, q)) as IncidentRow[];
    const row = result[0];
    return row ? rowToIncident(row) : null;
  }

  /**
   * Admin action: confirm or dismiss an incident.
   * Only users with role `moderator` or `admin` should call this.
   */
  async updateIncidentStatus(opts: {
    id: string;
    status: 'confirmed' | 'dismissed';
    adminNote?: string;
  }): Promise<SafetyIncident | null> {
    const { id, status, adminNote } = opts;

    const q: SQLWrapper = sql`
      UPDATE safety.incident
      SET
        status     = ${status},
        admin_note = ${adminNote ?? null},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, type, severity, status, city_id, description,
        reported_by, anonymous, confirmed_count, admin_note,
        created_at, expires_at, updated_at,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat
    `;

    const result = rows(await exec(this.db, q)) as IncidentRow[];
    const row = result[0];
    return row ? rowToIncident(row) : null;
  }

  /**
   * Expire stale incidents (run on a schedule).
   * Returns the count of rows updated.
   */
  async expireOldIncidents(): Promise<number> {
    const q: SQLWrapper = sql`
      UPDATE safety.incident
      SET status = 'expired', updated_at = now()
      WHERE expires_at <= now() AND status = 'active'
      RETURNING id
    `;
    const result = rows(await exec(this.db, q));
    return result.length;
  }

  // ── Alert subscriptions ───────────────────────────────────────────────────

  /**
   * Upsert a user's safety alert subscription.
   * Explicit consent is enforced at the API layer (consentAcknowledged must be true).
   */
  async subscribeSafetyAlerts(
    userId: string,
    prefs: SafetyAlertPrefs,
  ): Promise<SafetyAlertPrefs> {
    const enabledTypesLiteral = `'{${prefs.enabledTypes.join(',')}}'`;
    const q: SQLWrapper = sql`
      INSERT INTO safety.alert_subscription
        (user_id, city_id, enabled_types, min_severity, radius_km, push_enabled)
      VALUES (
        ${userId}::uuid,
        ${prefs.cityId},
        ${sql.raw(enabledTypesLiteral)}::text[],
        ${prefs.minSeverity},
        ${prefs.radiusKm},
        ${prefs.pushEnabled}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        city_id      = EXCLUDED.city_id,
        enabled_types = EXCLUDED.enabled_types,
        min_severity  = EXCLUDED.min_severity,
        radius_km     = EXCLUDED.radius_km,
        push_enabled  = EXCLUDED.push_enabled,
        updated_at    = now()
      RETURNING user_id, city_id, enabled_types, min_severity, radius_km, push_enabled, updated_at
    `;

    const result = rows(await exec(this.db, q)) as SubscriptionRow[];
    const row = result[0];
    if (!row) throw new Error('subscription upsert returned no rows');
    return rowToSubscription(row);
  }

  /** Get a user's current alert subscription preferences. */
  async getSafetyAlertPrefs(userId: string): Promise<SafetyAlertPrefs | null> {
    const q: SQLWrapper = sql`
      SELECT user_id, city_id, enabled_types, min_severity, radius_km, push_enabled, updated_at
      FROM safety.alert_subscription
      WHERE user_id = ${userId}::uuid
    `;
    const result = rows(await exec(this.db, q)) as SubscriptionRow[];
    const row = result[0];
    return row ? rowToSubscription(row) : null;
  }

  // ── Trusted contacts ──────────────────────────────────────────────────────

  /**
   * Return all trusted contacts for a user (both accepted and pending).
   * Requires explicit consent acknowledgement at add time.
   */
  async getTrustedContacts(userId: string): Promise<TrustedContact[]> {
    const q: SQLWrapper = sql`
      SELECT
        tc.id, tc.user_id, tc.contact_user_id, tc.accepted, tc.added_at,
        NULL::text AS display_name,
        NULL::text AS phone
      FROM safety.trusted_contact tc
      WHERE tc.user_id = ${userId}::uuid
      ORDER BY tc.added_at DESC
    `;
    const result = rows(await exec(this.db, q)) as ContactRow[];
    return result.map(rowToContact);
  }

  /**
   * Add a trusted contact.
   * The caller must pass `consentAcknowledged: true` to confirm the user
   * understands that location and emergency alerts will be shared.
   */
  async addTrustedContact(
    userId: string,
    contactUserId: string,
  ): Promise<TrustedContact> {
    // Prevent adding self
    if (userId === contactUserId) {
      throw Object.assign(new Error('cannot add yourself as trusted contact'), { code: 'SELF_CONTACT' });
    }

    const q: SQLWrapper = sql`
      INSERT INTO safety.trusted_contact (user_id, contact_user_id, accepted)
      VALUES (${userId}::uuid, ${contactUserId}::uuid, false)
      ON CONFLICT (user_id, contact_user_id) DO NOTHING
      RETURNING
        id, user_id, contact_user_id, accepted, added_at,
        NULL::text AS display_name,
        NULL::text AS phone
    `;

    const result = rows(await exec(this.db, q)) as ContactRow[];
    const row = result[0];
    if (!row) {
      throw Object.assign(new Error('contact already added'), { code: 'ALREADY_TRUSTED_CONTACT' });
    }
    return rowToContact(row);
  }

  /** Remove a trusted contact. */
  async removeTrustedContact(userId: string, contactId: string): Promise<void> {
    const q: SQLWrapper = sql`
      DELETE FROM safety.trusted_contact
      WHERE user_id = ${userId}::uuid AND id = ${contactId}::uuid
    `;
    await exec(this.db, q);
  }

  /** Get all user IDs that have this user as a trusted contact (reverse lookup). */
  async getContactersOfUser(contactUserId: string): Promise<string[]> {
    const q: SQLWrapper = sql`
      SELECT user_id FROM safety.trusted_contact
      WHERE contact_user_id = ${contactUserId}::uuid AND accepted = true
    `;
    const result = rows(await exec(this.db, q)) as Array<{ user_id: string }>;
    return result.map((r) => r.user_id);
  }

  // ── Live location shares ──────────────────────────────────────────────────

  /**
   * Start a live location share session.
   * `viewerIds` must all be trusted contacts of `sharerId`.
   * Location is stored as plain columns (not PostGIS) for faster incremental updates.
   */
  async startLocationShare(opts: {
    sharerId: string;
    viewerIds: string[];
    durationMinutes: number;
    emergencyTriggered?: boolean;
  }): Promise<SafetyLocationShare> {
    const { sharerId, viewerIds, durationMinutes, emergencyTriggered = false } = opts;

    // Validate all viewers are trusted contacts
    if (viewerIds.length > 0) {
      const checkQ: SQLWrapper = sql`
        SELECT count(*)::int AS cnt
        FROM safety.trusted_contact
        WHERE user_id = ${sharerId}::uuid
          AND contact_user_id = ANY(ARRAY[${sql.raw(viewerIds.map((id) => `'${id}'`).join(','))}]::uuid[])
      `;
      const checkResult = rows(await exec(this.db, checkQ)) as Array<{ cnt: number }>;
      const cnt = Number(checkResult[0]?.cnt ?? 0);
      if (cnt < viewerIds.length) {
        throw Object.assign(
          new Error('one or more viewer IDs are not trusted contacts'),
          { code: 'VIEWER_NOT_TRUSTED_CONTACT' },
        );
      }
    }

    const expiresAt = new Date(Date.now() + durationMinutes * 60_000);
    const viewerArrayLiteral = viewerIds.length > 0
      ? `'{${viewerIds.join(',')}}'`
      : "'{}'";

    const q: SQLWrapper = sql`
      INSERT INTO safety.location_share
        (sharer_id, viewer_ids, expires_at, emergency_triggered)
      VALUES (
        ${sharerId}::uuid,
        ${sql.raw(viewerArrayLiteral)}::uuid[],
        ${expiresAt},
        ${emergencyTriggered}
      )
      RETURNING id, sharer_id, viewer_ids, last_lng, last_lat,
                expires_at, emergency_triggered, created_at, updated_at
    `;

    const result = rows(await exec(this.db, q)) as ShareRow[];
    const row = result[0];
    if (!row) throw new Error('location share insert returned no rows');
    return rowToShare(row);
  }

  /**
   * Update the sharer's current position.
   * Only the sharer can call this; the API layer enforces authorization.
   */
  async updateLocationShare(opts: {
    shareId: string;
    sharerId: string;
    lng: number;
    lat: number;
  }): Promise<SafetyLocationShare | null> {
    const { shareId, sharerId, lng, lat } = opts;

    const q: SQLWrapper = sql`
      UPDATE safety.location_share
      SET
        last_lng   = ${lng},
        last_lat   = ${lat},
        updated_at = now()
      WHERE id = ${shareId}::uuid
        AND sharer_id = ${sharerId}::uuid
        AND expires_at > now()
      RETURNING id, sharer_id, viewer_ids, last_lng, last_lat,
                expires_at, emergency_triggered, created_at, updated_at
    `;

    const result = rows(await exec(this.db, q)) as ShareRow[];
    const row = result[0];
    return row ? rowToShare(row) : null;
  }

  /**
   * Stop (delete) a location share before it expires.
   * Only the sharer can stop a share they started.
   */
  async stopLocationShare(shareId: string, sharerId: string): Promise<boolean> {
    const q: SQLWrapper = sql`
      DELETE FROM safety.location_share
      WHERE id = ${shareId}::uuid AND sharer_id = ${sharerId}::uuid
      RETURNING id
    `;
    const result = rows(await exec(this.db, q));
    return result.length > 0;
  }

  /**
   * Get a location share by ID.
   * Returns null if expired or if requesterId is not the sharer or a viewer.
   */
  async getLocationShare(shareId: string, requesterId: string): Promise<SafetyLocationShare | null> {
    const q: SQLWrapper = sql`
      SELECT id, sharer_id, viewer_ids, last_lng, last_lat,
             expires_at, emergency_triggered, created_at, updated_at
      FROM safety.location_share
      WHERE id = ${shareId}::uuid
        AND expires_at > now()
        AND (
          sharer_id = ${requesterId}::uuid
          OR ${requesterId}::uuid = ANY(viewer_ids)
        )
    `;

    const result = rows(await exec(this.db, q)) as ShareRow[];
    const row = result[0];
    return row ? rowToShare(row) : null;
  }

  /** Get all active shares where the user is the sharer or a viewer. */
  async getActiveShares(userId: string): Promise<SafetyLocationShare[]> {
    const q: SQLWrapper = sql`
      SELECT id, sharer_id, viewer_ids, last_lng, last_lat,
             expires_at, emergency_triggered, created_at, updated_at
      FROM safety.location_share
      WHERE expires_at > now()
        AND (
          sharer_id = ${userId}::uuid
          OR ${userId}::uuid = ANY(viewer_ids)
        )
      ORDER BY created_at DESC
    `;

    const result = rows(await exec(this.db, q)) as ShareRow[];
    return result.map(rowToShare);
  }

  /** Purge expired location shares (maintenance task). */
  async purgeExpiredShares(): Promise<number> {
    const q: SQLWrapper = sql`
      DELETE FROM safety.location_share
      WHERE expires_at <= now()
      RETURNING id
    `;
    const result = rows(await exec(this.db, q));
    return result.length;
  }

  // ── Emergency alerts ──────────────────────────────────────────────────────

  /**
   * Record an emergency alert and return the stored record.
   * The EmergencyService handles notification dispatch; this method only
   * persists the record and returns it.
   */
  async recordEmergencyAlert(opts: {
    userId: string;
    type: string;
    lng?: number;
    lat?: number;
    message?: string;
    notifiedContactIds: string[];
    shareId?: string;
  }): Promise<{
    id: string;
    userId: string;
    type: string;
    location: [number, number] | null;
    message: string | null;
    sentAt: string;
    notifiedContactIds: string[];
    shareCreated: boolean;
    shareId: string | null;
  }> {
    const {
      userId,
      type,
      lng,
      lat,
      message,
      notifiedContactIds,
      shareId,
    } = opts;

    const shareCreated = !!shareId;
    const notifiedArrayLiteral = notifiedContactIds.length > 0
      ? `'{${notifiedContactIds.join(',')}}'`
      : "'{}'";

    const q: SQLWrapper = sql`
      INSERT INTO safety.emergency_alert
        (user_id, type, last_lng, last_lat, message, notified_contact_ids, share_created, share_id)
      VALUES (
        ${userId}::uuid,
        ${type},
        ${lng ?? null}::float8,
        ${lat ?? null}::float8,
        ${message ?? null},
        ${sql.raw(notifiedArrayLiteral)}::uuid[],
        ${shareCreated},
        ${shareId ?? null}::uuid
      )
      RETURNING id, user_id, type, last_lng, last_lat, message,
                notified_contact_ids, share_created, share_id, sent_at
    `;

    const result = rows(await exec(this.db, q)) as AlertRow[];
    const row = result[0];
    if (!row) throw new Error('emergency alert insert returned no rows');

    const location =
      row.last_lng != null && row.last_lat != null
        ? ([Number(row.last_lng), Number(row.last_lat)] as [number, number])
        : null;

    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      location,
      message: row.message,
      sentAt: row.sent_at.toISOString(),
      notifiedContactIds: row.notified_contact_ids ?? [],
      shareCreated: row.share_created,
      shareId: row.share_id ?? null,
    };
  }

  /** Get emergency alert history for a user (paginated). */
  async getEmergencyAlertHistory(opts: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: AlertRow[]; nextCursor: string | null }> {
    const { userId, limit, cursor } = opts;

    const cursorFilter = cursor ? sql`AND sent_at < ${new Date(cursor)}` : sql``;

    const q: SQLWrapper = sql`
      SELECT id, user_id, type, last_lng, last_lat, message,
             notified_contact_ids, share_created, share_id, sent_at
      FROM safety.emergency_alert
      WHERE user_id = ${userId}::uuid
        ${cursorFilter}
      ORDER BY sent_at DESC
      LIMIT ${limit + 1}
    `;

    const result = rows(await exec(this.db, q)) as AlertRow[];
    const hasMore = result.length > limit;
    const items = result.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.sent_at.toISOString() ?? null : null;

    return { items, nextCursor };
  }
}
