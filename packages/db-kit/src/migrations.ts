import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withClient } from './db';

/** Migrations of schema `platform` (the shared outbox). Run them like any module's. */
export const platformMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

const SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;
// Comments and '...' literals are blanked first, so text inside them is never checked.
const COMMENT_OR_STRING = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g;
// The qualifier `a` of every qualified name `a.b` (or "a"."b"); a lookbehind skips the `b` in `a.b.c`.
const QUALIFIER = /(?<![\w$."])"?([A-Za-z_][\w$]*)"?\s*\.\s*"?[A-Za-z_]/g;

/**
 * Schema boundary check, kept lexical and simple: a migration may qualify names only with its own schema
 * (`identity.users`), never with another one (`places.places`, `public.x`, `other.table`), and may not touch
 * `search_path`. Unqualified names land in the module schema (the runner sets search_path to it), so write
 * column references unqualified: table aliases such as `u.id` are rejected too.
 */
function assertOwnSchema(sql: string, schema: string, file: string): void {
  const code = sql.replace(COMMENT_OR_STRING, ' ');
  const foreign = [...code.matchAll(QUALIFIER)].map((m) => m[1]!).filter((q) => q.toLowerCase() !== schema);
  if (foreign.length || /\bsearch_path\b/i.test(code)) {
    throw new Error(`migration ${file} of schema ${schema} references another schema: ${[...new Set(foreign)].join(', ') || 'search_path'}`);
  }
}

/**
 * Applies a module's migrations; rejects any migration that touches a schema other than `schema`.
 * Files are the `*.sql` in `migrationsDir`, applied in name order, each once, tracked in `<schema>._migrations`.
 * All pending files run in one transaction under a per-schema advisory lock, so a rejected or failing file applies nothing.
 */
export async function runModuleMigrations({ url, schema, migrationsDir }: { url: string; schema: string; migrationsDir: string }): Promise<void> {
  if (!SCHEMA_NAME.test(schema)) throw new Error(`invalid schema name: ${schema}`);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  await withClient(url, async (client) => {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`migrations:${schema}`]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema};
        CREATE TABLE IF NOT EXISTS ${schema}._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
        SET LOCAL search_path TO ${schema}, public`);
      const { rows } = await client.query<{ name: string }>(`SELECT name FROM ${schema}._migrations`);
      const applied = new Set(rows.map((r) => r.name));
      for (const file of files.filter((f) => !applied.has(f))) {
        const sql = await readFile(join(migrationsDir, file), 'utf8');
        assertOwnSchema(sql, schema, file);
        await client.query(sql);
        await client.query(`INSERT INTO ${schema}._migrations (name) VALUES ($1)`, [file]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
