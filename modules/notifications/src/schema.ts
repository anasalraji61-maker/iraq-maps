import { boolean, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
