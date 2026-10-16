/**
 * Crash and error reporter for Iraq Smart Maps.
 *
 * Collects unhandled exceptions, stack traces, breadcrumbs and device
 * context, then sends them to our own backend on the next app launch
 * (if a crash interrupted the current one) or immediately for non-fatal errors.
 *
 * No third-party crash SDK. All reports go to POST /analytics/crashes.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StackFrame {
  file?: string;
  line?: number;
  column?: number;
  function?: string;
  native?: boolean;
  context?: string;
}

export interface ParsedStackTrace {
  message: string;
  frames: StackFrame[];
  raw: string;
}

export interface Breadcrumb {
  type: 'navigation' | 'action' | 'network' | 'info' | 'error';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface NetworkState {
  isConnected: boolean;
  type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
  isInternetReachable: boolean;
}

export interface CrashContext {
  userId?: string;
  screen?: string;
  lastActions: string[];
  breadcrumbs: Breadcrumb[];
  network?: NetworkState;
  extras?: Record<string, unknown>;
}

export interface CrashReport {
  id: string;
  type: 'crash' | 'error' | 'unhandled_rejection';
  error: {
    name: string;
    message: string;
    stack: ParsedStackTrace;
  };
  context: CrashContext;
  deviceInfo: Record<string, unknown>;
  appVersion: string;
  timestamp: string;
  sessionId?: string;
}

export interface CrashReporterOptions {
  /** Backend endpoint for crash reports */
  endpoint: string;
  /** App version string */
  appVersion: string;
  /** Device info supplier */
  deviceInfo?: () => Record<string, unknown>;
  /** Max breadcrumbs to keep (default: 20) */
  maxBreadcrumbs?: number;
  /** Max recent actions to keep (default: 5) */
  maxRecentActions?: number;
  /** Persistent storage for pending crash reports */
  storage?: CrashStorage;
  /** Optional fetch override */
  fetch?: typeof globalThis.fetch;
  /** Callback for send errors */
  onError?: (err: unknown) => void;
}

export interface CrashStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// ── In-memory storage ─────────────────────────────────────────────────────────

class MemoryCrashStorage implements CrashStorage {
  private readonly map = new Map<string, string>();
  async getItem(k: string): Promise<string | null> { return this.map.get(k) ?? null; }
  async setItem(k: string, v: string): Promise<void> { this.map.set(k, v); }
  async removeItem(k: string): Promise<void> { this.map.delete(k); }
}

// ── Stack trace parser ─────────────────────────────────────────────────────────

const V8_FRAME = /^\s+at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
const HERMES_FRAME = /^(.+?)@(.+?):(\d+):(\d+)$/;
const NATIVE_FRAME = /^\s+at (.+?) \[native\]/;

/** Parse a JS or Hermes (React Native) stack trace string into structured frames. */
export function parseStackTrace(error: Error): ParsedStackTrace {
  const raw = error.stack ?? '';
  const lines = raw.split('\n');
  const frames: StackFrame[] = [];

  for (const line of lines) {
    // Skip the first line (error message)
    if (line.trimStart().startsWith(error.name) || line === error.message) continue;

    const native = NATIVE_FRAME.exec(line);
    if (native) {
      frames.push({ function: native[1] ?? undefined, native: true });
      continue;
    }

    const v8 = V8_FRAME.exec(line);
    if (v8) {
      frames.push({
        function: v8[1] ?? undefined,
        file: v8[2] ?? undefined,
        line: v8[3] ? parseInt(v8[3], 10) : undefined,
        column: v8[4] ? parseInt(v8[4], 10) : undefined,
      });
      continue;
    }

    const hermes = HERMES_FRAME.exec(line);
    if (hermes) {
      frames.push({
        function: hermes[1] ?? undefined,
        file: hermes[2] ?? undefined,
        line: hermes[3] ? parseInt(hermes[3], 10) : undefined,
        column: hermes[4] ? parseInt(hermes[4], 10) : undefined,
      });
    }
  }

  return { message: error.message, frames, raw };
}

