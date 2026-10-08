import { randomUUID } from 'node:crypto';
import type { CityImportRecord, DomainEvent, EventBus, IraqiPhone, OtpSender, PlaceId, PlaceImportRecord, PlacesQueryPort, UserDataEraser, UserId } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';

/** Conformance suites: the fake and every real implementation of a port must pass the same suite. */

export function otpSenderConformance(name: string, make: () => OtpSender | Promise<OtpSender>): void {
  describe(`OtpSender conformance: ${name}`, () => {
    it('sends to an Iraqi E.164 number without throwing', async () => {
      const sender = await make();
      await expect(sender.send({ phone: '+9647701234567' as IraqiPhone, code: '123456', locale: 'ar' })).resolves.toBeUndefined();
    });
    it('declares its kind', async () => {
      expect(['fake', 'fixed', 'console', 'sms']).toContain((await make()).kind);
    });
  });
}

export const testUserDeleted = (userId = randomUUID()): DomainEvent<'identity.user.deleted.v1'> => ({
  id: randomUUID(),
  name: 'identity.user.deleted.v1',
  occurredAt: new Date().toISOString(),
  payload: { userId: userId as UserId },
});

export function eventBusConformance(name: string, make: () => EventBus | Promise<EventBus>): void {
  describe(`EventBus conformance: ${name}`, () => {
    it('delivers to subscribers of that event name only, and stops after unsubscribe', async () => {
      const bus = await make();
      const got: DomainEvent[] = [];
      const other: DomainEvent[] = [];
      const off = bus.subscribe('identity.user.deleted.v1', (e) => void got.push(e));
      bus.subscribe('identity.user.registered.v1', (e) => void other.push(e));
      const e1 = testUserDeleted();
      await bus.publish(e1);
      await expect.poll(() => got.length).toBe(1);
      expect(got[0]).toEqual(e1);
      off();
      await bus.publish(testUserDeleted());
      await new Promise((r) => setTimeout(r, 50));
      expect(got).toHaveLength(1);
      expect(other).toHaveLength(0);
    });
    it('unsubscribe is idempotent and removes only its own handler', async () => {
      const bus = await make();
      const a: DomainEvent[] = [];
      const b: DomainEvent[] = [];
      const offA = bus.subscribe('identity.user.deleted.v1', (e) => void a.push(e));
      bus.subscribe('identity.user.deleted.v1', (e) => void b.push(e));
      offA();
      offA();
      await bus.publish(testUserDeleted());
      await expect.poll(() => b.length).toBe(1);
      expect(a).toHaveLength(0);
    });
  });
}

export interface EraserHarness {
  eraser: UserDataEraser;
  /** Store some data owned by this user in the module under test. */
  seed(userId: UserId): Promise<void>;
  /** Whether any data owned by this user is still stored. */
  hasData(userId: UserId): Promise<boolean>;
}

export function userDataEraserConformance(name: string, make: () => EraserHarness | Promise<EraserHarness>): void {
  describe(`UserDataEraser conformance: ${name}`, () => {
    it('erases only the given user, and is idempotent', async () => {
      const h = await make();
      const [a, b] = [randomUUID() as UserId, randomUUID() as UserId];
      await h.seed(a);
      await h.seed(b);
      await h.eraser.erase(a);
      expect(await h.hasData(a)).toBe(false);
      expect(await h.hasData(b)).toBe(true);
      await expect(h.eraser.erase(a)).resolves.toBeUndefined();
    });
    it('names its module', async () => {
      expect((await make()).eraser.module).toMatch(/^[a-z][a-z0-9-]*$/);
    });
  });
}

const testCity: CityImportRecord = {
  id: 'baghdad' as CityImportRecord['id'],
  names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' },
  bbox: [44.22, 33.2, 44.55, 33.45],
  center: [44.3661, 33.3152],
};

/** Hand-made records (not OSM data). n103 and n104 share a name so `near` decides their order. */
const testPlaces: PlaceImportRecord[] = [
  {
    id: 'n101',
    kind: 'place',
    names: { name: 'مطعم أربيل', en: 'Erbil Restaurant' },
    category: 'food',
    location: [44.421, 33.301],
    tags: { opening_hours: 'Mo-Su 10:00-23:00', phone: '+964 770 000 0001', website: 'https://example.com/erbil' },
  },
  { id: 'n102', kind: 'place', names: { name: 'قلعة بغداد', ckb: 'قەڵای بەغدا', en: 'Baghdad Citadel' }, category: 'tourism', location: [44.388, 33.344], tags: {} },
  { id: 'n103', kind: 'place', names: { name: 'صيدلية الشفاء' }, category: 'health', location: [44.3, 33.3], tags: {} },
  { id: 'n104', kind: 'place', names: { name: 'صيدلية الشفاء' }, category: 'health', location: [44.5, 33.4], tags: {} },
  { id: 'w201', kind: 'street', names: { name: 'شارع المتنبي', en: 'Al-Mutanabbi Street' }, category: null, location: [44.388, 33.34], tags: {} },
  { id: 'n301', kind: 'area', names: { name: 'الكرادة', ckb: 'کەڕادە', en: 'Karrada' }, category: null, location: [44.42, 33.3], tags: {} },
];

