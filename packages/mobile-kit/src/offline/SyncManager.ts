/**
 * SyncManager – coordinates background synchronisation of cached data and the
 * offline action queue.  It is designed to be started once at app boot and
 * stopped on teardown.
 *
 * It does NOT own any API client; callers register async thunks that perform
 * the actual fetches, keeping this module free of cross-module dependencies.
 */
import { cacheFeed, clearOldCache, type CachedFeedPost } from './OfflineManager';
import { onStatusChange, isOnline } from './NetworkMonitor';
import { processQueue } from './OfflineQueue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type FeedFetcher = () => Promise<CachedFeedPost[]>;
export type UserDataFetcher = () => Promise<{ notificationsCount: number }>;
export type SyncStatusCallback = (status: SyncStatus) => void;

export interface SyncManagerOptions {
  /** Interval between background sync cycles in ms. Default: 5 min. */
  intervalMs?: number;
  /** Called whenever sync status changes. */
  onStatusChange?: SyncStatusCallback;
  /** Async function that fetches the latest feed posts. */
  fetchFeed?: FeedFetcher;
  /** Async function that fetches profile/notification data. */
  fetchUserData?: UserDataFetcher;
}

// ---------------------------------------------------------------------------
// Module-level state (singleton-style; fits RN's single-JS-thread model)
// ---------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setInterval> | null = null;
let networkUnsubscribe: (() => void) | null = null;
let syncing = false;
let statusCallbacks = new Set<SyncStatusCallback>();
let currentStatus: SyncStatus = 'idle';
let latestNotificationsCount = 0;
let opts: Required<SyncManagerOptions> = {
  intervalMs: 5 * 60 * 1000,
  onStatusChange: () => undefined,
  fetchFeed: async () => [],
  fetchUserData: async () => ({ notificationsCount: 0 }),
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function setStatus(s: SyncStatus): void {
  if (s === currentStatus) return;
  currentStatus = s;
  opts.onStatusChange(s);
  for (const cb of statusCallbacks) cb(s);
}

async function runSyncCycle(): Promise<void> {
  if (syncing || !isOnline()) return;
  syncing = true;
  setStatus('syncing');
  try {
    // 1. Drain the offline action queue
    await processQueue();

    // 2. Refresh cached feed
    await syncFeed();

    // 3. Refresh user/notification data
    await syncUserData();

    // 4. Expire stale cache entries
    await clearOldCache();

    setStatus('idle');
  } catch {
    setStatus('error');
  } finally {
    syncing = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the sync manager.
 * Should be called once from the app root.  Idempotent.
 */
export function startSync(options: SyncManagerOptions = {}): void {
  opts = {
    intervalMs: options.intervalMs ?? 5 * 60 * 1000,
    onStatusChange: options.onStatusChange ?? (() => undefined),
    fetchFeed: options.fetchFeed ?? (async () => []),
    fetchUserData: options.fetchUserData ?? (async () => ({ notificationsCount: 0 })),
  };

  if (options.onStatusChange) {
    statusCallbacks.add(options.onStatusChange);
  }

  // Start periodic sync
  if (!syncTimer) {
    syncTimer = setInterval(() => void runSyncCycle(), opts.intervalMs);
  }

  // React to network restoration
  if (!networkUnsubscribe) {
    networkUnsubscribe = onStatusChange(async (online) => {
      if (online) await onNetworkRestored();
    });
  }

  // Kick off an initial sync if already online
  if (isOnline()) {
    void runSyncCycle();
  }
}

/** Stop periodic sync and remove the network listener. */
export function stopSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }
  statusCallbacks.clear();
  setStatus('idle');
}

/** Subscribe to sync status changes.  Returns an unsubscribe function. */
export function onSyncStatusChange(callback: SyncStatusCallback): () => void {
  statusCallbacks.add(callback);
  return () => {
    statusCallbacks.delete(callback);
  };
}

/** Returns the current sync status. */
export function getSyncStatus(): SyncStatus {
  return currentStatus;
}

/** Returns the latest notifications count refreshed during the last sync. */
export function getLatestNotificationsCount(): number {
  return latestNotificationsCount;
}

/**
 * Manually trigger a sync cycle.
 * Safe to call even if the manager hasn't been started.
 */
export async function triggerSync(): Promise<void> {
  await runSyncCycle();
}

/**
 * Called automatically when the network is restored.
 * Drains the queue first, then refreshes cached data.
 */
export async function onNetworkRestored(): Promise<void> {
  await runSyncCycle();
}

/**
 * Sync the feed by calling the registered fetcher and updating the cache.
 * No-ops if no fetcher is registered or the device is offline.
 */
export async function syncFeed(): Promise<void> {
  if (!isOnline()) return;
  try {
    const posts = await opts.fetchFeed();
    if (posts.length > 0) {
      await cacheFeed(posts);
    }
  } catch {
    // non-fatal; cached feed remains valid
  }
}

/**
 * Sync user data (notifications count, profile) by calling the registered fetcher.
 */
export async function syncUserData(): Promise<void> {
  if (!isOnline()) return;
  try {
    const data = await opts.fetchUserData();
    latestNotificationsCount = data.notificationsCount;
  } catch {
    // non-fatal
  }
}
