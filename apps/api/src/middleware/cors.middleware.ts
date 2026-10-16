/**
 * CORS configuration for the Iraq Maps API.
 *
 * The API is consumed by:
 *  - the Expo mobile app (no browser CORS, native HTTP)
 *  - the React admin panel (same origin in production, localhost in dev)
 *  - e2e / integration tests (localhost)
 *
 * Production allows only exact, listed origins. Development and test allow localhost.
 */

import type { FastifyInstance } from 'fastify';

// ── Types ──────────────────────────────────────────────────────────────────

export type AppEnv = 'development' | 'test' | 'e2e' | 'production';

export interface CorsConfig {
  /** Allowed origins. Use `*` only in development. */
  origins: readonly string[] | '*';
  /** HTTP methods to allow. */
  methods: readonly string[];
  /** Request headers the client may send. */
  allowedHeaders: readonly string[];
  /** Response headers the browser may expose to JS. */
  exposedHeaders: readonly string[];
  /** Whether to pass credentials (cookies, auth headers). */
  credentials: boolean;
  /** Pre-flight cache in seconds. */
  maxAge: number;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const COMMON_ALLOWED_HEADERS = [
  'content-type',
  'authorization',
  'x-request-id',
  'x-request-signature',
  'x-request-timestamp',
  'x-admin-key',
  'accept',
  'accept-language',
];

const COMMON_EXPOSED_HEADERS = [
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'retry-after',
  'x-cache',
];

export function buildCorsConfig(appEnv: AppEnv, adminOrigin?: string): CorsConfig {
  switch (appEnv) {
    case 'development':
    case 'test':
    case 'e2e':
      return {
        origins: '*',
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: COMMON_ALLOWED_HEADERS,
        exposedHeaders: COMMON_EXPOSED_HEADERS,
        credentials: false, // `*` and credentials cannot be combined in CORS spec
        maxAge: 86400,
      };
    case 'production': {
      const origins: string[] = ['https://iraq-maps.app'];
      if (adminOrigin) origins.push(adminOrigin);
      return {
        origins,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: COMMON_ALLOWED_HEADERS,
        exposedHeaders: COMMON_EXPOSED_HEADERS,
        credentials: true,
        maxAge: 7200,
      };
    }
  }
}

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Registers CORS handling as a Fastify `onRequest` hook.
 * Responds to pre-flight OPTIONS immediately with 204.
 * Sets CORS headers on every other request.
 *
 * We do not use @fastify/cors to avoid the dependency and keep the logic auditable.
 */
export function registerCors(fastify: FastifyInstance, config: CorsConfig): void {
  fastify.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin as string | undefined;
    if (!origin) return; // non-browser requests — no CORS headers needed

    let allowed = false;
    if (config.origins === '*') {
      allowed = true;
      void reply.header('access-control-allow-origin', '*');
    } else {
      if (config.origins.includes(origin)) {
        allowed = true;
        void reply.header('access-control-allow-origin', origin);
        void reply.header('vary', 'Origin');
      }
    }

    if (!allowed) {
      // Unknown origin — send minimal CORS response that browsers will block
      if (req.method === 'OPTIONS') {
        void reply.status(403).send();
        return reply;
      }
      return;
    }

    void reply.header('access-control-allow-methods', config.methods.join(', '));
    void reply.header('access-control-allow-headers', config.allowedHeaders.join(', '));
    void reply.header('access-control-expose-headers', config.exposedHeaders.join(', '));
    void reply.header('access-control-max-age', String(config.maxAge));
    if (config.credentials) {
      void reply.header('access-control-allow-credentials', 'true');
    }

    // Handle pre-flight
    if (req.method === 'OPTIONS') {
      void reply.status(204).send();
      return reply;
    }
  });
}
