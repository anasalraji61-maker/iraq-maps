/**
 * RealtimeManager – singleton WebSocket manager.
 *
 * Responsibilities:
 * - Maintain one WebSocket connection per session token
 * - Auto-reconnect with exponential backoff (up to MAX_RETRIES)
 * - Heartbeat ping/pong every 30 s; disconnect if pong not received within 10 s
 * - Queue outbound messages while disconnected; drain on reconnect
 * - Typed event subscription system with multi-subscriber support
 * - Connection state: connecting | connected | reconnecting | disconnected
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

// All event types the server may push
export type RealtimeEventType =
  | 'connected'
  | 'post.liked'
  | 'comment.added'
  | 'user.followed'
  | 'notification.new'
  | 'message.new'
  | 'message.read'
  | 'post.comment.new'
  | 'location.update'
  | 'online.status'
  | 'user.typing.start'
  | 'user.typing.stop';

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  payload?: T;
  userId?: string;
}

export type RealtimeHandler<T = unknown> = (event: RealtimeEvent<T>) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;
export type UnsubscribeFn = () => void;

interface QueuedMessage {
  data: unknown;
  /** Timestamp when queued; stale messages are dropped on drain */
  queuedAt: number;
}

interface RealtimeManagerOptions {
  /** WebSocket base URL, e.g. wss://api.example.com/ws */
  url: string;
  /** Initial backoff in ms (doubles each attempt) */
  initialBackoffMs?: number;
  /** Maximum backoff cap in ms */
  maxBackoffMs?: number;
  /** Max consecutive reconnect attempts before giving up */
  maxRetries?: number;
  /** Heartbeat interval in ms */
  pingIntervalMs?: number;
  /** Pong timeout in ms */
  pongTimeoutMs?: number;
  /** Max age of queued messages in ms (stale ones are dropped on drain) */
  maxQueueAgMs?: number;
  /** Max number of messages in the outbound queue */
  maxQueueSize?: number;
}

// ── RealtimeManager ──────────────────────────────────────────────────────────

export class RealtimeManager {
  // ── Singleton ──────────────────────────────────────────────────────────────
  private static _instance: RealtimeManager | null = null;

  static getInstance(options?: RealtimeManagerOptions): RealtimeManager {
    if (!RealtimeManager._instance) {
      if (!options?.url) throw new Error('RealtimeManager: url is required on first call');
      RealtimeManager._instance = new RealtimeManager(options);
    }
    return RealtimeManager._instance;
  }

  /** Reset the singleton (test helper). */
  static resetInstance(): void {
    RealtimeManager._instance?.destroy();
    RealtimeManager._instance = null;
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  private readonly url: string;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxRetries: number;
  private readonly pingIntervalMs: number;
  private readonly pongTimeoutMs: number;
  private readonly maxQueueAgeMs: number;
  private readonly maxQueueSize: number;

  // ── Runtime state ──────────────────────────────────────────────────────────
  private token: string | null = null;
  private state: ConnectionState = 'disconnected';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ws: any = null;
  private retryCount = 0;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private pongReceived = true;
  private destroyed = false;

  // Outbound queue for messages sent while disconnected
  private queue: QueuedMessage[] = [];

  // Subscribers: event type → array of handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subscribers = new Map<string, Set<RealtimeHandler<any>>>();

  // Connection state subscribers
  private stateSubscribers = new Set<ConnectionStateHandler>();

  private constructor(options: RealtimeManagerOptions) {
    this.url = options.url;
    this.initialBackoffMs = options.initialBackoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 12;
    this.pingIntervalMs = options.pingIntervalMs ?? 30_000;
    this.pongTimeoutMs = options.pongTimeoutMs ?? 10_000;
    this.maxQueueAgeMs = options.maxQueueAgMs ?? 60_000;
    this.maxQueueSize = options.maxQueueSize ?? 100;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call after the user signs in with a fresh JWT. Initiates the connection. */
  connect(token: string): void {
    if (this.destroyed) return;
    this.token = token;
    this.retryCount = 0;
    this._clearBackoffTimer();
    this._openSocket();
  }

  /** Call on sign-out. Closes the socket and clears all state. */
  disconnect(): void {
    this.token = null;
    this._clearPing();
    this._clearBackoffTimer();
    if (this.ws) {
      try { this.ws.close(1000, 'logout'); } catch { /* already closed */ }
      this.ws = null;
    }
    this._setState('disconnected');
  }

  /** Current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /** Whether the socket is currently open. */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function; call it on component unmount.
   */
  on<T = unknown>(type: RealtimeEventType, handler: RealtimeHandler<T>): UnsubscribeFn {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type)!.add(handler as RealtimeHandler);
    return () => {
      this.subscribers.get(type)?.delete(handler as RealtimeHandler);
    };
  }

  /**
   * Subscribe to ALL events.
   * Returns an unsubscribe function.
   */
  onAny(handler: RealtimeHandler): UnsubscribeFn {
    return this.on('*' as RealtimeEventType, handler);
  }

  /** Subscribe to connection state changes. */
  onStateChange(handler: ConnectionStateHandler): UnsubscribeFn {
    this.stateSubscribers.add(handler);
    return () => { this.stateSubscribers.delete(handler); };
  }

  /**
   * Send a message to the server.
   * If disconnected, the message is queued and sent when the connection is restored.
   */
  send(data: unknown): void {
    if (this.destroyed) return;
    if (this.ws?.readyState === 1 /* OPEN */) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch {
        this._enqueue(data);
      }
    } else {
      this._enqueue(data);
    }
  }

