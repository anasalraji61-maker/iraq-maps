/**
 * ranking-worker.ts
 *
 * BullMQ processor: recalculates provider ranking scores daily.
 *
 * Schedule: 04:00 UTC (see workers/index.ts).
 * Processes all active providers in batches of 100.
 * Emits providers.score.updated.v1 events via the outbox after each batch.
 */

import type { Job } from 'bullmq';
import type { Logger } from '@iraq-maps/observability';
import { ProviderRankingService } from '@iraq-maps/providers';

// ─── Job contract ─────────────────────────────────────────────────────────────

export interface RecalculateProviderScoresData {
  /** Optional: limit to a single provider for targeted recalculation. */
  providerId?: string;
}

export interface RecalculateProviderScoresResult {
  processed: number;
  errors:    number;
  durationMs: number;
}

// ─── Processor ────────────────────────────────────────────────────────────────

/**
 * Main BullMQ processor function.
 *
 * When `job.data.providerId` is set, only that provider is updated.
 * Otherwise all active providers are processed in batches of 100.
 */
export async function processRecalculateProviderScores(
  job: Job<RecalculateProviderScoresData, RecalculateProviderScoresResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import('drizzle-orm/node-postgres').NodePgDatabase<any>,
  log?: Logger,
): Promise<RecalculateProviderScoresResult> {
  const startMs = Date.now();

  log?.info(
    { jobId: job.id, providerId: job.data.providerId ?? 'all' },
    'RecalculateProviderScores started',
  );

  const service = new ProviderRankingService(db, log);
  let processed = 0;
  let errors    = 0;

  if (job.data.providerId) {
    // Single-provider fast path
    try {
      await service.calculateProviderScore(job.data.providerId);
      await emitScoreUpdatedEvent(db, [job.data.providerId], log);
      processed = 1;
    } catch (err) {
      errors = 1;
      log?.error({ err, providerId: job.data.providerId }, 'single-provider score failed');
    }
  } else {
    // Full recalculation via service (batches of 100 internally)
    const result = await service.updateScores();
    processed = result.processed;
    errors    = result.errors;

    // Emit a single summary event after the full run
    if (processed > 0) {
      await emitScoreUpdatedBatchEvent(db, { processed, errors }, log);
    }
  }

  const durationMs = Date.now() - startMs;

  log?.info(
    { jobId: job.id, processed, errors, durationMs },
    'RecalculateProviderScores complete',
  );

  return { processed, errors, durationMs };
}

// ─── Event helpers ────────────────────────────────────────────────────────────

/**
 * Emit providers.score.updated.v1 for a list of provider IDs.
 * Uses the transactional outbox pattern: insert into outbox, the relay
 * picks them up and publishes to the event bus.
 */
async function emitScoreUpdatedEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import('drizzle-orm/node-postgres').NodePgDatabase<any>,
  providerIds: string[],
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');

  try {
    for (const id of providerIds) {
      await db.execute(sql`
        INSERT INTO outbox.event (aggregate_id, event_type, payload, created_at)
        VALUES (
          ${id},
          'providers.score.updated.v1',
          ${JSON.stringify({ providerId: id })}::jsonb,
          now()
        )
      `);
    }
  } catch (err) {
    // Outbox insertion failure should not abort the job – score was saved.
    log?.warn({ err, providerIds }, 'outbox event insertion failed (non-fatal)');
  }
}

async function emitScoreUpdatedBatchEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import('drizzle-orm/node-postgres').NodePgDatabase<any>,
  summary: { processed: number; errors: number },
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');

  try {
    await db.execute(sql`
      INSERT INTO outbox.event (aggregate_id, event_type, payload, created_at)
      VALUES (
        'batch',
        'providers.score.batch_updated.v1',
        ${JSON.stringify({ ...summary, computedAt: new Date().toISOString() })}::jsonb,
        now()
      )
    `);
  } catch (err) {
    log?.warn({ err }, 'batch outbox event insertion failed (non-fatal)');
  }
}
