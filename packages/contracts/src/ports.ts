import type { IraqiPhone, Locale, PlaceId, Role, UserId } from './common';
import type { DomainEvent, EventName } from './events';
import type { NearbyQuery, PlaceDetails, PlaceSummary, SearchQuery } from './places';

/** DI tokens: modules provide ports under these, consumers inject them, nobody imports another module. */
export const PortTokens = {
  IdentityPort: 'port:IdentityPort',
  PhoneVerificationPort: 'port:PhoneVerificationPort',
  EventBus: 'port:EventBus',
  PlacesQueryPort: 'port:PlacesQueryPort',
  RoutingPort: 'port:RoutingPort', // M2
  ProviderProfilePort: 'port:ProviderProfilePort', // M3
  ProviderDirectoryPort: 'port:ProviderDirectoryPort', // M3
  MediaPort: 'port:MediaPort', // M3
  ObjectStorage: 'port:ObjectStorage', // M3
} as const;

export interface Clock {
  now(): Date;
}

export interface AuthPrincipal {
  userId: UserId;
  roles: Role[];
}

export interface IdentityPort {
  /** Verifies a bearer access token; null when invalid, expired or revoked. */
  verifyAccessToken(token: string): Promise<AuthPrincipal | null>;
  getUser(userId: UserId): Promise<{ id: UserId; name: string | null; locale: Locale; roles: Role[] } | null>;
}

/** Proves a phone number is reachable, e.g. a provider's business phone (used from M2). */
export interface PhoneVerificationPort {
  start(input: { phone: IraqiPhone; locale: Locale; purpose: 'provider_phone' }): Promise<{ verificationId: string; expiresAt: Date }>;
  confirm(input: { verificationId: string; code: string }): Promise<{ verified: true; phone: IraqiPhone } | { verified: false; reason: 'invalid' | 'expired' | 'too_many_attempts' }>;
}

/** Read side of modules/places (OSM-derived data only). Consumers: the /v1 places routes; the assistant from M5. */
export interface PlacesQueryPort {
  /** Spelling-insensitive name search (packages/i18n normalizer) over places, streets and areas of one city. */
  search(query: SearchQuery): Promise<PlaceSummary[]>;
  getById(id: PlaceId): Promise<PlaceDetails | null>;
  /** Kind `place` only, within query.radiusM of query.near, nearest first. */
  nearby(query: NearbyQuery): Promise<PlaceSummary[]>;
}

export interface OtpSender {
  readonly kind: 'fake' | 'fixed' | 'console' | 'sms';
  send(message: { phone: IraqiPhone; code: string; locale: Locale }): Promise<void>;
}

/** Every module that stores user data implements this (ADR-0007). Must be idempotent. */
export interface UserDataEraser {
  readonly module: string;
  erase(userId: UserId): Promise<void>;
}

export type EventHandler<N extends EventName = EventName> = (event: DomainEvent<N>) => Promise<void> | void;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): () => void;
}

/** Writes an event to the outbox inside the caller's transaction; the relay delivers it later. */
export interface OutboxPublisher<Tx = unknown> {
  publish(event: DomainEvent, tx?: Tx): Promise<void>;
}
