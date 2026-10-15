/**
 * Unit tests for FakeProviderStore, FakeProviderProfile, FakeProviderDirectory, FakePhoneVerification.
 * Also runs the phoneVerificationConformance suite against FakePhoneVerification.
 */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PlaceId, ProviderId, UserId } from '@iraq-maps/contracts';
import {
  FakeProviderStore,
  FakeProviderProfile,
  FakeProviderDirectory,
  FakePhoneVerification,
  phoneVerificationConformance,
} from './providers';
import { randomPhone } from './env';

const place = () => randomUUID() as PlaceId;
const user = () => randomUUID() as UserId;

describe('FakeProviderStore', () => {
  it('seed returns a ProviderId string', () => {
    const store = new FakeProviderStore();
    const id = store.seed({ placeId: place(), status: 'verified', consents: [] });
    expect(typeof id).toBe('string');
  });

  it('seed stores the record accessible by providerId', () => {
    const store = new FakeProviderStore();
    const placeId = place();
    const id = store.seed({ placeId, status: 'verified', consents: [] });
    expect(store.records.has(id)).toBe(true);
    expect(store.records.get(id)?.placeId).toBe(placeId);
  });

  it('seed with userId populates userToProvider map', () => {
    const store = new FakeProviderStore();
    const userId = user();
    const id = store.seed({ placeId: place(), status: 'verified', consents: [], userId });
    expect(store.userToProvider.get(userId)).toBe(id);
  });
});

describe('FakeProviderProfile', () => {
  it('returns null for unknown placeId', async () => {
    const profile = new FakeProviderProfile();
    expect(await profile.publicProfile(place())).toBeNull();
  });

  it('returns a profile for a verified provider with show_phone consent', async () => {
    const profile = new FakeProviderProfile();
    const placeId = place();
    profile.store.seed({ placeId, status: 'verified', consents: ['show_phone'] });
    const p = await profile.publicProfile(placeId);
    expect(p).not.toBeNull();
  });

  it('returns null for a draft provider even with all consents', async () => {
    const profile = new FakeProviderProfile();
    const placeId = place();
    profile.store.seed({ placeId, status: 'draft', consents: ['photos', 'show_phone', 'show_prices', 'social_links', 'whatsapp_messages'] });
    expect(await profile.publicProfile(placeId)).toBeNull();
  });
});

describe('FakeProviderDirectory', () => {
  it('returns empty array for unknown providerId', async () => {
    const dir = new FakeProviderDirectory();
    expect(await dir.contactChannels(randomUUID() as ProviderId)).toEqual([]);
  });

  it('isVerifiedProvider returns false for unknown userId', async () => {
    const dir = new FakeProviderDirectory();
    expect(await dir.isVerifiedProvider(user())).toBe(false);
  });

  it('isVerifiedProvider returns true for verified provider userId', async () => {
    const dir = new FakeProviderDirectory();
    const userId = user();
    dir.store.seed({ placeId: place(), status: 'verified', consents: [], userId });
    expect(await dir.isVerifiedProvider(userId)).toBe(true);
  });

  it('isVerifiedProvider returns false for pending provider', async () => {
    const dir = new FakeProviderDirectory();
    const userId = user();
    dir.store.seed({ placeId: place(), status: 'pending', consents: [], userId });
    expect(await dir.isVerifiedProvider(userId)).toBe(false);
  });
});

describe('FakePhoneVerification', () => {
  it('codeFor returns undefined for an unsent phone', () => {
    const fv = new FakePhoneVerification();
    expect(fv.codeFor(randomPhone())).toBeUndefined();
  });

  it('start returns a future expiresAt', async () => {
    const fv = new FakePhoneVerification();
    const { expiresAt } = await fv.start({ phone: randomPhone(), locale: 'ar', purpose: 'provider_phone' });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('codeFor returns the OTP code after start', async () => {
    const fv = new FakePhoneVerification();
    const phone = randomPhone();
    await fv.start({ phone, locale: 'ar', purpose: 'provider_phone' });
    expect(fv.codeFor(phone)).toMatch(/^\d{6}$/);
  });

  it('confirm with wrong code returns verified=false', async () => {
    const fv = new FakePhoneVerification();
    const phone = randomPhone();
    const { verificationId } = await fv.start({ phone, locale: 'ar', purpose: 'provider_phone' });
    const code = fv.codeFor(phone)!;
    const wrong = code === '000000' ? '111111' : '000000';
    const result = await fv.confirm({ verificationId, code: wrong });
    expect(result.verified).toBe(false);
  });
});

phoneVerificationConformance('FakePhoneVerification', () => {
  const fv = new FakePhoneVerification();
  return { port: fv, codeFor: (phone) => fv.codeFor(phone) };
});
