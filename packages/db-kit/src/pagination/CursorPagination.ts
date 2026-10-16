/**
 * Cursor-based pagination helpers for Drizzle ORM queries.
 *
 * Features:
 *  - Opaque base64url cursor encoding (id + createdAt compound key)
 *  - Safe decoding with structured error
 *  - applyCursorToQuery — returns a WHERE fragment for before/after navigation
 *  - Stable ordering: secondary sort by id to handle same-timestamp rows
 *  - Separately cacheable total count (expensive COUNT(*) is optional / deferred)
 *  - Direction support: 'forward' (after cursor) and 'backward' (before cursor)
 */

import { sql, type SQL } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CursorPayload {
  id: string;
  createdAt: string; // ISO 8601
}

export type CursorDirection = 'forward' | 'backward';

export interface CursorPage<T> {
  items: T[];
  /** Cursor pointing past the last item (for the next forward page). */
  nextCursor: string | null;
  /** Cursor pointing before the first item (for the previous page). */
  prevCursor: string | null;
  /** Whether more items exist in the forward direction. */
  hasNextPage: boolean;
  /** Whether more items exist in the backward direction. */
  hasPrevPage: boolean;
  /**
   * Total item count.
   * May be `undefined` when the caller opts out of the COUNT(*) query.
   */
  total?: number;
}

export interface PaginateOptions {
  /** Requested page size (1–100; clamped). */
  limit: number;
  /** Opaque cursor from a previous response, or undefined/null for the first page. */
  cursor?: string | null;
  /** 'forward' = items after the cursor (default); 'backward' = items before. */
  direction?: CursorDirection;
}

// ── Encoding / decoding ────────────────────────────────────────────────────

/**
 * Encodes a compound (id, createdAt) cursor into an opaque base64url string.
 *
 * @param id        Row identifier (UUID or other stable string)
 * @param createdAt Row creation timestamp (Date or ISO string)
 */
