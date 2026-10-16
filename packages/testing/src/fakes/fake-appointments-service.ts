/**
 * FakeAppointmentsService — in-memory appointments service fake for testing.
 * Covers availability slots, bookings, cancellations, capacity enforcement.
 */

type UserId = string;
type SlotId = string;
type BookingId = string;

export interface AvailabilitySlot {
  id: SlotId;
  providerId: UserId;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  maxBookings: number;
  createdAt: Date;
}

export interface Booking {
  id: BookingId;
  slotId: SlotId;
  customerId: UserId;
  status: 'confirmed' | 'pending' | 'cancelled';
  note?: string;
  createdAt: Date;
  cancelledAt?: Date;
}

export type CreateSlotInput = {
  startAt: Date;
  endAt: Date;
  durationMinutes?: number;
  maxBookings?: number;
};

export type CreateBookingInput = {
  slotId: SlotId;
  note?: string;
};

export class FakeAppointmentsService {
  private readonly slots = new Map<SlotId, AvailabilitySlot>();
  private readonly bookings = new Map<BookingId, Booking>();
  private slotSeq = 0;
  private bookingSeq = 0;

  // ─── Availability ─────────────────────────────────────────────────────────

  async createSlot(
    providerId: UserId,
    input: CreateSlotInput,
  ): Promise<AvailabilitySlot> {
    const { startAt, endAt, durationMinutes = 60, maxBookings = 1 } = input;

    if (endAt <= startAt) {
      throw Object.assign(new Error('endAt must be after startAt'), { code: 'INVALID_RANGE' });
    }
    if (startAt <= new Date()) {
      throw Object.assign(new Error('startAt must be in the future'), { code: 'PAST_SLOT' });
    }

    const id: SlotId = `slot-${++this.slotSeq}`;
    const slot: AvailabilitySlot = {
      id,
      providerId,
      startAt,
      endAt,
      durationMinutes,
      maxBookings,
      createdAt: new Date(),
    };
    this.slots.set(id, slot);
    return slot;
  }

  async getSlot(slotId: SlotId): Promise<AvailabilitySlot | null> {
    return this.slots.get(slotId) ?? null;
  }

