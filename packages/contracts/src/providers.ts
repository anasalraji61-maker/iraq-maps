// M3 contracts: provider mode, consents and admin verification.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { IraqiPhone, LngLat, Locale, paginated, PlaceId, Problem, UserId } from './common';
import { PlaceCategory } from './geo-data';
import { AssetId, SignedUrlString } from './media';

const c = initContract();

/** @public frozen contract (M3) */
export const ProviderId = z.string().uuid().brand<'ProviderId'>();
export type ProviderId = z.infer<typeof ProviderId>;
/** Each scope is granted and revoked on its own; revoking hides the data from the next request.
 * @public frozen contract (M3) */
export const ConsentScope = z.enum(['photos', 'social_links', 'whatsapp_messages', 'show_phone', 'show_prices']);
export type ConsentScope = z.infer<typeof ConsentScope>;
/** draft → pending (submitted) → verified | suspended. Nothing is public unless verified.
 * @public frozen contract (M3) */
export const ProviderStatus = z.enum(['draft', 'pending', 'verified', 'suspended']);
export type ProviderStatus = z.infer<typeof ProviderStatus>;

const text = (max: number) => z.string().trim().min(1).max(max).regex(/^[^\p{Cc}]*$/u);
const https = z.string().max(500).url().regex(/^https:\/\//);

/** Stored and shown as a link only; nothing is fetched from the platform.
 * @public frozen contract (M3) */
export const SocialLink = z.object({ kind: z.enum(['instagram', 'facebook', 'tiktok', 'telegram', 'youtube', 'website']), url: https });
export type SocialLink = z.infer<typeof SocialLink>;
/** @public frozen contract (M3) */
export const PriceRange = z
  .object({ label: text(80), min: z.number().nonnegative(), max: z.number().nonnegative(), currency: z.enum(['IQD', 'USD']) })
  .refine((p) => p.min <= p.max, 'min above max');
export type PriceRange = z.infer<typeof PriceRange>;
/** `url` is a short-lived signed read URL (MediaPort.readUrl).
 * @public frozen contract (M3) */
export const ProviderPhoto = z.object({ assetId: AssetId, url: SignedUrlString });
export type ProviderPhoto = z.infer<typeof ProviderPhoto>;

/** `PlaceDetails.provider`: what the card shows for a verified provider, filtered by the active consents.
 * @public frozen contract (M3) */
export const PlaceProviderSection = z.object({
  providerId: ProviderId,
  verified: z.boolean(),
  /** Empty without the photos consent. */
  photos: z.array(ProviderPhoto),
  /** OSM opening_hours syntax. */
  hours: z.string().max(255).optional(),
  /** Empty without the social_links consent. */
  social: z.array(SocialLink),
  /** Only with the show_phone consent. */
  phone: IraqiPhone.optional(),
});
export type PlaceProviderSection = z.infer<typeof PlaceProviderSection>;
/** ProviderProfilePort's answer: the card section, plus prices only with show_prices (shown on the card from M5).
 * @public frozen contract (M3) */
export const PublicProviderProfile = PlaceProviderSection.extend({ prices: z.array(PriceRange).optional() });
export type PublicProviderProfile = z.infer<typeof PublicProviderProfile>;

/** ProviderDirectoryPort's answer (consumed from M4). Only consented channels of a verified provider.
 * @public frozen contract (M3) */
export const ContactChannel = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('in_app'), providerId: ProviderId }),
  z.object({ kind: z.literal('whatsapp'), phone: IraqiPhone }),
  z.object({ kind: z.literal('phone'), phone: IraqiPhone }),
  z.object({ kind: z.literal('social'), link: SocialLink }),
]);
export type ContactChannel = z.infer<typeof ContactChannel>;

/** Everything a provider entered plus its active consents, before filtering. Server side only, never on the wire. */
export interface ProviderRecord {
  providerId: ProviderId;
  status: ProviderStatus;
  /** The verified business phone. */
  phone: IraqiPhone | null;
  photos: ProviderPhoto[];
  hoursRaw: string | null;
  social: SocialLink[];
  prices: PriceRange[];
  consents: ConsentScope[];
}

/** The one consent filter, shared by modules/providers and the fakes: null unless verified, each field only under
 * its consent.
 * @public frozen contract (M3) */
export function publicProfileOf(p: ProviderRecord): PublicProviderProfile | null {
  if (p.status !== 'verified') return null;
  const has = (scope: ConsentScope) => p.consents.includes(scope);
  return {
    providerId: p.providerId,
    verified: true,
    photos: has('photos') ? p.photos : [],
    ...(p.hoursRaw ? { hours: p.hoursRaw } : {}),
    social: has('social_links') ? p.social : [],
    ...(has('show_phone') && p.phone ? { phone: p.phone } : {}),
    ...(has('show_prices') ? { prices: p.prices } : {}),
  };
}

