import { type ProviderId, type UserId } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { providersMigrationsDir } from './providers.module';
import { PromotionsService } from './promotions.service';

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as UserId;
const pid = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12, '0')}` as ProviderId;

const NOW = new Date();
const FUTURE = new Date(NOW.getTime() + 7 * 86400_000);
const PAST = new Date(NOW.getTime() - 7 * 86400_000);

describe.skipIf(!process.env['DATABASE_URL'])('PromotionsService (integration)', () => {
  let tdb: TestDatabase;
  let svc: PromotionsService;

  beforeAll(async () => {
    tdb = await createTestDatabase({ modules: [{ schema: 'providers', migrationsDir: providersMigrationsDir }] });
    svc = new PromotionsService(tdb.db);
    // Insert a fake provider row to satisfy FK
    await tdb.db.execute(
      `INSERT INTO providers.provider (id, user_id, status, name, category) VALUES ('${pid(1)}', '${uid(1)}', 'verified', 'Test', 'food')`,
    );
  });

  afterAll(async () => {
    await tdb?.drop();
  });

  describe('promotions', () => {
    it('creates and lists a promotion', async () => {
      const promo = await svc.createPromotion(pid(1), {
        title: 'خصم 20%',
        description: 'تخفيض على كل الوجبات',
        discountPct: 20,
        validFrom: PAST.toISOString(),
        validTo: FUTURE.toISOString(),
      });
      expect(promo.title).toBe('خصم 20%');
      expect(promo.discountPct).toBe(20);
      expect(promo.status).toBe('active');

      const active = await svc.getActivePromotions(pid(1));
      expect(active.some((p) => p.id === promo.id)).toBe(true);
    });

    it('soft-deletes a promotion', async () => {
      const promo = await svc.createPromotion(pid(1), {
        title: 'to delete',
        description: 'desc',
        validFrom: PAST.toISOString(),
        validTo: FUTURE.toISOString(),
      });
      await svc.deletePromotion(pid(1), promo.id);
      const active = await svc.getActivePromotions(pid(1));
      expect(active.some((p) => p.id === promo.id)).toBe(false);
    });
  });

  describe('appointments', () => {
    it('creates and lists appointments', async () => {
      const appt = await svc.requestAppointment(uid(1), pid(1), {
        date: '2026-12-01',
        time: '10:00',
        service: 'قص شعر',
      });
      expect(appt.status).toBe('pending');
      expect(appt.service).toBe('قص شعر');

      const list = await svc.listForProvider(pid(1));
      expect(list.some((a) => a.id === appt.id)).toBe(true);
    });

    it('updates appointment status', async () => {
      const appt = await svc.requestAppointment(uid(2), pid(1), {
        date: '2026-12-02',
        time: '11:00',
        service: 'صبغ شعر',
      });
      const updated = await svc.updateAppointment(pid(1), appt.id, { status: 'confirmed' });
      expect(updated.status).toBe('confirmed');
    });

    it('returns user own appointments', async () => {
      const list = await svc.myAppointments(uid(1));
      expect(list.length).toBeGreaterThan(0);
    });
  });

  describe('insights', () => {
    it('returns insights with zero data gracefully', async () => {
      const insights = await svc.getProviderInsights(pid(1), '7d');
      expect(insights.providerId).toBe(pid(1));
      expect(Array.isArray(insights.topKeywords)).toBe(true);
      expect(Array.isArray(insights.peakHours)).toBe(true);
      expect(insights.sourceBreakdown).toBeDefined();
    });
  });
});