  /** Update the token (e.g. after a token refresh). Reconnects if already connected. */
  updateToken(token: string): void {
    if (this.token === token) return;
    this.token = token;
    if (this.state !== 'disconnected') {
      // Reconnect with the new token
      try { this.ws?.close(1000, 'token refresh'); } catch { /* ok */ }
    }
  }

  /** Permanently shut down (for tests or app background). */
  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.subscribers.clear();
    this.stateSubscribers.clear();
    this.queue = [];
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _openSocket(): void {
    if (!this.token || this.destroyed) return;

    this._setState(this.retryCount === 0 ? 'connecting' : 'reconnecting');

    const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this._scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.destroyed) { ws.close(); return; }
      this.retryCount = 0;
      this._setState('connected');
      this._startPing();
      this._drainQueue();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.onmessage = (e: any) => {
      if (typeof e.data !== 'string') return;
      // Server ping/pong is handled via binary frames in most WS libs;
      // some servers also send JSON pings.
      if (e.data === 'pong' || e.data === '__pong__') {
        this.pongReceived = true;
        return;
      }
      try {
        const event = JSON.parse(e.data) as RealtimeEvent;
        this._dispatch(event);
      } catch {
        // Ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (this.destroyed) return;
      this._clearPing();
      this.ws = null;
      if (!this.token) {
        this._setState('disconnected');
        return;
      }
      this._scheduleRetry();
    };

    ws.onerror = () => {
      try { ws.close(); } catch { /* already closed */ }
    };

    // Handle pong frames (native WS protocol level)
    if (typeof ws.addEventListener === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ws.addEventListener('pong' as any, () => { this.pongReceived = true; });
    }
  }

  private _setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const h of this.stateSubscribers) {
      try { h(next); } catch { /* handler errors must not crash the manager */ }
    }
  }

  private _dispatch(event: RealtimeEvent): void {
    // Type-specific handlers
    const handlers = this.subscribers.get(event.type);
    if (handlers) {
      for (const h of handlers) {
        try { h(event); } catch { /* handler errors must not crash manager */ }
      }
    }
    // Wildcard handlers
    const wildcardHandlers = this.subscribers.get('*');
    if (wildcardHandlers) {
      for (const h of wildcardHandlers) {
        try { h(event); } catch { /* ok */ }
      }
    }
  }

  private _enqueue(data: unknown): void {
    if (this.queue.length >= this.maxQueueSize) {
      // Drop oldest message
      this.queue.shift();
    }
    this.queue.push({ data, queuedAt: Date.now() });
  }

  private _drainQueue(): void {
    if (this.queue.length === 0) return;
    if (this.ws?.readyState !== 1 /* OPEN */) return;
    const now = Date.now();
    const fresh = this.queue.filter((m) => now - m.queuedAt < this.maxQueueAgeMs);
    this.queue = [];
    for (const msg of fresh) {
      try {
        this.ws.send(JSON.stringify(msg.data));
      } catch {
        // If send fails, re-enqueue
        this._enqueue(msg.data);
      }
    }
  }

  private _scheduleRetry(): void {
    if (this.retryCount >= this.maxRetries) {
      this._setState('disconnected');
      return;
    }
    this._setState('reconnecting');
    const delay = Math.min(
      this.initialBackoffMs * Math.pow(2, this.retryCount),
      this.maxBackoffMs,
    );
    this.retryCount += 1;
    this.backoffTimer = setTimeout(() => {
      this._openSocket();
    }, delay);
  }

  private _clearBackoffTimer(): void {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  private _startPing(): void {
    this._clearPing();
    this.pongReceived = true;
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== 1 /* OPEN */) return;
      if (!this.pongReceived) {
        // Previous ping was not answered
        try { this.ws.close(1001, 'pong timeout'); } catch { /* ok */ }
        return;
      }
      this.pongReceived = false;
      try {
        // Send JSON ping (server may also use protocol-level ping)
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch { /* ok */ }
      this.pongTimer = setTimeout(() => {
        if (!this.pongReceived) {
          try { this.ws?.close(1001, 'pong timeout'); } catch { /* ok */ }
        }
      }, this.pongTimeoutMs);
    }, this.pingIntervalMs);
  }

  private _clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
    this.pongReceived = true;
  }
}
