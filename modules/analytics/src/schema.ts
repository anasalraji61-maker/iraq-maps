import { pgSchema, uuid, text, jsonb, timestamp, date, integer } from 'drizzle-orm/pg-core';

export const analyticsSchema = pgSchema('analytics');

export const analyticsEvent = analyticsSchema.table('event', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: text('event_type').notNull(),
  userId: uuid('user_id'),
  sessionId: text('session_id'),
  cityId: text('city_id'),
  properties: jsonb('properties').notNull().default({}),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dailyActiveUsers = analyticsSchema.table('daily_active_users', {
  date: date('date').notNull().primaryKey(),
  userCount: integer('user_count').notNull().default(0),
});

export const retention = analyticsSchema.table('retention', {
  cohortDate: date('cohort_date').notNull(),
  dayOffset: integer('day_offset').notNull(),
  retainedCount: integer('retained_count').notNull().default(0),
});

export const EVENT_TYPES = {
  APP_OPEN: 'app_open',
  SEARCH: 'search',
  ROUTE_CALCULATED: 'route_calculated',
  MESSAGE_SENT: 'message_sent',
  POST_CREATED: 'post_created',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
