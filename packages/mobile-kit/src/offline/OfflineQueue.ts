/**
 * OfflineQueue – persists user actions that failed while offline and retries
 * them automatically when the device reconnects.
 *
 * Max queue size: 100 items (oldest are evicted when the cap is exceeded).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onStatusChange } from './NetworkMonitor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_KEY = '@iraq-maps/offline-action-queue-v2';
const MAX_QUEUE_SIZE = 100;
const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionTag =
  | 'create_post'
  | 'like_post'
  | 'unlike_post'
  | 'create_comment'
  | 'send_message'
  | 'save_place'
  | 'unsave_place'
  | 'check_in'
  | 'report_incident'
  | 'submit_review';

export interface QueuedAction {
  id: string;
  tag: ActionTag;
  /** Serialisable payload the caller uses to retry the action. */
  payload: unknown;
  queuedAt: number;
  attempts: number;
  /** Last ISO timestamp when a retry was attempted. */
  lastAttemptAt?: string;
}

export type ActionHandler = (action: QueuedAction) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

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
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Registered handler
// ---------------------------------------------------------------------------

let registeredHandler: ActionHandler | null = null;
let draining = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the handler that will be called to retry each queued action.
 * Should be called once at app startup. Returns an unregister function.
 */
export function registerQueueHandler(handler: ActionHandler): () => void {
  registeredHandler = handler;
  // Wire up auto-drain on reconnect
  const unsubNetwork = onStatusChange(async (online) => {
    if (online) await processQueue();
  });
  return () => {
    registeredHandler = null;
    unsubNetwork();
  };
}

/**
 * Enqueue an action for later retry.
 * Idempotent by action id.
 * Evicts the oldest items when the cap is exceeded.
 */
export async function enqueue(action: Omit<QueuedAction, 'attempts' | 'queuedAt'>): Promise<void> {
  const queue = await loadQueue();
  if (queue.some((a) => a.id === action.id)) return; // idempotent
  const entry: QueuedAction = { ...action, attempts: 0, queuedAt: Date.now() };
  let updated = [...queue, entry];
  if (updated.length > MAX_QUEUE_SIZE) {
    // Evict oldest entries (lowest queuedAt) first
    updated = updated
      .sort((a, b) => a.queuedAt - b.queuedAt)
      .slice(updated.length - MAX_QUEUE_SIZE);
  }
  await saveQueue(updated);
}

/**
 * Returns all pending actions (attempts < MAX_ATTEMPTS).
 */
export async function dequeue(): Promise<QueuedAction[]> {
  const queue = await loadQueue();
  return queue.filter((a) => a.attempts < MAX_ATTEMPTS);
}

/**
 * Remove a successfully retried action by id.
 */
export async function removeAction(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((a) => a.id !== id));
}

/**
 * Process (drain) the queue using the registered handler.
 * Concurrent calls are coalesced into one run.
 */
export async function processQueue(): Promise<{ succeeded: number; failed: number }> {
  if (!registeredHandler || draining) return { succeeded: 0, failed: 0 };
  draining = true;
  let succeeded = 0;
  let failed = 0;
  try {
    const queue = await loadQueue();
    const pending = queue.filter((a) => a.attempts < MAX_ATTEMPTS);
    const keep: QueuedAction[] = [];

    for (const action of pending) {
      let ok = false;
      try {
        ok = await registeredHandler(action);
      } catch {
        ok = false;
      }
      if (ok) {
        succeeded++;
      } else {
        failed++;
        keep.push({
          ...action,
          attempts: action.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
        });
      }
    }

    // Items that already exceeded MAX_ATTEMPTS are dropped
    await saveQueue(keep);
  } finally {
    draining = false;
  }
  return { succeeded, failed };
}

/** Returns the number of actions currently waiting in the queue. */
export async function getQueuedCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.filter((a) => a.attempts < MAX_ATTEMPTS).length;
}

/** Wipe the entire queue (use only in tests or explicit user action). */
export async function clearQueue(): Promise<void> {
  await saveQueue([]);
}
