/**
 * AvailabilityService — provider schedule management.
 *
 * Responsibilities:
 *  - Weekly schedule CRUD (open/close times, slot duration, max capacity)
 *  - Schedule exceptions (closed days or special hours for public holidays etc.)
 *  - Blocked slot management (provider manually blocks a specific time window)
 *
 * Iraq-specific notes:
 *  - The Iraqi working week runs Sunday–Thursday (0–4). Friday (5) and Saturday
 *    (6) are the weekend, so isActive defaults to false for those days.
 *  - All times stored as UTC; Baghdad is UTC+3 year-round (no DST).
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import type {
  WeekdaySchedule,
  ScheduleException,
  BlockedSlot,
  SetScheduleBody,
  AddExceptionBody,
  BlockSlotBody,
} from '@iraq-maps/contracts';
import {
  providerAvailabilityTable,
  providerScheduleCapacityTable,
  scheduleExceptionTable,
  blockedSlotTable,
} from './schema';
import { AppointmentError } from './appointments.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function iso(d: Date): string {
  return d.toISOString();
}

function mapScheduleRow(
  avail: typeof providerAvailabilityTable.$inferSelect,
  capacity: typeof providerScheduleCapacityTable.$inferSelect | undefined,
): WeekdaySchedule {
  return {
    dayOfWeek: avail.dayOfWeek,
    openTime: avail.openTime,
    closeTime: avail.closeTime,
    slotDurationMinutes: avail.slotDurationMinutes,
    maxCapacity: capacity?.maxCapacity ?? 1,
    isActive: avail.isActive,
  };
}

function mapException(row: typeof scheduleExceptionTable.$inferSelect): ScheduleException {
  return {
    id: row.id,
    providerId: row.providerId as ScheduleException['providerId'],
    date: row.exceptionDate,
    isClosed: row.isClosed,
    openTime: row.openTime ?? null,
    closeTime: row.closeTime ?? null,
    createdAt: iso(row.createdAt),
  };
}

function mapBlockedSlot(row: typeof blockedSlotTable.$inferSelect): BlockedSlot {
  return {
    id: row.id,
    providerId: row.providerId as BlockedSlot['providerId'],
    startTime: iso(row.startTime),
    endTime: iso(row.endTime),
    reason: row.reason ?? null,
    createdAt: iso(row.createdAt),
  };
}

// ─── Iraqi weekend constants ──────────────────────────────────────────────────

/** Day indices that are part of the Iraqi weekend (Friday=5, Saturday=6). */
const IRAQI_WEEKEND = new Set([5, 6]);

// ─── Default schedule helpers ─────────────────────────────────────────────────

/**
 * Build a full 7-day default schedule for a new provider.
 *  - Sunday–Thursday: 09:00–17:00, 30-min slots, capacity 1, active
 *  - Friday–Saturday: inactive (Iraqi weekend)
 */
