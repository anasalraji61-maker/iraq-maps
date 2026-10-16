/**
 * Analytics ingestion and query service.
 *
 * Receives batches of events from mobile clients, stores them in the
 * analytics schema, and exposes query methods for the dashboard.
 *
 * Schema: analytics.event (raw events), analytics.daily_active (materialized counts).
 * PII must already be stripped by the client; the service validates and re-strips.
 */

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { AnalyticsBatch, AnalyticsEvent } from '@iraq-maps/observability';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IngestResult {
  accepted: number;
  rejected: number;
}

export interface EventCountRow {
  event: string;
  count: number;
  date: string;
}

export interface FunnelStep {
  event: string;
  count: number;
  dropoffRate: number;
}

export interface RetentionRow {
  cohortDate: string;
  period: number;
  retained: number;
  cohortSize: number;
  retentionRate: number;
}

export interface ActiveUsersResult {
  period: 'dau' | 'wau' | 'mau';
  count: number;
  asOf: string;
}

export interface TopEventRow {
  event: string;
  totalCount: number;
  uniqueUsers: number;
  lastSeen: string;
}

export interface TrendingSearchRow {
  query: string;
  count: number;
  lastSearchedAt: string;
}

export interface ProviderResponseTimeRow {
  providerId: string;
  p50Ms: number;
  p95Ms: number;
  sampleCount: number;
}

// ── PII re-strip (defense in depth) ───────────────────────────────────────────

const PHONE_RE = /(?<!\w)(?:\+?964|0)7\d{9}(?!\w)/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;

function stripString(s: string): string {
  return s.replace(PHONE_RE, '[phone]').replace(EMAIL_RE, '[email]').replace(JWT_RE, '[jwt]');
}

const PII_PROPERTY_KEYS = new Set([
  'phone', 'email', 'name', 'fullname', 'address', 'nationalid',
  'password', 'token', 'authorization', 'accesstoken', 'refreshtoken',
]);

function stripProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    const kl = k.toLowerCase().replace(/[-_]/g, '');
    if (PII_PROPERTY_KEYS.has(kl)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string') {
      out[k] = stripString(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out[k] = stripProperties(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Validation ─────────────────────────────────────────────────────────────────

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

function isValidEvent(e: unknown): e is AnalyticsEvent {
  if (!e || typeof e !== 'object') return false;
  const ev = e as Record<string, unknown>;
  if (typeof ev['event'] !== 'string' || !EVENT_NAME_RE.test(ev['event'])) return false;
  if (typeof ev['timestamp'] !== 'string') return false;
  if (typeof ev['sessionId'] !== 'string' || !SESSION_ID_RE.test(ev['sessionId'])) return false;
  // userId is optional; if present must be string
  if (ev['userId'] !== undefined && typeof ev['userId'] !== 'string') return false;
  return true;
}

// ── DB adapter type (minimal) ──────────────────────────────────────────────────

type Db = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
};

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: Db) {}

  // ── Ingestion ───────────────────────────────────────────────────────────────

  /**
   * Ingest a batch of events from the mobile client.
   * Invalid or oversized events are silently dropped (counted as rejected).
   * PII is re-stripped as a defense-in-depth measure.
   */
  async ingestBatch(batch: AnalyticsBatch): Promise<IngestResult> {
    let accepted = 0;
    let rejected = 0;

    // Limit to 200 events per batch
    const events = (batch.events ?? []).slice(0, 200);

    for (const raw of events) {
      if (!isValidEvent(raw)) {
        rejected++;
        continue;
      }

      const event = raw as AnalyticsEvent;
      const cleanProps = stripProperties(event.properties ?? {});
      const deviceJson = JSON.stringify(batch.device ?? {});

      try {
        await this.db.execute(sql`
          INSERT INTO analytics.event (
            id, event_name, user_id, session_id, group_id, screen,
            properties, device, sequence, app_version, occurred_at, ingested_at
          ) VALUES (
            gen_random_uuid(),
            ${event.event},
            ${event.userId ?? null},
            ${event.sessionId},
            ${event.groupId ?? null},
            ${event.screen ?? null},
            ${JSON.stringify(cleanProps)}::jsonb,
            ${deviceJson}::jsonb,
            ${event.sequence ?? 0},
            ${(batch.device as unknown as Record<string, unknown> | undefined)?.['appVersion'] ?? null},
            ${event.timestamp}::timestamptz,
            now()
          )
          ON CONFLICT DO NOTHING
        `);
        accepted++;
      } catch {
        rejected++;
      }
    }

    // Also ingest crashes endpoint redirects here if provided
    return { accepted, rejected };
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * Count occurrences of an event, grouped by day, between startDate and endDate.
   */
  async getEventCounts(event: string, startDate: Date, endDate: Date): Promise<EventCountRow[]> {
    const rows = await this.db.execute(sql`
      SELECT
        event_name AS event,
        COUNT(*)::int AS count,
        DATE(occurred_at)::text AS date
      FROM analytics.event
      WHERE event_name = ${event}
        AND occurred_at >= ${startDate.toISOString()}::timestamptz
        AND occurred_at < ${endDate.toISOString()}::timestamptz
      GROUP BY event_name, DATE(occurred_at)
      ORDER BY date
    `);
    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      event: String(r['event']),
      count: Number(r['count']),
      date: String(r['date']),
    }));
  }

  /**
   * Compute a conversion funnel: for each step, how many unique users
   * reached that step (having also reached all previous steps in the same session).
   */
  async getUserFunnel(steps: string[]): Promise<FunnelStep[]> {
    if (steps.length === 0) return [];

    // For each step, count distinct users who performed that step AND all prior steps.
    // Simple implementation: count users who performed step[0], then step[0] AND step[1], etc.
    const results: FunnelStep[] = [];
    let prevCount = 0;

    for (let i = 0; i < steps.length; i++) {
      // Build subquery: user_id must appear in all steps[0..i]
      const stepFilters = steps.slice(0, i + 1).map((s) => sql`
        EXISTS (
          SELECT 1 FROM analytics.event sub
          WHERE sub.user_id = e.user_id
            AND sub.event_name = ${s}
        )
      `);

      // Combine filters with AND using reduce
      const combinedFilter = stepFilters.reduce((acc, cond) =>
        sql`${acc} AND ${cond}`
      );

      const countRes = await this.db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS cnt
        FROM analytics.event e
        WHERE user_id IS NOT NULL
          AND ${combinedFilter}
      `);

      const count = Number((countRes.rows[0] as Record<string, unknown> | undefined)?.['cnt'] ?? 0);
      const dropoffRate = i === 0 || prevCount === 0 ? 0 : Math.round((1 - count / prevCount) * 100) / 100;

      results.push({ event: steps[i] ?? '', count, dropoffRate });
      prevCount = count;
    }

    return results;
  }

  /**
   * Cohort retention: for users who first appeared on cohortDate,
   * what fraction came back in each of the following periods (days)?
   */
  async getRetention(cohortDate: Date, periods: number): Promise<RetentionRow[]> {
    const cohortDateStr = cohortDate.toISOString().slice(0, 10);

    const results: RetentionRow[] = [];

    // Get cohort size: distinct users whose first event was on cohortDate
    const cohortRes = await this.db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS cohort_size
      FROM analytics.event
      WHERE user_id IS NOT NULL
        AND DATE(occurred_at) = ${cohortDateStr}::date
        AND user_id NOT IN (
          SELECT DISTINCT user_id FROM analytics.event
          WHERE user_id IS NOT NULL
            AND DATE(occurred_at) < ${cohortDateStr}::date
        )
    `);
    const cohortSize = Number((cohortRes.rows[0] as Record<string, unknown> | undefined)?.['cohort_size'] ?? 0);

    if (cohortSize === 0) return [];

    for (let p = 0; p <= periods; p++) {
      const targetDate = new Date(cohortDate);
      targetDate.setDate(targetDate.getDate() + p);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const retRes = await this.db.execute(sql`
        SELECT COUNT(DISTINCT e2.user_id)::int AS retained
        FROM analytics.event e2
        WHERE e2.user_id IS NOT NULL
          AND DATE(e2.occurred_at) = ${targetStr}::date
          AND e2.user_id IN (
            SELECT DISTINCT user_id FROM analytics.event
            WHERE user_id IS NOT NULL
              AND DATE(occurred_at) = ${cohortDateStr}::date
              AND user_id NOT IN (
                SELECT DISTINCT user_id FROM analytics.event
                WHERE user_id IS NOT NULL
                  AND DATE(occurred_at) < ${cohortDateStr}::date
              )
          )
      `);

      const retained = Number((retRes.rows[0] as Record<string, unknown> | undefined)?.['retained'] ?? 0);

      results.push({
        cohortDate: cohortDateStr,
        period: p,
        retained,
        cohortSize,
        retentionRate: Math.round((retained / cohortSize) * 10000) / 100,
      });
    }

    return results;
  }

  /**
   * Daily, weekly and monthly active users.
   */
  async getActiveUsers(period: 'dau' | 'wau' | 'mau'): Promise<ActiveUsersResult> {
    const intervalMap: Record<typeof period, string> = {
      dau: '1 day',
      wau: '7 days',
      mau: '30 days',
    };
    const interval = intervalMap[period];

    const res = await this.db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS cnt
      FROM analytics.event
      WHERE user_id IS NOT NULL
        AND occurred_at >= now() - ${interval}::interval
    `);

    return {
      period,
      count: Number((res.rows[0] as Record<string, unknown> | undefined)?.['cnt'] ?? 0),
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Top N events by occurrence count in the given time window.
   */
  async getTopEvents(limit: number, startDate: Date): Promise<TopEventRow[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));

    const rows = await this.db.execute(sql`
      SELECT
        event_name AS event,
        COUNT(*)::int AS total_count,
        COUNT(DISTINCT user_id)::int AS unique_users,
        MAX(occurred_at)::text AS last_seen
      FROM analytics.event
      WHERE occurred_at >= ${startDate.toISOString()}::timestamptz
      GROUP BY event_name
      ORDER BY total_count DESC
      LIMIT ${safeLimit}
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      event: String(r['event']),
      totalCount: Number(r['total_count']),
      uniqueUsers: Number(r['unique_users']),
      lastSeen: String(r['last_seen']),
    }));
  }

  /**
   * Trending search queries: top search terms by frequency in the last 24h.
   */
  async getTrendingSearches(limit: number): Promise<TrendingSearchRow[]> {
    const safeLimit = Math.min(50, Math.max(1, limit));

    const rows = await this.db.execute(sql`
      SELECT
        properties->>'query' AS query,
        COUNT(*)::int AS count,
        MAX(occurred_at)::text AS last_searched_at
      FROM analytics.event
      WHERE event_name = 'search_query_submitted'
        AND occurred_at >= now() - interval '24 hours'
        AND properties->>'query' IS NOT NULL
        AND LENGTH(properties->>'query') > 0
        AND LENGTH(properties->>'query') <= 200
      GROUP BY properties->>'query'
      ORDER BY count DESC
      LIMIT ${safeLimit}
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      query: String(r['query']),
      count: Number(r['count']),
      lastSearchedAt: String(r['last_searched_at']),
    }));
  }

  /**
   * Feature adoption: what fraction of active users used each feature in the last 30 days.
   */
  async getFeatureAdoption(): Promise<Array<{ feature: string; users: number; adoptionRate: number }>> {
    const activeRes = await this.db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS cnt
      FROM analytics.event
      WHERE user_id IS NOT NULL
        AND occurred_at >= now() - interval '30 days'
    `);
    const activeUsers = Number((activeRes.rows[0] as Record<string, unknown> | undefined)?.['cnt'] ?? 1);

    const features = [
      { feature: 'navigation', event: 'navigation_started' },
      { feature: 'assistant', event: 'assistant_opened' },
      { feature: 'messaging', event: 'message_sent' },
      { feature: 'discover', event: 'discover_feed_opened' },
      { feature: 'place_reviews', event: 'place_review_submitted' },
      { feature: 'search', event: 'search_query_submitted' },
    ];

    const results = [];
    for (const { feature, event } of features) {
      const res = await this.db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS cnt
        FROM analytics.event
        WHERE event_name = ${event}
          AND user_id IS NOT NULL
          AND occurred_at >= now() - interval '30 days'
      `);
      const users = Number((res.rows[0] as Record<string, unknown> | undefined)?.['cnt'] ?? 0);
      results.push({
        feature,
        users,
        adoptionRate: Math.round((users / activeUsers) * 10000) / 100,
      });
    }
    return results;
  }

  /**
   * Place view → message conversion rate.
   */
  async getPlaceToMessageConversionRate(): Promise<{ placeViews: number; messages: number; conversionRate: number }> {
    const [viewsRes, msgsRes] = await Promise.all([
      this.db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS cnt
        FROM analytics.event
        WHERE event_name = 'place_viewed'
          AND user_id IS NOT NULL
          AND occurred_at >= now() - interval '30 days'
      `),
      this.db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS cnt
        FROM analytics.event
        WHERE event_name = 'message_sent'
          AND user_id IS NOT NULL
          AND occurred_at >= now() - interval '30 days'
      `),
    ]);

    const placeViews = Number((viewsRes.rows[0] as Record<string, unknown> | undefined)?.['cnt'] ?? 0);
    const messages = Number((msgsRes.rows[0] as Record<string, unknown> | undefined)?.['cnt'] ?? 0);
    const conversionRate = placeViews === 0 ? 0 : Math.round((messages / placeViews) * 10000) / 100;

    return { placeViews, messages, conversionRate };
  }
}
