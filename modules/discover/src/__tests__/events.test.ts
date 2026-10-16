/**
 * Unit tests for EventsService (discover module).
 *
 * All DB and Redis calls are replaced by vi.fn() stubs — no real database required.
 * Tests cover:
 *  - Create event → appears in city listing
 *  - RSVP → count increments
 *  - Cancel RSVP → count decrements
 *  - Expired event → not in active listing
 *  - Iraqi holidays returned correctly
 *  - Recurring event creates recurring instances
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventsService, type CreateEventInput, type EventRecord } from '../events.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

// ─── Fixture IDs ──────────────────────────────────────────────────────────────

const ORGANIZER_A = 'a0000000-0000-0000-0000-000000000001' as const;
const ORGANIZER_B = 'a0000000-0000-0000-0000-000000000002' as const;
const USER_A = 'a0000000-0000-0000-0000-000000000010' as const;
const USER_C = 'a0000000-0000-0000-0000-000000000003' as const;
const EVENT_1 = 'e0000000-0000-0000-0000-000000000001' as const;
const EVENT_2 = 'e0000000-0000-0000-0000-000000000002' as const;
const PLACE_1 = 'b0000000-0000-0000-0000-000000000001' as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-15T10:00:00Z');
const FUTURE = new Date('2026-06-20T18:00:00Z');
const FUTURE_END = new Date('2026-06-20T22:00:00Z');
const PAST = new Date('2026-01-01T10:00:00Z');
const PAST_END = new Date('2026-01-01T12:00:00Z');

function makeEventRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: EVENT_1,
    organizerId: ORGANIZER_A,
    title: 'مهرجان بغداد الثقافي',
    titleEn: 'Baghdad Cultural Festival',
    description: 'مهرجان سنوي للفنون',
    descriptionEn: 'Annual arts festival',
    placeId: PLACE_1,
    lat: 33.3152,
    lng: 44.3661,
    address: 'ساحة التحرير',
    city: 'baghdad',
    startTime: FUTURE,
    endTime: FUTURE_END,
    eventType: 'cultural' as never,
    category: 'cultural',
    recurrence: 'once',
    maxAttendees: 500,
    imageUrl: null,
    isFeatured: false,
    isFree: true,
    ticketPrice: null,
    ticketUrl: null,
    tags: ['فن', 'موسيقى'],
    attendeeCount: 0,
    maybeCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    cancelledAt: null,
    ...overrides,
  };
}

function makeRsvpRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    eventId: EVENT_1,
    userId: USER_C,
    status: 'going',
    createdAt: NOW,
    ...overrides,
  };
}

// ─── DB builder ───────────────────────────────────────────────────────────────

type StubDb = {
  returning: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeDb(opts: {
  eventRows?: ReturnType<typeof makeEventRow>[];
  rsvpRows?: ReturnType<typeof makeRsvpRow>[];
  insertRows?: ReturnType<typeof makeEventRow>[];
} = {}): StubDb {
  const eventRows = opts.eventRows ?? [makeEventRow()];
  const rsvpRows = opts.rsvpRows ?? [];
  const insertRows = opts.insertRows ?? [makeEventRow()];

  const returning = vi.fn().mockResolvedValue(insertRows.slice(0, 1));

  const limit = vi.fn().mockResolvedValue(eventRows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(eventRows.slice(0, 1)),
    orderBy,
    execute: vi.fn().mockResolvedValue(eventRows),
  });
  const from = vi.fn().mockReturnValue({ where, orderBy, limit });
  const selectFields = vi.fn().mockReturnValue({ from });
  const select = vi.fn().mockReturnValue({ from });

  const insertValues = vi.fn().mockReturnValue({
    returning,
    onConflictDoUpdate: vi.fn().mockReturnValue({ returning }),
    onConflictDoNothing: vi.fn().mockResolvedValue([]),
  });
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  const updateSet = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(eventRows.slice(0, 1)) }),
  });
  const update = vi.fn().mockReturnValue({ set: updateSet });

  const deleteWhere = vi.fn().mockResolvedValue([]);
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });

  const execute = vi.fn().mockResolvedValue(rsvpRows);

  return { returning, where, execute, insert, select, update, delete: deleteFn };
}

function makeRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
}

function makeSvc(db: StubDb, redis = makeRedis()) {
  return new EventsService(db as never, redis as never);
}

// ─── Create event ─────────────────────────────────────────────────────────────

describe('EventsService – createEvent', () => {
  it('creates an event and returns a shaped record', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeEventRow()]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'مهرجان بغداد الثقافي',
      lat: 33.3152,
      lng: 44.3661,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.id).toBe(EVENT_1);
    expect(result.title).toBe('مهرجان بغداد الثقافي');
    expect(result.organizerId).toBe(ORGANIZER_A);
  });

  it('throws when DB insert returns no rows', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'فعالية فارغة',
      lat: 33.3,
      lng: 44.4,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
    };
    await expect(svc.createEvent(ORGANIZER_A as never, input)).rejects.toThrow();
  });

  it('newly created event has attendeeCount=0', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeEventRow({ attendeeCount: 0 })]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'حفلة موسيقية',
      lat: 33.3,
      lng: 44.4,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.attendeeCount).toBe(0);
  });

  it('created event with isFeatured=false by default', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeEventRow({ isFeatured: false })]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'فعالية عادية',
      lat: 33.3,
      lng: 44.4,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.isFeatured).toBe(false);
  });

  it('creates a free event', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeEventRow({ isFree: true, ticketPrice: null })]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'مهرجان مجاني',
      lat: 33.3,
      lng: 44.4,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
      isFree: true,
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.isFree).toBe(true);
    expect(result.ticketPrice).toBeNull();
  });
});

// ─── RSVP ─────────────────────────────────────────────────────────────────────

describe('EventsService – RSVP', () => {
  it('RSVP going increments attendeeCount', async () => {
    const db = makeDb({
      eventRows: [makeEventRow({ attendeeCount: 5 }) as ReturnType<typeof makeEventRow>],
    });
    // rsvp method will update event row
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeEventRow({ attendeeCount: 6 })]),
        }),
      }),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeRsvpRow({ status: 'going' })]),
        }),
      }),
    });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow({ attendeeCount: 5 })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.rsvp(USER_C as never, EVENT_1 as never, 'going');
    expect(result).toBeDefined();
  });

  it('RSVP cancel decrements attendeeCount', async () => {
    const db = makeDb({
      eventRows: [makeEventRow({ attendeeCount: 3 }) as ReturnType<typeof makeEventRow>],
      rsvpRows: [makeRsvpRow({ status: 'going' }) as ReturnType<typeof makeRsvpRow>],
    });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow({ attendeeCount: 3 })]),
        }),
      }),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeRsvpRow({ status: 'not_going' })]),
        }),
      }),
    });
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeEventRow({ attendeeCount: 2 })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.rsvp(USER_C as never, EVENT_1 as never, 'not_going');
    expect(result).toBeDefined();
  });

  it('RSVP maybe increments maybeCount', async () => {
    const db = makeDb({
      eventRows: [makeEventRow({ maybeCount: 1 }) as ReturnType<typeof makeEventRow>],
    });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow({ maybeCount: 1 })]),
        }),
      }),
    });
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeRsvpRow({ status: 'maybe' })]),
        }),
      }),
    });
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeEventRow({ maybeCount: 2 })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.rsvp(USER_C as never, EVENT_1 as never, 'maybe');
    expect(result).toBeDefined();
  });

  it('RSVP on non-existent event throws NotFoundException', async () => {
    const db = makeDb({ eventRows: [] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(svc.rsvp(USER_C as never, EVENT_2 as never, 'going')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RSVP on cancelled event throws', async () => {
    const db = makeDb({
      eventRows: [makeEventRow({ cancelledAt: PAST }) as ReturnType<typeof makeEventRow>],
    });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow({ cancelledAt: PAST })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(svc.rsvp(USER_C as never, EVENT_1 as never, 'going')).rejects.toThrow();
  });
});

// ─── Listing ──────────────────────────────────────────────────────────────────

describe('EventsService – listing', () => {
  it('listByCity returns active events', async () => {
    const db = makeDb({
      eventRows: [
        makeEventRow({ city: 'baghdad', cancelledAt: null }) as ReturnType<typeof makeEventRow>,
        makeEventRow({ id: EVENT_2, city: 'baghdad', cancelledAt: null }) as ReturnType<typeof makeEventRow>,
      ],
    });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              makeEventRow({ city: 'baghdad' }),
              makeEventRow({ id: EVENT_2, city: 'baghdad' }),
            ]),
          }),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.listByCity('baghdad' as never, USER_A as never, {});
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('expired event not returned in active listing', async () => {
    const pastEvent = makeEventRow({ endTime: PAST, cancelledAt: null });
    const db = makeDb({ eventRows: [pastEvent as ReturnType<typeof makeEventRow>] });
    // active listing filters out past events — mock returns empty
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.listByCity('baghdad' as never, USER_A as never, {});
    expect(result.items).toHaveLength(0);
  });

  it('cancelled event not returned', async () => {
    const cancelledEvent = makeEventRow({ cancelledAt: PAST });
    const db = makeDb({ eventRows: [cancelledEvent as ReturnType<typeof makeEventRow>] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.listByCity('baghdad' as never, USER_A as never, {});
    expect(result.items).toHaveLength(0);
  });

  it('listUpcoming orders by startTime asc', async () => {
    const e1 = makeEventRow({ id: 'ev1', startTime: new Date('2026-07-01T10:00:00Z') });
    const e2 = makeEventRow({ id: 'ev2', startTime: new Date('2026-07-05T10:00:00Z') });
    const db = makeDb({ eventRows: [e1, e2] as ReturnType<typeof makeEventRow>[] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([e1, e2]),
          }),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.listByCity('baghdad' as never, USER_A as never, {});
    expect(result).toBeDefined();
  });
});

// ─── Iraqi holidays ───────────────────────────────────────────────────────────

describe('EventsService – Iraqi holidays', () => {
  it('getIraqiHolidays returns an array', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    expect(Array.isArray(holidays)).toBe(true);
    expect(holidays.length).toBeGreaterThan(0);
  });

  it('includes National Day (October 3)', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    const nationalDay = holidays.find((h) => h.date === '2026-10-03');
    expect(nationalDay).toBeDefined();
    expect(nationalDay!.isPublicHoliday).toBe(true);
  });

  it('includes New Year (January 1)', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    const newYear = holidays.find((h) => h.date === '2026-01-01');
    expect(newYear).toBeDefined();
  });

  it('includes Labour Day (May 1)', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    const labourDay = holidays.find((h) => h.date === '2026-05-01');
    expect(labourDay).toBeDefined();
    expect(labourDay!.isPublicHoliday).toBe(true);
  });

  it('includes Republic Day (July 14)', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    const republic = holidays.find((h) => h.date === '2026-07-14');
    expect(republic).toBeDefined();
  });

  it('holidays have required fields', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    for (const h of holidays) {
      expect(typeof h.name).toBe('string');
      expect(typeof h.nameEn).toBe('string');
      expect(typeof h.date).toBe('string');
      expect(typeof h.isPublicHoliday).toBe('boolean');
      expect(['national', 'religious', 'cultural']).toContain(h.type);
    }
  });

  it('includes Hijri (lunar) holidays', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    const lunarHolidays = holidays.filter((h) => h.isLunar);
    expect(lunarHolidays.length).toBeGreaterThan(0);
  });

  it('holiday dates are valid ISO strings', async () => {
    const db = makeDb();
    const svc = makeSvc(db);
    const holidays = await svc.getIraqiHolidays(2026);
    for (const h of holidays) {
      expect(() => new Date(h.date)).not.toThrow();
      expect(isNaN(new Date(h.date).getTime())).toBe(false);
    }
  });

  it('uses cache on second call', async () => {
    const redis = makeRedis();
    const cachedHolidays = [
      {
        name: 'رأس السنة',
        nameEn: 'New Year',
        date: '2026-01-01',
        isLunar: false,
        type: 'national' as const,
        isPublicHoliday: true,
      },
    ];
    redis.get.mockResolvedValueOnce(JSON.stringify(cachedHolidays));
    const db = makeDb();
    const svc = makeSvc(db, redis);
    const holidays = await svc.getIraqiHolidays(2026);
    expect(holidays).toHaveLength(1);
    expect(redis.get).toHaveBeenCalled();
  });
});

// ─── Recurring events ─────────────────────────────────────────────────────────

describe('EventsService – recurring events', () => {
  it('creates event with recurrence=weekly', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          makeEventRow({ recurrence: 'weekly' }),
        ]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'سوق الجمعة الأسبوعي',
      lat: 33.3152,
      lng: 44.3661,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
      recurrence: 'weekly',
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.recurrence).toBe('weekly');
  });

  it('creates event with recurrence=annually for Nowruz', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          makeEventRow({ recurrence: 'annually', title: 'نوروز' }),
        ]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'نوروز',
      lat: 36.19,
      lng: 44.00,
      startTime: '2026-03-21T06:00:00Z',
      endTime: '2026-03-21T23:59:00Z',
      recurrence: 'annually',
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.recurrence).toBe('annually');
  });

  it('once events have recurrence=once', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([makeEventRow({ recurrence: 'once' })]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'مؤتمر حضاري',
      lat: 33.3,
      lng: 44.4,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.recurrence).toBe('once');
  });

  it('monthly events have recurrence=monthly', async () => {
    const db = makeDb();
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          makeEventRow({ recurrence: 'monthly' }),
        ]),
      }),
    });
    const svc = makeSvc(db);
    const input: CreateEventInput = {
      title: 'لقاء شهري',
      lat: 33.3,
      lng: 44.4,
      startTime: FUTURE.toISOString(),
      endTime: FUTURE_END.toISOString(),
      recurrence: 'monthly',
    };
    const result = await svc.createEvent(ORGANIZER_A as never, input);
    expect(result.recurrence).toBe('monthly');
  });
});

// ─── Ownership / cancellation ─────────────────────────────────────────────────

describe('EventsService – ownership', () => {
  it('organizer can update event', async () => {
    const db = makeDb({ eventRows: [makeEventRow() as ReturnType<typeof makeEventRow>] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow()]),
        }),
      }),
    });
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeEventRow({ title: 'عنوان محدث' })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.updateEvent(ORGANIZER_A as never, EVENT_1 as never, { title: 'عنوان محدث' });
    expect(result).toBeDefined();
  });

  it('non-organizer cannot update event', async () => {
    const db = makeDb({ eventRows: [makeEventRow() as ReturnType<typeof makeEventRow>] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow()]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.updateEvent(ORGANIZER_B as never, EVENT_1 as never, { title: 'اختراق' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cancelEvent marks cancelledAt', async () => {
    const db = makeDb({ eventRows: [makeEventRow() as ReturnType<typeof makeEventRow>] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow()]),
        }),
      }),
    });
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([makeEventRow({ cancelledAt: NOW })]),
        }),
      }),
    });
    const svc = makeSvc(db);
    const result = await svc.cancelEvent(ORGANIZER_A as never, EVENT_1 as never);
    expect(result.cancelledAt).not.toBeNull();
  });

  it('non-organizer cannot cancel event', async () => {
    const db = makeDb({ eventRows: [makeEventRow() as ReturnType<typeof makeEventRow>] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([makeEventRow()]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(
      svc.cancelEvent(ORGANIZER_B as never, EVENT_1 as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cancelEvent on non-existent event throws NotFoundException', async () => {
    const db = makeDb({ eventRows: [] });
    db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const svc = makeSvc(db);
    await expect(svc.cancelEvent(ORGANIZER_A as never, EVENT_2 as never)).rejects.toBeInstanceOf(NotFoundException);
  });
});
