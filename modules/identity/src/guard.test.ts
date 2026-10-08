import { PortTokens, type IdentityPort } from '@iraq-maps/contracts';
import { Controller, Get } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { IdentityAuthGuard } from './index';

const PUBLIC = ['/v1/search', '/v1/places/nearby', '/v1/places/:id', '/v1/cities', '/v1/cities/:id/tiles/:z/:x/:y', '/v1/cities/:id/glyphs/:fontstack/:range'];
// Routes that share a prefix with a public one must stay protected.
const PROTECTED = ['/v1/me', '/v1/searches', '/v1/places/saved', '/v1/places/:id/reviews', '/v1/cities/:id', '/v1/auth', '/healthz'];

/** One handler per route pattern, so the guard sees exactly these patterns in req.routeOptions.url. */
function routes(patterns: string[]) {
  @Controller()
  class Routes {}
  for (const [i, pattern] of patterns.entries()) {
    const name = `r${i}`;
    Object.defineProperty(Routes.prototype, name, { value: () => ({ ok: true }) });
    Get(pattern)(Routes.prototype, name, Object.getOwnPropertyDescriptor(Routes.prototype, name)!);
  }
  return Routes;
}

const identity: IdentityPort = { verifyAccessToken: async () => null, getUser: async () => null };
let app: NestFastifyApplication;

beforeAll(async () => {
  class TestApp {}
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: TestApp,
      controllers: [routes([...PUBLIC, ...PROTECTED])],
      providers: [{ provide: PortTokens.IdentityPort, useValue: identity }, { provide: APP_GUARD, useClass: IdentityAuthGuard }],
    },
    new FastifyAdapter(),
    { logger: false },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(() => app?.close());

const url = (pattern: string) => pattern.replace(/:(\w+)/g, (_, p: string) => (p === 'range' ? '0-255.pbf' : p === 'z' ? '1' : `x${p}`));

it('lets the six places routes through without a token', async () => {
  for (const pattern of PUBLIC) expect([pattern, (await app.inject({ method: 'GET', url: url(pattern) })).statusCode]).toEqual([pattern, 200]);
});

it('still answers 401 on /v1/me and on routes that only look like public ones', async () => {
  for (const pattern of PROTECTED) {
    const res = await app.inject({ method: 'GET', url: url(pattern) });
    expect([pattern, res.statusCode, res.json()]).toMatchObject([pattern, 401, { code: 'unauthorized' }]);
  }
});
