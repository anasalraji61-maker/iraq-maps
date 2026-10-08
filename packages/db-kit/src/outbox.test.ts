import { randomUUID } from 'node:crypto';
import { parseEvent, type DomainEvent, type EventBus } from '@iraq-maps/contracts';
import { eventBusConformance, InMemoryEventBus, testUserDeleted } from '@iraq-maps/testing';
import { Queue, Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createInProcessEventBus, createOutboxPublisher, createTestDatabase, startOutboxRelay, type OutboxRelay, type TestDatabase } from './index';

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
type Target = Parameters<typeof startOutboxRelay>[0]['target'];

let tdb: TestDatabase;
const cleanup: (() => Promise<unknown>)[] = [];
beforeAll(async () => {
  tdb = await createTestDatabase();
});
beforeEach(() => tdb.db.execute(sql`TRUNCATE platform.outbox`));
afterAll(async () => {
  for (const close of cleanup.reverse()) await close();
  await tdb.drop();
});

const publisher = () => createOutboxPublisher(tdb.db);
const pending = async () => (await tdb.db.execute(sql`SELECT count(*)::int AS n FROM platform.outbox WHERE published_at IS NULL`)).rows[0]!.n;
const ids = (events: DomainEvent[]) => events.map((e) => e.id).sort();
const relay = (target: Target, pollIntervalMs = 60_000) => {
  const r = startOutboxRelay({ db: tdb.db, target, pollIntervalMs });
  cleanup.push(() => r.stop());
  return r;
};
const testQueue = () => {
  const queue = new Queue(`outbox-test-${randomUUID()}`, { connection });
  cleanup.push(() => queue.obliterate({ force: true }).then(() => queue.close()));
  return queue;
};
const consume = (queue: string, handle: (event: DomainEvent) => unknown) => {
  const worker = new Worker(queue, async (job) => void (await handle(parseEvent(job.data))), { connection });
  cleanup.push(() => worker.close());
};
const publishMany = async (n: number) => {
  const events = Array.from({ length: n }, () => testUserDeleted());
  await tdb.db.transaction(async (tx) => {
    for (const event of events) await publisher().publish(event, tx);
  });
  return events;
};
/** Two relays drain the same outbox concurrently; together they must deliver every event once. */
const drainConcurrently = async (target: Target, events: DomainEvent[]) => {
  const [a, b] = [relay(target), relay(target)];
  const counts = await Promise.all([a.drainOnce(), b.drainOnce(), a.drainOnce(), b.drainOnce()]);
  expect(counts.reduce((x, y) => x + y)).toBe(events.length);
  expect(await a.drainOnce()).toBe(0);
  expect(await pending()).toBe(0);
};

describe('createOutboxPublisher', () => {
  it('writes inside the caller transaction, so a rolled-back event is never stored', async () => {
    const failing = tdb.db.transaction(async (tx) => {
      await publisher().publish(testUserDeleted(), tx);
      throw new Error('rollback');
    });
    await expect(failing).rejects.toThrow('rollback');
    expect(await pending()).toBe(0);
    await publisher().publish(testUserDeleted());
    expect(await pending()).toBe(1);
  });

  it('rejects an event whose payload does not match its schema', async () => {
    const bad = { ...testUserDeleted(), payload: { userId: 'not-a-uuid' } } as unknown as DomainEvent;
    await expect(publisher().publish(bad)).rejects.toThrow();
    expect(await pending()).toBe(0);
  });
});

describe('startOutboxRelay', () => {
  it('delivers each event exactly once to the in-process bus across concurrent relays', async () => {
    const events = await publishMany(25);
    const bus = new InMemoryEventBus();
    await drainConcurrently({ bus }, events);
    expect(ids(bus.published)).toEqual(ids(events));
    expect(bus.published).toContainEqual(events[0]);
  });

  it('enqueues each event exactly once in BullMQ across concurrent relays, and dedupes a re-delivery by jobId', async () => {
    const events = await publishMany(25);
    const queue = testQueue();
    await drainConcurrently({ redisUrl: connection.url, queue: queue.name }, events);
    expect(await queue.count()).toBe(25);

    await tdb.db.execute(sql`UPDATE platform.outbox SET published_at = NULL`); // as if the relay crashed before commit
    expect(await relay({ redisUrl: connection.url, queue: queue.name }).drainOnce()).toBe(25);
    expect(await queue.count()).toBe(25);

    const consumed: DomainEvent[] = [];
    consume(queue.name, (event) => consumed.push(event));
    await expect.poll(() => consumed.length).toBe(25);
    await new Promise((r) => setTimeout(r, 100));
    expect(ids(consumed)).toEqual(ids(events));
  });

  it('keeps an event pending when delivery fails and delivers it on a later drain', async () => {
    await publishMany(1);
    const bus = new InMemoryEventBus();
    let down = true;
    bus.subscribe('identity.user.deleted.v1', () => {
      if (down) throw new Error('subscriber down');
    });
    const r = relay({ bus });
    await expect(r.drainOnce()).rejects.toThrow('subscriber down');
    expect(await pending()).toBe(1);
    down = false;
    expect(await r.drainOnce()).toBe(1);
    expect(await pending()).toBe(0);
  });

  it('polls on its own, in outbox order, until stopped', async () => {
    const bus = new InMemoryEventBus();
    const r = relay({ bus }, 20);
    const events = await publishMany(3);
    await expect.poll(() => bus.published.length).toBe(3);
    expect(bus.published.map((e) => e.id)).toEqual(events.map((e) => e.id));
    await r.stop();
    await publishMany(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(bus.published).toHaveLength(3);
  });
});

describe('createInProcessEventBus', () => {
  it('unsubscribing twice is a no-op and leaves the other subscribers in place', async () => {
    const bus = createInProcessEventBus();
    const got: string[] = [];
    const off = bus.subscribe('identity.user.deleted.v1', () => void got.push('a'));
    bus.subscribe('identity.user.deleted.v1', () => void got.push('b'));
    off();
    off();
    await bus.publish(testUserDeleted());
    expect(got).toEqual(['b']);
  });

  it('awaits handlers in subscription order and fails publish when one throws', async () => {
    const bus = createInProcessEventBus();
    const got: string[] = [];
    bus.subscribe('identity.user.deleted.v1', async () => {
      await new Promise((r) => setTimeout(r, 10));
      got.push('slow');
    });
    bus.subscribe('identity.user.deleted.v1', () => {
      got.push('fast');
      throw new Error('handler failed');
    });
    await expect(bus.publish(testUserDeleted())).rejects.toThrow('handler failed');
    expect(got).toEqual(['slow', 'fast']);
  });
});

eventBusConformance('createInProcessEventBus', () => createInProcessEventBus());

/** The outbox pipeline seen as an EventBus: publish = write to the outbox + drain; subscribers sit behind the target. */
const viaOutbox = (subscribers: EventBus, r: OutboxRelay): EventBus => ({
  publish: async (event) => {
    await publisher().publish(event);
    await r.drainOnce();
  },
  subscribe: (name, handler) => subscribers.subscribe(name, handler),
});

eventBusConformance('outbox relay to the in-process bus', () => {
  const subscribers = createInProcessEventBus();
  return viaOutbox(subscribers, relay({ bus: subscribers }));
});

eventBusConformance('outbox relay to BullMQ', () => {
  const subscribers = createInProcessEventBus();
  const queue = testQueue();
  consume(queue.name, (event) => subscribers.publish(event));
  return viaOutbox(subscribers, relay({ redisUrl: connection.url, queue: queue.name }));
});
