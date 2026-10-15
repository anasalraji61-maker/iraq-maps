/**
 * Unit tests for publicProfileOf and contactChannelsOf.
 */
import { describe, expect, it } from 'vitest';
import { publicProfileOf, contactChannelsOf, type ProviderRecord, type ProviderId, type ConsentScope } from './providers';
import type { IraqiPhone } from './common';

const PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as ProviderId;
const PHONE = '+9647701234567' as IraqiPhone;

function makeProvider(overrides: Partial<ProviderRecord> = {}): ProviderRecord {
  return {
    providerId: PROVIDER_ID,
    status: 'verified',
    phone: null,
    photos: [],
    hoursRaw: null,
    social: [],
    prices: [],
    consents: [],
    avgResponseHours: null,
    ...overrides,
  };
}

describe('publicProfileOf', () => {
  it('returns null when provider is not verified (draft)', () => {
    expect(publicProfileOf(makeProvider({ status: 'draft' }))).toBeNull();
  });

  it('returns null when provider is suspended', () => {
    expect(publicProfileOf(makeProvider({ status: 'suspended' }))).toBeNull();
  });

  it('returns null when provider is pending', () => {
    expect(publicProfileOf(makeProvider({ status: 'pending' }))).toBeNull();
  });

  it('returns a profile for a verified provider with no consents', () => {
    const profile = publicProfileOf(makeProvider());
    expect(profile).not.toBeNull();
    expect(profile!.providerId).toBe(PROVIDER_ID);
    expect(profile!.photos).toEqual([]);
    expect(profile!.phone).toBeUndefined();
  });

  it('exposes phone when show_phone consent is active', () => {
    const profile = publicProfileOf(makeProvider({ phone: PHONE, consents: ['show_phone'] as ConsentScope[] }));
    expect(profile!.phone).toBe(PHONE);
  });

  it('hides phone without show_phone consent', () => {
    const profile = publicProfileOf(makeProvider({ phone: PHONE, consents: [] }));
    expect(profile!.phone).toBeUndefined();
  });

  it('includes hoursRaw when set', () => {
    const profile = publicProfileOf(makeProvider({ hoursRaw: 'Mo-Fr 09:00-18:00' }));
    expect(profile!.hours).toBe('Mo-Fr 09:00-18:00');
  });

  it('does not include hours key when hoursRaw is null', () => {
    const profile = publicProfileOf(makeProvider({ hoursRaw: null }));
    expect('hours' in profile!).toBe(false);
  });

  it('includes prices when show_prices consent is active', () => {
    const prices = [{ label: 'شاورما', min: 3000, max: 5000, currency: 'IQD' as const }];
    const profile = publicProfileOf(makeProvider({ prices, consents: ['show_prices'] as ConsentScope[] }));
    expect(profile!.prices).toEqual(prices);
  });

  it('includes avgResponseHours when set', () => {
    const profile = publicProfileOf(makeProvider({ avgResponseHours: 2 }));
    expect(profile!.avgResponseHours).toBe(2);
  });
});

describe('contactChannelsOf', () => {
  it('returns empty when provider is not verified', () => {
    expect(contactChannelsOf(makeProvider({ status: 'draft' }))).toEqual([]);
  });

  it('always includes in_app channel for verified providers', () => {
    const channels = contactChannelsOf(makeProvider());
    expect(channels.some((c) => c.kind === 'in_app')).toBe(true);
  });

  it('includes whatsapp when whatsapp_messages consent + phone set', () => {
    const channels = contactChannelsOf(makeProvider({ phone: PHONE, consents: ['whatsapp_messages'] as ConsentScope[] }));
    expect(channels.some((c) => c.kind === 'whatsapp')).toBe(true);
  });

  it('excludes whatsapp without phone even with whatsapp_messages consent', () => {
    const channels = contactChannelsOf(makeProvider({ phone: null, consents: ['whatsapp_messages'] as ConsentScope[] }));
    expect(channels.some((c) => c.kind === 'whatsapp')).toBe(false);
  });

  it('includes phone channel with show_phone consent + phone', () => {
    const channels = contactChannelsOf(makeProvider({ phone: PHONE, consents: ['show_phone'] as ConsentScope[] }));
    expect(channels.some((c) => c.kind === 'phone')).toBe(true);
  });

  it('includes social channels with social_links consent', () => {
    const social = [{ kind: 'instagram' as const, url: 'https://instagram.com/test' }];
    const channels = contactChannelsOf(makeProvider({ social, consents: ['social_links'] as ConsentScope[] }));
    expect(channels.some((c) => c.kind === 'social')).toBe(true);
  });

  it('combines all channels when all consents granted', () => {
    const social = [{ kind: 'facebook' as const, url: 'https://facebook.com/test' }];
    const channels = contactChannelsOf(makeProvider({
      phone: PHONE,
      social,
      consents: ['whatsapp_messages', 'show_phone', 'social_links'] as ConsentScope[],
    }));
    const kinds = channels.map((c) => c.kind);
    expect(kinds).toContain('in_app');
    expect(kinds).toContain('whatsapp');
    expect(kinds).toContain('phone');
    expect(kinds).toContain('social');
  });
});
