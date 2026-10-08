import type { EventBus, OutboxPublisher } from '@iraq-maps/contracts';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Db = NodePgDatabase<Record<string, unknown>>;
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(_url: string): { db: Db; close(): Promise<void> } {
  throw new Error('not implemented');
}

/** Applies a module's migrations; rejects any migration that touches a schema other than `schema`. */
export function runModuleMigrations(_opts: { url: string; schema: string; migrationsDir: string }): Promise<void> {
  throw new Error('not implemented');
}

export interface TestDatabase {
  url: string;
  db: Db;
  drop(): Promise<void>;
}

/** Clones an isolated database from a template with postgis + pg_trgm on the local PostgreSQL 16 (no Testcontainers). */
export function createTestDatabase(_opts?: { modules?: { schema: string; migrationsDir: string }[] }): Promise<TestDatabase> {
  throw new Error('not implemented');
}

/** Writes events into the outbox table inside the caller's transaction. */
export function createOutboxPublisher(_db: Db): OutboxPublisher<DbTx> {
  throw new Error('not implemented');
}

export interface OutboxRelay {
  /** Delivers pending events once; returns how many were delivered. Each event is delivered exactly once. */
  drainOnce(): Promise<number>;
  stop(): Promise<void>;
}

export function startOutboxRelay(_opts: {
  db: Db;
  target: { bus: EventBus } | { redisUrl: string; queue?: string };
  pollIntervalMs?: number;
}): OutboxRelay {
  throw new Error('not implemented');
}
