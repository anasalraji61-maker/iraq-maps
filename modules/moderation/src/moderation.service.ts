/**
 * ModerationService — content safety for Iraq Smart Maps.
 *
 * Responsibilities:
 *  - Word-filter check (Redis-cached per locale)
 *  - Media moderation stub (always passes; logs for future ML integration)
 *  - User reports: file, list (admin), act on (admin)
 *  - Auto-moderation: score content and remove if threshold exceeded
 *  - Banned-word management (admin)
 *  - User suspension / ban / warning queries
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Db } from '@iraq-maps/db-kit';
import type { Redis } from 'ioredis';
import { and, count, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import {
  actionTable,
  reportTable,
  userSuspensionTable,
  userWarningTable,
  wordFilterTable,
  type Action,
  type AutoModResult,
  type CheckResult,
  type ContentType,
  type ModerationAction,
  type Pagination,
  type Report,
  type ReportFilters,
  type ReportReason,
  type ReportStatus,
  type UserSuspension,
  type UserWarning,
} from './schema';

const WORD_FILTER_CACHE_TTL = 300; // 5 minutes
const AUTO_MOD_THRESHOLD = 0.75;
const SUSPEND_DURATION_HOURS = 24;

// ─── Score weights ────────────────────────────────────────────────────────────

const REASON_SCORES: Record<ReportReason, number> = {
  violence:       0.9,
  hate_speech:    0.85,
  inappropriate:  0.6,
  spam:           0.5,
  misinformation: 0.6,
  copyright:      0.4,
  other:          0.3,
};

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @Inject('MODERATION_DB') private readonly db: Db,
    @Inject('MODERATION_REDIS') private readonly redis: Redis | null,
  ) {}

  // ─── Word filter ───────────────────────────────────────────────────────────

  /**
   * Return the list of blocked words for the given locale.
   * Results are cached in Redis for WORD_FILTER_CACHE_TTL seconds.
   */
  async getWordFilter(locale = 'ar'): Promise<string[]> {
    const cacheKey = `moderation:word-filter:${locale}`;

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as string[];
        } catch {
          // stale / corrupt cache — fall through
        }
      }
    }

    const rows = await this.db
      .select({ word: wordFilterTable.word })
      .from(wordFilterTable)
      .where(eq(wordFilterTable.locale, locale));

    const words = rows.map((r: { word: string }) => r.word.toLowerCase());

    if (this.redis) {
      await this.redis.setex(cacheKey, WORD_FILTER_CACHE_TTL, JSON.stringify(words));
    }

    return words;
  }

  /**
   * Admin: add or remove words in the filter for a given locale.
   * Clears the Redis cache after the update.
   */
  async updateWordFilter(
    words: string[],
    action: 'add' | 'remove',
    locale = 'ar',
  ): Promise<void> {
    const normalized = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 0) return;

    if (action === 'add') {
      await this.db
        .insert(wordFilterTable)
        .values(normalized.map((word) => ({ word, locale })))
        .onConflictDoNothing();
    } else {
      for (const word of normalized) {
        await this.db
          .delete(wordFilterTable)
          .where(
            and(eq(wordFilterTable.word, word), eq(wordFilterTable.locale, locale)),
          );
      }
    }

    // Bust cache
    if (this.redis) {
      await this.redis.del(`moderation:word-filter:${locale}`);
    }

    this.logger.log(`Word filter ${action}ed ${normalized.length} word(s) for locale ${locale}`);
  }

  // ─── Content check ────────────────────────────────────────────────────────

  /**
   * Check text against the word filter and compute a simple risk score.
   * The score reflects how many blocked words were found relative to total words.
   */
  async checkContent(text: string, userId?: string): Promise<CheckResult> {
    if (!text || text.trim().length === 0) {
      return { pass: true, score: 0 };
    }

    // Check Arabic, Kurdish and English word lists
    const locales = ['ar', 'ckb', 'en'];
    const lower = text.toLowerCase();

    for (const locale of locales) {
      const blocked = await this.getWordFilter(locale);
      for (const word of blocked) {
        // Whole-word boundary check (works for Arabic and Latin scripts)
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(?<![\\w\\u0600-\\u06FF])${escaped}(?![\\w\\u0600-\\u06FF])`, 'u');
        if (pattern.test(lower)) {
          const score = 0.8 + Math.min(0.2, (blocked.indexOf(word) / blocked.length) * 0.2);
          this.logger.warn(`Content check failed for user=${userId ?? 'anon'} word=${word}`);
          return { pass: false, reason: 'blocked_word', blockedWord: word, score };
        }
      }
    }

    // Heuristic: excessive repetition (spam signal)
    const wordCount = text.split(/\s+/).length;
    const uniqueWordCount = new Set(text.split(/\s+/).map((w) => w.toLowerCase())).size;
    const repetitionRatio = wordCount > 0 ? 1 - uniqueWordCount / wordCount : 0;
    if (repetitionRatio > 0.7 && wordCount > 10) {
      return { pass: false, reason: 'spam_repetition', score: 0.6 };
    }

    // Heuristic: excessive caps (shouting / aggression)
    const capsRatio = (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(1, text.replace(/[^a-zA-Z]/g, '').length);
    if (capsRatio > 0.8 && text.replace(/[^a-zA-Z]/g, '').length > 10) {
      return { pass: false, reason: 'excessive_caps', score: 0.4 };
    }

    return { pass: true, score: 0 };
  }

  /**
   * Stub for image / video moderation.
   * Always passes — logs the URL for future ML integration.
   */
  async checkMedia(url: string, type: 'image' | 'video'): Promise<CheckResult> {
    this.logger.debug(`Media check (stub): type=${type} url=${url}`);
    // Future: call an ML vision API here.
    return { pass: true, score: 0 };
  }

  /**
   * Auto-moderate content: check it and, if the risk score exceeds the
   * threshold, mark it for removal by returning removed=true.
   * The caller is responsible for actually removing the content from its
   * own store — this service does not touch other modules' data.
   */
  async autoModerate(content: string): Promise<AutoModResult> {
    const result = await this.checkContent(content);
    if (!result.pass && result.score >= AUTO_MOD_THRESHOLD) {
      this.logger.warn(`Auto-moderation triggered: score=${result.score} reason=${result.reason}`);
      return { removed: true, score: result.score, reason: result.reason };
    }
    return { removed: false, score: result.score };
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  /**
   * File a user report against a piece of content.
   * Returns the newly created report.
   */
  async reportContent(
    reporterId: string,
    contentId: string,
    contentType: ContentType,
    reason: ReportReason,
    details?: string,
  ): Promise<Report> {
    const [row] = await this.db
      .insert(reportTable)
      .values({
        reporterId,
        contentId,
        contentType,
        reason,
        details: details ?? null,
        status: 'pending',
      })
      .returning();

    if (!row) throw new Error('Failed to insert report');

    this.logger.log(
      `Report filed: reporter=${reporterId} content=${contentType}/${contentId} reason=${reason}`,
    );

    return row as Report;
  }

  /**
   * Admin: retrieve reports with optional filters and cursor-based pagination.
   */
  async getReports(
    filters: ReportFilters = {},
    pagination: Pagination = {},
  ): Promise<{ items: Report[]; total: number; nextCursor: string | null }> {
    const limit = Math.min(pagination.limit ?? 50, 200);

    const conditions = [];
    if (filters.status) conditions.push(eq(reportTable.status, filters.status));
    if (filters.contentType) conditions.push(eq(reportTable.contentType, filters.contentType));
    if (filters.reporterId) conditions.push(eq(reportTable.reporterId, filters.reporterId));
    if (pagination.cursor) conditions.push(lt(reportTable.createdAt, new Date(pagination.cursor)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(reportTable)
        .where(where)
        .orderBy(desc(reportTable.createdAt))
        .limit(limit + 1),
      this.db.select({ count: count() }).from(reportTable).where(where),
    ]);

    const hasMore = items.length > limit;
    const page = items.slice(0, limit) as Report[];
    const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null;

    return { items: page, total: Number(totalRow?.count ?? 0), nextCursor };
  }

  /**
   * Admin: act on a report (approve / remove / warn / suspend / ban / dismiss).
   * Also creates a moderation action log entry.
   */
  async moderateReport(
    moderatorId: string,
    reportId: string,
    action: ModerationAction,
    note?: string,
  ): Promise<{ report: Report; action: Action }> {
    // Map action to report status
    const statusMap: Record<ModerationAction, ReportStatus> = {
      approve:  'approved',
      remove:   'removed',
      warn:     'warned',
      suspend:  'suspended',
      ban:      'banned',
      dismiss:  'dismissed',
    };

    const newStatus = statusMap[action];

    const [updatedReport] = await this.db
      .update(reportTable)
      .set({ status: newStatus })
      .where(eq(reportTable.id, reportId))
      .returning();

    if (!updatedReport) throw new Error(`Report ${reportId} not found`);

    const [actionRow] = await this.db
      .insert(actionTable)
      .values({ reportId, moderatorId, action, note: note ?? null })
      .returning();

    if (!actionRow) throw new Error('Failed to insert action');

    // Side effects: if suspending / banning, record in user_suspension
    const report = updatedReport as Report;
    if (action === 'suspend' || action === 'ban') {
      await this._applySuspension(report.reporterId, action, moderatorId, note ?? `Auto from report ${reportId}`);
    }

    // Side effects: if warning, record in user_warning
    if (action === 'warn') {
      await this._applyWarning(report.reporterId, moderatorId, note ?? `Warning from report ${reportId}`);
    }

    this.logger.log(
      `Moderation action: moderator=${moderatorId} report=${reportId} action=${action}`,
    );

    return { report, action: actionRow as Action };
  }

  // ─── User history ─────────────────────────────────────────────────────────

  /**
   * Admin: get all reports, actions, warnings and suspensions for a user.
   */
  async getModerationHistory(userId: string): Promise<{
    reports: Report[];
    actions: Action[];
    warnings: UserWarning[];
    suspension: UserSuspension | null;
  }> {
    const [reports, warnings, suspensions] = await Promise.all([
      this.db
        .select()
        .from(reportTable)
        .where(eq(reportTable.reporterId, userId))
        .orderBy(desc(reportTable.createdAt))
        .limit(100),
      this.db
        .select()
        .from(userWarningTable)
        .where(eq(userWarningTable.userId, userId))
        .orderBy(desc(userWarningTable.createdAt)),
      this.db
        .select()
        .from(userSuspensionTable)
        .where(eq(userSuspensionTable.userId, userId))
        .limit(1),
    ]);

    // Fetch actions for those reports
    const reportIds = (reports as Report[]).map((r: Report) => r.id);
    const actions: Action[] = reportIds.length === 0
      ? []
      : (await this.db
          .select()
          .from(actionTable)
          .where(sql`${actionTable.reportId} = ANY(${sql.raw(`ARRAY[${reportIds.map((id: string) => `'${id}'`).join(',')}]::uuid[]`)})`)
          .orderBy(desc(actionTable.createdAt))) as Action[];

    return {
      reports:    reports as Report[],
      actions,
      warnings:   warnings as UserWarning[],
      suspension: (suspensions[0] as UserSuspension | undefined) ?? null,
    };
  }

  /**
   * Admin: list currently suspended or banned users.
   * Active = not expired (expires_at IS NULL or > NOW()).
   */
  async getBannedUsers(): Promise<UserSuspension[]> {
    const rows = await this.db
      .select()
      .from(userSuspensionTable)
      .where(
        or(
          isNull(userSuspensionTable.expiresAt),
          gt(userSuspensionTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(userSuspensionTable.createdAt));

    return rows as UserSuspension[];
  }

  /**
   * Check if a user is currently suspended or banned.
   * Returns the active suspension record, or null if the user is clear.
   */
  async getUserSuspension(userId: string): Promise<UserSuspension | null> {
    const [row] = await this.db
      .select()
      .from(userSuspensionTable)
      .where(
        and(
          eq(userSuspensionTable.userId, userId),
          or(
            isNull(userSuspensionTable.expiresAt),
            gt(userSuspensionTable.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);

    return (row as UserSuspension | undefined) ?? null;
  }

  /**
   * Admin: revoke an active suspension / ban.
   */
  async liftSuspension(userId: string): Promise<void> {
    await this.db
      .delete(userSuspensionTable)
      .where(eq(userSuspensionTable.userId, userId));

    this.logger.log(`Suspension lifted for user=${userId}`);
  }

  /**
   * Admin: issue a direct warning to a user (without going through a report).
   */
  async warnUser(userId: string, moderatorId: string, reason: string): Promise<UserWarning> {
    const [row] = await this.db
      .insert(userWarningTable)
      .values({ userId, moderatorId, reason })
      .returning();

    if (!row) throw new Error('Failed to insert warning');
    return row as UserWarning;
  }

  /**
   * Admin: directly suspend or ban a user without going through a report.
   */
  async suspendUser(
    userId: string,
    moderatorId: string,
    type: 'suspend' | 'ban',
    reason: string,
  ): Promise<UserSuspension> {
    return this._applySuspension(userId, type, moderatorId, reason);
  }

  // ─── Aggregates ───────────────────────────────────────────────────────────

  /**
   * Return a map of userId → report count for users with at least one report.
   * Useful for the admin users-with-reports view.
   */
  async getUserReportCounts(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        reporterId: reportTable.reporterId,
        cnt:        count(),
      })
      .from(reportTable)
      .groupBy(reportTable.reporterId);

    const map = new Map<string, number>();
    for (const row of rows) map.set(row.reporterId, Number(row.cnt));
    return map;
  }

  /**
   * Return stats summary for the admin moderation dashboard.
   */
  async getStats(): Promise<{
    pendingReports: number;
    todayActions: number;
    activeSuspensions: number;
    wordFilterTotal: number;
  }> {
    const dayAgo = new Date(Date.now() - 86_400_000);

    const [
      [pending],
      [today],
      [suspended],
      [words],
    ] = await Promise.all([
      this.db.select({ count: count() }).from(reportTable).where(eq(reportTable.status, 'pending')),
      this.db.select({ count: count() }).from(actionTable).where(gt(actionTable.createdAt, dayAgo)),
      this.db.select({ count: count() }).from(userSuspensionTable).where(
        or(isNull(userSuspensionTable.expiresAt), gt(userSuspensionTable.expiresAt, new Date())),
      ),
      this.db.select({ count: count() }).from(wordFilterTable),
    ]);

    return {
      pendingReports:    Number(pending?.count ?? 0),
      todayActions:      Number(today?.count ?? 0),
      activeSuspensions: Number(suspended?.count ?? 0),
      wordFilterTotal:   Number(words?.count ?? 0),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async _applySuspension(
    userId: string,
    type: 'suspend' | 'ban',
    moderatorId: string,
    reason: string,
  ): Promise<UserSuspension> {
    const expiresAt = type === 'suspend'
      ? new Date(Date.now() + SUSPEND_DURATION_HOURS * 3_600_000)
      : null; // ban = permanent

    const [row] = await this.db
      .insert(userSuspensionTable)
      .values({ userId, type, reason, moderatorId, expiresAt })
      .onConflictDoUpdate({
        target: userSuspensionTable.userId,
        set:    { type, reason, moderatorId, expiresAt, createdAt: new Date() },
      })
      .returning();

    if (!row) throw new Error('Failed to upsert suspension');
    this.logger.warn(`User ${userId} ${type}ed by ${moderatorId}: ${reason}`);
    return row as UserSuspension;
  }

  private async _applyWarning(
    userId: string,
    moderatorId: string,
    reason: string,
  ): Promise<UserWarning> {
    const [row] = await this.db
      .insert(userWarningTable)
      .values({ userId, reason, moderatorId })
      .returning();

    if (!row) throw new Error('Failed to insert warning');
    return row as UserWarning;
  }

  /**
   * Score a set of reasons from reports filed against content.
   * Higher scores indicate more severe violations.
   */
  scoreReasons(reasons: ReportReason[]): number {
    if (reasons.length === 0) return 0;
    const maxScore = Math.max(...reasons.map((r) => REASON_SCORES[r] ?? 0.3));
    // Bonus for multiple different reporters
    const uniqueBonus = Math.min(0.15, (reasons.length - 1) * 0.03);
    return Math.min(1, maxScore + uniqueBonus);
  }
}