export function buildDefaultWeeklySchedule(): WeekdaySchedule[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    openTime: '09:00',
    closeTime: '17:00',
    slotDurationMinutes: 30,
    maxCapacity: 1,
    isActive: !IRAQI_WEEKEND.has(i),
  }));
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(@Inject('APPOINTMENTS_DB') private readonly db: Db) {}

  // ─── Schedule ────────────────────────────────────────────────────────────────

  /**
   * getSchedule — returns the weekly schedule for a provider.
   * If no schedule has been saved yet, returns the system default.
   */
  async getSchedule(providerId: string): Promise<WeekdaySchedule[]> {
    const availRows = await this.db
      .select()
      .from(providerAvailabilityTable)
      .where(eq(providerAvailabilityTable.providerId, providerId))
      .orderBy(providerAvailabilityTable.dayOfWeek);

    if (availRows.length === 0) {
      return buildDefaultWeeklySchedule();
    }

    const capacityRows = await this.db
      .select()
      .from(providerScheduleCapacityTable)
      .where(eq(providerScheduleCapacityTable.providerId, providerId));

    const capacityMap = new Map(capacityRows.map((r) => [r.dayOfWeek, r]));

    return availRows.map((row) => mapScheduleRow(row, capacityMap.get(row.dayOfWeek)));
  }

  /**
   * setSchedule — upsert the full 7-day schedule for a provider.
   * Validates that openTime < closeTime for active days.
   * The Iraqi weekend days (Fri/Sat) can still be set active if the provider
   * chooses to work those days.
   */
  async setSchedule(providerId: string, body: SetScheduleBody): Promise<WeekdaySchedule[]> {
    const { schedule } = body;

    // Validate time ordering for active days
    for (const day of schedule) {
      if (day.isActive) {
        const open = day.openTime.replace(':', '');
        const close = day.closeTime.replace(':', '');
        if (open >= close) {
          throw new AppointmentError(
            'invalid_hours',
            `Day ${day.dayOfWeek}: openTime must be before closeTime`,
            400,
          );
        }
      }
    }

    await this.db.transaction(async (tx) => {
      for (const day of schedule) {
        // Upsert availability row
        await tx
          .insert(providerAvailabilityTable)
          .values({
            providerId,
            dayOfWeek: day.dayOfWeek,
            openTime: day.openTime,
            closeTime: day.closeTime,
            slotDurationMinutes: day.slotDurationMinutes,
            isActive: day.isActive,
          })
          .onConflictDoUpdate({
            target: [providerAvailabilityTable.providerId, providerAvailabilityTable.dayOfWeek],
            set: {
              openTime: day.openTime,
              closeTime: day.closeTime,
              slotDurationMinutes: day.slotDurationMinutes,
              isActive: day.isActive,
              updatedAt: new Date(),
            },
          });

        // Upsert capacity row
        await tx
          .insert(providerScheduleCapacityTable)
          .values({
            providerId,
            dayOfWeek: day.dayOfWeek,
            maxCapacity: day.maxCapacity,
          })
          .onConflictDoUpdate({
            target: [
              providerScheduleCapacityTable.providerId,
              providerScheduleCapacityTable.dayOfWeek,
            ],
            set: {
              maxCapacity: day.maxCapacity,
              updatedAt: new Date(),
            },
          });
      }
    });

    this.logger.log(`Provider ${providerId} updated weekly schedule (${schedule.length} days)`);
    return this.getSchedule(providerId);
  }

  // ─── Exceptions ───────────────────────────────────────────────────────────────

  /**
   * listExceptions — returns upcoming exceptions (from today onwards).
   */
  async listExceptions(providerId: string): Promise<ScheduleException[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(scheduleExceptionTable)
      .where(
        and(
          eq(scheduleExceptionTable.providerId, providerId),
          gte(scheduleExceptionTable.exceptionDate, today),
        ),
      )
      .orderBy(scheduleExceptionTable.exceptionDate);

    return rows.map(mapException);
  }

  /**
   * addException — add or update a schedule exception for a specific date.
   * If the date already has an exception, it is replaced (upsert).
   */
  async addException(providerId: string, body: AddExceptionBody): Promise<ScheduleException> {
    const { date, isClosed, openTime, closeTime } = body;

    if (!isClosed) {
      if (!openTime || !closeTime) {
        throw new AppointmentError(
          'missing_hours',
          'openTime and closeTime are required when isClosed is false',
          400,
        );
      }
      if (openTime >= closeTime) {
        throw new AppointmentError('invalid_hours', 'openTime must be before closeTime', 400);
      }
    }

    const inserted = await this.db
      .insert(scheduleExceptionTable)
      .values({
        providerId,
        exceptionDate: date,
        isClosed,
        openTime: isClosed ? null : openTime,
        closeTime: isClosed ? null : closeTime,
      })
      .onConflictDoUpdate({
        target: [scheduleExceptionTable.providerId, scheduleExceptionTable.exceptionDate],
        set: {
          isClosed,
          openTime: isClosed ? null : openTime,
          closeTime: isClosed ? null : closeTime,
        },
      })
      .returning();

    this.logger.log(`Provider ${providerId} added schedule exception for ${date}`);
    return mapException(inserted[0]!);
  }

  /**
   * deleteException — remove a schedule exception by its ID.
   */
  async deleteException(providerId: string, exceptionId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(scheduleExceptionTable)
      .where(
        and(
          eq(scheduleExceptionTable.id, exceptionId),
          eq(scheduleExceptionTable.providerId, providerId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new AppointmentError('not_found', 'Schedule exception not found', 404);
    }

    await this.db
      .delete(scheduleExceptionTable)
      .where(eq(scheduleExceptionTable.id, exceptionId));

    this.logger.log(`Provider ${providerId} deleted schedule exception ${exceptionId}`);
  }

  // ─── Blocked slots ────────────────────────────────────────────────────────────

  /**
   * blockSlot — provider blocks a specific time window.
   * No existing appointment check is performed here — callers should cancel
   * conflicting appointments separately.
   */
  async blockSlot(providerId: string, body: BlockSlotBody): Promise<BlockedSlot> {
    const { startTime, endTime, reason } = body;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new AppointmentError('invalid_time', 'Invalid startTime or endTime', 400);
    }
    if (end <= start) {
      throw new AppointmentError('invalid_range', 'endTime must be after startTime', 400);
    }
    if (start < new Date()) {
      throw new AppointmentError('in_past', 'Cannot block a slot in the past', 400);
    }

    const inserted = await this.db
      .insert(blockedSlotTable)
      .values({
        providerId,
        startTime: start,
        endTime: end,
        reason: reason ?? null,
      })
      .returning();

    this.logger.log(
      `Provider ${providerId} blocked slot ${startTime} – ${endTime}${reason ? ` (${reason})` : ''}`,
    );
    return mapBlockedSlot(inserted[0]!);
  }

  /**
   * unblockSlot — remove a blocked slot by its ID.
   */
  async unblockSlot(providerId: string, slotId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(blockedSlotTable)
      .where(and(eq(blockedSlotTable.id, slotId), eq(blockedSlotTable.providerId, providerId)))
      .limit(1);

    if (rows.length === 0) {
      throw new AppointmentError('not_found', 'Blocked slot not found', 404);
    }

    await this.db.delete(blockedSlotTable).where(eq(blockedSlotTable.id, slotId));

    this.logger.log(`Provider ${providerId} unblocked slot ${slotId}`);
  }

  /**
   * listBlockedSlots — returns future blocked slots for a provider.
   */
  async listBlockedSlots(providerId: string): Promise<BlockedSlot[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(blockedSlotTable)
      .where(
        and(
          eq(blockedSlotTable.providerId, providerId),
          gte(blockedSlotTable.startTime, now),
        ),
      )
      .orderBy(blockedSlotTable.startTime);

    return rows.map(mapBlockedSlot);
  }

  /**
   * isSlotBlocked — check if a given time window overlaps with any blocked slot.
   * Used internally by AppointmentsService when computing available slots.
   */
  async isSlotBlocked(providerId: string, startTime: Date, endTime: Date): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(blockedSlotTable)
      .where(
        and(
          eq(blockedSlotTable.providerId, providerId),
          lte(blockedSlotTable.startTime, endTime),
          gte(blockedSlotTable.endTime, startTime),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  /**
   * getExceptionForDate — returns the schedule exception for a specific date if any.
   */
  async getExceptionForDate(
    providerId: string,
    date: string,
  ): Promise<ScheduleException | null> {
    const rows = await this.db
      .select()
      .from(scheduleExceptionTable)
      .where(
        and(
          eq(scheduleExceptionTable.providerId, providerId),
          eq(scheduleExceptionTable.exceptionDate, date),
        ),
      )
      .limit(1);

    return rows.length > 0 ? mapException(rows[0]!) : null;
  }
}
