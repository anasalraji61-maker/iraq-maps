import {
  bigserial,
  boolean,
  date,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const appointmentsSchema = pgSchema('appointments');

// ─── Provider availability ────────────────────────────────────────────────────

export const providerAvailabilityTable = appointmentsSchema.table(
  'provider_availability',
  {
    providerId: uuid('provider_id').notNull(),
    /** 0 = Sunday … 6 = Saturday */
    dayOfWeek: smallint('day_of_week').notNull(),
    openTime: time('open_time').notNull(),
    closeTime: time('close_time').notNull(),
    slotDurationMinutes: smallint('slot_duration_minutes').notNull().default(30),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.dayOfWeek] }),
    index('provider_availability_provider_idx').on(t.providerId),
  ],
);

// ─── Appointment slots ────────────────────────────────────────────────────────

export const appointmentSlotTable = appointmentsSchema.table(
  'appointment_slot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull(),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointment_slot_provider_start_idx').on(t.providerId, t.startTime),
    index('appointment_slot_available_idx').on(t.providerId, t.isAvailable, t.startTime),
  ],
);

// ─── Provider time-off ────────────────────────────────────────────────────────

export const providerTimeOffTable = appointmentsSchema.table(
  'provider_time_off',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: uuid('provider_id').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('provider_time_off_provider_dates_idx').on(t.providerId, t.startDate, t.endDate)],
);

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointmentTable = appointmentsSchema.table(
  'appointment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    providerId: uuid('provider_id').notNull(),
    slotId: uuid('slot_id').references(() => appointmentSlotTable.id, { onDelete: 'set null' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    service: text('service').notNull(),
    status: text('status')
      .notNull()
      .default('pending')
      .$type<'pending' | 'confirmed' | 'cancelled' | 'completed'>(),
    notes: text('notes'),
    cancelReason: text('cancel_reason'),
    cancelledBy: text('cancelled_by').$type<'user' | 'provider'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointment_user_id_status_idx').on(t.userId, t.status),
    index('appointment_provider_id_scheduled_idx').on(t.providerId, t.scheduledAt),
    index('appointment_scheduled_at_idx').on(t.scheduledAt),
  ],
);

// ─── Outbox ───────────────────────────────────────────────────────────────────

export const appointmentsOutboxTable = appointmentsSchema.table(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    published: boolean('published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outbox_unpublished_idx').on(t.published, t.createdAt)],
);
