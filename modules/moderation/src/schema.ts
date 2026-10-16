import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const moderationSchema = pgSchema('moderation');

export const wordFilterTable = moderationSchema.table(
  'word_filter',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    word:      text('word').notNull(),
    locale:    text('locale').notNull().default('ar'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('word_filter_locale_idx').on(t.locale)],
);

export const reportTable = moderationSchema.table(
  'report',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    reporterId:  uuid('reporter_id').notNull(),
    contentId:   uuid('content_id').notNull(),
    contentType: text('content_type').notNull(),
    reason:      text('reason').notNull(),
    details:     text('details'),
    status:      text('status').notNull().default('pending'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('report_status_created_idx').on(t.status, t.createdAt),
    index('report_content_idx').on(t.contentId, t.contentType),
    index('report_reporter_idx').on(t.reporterId),
  ],
);

export const actionTable = moderationSchema.table(
  'action',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    reportId:    uuid('report_id').notNull().references(() => reportTable.id, { onDelete: 'cascade' }),
    moderatorId: uuid('moderator_id').notNull(),
    action:      text('action').notNull(),
    note:        text('note'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('action_report_id_idx').on(t.reportId),
    index('action_moderator_id_idx').on(t.moderatorId),
  ],
);

export const userWarningTable = moderationSchema.table(
  'user_warning',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull(),
    reason:      text('reason').notNull(),
    moderatorId: uuid('moderator_id').notNull(),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt:   timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('user_warning_user_id_idx').on(t.userId)],
);

export const userSuspensionTable = moderationSchema.table(
  'user_suspension',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull().unique(),
    type:        text('type').notNull(),
    reason:      text('reason').notNull(),
    moderatorId: uuid('moderator_id').notNull(),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt:   timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('user_suspension_user_id_idx').on(t.userId),
    index('user_suspension_expires_idx').on(t.expiresAt),
  ],
);

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentType = 'post' | 'comment' | 'listing' | 'story' | 'user';
export type ReportReason = 'spam' | 'inappropriate' | 'violence' | 'hate_speech' | 'misinformation' | 'copyright' | 'other';
export type ReportStatus = 'pending' | 'approved' | 'removed' | 'warned' | 'suspended' | 'banned' | 'dismissed';
export type ModerationAction = 'approve' | 'remove' | 'warn' | 'suspend' | 'ban' | 'dismiss';

export interface Report {
  id: string;
  reporterId: string;
  contentId: string;
  contentType: ContentType;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: Date;
}

export interface Action {
  id: string;
  reportId: string;
  moderatorId: string;
  action: ModerationAction;
  note: string | null;
  createdAt: Date;
}

export interface UserWarning {
  id: string;
  userId: string;
  reason: string;
  moderatorId: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface UserSuspension {
  id: string;
  userId: string;
  type: 'suspend' | 'ban';
  reason: string;
  moderatorId: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface CheckResult {
  pass: boolean;
  reason?: string;
  blockedWord?: string;
  score: number;
}

export interface AutoModResult {
  removed: boolean;
  score: number;
  reason?: string;
}

export interface ReportFilters {
  status?: ReportStatus;
  contentType?: ContentType;
  reporterId?: string;
}

export interface Pagination {
  limit?: number;
  cursor?: string;
}
