/**
 * FakeModerationService — in-memory fake for tests that consume the moderation port.
 *
 * Mirrors the surface of ModerationService (modules/moderation/src/moderation.service.ts):
 *  - checkContent, checkMedia, autoModerate
 *  - fileReport, listReports, actOnReport
 *  - isUserSuspended, getUserWarnings, suspendUser, warnUser
 *  - getWordFilter, updateWordFilter
 *
 * By default every content check passes (pass = true, score = 0).
 * Tests may call `blockWord()` or `setAlwaysFail()` to trigger failures.
 */
import { randomUUID } from 'node:crypto';

// ─── Types (mirrors modules/moderation/src/schema.ts) ────────────────────────

export type ReportReason =
  | 'violence'
  | 'hate_speech'
  | 'inappropriate'
  | 'spam'
  | 'misinformation'
  | 'copyright'
  | 'other';

export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export type ContentType = 'post' | 'comment' | 'review' | 'profile' | 'media';

export type ModerationAction = 'remove' | 'warn' | 'suspend' | 'ban' | 'dismiss';

export interface CheckResult {
  pass: boolean;
  score: number;
  reason?: string;
  blockedWord?: string;
}

export interface AutoModResult {
  removed: boolean;
  score: number;
  reason?: string;
}

export interface Report {
  id: string;
  reportedBy: string;
  contentType: ContentType;
  contentId: string;
  targetUserId: string;
  reason: ReportReason;
  notes?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface UserWarning {
  id: string;
  userId: string;
  issuedBy: string;
  reason: string;
  createdAt: string;
}

export interface UserSuspension {
  id: string;
  userId: string;
  issuedBy: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface Action {
  id: string;
  reportId: string;
  performedBy: string;
  action: ModerationAction;
  notes?: string;
  createdAt: string;
}

export interface ReportFilters {
  status?: ReportStatus;
  contentType?: ContentType;
  reason?: ReportReason;
}

export interface Pagination {
  cursor?: string;
  limit?: number;
}

export interface ReportPage {
  items: Report[];
  nextCursor?: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

class ModerationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ModerationError';
  }
}

// ─── Fake implementation ──────────────────────────────────────────────────────

export class FakeModerationService {
  // ── State ──────────────────────────────────────────────────────────────────
  private readonly blockedWords = new Map<string, Set<string>>(); // locale → words
  private readonly reports = new Map<string, Report>();
  private readonly actions = new Map<string, Action[]>(); // reportId → actions
  private readonly warnings = new Map<string, UserWarning[]>(); // userId → warnings
  private readonly suspensions = new Map<string, UserSuspension>(); // userId → active suspension

  /** When set, every checkContent() call returns this result. */
  private forceCheckResult: CheckResult | null = null;
  /** When set, every checkMedia() call returns this result. */
  private forceMediaResult: CheckResult | null = null;

  /** Audit log of all calls for assertions. */
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  // ── Test helpers ───────────────────────────────────────────────────────────

  /** Add a word to the block list for the given locale. */
  blockWord(word: string, locale = 'ar'): this {
    if (!this.blockedWords.has(locale)) this.blockedWords.set(locale, new Set());
    this.blockedWords.get(locale)!.add(word.toLowerCase());
    return this;
  }

  /** Override every checkContent result until cleared (pass `null` to clear). */
  setCheckResult(result: CheckResult | null): this {
    this.forceCheckResult = result;
    return this;
  }

  /** Override every checkMedia result until cleared (pass `null` to clear). */
  setMediaResult(result: CheckResult | null): this {
    this.forceMediaResult = result;
    return this;
  }

  /** Reset all state. */
  reset(): void {
    this.blockedWords.clear();
    this.reports.clear();
    this.actions.clear();
    this.warnings.clear();
    this.suspensions.clear();
    this.forceCheckResult = null;
    this.forceMediaResult = null;
    this.calls.length = 0;
  }

  // ── Word filter ────────────────────────────────────────────────────────────

  async getWordFilter(locale = 'ar'): Promise<string[]> {
    this.calls.push({ method: 'getWordFilter', args: [locale] });
    return [...(this.blockedWords.get(locale) ?? [])];
  }

  async updateWordFilter(words: string[], action: 'add' | 'remove', locale = 'ar'): Promise<void> {
    this.calls.push({ method: 'updateWordFilter', args: [words, action, locale] });
    const normalized = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (!this.blockedWords.has(locale)) this.blockedWords.set(locale, new Set());
    const set = this.blockedWords.get(locale)!;
    if (action === 'add') {
      for (const w of normalized) set.add(w);
    } else {
      for (const w of normalized) set.delete(w);
    }
  }

  // ── Content check ──────────────────────────────────────────────────────────

  async checkContent(text: string, _userId?: string): Promise<CheckResult> {
    this.calls.push({ method: 'checkContent', args: [text, _userId] });

    if (this.forceCheckResult) return { ...this.forceCheckResult };

    const lower = text.toLowerCase();
    for (const [_locale, words] of this.blockedWords) {
      for (const word of words) {
        if (lower.includes(word)) {
          return { pass: false, score: 0.9, reason: 'blocked_word', blockedWord: word };
        }
      }
    }

    return { pass: true, score: 0 };
  }

  async checkMedia(url: string, type: 'image' | 'video'): Promise<CheckResult> {
    this.calls.push({ method: 'checkMedia', args: [url, type] });
    if (this.forceMediaResult) return { ...this.forceMediaResult };
    return { pass: true, score: 0 };
  }