/** The contact channels a verified provider consented to; in-app messaging needs no consent.
 * @public frozen contract (M3) */
export function contactChannelsOf(p: ProviderRecord): ContactChannel[] {
  if (p.status !== 'verified') return [];
  const has = (scope: ConsentScope) => p.consents.includes(scope);
  return [
    { kind: 'in_app', providerId: p.providerId },
    ...(has('whatsapp_messages') && p.phone ? [{ kind: 'whatsapp' as const, phone: p.phone }] : []),
    ...(has('show_phone') && p.phone ? [{ kind: 'phone' as const, phone: p.phone }] : []),
    ...(has('social_links') ? p.social.map((link) => ({ kind: 'social' as const, link })) : []),
  ];
}

/** A provider's own place (not claimed from OSM) in places.provider_place and on the wire: `p<providerId>`.
 * @public frozen contract (M3) */
export const providerPlaceId = (id: ProviderId) => `p${id}` as PlaceId;

/** Read at request time, never cached, so a revoke or a suspension shows on the next request. */
export interface ProviderProfilePort {
  /** The verified provider of this place (claimed OSM place or provider place), consent-filtered; null when none. */
  publicProfile(placeId: PlaceId): Promise<PublicProviderProfile | null>;
}

export interface ProviderDirectoryPort {
  contactChannels(providerId: ProviderId): Promise<ContactChannel[]>;
}

/** The owner's own view.
 * @public frozen contract (M3) */
export const ProviderMe = z.object({
  id: ProviderId,
  status: ProviderStatus,
  name: text(120),
  category: PlaceCategory,
  location: LngLat.nullable(),
  phone: z.object({ number: IraqiPhone, verified: z.boolean() }).nullable(),
  claimedPlaceId: PlaceId.nullable(),
  hoursRaw: z.string().max(255).nullable(),
  prices: z.array(PriceRange).max(30),
  links: z.array(SocialLink).max(10),
  photos: z.array(ProviderPhoto).max(10),
  /** Active consents. */
  consents: z.array(ConsentScope),
  suspensionReason: z.string().max(500).nullable(),
});
export type ProviderMe = z.infer<typeof ProviderMe>;

/** What the owner saw when granting or revoking: the consent wording's version and language.
 * @public frozen contract (M3) */
export const ConsentEvidence = z.object({ textVersion: z.string().regex(/^[a-z0-9._-]{1,40}$/), locale: Locale });
/** Append-only ledger: a revoke sets revokedAt on the grant's record; a new grant is a new record.
 * @public frozen contract (M3) */
export const ConsentLedger = z.object({
  active: z.array(ConsentScope),
  records: z.array(z.object({ scope: ConsentScope, grantedAt: z.string().datetime(), revokedAt: z.string().datetime().nullable(), evidence: ConsentEvidence })),
});
export type ConsentLedger = z.infer<typeof ConsentLedger>;

const placeIdParam = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).pipe(PlaceId);

/**
 * The signed-in user's provider (one per user). 409 on create: already a provider. 409 on submit: the business phone
 * is not verified yet, or the provider is not a draft. 409 on claim: the place is claimed by another provider.
 * @public frozen contract (M3), served by modules/providers
 */
