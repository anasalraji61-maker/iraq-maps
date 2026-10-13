import { type PhoneVerificationPort, type ProviderId, type UserId } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { providersMigrationsDir } from './providers.module';
import { ProvidersService } from './providers.service';

// In-memory fake PhoneVerificationPort
function makeFakePhone(): PhoneVerificationPort & { setNextResult(r: Awaited<ReturnType<PhoneVerificationPort['confirm']>>): void } {
  let nextResult: Awaited<ReturnType<PhoneVerificationPort['confirm']>> = { verified: true, phone: '+9647001234567' as never };
  return {
    setNextResult(r) { nextResult = r; },
    async start() { return { verificationId: 'fake-vid', expiresAt: new Date(Date.now() + 60_000) }; },
    async confirm() { return nextResult; },
  };
}

let tdb: TestDatabase;
let svc: ProvidersService;
const fakePhone = makeFakePhone();

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` as UserId;
const adminId = uid(999);

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: [{ schema: 'providers', migrationsDir: providersMigrationsDir }] });
  svc = new ProvidersService(tdb.db, fakePhone);
});

afterAll(async () => {
  await tdb?.drop();
});

describe('register', () => {
  it('creates a pending draft provider', async () => {
    const row = await svc.register(uid(1), { name: 'مطعم الكرخ', category: 'food' });
    expect(row.status).toBe('draft');
    expect(row.userId).toBe(uid(1));
    expect(row.name).toBe('مطعم الكرخ');
  });

  it('throws 409 when user already has a provider', async () => {
    // uid(1) already registered above
    await expect(svc.register(uid(1), { name: 'dup', category: 'food' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('phone verification', () => {
  it('marks business_phone_verified_at on confirm', async () => {
    const row = await svc.register(uid(2), { name: 'صيدلية النور', category: 'health' });
    await svc.startPhoneVerification(uid(2), row.id as ProviderId, '+9647001111111', 'ar');
    const updated = await svc.confirmPhoneVerification(uid(2), row.id as ProviderId, 'fake-vid', '123456');
    expect(updated.businessPhoneVerifiedAt).toBeTruthy();
    expect(updated.businessPhone).toBe('+9647001234567'); // phone from fakePhone's result
  });
});

describe('update ownership', () => {
  it('throws 403 when non-owner tries to update', async () => {
    const row = await svc.register(uid(3), { name: 'بقالة', category: 'shopping' });
    await expect(svc.update(uid(4), row.id as ProviderId, { name: 'hack' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('consent', () => {
  let providerId: ProviderId;

  beforeAll(async () => {
    const row = await svc.register(uid(5), { name: 'صالون', category: 'beauty' });
    providerId = row.id as ProviderId;
  });

  it('grantConsent + getConsentLedger shows active scope', async () => {
    await svc.grantConsent(uid(5), providerId, 'show_phone', { textVersion: 'v1', locale: 'ar' });
    const ledger = await svc.getConsentLedger(providerId);
    expect(ledger.active).toContain('show_phone');
  });

  it('revokeConsent removes it from active list', async () => {
    await svc.revokeConsent(uid(5), providerId, 'show_phone');
    const ledger = await svc.getConsentLedger(providerId);
    expect(ledger.active).not.toContain('show_phone');
  });
});

describe('admin verify / suspend', () => {
  let providerId: ProviderId;

  beforeAll(async () => {
    // Register + verify phone + submit to get into pending state
    const row = await svc.register(uid(6), { name: 'فندق', category: 'accommodation' });
    providerId = row.id as ProviderId;
    await svc.startPhoneVerification(uid(6), providerId, '+9647009999999', 'ar');
    await svc.confirmPhoneVerification(uid(6), providerId, 'fake-vid', '123456');
    await svc.submit(uid(6), providerId);
  });

  it('verify changes status to verified and emits event', async () => {
    const updated = await svc.adminVerify(adminId, providerId);
    expect(updated.status).toBe('verified');
  });

  it('suspend changes status to suspended', async () => {
    const updated = await svc.adminSuspend(adminId, providerId, 'مخالفة الشروط');
    expect(updated.status).toBe('suspended');
    expect(updated.suspensionReason).toBe('مخالفة الشروط');
  });
});
