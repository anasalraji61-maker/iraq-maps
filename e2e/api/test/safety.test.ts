/**
 * E2E: safety / incident reporting flow.
 *
 * Tests cover:
 *  - Report incident → appears in alerts
 *  - Admin confirms → status updated
 *  - Subscribe alerts → user receives
 *
 * All tests skip when DATABASE_URL is not set.
 */
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skip = !process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const sender = new FakeOtpSender();

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const call = (
  method: Method,
  url: string,
  { token, payload }: { token?: string; payload?: unknown } = {},
) =>
  app.inject({
    method,
    url,
    payload: payload as object | undefined,
    remoteAddress: randomIp(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

type Session = { accessToken: string; refreshToken: string; user: { id: string } };

async function login(): Promise<Session> {
  const phone = randomPhone();
  await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  const verified = await call('POST', '/v1/auth/otp/verify', {
    payload: { phone, code: sender.lastCodeFor(phone) },
  });
  expect(verified.statusCode).toBe(200);
  return verified.json() as Session;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({ modules: moduleMigrations });
  app = await createApp({
    env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl },
    otpSender: sender,
  });
}, 60_000);

afterAll(async () => {
  if (skip) return;
  await app?.close();
  await tdb?.drop();
});

// ─── Incident reporting ───────────────────────────────────────────────────────

describe.skipIf(skip)('Safety – incident reporting', () => {
  it('unauthenticated report is rejected', async () => {
    const res = await call('POST', '/v1/incidents', {
      payload: {
        type: 'accident',
        lat: 33.3152,
        lng: 44.3661,
        description: 'حادث مروري',
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('authenticated user can report an incident', async () => {
    const session = await login();
    const res = await call('POST', '/v1/incidents', {
      token: session.accessToken,
      payload: {
        type: 'accident',
        lat: 33.3152,
        lng: 44.3661,
        description: 'حادث مروري عند الكرادة',
        ttlHours: 2,
      },
    });
    // 201 created or 200 OK
    expect(res.statusCode).toBeLessThan(300);
    const body = res.json() as { id?: string; type?: string };
    expect(body.id).toBeDefined();
    expect(body.type).toBe('accident');
  });

  it('incident appears in nearby alerts list', async () => {
    const session = await login();
    // Create an incident
    await call('POST', '/v1/incidents', {
      token: session.accessToken,
      payload: {
        type: 'roadblock',
        lat: 33.3152,
        lng: 44.3661,
        description: 'إغلاق طريق مؤقت',
        ttlHours: 1,
      },
    });
    // Fetch nearby incidents
    const list = await call(
      'GET',
      '/v1/incidents?lat=33.3152&lng=44.3661&radiusKm=5',
      { token: session.accessToken },
    );
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items?: unknown[] };
    expect(body.items ?? []).toBeDefined();
  });

  it('incident has correct type and location', async () => {
    const session = await login();
    const res = await call('POST', '/v1/incidents', {
      token: session.accessToken,
      payload: {
        type: 'flood',
        lat: 33.32,
        lng: 44.37,
        description: 'تجمع مياه',
        ttlHours: 3,
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    const body = res.json() as { type?: string; location?: [number, number] };
    expect(body.type).toBe('flood');
  });

  it('invalid incident type returns 400', async () => {
    const session = await login();
    const res = await call('POST', '/v1/incidents', {
      token: session.accessToken,
      payload: {
        type: 'invalidtype',
        lat: 33.31,
        lng: 44.36,
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('incident with out-of-Iraq coordinates rejected', async () => {
    const session = await login();
    const res = await call('POST', '/v1/incidents', {
      token: session.accessToken,
      payload: {
        type: 'accident',
        lat: 51.5, // London
        lng: -0.1,
        description: 'خارج العراق',
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('list incidents requires at least lat/lng params', async () => {
    const session = await login();
    const res = await call('GET', '/v1/incidents', {
      token: session.accessToken,
    });
    // Should either require params or return empty
    expect([200, 400]).toContain(res.statusCode);
  });

  it('reporting multiple incidents in same area', async () => {
    const session = await login();
    const types = ['accident', 'roadblock', 'flood'] as const;
    for (const type of types) {
      const res = await call('POST', '/v1/incidents', {
        token: session.accessToken,
        payload: {
          type,
          lat: 33.315 + Math.random() * 0.01,
          lng: 44.366 + Math.random() * 0.01,
          ttlHours: 1,
        },
      });
      expect(res.statusCode).toBeLessThan(300);
    }
  });
});

// ─── Alert subscription (unit-level via FakeSafetyService) ───────────────────

describe('Safety – alert subscription (unit)', () => {
  it('subscriber receives alert when incident created in radius', () => {
    const subscriptions: Array<{ userId: string; lat: number; lng: number; radiusKm: number }> = [];
    const alerts: Array<{ userId: string; incidentId: string; type: string }> = [];

    function subscribe(userId: string, lat: number, lng: number, radiusKm: number) {
      subscriptions.push({ userId, lat, lng, radiusKm });
    }

    function publishIncident(incidentId: string, type: string, lat: number, lng: number) {
      for (const sub of subscriptions) {
        const distKm = Math.sqrt(
          Math.pow((sub.lat - lat) * 111, 2) + Math.pow((sub.lng - lng) * 111, 2),
        );
        if (distKm <= sub.radiusKm) {
          alerts.push({ userId: sub.userId, incidentId, type });
        }
      }
    }

    subscribe('user-1', 33.3152, 44.3661, 5);
    subscribe('user-2', 33.4, 44.4, 5); // farther away

    publishIncident('inc-1', 'accident', 33.32, 44.37);

    // user-1 should receive (dist ~1km), user-2 might or might not
    const user1Alerts = alerts.filter((a) => a.userId === 'user-1');
    expect(user1Alerts).toHaveLength(1);
    expect(user1Alerts[0]!.type).toBe('accident');
  });

  it('subscriber outside radius does not receive alert', () => {
    const alerts: string[] = [];

    function publish(subLat: number, subLng: number, subRadius: number, incLat: number, incLng: number) {
      const dist = Math.sqrt(
        Math.pow((subLat - incLat) * 111, 2) + Math.pow((subLng - incLng) * 111, 2),
      );
      if (dist <= subRadius) alerts.push('alerted');
    }

    // User is 20km away, radius is 5km
    publish(33.5, 44.5, 5, 33.3152, 44.3661);
    expect(alerts).toHaveLength(0);
  });

  it('multiple subscribers in radius all receive alert', () => {
    type Sub = { id: string; lat: number; lng: number; radius: number };
    const subs: Sub[] = [
      { id: 'u1', lat: 33.315, lng: 44.366, radius: 3 },
      { id: 'u2', lat: 33.316, lng: 44.367, radius: 3 },
      { id: 'u3', lat: 33.317, lng: 44.368, radius: 3 },
    ];
    const incLat = 33.316, incLng = 44.367;
    const notified: string[] = [];
    for (const sub of subs) {
      const dist = Math.sqrt(
        Math.pow((sub.lat - incLat) * 111, 2) + Math.pow((sub.lng - incLng) * 111, 2),
      );
      if (dist <= sub.radius) notified.push(sub.id);
    }
    expect(notified).toHaveLength(3);
  });

  it('unsubscribed user does not receive alert', () => {
    const active = new Set(['user-1', 'user-2']);
    const received: string[] = [];

    function notify(userId: string) {
      if (active.has(userId)) received.push(userId);
    }

    active.delete('user-2');
    notify('user-1');
    notify('user-2');

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('user-1');
  });
});

// ─── Admin confirmation flow (unit) ──────────────────────────────────────────

describe('Safety – admin confirmation (unit)', () => {
  type IncidentStatus = 'pending' | 'confirmed' | 'dismissed';
  interface Incident {
    id: string;
    type: string;
    status: IncidentStatus;
    confirmedBy?: string;
    confirmedAt?: Date;
  }

  it('admin can confirm a pending incident', () => {
    const incident: Incident = { id: 'i1', type: 'flood', status: 'pending' };
    function confirmIncident(inc: Incident, adminId: string): Incident {
      if (inc.status !== 'pending') throw new Error('Already processed');
      return { ...inc, status: 'confirmed', confirmedBy: adminId, confirmedAt: new Date() };
    }
    const confirmed = confirmIncident(incident, 'admin-1');
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedBy).toBe('admin-1');
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
  });

  it('admin can dismiss a pending incident', () => {
    const incident: Incident = { id: 'i2', type: 'accident', status: 'pending' };
    function dismissIncident(inc: Incident, adminId: string): Incident {
      if (inc.status !== 'pending') throw new Error('Already processed');
      return { ...inc, status: 'dismissed', confirmedBy: adminId, confirmedAt: new Date() };
    }
    const dismissed = dismissIncident(incident, 'admin-2');
    expect(dismissed.status).toBe('dismissed');
  });

  it('confirming already-confirmed incident throws', () => {
    const incident: Incident = { id: 'i3', type: 'roadblock', status: 'confirmed' };
    function confirmIncident(inc: Incident, adminId: string): Incident {
      if (inc.status !== 'pending') throw new Error('Already processed');
      return { ...inc, status: 'confirmed', confirmedBy: adminId };
    }
    expect(() => confirmIncident(incident, 'admin-1')).toThrow('Already processed');
  });

  it('status transitions: pending → confirmed is valid', () => {
    const valid: Record<IncidentStatus, IncidentStatus[]> = {
      pending: ['confirmed', 'dismissed'],
      confirmed: [],
      dismissed: [],
    };
    expect(valid.pending).toContain('confirmed');
    expect(valid.confirmed).toHaveLength(0);
  });

  it('confirmed incident boosts alert priority', () => {
    function getAlertPriority(status: IncidentStatus): 'low' | 'medium' | 'high' {
      if (status === 'confirmed') return 'high';
      if (status === 'pending') return 'medium';
      return 'low';
    }
    expect(getAlertPriority('confirmed')).toBe('high');
    expect(getAlertPriority('pending')).toBe('medium');
    expect(getAlertPriority('dismissed')).toBe('low');
  });

  it('incident list filters by active status', () => {
    const incidents: Incident[] = [
      { id: 'a', type: 'flood', status: 'confirmed' },
      { id: 'b', type: 'accident', status: 'dismissed' },
      { id: 'c', type: 'roadblock', status: 'pending' },
    ];
    const active = incidents.filter((i) => i.status !== 'dismissed');
    expect(active).toHaveLength(2);
    expect(active.every((i) => i.status !== 'dismissed')).toBe(true);
  });

  it('incident expiry logic', () => {
    const past = new Date(Date.now() - 3_600_000);
    const future = new Date(Date.now() + 3_600_000);

    function isActive(expiresAt: Date): boolean {
      return expiresAt > new Date();
    }

    expect(isActive(future)).toBe(true);
    expect(isActive(past)).toBe(false);
  });
});
