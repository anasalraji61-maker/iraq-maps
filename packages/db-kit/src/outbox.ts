import { parseEvent, type DomainEvent, type EventBus, type OutboxPublisher } from '@iraq-maps/contracts';
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
 * Delivers outbox events in `seq` order to an in-process EventBus, or to a BullMQ queue (default `domain-events`) as
 * job `{ name: event.name, data: event, jobId: event.id }`. Polls every `pollIntervalMs` (default 1000) until stop().
 *
 * Exactly once: each event is claimed with FOR UPDATE SKIP LOCKED, delivered, and marked `published_at` in that same
 * transaction, so concurrent relays never deliver the same row. If delivery throws, the transaction rolls back and the
 * event stays pending (and blocks the ones after it) until a later drain succeeds. A crash between delivery and commit
 * re-delivers on the next drain; BullMQ then drops the duplicate because the jobId already exists.
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
      const { rows } = await tx.execute<{ seq: string; event: DomainEvent }>(
        sql`SELECT seq, event FROM platform.outbox WHERE published_at IS NULL ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const [row] = rows;
      if (!row) return false;
      await deliver(row.event);
      await tx.execute(sql`UPDATE platform.outbox SET published_at = now() WHERE seq = ${row.seq}`);
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