  async listProviderSlots(
    providerId: UserId,
    opts: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<{ items: AvailabilitySlot[] }> {
    const { from, to, limit = 50 } = opts;
    const items = [...this.slots.values()]
      .filter((s) => s.providerId === providerId)
      .filter((s) => (from ? s.startAt >= from : true))
      .filter((s) => (to ? s.endAt <= to : true))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .slice(0, limit);
    return { items };
  }

  async listPublicSlots(
    providerId: UserId,
    opts: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<{ items: (AvailabilitySlot & { remainingCapacity: number })[] }> {
    const { from, to, limit = 50 } = opts;
    const allSlots = [...this.slots.values()]
      .filter((s) => s.providerId === providerId)
      .filter((s) => (from ? s.startAt >= from : true))
      .filter((s) => (to ? s.endAt <= to : true))
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .slice(0, limit);

    const items = allSlots.map((s) => ({
      ...s,
      remainingCapacity: s.maxBookings - this.confirmedBookingCount(s.id),
    }));
    return { items };
  }

  async deleteSlot(slotId: SlotId, providerId: UserId): Promise<void> {
    const slot = this.slots.get(slotId);
    if (!slot) throw Object.assign(new Error('Slot not found'), { code: 'NOT_FOUND' });
    if (slot.providerId !== providerId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }
    this.slots.delete(slotId);
    // Cancel all bookings for this slot
    for (const [id, b] of this.bookings) {
      if (b.slotId === slotId && b.status !== 'cancelled') {
        this.bookings.set(id, { ...b, status: 'cancelled', cancelledAt: new Date() });
      }
    }
  }

  // ─── Bookings ──────────────────────────────────────────────────────────────

  async createBooking(
    customerId: UserId,
    input: CreateBookingInput,
  ): Promise<Booking> {
    const { slotId, note } = input;
    const slot = this.slots.get(slotId);
    if (!slot) {
      throw Object.assign(new Error('Slot not found'), { code: 'NOT_FOUND' });
    }

    // Check capacity
    const confirmed = this.confirmedBookingCount(slotId);
    if (confirmed >= slot.maxBookings) {
      throw Object.assign(new Error('Slot is fully booked'), { code: 'SLOT_FULL' });
    }

    // Check for duplicate booking by same customer
    const existing = [...this.bookings.values()].find(
      (b) => b.slotId === slotId && b.customerId === customerId && b.status !== 'cancelled',
    );
    if (existing) {
      return existing; // idempotent
    }

    const id: BookingId = `booking-${++this.bookingSeq}`;
    const booking: Booking = {
      id,
      slotId,
      customerId,
      status: 'confirmed',
      note,
      createdAt: new Date(),
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async getBooking(bookingId: BookingId): Promise<Booking | null> {
    return this.bookings.get(bookingId) ?? null;
  }

  async cancelBooking(bookingId: BookingId, actorId: UserId): Promise<void> {
    const booking = this.bookings.get(bookingId);
    if (!booking) {
      throw Object.assign(new Error('Booking not found'), { code: 'NOT_FOUND' });
    }

    const slot = this.slots.get(booking.slotId);
    const isCustomer = booking.customerId === actorId;
    const isProvider = slot?.providerId === actorId;

    if (!isCustomer && !isProvider) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    this.bookings.set(bookingId, {
      ...booking,
      status: 'cancelled',
      cancelledAt: new Date(),
    });
  }

  async listCustomerBookings(
    customerId: UserId,
    opts: { status?: Booking['status']; limit?: number } = {},
  ): Promise<{ items: Booking[] }> {
    const { status, limit = 50 } = opts;
    const items = [...this.bookings.values()]
      .filter((b) => b.customerId === customerId)
      .filter((b) => (status ? b.status === status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return { items };
  }

  async listProviderBookings(
    providerId: UserId,
    opts: { status?: Booking['status']; limit?: number } = {},
  ): Promise<{ items: (Booking & { slot: AvailabilitySlot })[] }> {
    const { status, limit = 50 } = opts;
    const providerSlotIds = new Set(
      [...this.slots.values()]
        .filter((s) => s.providerId === providerId)
        .map((s) => s.id),
    );

    const items = [...this.bookings.values()]
      .filter((b) => providerSlotIds.has(b.slotId))
      .filter((b) => (status ? b.status === status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((b) => ({ ...b, slot: this.slots.get(b.slotId)! }));

    return { items };
  }

  // ─── Double-booking enforcement ────────────────────────────────────────────

  private confirmedBookingCount(slotId: SlotId): number {
    return [...this.bookings.values()].filter(
      (b) => b.slotId === slotId && b.status !== 'cancelled',
    ).length;
  }

  async remainingCapacity(slotId: SlotId): Promise<number> {
    const slot = this.slots.get(slotId);
    if (!slot) return 0;
    return Math.max(0, slot.maxBookings - this.confirmedBookingCount(slotId));
  }

  async isSlotAvailable(slotId: SlotId): Promise<boolean> {
    return (await this.remainingCapacity(slotId)) > 0;
  }

  // ─── Reminder helpers ──────────────────────────────────────────────────────

  async getUpcomingBookings(
    customerId: UserId,
    within: { hours: number } = { hours: 24 },
  ): Promise<Booking[]> {
    const cutoff = new Date(Date.now() + within.hours * 3600_000);
    return [...this.bookings.values()].filter((b) => {
      if (b.customerId !== customerId) return false;
      if (b.status === 'cancelled') return false;
      const slot = this.slots.get(b.slotId);
      return slot ? slot.startAt <= cutoff && slot.startAt > new Date() : false;
    });
  }

  async getSlotsNeedingReminders(
    leadTimeMinutes: number,
  ): Promise<Array<{ booking: Booking; slot: AvailabilitySlot }>> {
    const windowStart = new Date(Date.now() + leadTimeMinutes * 60_000);
    const windowEnd = new Date(windowStart.getTime() + 60_000); // 1 minute window

    const results: Array<{ booking: Booking; slot: AvailabilitySlot }> = [];
    for (const booking of this.bookings.values()) {
      if (booking.status === 'cancelled') continue;
      const slot = this.slots.get(booking.slotId);
      if (!slot) continue;
      if (slot.startAt >= windowStart && slot.startAt < windowEnd) {
        results.push({ booking, slot });
      }
    }
    return results;
  }

  // ─── Statistics ────────────────────────────────────────────────────────────

  async getProviderStats(providerId: UserId): Promise<{
    totalSlots: number;
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
  }> {
    const providerSlotIds = new Set(
      [...this.slots.values()]
        .filter((s) => s.providerId === providerId)
        .map((s) => s.id),
    );

    const providerBookings = [...this.bookings.values()].filter((b) =>
      providerSlotIds.has(b.slotId),
    );

    return {
      totalSlots: providerSlotIds.size,
      totalBookings: providerBookings.length,
      confirmedBookings: providerBookings.filter((b) => b.status === 'confirmed').length,
      cancelledBookings: providerBookings.filter((b) => b.status === 'cancelled').length,
    };
  }

  // ─── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.slots.clear();
    this.bookings.clear();
    this.slotSeq = 0;
    this.bookingSeq = 0;
  }

  // ─── Introspection (for tests) ─────────────────────────────────────────────

  get allSlots(): AvailabilitySlot[] {
    return [...this.slots.values()];
  }

  get allBookings(): Booking[] {
    return [...this.bookings.values()];
  }
}
