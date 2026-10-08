import type { IraqiPhone, Locale, Role, UserId } from './common';
import type { DomainEvent, EventName } from './events';

/** DI tokens: modules provide ports under these, consumers inject them, nobody imports another module. */
export const PortTokens = {
  IdentityPort: 'port:IdentityPort',
  PhoneVerificationPort: 'port:PhoneVerificationPort',
  OtpSender: 'port:OtpSender',
  UserDataErasers: 'port:UserDataErasers',
  EventBus: 'port:EventBus',
  OutboxPublisher: 'port:OutboxPublisher',
  Clock: 'port:Clock',
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
