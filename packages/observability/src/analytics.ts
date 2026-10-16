/**
 * Client-side analytics tracker for Iraq Smart Maps.
 *
 * All events are sent to our own backend — no third-party SDKs.
 * PII is stripped before anything leaves the device.
 *
 * Usage:
 *   const tracker = createAnalyticsTracker({ endpoint: '/analytics/events' });
 *   tracker.identify('user-id', { locale: 'ar' });
 *   tracker.track('place_viewed', { placeId: '123', category: 'restaurant' });
 */

// ── PII scrubbing ──────────────────────────────────────────────────────────────

/** Iraqi mobile: +9647xxxxxxxx, 9647xxxxxxxx, 07xxxxxxxx */
const PHONE_RE = /(?<!\w)(?:\+?964|0)7\d{9}(?!\w)/g;
/** JWT header.payload.signature */
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;
/** Email addresses */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** National ID (13 digits) */
const NATIONAL_ID_RE = /\b\d{13}\b/g;

const PII_KEYS = new Set([
  'phone', 'email', 'password', 'token', 'authorization',
  'accesstoken', 'refreshtoken', 'name', 'fullname', 'address',
  'nationalid', 'passport', 'ip', 'ipaddress',
]);

function scrubString(value: string): string {
  return value
    .replace(PHONE_RE, '[phone]')
    .replace(JWT_RE, '[jwt]')
    .replace(EMAIL_RE, '[email]')
    .replace(NATIONAL_ID_RE, '[id]');
}

function scrubValue(key: string, value: unknown): unknown {
  const k = key.toLowerCase().replace(/[-_\s]/g, '');
  if (PII_KEYS.has(k)) return '[redacted]';
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map((v, i) => scrubValue(String(i), v));
  if (typeof value === 'object') return scrubObject(value as Record<string, unknown>);
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = scrubValue(k, v);
  }
  return out;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type EventProperties = Record<string, unknown>;

export interface AnalyticsEvent {
  /** Event name, e.g. 'place_viewed', 'search_completed' */
  event: string;
  /** Scrubbed properties */
  properties: EventProperties;
  /** ISO8601 timestamp */
  timestamp: string;
  /** Anonymous session identifier */
  sessionId: string;
  /** Sequential event index within the session */
  sequence: number;
  /** Identified user, if any */
  userId?: string;
  /** Active provider context, if any */
  groupId?: string;
  /** Current screen name */
  screen?: string;
}

export interface PageEvent {
  name: string;
  properties: EventProperties;
  timestamp: string;
  sessionId: string;
  sequence: number;
  userId?: string;
}

export interface DeviceInfo {
  platform: string;
  osVersion: string;
  appVersion: string;
  locale: string;
  timezone: string;
  /** Screen width × height in density-independent pixels */
  screenDp: string;
}

export interface AnalyticsBatch {
  events: AnalyticsEvent[];
  device: DeviceInfo;
  sentAt: string;
}

export interface AnalyticsTrackerOptions {
  /** Backend endpoint that accepts POST with AnalyticsBatch JSON body */
  endpoint: string;
  /** Max events to buffer before forcing a flush (default: 20) */
  maxBatchSize?: number;
  /** Flush interval in milliseconds (default: 10_000) */
  flushIntervalMs?: number;
  /** Persistent storage adapter for offline queue (default: in-memory) */
  storage?: AnalyticsStorage;
  /** Device info supplier */
  deviceInfo?: () => DeviceInfo;
  /** Optional fetch override for testing */
  fetch?: typeof globalThis.fetch;
  /** Called when a batch fails to send; for logging */
  onError?: (err: unknown) => void;
}

/** Minimal async storage API (compatible with AsyncStorage from React Native) */
export interface AnalyticsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// ── In-memory storage fallback ─────────────────────────────────────────────────

class MemoryStorage implements AnalyticsStorage {
  private readonly map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.map.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.map.set(key, value); }
  async removeItem(key: string): Promise<void> { this.map.delete(key); }
}

// ── Session management ─────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes idle = new session
const SESSION_KEY = 'analytics_session';
const OFFLINE_QUEUE_KEY = 'analytics_offline_queue';
const USER_KEY = 'analytics_user';
const GROUP_KEY = 'analytics_group';

