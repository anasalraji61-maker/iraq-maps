import { boolean, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const notificationsSchema = pgSchema('notifications');

export const deviceTable = notificationsSchema.table('device', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  token: text('token').notNull(),
  platform: text('platform').notNull().$type<'android' | 'ios'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prefsTable = notificationsSchema.table('prefs', {
  userId: uuid('user_id').primaryKey(),
  newInquiry: boolean('new_inquiry').notNull().default(true),
  replyReceived: boolean('reply_received').notNull().default(true),
  statusUpdate: boolean('status_update').notNull().default(true),
  discoverLikes: boolean('discover_likes').notNull().default(true),
  discoverComments: boolean('discover_comments').notNull().default(true),
  messages: boolean('messages').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTable = notificationsSchema.table('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull().default('general'), // e.g. 'like', 'comment', 'mention', 'message', 'general'
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data').$type<Record<string, string>>(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
