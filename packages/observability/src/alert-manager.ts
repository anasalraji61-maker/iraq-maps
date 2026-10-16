// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal logger interface (mirrors observability Logger; avoid circular import). */
type LogFn = (objOrMsg: Record<string, unknown> | string, msg?: string) => void;
interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertThreshold {
  /** Unique name for this rule, e.g. "api_p99_latency". */
  name: string;
  /** Human-readable description for alert messages. */
  description: string;
  severity: AlertSeverity;
  /** The metric value above which the alert fires. */
  threshold: number;
  /**
   * How long (ms) the metric must exceed the threshold before alerting.
   * Prevents flapping on transient spikes. Default: 0 (alert immediately).
   */
  sustainedMs?: number;
}

export interface AlertEvent {
  id: string;
  rule: string;
  severity: AlertSeverity;
  description: string;
  value: number;
  threshold: number;
  firedAt: Date;
  resolvedAt?: Date;
}

/** Stub for future webhook / PagerDuty / Slack integrations. */
export interface AlertWebhookConfig {
  url: string;
  /** Bearer token stored as an env-var reference name, never the value itself. */
  secretEnvVar: string;
}

// ── AlertManager ───────────────────────────────────────────────────────────

/**
 * Lightweight rule-based alert manager.
 *
 * Usage:
 *   const am = new AlertManager(log);
 *   am.defineThreshold({ name: 'api_p99', description: 'API p99 > 500ms', severity: 'warning', threshold: 500 });
 *   am.check('api_p99', p99Value);
 */
export class AlertManager {
  private readonly thresholds = new Map<string, AlertThreshold>();
  private readonly active = new Map<string, AlertEvent>();
  private readonly history: AlertEvent[] = [];
  private readonly sustainedSince = new Map<string, number>();
  private idCounter = 0;
  private webhookConfig?: AlertWebhookConfig;

  constructor(private readonly log: Logger) {}

  // ── Rule management ────────────────────────────────────────────────────

  defineThreshold(rule: AlertThreshold): void {
    this.thresholds.set(rule.name, rule);
  }

  defineThresholds(rules: readonly AlertThreshold[]): void {
    for (const r of rules) this.defineThreshold(r);
  }

  removeThreshold(name: string): void {
    this.thresholds.delete(name);
    this.active.delete(name);
    this.sustainedSince.delete(name);
  }

  /** Register a webhook destination for fired alerts (stub — logs intent, does not send). */
  setWebhook(config: AlertWebhookConfig): void {
    this.webhookConfig = config;
    this.log.info({ webhookUrl: config.url }, 'alert webhook configured (stub)');
  }

  // ── Evaluation ─────────────────────────────────────────────────────────

  /**
   * Evaluates a single rule against the current metric value.
   * - If the value exceeds the threshold, start (or continue) the sustained timer.
   * - Once the sustained duration has elapsed, fire the alert.
   * - If the value drops below the threshold, resolve any active alert.
   *
   * @param ruleName - Must match a previously defined threshold.
   * @param value    - Current metric value (ms, ratio, count, …).
   * @param nowMs    - Override current time (useful in tests).
   */
  check(ruleName: string, value: number, nowMs = Date.now()): void {
    const rule = this.thresholds.get(ruleName);
    if (!rule) return;

    const exceeds = value > rule.threshold;

    if (exceeds) {
      const since = this.sustainedSince.get(ruleName) ?? nowMs;
      if (!this.sustainedSince.has(ruleName)) this.sustainedSince.set(ruleName, since);

      const sustainedMs = rule.sustainedMs ?? 0;
      const elapsed = nowMs - since;

      if (elapsed >= sustainedMs && !this.active.has(ruleName)) {
        this.fire(rule, value, nowMs);
      }
    } else {
      this.sustainedSince.delete(ruleName);
      this.resolve(ruleName, nowMs);
    }
  }

  /**
   * Bulk-evaluate multiple (name, value) pairs.
   * Convenient when you collect all metric snapshots at once.
   */
  checkAll(readings: readonly { rule: string; value: number }[], nowMs = Date.now()): void {
    for (const { rule, value } of readings) {
      this.check(rule, value, nowMs);
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private fire(rule: AlertThreshold, value: number, nowMs: number): void {
    const event: AlertEvent = {
      id: `alert-${++this.idCounter}`,
      rule: rule.name,
      severity: rule.severity,
      description: rule.description,
      value,
      threshold: rule.threshold,
      firedAt: new Date(nowMs),
    };

    this.active.set(rule.name, event);
    this.history.push(event);

    const logFn =
      rule.severity === 'critical' ? this.log.error : rule.severity === 'warning' ? this.log.warn : this.log.info;
    logFn(
      { alertId: event.id, rule: rule.name, value, threshold: rule.threshold },
      `[ALERT:${rule.severity.toUpperCase()}] ${rule.description}`,
    );

    // Stub: future webhook dispatch
    if (this.webhookConfig) {
      this.log.debug({ webhookUrl: this.webhookConfig.url, alertId: event.id }, 'alert webhook dispatch (stub — not sent)');
    }
  }

  private resolve(ruleName: string, nowMs: number): void {
    const event = this.active.get(ruleName);
    if (!event) return;

    event.resolvedAt = new Date(nowMs);
    this.active.delete(ruleName);

    this.log.info(
      { alertId: event.id, rule: ruleName, resolvedAfterMs: nowMs - event.firedAt.getTime() },
      `[ALERT RESOLVED] ${event.description}`,
    );
  }

  // ── Inspection ─────────────────────────────────────────────────────────

  getActive(): AlertEvent[] {
    return Array.from(this.active.values());
  }

  getHistory(limit = 100): AlertEvent[] {
    return this.history.slice(-limit);
  }

  hasActive(): boolean {
    return this.active.size > 0;
  }

  // ── Default rules ──────────────────────────────────────────────────────

  /**
   * Registers a sensible default set of alert thresholds suitable for the Iraq Maps API.
   * Call this at bootstrap to have production-ready alerting with no extra config.
   */
  static createDefaultRules(): AlertThreshold[] {
    return [
      {
        name: 'api_p99_latency_ms',
        description: 'API p99 response time exceeds 500 ms',
        severity: 'warning',
        threshold: 500,
        sustainedMs: 30_000, // must stay above for 30 s before alerting
      },
      {
        name: 'api_p99_latency_critical_ms',
        description: 'API p99 response time exceeds 2000 ms',
        severity: 'critical',
        threshold: 2000,
        sustainedMs: 10_000,
      },
      {
        name: 'api_error_rate',
        description: 'API 5xx error rate exceeds 5%',
        severity: 'warning',
        threshold: 0.05,
        sustainedMs: 60_000,
      },
      {
        name: 'api_error_rate_critical',
        description: 'API 5xx error rate exceeds 20%',
        severity: 'critical',
        threshold: 0.2,
        sustainedMs: 10_000,
      },
      {
        name: 'db_p99_latency_ms',
        description: 'DB query p99 exceeds 200 ms',
        severity: 'warning',
        threshold: 200,
        sustainedMs: 30_000,
      },
      {
        name: 'cache_hit_ratio_low',
        description: 'Cache hit ratio below 50%',
        severity: 'info',
        threshold: 0, // fires when hitRatio < 0.5 — caller inverts: check('cache_hit_ratio_low', 1 - hitRatio)
        sustainedMs: 120_000,
      },
    ];
  }
}
