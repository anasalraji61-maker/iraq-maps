import 'reflect-metadata';
import { defineModuleConfig } from '@iraq-maps/config';
import { apiContract, healthContract, PortTokens, type Clock, type OtpSender, type UserDataEraser } from '@iraq-maps/contracts';
import { createDb, createInProcessEventBus, createOutboxPublisher, startOutboxRelay, type OutboxRelay } from '@iraq-maps/db-kit';
import { IdentityAuthGuard, identityMigrationsDir, identityModule } from '@iraq-maps/identity';
import { createLogger, type Logger } from '@iraq-maps/observability';
import {
  Catch,
  Controller,
  HttpException,
  Module,
  type ArgumentsHost,
  type LoggerService,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { APP_GUARD, BaseExceptionFilter, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { RequestValidationError, TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { generateOpenApi } from '@ts-rest/open-api';
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
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
      // Fastify trustProxy: a hop count or comma-separated proxy IPs/CIDRs. `true` trusts any X-Forwarded-For, which
      // makes the per-IP OTP limit spoofable, so production refuses it.
      TRUST_PROXY: z.string().default('false'),
    },
    { env, productionForbidden: { TRUST_PROXY: ['true'] } },
  );

const trustProxy = (v: string) => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v);

@Controller()
class HealthController {
  @TsRestHandler(healthContract.health)
  health() {
    return tsRestHandler(healthContract.health, async () => ({ status: 200, body: { status: 'ok', version: '0.0.0' } }));
  }
}

const problem = (status: number, code: string, title: string) => ({ type: 'about:blank', title, status, code });

/**
 * Errors as Problem bodies. ts-rest request validation becomes a 400 `invalid_request` (not the raw ZodError). Unknown
 * errors become a generic 500 and their message is never logged: a driver error such as drizzle's
 * "Failed query: ... params: ..." carries user data. Other HttpExceptions keep Nest's default handling.
 */
@Catch()
class ProblemFilter extends BaseExceptionFilter {
  constructor(
    applicationRef: ConstructorParameters<typeof BaseExceptionFilter>[0],
    private readonly log?: Logger,
  ) {
    super(applicationRef);
  }
  override catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const reply = (status: number, body: object) => void http.getResponse<FastifyReply>().status(status).send(body);
    if (err instanceof RequestValidationError) return reply(400, problem(400, 'invalid_request', 'Invalid request'));
    if (err instanceof HttpException) return super.catch(err, host);
    const { name, cause } = (err ?? {}) as { name?: unknown; cause?: { code?: unknown } };
    this.log?.error({ errorName: name, pgCode: cause?.code, route: http.getRequest<FastifyRequest>().routeOptions?.url }, 'unhandled error');
    reply(500, problem(500, 'internal', 'Internal server error'));
  }
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
  /** Extra controllers behind the global auth guard, e.g. a test's protected dummy route. */
  controllers?: Type[];
}

/** Composition root: wires modules and port bindings. Call app.listen() yourself, or use app.inject() in tests. */
export async function createApp(opts: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const config = apiConfig(opts.env);
  const { db, close } = createDb(config.DATABASE_URL);
  const bus = createInProcessEventBus();

  @Module({})
  class AppModule implements OnApplicationBootstrap, OnApplicationShutdown {
    private relay?: OutboxRelay;
    onApplicationBootstrap() {
      this.relay = startOutboxRelay({ db, target: { bus } });
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
      controllers: [HealthController, ...(opts.controllers ?? [])],
      providers: [{ provide: APP_GUARD, useClass: IdentityAuthGuard }, { provide: PortTokens.EventBus, useValue: bus }],
      exports: [PortTokens.EventBus],
    },
    new FastifyAdapter({ trustProxy: trustProxy(config.TRUST_PROXY), loggerInstance: log as FastifyBaseLogger | undefined }),
    { logger: log ? nestLogger(log) : false, abortOnError: false },
  );
  app.useGlobalFilters(new ProblemFilter(app.getHttpAdapter(), log));
  // A plain Fastify route: outside Nest routing, so the auth guard never sees it.
  const openApi = generateOpenApi(apiContract, { info: { title: 'iraq-maps API', version: '0.0.0' } }, { setOperationId: 'concatenated-path' });
  app.getHttpAdapter().getInstance().get('/openapi.json', async () => openApi);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