  async autoModerate(content: string): Promise<AutoModResult> {
    this.calls.push({ method: 'autoModerate', args: [content] });
    const result = await this.checkContent(content);
    if (!result.pass && result.score >= 0.75) {
      return { removed: true, score: result.score, reason: result.reason };
    }
    return { removed: false, score: result.score };
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  async fileReport(
    reportedBy: string,
    contentType: ContentType,
    contentId: string,
    targetUserId: string,
    reason: ReportReason,
    notes?: string,
  ): Promise<Report> {
    this.calls.push({ method: 'fileReport', args: [reportedBy, contentType, contentId, targetUserId, reason, notes] });

    const id = randomUUID();
    const now = new Date().toISOString();
    const report: Report = {
      id,
      reportedBy,
      contentType,
      contentId,
      targetUserId,
      reason,
      notes,
      status: 'pending',
      createdAt: now,
    };

    this.reports.set(id, report);
    return { ...report };
  }

  async listReports(filters: ReportFilters = {}, pagination: Pagination = {}): Promise<ReportPage> {
    this.calls.push({ method: 'listReports', args: [filters, pagination] });

    const limit = Math.min(pagination.limit ?? 20, 50);
    let rows = [...this.reports.values()];

    if (filters.status) rows = rows.filter((r) => r.status === filters.status);
    if (filters.contentType) rows = rows.filter((r) => r.contentType === filters.contentType);
    if (filters.reason) rows = rows.filter((r) => r.reason === filters.reason);

    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (pagination.cursor) {
      const idx = parseInt(Buffer.from(pagination.cursor, 'base64').toString('utf-8'), 10);
      rows = rows.slice(isNaN(idx) ? 0 : idx);
    }

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const nextCursor = hasMore ? Buffer.from(String(limit)).toString('base64') : undefined;

    return { items: items.map((r) => ({ ...r })), nextCursor };
  }

  async getReport(reportId: string): Promise<Report> {
    this.calls.push({ method: 'getReport', args: [reportId] });
    const r = this.reports.get(reportId);
    if (!r) throw new ModerationError(404, 'Report not found');
    return { ...r };
  }

  async actOnReport(
    reportId: string,
    performedBy: string,
    action: ModerationAction,
    notes?: string,
  ): Promise<Action> {
    this.calls.push({ method: 'actOnReport', args: [reportId, performedBy, action, notes] });

    const report = this.reports.get(reportId);
    if (!report) throw new ModerationError(404, 'Report not found');

    const now = new Date().toISOString();
    const act: Action = {
      id: randomUUID(),
      reportId,
      performedBy,
      action,
      notes,
      createdAt: now,
    };

    if (!this.actions.has(reportId)) this.actions.set(reportId, []);
    this.actions.get(reportId)!.push(act);

    // Update report status
    const newStatus: ReportStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
    this.reports.set(reportId, { ...report, status: newStatus, resolvedAt: now });

    // Side effects
    if (action === 'suspend') {
      this.doSuspend(report.targetUserId, performedBy, notes ?? 'Suspended via report');
    } else if (action === 'warn') {
      this.doWarn(report.targetUserId, performedBy, notes ?? 'Warned via report');
    }

    return { ...act };
  }

  // ── User status ────────────────────────────────────────────────────────────

  async isUserSuspended(userId: string): Promise<{ suspended: boolean; expiresAt?: string | null }> {
    this.calls.push({ method: 'isUserSuspended', args: [userId] });
    const sus = this.suspensions.get(userId);
    if (!sus) return { suspended: false };
    if (sus.expiresAt && new Date(sus.expiresAt) < new Date()) {
      this.suspensions.delete(userId);
      return { suspended: false };
    }
    return { suspended: true, expiresAt: sus.expiresAt };
  }

  async getUserWarnings(userId: string): Promise<UserWarning[]> {
    this.calls.push({ method: 'getUserWarnings', args: [userId] });
    return (this.warnings.get(userId) ?? []).map((w) => ({ ...w }));
  }

  async suspendUser(userId: string, issuedBy: string, reason: string, durationHours = 24): Promise<UserSuspension> {
    this.calls.push({ method: 'suspendUser', args: [userId, issuedBy, reason, durationHours] });
    return this.doSuspend(userId, issuedBy, reason, durationHours);
  }

  async warnUser(userId: string, issuedBy: string, reason: string): Promise<UserWarning> {
    this.calls.push({ method: 'warnUser', args: [userId, issuedBy, reason] });
    return this.doWarn(userId, issuedBy, reason);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private doSuspend(userId: string, issuedBy: string, reason: string, durationHours = 24): UserSuspension {
    const now = new Date();
    const expiresAt = durationHours > 0
      ? new Date(now.getTime() + durationHours * 3_600_000).toISOString()
      : null;
    const sus: UserSuspension = {
      id: randomUUID(),
      userId,
      issuedBy,
      reason,
      expiresAt,
      createdAt: now.toISOString(),
    };
    this.suspensions.set(userId, sus);
    return { ...sus };
  }

  private doWarn(userId: string, issuedBy: string, reason: string): UserWarning {
    const warning: UserWarning = {
      id: randomUUID(),
      userId,
      issuedBy,
      reason,
      createdAt: new Date().toISOString(),
    };
    if (!this.warnings.has(userId)) this.warnings.set(userId, []);
    this.warnings.get(userId)!.push(warning);
    return { ...warning };
  }
}
