import { fileURLToPath } from 'node:url';
import { PortTokens, type Clock, type IdentityPort, type OtpSender, type OutboxPublisher, type UserDataEraser } from '@iraq-maps/contracts';
import type { Db, DbTx } from '@iraq-maps/db-kit';
import { createLogger } from '@iraq-maps/observability';
import { Inject, Module, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { identityConfig } from './config';
import { AuthController, INTERNALS, MeController } from './http';
import { Otp, phoneVerification } from './otp';
import { otpDelivery } from './senders';
import { Sessions } from './sessions';
import { Users } from './users';

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
export const identityMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

@Module({})
class IdentityModule implements OnModuleDestroy {
  constructor(@Inject(Redis) private readonly redis: Redis) {}
  async onModuleDestroy() {
    await this.redis.quit();
  }
}

/**
 * Nest module serving the auth + me routers of packages/contracts, and providing
 * PortTokens.IdentityPort and PortTokens.PhoneVerificationPort.
 */
export function identityModule(opts: IdentityModuleOptions): DynamicModule {
  const config = identityConfig(opts.env);
  const delivery = otpDelivery(config, opts.otpSender);
  const clock = opts.clock ?? { now: () => new Date() };
  const log = createLogger({ name: 'identity' });
  const redis = new Redis(opts.redisUrl).on('error', (err) => log.error({ err }, 'redis connection error'));
  const otp = new Otp(redis, delivery, config.PHONE_HASH_KEY, clock, log);
  const sessions = new Sessions(opts.db, config, clock, log);
  const users = new Users(opts.db, config, clock, opts.outbox, opts.erasers, log);
  const identityPort: IdentityPort = { verifyAccessToken: (token) => sessions.verify(token), getUser: (id) => users.get(id) };
  return {
    module: IdentityModule,
    global: true,
    controllers: [AuthController, MeController],
    providers: [
      { provide: Redis, useValue: redis },
      { provide: INTERNALS, useValue: { otp, sessions, users, phoneHashKey: config.PHONE_HASH_KEY } },
      { provide: PortTokens.IdentityPort, useValue: identityPort },
      { provide: PortTokens.PhoneVerificationPort, useValue: phoneVerification(otp, config.PHONE_ENCRYPTION_KEY) },
    ],
    exports: [PortTokens.IdentityPort, PortTokens.PhoneVerificationPort],
  };
}