/** @public consumed by the modules/places tests (M1) */
export interface PlacesHarness {
  port: PlacesQueryPort;
  /** Imports the records into the implementation under test; must be idempotent (upsert by id). */
  seed(city: CityImportRecord, records: readonly PlaceImportRecord[]): Promise<void>;
}

export function placesQueryConformance(name: string, make: () => PlacesHarness | Promise<PlacesHarness>): void {
  describe(`PlacesQueryPort conformance: ${name}`, () => {
    const seeded = async () => {
      const h = await make();
      await h.seed(testCity, testPlaces);
      await h.seed(testCity, testPlaces);
      return h.port;
    };
    const query = (q: string, more: { near?: [number, number]; limit?: number; city?: string } = {}) =>
      ({ q, city: testCity.id, lang: 'ar', limit: 20, ...more }) as Parameters<PlacesQueryPort['search']>[0];
    const topId = async (port: PlacesQueryPort, q: string) => (await port.search(query(q)))[0]?.id;

    it('returns OSM details with attribution, and null for a missing id', async () => {
      const port = await seeded();
      const d = await port.getById('n101' as PlaceId);
      expect(d).toMatchObject({ id: 'n101', kind: 'place', category: 'food', hoursRaw: 'Mo-Su 10:00-23:00', source: 'osm' });
      expect(d?.osmContacts).toEqual({ phone: '+964 770 000 0001', website: 'https://example.com/erbil' });
      expect(d?.attribution).toContain('OpenStreetMap');
      expect(await port.getById('n999999' as PlaceId)).toBeNull();
    });

    it('folds Arabic spelling variants to the same top result, without duplicates after re-import', async () => {
      const port = await seeded();
      for (const q of ['اربيل', 'أربيل', 'إربيل']) expect(await topId(port, q)).toBe('n101');
      for (const q of ['قلعه', 'قلعة']) expect(await topId(port, q)).toBe('n102');
      expect((await port.search(query('أربيل'))).filter((r) => r.id === 'n101')).toHaveLength(1);
    });

    it('finds streets and areas', async () => {
      const port = await seeded();
      expect(await port.search(query('المتنبي'))).toContainEqual(expect.objectContaining({ id: 'w201', kind: 'street', category: null }));
      expect(await port.search(query('كرادة'))).toContainEqual(expect.objectContaining({ id: 'n301', kind: 'area' }));
    });

    it('orders equal names by distance from near, and reports distanceM only with near', async () => {
      const port = await seeded();
      const [a] = await port.search(query('صيدلية الشفاء', { near: [44.3, 33.3] }));
      const [b] = await port.search(query('صيدلية الشفاء', { near: [44.5, 33.4] }));
      expect([a?.id, b?.id]).toEqual(['n103', 'n104']);
      expect(a?.distanceM).toBeLessThan(50);
      expect((await port.search(query('صيدلية الشفاء')))[0]?.distanceM).toBeNull();
    });

    it('scopes search to the city and honours limit', async () => {
      const port = await seeded();
      expect(await port.search(query('صيدلية', { city: 'erbil' }))).toEqual([]);
      expect(await port.search(query('صيدلية', { limit: 1 }))).toHaveLength(1);
    });

    it('nearby returns places within the radius, nearest first, filtered by category', async () => {
      const port = await seeded();
      const near = { city: testCity.id, near: [44.421, 33.301] as [number, number], radiusM: 2000, limit: 20 };
      const all = await port.nearby(near);
      expect(all.map((p) => p.id)).toEqual(['n101']);
      expect(all[0]?.distanceM).toBeLessThan(1);
      expect((await port.nearby({ ...near, near: [44.3, 33.3], category: 'health' })).map((p) => p.id)).toEqual(['n103']);
      expect(await port.nearby({ ...near, near: [44.3, 33.3], category: 'food' })).toEqual([]);
    });
  });
}
