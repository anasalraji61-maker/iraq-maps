/**
 * useInfiniteScroll — infinite scroll / paginated loading hook.
 *
 * Manages paginated data fetching triggered when the user scrolls near
 * the bottom of a list. Works with any list component (FlatList, etc.).
 *
 * Usage:
 *   const { data, loadMore, isLoading, hasMore, reset } = useInfiniteScroll({
 *     fetchPage: async (cursor) => myApi.getPlaces({ cursor }),
 *   });
 *
 *   <FlatList
 *     data={data}
 *     onEndReached={loadMore}
 *     onEndReachedThreshold={0.3}
 *     ListFooterComponent={isLoading ? <Spinner /> : null}
 *   />
 */
import { useCallback, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageResult<T> {
  items: T[];
  /** Next cursor/page token. Null/undefined when no more pages. */
  nextCursor?: string | number | null;
}

export interface InfiniteScrollOptions<T> {
  /** Fetch a page of data. Receives the next cursor (undefined for the first page). */
  fetchPage: (cursor: string | number | undefined) => Promise<PageResult<T>>;
  /** Unique key extractor for deduplication. Default: index-based (no dedup). */
  keyExtractor?: (item: T) => string;
  /** Initial data to show before the first fetch. */
  initialData?: T[];
}

export interface InfiniteScrollResult<T> {
  /** Accumulated items from all pages. */
  data: T[];
  /** Load the next page. Safe to call multiple times (debounced internally). */
  loadMore(): void;
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Whether there are more pages to load. */
  hasMore: boolean;
  /** Error from the last failed fetch. */
  error: Error | null;
  /** Reset back to the first page and reload. */
  reset(): void;
  /** Total number of items loaded. */
  total: number;
  /** True only during the very first load (data is empty). */
  isInitialLoad: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useInfiniteScroll<T>({
  fetchPage,
  keyExtractor,
  initialData = [],
}: InfiniteScrollOptions<T>): InfiniteScrollResult<T> {
  const [data, setData] = useState<T[]>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(initialData.length === 0);

  const cursor = useRef<string | number | undefined>(undefined);
  const inFlight = useRef(false);
  const seenKeys = useRef(new Set<string>());

  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore) return;
    inFlight.current = true;
    setIsLoading(true);
    setError(null);

    fetchPage(cursor.current)
      .then((result) => {
        cursor.current = result.nextCursor ?? undefined;
        setHasMore(result.nextCursor != null);

        setData((prev) => {
          if (!keyExtractor) return [...prev, ...result.items];
          // Deduplicate by key
          const next = result.items.filter((item) => {
            const k = keyExtractor(item);
            if (seenKeys.current.has(k)) return false;
            seenKeys.current.add(k);
            return true;
          });
          return [...prev, ...next];
        });
        setIsInitialLoad(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        setIsLoading(false);
        inFlight.current = false;
      });
  }, [fetchPage, hasMore, keyExtractor]);

  const reset = useCallback(() => {
    cursor.current = undefined;
    seenKeys.current = new Set();
    setData(initialData);
    setHasMore(true);
    setError(null);
    setIsInitialLoad(true);
    inFlight.current = false;
    // Trigger first load after reset
    setIsLoading(false);
  }, [initialData]);

  return {
    data,
    loadMore,
    isLoading,
    hasMore,
    error,
    reset,
    total: data.length,
    isInitialLoad,
  };
}
