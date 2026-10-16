import { withClient } from './db';

export interface MigrationRecord {
  name: string;
  appliedAt: Date;
}

export interface SchemaStatus {
  schema: string;
  applied: MigrationRecord[];
  /** True when the _migrations table is present and at least one migration has been applied. */
  initialized: boolean;
}

/**
 * Read-only view of which migrations have been applied for one or more schemas.
 * Useful for health checks, admin dashboards and CI readiness gates.
 *
 * This class never applies or rolls back migrations — that is `runModuleMigrations`'s job.
 */
export class SchemaVersionManager {
  constructor(private readonly url: string) {}

  /**
   * Returns the list of applied migrations for `schema`, or an empty array when the
   * `_migrations` tracking table does not yet exist.
   */
  async getApplied(schema: string): Promise<MigrationRecord[]> {
    if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error(`invalid schema name: ${schema}`);

    return withClient(this.url, async (client) => {
      // Check the table exists before querying it to avoid throwing on a fresh DB
      const { rows: exists } = await client.query<{ exists: boolean }>(
        `SELECT to_regclass($1) IS NOT NULL AS exists`,
        [`${schema}._migrations`],
      );
      if (!exists[0]?.exists) return [];

      const { rows } = await client.query<{ name: string; applied_at: Date }>(
        `SELECT name, applied_at FROM ${schema}._migrations ORDER BY applied_at ASC, name ASC`,
      );
      return rows.map((r) => ({ name: r.name, appliedAt: r.applied_at }));
    });
  }

  /**
   * Returns status for all provided schemas in a single database connection.
   */
  async getStatus(schemas: readonly string[]): Promise<SchemaStatus[]> {
    return withClient(this.url, async (client) => {
      const results: SchemaStatus[] = [];
      for (const schema of schemas) {
        if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error(`invalid schema name: ${schema}`);

        const { rows: exists } = await client.query<{ exists: boolean }>(
          `SELECT to_regclass($1) IS NOT NULL AS exists`,
          [`${schema}._migrations`],
        );
        if (!exists[0]?.exists) {
          results.push({ schema, applied: [], initialized: false });
          continue;
        }

        const { rows } = await client.query<{ name: string; applied_at: Date }>(
          `SELECT name, applied_at FROM ${schema}._migrations ORDER BY applied_at ASC, name ASC`,
        );
        const applied = rows.map((r) => ({ name: r.name, appliedAt: r.applied_at }));
        results.push({ schema, applied, initialized: applied.length > 0 });
      }
      return results;
    });
  }

  /**
   * Returns true only when every listed schema has been initialized (at least one
   * migration applied).  Suitable for a readiness probe.
   */
  async allInitialized(schemas: readonly string[]): Promise<boolean> {
    const statuses = await this.getStatus(schemas);
    return statuses.every((s) => s.initialized);
  }
}
