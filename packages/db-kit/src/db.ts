import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createLogger } from '@iraq-maps/observability';
import pg from 'pg';

const log = createLogger({ name: 'db' });

export type Db = NodePgDatabase<Record<string, unknown>>;
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(url: string): { db: Db; close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url });
  // An idle client dies on a database restart or failover; without a listener that 'error' event crashes the process.
  // The pool replaces the client. Only the SQLSTATE is logged: driver messages can carry data.
  pool.on('error', (err: Error & { code?: string }) => log.warn({ pgCode: err.code }, 'idle pg client error'));
  return { db: drizzle<Record<string, unknown>>(pool), close: () => pool.end() };
}

/** Runs `fn` on a dedicated connection (for DDL, advisory locks and CREATE/DROP DATABASE). */
export async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
