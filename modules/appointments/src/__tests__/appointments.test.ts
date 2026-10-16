/**
 * Unit tests for the appointments system using FakeAppointmentsService.
 *
 * Coverage:
 *   - Set availability → slots generated / listed
 *   - Book slot → marked unavailable
 *   - Double-booking prevention (single-capacity slot)
 *   - Multi-capacity slot enforcement
 *   - Cancel → slot available again
 *   - Provider confirmation flow (status transitions)
 *   - Time-off blocks slots (remainingCapacity / isSlotAvailable helpers)
 *   - Reminder helpers (getUpcomingBookings, getSlotsNeedingReminders)
 *   - Provider stats aggregation
 *   - Slot isolation between providers
 *   - Reset clears all state
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeAppointmentsService } from '@iraq-maps/testing';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(suffix: string): string {
  return `user-${suffix}`;
}

function futureDate(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 3_600_000);
}

function slotInput(startHours: number, durationMins = 60, maxBookings = 1) {
  const startAt = futureDate(startHours);
  startAt.setSeconds(0, 0);
  const endAt = new Date(startAt.getTime() + durationMins * 60_000);
  return { startAt, endAt, durationMinutes: durationMins, maxBookings };
}

// ── Availability setup ─────────────────────────────────────────────────────────

describe('FakeAppointmentsService – availability setup', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('creates a slot and returns it with a generated id', async () => {
    const provider = uid('prov-1');
    const slot = await svc.createSlot(provider, slotInput(2));
    expect(typeof slot.id).toBe('string');
    expect(slot.id.length).toBeGreaterThan(0);
    expect(slot.providerId).toBe(provider);
  });

  it('created slot appears in listProviderSlots', async () => {
    const provider = uid('prov-2');
    await svc.createSlot(provider, slotInput(3));
    const { items } = await svc.listProviderSlots(provider);
    expect(items.length).toBe(1);
    expect(items[0]!.providerId).toBe(provider);
  });

  it('slot lists are scoped to each provider', async () => {
    const provA = uid('prov-3a');
    const provB = uid('prov-3b');
    await svc.createSlot(provA, slotInput(4));
    await svc.createSlot(provA, slotInput(5));
    await svc.createSlot(provB, slotInput(6));

    const { items: aItems } = await svc.listProviderSlots(provA);
    const { items: bItems } = await svc.listProviderSlots(provB);
    expect(aItems).toHaveLength(2);
    expect(bItems).toHaveLength(1);
  });

  it('creating a slot with endAt before startAt throws INVALID_RANGE', async () => {
    const provider = uid('prov-4');
    const startAt = futureDate(2);
    const endAt = new Date(startAt.getTime() - 30 * 60_000); // end before start
    await expect(
      svc.createSlot(provider, { startAt, endAt, durationMinutes: 30, maxBookings: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });

  it('creating a slot in the past throws PAST_SLOT', async () => {
    const provider = uid('prov-5');
    const startAt = new Date(Date.now() - 3_600_000); // 1 hour ago
    const endAt = new Date(Date.now() - 1_800_000);
    await expect(
      svc.createSlot(provider, { startAt, endAt, durationMinutes: 30, maxBookings: 1 }),
    ).rejects.toMatchObject({ code: 'PAST_SLOT' });
  });

  it('getSlot returns the created slot by id', async () => {
    const provider = uid('prov-6');
    const created = await svc.createSlot(provider, slotInput(7));
    const fetched = await svc.getSlot(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('getSlot returns null for nonexistent id', async () => {
    const slot = await svc.getSlot('does-not-exist');
    expect(slot).toBeNull();
  });

  it('listProviderSlots supports date range filter', async () => {
    const provider = uid('prov-7');
    await svc.createSlot(provider, slotInput(10));  // within range
    await svc.createSlot(provider, slotInput(100)); // outside range

    const from = futureDate(5);
    const to = futureDate(20);
    const { items } = await svc.listProviderSlots(provider, { from, to });
    // Only the slot at +10 hours should appear
    expect(items).toHaveLength(1);
  });

  it('listProviderSlots respects limit', async () => {
    const provider = uid('prov-8');
    for (let i = 0; i < 5; i++) {
      await svc.createSlot(provider, slotInput(i + 2));
    }
    const { items } = await svc.listProviderSlots(provider, { limit: 3 });
    expect(items).toHaveLength(3);
  });

  it('deleteSlot removes the slot from provider listing', async () => {
    const provider = uid('prov-9');
    const slot = await svc.createSlot(provider, slotInput(8));
    await svc.deleteSlot(slot.id, provider);
    const { items } = await svc.listProviderSlots(provider);
    expect(items.some((s) => s.id === slot.id)).toBe(false);
  });

  it('deleteSlot by wrong provider throws FORBIDDEN', async () => {
    const owner = uid('prov-10');
    const other = uid('prov-other');
    const slot = await svc.createSlot(owner, slotInput(9));
    await expect(svc.deleteSlot(slot.id, other)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('listPublicSlots includes remainingCapacity', async () => {
    const provider = uid('prov-11');
    const slot = await svc.createSlot(provider, { ...slotInput(12), maxBookings: 3 });
    const { items } = await svc.listPublicSlots(provider);
    const pub = items.find((s) => s.id === slot.id);
    expect(pub).toBeDefined();
    expect(pub!.remainingCapacity).toBe(3);
  });
});

// ─── Booking ──────────────────────────────────────────────────────────────────

describe('FakeAppointmentsService – booking', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('booking a slot returns a confirmed booking', async () => {
    const provider = uid('book-prov-1');
    const customer = uid('book-cust-1');
    const slot = await svc.createSlot(provider, slotInput(10));
    const booking = await svc.createBooking(customer, { slotId: slot.id });
    expect(booking.status).toBe('confirmed');
    expect(booking.customerId).toBe(customer);
    expect(booking.slotId).toBe(slot.id);
  });

  it('booking a nonexistent slot throws NOT_FOUND', async () => {
    const customer = uid('book-cust-2');
    await expect(
      svc.createBooking(customer, { slotId: 'ghost-slot' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('booking stores the optional note', async () => {
    const provider = uid('book-prov-2');
    const customer = uid('book-cust-3');
    const slot = await svc.createSlot(provider, slotInput(11));
    const note = 'يرجى الحضور مبكراً';
    const booking = await svc.createBooking(customer, { slotId: slot.id, note });
    expect(booking.note).toBe(note);
  });

  it('getBooking returns booking by id', async () => {
    const provider = uid('book-prov-3');
    const customer = uid('book-cust-4');
    const slot = await svc.createSlot(provider, slotInput(12));
    const created = await svc.createBooking(customer, { slotId: slot.id });
    const fetched = await svc.getBooking(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('getBooking returns null for nonexistent id', async () => {
    expect(await svc.getBooking('ghost-booking')).toBeNull();
  });

  it('listCustomerBookings returns only that customer\'s bookings', async () => {
    const provider = uid('book-prov-4');
    const custA = uid('book-cust-5');
    const custB = uid('book-cust-6');
    const slotA = await svc.createSlot(provider, slotInput(13));
    const slotB = await svc.createSlot(provider, slotInput(14));
    const slotC = await svc.createSlot(provider, { ...slotInput(15), maxBookings: 2 });

    await svc.createBooking(custA, { slotId: slotA.id });
    await svc.createBooking(custB, { slotId: slotB.id });
    await svc.createBooking(custA, { slotId: slotC.id });

    const { items: aItems } = await svc.listCustomerBookings(custA);
    const { items: bItems } = await svc.listCustomerBookings(custB);

    expect(aItems).toHaveLength(2);
    expect(bItems).toHaveLength(1);
    expect(aItems.every((b) => b.customerId === custA)).toBe(true);
  });

  it('listProviderBookings returns bookings for all slots of that provider', async () => {
    const provider = uid('book-prov-5');
    const cust1 = uid('book-cust-7');
    const cust2 = uid('book-cust-8');
    const slot1 = await svc.createSlot(provider, slotInput(16));
    const slot2 = await svc.createSlot(provider, slotInput(17));

    await svc.createBooking(cust1, { slotId: slot1.id });
    await svc.createBooking(cust2, { slotId: slot2.id });

    const { items } = await svc.listProviderBookings(provider);
    expect(items).toHaveLength(2);
    expect(items.every((b) => [slot1.id, slot2.id].includes(b.slotId))).toBe(true);
  });

  it('listProviderBookings attaches the slot to each booking', async () => {
    const provider = uid('book-prov-6');
    const customer = uid('book-cust-9');
    const slot = await svc.createSlot(provider, slotInput(18));
    await svc.createBooking(customer, { slotId: slot.id });

    const { items } = await svc.listProviderBookings(provider);
    expect(items[0]!.slot).toBeDefined();
    expect(items[0]!.slot.id).toBe(slot.id);
  });
});

// ─── Double-booking prevention ─────────────────────────────────────────────────

describe('FakeAppointmentsService – double-booking prevention', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('two customers cannot both book a maxBookings=1 slot', async () => {
    const provider = uid('dbl-prov-1');
    const custA = uid('dbl-cust-1');
    const custB = uid('dbl-cust-2');
    const slot = await svc.createSlot(provider, { ...slotInput(20), maxBookings: 1 });

    await svc.createBooking(custA, { slotId: slot.id });
    await expect(
      svc.createBooking(custB, { slotId: slot.id }),
    ).rejects.toMatchObject({ code: 'SLOT_FULL' });
  });

  it('slot with maxBookings=3 accepts 3 then rejects the 4th', async () => {
    const provider = uid('dbl-prov-2');
    const slot = await svc.createSlot(provider, { ...slotInput(22), maxBookings: 3 });

    await svc.createBooking(uid('dbl-c1'), { slotId: slot.id });
    await svc.createBooking(uid('dbl-c2'), { slotId: slot.id });
    await svc.createBooking(uid('dbl-c3'), { slotId: slot.id });

    await expect(
      svc.createBooking(uid('dbl-c4'), { slotId: slot.id }),
    ).rejects.toMatchObject({ code: 'SLOT_FULL' });
  });

  it('remainingCapacity decrements with each booking', async () => {
    const provider = uid('dbl-prov-3');
    const slot = await svc.createSlot(provider, { ...slotInput(24), maxBookings: 3 });

    expect(await svc.remainingCapacity(slot.id)).toBe(3);
    await svc.createBooking(uid('dbl-rc1'), { slotId: slot.id });
    expect(await svc.remainingCapacity(slot.id)).toBe(2);
    await svc.createBooking(uid('dbl-rc2'), { slotId: slot.id });
    expect(await svc.remainingCapacity(slot.id)).toBe(1);
  });

  it('isSlotAvailable returns false when fully booked', async () => {
    const provider = uid('dbl-prov-4');
    const slot = await svc.createSlot(provider, { ...slotInput(26), maxBookings: 1 });

    expect(await svc.isSlotAvailable(slot.id)).toBe(true);
    await svc.createBooking(uid('dbl-av1'), { slotId: slot.id });
    expect(await svc.isSlotAvailable(slot.id)).toBe(false);
  });

  it('same customer booking same slot twice is idempotent', async () => {
    const provider = uid('dbl-prov-5');
    const customer = uid('dbl-idem');
    const slot = await svc.createSlot(provider, { ...slotInput(28), maxBookings: 2 });

    const first = await svc.createBooking(customer, { slotId: slot.id });
    const second = await svc.createBooking(customer, { slotId: slot.id });
    expect(first.id).toBe(second.id);

    // Should not have created two bookings; capacity decreased by only 1
    expect(await svc.remainingCapacity(slot.id)).toBe(1);
  });

  it('remainingCapacity returns 0 for nonexistent slot', async () => {
    expect(await svc.remainingCapacity('no-slot')).toBe(0);
  });
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

describe('FakeAppointmentsService – cancellation', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('customer can cancel their own booking', async () => {
    const provider = uid('cancel-prov-1');
    const customer = uid('cancel-cust-1');
    const slot = await svc.createSlot(provider, slotInput(30));
    const booking = await svc.createBooking(customer, { slotId: slot.id });

    await svc.cancelBooking(booking.id, customer);
    const updated = await svc.getBooking(booking.id);
    expect(updated?.status).toBe('cancelled');
  });

  it('provider can cancel a booking on their slot', async () => {
    const provider = uid('cancel-prov-2');
    const customer = uid('cancel-cust-2');
    const slot = await svc.createSlot(provider, slotInput(31));
    const booking = await svc.createBooking(customer, { slotId: slot.id });

    await svc.cancelBooking(booking.id, provider);
    const updated = await svc.getBooking(booking.id);
    expect(updated?.status).toBe('cancelled');
  });

  it('a third party cannot cancel someone else\'s booking (FORBIDDEN)', async () => {
    const provider = uid('cancel-prov-3');
    const customer = uid('cancel-cust-3');
    const stranger = uid('cancel-stranger');
    const slot = await svc.createSlot(provider, slotInput(32));
    const booking = await svc.createBooking(customer, { slotId: slot.id });

    await expect(svc.cancelBooking(booking.id, stranger)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cancelling a nonexistent booking throws NOT_FOUND', async () => {
    await expect(svc.cancelBooking('ghost-booking', uid('x'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('slot reopens for a new customer after cancellation', async () => {
    const provider = uid('cancel-prov-4');
    const customerA = uid('cancel-cust-4a');
    const customerB = uid('cancel-cust-4b');
    const slot = await svc.createSlot(provider, { ...slotInput(33), maxBookings: 1 });

    const bookingA = await svc.createBooking(customerA, { slotId: slot.id });
    await svc.cancelBooking(bookingA.id, customerA);

    // Slot is now available again
    expect(await svc.isSlotAvailable(slot.id)).toBe(true);
    const bookingB = await svc.createBooking(customerB, { slotId: slot.id });
    expect(bookingB.status).toBe('confirmed');
  });

  it('cancelled booking has a cancelledAt date', async () => {
    const provider = uid('cancel-prov-5');
    const customer = uid('cancel-cust-5');
    const slot = await svc.createSlot(provider, slotInput(34));
    const booking = await svc.createBooking(customer, { slotId: slot.id });

    const before = Date.now();
    await svc.cancelBooking(booking.id, customer);
    const after = Date.now();

    const updated = await svc.getBooking(booking.id);
    expect(updated?.cancelledAt).toBeInstanceOf(Date);
    expect(updated!.cancelledAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(updated!.cancelledAt!.getTime()).toBeLessThanOrEqual(after + 1);
  });

  it('listCustomerBookings can filter by status', async () => {
    const provider = uid('cancel-prov-6');
    const customer = uid('cancel-cust-6');
    const slot1 = await svc.createSlot(provider, slotInput(35));
    const slot2 = await svc.createSlot(provider, slotInput(36));

    const b1 = await svc.createBooking(customer, { slotId: slot1.id });
    await svc.createBooking(customer, { slotId: slot2.id });
    await svc.cancelBooking(b1.id, customer);

    const { items: confirmed } = await svc.listCustomerBookings(customer, { status: 'confirmed' });
    const { items: cancelled } = await svc.listCustomerBookings(customer, { status: 'cancelled' });
    expect(confirmed).toHaveLength(1);
    expect(cancelled).toHaveLength(1);
  });

  it('deleting a slot cancels all its bookings', async () => {
    const provider = uid('cancel-prov-7');
    const cust1 = uid('cancel-cust-7a');
    const cust2 = uid('cancel-cust-7b');
    const slot = await svc.createSlot(provider, { ...slotInput(37), maxBookings: 2 });

    const b1 = await svc.createBooking(cust1, { slotId: slot.id });
    const b2 = await svc.createBooking(cust2, { slotId: slot.id });

    await svc.deleteSlot(slot.id, provider);

    const r1 = await svc.getBooking(b1.id);
    const r2 = await svc.getBooking(b2.id);
    expect(r1?.status).toBe('cancelled');
    expect(r2?.status).toBe('cancelled');
  });
});

// ─── Provider confirmation flow ────────────────────────────────────────────────

describe('FakeAppointmentsService – provider view and confirmation', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('booking created by customer appears in provider booking list', async () => {
    const provider = uid('conf-prov-1');
    const customer = uid('conf-cust-1');
    const slot = await svc.createSlot(provider, slotInput(40));
    const booking = await svc.createBooking(customer, { slotId: slot.id });

    const { items } = await svc.listProviderBookings(provider);
    expect(items.some((b) => b.id === booking.id)).toBe(true);
  });

  it('provider sees the customer note in their booking list', async () => {
    const provider = uid('conf-prov-2');
    const customer = uid('conf-cust-2');
    const slot = await svc.createSlot(provider, slotInput(41));
    const note = 'أحتاج مساعدة خاصة';
    await svc.createBooking(customer, { slotId: slot.id, note });

    const { items } = await svc.listProviderBookings(provider);
    expect(items[0]!.note).toBe(note);
  });

  it('provider stats aggregates slots and bookings correctly', async () => {
    const provider = uid('stats-prov-1');
    const slot1 = await svc.createSlot(provider, slotInput(42));
    const slot2 = await svc.createSlot(provider, { ...slotInput(43), maxBookings: 2 });

    await svc.createBooking(uid('stats-cust-1'), { slotId: slot1.id });
    await svc.createBooking(uid('stats-cust-2'), { slotId: slot2.id });
    const b3 = await svc.createBooking(uid('stats-cust-3'), { slotId: slot2.id });

    await svc.cancelBooking(b3.id, uid('stats-cust-3'));

    const stats = await svc.getProviderStats(provider);
    expect(stats.totalSlots).toBe(2);
    expect(stats.totalBookings).toBe(3);
    expect(stats.confirmedBookings).toBe(2);
    expect(stats.cancelledBookings).toBe(1);
  });

  it('provider with no activity has zero stats', async () => {
    const provider = uid('stats-prov-2');
    const stats = await svc.getProviderStats(provider);
    expect(stats.totalSlots).toBe(0);
    expect(stats.totalBookings).toBe(0);
    expect(stats.confirmedBookings).toBe(0);
    expect(stats.cancelledBookings).toBe(0);
  });
});

// ─── Time-off / reminder helpers ──────────────────────────────────────────────

describe('FakeAppointmentsService – reminder helpers', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('getUpcomingBookings returns bookings within the next N hours', async () => {
    const provider = uid('remind-prov-1');
    const customer = uid('remind-cust-1');

    // Slot starting in 2 hours (within default 24h window)
    const nearSlot = await svc.createSlot(provider, slotInput(2));
    // Slot starting in 100 hours (outside default 24h window)
    const farSlot = await svc.createSlot(provider, slotInput(100));

    await svc.createBooking(customer, { slotId: nearSlot.id });
    await svc.createBooking(customer, { slotId: farSlot.id });

    const upcoming = await svc.getUpcomingBookings(customer, { hours: 24 });
    const nearBooked = upcoming.some((b) => b.slotId === nearSlot.id);
    const farBooked = upcoming.some((b) => b.slotId === farSlot.id);

    expect(nearBooked).toBe(true);
    expect(farBooked).toBe(false);
  });

  it('getUpcomingBookings excludes cancelled bookings', async () => {
    const provider = uid('remind-prov-2');
    const customer = uid('remind-cust-2');
    const slot = await svc.createSlot(provider, slotInput(3));
    const booking = await svc.createBooking(customer, { slotId: slot.id });
    await svc.cancelBooking(booking.id, customer);

    const upcoming = await svc.getUpcomingBookings(customer, { hours: 24 });
    expect(upcoming.some((b) => b.slotId === slot.id)).toBe(false);
  });

  it('getSlotsNeedingReminders returns bookings whose slot starts within the window', async () => {
    const provider = uid('remind-prov-3');
    const customer = uid('remind-cust-3');

    // Slot starting exactly in 60 minutes (within 60-min lead time, 1-min window)
    const targetSlot = await svc.createSlot(provider, {
      startAt: new Date(Date.now() + 60 * 60_000),
      endAt: new Date(Date.now() + 61 * 60_000),
      durationMinutes: 60,
      maxBookings: 1,
    });
    await svc.createBooking(customer, { slotId: targetSlot.id });

    const reminders = await svc.getSlotsNeedingReminders(60);
    const hasTarget = reminders.some((r) => r.booking.slotId === targetSlot.id);
    expect(hasTarget).toBe(true);
  });

  it('getSlotsNeedingReminders excludes cancelled bookings', async () => {
    const provider = uid('remind-prov-4');
    const customer = uid('remind-cust-4');

    const slot = await svc.createSlot(provider, {
      startAt: new Date(Date.now() + 60 * 60_000),
      endAt: new Date(Date.now() + 61 * 60_000),
      durationMinutes: 60,
      maxBookings: 1,
    });
    const booking = await svc.createBooking(customer, { slotId: slot.id });
    await svc.cancelBooking(booking.id, customer);

    const reminders = await svc.getSlotsNeedingReminders(60);
    expect(reminders.some((r) => r.booking.id === booking.id)).toBe(false);
  });
});

// ─── Introspection & reset ─────────────────────────────────────────────────────

describe('FakeAppointmentsService – introspection and reset', () => {
  let svc: FakeAppointmentsService;

  beforeEach(() => { svc = new FakeAppointmentsService(); });
  afterEach(() => { svc.reset(); });

  it('allSlots returns all created slots', async () => {
    const provider = uid('intro-prov');
    await svc.createSlot(provider, slotInput(50));
    await svc.createSlot(provider, slotInput(51));
    expect(svc.allSlots).toHaveLength(2);
  });

  it('allBookings returns all created bookings', async () => {
    const provider = uid('intro-prov-2');
    const cust1 = uid('intro-cust-1');
    const cust2 = uid('intro-cust-2');
    const slot = await svc.createSlot(provider, { ...slotInput(52), maxBookings: 2 });
    await svc.createBooking(cust1, { slotId: slot.id });
    await svc.createBooking(cust2, { slotId: slot.id });
    expect(svc.allBookings).toHaveLength(2);
  });

  it('reset clears all slots, bookings and counters', async () => {
    const provider = uid('reset-prov');
    const customer = uid('reset-cust');
    const slot = await svc.createSlot(provider, slotInput(53));
    await svc.createBooking(customer, { slotId: slot.id });

    svc.reset();

    expect(svc.allSlots).toHaveLength(0);
    expect(svc.allBookings).toHaveLength(0);
    expect(await svc.getSlot(slot.id)).toBeNull();
  });

  it('after reset, new IDs restart from slot-1 and booking-1', async () => {
    const provider = uid('reset-prov-2');
    const customer = uid('reset-cust-2');

    const s1 = await svc.createSlot(provider, slotInput(54));
    await svc.createBooking(customer, { slotId: s1.id });
    svc.reset();

    const s2 = await svc.createSlot(provider, slotInput(55));
    const b2 = await svc.createBooking(customer, { slotId: s2.id });
    expect(s2.id).toBe('slot-1');
    expect(b2.id).toBe('booking-1');
  });
});
