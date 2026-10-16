/**
 * MetricsDashboardService — pre-computed analytics metrics for the admin dashboard.
 *
 * All queries read from analytics.event (raw events written by AnalyticsService)
 * and messaging/places/providers tables for cross-module metrics.
 *
 * Percentiles (P50, P95) are computed in SQL using percentile_cont.
 * No external OLAP engine required for MVP scale.
 */

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DauRow {
  date: string;
  activeUsers: number;
}

export interface RetentionOverview {
  day7Rate: number;
  day14Rate: number;
  day30Rate: number;
  cohortSize: number;
  cohortDate: string;
}

export interface FeatureAdoptionRow {
  feature: string;
  users: number;
  adoptionRate: number;
}

export interface SearchCompletionRow {
  date: string;
  totalSearches: number;
  searchesWithResult: number;
  completionRate: number;
}

export interface NavigationSessionStats {
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  completionRate: number;
}

export interface ProviderResponseTimeRow {
  providerId: string;
  p50Ms: number;
  p95Ms: number;
  sampleCount: number;
}

export interface CrashRateRow {
  date: string;
  totalSessions: number;
  crashedSessions: number;
  crashRate: number;
}

export interface AppVersionDistributionRow {
  appVersion: string;
  sessions: number;
  share: number;
}

// ── DB adapter ─────────────────────────────────────────────────────────────────

