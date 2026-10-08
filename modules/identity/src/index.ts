import type { Clock, OtpSender, OutboxPublisher, UserDataEraser } from '@iraq-maps/contracts';
import type { Db, DbTx } from '@iraq-maps/db-kit';
import type { DynamicModule } from '@nestjs/common';

export interface IdentityModuleOptions {
  db: Db;
  redisUrl: string;
  /** Defaults to the sender selected by OTP_SENDER (console/fixed are refused in production). */
  otpSender?: OtpSender;
  /** Every bound eraser is called on DELETE /v1/me before identity.user.deleted.v1 is written to the outbox. */
  erasers: UserDataEraser[];
  outbox: OutboxPublisher<DbTx>;
  clock?: Clock;
  env?: Record<string, string | undefined>;
}

/** Absolute path of this module's migrations (schema `identity`). */
export declare const identityMigrationsDir: string;

/**
 * Nest module serving the auth + me routers of packages/contracts, and providing
 * PortTokens.IdentityPort and PortTokens.PhoneVerificationPort.
 */
export function identityModule(_opts: IdentityModuleOptions): DynamicModule {
  throw new Error('not implemented');
}
