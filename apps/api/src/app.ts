import 'reflect-metadata';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
import { incidentsModule, incidentsMigrationsDir } from '@iraq-maps/incidents';
import { locationShareModule, locationShareMigrationsDir } from '@iraq-maps/location-share';
import { tour3dModule, tour3dMigrationsDir } from '@iraq-maps/tour3d';
import { moderationModule, moderationMigrationsDir } from '@iraq-maps/moderation';
import { paymentsModule, paymentsMigrationsDir } from '@iraq-maps/payments';
import { socialModule, socialMigrationsDir } from '@iraq-maps/social';
import { SearchModule, searchMigrationsDir } from '@iraq-maps/search';
import { reviewsModule, reviewsMigrationsDir } from '@iraq-maps/reviews';
import { reputationModule, reputationMigrationsDir } from '@iraq-maps/reputation';
import { geocodingModule } from '@iraq-maps/geocoding';
import { appointmentsModule, appointmentsMigrationsDir } from '@iraq-maps/appointments';
import { listingsModule, listingsMigrationsDir } from '@iraq-maps/listings';
import { challengesModule, challengesMigrationsDir } from '@iraq-maps/challenges';
import { promotionsModule, promotionsMigrationsDir } from '@iraq-maps/promotions';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { MetricsDashboardService } from './analytics/metrics-dashboard';
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
  { schema: 'incidents', migrationsDir: incidentsMigrationsDir },
  { schema: 'location_share', migrationsDir: locationShareMigrationsDir },
  { schema: 'tour3d', migrationsDir: tour3dMigrationsDir },
  { schema: 'moderation', migrationsDir: moderationMigrationsDir },
  { schema: 'payments', migrationsDir: paymentsMigrationsDir },
  { schema: 'social', migrationsDir: socialMigrationsDir },
  { schema: 'search', migrationsDir: searchMigrationsDir },
  { schema: 'reviews', migrationsDir: reviewsMigrationsDir },
  { schema: 'reputation', migrationsDir: reputationMigrationsDir },
  { schema: 'appointments', migrationsDir: appointmentsMigrationsDir },
  { schema: 'listings', migrationsDir: listingsMigrationsDir },
  { schema: 'challenges', migrationsDir: challengesMigrationsDir },
  { schema: 'promotions', migrationsDir: promotionsMigrationsDir },
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
      // HMAC secret for mobile→API request signing (X-Request-Signature header). Optional; off when absent.
      REQUEST_SIGNING_SECRET: z.string().min(32).optional(),
    },
    { env, productionForbidden: { TRUST_PROXY: ['true'] } },
  );

// ──────────────────────────────────────────────────────────────────────────────
// HMAC request-signing helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Computes the expected HMAC-SHA256 signature for a request.
 * Canonical form: "<METHOD>\n<path>\n<unix-ts-seconds>\n<body-hex>"
 * The client reads the clock from the X-Request-Timestamp header it sends alongside the signature.
 */
