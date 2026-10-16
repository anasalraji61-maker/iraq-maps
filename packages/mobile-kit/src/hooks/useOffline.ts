/**
 * useOffline – composite hook exposing network state, pending action count,
 * and sync status to any component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConnectionType,
  isOnline,
  onStatusChange,
  type ConnectionType,
} from '../offline/NetworkMonitor';
import { getQueuedCount } from '../offline/OfflineQueue';
import {
  getSyncStatus,
  onSyncStatusChange,
  triggerSync,
  type SyncStatus,
} from '../offline/SyncManager';

export interface UseOfflineReturn {
  /** true when the device has an active internet connection. */
  isOnline: boolean;
  /** 'wifi' | 'cellular' | 'none' | 'unknown' */
  connectionType: ConnectionType;
  /** Number of actions queued for retry when next online. */
  pendingActionsCount: number;
  /** Current sync status. */
  syncStatus: SyncStatus;
  /** Manually trigger a background sync cycle. */
  triggerSync: () => void;
}

/**
 * Returns real-time network and sync state.
 *
 * @example
 * ```tsx
 * const { isOnline, pendingActionsCount } = useOffline();
 * if (!isOnline) return <OfflineBanner pending={pendingActionsCount} />;
 * ```
 */
export function useOffline(): UseOfflineReturn {
  const [online, setOnline] = useState<boolean>(() => isOnline());
  const [connType, setConnType] = useState<ConnectionType>(() => getConnectionType());
  const [pending, setPending] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());

  // Refresh pending count
  const refreshPending = useCallback(async () => {
    const count = await getQueuedCount();
    setPending(count);
  }, []);

  // Keep a ref so the network callback doesn't close over a stale value
  const refreshPendingRef = useRef(refreshPending);
  refreshPendingRef.current = refreshPending;

  useEffect(() => {
    // Initial pending count
    void refreshPendingRef.current();

    // Subscribe to network changes
    const unsubNetwork = onStatusChange((newOnline, newType) => {
      setOnline(newOnline);
      setConnType(newType);
      // When we come back online the queue will shrink; refresh the count
      void refreshPendingRef.current();
    });

    // Subscribe to sync status changes
    const unsubSync = onSyncStatusChange((s) => {
      setSyncStatus(s);
      // After a sync the queue may have been drained
      void refreshPendingRef.current();
    });

    return () => {
      unsubNetwork();
      unsubSync();
    };
  }, []);

  const trigger = useCallback(() => {
    void triggerSync();
  }, []);

  return {
    isOnline: online,
    connectionType: connType,
    pendingActionsCount: pending,
    syncStatus,
    triggerSync: trigger,
  };
}
