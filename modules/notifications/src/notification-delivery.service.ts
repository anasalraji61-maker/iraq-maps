/**
 * NotificationDeliveryService
 *
 * Handles push delivery, bulk delivery, scheduled delivery, retry with
 * exponential back-off, a dead-letter queue for permanently failing tokens,
 * delivery-status tracking and quiet-hours enforcement.
 *
 * The Expo Push API is STUBBED — no real HTTP calls are made unless
 * EXPO_PUSH_ENDPOINT is set in env (see packages/config).
 * All retry state is held in-memory; a production deploy would use
 * BullMQ (already in the stack) for durable scheduling.
 */

import type { PushSender, UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { renderNotification, type NotificationLocale, type NotificationTemplateType } from './notification-templates';
import { deviceTable, notificationTable, prefsTable } from './schema';

// ─── Baghdad quiet-hours helpers (same as notifications.service.ts) ──────────

function baghdadHHMM(): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function isQuietNow(start: string, end: string): boolean {
  const now = baghdadHHMM();
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'opened' | 'failed' | 'dead_letter';

export interface DeliveryRecord {
  notificationId: string;
  userId: UserId;
  token: string;
  status: DeliveryStatus;
  attempts: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SendOptions {
  /** BCP-47 locale for template rendering */
  locale?: NotificationLocale;
  /** raw title/body; skip template rendering when provided */
  title?: string;
  body?: string;
  /** extra data payload forwarded to the device */
  data?: Record<string, string>;
  /** absolute time after which the push is no longer worth sending */
  expiresAt?: Date;
  /** set to true to suppress quiet-hours check for time-critical notifications */
  ignoreQuietHours?: boolean;
}

export interface ScheduledEntry {
  id: string;
  userId: UserId;
  type: NotificationTemplateType | string;
  templateData: Record<string, string | number>;
  options: SendOptions;
  sendAt: Date;
  cancelled: boolean;
}

// ─── In-memory delivery tracking (replace with DB table in prod) ─────────────

const deliveryRecords = new Map<string, DeliveryRecord>();

function createDeliveryRecord(
  notificationId: string,
  userId: UserId,
  token: string,
): DeliveryRecord {
  const now = new Date();
  const rec: DeliveryRecord = {
    notificationId,
    userId,
    token,
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  deliveryRecords.set(`${notificationId}:${token}`, rec);
  return rec;
}

function updateDeliveryRecord(
  notificationId: string,
  token: string,
  patch: Partial<DeliveryRecord>,
): void {
  const key = `${notificationId}:${token}`;
  const existing = deliveryRecords.get(key);
  if (existing) {
    Object.assign(existing, patch, { updatedAt: new Date() });
  }
}

// ─── Exponential back-off ─────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 5_000; // 5 s

function nextRetryDelay(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt - 1); // 5 s, 10 s, 20 s
}

// ─── In-memory schedule store ─────────────────────────────────────────────────

let scheduledSeq = 0;
const scheduledEntries = new Map<string, ScheduledEntry>();

function generateScheduledId(): string {
  scheduledSeq += 1;
  return `sched_${Date.now()}_${scheduledSeq}`;
}

// ─── Dead-letter queue ────────────────────────────────────────────────────────

const deadLetterQueue: DeliveryRecord[] = [];

// ─── Main service ─────────────────────────────────────────────────────────────

export class NotificationDeliveryService {
  constructor(
    private readonly db: Db,
    private readonly push: PushSender,
  ) {}

  // ── Single user delivery ──────────────────────────────────────────────────

  /**
   * Send a notification to one user.
   * Uses template rendering when `type` is a valid template key and no raw
   * title/body is provided in options.
   * Respects quiet hours and per-category preferences.
   * Returns the persisted notification row id.
   */
  async sendPush(
    userId: UserId,
    type: NotificationTemplateType | string,
    templateData: Record<string, string | number>,
    options: SendOptions = {},
  ): Promise<string> {
    // ── Resolve content ──
    let title: string;
    let body: string;

    if (options.title && options.body) {
      title = options.title;
      body = options.body;
    } else {
      const locale = options.locale ?? 'ar';
      // isTemplateType guard is not imported here to keep coupling low —
      // we try rendering and fall back to a generic message.
      try {
        const rendered = renderNotification(
          type as NotificationTemplateType,
          templateData,
          locale,
        );
        title = rendered.title;
        body = rendered.body;
      } catch {
        title = String(templateData['title'] ?? 'إشعار');
        body = String(templateData['body'] ?? '');
      }
    }

    // ── Persist notification row ──
    const [row] = await this.db
      .insert(notificationTable)
      .values({
        userId,
        type,
        title,
        body,
        data: options.data ?? null,
        expiresAt: options.expiresAt ?? null,
      })
      .returning({ id: notificationTable.id });

    if (!row) throw new Error('notification insert failed');
    const notificationId = row.id;

    // ── Quiet hours check ──
    if (!options.ignoreQuietHours) {
      const prefs = await this._getFullPrefs(userId);
      if (prefs.quietHoursEnabled && isQuietNow(prefs.quietStart, prefs.quietEnd)) {
        // Notification persisted but push suppressed; it will be visible in the inbox.
        return notificationId;
      }
    }

    // ── Fan out to all registered devices ──
    const devices = await this.db
      .select({ token: deviceTable.token })
      .from(deviceTable)
      .where(eq(deviceTable.userId, userId));

    await Promise.allSettled(
      devices.map((d) =>
        this._deliverWithRetry(notificationId, userId, d.token, { title, body, data: options.data }),
      ),
    );

    return notificationId;
  }

  // ── Bulk delivery ─────────────────────────────────────────────────────────

  /**
   * Send the same notification to many users.
   * Each user is processed independently; failures don't block others.
   * Returns a summary of how many were attempted.
   */
  async sendBulk(
    userIds: UserId[],
    type: NotificationTemplateType | string,
    templateData: Record<string, string | number>,
    options: SendOptions = {},
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      userIds.map((uid) => this.sendPush(uid, type, templateData, options)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') succeeded += 1;
      else failed += 1;
    }

    return { attempted: userIds.length, succeeded, failed };
  }

  // ── Scheduled delivery ────────────────────────────────────────────────────

  /**
   * Schedule a push to be sent at `sendAt`.
   * In production this would be a BullMQ job; here we use an in-memory timer.
   * Returns an opaque schedule id that can be passed to cancelScheduled().
   */
  scheduleNotification(
    userId: UserId,
    type: NotificationTemplateType | string,
    templateData: Record<string, string | number>,
    sendAt: Date,
    options: SendOptions = {},
  ): string {
    const id = generateScheduledId();
    const entry: ScheduledEntry = {
      id,
      userId,
      type,
      templateData,
      options,
      sendAt,
      cancelled: false,
    };
    scheduledEntries.set(id, entry);

    const delayMs = Math.max(0, sendAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      const current = scheduledEntries.get(id);
      if (!current || current.cancelled) return;
      void this.sendPush(userId, type, templateData, options).catch(() => {
        /* scheduled delivery failure: log in prod */
      });
    }, delayMs);

    // Allow the process to exit even with pending timers (dev/test safety).
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as NodeJS.Timeout).unref();
    }

    return id;
  }

  /**
   * Cancel a previously scheduled notification.
   * Returns true if found and cancelled, false if already fired or unknown.
   */
  cancelScheduled(scheduledId: string): boolean {
    const entry = scheduledEntries.get(scheduledId);
    if (!entry || entry.cancelled) return false;
    entry.cancelled = true;
    return true;
  }

  // ── Delivery status tracking ──────────────────────────────────────────────

  /** Mark a notification as opened (called from the mobile client via API). */
  async markOpened(notificationId: string, userId: UserId): Promise<void> {
    await this.db
      .update(notificationTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationTable.id, notificationId),
          eq(notificationTable.userId, userId),
          isNull(notificationTable.readAt),
        ),
      );

    // Update in-memory records for this notification
    for (const [key, rec] of deliveryRecords) {
      if (key.startsWith(`${notificationId}:`)) {
        rec.status = 'opened';
        rec.updatedAt = new Date();
      }
    }
  }

  /** Return delivery records for a notification (for observability / debugging). */
  getDeliveryRecords(notificationId: string): DeliveryRecord[] {
    const result: DeliveryRecord[] = [];
    for (const [key, rec] of deliveryRecords) {
      if (key.startsWith(`${notificationId}:`)) result.push({ ...rec });
    }
    return result;
  }

  /** Return all items currently in the dead-letter queue (copy). */
  getDeadLetterQueue(): DeliveryRecord[] {
    return deadLetterQueue.map((r) => ({ ...r }));
  }

  /**
   * Retry all dead-letter items once.
   * Items that succeed are removed from the dead-letter queue.
   * Returns count of successfully retried items.
   */
  async retryDeadLetter(): Promise<number> {
    let retried = 0;
    const toRetry = [...deadLetterQueue];

    for (const rec of toRetry) {
      try {
        await this.push.send(rec.token, {
          title: '—',
          body: '—',
        });
        const idx = deadLetterQueue.findIndex(
          (r) => r.notificationId === rec.notificationId && r.token === rec.token,
        );
        if (idx !== -1) deadLetterQueue.splice(idx, 1);
        retried += 1;
      } catch {
        /* still failing; leave in DLQ */
      }
    }

    return retried;
  }

  // ── Expiry cleanup ────────────────────────────────────────────────────────

  /** Remove notification rows that are expired. Call from a daily cron. */
  async cleanExpired(): Promise<number> {
    const result = await this.db
      .delete(notificationTable)
      .where(lte(notificationTable.expiresAt, new Date()))
      .returning({ id: notificationTable.id });
    return result.length;
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  /** Return aggregate delivery counts for observability. */
  getDeliveryStats(): {
    total: number;
    byStatus: Record<DeliveryStatus, number>;
    deadLetterCount: number;
  } {
    const byStatus: Record<DeliveryStatus, number> = {
      pending: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
      dead_letter: 0,
    };

    for (const rec of deliveryRecords.values()) {
      byStatus[rec.status] = (byStatus[rec.status] ?? 0) + 1;
    }

    return {
      total: deliveryRecords.size,
      byStatus,
      deadLetterCount: deadLetterQueue.length,
    };
  }

  // ── Category-based helpers ────────────────────────────────────────────────

  /** Send a message notification, respecting the `messages` preference. */
  async sendMessageNotification(
    userId: UserId,
    data: { name: string; preview: string },
    locale: NotificationLocale = 'ar',
  ): Promise<string | null> {
    const prefs = await this._getPrefs(userId);
    if (!prefs.messages) return null;
    return this.sendPush(userId, 'message.new', data, { locale });
  }

  /** Send a follow notification, respecting the `discoverLikes` preference group. */
  async sendFollowNotification(
    userId: UserId,
    data: { name: string },
    locale: NotificationLocale = 'ar',
  ): Promise<string | null> {
    const prefs = await this._getPrefs(userId);
    if (!prefs.discoverLikes) return null;
    return this.sendPush(userId, 'follow.new', data, { locale });
  }

  /** Send a review-response notification, respecting the `statusUpdate` preference. */
  async sendReviewResponseNotification(
    userId: UserId,
    data: { businessName: string },
    locale: NotificationLocale = 'ar',
  ): Promise<string | null> {
    const prefs = await this._getPrefs(userId);
    if (!prefs.statusUpdate) return null;
    return this.sendPush(userId, 'review.response', data, { locale });
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async _deliverWithRetry(
    notificationId: string,
    userId: UserId,
    token: string,
    notification: { title: string; body: string; data?: Record<string, string> },
    attempt = 1,
  ): Promise<void> {
    const rec = createDeliveryRecord(notificationId, userId, token);

    const attemptDelivery = async (currentAttempt: number): Promise<void> => {
      updateDeliveryRecord(notificationId, token, {
        attempts: currentAttempt,
        lastAttemptAt: new Date(),
        status: 'pending',
      });

      try {
        await this.push.send(token, notification);

        updateDeliveryRecord(notificationId, token, { status: 'sent' });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (currentAttempt >= MAX_ATTEMPTS) {
          // Move to dead-letter queue
          updateDeliveryRecord(notificationId, token, {
            status: 'dead_letter',
            errorMessage,
            nextRetryAt: null,
          });
          const finalRec = deliveryRecords.get(`${notificationId}:${token}`);
          if (finalRec) deadLetterQueue.push({ ...finalRec });
          return;
        }

        const delay = nextRetryDelay(currentAttempt);
        const nextRetryAt = new Date(Date.now() + delay);

        updateDeliveryRecord(notificationId, token, {
          status: 'failed',
          errorMessage,
          nextRetryAt,
        });

        // Schedule retry (in-memory; replace with BullMQ in prod)
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => {
            resolve();
          }, delay);
          if (typeof t === 'object' && t !== null && 'unref' in t) {
            (t as NodeJS.Timeout).unref();
          }
        });

        await attemptDelivery(currentAttempt + 1);
      }
    };

    void attemptDelivery(attempt);
    void rec; // suppress unused warning
  }

  private async _getPrefs(userId: UserId) {
    const [row] = await this.db
      .select()
      .from(prefsTable)
      .where(eq(prefsTable.userId, userId));
    return {
      newInquiry: row?.newInquiry ?? true,
      replyReceived: row?.replyReceived ?? true,
      statusUpdate: row?.statusUpdate ?? true,
      discoverLikes: row?.discoverLikes ?? true,
      discoverComments: row?.discoverComments ?? true,
      messages: row?.messages ?? true,
    };
  }

  private async _getFullPrefs(userId: UserId) {
    const [row] = await this.db
      .select()
      .from(prefsTable)
      .where(eq(prefsTable.userId, userId));
    return {
      quietHoursEnabled: row?.quietHoursEnabled ?? false,
      quietStart: row?.quietStart ?? '23:00',
      quietEnd: row?.quietEnd ?? '08:00',
    };
  }

  /** Expose delivery records count for tests. */
  get _deliveryRecordsSize(): number {
    return deliveryRecords.size;
  }

  /** Clear all in-memory state (test helper). */
  _reset(): void {
    deliveryRecords.clear();
    deadLetterQueue.length = 0;
    scheduledEntries.clear();
  }
}