interface SessionData {
  id: string;
  startedAt: number;
  lastActivityAt: number;
}

function generateId(): string {
  // Deterministic enough for analytics; no crypto needed here
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ── Default device info ────────────────────────────────────────────────────────

function defaultDeviceInfo(): DeviceInfo {
  return {
    platform: typeof navigator !== 'undefined' ? (navigator.userAgent ?? 'unknown') : 'node',
    osVersion: 'unknown',
    appVersion: '1.0.0',
    locale: typeof navigator !== 'undefined' ? (navigator.language ?? 'ar') : 'ar',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenDp: '0x0',
  };
}

// ── Tracker ────────────────────────────────────────────────────────────────────

export class AnalyticsTracker {
  private readonly endpoint: string;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly storage: AnalyticsStorage;
  private readonly getDeviceInfo: () => DeviceInfo;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly onError: (err: unknown) => void;

  // In-memory queue for current session
  private queue: AnalyticsEvent[] = [];
  private sequence = 0;

  // Session
  private session: SessionData | null = null;

  // Identity
  private userId?: string;
  private userTraits: EventProperties = {};

  // Provider context
  private groupId?: string;
  private groupTraits: EventProperties = {};

  // Current screen
  private currentScreen?: string;

  // Flush timer
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  // Offline queue (events that failed to send)
  private offlineQueue: AnalyticsBatch[] = [];

  // Whether we are currently sending
  private sending = false;

  constructor(opts: AnalyticsTrackerOptions) {
    this.endpoint = opts.endpoint;
    this.maxBatchSize = opts.maxBatchSize ?? 20;
    this.flushIntervalMs = opts.flushIntervalMs ?? 10_000;
    this.storage = opts.storage ?? new MemoryStorage();
    this.getDeviceInfo = opts.deviceInfo ?? defaultDeviceInfo;
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.onError = opts.onError ?? (() => undefined);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the flush timer and restore persisted data. Call once at app start. */
  async start(): Promise<void> {
    await this._restoreSession();
    await this._restoreUser();
    await this._restoreGroup();
    await this._restoreOfflineQueue();

    // Flush any offline events from previous sessions
    await this._flushOfflineQueue();

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  /** Stop timer, flush remaining events, persist offline queue. */
  async stop(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  // ── Core API ──────────────────────────────────────────────────────────────

  /**
   * Track a user action.
   * @param event  Event name (snake_case recommended)
   * @param properties  Additional context; PII is auto-scrubbed
   */
  track(event: string, properties: EventProperties = {}): void {
    const session = this._touchSession();
    this.queue.push({
      event,
      properties: scrubObject({ ...properties, screen: this.currentScreen }),
      timestamp: new Date().toISOString(),
      sessionId: session.id,
      sequence: ++this.sequence,
      userId: this.userId,
      groupId: this.groupId,
      screen: this.currentScreen,
    });

    if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /**
   * Identify the current user.
   * Traits are merged (not replaced) with previous identify calls.
   */
  identify(userId: string, traits: EventProperties = {}): void {
    this.userId = userId;
    this.userTraits = { ...this.userTraits, ...scrubObject(traits) };
    void this._persistUser();
    this.track('identify', { userId, traits: this.userTraits });
  }

  /**
   * Record a page/screen view.
   */
  page(name: string, properties: EventProperties = {}): void {
    this.currentScreen = name;
    this.track('page_view', { page: name, ...properties });
  }

  /**
   * Set the active provider context (e.g. when viewing a business profile).
   */
  group(providerId: string, traits: EventProperties = {}): void {
    this.groupId = providerId;
    this.groupTraits = { ...scrubObject(traits) };
    void this._persistGroup();
    this.track('group', { providerId, traits: this.groupTraits });
  }

  /** Clear provider context */
  clearGroup(): void {
    this.groupId = undefined;
    this.groupTraits = {};
    void this.storage.removeItem(GROUP_KEY);
  }

  /**
   * Reset identity (e.g. on sign-out). Clears userId and groupId.
   */
  reset(): void {
    this.userId = undefined;
    this.userTraits = {};
    this.groupId = undefined;
    this.groupTraits = {};
    this.session = null;
    void this.storage.removeItem(USER_KEY);
    void this.storage.removeItem(GROUP_KEY);
    void this.storage.removeItem(SESSION_KEY);
    void this.flush();
  }

  /**
   * Flush the in-memory queue to the backend.
   * Events that fail are appended to the offline queue.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0 || this.sending) return;
    this.sending = true;
    const batch = this.queue.splice(0, this.queue.length);
    const payload: AnalyticsBatch = {
      events: batch,
      device: this.getDeviceInfo(),
      sentAt: new Date().toISOString(),
    };

    const sent = await this._sendBatch(payload);
    if (!sent) {
      // Save to offline queue
      this.offlineQueue.push(payload);
      if (this.offlineQueue.length > 50) {
        // Evict oldest
        this.offlineQueue.shift();
      }
      await this._persistOfflineQueue();
    }
    this.sending = false;
  }

  // ── Session internals ─────────────────────────────────────────────────────

  private _touchSession(): SessionData {
    const now = Date.now();
    if (
      this.session === null ||
      now - this.session.lastActivityAt > SESSION_DURATION_MS
    ) {
      this.session = {
        id: generateId(),
        startedAt: now,
        lastActivityAt: now,
      };
      void this._persistSession();
    } else {
      this.session.lastActivityAt = now;
    }
    return this.session;
  }

  private async _restoreSession(): Promise<void> {
    try {
      const raw = await this.storage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SessionData;
        const now = Date.now();
        if (now - s.lastActivityAt < SESSION_DURATION_MS) {
          this.session = s;
        }
      }
    } catch { /* ignore */ }
  }

  private async _persistSession(): Promise<void> {
    if (!this.session) return;
    try {
      await this.storage.setItem(SESSION_KEY, JSON.stringify(this.session));
    } catch { /* ignore */ }
  }

  // ── Identity internals ────────────────────────────────────────────────────

  private async _restoreUser(): Promise<void> {
    try {
      const raw = await this.storage.getItem(USER_KEY);
      if (raw) {
        const u = JSON.parse(raw) as { userId: string; traits: EventProperties };
        this.userId = u.userId;
        this.userTraits = u.traits;
      }
    } catch { /* ignore */ }
  }

  private async _persistUser(): Promise<void> {
    try {
      await this.storage.setItem(USER_KEY, JSON.stringify({ userId: this.userId, traits: this.userTraits }));
    } catch { /* ignore */ }
  }

  private async _restoreGroup(): Promise<void> {
    try {
      const raw = await this.storage.getItem(GROUP_KEY);
      if (raw) {
        const g = JSON.parse(raw) as { groupId: string; traits: EventProperties };
        this.groupId = g.groupId;
        this.groupTraits = g.traits;
      }
    } catch { /* ignore */ }
  }

  private async _persistGroup(): Promise<void> {
    try {
      await this.storage.setItem(GROUP_KEY, JSON.stringify({ groupId: this.groupId, traits: this.groupTraits }));
    } catch { /* ignore */ }
  }

  // ── Offline queue internals ───────────────────────────────────────────────

  private async _restoreOfflineQueue(): Promise<void> {
    try {
      const raw = await this.storage.getItem(OFFLINE_QUEUE_KEY);
      if (raw) {
        this.offlineQueue = JSON.parse(raw) as AnalyticsBatch[];
      }
    } catch { /* ignore */ }
  }

  private async _persistOfflineQueue(): Promise<void> {
    try {
      await this.storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.offlineQueue));
    } catch { /* ignore */ }
  }

  private async _flushOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) return;
    const toSend = this.offlineQueue.slice();
    this.offlineQueue = [];
    await this.storage.removeItem(OFFLINE_QUEUE_KEY);
    for (const batch of toSend) {
      const sent = await this._sendBatch(batch);
      if (!sent) {
        this.offlineQueue.push(batch);
      }
    }
    if (this.offlineQueue.length > 0) {
      await this._persistOfflineQueue();
    }
  }

  // ── HTTP send ─────────────────────────────────────────────────────────────

  private async _sendBatch(batch: AnalyticsBatch): Promise<boolean> {
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
      });
      return res.ok;
    } catch (err) {
      this.onError(err);
      return false;
    }
  }

  // ── Accessors (for testing) ───────────────────────────────────────────────

  getQueueSize(): number { return this.queue.length; }
  getOfflineQueueSize(): number { return this.offlineQueue.length; }
  getCurrentSession(): SessionData | null { return this.session; }
  getCurrentUserId(): string | undefined { return this.userId; }
  getCurrentGroupId(): string | undefined { return this.groupId; }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createAnalyticsTracker(opts: AnalyticsTrackerOptions): AnalyticsTracker {
  return new AnalyticsTracker(opts);
}