type Db = {
  execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function toNum(val: unknown): number {
  return Number(val ?? 0);
}

function toStr(val: unknown): string {
  return String(val ?? '');
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class MetricsDashboardService {
  constructor(private readonly db: Db) {}

  // ── DAU time series ─────────────────────────────────────────────────────────

  /**
   * Daily active users for the last N days.
   * A "day" is UTC midnight to midnight.
   */
  async getDailyActiveUsersSeries(days: number): Promise<DauRow[]> {
    const safeDays = Math.min(365, Math.max(1, days));

    const rows = await this.db.execute(sql`
      SELECT
        DATE(occurred_at)::text AS date,
        COUNT(DISTINCT user_id)::int AS active_users
      FROM analytics.event
      WHERE user_id IS NOT NULL
        AND occurred_at >= (now() - (${safeDays} || ' days')::interval)
      GROUP BY DATE(occurred_at)
      ORDER BY date
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      date: toStr(r['date']),
      activeUsers: toNum(r['active_users']),
    }));
  }

  // ── MAU ─────────────────────────────────────────────────────────────────────

  /**
   * Monthly active users for each of the last N calendar months.
   */
  async getMonthlyActiveUsersSeries(months: number): Promise<Array<{ month: string; activeUsers: number }>> {
    const safeMonths = Math.min(24, Math.max(1, months));

    const rows = await this.db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', occurred_at), 'YYYY-MM') AS month,
        COUNT(DISTINCT user_id)::int AS active_users
      FROM analytics.event
      WHERE user_id IS NOT NULL
        AND occurred_at >= (now() - (${safeMonths} || ' months')::interval)
      GROUP BY DATE_TRUNC('month', occurred_at)
      ORDER BY month
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      month: toStr(r['month']),
      activeUsers: toNum(r['active_users']),
    }));
  }

  // ── Retention overview ───────────────────────────────────────────────────────

  /**
   * Returns retention rates for the cohort that first appeared on the closest
   * complete day within [startDate, endDate]. Checks day-7, day-14 and day-30.
   */
  async getRetentionOverview(startDate: Date, endDate: Date): Promise<RetentionOverview | null> {
    // Use users whose first event was at startDate as cohort
    const cohortDateStr = startDate.toISOString().slice(0, 10);

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

    const cohortSize = toNum((cohortRes.rows[0] as Record<string, unknown> | undefined)?.['cohort_size']);
    if (cohortSize === 0) return null;

    const getRet = async (offsetDays: number): Promise<number> => {
      const targetDate = new Date(startDate);
      targetDate.setDate(targetDate.getDate() + offsetDays);
      // Don't query future dates
      if (targetDate > endDate) return 0;
      const targetStr = targetDate.toISOString().slice(0, 10);

      const res = await this.db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS retained
        FROM analytics.event
        WHERE user_id IS NOT NULL
          AND DATE(occurred_at) = ${targetStr}::date
          AND user_id IN (
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
      return toNum((res.rows[0] as Record<string, unknown> | undefined)?.['retained']);
    };

    const [ret7, ret14, ret30] = await Promise.all([
      getRet(7),
      getRet(14),
      getRet(30),
    ]);

    const rate = (n: number) => Math.round((n / cohortSize) * 10000) / 100;

    return {
      day7Rate: rate(ret7),
      day14Rate: rate(ret14),
      day30Rate: rate(ret30),
      cohortSize,
      cohortDate: cohortDateStr,
    };
  }

  // ── Search completion rate ───────────────────────────────────────────────────

  /**
   * Search completion: searches with at least one result tapped vs total searches.
   * Groups by day.
   */
  async getSearchCompletionRates(startDate: Date): Promise<SearchCompletionRow[]> {
    const rows = await this.db.execute(sql`
      SELECT
        DATE(s.occurred_at)::text AS date,
        COUNT(*)::int AS total_searches,
        COUNT(r.session_id)::int AS searches_with_result
      FROM analytics.event s
      LEFT JOIN analytics.event r
        ON r.session_id = s.session_id
        AND r.event_name = 'search_result_tapped'
        AND r.occurred_at >= s.occurred_at
        AND r.occurred_at < s.occurred_at + interval '5 minutes'
      WHERE s.event_name = 'search_query_submitted'
        AND s.occurred_at >= ${startDate.toISOString()}::timestamptz
      GROUP BY DATE(s.occurred_at)
      ORDER BY date
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => {
      const total = toNum(r['total_searches']);
      const withResult = toNum(r['searches_with_result']);
      return {
        date: toStr(r['date']),
        totalSearches: total,
        searchesWithResult: withResult,
        completionRate: total === 0 ? 0 : Math.round((withResult / total) * 10000) / 100,
      };
    });
  }

  // ── Navigation session lengths ───────────────────────────────────────────────

  /**
   * Navigation session length statistics.
   * A "session" is a navigation_started → navigation_completed/cancelled pair.
   * Duration is estimated from event timestamps within the same session.
   */
  async getNavigationSessionStats(): Promise<NavigationSessionStats> {
    const statsRes = await this.db.execute(sql`
      WITH nav_sessions AS (
        SELECT
          s.session_id,
          s.occurred_at AS started_at,
          MIN(e.occurred_at) AS ended_at,
          BOOL_OR(e.event_name = 'navigation_completed') AS completed
        FROM analytics.event s
        LEFT JOIN analytics.event e
          ON e.session_id = s.session_id
          AND e.event_name IN ('navigation_completed', 'navigation_cancelled')
          AND e.occurred_at > s.occurred_at
          AND e.occurred_at < s.occurred_at + interval '4 hours'
        WHERE s.event_name = 'navigation_started'
          AND s.occurred_at >= now() - interval '30 days'
        GROUP BY s.session_id, s.occurred_at
      ),
      with_durations AS (
        SELECT
          completed,
          EXTRACT(EPOCH FROM (ended_at - started_at)) * 1000 AS duration_ms
        FROM nav_sessions
        WHERE ended_at IS NOT NULL
      )
      SELECT
        COUNT(*)::int AS total_sessions,
        COUNT(*) FILTER (WHERE completed)::int AS completed_sessions,
        COUNT(*) FILTER (WHERE NOT completed)::int AS cancelled_sessions,
        AVG(duration_ms)::float AS avg_duration_ms,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms)::float AS p50_duration_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::float AS p95_duration_ms
      FROM with_durations
    `);

    const r = (statsRes.rows[0] ?? {}) as Record<string, unknown>;
    const total = toNum(r['total_sessions']);
    const completed = toNum(r['completed_sessions']);

    return {
      totalSessions: total,
      completedSessions: completed,
      cancelledSessions: toNum(r['cancelled_sessions']),
      avgDurationMs: Math.round(toNum(r['avg_duration_ms'])),
      p50DurationMs: Math.round(toNum(r['p50_duration_ms'])),
      p95DurationMs: Math.round(toNum(r['p95_duration_ms'])),
      completionRate: total === 0 ? 0 : Math.round((completed / total) * 10000) / 100,
    };
  }

  // ── Provider response times ──────────────────────────────────────────────────

  /**
   * Median and P95 message response times per provider.
   * "Response time" = time between message_sent (user) and message_sent (provider reply)
   * in the same thread, computed from the messaging.message table.
   */
  async getProviderResponseTimes(limit: number): Promise<ProviderResponseTimeRow[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));

    const rows = await this.db.execute(sql`
      SELECT
        provider_id,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY response_ms)::float AS p50_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_ms)::float AS p95_ms,
        COUNT(*)::int AS sample_count
      FROM (
        SELECT
          m2.provider_id,
          EXTRACT(EPOCH FROM (m2.created_at - m1.created_at)) * 1000 AS response_ms
        FROM messaging.message m1
        JOIN messaging.message m2
          ON m2.thread_id = m1.thread_id
          AND m2.sender_type = 'provider'
          AND m2.created_at > m1.created_at
          AND m2.created_at < m1.created_at + interval '7 days'
        WHERE m1.sender_type = 'user'
          AND m1.created_at >= now() - interval '30 days'
      ) AS resp
      GROUP BY provider_id
      HAVING COUNT(*) >= 3
      ORDER BY p50_ms
      LIMIT ${safeLimit}
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      providerId: toStr(r['provider_id']),
      p50Ms: Math.round(toNum(r['p50_ms'])),
      p95Ms: Math.round(toNum(r['p95_ms'])),
      sampleCount: toNum(r['sample_count']),
    }));
  }

  // ── Crash rate ───────────────────────────────────────────────────────────────

  /**
   * Daily crash rate: sessions with at least one crash event / total sessions.
   */
  async getCrashRates(days: number): Promise<CrashRateRow[]> {
    const safeDays = Math.min(90, Math.max(1, days));

    const rows = await this.db.execute(sql`
      SELECT
        DATE(occurred_at)::text AS date,
        COUNT(DISTINCT session_id)::int AS total_sessions,
        COUNT(DISTINCT CASE WHEN event_name LIKE 'crash_%' THEN session_id END)::int AS crashed_sessions
      FROM analytics.event
      WHERE occurred_at >= (now() - (${safeDays} || ' days')::interval)
      GROUP BY DATE(occurred_at)
      ORDER BY date
    `);

    return (rows.rows as Array<Record<string, unknown>>).map((r) => {
      const total = toNum(r['total_sessions']);
      const crashed = toNum(r['crashed_sessions']);
      return {
        date: toStr(r['date']),
        totalSessions: total,
        crashedSessions: crashed,
        crashRate: total === 0 ? 0 : Math.round((crashed / total) * 10000) / 100,
      };
    });
  }

  // ── App version distribution ─────────────────────────────────────────────────

  /**
   * Active sessions per app version in the last 7 days.
   */
  async getAppVersionDistribution(): Promise<AppVersionDistributionRow[]> {
    const rows = await this.db.execute(sql`
      SELECT
        COALESCE(app_version, 'unknown') AS app_version,
        COUNT(DISTINCT session_id)::int AS sessions
      FROM analytics.event
      WHERE occurred_at >= now() - interval '7 days'
      GROUP BY app_version
      ORDER BY sessions DESC
      LIMIT 20
    `);

    const rawRows = rows.rows as Array<Record<string, unknown>>;
    const totalSessions = rawRows.reduce((acc, r) => acc + toNum(r['sessions']), 0);

    return rawRows.map((r) => ({
      appVersion: toStr(r['app_version']),
      sessions: toNum(r['sessions']),
      share: totalSessions === 0 ? 0 : Math.round((toNum(r['sessions']) / totalSessions) * 10000) / 100,
    }));
  }

  // ── Onboarding funnel ────────────────────────────────────────────────────────

  /**
   * Onboarding completion funnel.
   */
  async getOnboardingFunnel(): Promise<Array<{ step: string; users: number; dropoffRate: number }>> {
    const steps = [
      'onboarding_started',
      'onboarding_step_completed',
      'sign_in_started',
      'sign_in_completed',
      'onboarding_completed',
    ];

    const results = [];
    let prev = 0;

    for (const step of steps) {
      const res = await this.db.execute(sql`
        SELECT COUNT(DISTINCT COALESCE(user_id, session_id))::int AS cnt
        FROM analytics.event
        WHERE event_name = ${step}
          AND occurred_at >= now() - interval '30 days'
      `);
      const count = toNum((res.rows[0] as Record<string, unknown> | undefined)?.['cnt']);
      const dropoffRate = prev === 0 ? 0 : Math.round((1 - count / prev) * 10000) / 100;
      results.push({ step, users: count, dropoffRate });
      prev = count;
    }

    return results;
  }

  // ── Assistant engagement ─────────────────────────────────────────────────────

  /**
   * Assistant engagement: average messages per conversation.
   */
  async getAssistantEngagement(): Promise<{
    totalConversations: number;
    avgMessagesPerConversation: number;
    placeTapRate: number;
  }> {
    const [convRes, msgRes, tapRes] = await Promise.all([
      this.db.execute(sql`
        SELECT COUNT(DISTINCT session_id)::int AS cnt
        FROM analytics.event
        WHERE event_name = 'assistant_opened'
          AND occurred_at >= now() - interval '30 days'
      `),
      this.db.execute(sql`
        SELECT COUNT(*)::float AS cnt
        FROM analytics.event
        WHERE event_name = 'assistant_message_sent'
          AND occurred_at >= now() - interval '30 days'
      `),
      this.db.execute(sql`
        SELECT COUNT(DISTINCT session_id)::int AS cnt
        FROM analytics.event
        WHERE event_name = 'assistant_place_tapped'
          AND occurred_at >= now() - interval '30 days'
      `),
    ]);

    const conversations = toNum((convRes.rows[0] as Record<string, unknown> | undefined)?.['cnt']);
    const messages = toNum((msgRes.rows[0] as Record<string, unknown> | undefined)?.['cnt']);
    const taps = toNum((tapRes.rows[0] as Record<string, unknown> | undefined)?.['cnt']);

    return {
      totalConversations: conversations,
      avgMessagesPerConversation: conversations === 0 ? 0 : Math.round((messages / conversations) * 10) / 10,
      placeTapRate: conversations === 0 ? 0 : Math.round((taps / conversations) * 10000) / 100,
    };
  }
}
