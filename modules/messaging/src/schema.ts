import { boolean, index, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const messagingSchema = pgSchema('messaging');

export const inquiryTable = messagingSchema.table(
  'inquiry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    text: text('text').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('inquiry_user_id_created_at_idx').on(t.userId, t.createdAt)],
);

export const deliveryTable = messagingSchema.table(
  'delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiryTable.id),
    placeId: text('place_id').notNull(),
    channel: text('channel').notNull(), // 'in_app' | 'whatsapp' | 'handoff'
    status: text('status').notNull().default('queued'),
    externalId: text('external_id'),
    handoffUrl: text('handoff_url'),
    handoffCopyText: text('handoff_copy_text'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('delivery_inquiry_id_idx').on(t.inquiryId),
    index('delivery_place_id_status_idx').on(t.placeId, t.status),
  ],
);

export const replyTable = messagingSchema.table('reply', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryId: uuid('delivery_id')
    .notNull()
    .references(() => deliveryTable.id),
  fromProvider: boolean('from_provider').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providerOptOutTable = messagingSchema.table('provider_opt_out', {
  providerId: uuid('provider_id').primaryKey(),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Quick Reply Templates ────────────────────────────────────────────────────

export const quickReplyTable = messagingSchema.table(
  'quick_reply',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull(),
    category: text('category').notNull().default('other'),
    label: text('label').notNull(),
    text: text('text').notNull(),
    usageCount: text('usage_count').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quick_reply_provider_id_idx').on(t.providerId)],
);

export const conversationAssignmentTable = messagingSchema.table(
  'conversation_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: uuid('delivery_id').notNull().references(() => deliveryTable.id),
    staffId: uuid('staff_id').notNull(),
    staffName: text('staff_name').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conv_assignment_delivery_id_idx').on(t.deliveryId)],
);

export const conversationStatusTable = messagingSchema.table(
  'conversation_status',
  {
    deliveryId: uuid('delivery_id').primaryKey().references(() => deliveryTable.id),
    status: text('status').notNull().default('open'), // 'open' | 'resolved'
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const autoReplyTable = messagingSchema.table('auto_reply', {
  providerId: uuid('provider_id').primaryKey(),
  message: text('message').notNull().default(''),
  enabled: boolean('enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Group Messaging ──────────────────────────────────────────────────────────

export const groupTable = messagingSchema.table(
  'group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    createdBy: uuid('created_by').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_created_by_idx').on(t.createdBy)],
);

export const groupMemberTable = messagingSchema.table(
  'group_member',
  {
    groupId: uuid('group_id').notNull().references(() => groupTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull().default('member').$type<'admin' | 'member'>(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index('group_member_user_id_idx').on(t.userId),
  ],
);

export const groupMessageTable = messagingSchema.table(
  'group_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').notNull().references(() => groupTable.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_message_group_id_idx').on(t.groupId, t.createdAt)],
);
