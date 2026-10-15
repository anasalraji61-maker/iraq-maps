import type { Job } from 'bullmq';
import type { GenerateProviderInsightsData, GenerateProviderInsightsResult } from '@iraq-maps/job-kit';
import type { Logger } from '@iraq-maps/observability';

/**
 * Processor: generates view/inquiry aggregates for providers for the past 7 days.
 * Upserts into insights.provider_daily_summary.
 */
export async function processGenerateProviderInsights(
  job: Job<GenerateProviderInsightsData, GenerateProviderInsightsResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("drizzle-orm/node-postgres").NodePgDatabase<any>,
  log?: Logger,
): Promise<GenerateProviderInsightsResult> {
  const { sql } = await import('drizzle-orm');
  const providerId = job.data.providerId;

  const filter = providerId ? sql`WHERE p.id = ${providerId}` : sql`WHERE true`;
  const res = await db.execute(sql`
    INSERT INTO insights.provider_daily_summary (provider_id, date, view_count, inquiry_count, computed_at)
    SELECT
      p.id AS provider_id,
      current_date AS date,
      COALESCE(v.views, 0) AS view_count,
      COALESCE(i.inquiries, 0) AS inquiry_count,
      now() AS computed_at
    FROM providers.provider p
    LEFT JOIN (
      SELECT provider_id, COUNT(*) AS views
      FROM insights.place_view
      WHERE viewed_at >= current_date - interval '7 days'
      GROUP BY provider_id
    ) v ON v.provider_id = p.id
    LEFT JOIN (
      SELECT provider_id, COUNT(*) AS inquiries
      FROM messaging.inquiry
      WHERE created_at >= current_date - interval '7 days'
      GROUP BY provider_id
    ) i ON i.provider_id = p.id
    ${filter}
    ON CONFLICT (provider_id, date) DO UPDATE
      SET view_count = EXCLUDED.view_count,
          inquiry_count = EXCLUDED.inquiry_count,
          computed_at = EXCLUDED.computed_at
  `);
  const generated = (res as unknown as { rowCount: number }).rowCount ?? 0;
  log?.info({ generated, providerId }, 'GenerateProviderInsights complete');
  return { generated };
}
