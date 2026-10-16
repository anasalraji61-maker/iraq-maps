import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './db';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export interface NearbyResult<T extends object> {
  item: T;
  distanceKm: number;
}

export interface BulkInsertResult {
  inserted: number;
}

export interface UpsertResult {
  affected: number;
}

export interface SoftDeleteResult {
  deleted: boolean;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
}

/** Locale keys supported by the i18n normalizer. */
export type Locale = 'ar' | 'ckb' | 'en';

// ── Cursor helpers ─────────────────────────────────────────────────────────

function encodeCursor(value: string | number | Date): string {
  return Buffer.from(String(value instanceof Date ? value.toISOString() : value), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid cursor');
  }
}

// ── QueryBuilder ────────────────────────────────────────────────────────────

/**
 * Collection of composable, type-safe query helpers for common database patterns.
 * All methods are static so they can be used without instantiation, but you may
 * also instantiate the class to carry a bound `db` handle for convenience.
 *
 * SQL injection is prevented by passing all user-supplied values as Drizzle `sql`
 * template parameters, never by string interpolation.
 */
export class QueryBuilder {
  constructor(private readonly db: Db) {}

  // ── Pagination ─────────────────────────────────────────────────────────

  /**
   * Cursor-based pagination using a monotonic column (e.g. `created_at` or `id`).
   * The cursor is an opaque base64url-encoded value of the last row's cursor column.
   *
   * @param tableSql     - Drizzle SQL fragment for the FROM clause, e.g. sql`my_schema.my_table`
   * @param selectSql    - Columns fragment, e.g. sql`id, name, created_at`
   * @param whereSql     - Additional WHERE conditions (ANDed). May be sql`` (empty).
   * @param orderColSql  - The cursor column expression, e.g. sql`created_at`
   * @param orderDir     - 'ASC' or 'DESC'
   * @param cursor       - Opaque cursor from a previous call, or null/undefined for the first page
   * @param limit        - Page size (1-100, clamped)
   * @param cursorColKey - The column name in the returned rows used to build the next cursor
   */
  async paginate<T extends Record<string, unknown>>(
    tableSql: SQL,
    selectSql: SQL,
    whereSql: SQL,
    orderColSql: SQL,
    orderDir: 'ASC' | 'DESC',
    cursor: string | null | undefined,
    limit: number,
    cursorColKey: keyof T & string,
  ): Promise<PaginationResult<T>> {
    const safeLimit = Math.max(1, Math.min(100, limit));

    let cursorCondition = sql``;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      cursorCondition =
        orderDir === 'ASC'
          ? sql`AND ${orderColSql} > ${decoded}::timestamptz`
          : sql`AND ${orderColSql} < ${decoded}::timestamptz`;
    }

    const whereClause = sql`WHERE TRUE ${whereSql} ${cursorCondition}`;
    const orderClause = orderDir === 'ASC' ? sql`ORDER BY ${orderColSql} ASC` : sql`ORDER BY ${orderColSql} DESC`;

    const query = sql`
      SELECT ${selectSql}
      FROM ${tableSql}
      ${whereClause}
      ${orderClause}
      LIMIT ${safeLimit + 1}
    `;

    const { rows } = await this.db.execute(query);
    const typedRows = rows as T[];

    const hasMore = typedRows.length > safeLimit;
    const items = hasMore ? typedRows.slice(0, safeLimit) : typedRows;
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(lastItem[cursorColKey] as string | number | Date)
        : null;

