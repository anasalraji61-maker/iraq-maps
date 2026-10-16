/**
 * AppointmentsService — booking, availability, scheduling and reminder logic.
 *
 * Design notes:
 *  - Slots are generated on-demand from provider_availability + time_off.
 *    We persist explicit slots only when a provider manually edits individual
 *    slots or when a booking occurs (to mark the slot unavailable).
 *  - Status transitions:
 *      pending → confirmed (provider action)
 *      pending / confirmed → cancelled (user or provider)
 *      confirmed → completed (provider action)
 *  - Events are written to the transactional outbox table so they survive a
 *    process crash between the DB write and the broker publish.
 *  - Reminder notifications (24 h and 1 h before) are dispatched by a BullMQ
 *    scheduled job (sendReminderNotifications).
 *  - All time is stored as UTC. The client presents it in local time.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, between, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import type {
  Appointment,
  AppointmentId,
  AppointmentStatus,
  ProviderId,
  UserId,
} from '@iraq-maps/contracts';
import {
  appointmentTable,
  appointmentSlotTable,
  providerAvailabilityTable,
  providerTimeOffTable,
  appointmentsOutboxTable,
} from './schema';

// ─── Error ────────────────────────────────────────────────────────────────────

export class AppointmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 422,
  ) {
    super(message);
    this.name = 'AppointmentError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailableSlot {
  id: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  isAvailable: boolean;
}

export interface WeeklySchedule {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
}

export interface TimeOffPeriod {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  reason: string | null;
  createdAt: string;
}

export interface ProviderAppointmentStats {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  completionRate: number | null;
  noShowRate: number | null;
}

export interface AppointmentPage {
  items: Appointment[];
  nextCursor: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a "HH:MM" time string into total minutes since midnight. */