export function encodeCursor(id: string, createdAt: Date | string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  const payload: CursorPayload = { id, createdAt: iso };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decodes an opaque cursor back to its payload.
 * Returns `null` on any parse error (never throws) so callers can treat
 * invalid cursors as "start from beginning".
 */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      'createdAt' in parsed &&
      typeof (parsed as CursorPayload).id === 'string' &&
      typeof (parsed as CursorPayload).createdAt === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// ── SQL fragment builder ───────────────────────────────────────────────────

/**
 * Builds a Drizzle SQL WHERE fragment for cursor pagination.
 *
 * Assumes the table has `created_at` (timestamptz) and `id` (text/uuid) columns.
 * The compound ordering (created_at, id) ensures stable ordering even when many
 * rows share the same timestamp.
 *
 * @param cursor    Decoded cursor payload (null = no cursor = first page)
 * @param direction 'forward'  → rows created AFTER the cursor row
 *                  'backward' → rows created BEFORE the cursor row
 * @param createdAtCol  Column name for the creation timestamp (default: 'created_at')
 * @param idCol         Column name for the row id (default: 'id')
 *
 * @returns A SQL fragment to AND into the WHERE clause, or sql`` if no cursor.
 */
export function applyCursorToQuery(
  cursor: CursorPayload | null,
  direction: CursorDirection = 'forward',
  createdAtCol = 'created_at',
  idCol = 'id',
): SQL {
  if (!cursor) return sql``;

  const tsCol = sql.raw(createdAtCol);
  const idC = sql.raw(idCol);
  const ts = cursor.createdAt;
  const id = cursor.id;

  if (direction === 'forward') {
    // Items strictly after cursor: created_at > ts OR (created_at = ts AND id > id)
    return sql`AND (
      ${tsCol} > ${ts}::timestamptz
      OR (${tsCol} = ${ts}::timestamptz AND ${idC} > ${id})
    )`;
  } else {
    // Items strictly before cursor: created_at < ts OR (created_at = ts AND id < id)
    return sql`AND (
      ${tsCol} < ${ts}::timestamptz
      OR (${tsCol} = ${ts}::timestamptz AND ${idC} < ${id})
    )`;
  }
}

/**
 * Builds the ORDER BY fragment matching the cursor direction.
 *
 * Forward pages: ORDER BY created_at ASC, id ASC
 * Backward pages: ORDER BY created_at DESC, id DESC  (reversed; caller re-reverses items)
 */
export function cursorOrderBy(
  direction: CursorDirection = 'forward',
  createdAtCol = 'created_at',
  idCol = 'id',
): SQL {
  const tsCol = sql.raw(createdAtCol);
  const idC = sql.raw(idCol);
  return direction === 'forward'
    ? sql`ORDER BY ${tsCol} ASC, ${idC} ASC`
    : sql`ORDER BY ${tsCol} DESC, ${idC} DESC`;
}

// ── High-level paginator ───────────────────────────────────────────────────

/**
 * Converts a raw list of rows (fetched with limit+1) into a typed CursorPage.
 *
 * @param rows        Raw rows from the DB (fetched with `limit + 1` to detect hasNext)
 * @param opts        The pagination options that produced this result set
 * @param cursorOf    Function that extracts (id, createdAt) from a row for cursor encoding
 * @param total       Optional pre-computed total count
 */
export function buildCursorPage<T extends Record<string, unknown>>(
  rows: T[],
  opts: PaginateOptions,
  cursorOf: (row: T) => { id: string; createdAt: Date | string },
  total?: number,
): CursorPage<T> {
  const limit = Math.max(1, Math.min(100, opts.limit));
  const direction = opts.direction ?? 'forward';

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // For backward pages the DB returned rows in reversed order; un-reverse.
  if (direction === 'backward') items.reverse();

  const firstItem = items[0];
  const lastItem = items[items.length - 1];

  const _nextCursor =
    direction === 'forward' && hasMore && lastItem
      ? encodeCursor(...Object.values(cursorOf(lastItem)) as [string, Date | string])
      : direction === 'forward' && lastItem
        ? null
        : null;

  const _prevCursor =
    direction === 'backward' && hasMore && firstItem
      ? encodeCursor(...Object.values(cursorOf(firstItem)) as [string, Date | string])
      : opts.cursor && firstItem
        ? encodeCursor(...Object.values(cursorOf(firstItem)) as [string, Date | string])
        : null;

  return {
    items,
    nextCursor: direction === 'forward' && hasMore && lastItem
      ? encodeCursor(cursorOf(lastItem).id, cursorOf(lastItem).createdAt)
      : null,
    prevCursor: opts.cursor && firstItem
      ? encodeCursor(cursorOf(firstItem).id, cursorOf(firstItem).createdAt)
      : null,
    hasNextPage: direction === 'forward' ? hasMore : Boolean(opts.cursor),
    hasPrevPage: direction === 'backward' ? hasMore : Boolean(opts.cursor),
    total,
  };
}

// ── Total-count caching helper ─────────────────────────────────────────────

/**
 * Cache key for a paginated list's total count.
 * The total is expensive (COUNT(*)) and changes only on mutations,
 * so it is cached separately with a longer TTL.
 *
 * @param listKey  The same key used for caching the list itself
 */
export function totalCountCacheKey(listKey: string): string {
  return `${listKey}:total`;
}

/**
 * Runs `fn` to fetch the total count, or returns `fallback` if the count
 * request times out after `timeoutMs` ms.
 *
 * Useful when serving pagination with a stale total from cache while a fresh
 * count runs asynchronously.
 */
export async function fetchCountWithTimeout(
  fn: () => Promise<number>,
  timeoutMs = 2_000,
  fallback?: number,
): Promise<number | undefined> {
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs));
  const count = fn().catch(() => fallback);
  const result = await Promise.race([count, timeout]);
  return result;
}