    return { items, nextCursor };
  }

  /**
   * Offset-based pagination. Prefer cursor-based for performance on large tables.
   *
   * @param tableSql  - FROM clause SQL fragment
   * @param selectSql - SELECT columns SQL fragment
   * @param whereSql  - WHERE conditions (may be empty sql``)
   * @param orderSql  - ORDER BY clause (e.g. sql`created_at DESC`)
   * @param page      - 1-indexed page number
   * @param pageSize  - Rows per page (1-100, clamped)
   */
  async paginateOffset<T extends Record<string, unknown>>(
    tableSql: SQL,
    selectSql: SQL,
    whereSql: SQL,
    orderSql: SQL,
    page: number,
    pageSize: number,
  ): Promise<PaginationResult<T> & { page: number; pageSize: number; totalPages: number }> {
    const safeSize = Math.max(1, Math.min(100, pageSize));
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * safeSize;

    const countQuery = sql`SELECT COUNT(*)::int AS total FROM ${tableSql} WHERE TRUE ${whereSql}`;
    const dataQuery = sql`
      SELECT ${selectSql}
      FROM ${tableSql}
      WHERE TRUE ${whereSql}
      ${orderSql}
      LIMIT ${safeSize} OFFSET ${offset}
    `;

    const [countRes, dataRes] = await Promise.all([
      this.db.execute(countQuery),
      this.db.execute(dataQuery),
    ]);

    const total = (countRes.rows[0] as { total: number }).total ?? 0;
    const totalPages = Math.ceil(total / safeSize);

    return {
      items: dataRes.rows as T[],
      nextCursor: safePage < totalPages ? encodeCursor(safePage + 1) : null,
      total,
      page: safePage,
      pageSize: safeSize,
      totalPages,
    };
  }

  // ── Count ──────────────────────────────────────────────────────────────

  /**
   * Wraps a subquery with `SELECT COUNT(*)` to get the total matching rows.
   * Useful when you already have a WHERE fragment and want the total alongside results.
   */
  async withCount(tableSql: SQL, whereSql: SQL): Promise<number> {
    const { rows } = await this.db.execute(
      sql`SELECT COUNT(*)::int AS n FROM ${tableSql} WHERE TRUE ${whereSql}`,
    );
    return (rows[0] as { n: number } | undefined)?.n ?? 0;
  }

  // ── Full-text search ───────────────────────────────────────────────────

  /**
   * Full-text similarity search using `pg_trgm` (`similarity()` + GIN index).
   * Falls back to ILIKE when the query is too short for trigrams.
   *
   * @param tableSql    - schema-qualified table, e.g. sql`places.place`
   * @param selectSql   - columns to return
   * @param columns     - column names to search across (concatenated with space)
   * @param query       - user search string (will be parameterised, never interpolated)
   * @param locale      - drives optional Arabic normalisation note in ordering
   * @param limit       - max rows (1-50)
   * @param threshold   - minimum similarity score (0.0-1.0, default 0.2)
   */
  async search<T extends Record<string, unknown>>(
    tableSql: SQL,
    selectSql: SQL,
    columns: readonly string[],
    query: string,
    locale: Locale = 'ar',
    limit = 20,
    threshold = 0.2,
  ): Promise<SearchResult<T>> {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const trimmed = query.trim();

    if (!trimmed) return { items: [], total: 0 };

    // Build the concat expression for multiple columns
    // e.g.  COALESCE(name_ar,'') || ' ' || COALESCE(name_en,'')
    const concatParts = columns
      .map((c) => `COALESCE(${c}, '')`)
      .join(` || ' ' || `);

    // For very short strings trigrams degrade; use ILIKE instead
    if (trimmed.length < 3) {
      const pattern = `%${trimmed}%`;
      // columns.map((c) => `${c} ILIKE $1`).join(' OR ') -- built below via parameterised sql
      const ilikeSql = sql.raw(`SELECT * FROM (SELECT `) as unknown;
      void ilikeSql;

      // Build safe ILIKE via parameterised sql template
      const colExprs = columns.map((c) => sql.raw(c));
      const conditions = colExprs.map((col) => sql`${col} ILIKE ${pattern}`);
      const orCondition = conditions.reduce((acc, cond) => sql`${acc} OR ${cond}`);

      const { rows } = await this.db.execute(sql`
        SELECT ${selectSql}
        FROM ${tableSql}
        WHERE ${orCondition}
        ORDER BY ${sql.raw(concatParts)} ASC
        LIMIT ${safeLimit}
      `);
      return { items: rows as T[], total: rows.length };
    }

    // Locale hint: Arabic uses a separate similarity weight in pg_trgm
    // (pg_trgm works on Unicode; no special config needed)
    void locale; // reserved for future locale-specific index hints

    const colExpr = sql.raw(concatParts);

    const { rows } = await this.db.execute(sql`
      SELECT ${selectSql},
             similarity(${colExpr}, ${trimmed}) AS _score
      FROM ${tableSql}
      WHERE similarity(${colExpr}, ${trimmed}) > ${threshold}
         OR ${colExpr} ILIKE ${'%' + trimmed + '%'}
      ORDER BY similarity(${colExpr}, ${trimmed}) DESC
      LIMIT ${safeLimit}
    `);

    const items = rows.map(({ _score: _s, ...rest }) => rest) as T[];
    return { items, total: items.length };
  }

  // ── Nearby (PostGIS) ───────────────────────────────────────────────────

  /**
   * Finds rows within `radiusKm` kilometres of a point, ordered by ascending distance.
   * Assumes the table has a `ST_SetSRID(ST_MakePoint(lon, lat), 4326)` geometry or a
   * `geom` column of type `geometry(Point, 4326)`.
   *
   * @param tableSql    - schema-qualified table
   * @param selectSql   - columns to return (do not include geom — distance is appended)
   * @param latCol      - latitude column name (default: 'lat')
   * @param lonCol      - longitude column name (default: 'lon')
   * @param lat         - center latitude
   * @param lng         - center longitude
   * @param radiusKm    - search radius in kilometres
   * @param limit       - max rows (1-200)
   */
  async nearbyQuery<T extends Record<string, unknown>>(
    tableSql: SQL,
    selectSql: SQL,
    latCol: string,
    lonCol: string,
    lat: number,
    lng: number,
    radiusKm: number,
    limit = 50,
  ): Promise<NearbyResult<T>[]> {
    const safeLimit = Math.max(1, Math.min(200, limit));
    const safeRadius = Math.max(0.1, Math.min(500, radiusKm));

    const latC = sql.raw(latCol);
    const lonC = sql.raw(lonCol);

    const { rows } = await this.db.execute(sql`
      SELECT ${selectSql},
             ST_Distance(
               ST_SetSRID(ST_MakePoint(${lonC}, ${latC}), 4326)::geography,
               ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
             ) / 1000 AS distance_km
      FROM ${tableSql}
      WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(${lonC}, ${latC}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${safeRadius * 1000}
      )
      ORDER BY distance_km ASC
      LIMIT ${safeLimit}
    `);

    return rows.map((row) => {
      const typed = row as T & { distance_km: number };
      const { distance_km, ...rest } = typed;
      return { item: rest as unknown as T, distanceKm: distance_km };
    });
  }

  // ── Soft delete ────────────────────────────────────────────────────────

  /**
   * Sets `deleted_at = now()` on a row identified by its primary key.
   * Returns `{ deleted: true }` if a row was updated, `{ deleted: false }` otherwise.
   *
   * @param tableSql - schema-qualified table, e.g. sql`providers.provider`
   * @param idCol    - primary key column name (default: 'id')
   * @param id       - the row's id value
   */
  async softDelete(tableSql: SQL, idCol: string, id: string): Promise<SoftDeleteResult> {
    const idC = sql.raw(idCol);
    const { rows } = await this.db.execute(sql`
      UPDATE ${tableSql}
      SET deleted_at = now()
      WHERE ${idC} = ${id}
        AND deleted_at IS NULL
      RETURNING ${idC}
    `);
    return { deleted: rows.length > 0 };
  }

  // ── Bulk insert ────────────────────────────────────────────────────────

  /**
   * Efficient multi-row INSERT using a single parameterised VALUES list.
   * All rows must have the same keys (taken from the first row).
   * Returns the number of inserted rows.
   *
   * Limitation: maximum ~65,000 parameters per statement (PostgreSQL limit).
   * For larger sets, chunk the input before calling.
   *
   * @param tableSql - schema-qualified table
   * @param rows     - array of plain objects; keys become column names
   */
  async bulkInsert(tableSql: SQL, rows: readonly Record<string, unknown>[]): Promise<BulkInsertResult> {
    if (rows.length === 0) return { inserted: 0 };

    const firstRow = rows[0]!;
    const columns = Object.keys(firstRow);
    if (columns.length === 0) throw new Error('bulkInsert: rows must have at least one column');

    const colsSql = sql.raw(columns.join(', '));

    // Build VALUES rows
    const valueParts: SQL[] = rows.map((row) => {
      const vals = columns.map((col) => sql`${row[col]}`);
      const inner = vals.reduce((a, b) => sql`${a}, ${b}`);
      return sql`(${inner})`;
    });

    const valuesSql = valueParts.reduce((a, b) => sql`${a}, ${b}`);

    const { rows: inserted } = await this.db.execute(sql`
      INSERT INTO ${tableSql} (${colsSql})
      VALUES ${valuesSql}
      RETURNING 1
    `);

    return { inserted: inserted.length };
  }

  /**
   * Chunked bulk insert that automatically splits large arrays into batches
   * to stay within PostgreSQL's parameter limit.
   */
  async bulkInsertChunked(
    tableSql: SQL,
    rows: readonly Record<string, unknown>[],
    chunkSize = 500,
  ): Promise<BulkInsertResult> {
    let total = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { inserted } = await this.bulkInsert(tableSql, chunk);
      total += inserted;
    }
    return { inserted: total };
  }

  // ── Upsert ─────────────────────────────────────────────────────────────

  /**
   * INSERT ... ON CONFLICT DO UPDATE SET for a single row.
   * `conflictKeys` specifies the unique constraint column names for the ON CONFLICT clause.
   * All non-conflict columns from `data` are included in the DO UPDATE SET clause.
   *
   * @param tableSql    - schema-qualified table
   * @param data        - object of column → value pairs
   * @param conflictKeys - column names forming the unique/PK constraint
   */
  async upsert(
    tableSql: SQL,
    data: Record<string, unknown>,
    conflictKeys: readonly string[],
  ): Promise<UpsertResult> {
    const columns = Object.keys(data);
    if (columns.length === 0) throw new Error('upsert: data must have at least one column');

    const colsSql = sql.raw(columns.join(', '));
    const vals = columns.map((col) => sql`${data[col]}`);
    const valuesSql = vals.reduce((a, b) => sql`${a}, ${b}`);

    const conflictCols = sql.raw(conflictKeys.join(', '));

    // Build SET clause for non-conflict columns
    const updateCols = columns.filter((c) => !conflictKeys.includes(c));
    if (updateCols.length === 0) {
      // Nothing to update — just ignore the conflict
      const { rows } = await this.db.execute(sql`
        INSERT INTO ${tableSql} (${colsSql})
        VALUES (${valuesSql})
        ON CONFLICT (${conflictCols}) DO NOTHING
        RETURNING 1
      `);
      return { affected: rows.length };
    }

    const setExprs = updateCols.map((col) => sql`${sql.raw(col)} = EXCLUDED.${sql.raw(col)}`);
    const setSql = setExprs.reduce((a, b) => sql`${a}, ${b}`);

    const { rows } = await this.db.execute(sql`
      INSERT INTO ${tableSql} (${colsSql})
      VALUES (${valuesSql})
      ON CONFLICT (${conflictCols}) DO UPDATE SET ${setSql}
      RETURNING 1
    `);

    return { affected: rows.length };
  }

  // ── Static convenience wrappers ────────────────────────────────────────

  /** Returns a raw SQL fragment that can be embedded in other queries. */
  static buildSimilarityCondition(columns: readonly string[], query: string, threshold = 0.2): SQL {
    const concatParts = columns.map((c) => `COALESCE(${c}, '')`).join(` || ' ' || `);
    const colExpr = sql.raw(concatParts);
    return sql`similarity(${colExpr}, ${query}) > ${threshold}`;
  }

  /** Builds a geography-based bounding-box WHERE fragment. */
  static buildBboxCondition(latCol: string, lonCol: string, lat: number, lng: number, radiusKm: number): SQL {
    const latC = sql.raw(latCol);
    const lonC = sql.raw(lonCol);
    return sql`ST_DWithin(
      ST_SetSRID(ST_MakePoint(${lonC}, ${latC}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${radiusKm * 1000}
    )`;
  }

  /** Cursor encoder exposed for callers that build their own pagination. */
  static encodeCursor = encodeCursor;
  static decodeCursor = decodeCursor;
}
