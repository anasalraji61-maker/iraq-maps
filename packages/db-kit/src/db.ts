import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export type Db = NodePgDatabase<Record<string, unknown>>;
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(url: string): { db: Db; close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url });
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