function timeToMinutes(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/** Build a UTC Date from a date string ("YYYY-MM-DD") and a "HH:MM" time string in local wall-clock sense. */
function buildUtcDate(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00.000Z`);
}

/** Format a Date as ISO string (for contract output). */
function iso(d: Date): string {
  return d.toISOString();
}

/** Cursor: encode/decode a Date for pagination. */
function encodeCursor(d: Date): string {
  return Buffer.from(d.toISOString()).toString('base64url');
}

function decodeCursor(cursor: string): Date | null {
  try {
    return new Date(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

/** Map DB appointment row → wire Appointment. */
function mapAppointment(row: typeof appointmentTable.$inferSelect): Appointment {
  const scheduled = row.scheduledAt;
  const date = scheduled.toISOString().split('T')[0] ?? '';
  const time = scheduled.toISOString().slice(11, 16);

  return {
    id: row.id as AppointmentId,
    providerId: row.providerId as ProviderId,
    userId: row.userId as UserId,
    date,
    time,
    service: row.service,
    status: row.status as AppointmentStatus,
    notes: row.notes ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(@Inject('APPOINTMENTS_DB') private readonly db: Db) {}

  // ─── Availability: weekly schedule ─────────────────────────────────────────

  /**
   * Return the provider's weekly schedule (all 7 days; missing days are inactive).
   */
  async getAvailability(providerId: string): Promise<WeeklySchedule[]> {
    const rows = await this.db
      .select()
      .from(providerAvailabilityTable)
      .where(eq(providerAvailabilityTable.providerId, providerId))
      .orderBy(asc(providerAvailabilityTable.dayOfWeek));

    // Fill in missing days as inactive stubs
    const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
    const schedule: WeeklySchedule[] = [];
    for (let d = 0; d < 7; d++) {
      const row = byDay.get(d);
      schedule.push(
        row
          ? {
              dayOfWeek: d,
              openTime: row.openTime,
              closeTime: row.closeTime,
              slotDurationMinutes: row.slotDurationMinutes,
              isActive: row.isActive,
            }
          : { dayOfWeek: d, openTime: '09:00', closeTime: '17:00', slotDurationMinutes: 30, isActive: false },
      );
    }
    return schedule;
  }

  /**
   * Upsert the provider's weekly schedule. Each entry covers one day.
   * Missing days are not changed.
   */
  async setAvailability(providerId: string, schedule: WeeklySchedule[]): Promise<WeeklySchedule[]> {
    if (schedule.length === 0) return this.getAvailability(providerId);

    await this.db.transaction(async (tx) => {
      for (const entry of schedule) {
        const { dayOfWeek, openTime, closeTime, slotDurationMinutes, isActive } = entry;

        // Validate
        if (timeToMinutes(closeTime) <= timeToMinutes(openTime)) {
          throw new AppointmentError(
            'invalid_hours',
            `Day ${dayOfWeek}: close_time must be after open_time`,
            400,
          );
        }

        await tx
          .insert(providerAvailabilityTable)
          .values({
            providerId,
            dayOfWeek,
            openTime,
            closeTime,
            slotDurationMinutes,
            isActive,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [providerAvailabilityTable.providerId, providerAvailabilityTable.dayOfWeek],
            set: {
              openTime,
              closeTime,
              slotDurationMinutes,
              isActive,
              updatedAt: new Date(),
            },
          });
      }
    });

    this.logger.log(`Provider ${providerId}: availability updated (${schedule.length} days)`);
    return this.getAvailability(providerId);
  }

  // ─── Time-off ───────────────────────────────────────────────────────────────

  /**
   * Create a time-off block for the provider.
   * Any existing confirmed/pending appointments that overlap are NOT auto-cancelled —
   * the provider should cancel them manually.
   */
  async createTimeOff(
    providerId: string,
    startDate: string,
    endDate: string,
    reason?: string,
  ): Promise<TimeOffPeriod> {
    if (endDate < startDate) {
      throw new AppointmentError('invalid_dates', 'end_date must be >= start_date', 400);
    }

    const inserted = await this.db
      .insert(providerTimeOffTable)
      .values({ providerId, startDate, endDate, reason: reason ?? null })
      .returning();

    const row = inserted[0]!;
    this.logger.log(`Provider ${providerId}: time-off ${startDate}→${endDate}`);

    return {
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      reason: row.reason ?? null,
      createdAt: iso(row.createdAt),
    };
  }

  /**
   * List all future time-off periods for a provider.
   */
  async listTimeOff(providerId: string): Promise<TimeOffPeriod[]> {
    const today = new Date().toISOString().split('T')[0]!;
    const rows = await this.db
      .select()
      .from(providerTimeOffTable)
      .where(
        and(
          eq(providerTimeOffTable.providerId, providerId),
          gte(providerTimeOffTable.endDate, today),
        ),
      )
      .orderBy(asc(providerTimeOffTable.startDate));

    return rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason ?? null,
      createdAt: iso(r.createdAt),
    }));
  }

  /**
   * Delete a time-off period.
   */
  async deleteTimeOff(providerId: string, timeOffId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(providerTimeOffTable)
      .where(
        and(
          eq(providerTimeOffTable.id, timeOffId),
          eq(providerTimeOffTable.providerId, providerId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new AppointmentError('time_off_not_found', 'Time-off period not found', 404);
    }

    await this.db
      .delete(providerTimeOffTable)
      .where(eq(providerTimeOffTable.id, timeOffId));
  }

  // ─── Slot generation ────────────────────────────────────────────────────────

  /**
   * Return available slots for a given date.
   *
   * Algorithm:
   *  1. Load the provider's schedule for that day of week.
   *  2. If the date falls inside a time-off block, return [].
   *  3. Generate slot boundaries from open_time to close_time.
   *  4. Exclude slots that already have a non-cancelled appointment.
   *  5. Return only future slots (past slots are unavailable).
   */
  async getAvailableSlots(providerId: string, date: string): Promise<AvailableSlot[]> {
    const d = new Date(`${date}T00:00:00.000Z`);
    const dayOfWeek = d.getUTCDay(); // 0=Sun

    // Load schedule
    const scheduleRows = await this.db
      .select()
      .from(providerAvailabilityTable)
      .where(
        and(
          eq(providerAvailabilityTable.providerId, providerId),
          eq(providerAvailabilityTable.dayOfWeek, dayOfWeek),
          eq(providerAvailabilityTable.isActive, true),
        ),
      )
      .limit(1);

    if (scheduleRows.length === 0) return [];
    const sched = scheduleRows[0]!;

    // Check time-off
    const timeOffRows = await this.db
      .select()
      .from(providerTimeOffTable)
      .where(
        and(
          eq(providerTimeOffTable.providerId, providerId),
          lte(providerTimeOffTable.startDate, date),
          gte(providerTimeOffTable.endDate, date),
        ),
      )
      .limit(1);

    if (timeOffRows.length > 0) return [];

    // Generate slot boundaries
    const openMin = timeToMinutes(sched.openTime);
    const closeMin = timeToMinutes(sched.closeTime);
    const duration = sched.slotDurationMinutes;
    const now = new Date();

    const boundaries: { startMin: number; endMin: number }[] = [];
    for (let start = openMin; start + duration <= closeMin; start += duration) {
      boundaries.push({ startMin: start, endMin: start + duration });
    }

    if (boundaries.length === 0) return [];

    // Load existing booked slots for that date
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const bookedRows = await this.db
      .select({ scheduledAt: appointmentTable.scheduledAt })
      .from(appointmentTable)
      .where(
        and(
          eq(appointmentTable.providerId, providerId),
          gte(appointmentTable.scheduledAt, dayStart),
          lte(appointmentTable.scheduledAt, dayEnd),
          ne(appointmentTable.status, 'cancelled'),
        ),
      );

    const bookedMinutes = new Set(
      bookedRows.map((r) => {
        const h = r.scheduledAt.getUTCHours();
        const m = r.scheduledAt.getUTCMinutes();
        return h * 60 + m;
      }),
    );

    // Also load persisted explicit slots for this date (provider may have manual overrides)
    const persistedRows = await this.db
      .select()
      .from(appointmentSlotTable)
      .where(
        and(
          eq(appointmentSlotTable.providerId, providerId),
          gte(appointmentSlotTable.startTime, dayStart),
          lte(appointmentSlotTable.startTime, dayEnd),
        ),
      );

    const persistedByMin = new Map(
      persistedRows.map((r) => {
        const h = r.startTime.getUTCHours();
        const m = r.startTime.getUTCMinutes();
        return [h * 60 + m, r];
      }),
    );

    // Build slot list
    const slots: AvailableSlot[] = [];
    for (const { startMin, endMin } of boundaries) {
      const slotStart = buildUtcDate(date, `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`);
      const slotEnd = buildUtcDate(date, `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`);

      // Skip past slots
      if (slotStart <= now) continue;

      const persisted = persistedByMin.get(startMin);
      const isBooked = bookedMinutes.has(startMin);
      const isAvailable = persisted ? persisted.isAvailable && !isBooked : !isBooked;

      slots.push({
        id: persisted?.id ?? `generated:${date}:${startMin}`,
        startTime: iso(slotStart),
        endTime: iso(slotEnd),
        isAvailable,
      });
    }

    return slots;
  }

  // ─── Bookings ───────────────────────────────────────────────────────────────

  /**
   * Book an appointment.
   * - Verifies the slot is available.
   * - Marks the slot as unavailable (or creates an explicit slot record).
   * - Emits appointments.created.v1 via the outbox.
   */
  async createAppointment(
    userId: string,
    providerId: string,
    slotId: string | undefined,
    date: string,
    time: string,
    service: string,
    notes?: string,
  ): Promise<Appointment> {
    return this.db.transaction(async (tx) => {
      const scheduledAt = buildUtcDate(date, time);

      if (scheduledAt <= new Date()) {
        throw new AppointmentError('slot_in_past', 'Cannot book a slot in the past', 400);
      }

      // Check for conflicting appointment at same time
      const conflict = await tx
        .select({ id: appointmentTable.id })
        .from(appointmentTable)
        .where(
          and(
            eq(appointmentTable.providerId, providerId),
            eq(appointmentTable.scheduledAt, scheduledAt),
            ne(appointmentTable.status, 'cancelled'),
          ),
        )
        .limit(1);

      if (conflict.length > 0) {
        throw new AppointmentError('slot_unavailable', 'This slot is no longer available', 409);
      }

      // Check time-off
      const dateStr = date;
      const timeOff = await tx
        .select({ id: providerTimeOffTable.id })
        .from(providerTimeOffTable)
        .where(
          and(
            eq(providerTimeOffTable.providerId, providerId),
            lte(providerTimeOffTable.startDate, dateStr),
            gte(providerTimeOffTable.endDate, dateStr),
          ),
        )
        .limit(1);

      if (timeOff.length > 0) {
        throw new AppointmentError('provider_off', 'Provider is not available on this date', 409);
      }

      // Determine slot duration from schedule
      const dayOfWeek = scheduledAt.getUTCDay();
      const schedRows = await tx
        .select({ slotDurationMinutes: providerAvailabilityTable.slotDurationMinutes })
        .from(providerAvailabilityTable)
        .where(
          and(
            eq(providerAvailabilityTable.providerId, providerId),
            eq(providerAvailabilityTable.dayOfWeek, dayOfWeek),
          ),
        )
        .limit(1);

      const duration = schedRows[0]?.slotDurationMinutes ?? 30;
      const endAt = new Date(scheduledAt.getTime() + duration * 60_000);

      // Handle explicit slot
      let resolvedSlotId: string | null = null;
      if (slotId && !slotId.startsWith('generated:')) {
        const slotRows = await tx
          .select()
          .from(appointmentSlotTable)
          .where(
            and(
              eq(appointmentSlotTable.id, slotId),
              eq(appointmentSlotTable.providerId, providerId),
              eq(appointmentSlotTable.isAvailable, true),
            ),
          )
          .limit(1);

        if (slotRows.length === 0) {
          throw new AppointmentError('slot_unavailable', 'Slot is not available', 409);
        }

        await tx
          .update(appointmentSlotTable)
          .set({ isAvailable: false })
          .where(eq(appointmentSlotTable.id, slotId));

        resolvedSlotId = slotId;
      }

      // Insert appointment
      const inserted = await tx
        .insert(appointmentTable)
        .values({
          userId,
          providerId,
          slotId: resolvedSlotId,
          scheduledAt,
          endAt,
          service,
          notes: notes ?? null,
          status: 'pending',
        })
        .returning();

      const appt = inserted[0]!;

      // Emit outbox event
      await tx.insert(appointmentsOutboxTable).values({
        eventType: 'appointments.created.v1',
        payload: {
          appointmentId: appt.id,
          userId,
          providerId,
          scheduledAt: iso(scheduledAt),
          service,
        },
      });

      this.logger.log(`Appointment created: id=${appt.id} user=${userId} provider=${providerId}`);
      return mapAppointment(appt);
    });
  }

  /**
   * Cancel an appointment.
   * - Users may cancel their own pending or confirmed appointments.
   * - Providers may cancel any non-terminal appointment.
   * - Frees the slot back to available if it was an explicit slot.
   */
  async cancelAppointment(
    actorId: string,
    actorRole: 'user' | 'provider',
    appointmentId: string,
    reason?: string,
  ): Promise<Appointment> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(appointmentTable)
        .where(eq(appointmentTable.id, appointmentId))
        .for('update')
        .limit(1);

      if (rows.length === 0) {
        throw new AppointmentError('appointment_not_found', 'Appointment not found', 404);
      }

      const appt = rows[0]!;

      // Ownership check
      if (actorRole === 'user' && appt.userId !== actorId) {
        throw new AppointmentError('forbidden', 'Not your appointment', 403);
      }
      if (actorRole === 'provider' && appt.providerId !== actorId) {
        throw new AppointmentError('forbidden', 'Not your appointment', 403);
      }

      if (appt.status === 'cancelled' || appt.status === 'completed') {
        throw new AppointmentError(
          'invalid_transition',
          `Cannot cancel appointment in status '${appt.status}'`,
          422,
        );
      }

      const updated = await tx
        .update(appointmentTable)
        .set({
          status: 'cancelled',
          cancelReason: reason ?? null,
          cancelledBy: actorRole,
          updatedAt: new Date(),
        })
        .where(eq(appointmentTable.id, appointmentId))
        .returning();

      // Release explicit slot
      if (appt.slotId) {
        await tx
          .update(appointmentSlotTable)
          .set({ isAvailable: true })
          .where(eq(appointmentSlotTable.id, appt.slotId));
      }

      await tx.insert(appointmentsOutboxTable).values({
        eventType: 'appointments.cancelled.v1',
        payload: { appointmentId, cancelledBy: actorRole, reason: reason ?? null },
      });

      this.logger.log(`Appointment ${appointmentId} cancelled by ${actorRole} ${actorId}`);
      return mapAppointment(updated[0]!);
    });
  }

  /**
   * Reschedule an appointment to a new slot.
   * - Only the user who booked can reschedule.
   * - Only pending/confirmed appointments can be rescheduled.
   * - Validates new slot availability.
   */
  async rescheduleAppointment(
    userId: string,
    appointmentId: string,
    newDate: string,
    newTime: string,
  ): Promise<Appointment> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(appointmentTable)
        .where(and(eq(appointmentTable.id, appointmentId), eq(appointmentTable.userId, userId)))
        .for('update')
        .limit(1);

      if (rows.length === 0) {
        throw new AppointmentError('appointment_not_found', 'Appointment not found', 404);
      }

      const appt = rows[0]!;

      if (appt.status !== 'pending' && appt.status !== 'confirmed') {
        throw new AppointmentError(
          'invalid_transition',
          `Cannot reschedule appointment in status '${appt.status}'`,
          422,
        );
      }

      const newScheduledAt = buildUtcDate(newDate, newTime);
      if (newScheduledAt <= new Date()) {
        throw new AppointmentError('slot_in_past', 'Cannot reschedule to a past slot', 400);
      }

      // Check conflict at new time
      const conflict = await tx
        .select({ id: appointmentTable.id })
        .from(appointmentTable)
        .where(
          and(
            eq(appointmentTable.providerId, appt.providerId),
            eq(appointmentTable.scheduledAt, newScheduledAt),
            ne(appointmentTable.status, 'cancelled'),
            ne(appointmentTable.id, appointmentId),
          ),
        )
        .limit(1);

      if (conflict.length > 0) {
        throw new AppointmentError('slot_unavailable', 'New slot is not available', 409);
      }

      // Release old explicit slot
      if (appt.slotId) {
        await tx
          .update(appointmentSlotTable)
          .set({ isAvailable: true })
          .where(eq(appointmentSlotTable.id, appt.slotId));
      }

      const dayOfWeek = newScheduledAt.getUTCDay();
      const schedRows = await tx
        .select({ slotDurationMinutes: providerAvailabilityTable.slotDurationMinutes })
        .from(providerAvailabilityTable)
        .where(
          and(
            eq(providerAvailabilityTable.providerId, appt.providerId),
            eq(providerAvailabilityTable.dayOfWeek, dayOfWeek),
          ),
        )
        .limit(1);

      const duration = schedRows[0]?.slotDurationMinutes ?? 30;
      const newEndAt = new Date(newScheduledAt.getTime() + duration * 60_000);

      const updated = await tx
        .update(appointmentTable)
        .set({
          scheduledAt: newScheduledAt,
          endAt: newEndAt,
          slotId: null,
          status: 'pending', // reset to pending after reschedule
          updatedAt: new Date(),
        })
        .where(eq(appointmentTable.id, appointmentId))
        .returning();

      await tx.insert(appointmentsOutboxTable).values({
        eventType: 'appointments.rescheduled.v1',
        payload: {
          appointmentId,
          userId,
          providerId: appt.providerId,
          newScheduledAt: iso(newScheduledAt),
        },
      });

      this.logger.log(`Appointment ${appointmentId} rescheduled to ${newDate} ${newTime}`);
      return mapAppointment(updated[0]!);
    });
  }

  // ─── Provider actions ───────────────────────────────────────────────────────

  /**
   * Provider confirms a pending appointment.
   */
  async confirmAppointment(providerId: string, appointmentId: string): Promise<Appointment> {
    return this.transitionStatus(providerId, 'provider', appointmentId, 'pending', 'confirmed');
  }

  /**
   * Provider marks an appointment as completed.
   */
  async completeAppointment(providerId: string, appointmentId: string): Promise<Appointment> {
    return this.transitionStatus(providerId, 'provider', appointmentId, 'confirmed', 'completed');
  }

  private async transitionStatus(
    actorId: string,
    actorRole: 'user' | 'provider',
    appointmentId: string,
    expectedStatus: AppointmentStatus,
    newStatus: AppointmentStatus,
  ): Promise<Appointment> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(appointmentTable)
        .where(eq(appointmentTable.id, appointmentId))
        .for('update')
        .limit(1);

      if (rows.length === 0) {
        throw new AppointmentError('appointment_not_found', 'Appointment not found', 404);
      }

      const appt = rows[0]!;

      if (actorRole === 'provider' && appt.providerId !== actorId) {
        throw new AppointmentError('forbidden', 'Not your appointment', 403);
      }

      if (appt.status !== expectedStatus) {
        throw new AppointmentError(
          'invalid_transition',
          `Expected status '${expectedStatus}', got '${appt.status}'`,
          422,
        );
      }

      const updated = await tx
        .update(appointmentTable)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(appointmentTable.id, appointmentId))
        .returning();

      await tx.insert(appointmentsOutboxTable).values({
        eventType: `appointments.${newStatus}.v1`,
        payload: { appointmentId, providerId: appt.providerId, userId: appt.userId },
      });

      this.logger.log(`Appointment ${appointmentId}: ${expectedStatus} → ${newStatus}`);
      return mapAppointment(updated[0]!);
    });
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  /**
   * User's own appointments, optionally filtered by status, paginated.
   */
  async getMyAppointments(
    userId: string,
    opts: { status?: AppointmentStatus; cursor?: string; limit?: number },
  ): Promise<AppointmentPage> {
    const { status, cursor, limit = 20 } = opts;

    const conditions = [eq(appointmentTable.userId, userId)];
    if (status) {
      conditions.push(eq(appointmentTable.status, status) as (typeof conditions)[0]);
    }
    if (cursor) {
      const cursorDate = decodeCursor(cursor);
      if (cursorDate) {
        conditions.push(lte(appointmentTable.scheduledAt, cursorDate) as (typeof conditions)[0]);
      }
    }

    const rows = await this.db
      .select()
      .from(appointmentTable)
      .where(and(...conditions))
      .orderBy(desc(appointmentTable.scheduledAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1]!.scheduledAt)
        : null;

    return { items: items.map(mapAppointment), nextCursor };
  }

  /**
   * Provider's appointments for a specific date, optionally paginated.
   */
  async getProviderAppointments(
    providerId: string,
    date: string | undefined,
    opts: { status?: AppointmentStatus; cursor?: string; limit?: number },
  ): Promise<AppointmentPage> {
    const { status, cursor, limit = 50 } = opts;

    const conditions = [eq(appointmentTable.providerId, providerId)];

    if (date) {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      conditions.push(between(appointmentTable.scheduledAt, dayStart, dayEnd) as (typeof conditions)[0]);
    }

    if (status) {
      conditions.push(eq(appointmentTable.status, status) as (typeof conditions)[0]);
    }

    if (cursor) {
      const cursorDate = decodeCursor(cursor);
      if (cursorDate) {
        conditions.push(gte(appointmentTable.scheduledAt, cursorDate) as (typeof conditions)[0]);
      }
    }

    const rows = await this.db
      .select()
      .from(appointmentTable)
      .where(and(...conditions))
      .orderBy(asc(appointmentTable.scheduledAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor(items[items.length - 1]!.scheduledAt)
        : null;

    return { items: items.map(mapAppointment), nextCursor };
  }

  /**
   * Stats for a provider's appointment history.
   */
  async getProviderStats(providerId: string): Promise<ProviderAppointmentStats> {
    const rows = await this.db
      .select({
        status: appointmentTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(appointmentTable)
      .where(eq(appointmentTable.providerId, providerId))
      .groupBy(appointmentTable.status);

    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = r.count;
    }

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const completed = byStatus['completed'] ?? 0;
    const cancelled = byStatus['cancelled'] ?? 0;
    const terminal = completed + cancelled;

    return {
      total,
      pending: byStatus['pending'] ?? 0,
      confirmed: byStatus['confirmed'] ?? 0,
      completed,
      cancelled,
      completionRate: terminal > 0 ? Math.round((completed / terminal) * 100) / 100 : null,
      noShowRate: null, // requires no-show tracking (future milestone)
    };
  }

  // ─── Manual slot management ─────────────────────────────────────────────────

  /**
   * Explicitly create a slot (provider adds a one-off opening).
   */
  async createSlot(
    providerId: string,
    startTime: string,
    endTime: string,
  ): Promise<AvailableSlot> {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      throw new AppointmentError('invalid_slot', 'end_time must be after start_time', 400);
    }
    if (start <= new Date()) {
      throw new AppointmentError('slot_in_past', 'Cannot create a slot in the past', 400);
    }

    const inserted = await this.db
      .insert(appointmentSlotTable)
      .values({ providerId, startTime: start, endTime: end, isAvailable: true })
      .returning();

    const row = inserted[0]!;
    return {
      id: row.id,
      startTime: iso(row.startTime),
      endTime: iso(row.endTime),
      isAvailable: row.isAvailable,
    };
  }

  /**
   * Block or unblock an explicit slot.
   */
  async updateSlotAvailability(
    providerId: string,
    slotId: string,
    isAvailable: boolean,
  ): Promise<AvailableSlot> {
    const rows = await this.db
      .select()
      .from(appointmentSlotTable)
      .where(
        and(eq(appointmentSlotTable.id, slotId), eq(appointmentSlotTable.providerId, providerId)),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new AppointmentError('slot_not_found', 'Slot not found', 404);
    }

    const updated = await this.db
      .update(appointmentSlotTable)
      .set({ isAvailable })
      .where(eq(appointmentSlotTable.id, slotId))
      .returning();

    const row = updated[0]!;
    return {
      id: row.id,
      startTime: iso(row.startTime),
      endTime: iso(row.endTime),
      isAvailable: row.isAvailable,
    };
  }

  // ─── Reminder job ───────────────────────────────────────────────────────────

  /**
   * Called by the BullMQ scheduler (every 15 minutes).
   * Finds upcoming confirmed appointments at 24 h and 1 h windows, emits
   * reminder events via the outbox.
   *
   * Deduplication: the event_type includes the window so the push sender can
   * deduplicate by (appointmentId, window) in a separate DB table.
   */
  async sendReminderNotifications(): Promise<{ reminded: number }> {
    const now = new Date();

    const windows = [
      { label: '24h', from: new Date(now.getTime() + 23 * 60 * 60_000), to: new Date(now.getTime() + 25 * 60 * 60_000) },
      { label: '1h', from: new Date(now.getTime() + 50 * 60_000), to: new Date(now.getTime() + 70 * 60_000) },
    ];

    let reminded = 0;

    for (const window of windows) {
      const upcomingRows = await this.db
        .select()
        .from(appointmentTable)
        .where(
          and(
            eq(appointmentTable.status, 'confirmed'),
            gte(appointmentTable.scheduledAt, window.from),
            lte(appointmentTable.scheduledAt, window.to),
          ),
        );

      if (upcomingRows.length === 0) continue;

      // Emit outbox events (push sender will dedup)
      await this.db.insert(appointmentsOutboxTable).values(
        upcomingRows.map((appt) => ({
          eventType: `appointments.reminder.${window.label}.v1`,
          payload: {
            appointmentId: appt.id,
            userId: appt.userId,
            providerId: appt.providerId,
            scheduledAt: iso(appt.scheduledAt),
            service: appt.service,
            window: window.label,
          },
        })),
      );

      reminded += upcomingRows.length;
      this.logger.log(`Reminder ${window.label}: queued ${upcomingRows.length} notifications`);
    }

    return { reminded };
  }
}
