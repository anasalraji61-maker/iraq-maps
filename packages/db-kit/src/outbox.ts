import { parseEvent, type DomainEvent, type EventBus, type EventHandler, type EventName, type OutboxPublisher } from '@iraq-maps/contracts';
import { createLogger } from '@iraq-maps/observability';
import { Queue } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { Db, DbTx } from './db';

const log = createLogger({ name: 'outbox-relay' });

/** Writes events into the outbox table (`platform.outbox`) inside the caller's transaction (or on its own without `tx`). */
export function createOutboxPublisher(db: Db): OutboxPublisher<DbTx> {
  return {
    async publish(event, tx) {
      const valid = parseEvent(event);
      await (tx ?? db).execute(sql`INSERT INTO platform.outbox (id, event) VALUES (${valid.id}, ${JSON.stringify(valid)}::jsonb)`);
    },
  };
}

export interface OutboxRelay {
  /** Delivers pending events once; returns how many were delivered. Each event is delivered exactly once. */
  drainOnce(): Promise<number>;
  stop(): Promise<void>;
}

/**
 * In-process EventBus, the relay's target inside apps/api. Handlers run one after another and are awaited, so a
 * throwing handler fails publish() and the relay keeps the event pending. Unsubscribing twice is a no-op.
 */
export function createInProcessEventBus(): EventBus {
  const handlers = new Map<EventName, Set<EventHandler>>();
  return {
    async publish(event) {
      for (const handler of [...(handlers.get(event.name) ?? [])]) await handler(event);
    },
    subscribe(name, handler) {
      const set = handlers.get(name) ?? new Set();
      handlers.set(name, set.add(handler as EventHandler));
      return () => void set.delete(handler as EventHandler);
    },
  };
}

/** Exponential backoff delays in ms for outbox retry (5s, 25s, 125s). */
const RETRY_DELAYS_MS = [5_000, 25_000, 125_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 4 total: initial + 3 retries

/**
 * Delivers outbox events to an EventBus, or to a BullMQ queue (default `domain-events`) as
 * job `{ name: event.name, data: event, jobId: event.id }`. Polls every `pollIntervalMs` (default 1000) until stop().
 *
 * Exactly once: each event is claimed with FOR UPDATE SKIP LOCKED, delivered, and marked `published_at` in that same
 * transaction, so concurrent relays never deliver the same row. If delivery throws, the transaction rolls back and the
 * event stays pending until a later drain succeeds. A crash between delivery and commit re-delivers on the next drain;
 * BullMQ then drops the duplicate because the jobId already exists.
 *
 * Retry with backoff: failed deliveries increment `attempt_count` and schedule a retry after an exponential delay
 * (5s, 25s, 125s). After MAX_ATTEMPTS failures the event is marked `dead_at` / `dead_reason` and skipped.
 *
 * Order: `seq` order only with a single relay, where a failing event blocks the ones after it. With concurrent relays,
 * one relay can deliver seq+1 while another still holds or has failed seq.
 */
export function startOutboxRelay({ db, target, pollIntervalMs = 1000 }: {
  db: Db;
  target: { bus: EventBus } | { redisUrl: string; queue?: string };
  pollIntervalMs?: number;
}): OutboxRelay {
  const queue = 'bus' in target ? undefined : new Queue(target.queue ?? 'domain-events', { connection: { url: target.redisUrl } });
  queue?.on('error', (err) => log.error({ err }, 'outbox queue connection error'));
  const deliver = async (event: DomainEvent) => {
    if (queue) await queue.add(event.name, event, { jobId: event.id, removeOnComplete: { age: 24 * 3600 } });
    else if ('bus' in target) await target.bus.publish(event);
  };
  const deliverNext = () =>
    db.transaction(async (tx) => {
      const { rows } = await tx.execute<{ seq: string; event: DomainEvent; attempt_count: number }>(
        sql`SELECT seq, event, attempt_count FROM platform.outbox
            WHERE published_at IS NULL AND dead_at IS NULL
              AND (attempt_count = 0 OR created_at + (ARRAY[5,25,125][attempt_count] * INTERVAL '1 second') < now())
            ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const [row] = rows;
      if (!row) return false;
      try {
        await deliver(row.event);
        await tx.execute(sql`UPDATE platform.outbox SET published_at = now() WHERE seq = ${row.seq}`);
      } catch (err: unknown) {
        const attempts = (row.attempt_count ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          const reason = err instanceof Error ? err.message : String(err);
          await tx.execute(
            sql`UPDATE platform.outbox SET attempt_count = ${attempts}, dead_at = now(), dead_reason = ${reason} WHERE seq = ${row.seq}`,
          );
          log.error({ seq: row.seq, eventId: row.event.id, eventName: row.event.name, reason }, 'outbox event marked dead after max retries');
        } else {
          await tx.execute(sql`UPDATE platform.outbox SET attempt_count = ${attempts} WHERE seq = ${row.seq}`);
          log.warn({ seq: row.seq, eventId: row.event.id, attempt: attempts }, 'outbox delivery failed; will retry');
        }
        // Return false (not re-throw) so the transaction commits the attempt_count / dead_at update
        // while not marking the event as published. The event will be retried after the backoff delay.
        return false;
      }
      return true;
    });
  const drainOnce = async () => {
    let delivered = 0;
    while (await deliverNext()) delivered++;
    return delivered;
  };

  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();
  const poll = () => {
    running = drainOnce()
      .catch((err: unknown) => log.error({ err }, 'outbox delivery failed; retrying on the next poll'))
      .finally(() => {
        if (!stopped) timer = setTimeout(poll, pollIntervalMs);
      });
  };
  let timer = setTimeout(poll, pollIntervalMs);

  return {
    drainOnce,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
      await queue?.close();
    },
  };
}
