/**
 * usePullToRefresh — pull-to-refresh state management hook.
 *
 * Returns props to spread onto a ScrollView/FlatList/SectionList:
 *   <ScrollView refreshControl={<RefreshControl {...refreshProps} />} />
 *
 * Also exposes:
 * - isRefreshing: current state.
 * - refresh(): trigger a refresh programmatically.
 * - lastRefreshed: timestamp of the last successful refresh.
 *
 * The caller provides an async `onRefresh` function that resolves when
 * data has been reloaded. The hook handles the loading state automatically.
 */
import { useCallback, useRef, useState } from 'react';
import type { RefreshControlProps } from 'react-native';
import { tokens } from '../tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PullToRefreshOptions {
  /** Async function that fetches new data. */
  onRefresh: () => Promise<void>;
  /** Minimum visible refresh duration in ms. Default: 500. */
  minDuration?: number;
  /** Tint color of the spinner. Default: brand primary. */
  tintColor?: string;
  /** Title shown above the spinner (iOS). */
  title?: string;
}

export interface PullToRefreshResult {
  /** Whether a refresh is in progress. */
  isRefreshing: boolean;
  /** Trigger a refresh programmatically. */
  refresh(): Promise<void>;
  /** Timestamp (Date.now()) of the last successful refresh. Null if never refreshed. */
  lastRefreshed: number | null;
  /** Spread these onto RefreshControl. */
  refreshProps: RefreshControlProps;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePullToRefresh({
  onRefresh,
  minDuration = 500,
  tintColor = tokens.color.primary,
  title,
}: PullToRefreshOptions): PullToRefreshResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsRefreshing(true);

    const started = Date.now();
    try {
      await onRefresh();
      setLastRefreshed(Date.now());
    } finally {
      // Enforce minimum visible duration so the spinner doesn't flash
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, minDuration - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
      setIsRefreshing(false);
      inFlight.current = false;
    }
  }, [onRefresh, minDuration]);

  const refreshProps: RefreshControlProps = {
    refreshing: isRefreshing,
    onRefresh: () => { void refresh(); },
    tintColor,
    colors: [tintColor],
    progressBackgroundColor: tokens.color.bg,
    title,
  };

  return { isRefreshing, refresh, lastRefreshed, refreshProps };
}
