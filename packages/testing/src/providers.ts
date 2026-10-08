// M3: provider ports and phone verification fakes and conformance suites.
import { randomInt, randomUUID } from 'node:crypto';
import {
  contactChannelsOf,
  publicProfileOf,
  type AssetId,
  type ConsentScope,
  type IraqiPhone,
  type PhoneVerificationPort,
  type PlaceId,
  type ProviderDirectoryPort,
  type ProviderId,
  type ProviderProfilePort,
  type ProviderRecord,
  type ProviderStatus,
} from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';
import { randomPhone } from './env';

type SeedInput = { placeId: PlaceId; status: ProviderStatus; consents: ConsentScope[] };

/** Records shared by FakeProviderProfile and FakeProviderDirectory; seed() fills every field. Filtering is the
 * contracts' publicProfileOf / contactChannelsOf, the same functions modules/providers uses. */
export class FakeProviderStore {
  readonly records = new Map<ProviderId, ProviderRecord & { placeId: PlaceId }>();
  seed({ placeId, status, consents }: SeedInput): ProviderId {
    const providerId = randomUUID() as ProviderId;
    this.records.set(providerId, {
      providerId,
      placeId,
      status,
      consents,
      phone: randomPhone(),
      photos: [{ assetId: randomUUID() as AssetId, url: 'https://media.test/photo.webp' }],
      hoursRaw: 'Mo-Su 09:00-22:00',
      social: [{ kind: 'instagram', url: 'https://instagram.com/example' }],
      prices: [{ label: 'Room', min: 50_000, max: 90_000, currency: 'IQD' }],
    });
    return providerId;
  }
}

export class FakeProviderProfile implements ProviderProfilePort {
  constructor(readonly store = new FakeProviderStore()) {}
  async publicProfile(placeId: PlaceId) {
    const record = [...this.store.records.values()].find((r) => r.placeId === placeId);
    return record ? publicProfileOf(record) : null;
  }
}

export class FakeProviderDirectory implements ProviderDirectoryPort {
  constructor(readonly store = new FakeProviderStore()) {}
  async contactChannels(providerId: ProviderId) {
    const record = this.store.records.get(providerId);
    return record ? contactChannelsOf(record) : [];
  }
}

export interface ProvidersHarness {
  profile: ProviderProfilePort;
  directory: ProviderDirectoryPort;
  /** Stores a provider of `placeId` with everything filled in (business phone, a photo, hours, a link, a price), in
   * `status`, with exactly `consents` active. */
  seed(input: SeedInput): Promise<ProviderId>;
}

const ALL: ConsentScope[] = ['photos', 'social_links', 'whatsapp_messages', 'show_phone', 'show_prices'];

export function providerPortsConformance(name: string, make: () => ProvidersHarness | Promise<ProvidersHarness>): void {
  describe(`ProviderProfilePort and ProviderDirectoryPort conformance: ${name}`, () => {
    const place = () => `n${randomInt(1, 2 ** 40)}` as PlaceId;

    it('shows everything of a verified provider with every consent', async () => {
      const h = await make();
      const placeId = place();
      const id = await h.seed({ placeId, status: 'verified', consents: ALL });
      const profile = await h.profile.publicProfile(placeId);
      expect(profile).toMatchObject({ providerId: id, verified: true, hours: expect.any(String), phone: expect.any(String) });
      expect([profile?.photos.length, profile?.social.length, profile?.prices?.length]).toEqual([1, 1, 1]);
      expect((await h.directory.contactChannels(id)).map((c) => c.kind).sort()).toEqual(['in_app', 'phone', 'social', 'whatsapp']);
    });

    it.each(ALL)('without the %s consent, its data is absent from the profile and the directory', async (scope) => {
      const h = await make();
      const placeId = place();
      const id = await h.seed({ placeId, status: 'verified', consents: ALL.filter((s) => s !== scope) });
      const profile = (await h.profile.publicProfile(placeId))!;
      const kinds = (await h.directory.contactChannels(id)).map((c) => c.kind);
      const absent = {
        photos: profile.photos.length === 0,
        social_links: profile.social.length === 0 && !kinds.includes('social'),
        whatsapp_messages: !kinds.includes('whatsapp'),
        show_phone: profile.phone === undefined && !kinds.includes('phone'),
        show_prices: profile.prices === undefined,
      };
      expect(absent[scope]).toBe(true);
      expect(kinds).toContain('in_app');
    });

    it.each<ProviderStatus>(['draft', 'pending', 'suspended'])('shows nothing at all of a %s provider', async (status) => {
      const h = await make();
      const placeId = place();
      const id = await h.seed({ placeId, status, consents: ALL });
      expect(await h.profile.publicProfile(placeId)).toBeNull();
      expect(await h.directory.contactChannels(id)).toEqual([]);
    });

    it('answers null and no channels for unknown places and providers', async () => {
      const h = await make();
      expect(await h.profile.publicProfile(place())).toBeNull();
      expect(await h.directory.contactChannels(randomUUID() as ProviderId)).toEqual([]);
    });
  });
}

/** In-memory PhoneVerificationPort; codeFor() reads the code an SMS would carry. */
export class FakePhoneVerification implements PhoneVerificationPort {
  private readonly pending = new Map<string, { phone: IraqiPhone; code: string; expiresAt: Date }>();
  codeFor(phone: IraqiPhone): string | undefined {
    return [...this.pending.values()].findLast((p) => p.phone === phone)?.code;
  }
  async start({ phone }: Parameters<PhoneVerificationPort['start']>[0]) {
    const verificationId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    this.pending.set(verificationId, { phone, code: String(randomInt(1e6)).padStart(6, '0'), expiresAt });
    return { verificationId, expiresAt };
  }
  async confirm({ verificationId, code }: Parameters<PhoneVerificationPort['confirm']>[0]) {
    const p = this.pending.get(verificationId);
    if (!p || p.code !== code) return { verified: false as const, reason: 'invalid' as const };
    this.pending.delete(verificationId);
    return { verified: true as const, phone: p.phone };
  }
}

export interface PhoneVerificationHarness {
  port: PhoneVerificationPort;
  /** The code last sent to `phone` (the OTP sender's capture). */
  codeFor(phone: IraqiPhone): string | undefined;
}

export function phoneVerificationConformance(name: string, make: () => PhoneVerificationHarness | Promise<PhoneVerificationHarness>): void {
  describe(`PhoneVerificationPort conformance: ${name}`, () => {
    const start = (h: PhoneVerificationHarness, phone: IraqiPhone) => h.port.start({ phone, locale: 'ar', purpose: 'provider_phone' });

    it('verifies the phone with the sent code, once', async () => {
      const h = await make();
      const phone = randomPhone();
      const { verificationId, expiresAt } = await start(h, phone);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      const code = h.codeFor(phone)!;
      expect(await h.port.confirm({ verificationId, code })).toEqual({ verified: true, phone });
      expect((await h.port.confirm({ verificationId, code })).verified).toBe(false);
    });

    it('refuses a wrong code and an unknown verification', async () => {
      const h = await make();
      const phone = randomPhone();
      const { verificationId } = await start(h, phone);
      const wrong = h.codeFor(phone) === '000000' ? '111111' : '000000';
      expect(await h.port.confirm({ verificationId, code: wrong })).toMatchObject({ verified: false });
      expect(await h.port.confirm({ verificationId: randomUUID(), code: wrong })).toMatchObject({ verified: false });
    });
  });
}
