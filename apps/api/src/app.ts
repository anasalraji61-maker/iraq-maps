import 'reflect-metadata';
import { defineModuleConfig } from '@iraq-maps/config';
import {
  healthContract,
  PortTokens,
  type AuthPrincipal,
  type Clock,
  type EventBus,
  type EventHandler,
  type IdentityPort,
  type OtpSender,
  type UserDataEraser,
} from '@iraq-maps/contracts';
import { createDb, createOutboxPublisher, startOutboxRelay, type OutboxRelay } from '@iraq-maps/db-kit';
import { identityMigrationsDir, identityModule } from '@iraq-maps/identity';
import { createLogger, type Logger } from '@iraq-maps/observability';
import { Controller, HttpException, Inject, Injectable, Module, type CanActivate, type ExecutionContext, type LoggerService, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

// Nest DI note: tsx/esbuild/vite do not emit decorator metadata, so always inject with explicit @Inject(token).

/** Module migrations, in order. The `platform` schema (outbox) always runs before them. */
export const moduleMigrations = [{ schema: 'identity', migrationsDir: identityMigrationsDir }];

export const apiConfig = (env?: Record<string, string | undefined>) =>
  defineModuleConfig(
    'api',
    {
      DATABASE_URL: z.string().url(),
      REDIS_URL: z.string().url(),
      API_PORT: z.coerce.number().int().default(3000),
      LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      // Fastify trustProxy: true, false, a hop count, or comma-separated proxy IPs/CIDRs.
      TRUST_PROXY: z
        .string()
        .default('false')
        .transform((v) => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v)),
      OUTBOX_TARGET: z.enum(['bus', 'bullmq']).default('bus'),
    },
    { env },
  );

@Controller()
class HealthController {
  @TsRestHandler(healthContract.health)
  health() {
    return tsRestHandler(healthContract.health, async () => ({ status: 200, body: { status: 'ok', version: '0.0.0' } }));
  }
}

const PUBLIC_PATH = /^\/(health$|v1\/auth\/)/;

/** Every route needs a valid access token except /health and /v1/auth/*. Sets `req.principal`. */
@Injectable()
class AuthGuard implements CanActivate {
  constructor(@Inject(PortTokens.IdentityPort) private readonly identity: IdentityPort) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ url: string; headers: { authorization?: string }; principal?: AuthPrincipal }>();
    if (PUBLIC_PATH.test(req.url.split('?')[0]!)) return true;
    const principal = await this.identity.verifyAccessToken((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
    if (!principal) throw new HttpException({ type: 'about:blank', title: 'Missing, invalid or revoked access token', status: 401, code: 'unauthorized' }, 401);
    req.principal = principal;
    return true;
  }
}

/** The relay's default target; modules subscribe through PortTokens.EventBus. */
function inProcessBus(): EventBus {
  const subscribers: { name: string; handler: EventHandler }[] = [];
  return {
    async publish(event) {
      for (const s of subscribers) if (s.name === event.name) await s.handler(event);
    },
    subscribe(name, handler) {
      const entry = { name, handler: handler as EventHandler };
      subscribers.push(entry);
      return () => void subscribers.splice(subscribers.indexOf(entry), 1);
    },
  };
}

const nestLogger = (log: Logger): LoggerService => ({
  log: (message: unknown) => log.info(String(message)),
  warn: (message: unknown) => log.warn(String(message)),
  error: (message: unknown, ...meta: unknown[]) => log.error({ meta }, String(message)),
});

/** Test/e2e seams. Production uses env-selected implementations. */
export interface CreateAppOptions {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  otpSender?: OtpSender;
  clock?: Clock;
  erasers?: UserDataEraser[];
  /** Redacting JSON logs (packages/observability) for Nest and Fastify; off by default for tests. */
  logger?: boolean;
}

/** Composition root: wires modules and port bindings. Call app.listen() yourself, or use app.inject() in tests. */
export async function createApp(opts: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const config = apiConfig(opts.env);
  const { db, close } = createDb(config.DATABASE_URL);
  const bus = inProcessBus();

  @Module({})
  class AppModule implements OnApplicationBootstrap, OnApplicationShutdown {
    private relay?: OutboxRelay;
    onApplicationBootstrap() {
      this.relay = startOutboxRelay({ db, target: config.OUTBOX_TARGET === 'bullmq' ? { redisUrl: config.REDIS_URL } : { bus } });
    }
    async onApplicationShutdown() {
      await this.relay?.stop();
      await close();
    }
  }

  const log = opts.logger ? createLogger({ name: 'api', level: config.LOG_LEVEL }) : undefined;
  const identity = identityModule({
    db,
    redisUrl: config.REDIS_URL,
    outbox: createOutboxPublisher(db),
    erasers: opts.erasers ?? [],
    otpSender: opts.otpSender,
    clock: opts.clock,
    env: opts.env,
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: AppModule,
      global: true,
      imports: [identity],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }, { provide: PortTokens.EventBus, useValue: bus }],
      exports: [PortTokens.EventBus],
    },
    new FastifyAdapter({ trustProxy: config.TRUST_PROXY, loggerInstance: log as FastifyBaseLogger | undefined }),
    { logger: log ? nestLogger(log) : false, abortOnError: false },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
