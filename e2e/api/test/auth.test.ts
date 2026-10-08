import { createApp } from '@iraq-maps/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('auth e2e', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('boots the composed app', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it.todo('otp request/verify -> tokens -> GET/PATCH /v1/me -> refresh rotation + reuse detection -> DELETE /v1/me');
});