// ── Common event helpers ───────────────────────────────────────────────────────

/** Shorthand events used throughout the app */
export const AnalyticsEvents = {
  // Map
  MAP_OPENED: 'map_opened',
  MAP_MOVED: 'map_moved',
  MAP_ZOOMED: 'map_zoomed',
  PLACE_TAPPED: 'place_tapped',
  PLACE_VIEWED: 'place_viewed',
  PLACE_SAVED: 'place_saved',
  PLACE_UNSAVED: 'place_unsaved',
  PLACE_SHARED: 'place_shared',
  PLACE_REVIEW_STARTED: 'place_review_started',
  PLACE_REVIEW_SUBMITTED: 'place_review_submitted',

  // Navigation
  NAVIGATION_STARTED: 'navigation_started',
  NAVIGATION_COMPLETED: 'navigation_completed',
  NAVIGATION_CANCELLED: 'navigation_cancelled',
  NAVIGATION_REROUTED: 'navigation_rerouted',
  ROUTE_OPTION_SELECTED: 'route_option_selected',

  // Search
  SEARCH_OPENED: 'search_opened',
  SEARCH_QUERY_SUBMITTED: 'search_query_submitted',
  SEARCH_RESULT_TAPPED: 'search_result_tapped',
  SEARCH_RESULT_EMPTY: 'search_result_empty',
  SEARCH_ABANDONED: 'search_abandoned',

  // Assistant
  ASSISTANT_OPENED: 'assistant_opened',
  ASSISTANT_MESSAGE_SENT: 'assistant_message_sent',
  ASSISTANT_RESPONSE_RECEIVED: 'assistant_response_received',
  ASSISTANT_PLACE_TAPPED: 'assistant_place_tapped',
  ASSISTANT_CONVERSATION_ENDED: 'assistant_conversation_ended',

  // Messaging
  MESSAGE_THREAD_OPENED: 'message_thread_opened',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_TEMPLATE_USED: 'message_template_used',
  PROVIDER_CONTACT_ATTEMPTED: 'provider_contact_attempted',

  // Discover
  DISCOVER_FEED_OPENED: 'discover_feed_opened',
  DISCOVER_POST_VIEWED: 'discover_post_viewed',
  DISCOVER_POST_LIKED: 'discover_post_liked',
  DISCOVER_POST_COMMENTED: 'discover_post_commented',
  DISCOVER_POST_SHARED: 'discover_post_shared',
  DISCOVER_POST_CREATED: 'discover_post_created',

  // Account
  SIGN_IN_STARTED: 'sign_in_started',
  SIGN_IN_COMPLETED: 'sign_in_completed',
  SIGN_OUT: 'sign_out',
  ACCOUNT_DELETED: 'account_deleted',
  PROFILE_UPDATED: 'profile_updated',
  SETTINGS_CHANGED: 'settings_changed',

  // Provider
  PROVIDER_PROFILE_VIEWED: 'provider_profile_viewed',
  PROVIDER_REGISTERED: 'provider_registered',
  PROVIDER_HOURS_VIEWED: 'provider_hours_viewed',
  PROVIDER_PHOTOS_VIEWED: 'provider_photos_viewed',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
} as const;

export type AnalyticsEventName = typeof AnalyticsEvents[keyof typeof AnalyticsEvents];
