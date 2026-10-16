import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthService, type DbPing, type RedisPing } from './health';

// ── Fakes ──────────────────────────────────────────────────────────────────

function makeDb(fail = false): DbPing {
  return {
    ping: fail
      ? () => Promise.reject(new Error('connection refused'))
      : () => Promise.resolve(),
  };
}

function makeRedis(response: string | null = 'PONG'): RedisPing {
  return {
    ping:
      response === null
        ? () => Promise.reject(new Error('ECONNREFUSED'))
        : () => Promise.resolve(response),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HealthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok when db and redis are healthy', async () => {
    const svc = new HealthService({ db: makeDb(), redis: makeRedis() });
    const result = await svc.getHealth();

    expect(result.status).toBe('ok');
    const names = result.checks.map((c) => c.name);
    expect(names).toContain('postgres');
    expect(names).toContain('redis');
    expect(names).toContain('memory');
    expect(names).toContain('disk');
  });

  it('returns down when db fails (critical check)', async () => {
    const svc = new HealthService({ db: makeDb(true), redis: makeRedis() });
    const result = await svc.getHealth();

    expect(result.status).toBe('down');
    const db = result.checks.find((c) => c.name === 'postgres');
    expect(db?.status).toBe('down');
    expect(db?.critical).toBe(true);
  });

  it('returns degraded when redis fails (non-critical check)', async () => {
    const svc = new HealthService({ db: makeDb(), redis: makeRedis(null) });
    const result = await svc.getHealth();

    expect(result.status).toBe('degraded');
    const redis = result.checks.find((c) => c.name === 'redis');
    expect(redis?.status).toBe('degraded');
    expect(redis?.critical).toBe(false);
  });

  it('returns degraded when redis returns unexpected pong', async () => {
    const svc = new HealthService({ db: makeDb(), redis: makeRedis('NOTPONG') });
    const result = await svc.getHealth();

    expect(result.status).toBe('degraded');
    const redis = result.checks.find((c) => c.name === 'redis');
    expect(redis?.status).toBe('degraded');
  });

  it('returns degraded when memory exceeds threshold', async () => {
    // Force memory check to report degraded by setting a tiny threshold
    const svc = new HealthService({ maxHeapMb: 0.001 });
    const result = await svc.getHealth();

    const mem = result.checks.find((c) => c.name === 'memory');
    expect(mem?.status).toBe('degraded');
    expect(mem?.critical).toBe(false);
    // Overall status: degraded (not down, memory is non-critical)
    expect(result.status).toBe('degraded');
  });

  it('isReady returns false when db is down', async () => {
    const svc = new HealthService({ db: makeDb(true) });
    expect(await svc.isReady()).toBe(false);
  });

  it('isReady returns true when db is healthy', async () => {
    const svc = new HealthService({ db: makeDb() });
    expect(await svc.isReady()).toBe(true);
  });

  it('isAlive returns true normally', () => {
    const svc = new HealthService();
    expect(svc.isAlive()).toBe(true);
  });

  it('includes uptimeSeconds and checkedAt in result', async () => {
    const svc = new HealthService();
    const result = await svc.getHealth();

    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  it('check times out and returns down for the slow check', async () => {
    const slowDb: DbPing = {
      ping: () => new Promise((_r) => setTimeout(_r, 60_000)), // never resolves in test
    };

    const svc = new HealthService({
      db: slowDb,
      checkTimeoutMs: 50, // very short for the test
    });

    const result = await svc.getHealth();
    const db = result.checks.find((c) => c.name === 'postgres');
    expect(db?.status).toBe('down');
  }, 2000);

  it('works with no checks configured', async () => {
    const svc = new HealthService({ maxHeapMb: 99999 }); // force memory ok
    const result = await svc.getHealth();

    expect(['ok', 'degraded']).toContain(result.status);
    // memory and disk checks are always added
    expect(result.checks.length).toBeGreaterThanOrEqual(2);
  });
});
