import 'reflect-metadata';
import { defineModuleConfig } from '@iraq-maps/config';
import { apiContract, healthContract, PortTokens, type Clock, type OtpSender, type UserDataEraser } from '@iraq-maps/contracts';
import { createDb, createInProcessEventBus, createOutboxPublisher, startOutboxRelay, type OutboxRelay } from '@iraq-maps/db-kit';
import { Queue } from 'bullmq';
import { IdentityAuthGuard, identityMigrationsDir, identityModule } from '@iraq-maps/identity';
import { mediaMigrationsDir, mediaModule } from '@iraq-maps/media';
import { AssistantModule, assistantMigrationsDir, PLACES_SEARCH_TOKEN } from '@iraq-maps/assistant';
import { InsightsModule, insightsMigrationsDir } from '@iraq-maps/insights';
import { discoverModule, discoverMigrationsDir } from '@iraq-maps/discover';
import { messagingMigrationsDir, messagingModule } from '@iraq-maps/messaging';
import { notificationsMigrationsDir, notificationsModule } from '@iraq-maps/notifications';
import { createLogger, type Logger } from '@iraq-maps/observability';
import { placesMigrationsDir, placesModule } from '@iraq-maps/places';
import { providersMigrationsDir, providersModule } from '@iraq-maps/providers';
import { routingModule } from '@iraq-maps/routing';
import { createS3StorageFromEnv } from '@iraq-maps/adapter-storage-s3';
import { sql } from 'drizzle-orm';
import {
  Catch,
  Controller,
  HttpException,
  Inject,
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
  { schema: 'media', migrationsDir: mediaMigrationsDir },
  { schema: 'providers', migrationsDir: providersMigrationsDir },
  { schema: 'messaging', migrationsDir: messagingMigrationsDir },
  { schema: 'notifications', migrationsDir: notificationsMigrationsDir },
  { schema: 'assistant', migrationsDir: assistantMigrationsDir },
  { schema: 'insights', migrationsDir: insightsMigrationsDir },
  { schema: 'discover', migrationsDir: discoverMigrationsDir },
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
      // Internal admin key for /internal/* endpoints. Must be set in production.
      ADMIN_KEY: z.string().optional(),
    },
    { env, productionForbidden: { TRUST_PROXY: ['true'] } },
  );

const trustProxy = (v: string) => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v);

@Controller()
class HealthController {
  constructor(
    @Inject('HEALTH_DB') private readonly db: ReturnType<typeof createDb>['db'],
    @Inject('HEALTH_QUEUES') private readonly queues: Queue[],
  ) {}

  @TsRestHandler(healthContract.health)
  health() {
    return tsRestHandler(healthContract.health, async () => {
      try {
        await this.db.execute(sql`SELECT 1`);
      } catch {
        // Return 503 by throwing an HttpException that bypasses the 200 contract
        throw Object.assign(new HttpException(problem(503, 'db_unavailable', 'Database unavailable'), 503), {});
      }
      const queueStats: Record<string, { waiting: number; active: number; failed: number }> = {};
      for (const q of this.queues) {
        try {
          const counts = await q.getJobCounts('waiting', 'active', 'failed');
          queueStats[q.name] = { waiting: counts.waiting ?? 0, active: counts.active ?? 0, failed: counts.failed ?? 0 };
        } catch {
          queueStats[q.name] = { waiting: -1, active: -1, failed: -1 };
        }
      }
      return { status: 200, body: { status: 'ok', version: '1.0.0', queues: queueStats } };
    });
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
  const adminKey = config.ADMIN_KEY;
  const { db, close } = createDb(config.DATABASE_URL);
  const messagingQueue = new Queue('messaging', { connection: { url: config.REDIS_URL } });
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
  const storage = createS3StorageFromEnv() ?? undefined;
  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: AppModule,
      global: true,
      imports: [
        identity,
        placesModule({ db, env: opts.env }),
        routingModule({ env: opts.env }),
        mediaModule({ db, storage }),
        providersModule({ db, phoneVerification: null }),
        messagingModule({ db }),
        notificationsModule({ db, eventBus: bus, env: opts.env }),
        {
          module: AssistantModule,
          providers: [
            {
              provide: PLACES_SEARCH_TOKEN,
              useFactory: (placesQuery: import('@iraq-maps/contracts').PlacesQueryPort) =>
                async (query: string, city?: string) => {
                  const results = await placesQuery.search({ q: query, city: (city ?? 'baghdad') as import('@iraq-maps/contracts').CityId, limit: 5, lang: 'ar' });
                  return results.map((r) => ({ id: r.id, name: r.names.ar ?? r.names.name, address: r.area?.name ?? '' }));
                },
              inject: [PortTokens.PlacesQueryPort],
            },
          ],
        } as unknown as typeof AssistantModule,
        InsightsModule,
        discoverModule({ db, eventBus: bus }),
      ],
      controllers: [HealthController, ...(opts.controllers ?? [])],
      providers: [
        { provide: APP_GUARD, useClass: IdentityAuthGuard },
        { provide: PortTokens.EventBus, useValue: bus },
        { provide: 'HEALTH_DB', useValue: db },
        { provide: 'HEALTH_QUEUES', useValue: [messagingQueue] },
      ],
      exports: [PortTokens.EventBus],
    },
    new FastifyAdapter({ trustProxy: trustProxy(config.TRUST_PROXY), loggerInstance: log && fastifyLogger(log), frameworkErrors }),
    { logger: log ? nestLogger(log) : false, abortOnError: false },
  );
  app.useGlobalFilters(new ProblemFilter(log));
  const fastify = app.getHttpAdapter().getInstance();
  // Clients must not sniff a JSON or tile answer into something executable.
  fastify.addHook('onRequest', async (req, reply) => {
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('x-request-id', req.id);
  });
  // A plain Fastify route: outside Nest routing, so the auth guard never sees it.
  const openApi = generateOpenApi(apiContract, { info: { title: 'iraq-maps API', version: '0.0.0' } }, { setOperationId: 'concatenated-path' });
  fastify.get('/openapi.json', async () => openApi);

  // Admin metrics route: aggregate counts for dashboard.
  fastify.get('/v1/admin/metrics', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const [usersRes, providersRes, postsTodayRes, pendingRes] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM identity.users`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM providers.provider`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM discover.post WHERE created_at >= current_date`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM providers.provider WHERE status = 'pending'`),
    ]);
    return reply.status(200).send({
      totalUsers: (usersRes.rows[0] as { count: number }).count,
      totalProviders: (providersRes.rows[0] as { count: number }).count,
      postsToday: (postsTodayRes.rows[0] as { count: number }).count,
      pendingVerification: (pendingRes.rows[0] as { count: number }).count,
    });
  });

  // Internal admin route: returns failed job counts per queue.
  fastify.get('/internal/queues/failed', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(403).send(problem(403, 'forbidden', 'Forbidden'));
    }
    const queues = [messagingQueue];
    const result: Record<string, { failed: number }> = {};
    for (const q of queues) {
      try {
        const counts = await q.getJobCounts('failed');
        result[q.name] = { failed: counts.failed ?? 0 };
      } catch {
        result[q.name] = { failed: -1 };
      }
    }
    return reply.status(200).send({ queues: result });
  });

  await app.init();
  await fastify.ready();
  return app;
}
