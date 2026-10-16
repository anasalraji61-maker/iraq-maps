/**
 * useRealtimeNotifications – subscribe to real-time notification events.
 *
 * Provides:
 *   unreadCount         – number of unseen notifications
 *   latestNotification  – most recently received notification (null if none)
 *   markAllRead         – reset the unread counter locally
 *
 * Falls back gracefully when WS is disconnected: counts are preserved from
 * the last connected state; a badge poll can be used as HTTP fallback.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeManager, type ConnectionState } from '../websocket/RealtimeManager';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'message'
  | 'mention'
  | 'like'
  | 'comment'
  | 'follow'
  | 'system'
  | 'promo';

export interface Notification {
  id: string;
  type: NotificationType;
  /** i18n key or pre-rendered text; always display via t() if a key */
  titleKey?: string;
  title?: string;
  bodyKey?: string;
  body?: string;
  /** Deep link target, e.g. /messages/conv-123 */
  targetPath?: string;
  imageUrl?: string;
  createdAt: string;
  readAt?: string | null;
}

interface NotificationNewPayload {
  notification: Notification;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseRealtimeNotificationsOptions {
  /** Initial unread count (e.g. from server-side render or HTTP preload) */
  initialUnreadCount?: number;
  /** Max number of notifications to keep in memory */
  maxBufferSize?: number;
}

// ── Return ────────────────────────────────────────────────────────────────────

export interface UseRealtimeNotificationsReturn {
  unreadCount: number;
  latestNotification: Notification | null;
  /** Buffer of recent notifications (newest first) */
  recentNotifications: Notification[];
  /** Reset the local unread counter to 0 */
  markAllRead: () => void;
  /** Decrement unread count by 1 when a notification is tapped */
  markOneRead: (notificationId: string) => void;
  /** Current WS connection state */
  status: ConnectionState;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealtimeNotifications({
  initialUnreadCount = 0,
  maxBufferSize = 50,
}: UseRealtimeNotificationsOptions = {}): UseRealtimeNotificationsReturn {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [latestNotification, setLatestNotification] = useState<Notification | null>(null);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);
  const [status, setStatus] = useState<ConnectionState>('disconnected');

  // Track IDs we've already counted to avoid duplicates on reconnect
  const seenIds = useRef(new Set<string>());

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

  // ── notification.new subscription ────────────────────────────────────────
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;

    const unsub = manager.on<NotificationNewPayload>('notification.new', (event) => {
      const p = event.payload;
      if (!p?.notification) return;
      const notif = p.notification;

      // De-duplicate
      if (seenIds.current.has(notif.id)) return;
      seenIds.current.add(notif.id);

      setLatestNotification(notif);
      setUnreadCount((c) => c + 1);
      setRecentNotifications((prev) => {
        const next = [notif, ...prev];
        return next.length > maxBufferSize ? next.slice(0, maxBufferSize) : next;
      });
    });

    return unsub;
  }, [getManager, maxBufferSize]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const markOneRead = useCallback((notificationId: string) => {
    setUnreadCount((c) => Math.max(0, c - 1));
    setRecentNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
  }, []);

  return {
    unreadCount,
    latestNotification,
    recentNotifications,
    markAllRead,
    markOneRead,
    status,
  };
}