export function computeRequestSignature(secret: string, method: string, path: string, timestampSec: number, bodyHex: string): string {
  const canonical = `${method.toUpperCase()}\n${path}\n${timestampSec}\n${bodyHex}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

/** Returns true when the signature in the header matches the computed one and the timestamp is within ±5 min. */
export function verifyRequestSignature(secret: string, method: string, path: string, bodyBuf: Buffer, header: string | undefined): boolean {
  if (!header) return false;
  const parts = header.split('.');
  if (parts.length !== 2) return false;
  const [tsStr, sig] = parts;
  const ts = parseInt(tsStr ?? '', 10);
  if (isNaN(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) return false; // 5-minute window
  const expected = computeRequestSignature(secret, method, path, ts, bodyBuf.toString('hex'));
  try {
    return timingSafeEqual(Buffer.from(sig ?? '', 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

const trustProxy = (v: string) => (v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v);

@Controller()
class HealthController {
  constructor(
    @Inject('HEALTH_DB') private readonly db: ReturnType<typeof createDb>['db'],
    @Inject('HEALTH_QUEUES') private readonly queues: Queue[],
    @Inject('HEALTH_REDIS') private readonly redis: import('ioredis').Redis,
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
      let redisOk: boolean;
      try {
        const pong = await this.redis.ping();
        redisOk = pong === 'PONG';
      } catch {
        redisOk = false;
      }
      if (!redisOk) {
        throw Object.assign(new HttpException(problem(503, 'redis_unavailable', 'Redis unavailable'), 503), {});
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
function toProblem(err: unknown, route: string | undefined, requestId?: string, log?: Logger): [number, object] {
  if (err instanceof HttpException && err.getStatus() < 500) {
    const [status, body] = [err.getStatus(), err.getResponse()];
    if (typeof body === 'object' && 'title' in body) return [status, { ...body, requestId }];
    return [status, status === 404 ? { ...problem(404, 'not_found', 'Not found'), requestId } : { ...problem(status, 'invalid_request', 'Invalid request'), requestId }];
  }
  const { name, cause } = (err ?? {}) as { name?: unknown; cause?: { code?: unknown } };
  log?.error({ errorName: name, pgCode: cause?.code, route, requestId }, 'unhandled error');
  return [500, { ...problem(500, 'internal', 'Internal server error'), requestId }];
}

@Catch()
class ProblemFilter implements ExceptionFilter {
  constructor(private readonly log?: Logger) {}
  catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const requestId = req.id as string | undefined;
    const [status, body] = toProblem(err, req.routeOptions?.url, requestId, this.log);
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
  // Admin key is mutable so the rotate-key endpoint can swap it without a restart.
  let adminKey = config.ADMIN_KEY;
  const { db, close } = createDb(config.DATABASE_URL);
  const messagingQueue = new Queue('messaging', { connection: { url: config.REDIS_URL } });
  const { Redis } = await import('ioredis');
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
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
      await redis.quit().catch(() => undefined);
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
        discoverModule({ db, eventBus: bus, redis }),
        incidentsModule({ db }),
        locationShareModule({ db }),
        tour3dModule({ db }),
        moderationModule({ db, redis }),
        paymentsModule({ db }),
        socialModule({ db, eventBus: bus }),
        SearchModule.register({ db, cache: redis }),
        reviewsModule({ db }),
        reputationModule({ db, eventBus: bus }),
        geocodingModule(),
        appointmentsModule({ db }),
        listingsModule({ db }),
        challengesModule({ db }),
        promotionsModule({ db }),
      ],
      controllers: [HealthController, AnalyticsController, ...(opts.controllers ?? [])],
      providers: [
        { provide: APP_GUARD, useClass: IdentityAuthGuard },
        { provide: PortTokens.EventBus, useValue: bus },
        { provide: 'HEALTH_DB', useValue: db },
        { provide: 'HEALTH_QUEUES', useValue: [messagingQueue] },
        { provide: 'HEALTH_REDIS', useValue: redis },
        AnalyticsService,
        MetricsDashboardService,
        { provide: 'ADMIN_KEY_REF', useValue: { value: process.env['ADMIN_API_KEY'] } },
      ],
      exports: [PortTokens.EventBus],
    },
    new FastifyAdapter({ trustProxy: trustProxy(config.TRUST_PROXY), loggerInstance: log && fastifyLogger(log), frameworkErrors }),
    { logger: log ? nestLogger(log) : false, abortOnError: false },
  );
  app.useGlobalFilters(new ProblemFilter(log));
  const fastify = app.getHttpAdapter().getInstance();

  // ── Security headers ────────────────────────────────────────────────────────
  fastify.addHook('onRequest', async (req, reply) => {
    // Prevent MIME sniffing
    void reply.header('x-content-type-options', 'nosniff');
    // Unique per-request tracing id
    void reply.header('x-request-id', req.id);
    // Deny framing to prevent clickjacking
    void reply.header('x-frame-options', 'DENY');
    // Enforce TLS for 1 year (including subdomains) — only meaningful over HTTPS
    void reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    // Do not send Referer header to third parties
    void reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    // Content-Security-Policy: this is a JSON API — no browser rendering, so lock it down hard
    void reply.header(
      'content-security-policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  // ── HMAC request-signature verification ───────────────────────────────────
  // When REQUEST_SIGNING_SECRET is configured, every state-changing request from
  // the mobile app must carry X-Request-Signature: <ts>.<hmac-hex>.
  // Reads (GET/HEAD) and internal admin routes are exempt.
  const sigSecret = config.REQUEST_SIGNING_SECRET;
  if (sigSecret) {
    fastify.addHook('preHandler', async (req, reply) => {
      const method = req.method.toUpperCase();
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
      // Internal routes use the admin key, not the mobile signing secret
      const route = req.routeOptions?.url ?? '';
      if (route.startsWith('/internal/')) return;
      const sig = (req.headers as Record<string, string | undefined>)['x-request-signature'];
      const body = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody ?? Buffer.alloc(0);
      if (!verifyRequestSignature(sigSecret, method, req.url, Buffer.isBuffer(body) ? body : Buffer.from(String(body)), sig)) {
        void reply.status(401).send(problem(401, 'invalid_signature', 'Request signature missing or invalid'));
        return reply;
      }
    });
  }
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

  // Admin user search: search by id prefix or name substring.
  fastify.get('/v1/admin/users', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const q = ((req.query as Record<string, string | undefined>)['q'] ?? '').trim();
    const limit = Math.min(50, parseInt(((req.query as Record<string, string | undefined>)['limit']) ?? '25', 10) || 25);
    const rows = await db.execute(
      q.length > 0
        ? sql`SELECT id, name, locale, roles, created_at FROM identity.users WHERE id::text ILIKE ${'%' + q + '%'} OR name ILIKE ${'%' + q + '%'} ORDER BY created_at DESC LIMIT ${limit}`
        : sql`SELECT id, name, locale, roles, created_at FROM identity.users ORDER BY created_at DESC LIMIT ${limit}`,
    );
    return reply.status(200).send({ items: rows.rows.map((r) => {
      const row = r as { id: string; name: string | null; locale: string; roles: string[]; created_at: Date };
      return { id: row.id, name: row.name ?? null, locale: row.locale, roles: row.roles, createdAt: row.created_at };
    }) });
  });

  // ── Admin: suspend user ───────────────────────────────────────────────────
  // Uses the `roles` array: adds the 'suspended' pseudo-role (no schema migration needed).
  // A future M7-ops migration can add a dedicated `suspended_at` column and remove the role approach.
  const suspendUserById = async (id: string, reason: string) => {
    await db.execute(
      sql`UPDATE identity.users SET roles = array_append(array_remove(roles, 'suspended'), 'suspended') WHERE id = ${id}`,
    );
    await db.execute(sql`
      INSERT INTO identity.admin_audit_log (admin_id, action, target_id, target_type, detail, created_at)
      SELECT id, 'suspend_user', ${id}, 'user', ${reason}, now()
      FROM identity.users WHERE roles @> ARRAY['admin']::text[] LIMIT 1
    `).catch(() => undefined);
  };

  const unsuspendUserById = async (id: string) => {
    await db.execute(
      sql`UPDATE identity.users SET roles = array_remove(roles, 'suspended') WHERE id = ${id}`,
    );
  };

  const banUserById = async (id: string, reason: string) => {
    await db.execute(
      sql`UPDATE identity.users SET roles = array_append(array_append(array_remove(array_remove(roles, 'suspended'), 'banned'), 'suspended'), 'banned') WHERE id = ${id}`,
    );
    await db.execute(sql`
      INSERT INTO identity.admin_audit_log (admin_id, action, target_id, target_type, detail, created_at)
      SELECT id, 'ban_user', ${id}, 'user', ${reason}, now()
      FROM identity.users WHERE roles @> ARRAY['admin']::text[] LIMIT 1
    `).catch(() => undefined);
  };

  const isAdmin = (req: { headers: unknown }): boolean => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    return !!adminKey && key === adminKey;
  };

  fastify.put('/v1/admin/users/:id/suspend', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string } | null;
    await suspendUserById(id, body?.reason ?? 'Admin action');
    return reply.status(204).send();
  });

  // POST aliases for backward-compat with existing frontend calls (UserManagementPage uses POST)
  fastify.post('/v1/admin/users/:id/suspend', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string } | null;
    await suspendUserById(id, body?.reason ?? 'Admin action');
    return reply.status(204).send();
  });

  fastify.post('/v1/admin/users/:id/unsuspend', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    const { id } = req.params as { id: string };
    await unsuspendUserById(id);
    return reply.status(204).send();
  });

  fastify.put('/v1/admin/users/:id/unsuspend', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    const { id } = req.params as { id: string };
    await unsuspendUserById(id);
    return reply.status(204).send();
  });

  // ── Admin: ban user ───────────────────────────────────────────────────────
  fastify.put('/v1/admin/users/:id/ban', async (req, reply) => {
    if (!isAdmin(req)) return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string } | null;
    await banUserById(id, body?.reason ?? 'Admin ban');
    return reply.status(204).send();
  });

  // ── Admin: pending places queue ───────────────────────────────────────────
  fastify.get('/v1/admin/places/pending', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const rows = await db.execute(
      sql`SELECT id, name_ar, name_en, category, phone, hours_raw, lat, lon,
                 submitted_by_user_id, submitted_at, submission_note
          FROM places.community_submission
          WHERE status = 'pending'
          ORDER BY submitted_at ASC
          LIMIT 100`,
    );
    const items = rows.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row['id'],
        nameAr: row['name_ar'],
        nameEn: row['name_en'] ?? null,
        category: row['category'],
        phone: row['phone'] ?? null,
        hoursRaw: row['hours_raw'] ?? null,
        lat: Number(row['lat']),
        lon: Number(row['lon']),
        submittedBy: row['submitted_by_user_id'] ?? null,
        submittedAt: row['submitted_at'] ? new Date(row['submitted_at'] as string).toISOString().slice(0, 10) : null,
        submissionNote: row['submission_note'] ?? null,
      };
    });
    return reply.status(200).send({ items });
  });

  // ── Admin: approve pending place ──────────────────────────────────────────
  fastify.put('/v1/admin/places/:id/approve', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const { id } = req.params as { id: string };
    await db.execute(
      sql`UPDATE places.community_submission SET status = 'approved', reviewed_at = now() WHERE id = ${id}`,
    );
    return reply.status(204).send();
  });

  // ── Admin: reject pending place ───────────────────────────────────────────
  fastify.put('/v1/admin/places/:id/reject', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string } | null;
    await db.execute(
      sql`UPDATE places.community_submission SET status = 'rejected', reject_reason = ${body?.reason ?? null}, reviewed_at = now() WHERE id = ${id}`,
    );
    return reply.status(204).send();
  });

  // ── Admin: system stats ───────────────────────────────────────────────────
  fastify.get('/v1/admin/system/stats', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const uptimeSeconds = process.uptime();
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const mins = Math.floor((uptimeSeconds % 3600) / 60);
    const dbVersionRes = await db.execute(sql`SELECT version() AS v`).catch(() => ({ rows: [{ v: 'unknown' }] }));
    const dbVersion = String((dbVersionRes.rows[0] as { v: string }).v ?? '').split(' ').slice(0, 2).join(' ');
    return reply.status(200).send({
      uptime: `${days}d ${hours}h ${mins}m`,
      apiVersion: process.env['npm_package_version'] ?? '1.0.0',
      dbVersion,
      nodeVersion: process.version,
      environment: process.env['NODE_ENV'] ?? 'production',
    });
  });

  // ── Admin: set feature flags (stub — persists in memory only) ─────────────
  fastify.put('/v1/admin/system/feature-flags', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    // Feature flags persistence is a future Redis/DB-backed store; acknowledge for now.
    return reply.status(200).send({ saved: true });
  });

  // ── Admin: flush cache (stub) ─────────────────────────────────────────────
  fastify.post('/v1/admin/system/cache/flush', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    // Real implementation would clear Redis keys by prefix. Stub for now.
    return reply.status(200).send({ flushed: true });
  });

  // ── Admin key rotation (no restart required) ─────────────────────────────
  // POST /internal/admin/rotate-key  { newKey: string }
  // The caller must supply both the current admin key (x-admin-key) and a new key.
  // The new key replaces the in-memory value immediately.  No secrets touch the DB.
  fastify.post('/internal/admin/rotate-key', async (req, reply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (!adminKey || key !== adminKey) {
      return reply.status(401).send(problem(401, 'unauthorized', 'Unauthorized'));
    }
    const body = req.body as Record<string, unknown> | null;
    const newKey = typeof body?.newKey === 'string' ? body.newKey.trim() : '';
    if (newKey.length < 32) {
      return reply.status(400).send(problem(400, 'invalid_request', 'newKey must be at least 32 characters'));
    }
    adminKey = newKey;
    // Write an audit row so the rotation is traceable (target 'system', no user context here)
    try {
      await db.execute(sql`
        INSERT INTO identity.admin_audit_log (admin_id, action, target_id, target_type, detail, created_at)
        SELECT id, 'rotate_admin_key', 'api', 'system', NULL, now()
        FROM identity.users WHERE roles @> ARRAY['admin']::text[] LIMIT 1
      `);
    } catch {
      // Non-fatal: the rotation still succeeded; log but do not roll back
    }
    return reply.status(200).send({ rotated: true });
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

  // ── Open Graph meta endpoints ─────────────────────────────────────────────
  // These are public (no auth guard) and return HTML with OG meta tags so that
  // messaging apps and social platforms can generate rich link previews.
  // Content-Security-Policy is overridden per-response to allow HTML rendering.

  const ogHtml = (title: string, description: string, imageUrl: string, url: string) => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="خرائط العراق الذكية">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
</head>
<body>
<p>جارٍ التوجيه…</p>
</body>
</html>`;

  const OG_IMAGE_BASE = process.env['OG_IMAGE_BASE_URL'] ?? 'https://iraqsmartmaps.app/og-images';
  const APP_BASE = process.env['APP_BASE_URL'] ?? 'https://iraqsmartmaps.app';

  const sendOgHtml = (reply: FastifyReply, html: string) =>
    reply
      .status(200)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'public, max-age=60, stale-while-revalidate=300')
      // Override the strict JSON-API CSP for these HTML pages.
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
      .send(html);

  // GET /og/place/:id
  fastify.get('/og/place/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isValidOgId(id)) {
      return reply.status(400).send(problem(400, 'invalid_request', 'Invalid id'));
    }
    let title = 'مكان على خرائط العراق';
    let description = 'اكتشف هذا المكان على خرائط العراق الذكية';
    try {
      const row = await db.execute(
        sql`SELECT name_ar, name_en, category FROM places.place WHERE id = ${id} LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const r = row.rows[0] as { name_ar?: string; name_en?: string; category?: string };
        title = r.name_ar ?? r.name_en ?? title;
        if (r.category) description = `${r.category} · ${description}`;
      }
    } catch { /* non-fatal — return generic OG */ }
    const imageUrl = `${OG_IMAGE_BASE}/place/${encodeURIComponent(id)}.jpg`;
    const url = `${APP_BASE}/place/${encodeURIComponent(id)}`;
    return sendOgHtml(reply, ogHtml(title, description, imageUrl, url));
  });

  // GET /og/post/:id
  fastify.get('/og/post/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isValidOgId(id)) {
      return reply.status(400).send(problem(400, 'invalid_request', 'Invalid id'));
    }
    const title = 'منشور على خرائط العراق';
    let description = 'اطّلع على هذا المنشور في تطبيق خرائط العراق الذكية';
    try {
      const row = await db.execute(
        sql`SELECT body, author_id FROM discover.post WHERE id = ${id} LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const r = row.rows[0] as { body?: string; author_id?: string };
        const body = r.body ?? '';
        description = body.length > 120 ? body.slice(0, 117) + '…' : body;
      }
    } catch { /* non-fatal */ }
    const imageUrl = `${OG_IMAGE_BASE}/post/${encodeURIComponent(id)}.jpg`;
    const url = `${APP_BASE}/post/${encodeURIComponent(id)}`;
    return sendOgHtml(reply, ogHtml(title, description, imageUrl, url));
  });

  // GET /og/user/:id
  fastify.get('/og/user/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isValidOgId(id)) {
      return reply.status(400).send(problem(400, 'invalid_request', 'Invalid id'));
    }
    let title = 'مستخدم على خرائط العراق';
    let description = 'اطّلع على ملف هذا المستخدم في تطبيق خرائط العراق الذكية';
    try {
      const row = await db.execute(
        sql`SELECT name FROM identity.users WHERE id = ${id} LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const r = row.rows[0] as { name?: string };
        if (r.name) {
          title = r.name;
          description = `الملف الشخصي لـ ${r.name} على خرائط العراق`;
        }
      }
    } catch { /* non-fatal */ }
    const imageUrl = `${OG_IMAGE_BASE}/user/${encodeURIComponent(id)}.jpg`;
    const url = `${APP_BASE}/user/${encodeURIComponent(id)}`;
    return sendOgHtml(reply, ogHtml(title, description, imageUrl, url));
  });

  // GET /og/event/:id
  fastify.get('/og/event/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isValidOgId(id)) {
      return reply.status(400).send(problem(400, 'invalid_request', 'Invalid id'));
    }
    let title = 'فعالية على خرائط العراق';
    let description = 'اطّلع على تفاصيل هذه الفعالية في تطبيق خرائط العراق الذكية';
    try {
      const row = await db.execute(
        sql`SELECT title_ar, title_en, starts_at FROM discover.event WHERE id = ${id} LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const r = row.rows[0] as { title_ar?: string; title_en?: string; starts_at?: Date };
        title = r.title_ar ?? r.title_en ?? title;
        if (r.starts_at) {
          const dateStr = new Date(r.starts_at).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });
          description = `${title} · ${dateStr}`;
        }
      }
    } catch { /* non-fatal */ }
    const imageUrl = `${OG_IMAGE_BASE}/event/${encodeURIComponent(id)}.jpg`;
    const url = `${APP_BASE}/event/${encodeURIComponent(id)}`;
    return sendOgHtml(reply, ogHtml(title, description, imageUrl, url));
  });

  await app.init();
  await fastify.ready();
  return app;
}

// ── OG helpers ────────────────────────────────────────────────────────────────

/** Escape HTML special chars for safe embedding in attribute values and text nodes. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Allow only safe ID chars (UUID / alphanumeric slug). Max 128 chars. */
function isValidOgId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}
