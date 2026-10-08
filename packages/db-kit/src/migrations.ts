import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withClient } from './db';

/** Migrations of schema `platform` (the shared outbox). Run them like any module's. */
export const platformMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

const SCHEMA_NAME = /^[a-z][a-z0-9_]*$/;
// Checked on the raw file. `$` (dollar quoting) and E'...' strings are rejected because the comment scan below
// cannot lex them; U&"..." escapes could spell any identifier below; search_path, set_config and pg_settings change
// what unqualified names mean.
const RAW_FORBIDDEN = /\$|\bE'|\bU&|search_path|set_config|pg_settings/i;
// Comments, '...' literals and "..." identifiers, scanned left to right. Only comments are blanked: literals stay
// checked because they can be function bodies. PostgreSQL ends a line comment at \n or \r.
const TOKEN = /--[^\n\r]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"/g;
// Checked on the code: any SCHEMA clause (DROP/ALTER/CREATE SCHEMA, SET SCHEMA, IN SCHEMA), dynamic SQL,
// cross-schema ownership and default-privilege commands, extension DDL (extensions live in the template only),
// and session-level statements (DO, SET, RESET, DISCARD).
const CODE_FORBIDDEN =
  /\bSCHEMAS?\b|\bEXECUTE\b|\b(?:DROP|REASSIGN)\s+OWNED\b|\bDEFAULT\s+PRIVILEGES\b|\b(?:CREATE|ALTER|DROP)\s+EXTENSION\b|(?:^|;)\s*(?:DO|SET|RESET|DISCARD)\b/i;

/** The first name before a `.` that is not the module schema. Dots inside numbers (1.5, 1., .5) are skipped. */
function foreignQualifier(code: string, schema: string): string | undefined {
  for (const { index } of code.matchAll(/\./g)) {
    const before = code.slice(0, index);
    if (/(?<!\w)\d+$/.test(before) || (/^\d/.test(code.slice(index + 1)) && !/[\w"]$/.test(before))) continue;
    const name = (/(?:"[^"]*"|\w*)\s*$/.exec(before)?.[0] ?? '').trim();
    if (name.replaceAll('"', '').toLowerCase() !== schema) return `${name}.`;
  }
}

/**
 * Schema boundary check. It is a lexical guardrail against mistakes in reviewed migrations, not a sandbox: per-module
 * database roles are deferred to M7. Outside comments, every `a.b` must have `a` = the module schema (so `other.t`,
 * `public.t`, table aliases like `u.id` and dotted text in literals are rejected), and the patterns above must not appear.
 */
function assertOwnSchema(sql: string, schema: string, file: string): void {
  const code = sql.replace(TOKEN, (token) => (token.startsWith('--') || token.startsWith('/*') ? ' ' : token));
  const violation = RAW_FORBIDDEN.exec(sql)?.[0] ?? CODE_FORBIDDEN.exec(code)?.[0].trim() ?? foreignQualifier(code, schema);
  if (violation !== undefined) throw new Error(`migration ${file} of schema ${schema} breaks the schema boundary: ${violation}`);
}

/**
 * Applies a module's migrations after the lexical schema-boundary guardrail above, which rejects references to other
 * schemas and the constructs that could hide them. It catches mistakes in reviewed migrations; it is not a security
 * boundary (per-module database roles come in M7).
 * Files are the `*.sql` in `migrationsDir`, applied in name order, each once, tracked in `<schema>._migrations`.
 * All pending files run in one transaction under a per-schema advisory lock, so a rejected or failing file applies nothing.
 * search_path is `<schema>, public`: unqualified creates land in the module schema, and `public` only serves extension
 * types and functions (geometry, gin_trgm_ops). `pnpm infra:local up` makes `public` read-only for the dev role.
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