// ── PII scrubbing (minimal — crash messages may contain user data) ─────────────

const PHONE_RE = /(?<!\w)(?:\+?964|0)7\d{9}(?!\w)/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function scrubMessage(msg: string): string {
  return msg.replace(PHONE_RE, '[phone]').replace(EMAIL_RE, '[email]');
}

// ── ID generator ───────────────────────────────────────────────────────────────

function generateReportId(): string {
  return 'cr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Storage keys ───────────────────────────────────────────────────────────────

const PENDING_REPORTS_KEY = 'crash_pending_reports';

// ── CrashReporter ─────────────────────────────────────────────────────────────

export class CrashReporter {
  private readonly endpoint: string;
  private readonly appVersion: string;
  private readonly getDeviceInfo: () => Record<string, unknown>;
  private readonly maxBreadcrumbs: number;
  private readonly maxRecentActions: number;
  private readonly storage: CrashStorage;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly onError: (err: unknown) => void;

  // Breadcrumb ring buffer
  private breadcrumbs: Breadcrumb[] = [];
  // Recent user action descriptions (for last-N display)
  private recentActions: string[] = [];
  // Current user context
  private userId?: string;
  private currentScreen?: string;
  private sessionId?: string;
  // Network state (set externally via setNetworkState)
  private networkState?: NetworkState;
  // Pending reports not yet sent
  private pendingReports: CrashReport[] = [];

  // Global handler refs so we can remove them
  private _unhandledErrorHandler: ((event: ErrorEvent) => void) | null = null;
  private _unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(opts: CrashReporterOptions) {
    this.endpoint = opts.endpoint;
    this.appVersion = opts.appVersion;
    this.getDeviceInfo = opts.deviceInfo ?? (() => ({}));
    this.maxBreadcrumbs = opts.maxBreadcrumbs ?? 20;
    this.maxRecentActions = opts.maxRecentActions ?? 5;
    this.storage = opts.storage ?? new MemoryCrashStorage();
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.onError = opts.onError ?? (() => undefined);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Initialize: restore pending reports from previous session and flush them. */
  async start(): Promise<void> {
    await this._restorePendingReports();
    // Install global handlers in browser / React Native environments
    this._installGlobalHandlers();
    // Flush any reports that were saved from a previous crash
    await this._flushPendingReports();
  }

  async stop(): Promise<void> {
    this._removeGlobalHandlers();
    await this._persistPendingReports();
  }

  // ── Context setters ───────────────────────────────────────────────────────

  setUser(userId: string | null): void {
    this.userId = userId ?? undefined;
  }

  setScreen(screenName: string): void {
    this.currentScreen = screenName;
    this.addBreadcrumb({
      type: 'navigation',
      message: `Navigated to ${screenName}`,
      timestamp: new Date().toISOString(),
    });
  }

  setSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  setNetworkState(state: NetworkState): void {
    this.networkState = state;
  }

  // ── Breadcrumbs ───────────────────────────────────────────────────────────

  addBreadcrumb(crumb: Breadcrumb): void {
    this.breadcrumbs.push(crumb);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  /** Record a user action (also appended as a breadcrumb). */
  recordAction(description: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    this.addBreadcrumb({
      type: 'action',
      message: description,
      data,
      timestamp,
    });
    this.recentActions.push(description);
    if (this.recentActions.length > this.maxRecentActions) {
      this.recentActions.shift();
    }
  }

  recordNetworkRequest(url: string, method: string, statusCode: number, durationMs: number): void {
    const safeUrl = url.split('?')[0]; // Drop query string (may contain tokens)
    this.addBreadcrumb({
      type: 'network',
      message: `${method} ${safeUrl} → ${statusCode} (${durationMs}ms)`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Report API ────────────────────────────────────────────────────────────

  /**
   * Report a non-fatal error with context.
   * Sent immediately if network is available; queued otherwise.
   */
  async reportError(error: unknown, context?: Record<string, unknown>): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    const report = this._buildReport('error', err, context);
    await this._submitReport(report);
  }

  /**
   * Report a crash (unhandled exception / app freeze).
   * If sending fails, the report is persisted and sent on next launch.
   */
  async reportCrash(error: unknown, crashInfo?: Record<string, unknown>): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    const report = this._buildReport('crash', err, crashInfo);
    // For crashes, always try to persist immediately — the app may die
    await this._persistReport(report);
    await this._submitReport(report);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _buildReport(
    type: CrashReport['type'],
    err: Error,
    extras?: Record<string, unknown>,
  ): CrashReport {
    return {
      id: generateReportId(),
      type,
      error: {
        name: err.name,
        message: scrubMessage(err.message),
        stack: parseStackTrace(err),
      },
      context: {
        userId: this.userId,
        screen: this.currentScreen,
        lastActions: [...this.recentActions],
        breadcrumbs: [...this.breadcrumbs],
        network: this.networkState,
        extras: extras ? (extras as Record<string, unknown>) : undefined,
      },
      deviceInfo: this.getDeviceInfo(),
      appVersion: this.appVersion,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
    };
  }

  private async _submitReport(report: CrashReport): Promise<void> {
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (res.ok) {
        // Remove from pending if it was there
        this.pendingReports = this.pendingReports.filter((r) => r.id !== report.id);
        await this._persistPendingReports();
      } else {
        await this._persistReport(report);
      }
    } catch (err) {
      this.onError(err);
      await this._persistReport(report);
    }
  }

  private async _persistReport(report: CrashReport): Promise<void> {
    if (!this.pendingReports.find((r) => r.id === report.id)) {
      this.pendingReports.push(report);
      if (this.pendingReports.length > 20) this.pendingReports.shift();
    }
    await this._persistPendingReports();
  }

  private async _restorePendingReports(): Promise<void> {
    try {
      const raw = await this.storage.getItem(PENDING_REPORTS_KEY);
      if (raw) this.pendingReports = JSON.parse(raw) as CrashReport[];
    } catch { /* ignore */ }
  }

  private async _persistPendingReports(): Promise<void> {
    try {
      if (this.pendingReports.length === 0) {
        await this.storage.removeItem(PENDING_REPORTS_KEY);
      } else {
        await this.storage.setItem(PENDING_REPORTS_KEY, JSON.stringify(this.pendingReports));
      }
    } catch { /* ignore */ }
  }

  private async _flushPendingReports(): Promise<void> {
    const toFlush = [...this.pendingReports];
    for (const report of toFlush) {
      await this._submitReport(report);
    }
  }

  // ── Global handlers ───────────────────────────────────────────────────────

  private _installGlobalHandlers(): void {
    if (typeof window === 'undefined') return;

    this._unhandledErrorHandler = (event: ErrorEvent) => {
      const err = event.error instanceof Error ? event.error : new Error(event.message);
      void this.reportCrash(err, { type: 'unhandled_error', filename: event.filename, lineno: event.lineno });
    };

    this._unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      void this.reportCrash(err, { type: 'unhandled_rejection' });
    };

    window.addEventListener('error', this._unhandledErrorHandler);
    window.addEventListener('unhandledrejection', this._unhandledRejectionHandler);
  }

  private _removeGlobalHandlers(): void {
    if (typeof window === 'undefined') return;
    if (this._unhandledErrorHandler) {
      window.removeEventListener('error', this._unhandledErrorHandler);
    }
    if (this._unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this._unhandledRejectionHandler);
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getPendingReportCount(): number { return this.pendingReports.length; }
  getBreadcrumbs(): Breadcrumb[] { return [...this.breadcrumbs]; }
  getRecentActions(): string[] { return [...this.recentActions]; }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createCrashReporter(opts: CrashReporterOptions): CrashReporter {
  return new CrashReporter(opts);
}
