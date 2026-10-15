import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef } from 'react';

const QUEUE_KEY = '@iraq-maps/offline-queue';
const MAX_ATTEMPTS = 5;

export interface QueuedAction {
  id: string;
  /** Opaque tag the caller uses to route the retry (e.g. 'likePost', 'savePlace'). */
  tag: string;
  /** Serialisable payload for the retry. */
  payload: unknown;
  queuedAt: number;
  attempts: number;
}

async function loadQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueuedAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* best-effort */ }
}

/** Append an action to the persistent offline queue. */
export async function enqueueOfflineAction(action: Omit<QueuedAction, 'attempts' | 'queuedAt'>): Promise<void> {
  const queue = await loadQueue();
  if (queue.some((a) => a.id === action.id)) return; // idempotent
  queue.push({ ...action, attempts: 0, queuedAt: Date.now() });
  await saveQueue(queue);
}

/** Remove an action (after successful retry). */
export async function dequeueOfflineAction(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((a) => a.id !== id));
}

/**
 * Hook that drains the offline queue whenever the device comes back online.
 *
 * @param handler  Called for each pending action; return true if it succeeded,
 *                 false if it should stay in the queue.
 */
export function useOfflineQueueDrain(
  handler: (action: QueuedAction) => Promise<boolean>,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const drain = useCallback(async () => {
    const queue = await loadQueue();
    const pending = queue.filter((a) => a.attempts < MAX_ATTEMPTS);
    if (pending.length === 0) return;

    const remaining: QueuedAction[] = [];
    for (const action of pending) {
      let success = false;
      try {
        success = await handlerRef.current(action);
      } catch { /* keep it */ }
      if (!success) {
        remaining.push({ ...action, attempts: action.attempts + 1 });
      }
    }
    // Items that exceeded MAX_ATTEMPTS are silently dropped
    await saveQueue(remaining);
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      if (isOnline) void drain();
    });
    return unsub;
  }, [drain]);
}
