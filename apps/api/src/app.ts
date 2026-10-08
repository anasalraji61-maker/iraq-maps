import 'reflect-metadata';
import { defineModuleConfig } from '@iraq-maps/config';
import { apiContract, healthContract, PortTokens, type Clock, type OtpSender, type UserDataEraser } from '@iraq-maps/contracts';
import { createDb, createInProcessEventBus, createOutboxPublisher, startOutboxRelay, type OutboxRelay } from '@iraq-maps/db-kit';
import { IdentityAuthGuard, identityMigrationsDir, identityModule } from '@iraq-maps/identity';
import { createLogger, type Logger } from '@iraq-maps/observability';
import { placesMigrationsDir, placesModule } from '@iraq-maps/places';
import {
  Catch,
  Controller,
  HttpException,
  Module,
  type ArgumentsHost,
  type ExceptionFilter,
  type LoggerService,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Type,
} from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { generateOpenApi } from '@ts-rest/open-api';
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Nest DI note: tsx/esbuild/vite do not emit decorator metadata, so always inject with explicit @Inject(token).

/** Module migrations, in order. The `platform` schema (outbox) always runs before them. */
export const moduleMigrations = [
  { schema: 'identity', migrationsDir: identityMigrationsDir },
  { schema: 'places', migrationsDir: placesMigrationsDir },
];

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
 * Every error answer is a Problem. An HttpException keeps a Problem body it already carries (the auth guard's 401);
 * other 4xx (ts-rest request validation, and Fastify's body parser on malformed JSON, which Nest turns into an
 * HttpException) become `invalid_request`, or `not_found`. Anything else is a generic 500 whose message is never
 * logged: a driver error such as drizzle's "Failed query: ... params: ..." carries user data.
 */
function toProblem(err: unknown, route: string | undefined, log?: Logger): [number, object] {
  if (err instanceof HttpException && err.getStatus() < 500) {
    const [status, body] = [err.getStatus(), err.getResponse()];
    if (typeof body === 'object' && 'title' in body) return [status, body];
    return [status, status === 404 ? problem(404, 'not_found', 'Not found') : problem(status, 'invalid_request', 'Invalid request')];
  }
  const { name, cause } = (err ?? {}) as { name?: unknown; cause?: { code?: unknown } };
  log?.error({ errorName: name, pgCode: cause?.code, route }, 'unhandled error');
  return [500, problem(500, 'internal', 'Internal server error')];
}

@Catch()
class ProblemFilter implements ExceptionFilter {
  constructor(private readonly log?: Logger) {}
  catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const [status, body] = toProblem(err, http.getRequest<FastifyRequest>().routeOptions?.url, this.log);
    void http.getResponse<FastifyReply>().status(status).send(body);
  }
}

/**
 * Fastify's request log line names the route pattern, never the URL: a query such as `near=<lng>,<lat>` would put
 * precise coordinates in the logs. An unmatched request logs its path without the query string.
 */
const reqLog = (req: FastifyRequest) => ({ method: req.method, route: req.routeOptions?.url ?? req.url.split('?')[0], remoteAddress: req.ip });
const fastifyLogger = (log: Logger) =>
  (log as unknown as { child(bindings: object, opts: object): FastifyBaseLogger }).child({}, { serializers: { req: reqLog } });

/** Fastify answers a bad URL encoding (400) or an over-long path parameter (414) before routing, with a body that
 * echoes the URL. These answer the Problem instead; the nosniff hook does not run for them, so they set it here. */
const frameworkErrors = (err: { statusCode?: number }, _req: FastifyRequest, reply: FastifyReply) => {
  const status = err.statusCode ?? 400;
  void reply.code(status).header('x-content-type-options', 'nosniff').send(problem(status, 'invalid_request', 'Invalid request'));
};

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
      imports: [identity, placesModule({ db, env: opts.env })],
      controllers: [HealthController, ...(opts.controllers ?? [])],
      providers: [{ provide: APP_GUARD, useClass: IdentityAuthGuard }, { provide: PortTokens.EventBus, useValue: bus }],
      exports: [PortTokens.EventBus],
    },
    new FastifyAdapter({ trustProxy: trustProxy(config.TRUST_PROXY), loggerInstance: log && fastifyLogger(log), frameworkErrors }),
    { logger: log ? nestLogger(log) : false, abortOnError: false },
  );
  app.useGlobalFilters(new ProblemFilter(log));
  const fastify = app.getHttpAdapter().getInstance();
  // Clients must not sniff a JSON or tile answer into something executable.
  fastify.addHook('onRequest', async (_req, reply) => void reply.header('x-content-type-options', 'nosniff'));
  // A plain Fastify route: outside Nest routing, so the auth guard never sees it.
  const openApi = generateOpenApi(apiContract, { info: { title: 'iraq-maps API', version: '0.0.0' } }, { setOperationId: 'concatenated-path' });
  fastify.get('/openapi.json', async () => openApi);
  await app.init();
  await fastify.ready();
  return app;
}
