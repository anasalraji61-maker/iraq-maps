import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { analyticsEvent, EVENT_TYPES } from './schema.js';

export interface TrackEventInput {
  eventType: string;
  userId?: string;
  sessionId?: string;
  cityId?: string;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface AnalyticsOverview {
  dau: number;
  totalEvents: number;
  topEventTypes: { eventType: string; count: number }[];
  eventsByDay: { date: string; count: number }[];
}

export interface RetentionRow {
  cohortDate: string;
  dayOffset: number;
  retainedCount: number;
}

export interface FunnelStep {
  step: string;
  eventType: string;
  count: number;
  dropoffRate: number | null;
}

export class AnalyticsService {
  constructor(private readonly db: NodePgDatabase) {}

  async track(input: TrackEventInput): Promise<void> {
    await this.db.insert(analyticsEvent).values({
      eventType: input.eventType,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      cityId: input.cityId ?? null,
      properties: input.properties ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    });
  }

  async getOverview(days = 30): Promise<AnalyticsOverview> {
    const since = new Date(Date.now() - days * 86_400_000);

    const [dauRes, totalRes, topTypesRes, byDayRes] = await Promise.all([
      this.db.execute<{ dau: number }>(sql`
        SELECT COUNT(DISTINCT user_id)::int AS dau
        FROM analytics.event
        WHERE occurred_at >= ${since} AND user_id IS NOT NULL
      `),
      this.db.execute<{ total: number }>(sql`
        SELECT COUNT(*)::int AS total FROM analytics.event WHERE occurred_at >= ${since}
      `),
      this.db.execute<{ event_type: string; count: number }>(sql`
        SELECT event_type, COUNT(*)::int AS count
        FROM analytics.event WHERE occurred_at >= ${since}
        GROUP BY event_type ORDER BY count DESC LIMIT 10
      `),
      this.db.execute<{ date: string; count: number }>(sql`
        SELECT occurred_at::date::text AS date, COUNT(*)::int AS count
        FROM analytics.event WHERE occurred_at >= ${since}
        GROUP BY occurred_at::date ORDER BY date DESC
      `),
    ]);

    return {
      dau: (dauRes.rows[0] as { dau: number } | undefined)?.dau ?? 0,
      totalEvents: (totalRes.rows[0] as { total: number } | undefined)?.total ?? 0,
      topEventTypes: (topTypesRes.rows as { event_type: string; count: number }[]).map((r) => ({ eventType: r.event_type, count: r.count })),
      eventsByDay: (byDayRes.rows as { date: string; count: number }[]),
    };
  }

  async getRetention(cohortDays = 7): Promise<RetentionRow[]> {
    const rows = await this.db.execute<{ cohort_date: string; day_offset: number; retained_count: number }>(sql`
      WITH cohorts AS (
        SELECT
          user_id,
          MIN(occurred_at)::date AS cohort_date
        FROM analytics.event
        WHERE user_id IS NOT NULL AND event_type = ${EVENT_TYPES.APP_OPEN}
          AND occurred_at >= now() - (${cohortDays} || ' days')::interval
        GROUP BY user_id
      ),
      daily AS (
        SELECT DISTINCT user_id, occurred_at::date AS active_date
        FROM analytics.event
        WHERE user_id IS NOT NULL
      )
      SELECT
        c.cohort_date::text,
        (d.active_date - c.cohort_date) AS day_offset,
        COUNT(DISTINCT c.user_id)::int AS retained_count
      FROM cohorts c
      JOIN daily d ON d.user_id = c.user_id AND d.active_date >= c.cohort_date
      GROUP BY c.cohort_date, day_offset
      ORDER BY c.cohort_date, day_offset
    `);
    return (rows.rows as { cohort_date: string; day_offset: number; retained_count: number }[]).map((r) => ({
      cohortDate: r.cohort_date,
      dayOffset: r.day_offset,
      retainedCount: r.retained_count,
    }));
  }

  async getFunnel(): Promise<FunnelStep[]> {
    const steps = [
      { step: 'App Open', eventType: EVENT_TYPES.APP_OPEN },
      { step: 'Search', eventType: EVENT_TYPES.SEARCH },
      { step: 'Route', eventType: EVENT_TYPES.ROUTE_CALCULATED },
      { step: 'Message', eventType: EVENT_TYPES.MESSAGE_SENT },
    ];

    const counts = await Promise.all(
      steps.map(({ eventType }) =>
        this.db.execute<{ count: number }>(sql`
          SELECT COUNT(DISTINCT session_id)::int AS count
          FROM analytics.event WHERE event_type = ${eventType}
        `),
      ),
    );

    return steps.map(({ step, eventType }, i) => {
      const count = (counts[i]!.rows[0] as { count: number } | undefined)?.count ?? 0;
      const prev = i > 0 ? ((counts[i - 1]!.rows[0] as { count: number } | undefined)?.count ?? 0) : null;
      const dropoffRate = prev !== null && prev > 0 ? Math.round((1 - count / prev) * 100) : null;
      return { step, eventType, count, dropoffRate };
    });
  }
}
