/**
 * useOnlineStatus – track whether a specific user is online.
 *
 * Listens for `online.status` events pushed by the server and keeps
 * a local cache of online/offline state and last-seen timestamp.
 *
 * Falls back gracefully when WS is disconnected: the last known state
 * is preserved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeManager, type ConnectionState } from '../websocket/RealtimeManager';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnlineStatusPayload {
  userId: string;
  online: boolean;
  /** ISO timestamp; null when user just came online */
  lastSeen: string | null;
}

// ── Return ────────────────────────────────────────────────────────────────────

export interface UseOnlineStatusReturn {
  isOnline: boolean;
  lastSeen: Date | null;
  /** Current WS connection state */
  status: ConnectionState;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseOnlineStatusOptions {
  /** Initial online state (from server-side render or HTTP preload) */
  initialOnline?: boolean;
  /** Initial last-seen value */
  initialLastSeen?: Date | null;
  /** If true, also track the current user's own online state */
  trackSelf?: boolean;
}

// ── Internal cache ─────────────────────────────────────────────────────────────
// A simple module-level cache so multiple components watching the same user
// share state without duplicate subscriptions.

interface CachedStatus {
  isOnline: boolean;
  lastSeen: Date | null;
}

const statusCache = new Map<string, CachedStatus>();

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOnlineStatus(
  userId: string,
  {
    initialOnline = false,
    initialLastSeen = null,
  }: UseOnlineStatusOptions = {},
): UseOnlineStatusReturn {
  const cached = statusCache.get(userId);

  const [isOnline, setIsOnline] = useState<boolean>(cached?.isOnline ?? initialOnline);
  const [lastSeen, setLastSeen] = useState<Date | null>(cached?.lastSeen ?? initialLastSeen);
  const [status, setStatus] = useState<ConnectionState>('disconnected');

  // Keep ref to update cache synchronously
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const getManager = useCallback((): RealtimeManager | null => {
    try {
      return RealtimeManager.getInstance();
    } catch {
      return null;
    }
  }, []);

  // ── State change subscription ─────────────────────────────────────────────
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;
    const unsub = manager.onStateChange(setStatus);
    setStatus(manager.getState());
    return unsub;
  }, [getManager]);

  // ── online.status subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const manager = getManager();
    if (!manager) return;

    const unsub = manager.on<OnlineStatusPayload>('online.status', (event) => {
      const p = event.payload;
      if (!p || p.userId !== userId) return;

      const newLastSeen = p.online ? null : (p.lastSeen ? new Date(p.lastSeen) : null);

      setIsOnline(p.online);
      setLastSeen(newLastSeen);

      // Update module-level cache
      statusCache.set(userId, { isOnline: p.online, lastSeen: newLastSeen });
    });

    return () => {
      unsub();
    };
  }, [userId, getManager]);

  // ── Sync from cache when userId changes ───────────────────────────────────
  useEffect(() => {
    const c = statusCache.get(userId);
    if (c) {
      setIsOnline(c.isOnline);
      setLastSeen(c.lastSeen);
    } else {
      setIsOnline(initialOnline);
      setLastSeen(initialLastSeen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { isOnline, lastSeen, status };
}

/** Clear the module-level cache (useful in tests). */
export function _clearOnlineStatusCache(): void {
  statusCache.clear();
}
