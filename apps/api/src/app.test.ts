import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from './app';

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp();
});
afterAll(() => app.close());

it('GET /health returns ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ status: 'ok' });
});
