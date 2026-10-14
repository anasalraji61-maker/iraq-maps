import { pgSchema, uuid, text, timestamp, integer, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const assistantSchema = pgSchema('assistant');

export const sessionTable = assistantSchema.table('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messageTable = assistantSchema.table('message', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessionTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimitTable = assistantSchema.table('rate_limit', {
  userId: uuid('user_id').notNull(),
  date: date('date').notNull().default(sql`CURRENT_DATE`),
  count: integer('count').notNull().default(0),
});

export type SessionRow = typeof sessionTable.$inferSelect;
export type MessageRow = typeof messageTable.$inferSelect;