export const providersContract = c.router(
  {
    create: {
      method: 'POST',
      path: '/providers',
      body: z.object({ name: text(120), category: PlaceCategory, location: LngLat.optional() }),
      responses: { 201: ProviderMe, 400: Problem, 401: Problem, 409: Problem },
    },
    me: { method: 'GET', path: '/providers/me', responses: { 200: ProviderMe, 401: Problem, 404: Problem } },
    update: {
      method: 'PATCH',
      path: '/providers/me',
      body: z.object({
        name: text(120).optional(),
        category: PlaceCategory.optional(),
        location: LngLat.optional(),
        hoursRaw: z.string().max(255).nullable().optional(),
        prices: z.array(PriceRange).max(30).optional(),
        links: z.array(SocialLink).max(10).optional(),
        /** Ready provider_photo assets of this user, in display order. */
        photoAssetIds: z.array(AssetId).max(10).optional(),
      }),
      responses: { 200: ProviderMe, 400: Problem, 401: Problem, 404: Problem, 409: Problem },
    },
    phoneStart: {
      method: 'POST',
      path: '/providers/me/phone/start',
      body: z.object({ phone: IraqiPhone, locale: Locale.default('ar') }),
      responses: { 202: z.object({ verificationId: z.string(), expiresAt: z.string().datetime() }), 400: Problem, 401: Problem, 404: Problem, 429: Problem },
    },
    phoneConfirm: {
      method: 'POST',
      path: '/providers/me/phone/confirm',
      body: z.object({ verificationId: z.string().min(1).max(100), code: z.string().regex(/^\d{6}$/) }),
      responses: { 200: ProviderMe, 400: Problem, 401: Problem, 404: Problem, 429: Problem },
    },
    claim: {
      method: 'POST',
      path: '/providers/me/claim',
      body: z.object({ placeId: placeIdParam }),
      responses: { 200: ProviderMe, 400: Problem, 401: Problem, 404: Problem, 409: Problem },
    },
    submit: { method: 'POST', path: '/providers/me/submit', body: c.noBody(), responses: { 200: ProviderMe, 401: Problem, 404: Problem, 409: Problem } },
    consents: { method: 'GET', path: '/providers/me/consents', responses: { 200: ConsentLedger, 401: Problem, 404: Problem } },
    setConsent: {
      method: 'PUT',
      path: '/providers/me/consents/:scope',
      pathParams: z.object({ scope: ConsentScope }),
      body: z.object({ granted: z.boolean(), evidence: ConsentEvidence }),
      responses: { 200: ConsentLedger, 400: Problem, 401: Problem, 404: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** @public frozen contract (M3) */
export const AdminProviderView = ProviderMe.extend({
  ownerUserId: UserId,
  submittedAt: z.string().datetime().nullable(),
  audit: z.array(
    z.object({ action: z.enum(['submitted', 'verified', 'suspended']), actorUserId: UserId, reason: z.string().max(500).nullable(), at: z.string().datetime() }),
  ),
});
export type AdminProviderView = z.infer<typeof AdminProviderView>;

/** Roles admin or moderator only: 403 for everyone else.
 * @public frozen contract (M3), served by modules/providers */
export const adminProvidersContract = c.router(
  {
    queue: {
      method: 'GET',
      path: '/admin/providers',
      query: z.object({ status: ProviderStatus.default('pending'), cursor: z.string().max(200).optional() }),
      responses: { 200: paginated(AdminProviderView), 400: Problem, 401: Problem, 403: Problem },
    },
    verify: {
      method: 'POST',
      path: '/admin/providers/:id/verify',
      pathParams: z.object({ id: ProviderId }),
      body: c.noBody(),
      responses: { 200: AdminProviderView, 401: Problem, 403: Problem, 404: Problem, 409: Problem },
    },
    suspend: {
      method: 'POST',
      path: '/admin/providers/:id/suspend',
      pathParams: z.object({ id: ProviderId }),
      body: z.object({ reason: text(500) }),
      responses: { 200: AdminProviderView, 400: Problem, 401: Problem, 403: Problem, 404: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** Merged into the event registry (events.ts). profile.updated feeds places.provider_place (id, name, category and
 * location only); places shows it only between verified and suspended. */
export const providerEventPayloads = {
  'providers.provider.verified.v1': z.object({ providerId: ProviderId }),
  'providers.provider.suspended.v1': z.object({ providerId: ProviderId }),
  'providers.consent.changed.v1': z.object({ providerId: ProviderId, scope: ConsentScope, granted: z.boolean() }),
  'providers.profile.updated.v1': z.object({
    providerId: ProviderId,
    name: text(120),
    category: PlaceCategory,
    location: LngLat.nullable(),
    claimedPlaceId: PlaceId.nullable(),
  }),
} as const;

/** @public frozen contract (M3) */
export const providerTestIDs = {
  entry: 'account.provider',
  phoneInput: 'provider.phone.input',
  phoneSubmit: 'provider.phone.submit',
  otpInput: 'provider.otp.input',
  otpSubmit: 'provider.otp.submit',
  nameInput: 'provider.name.input',
  category: 'provider.category',
  location: 'provider.location',
  claimSearch: 'provider.claim.search',
  claimResult: 'provider.claim.result',
  photosAdd: 'provider.photos.add',
  hoursInput: 'provider.hours.input',
  save: 'provider.save',
  submit: 'provider.submit',
  status: 'provider.status',
  consent: {
    photos: 'provider.consent.photos',
    social_links: 'provider.consent.social_links',
    whatsapp_messages: 'provider.consent.whatsapp_messages',
    show_phone: 'provider.consent.show_phone',
    show_prices: 'provider.consent.show_prices',
    revokeConfirm: 'provider.consent.revoke.confirm',
  },
  place: { section: 'place.provider', verified: 'place.provider.verified', photos: 'place.provider.photos', phone: 'place.provider.phone', claim: 'place.claim' },
} as const;
