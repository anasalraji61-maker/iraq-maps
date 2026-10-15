/**
 * Unit tests for IncidentsService – uses an in-memory mock of the Db execute method.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Db } from '@iraq-maps/db-kit';
import { IncidentsService } from './incidents.service';

function makeDb(rows: unknown[]): Db {
  return {
    execute: vi.fn(async () => rows),
  } as unknown as Db;
}

describe('IncidentsService.create', () => {
  it('returns an incident with correct fields', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const expires = new Date('2026-01-01T14:00:00Z');
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'accident',
      description: 'سيارة مقلوبة',
      reported_by: null,
      created_at: now,
      expires_at: expires,
      lng: 44.4,
      lat: 33.3,
    };
    const db = makeDb([row]);
    const svc = new IncidentsService(db);

    const result = await svc.create({
      type: 'accident',
      lng: 44.4,
      lat: 33.3,
      description: 'سيارة مقلوبة',
      ttlHours: 2,
    });

    expect(result.id).toBe(row.id);
    expect(result.type).toBe('accident');
    expect(result.location).toEqual([44.4, 33.3]);
    expect(result.description).toBe('سيارة مقلوبة');
    expect(result.reportedBy).toBeNull();
    expect(result.active).toBe(false); // expires is in the past in this test
  });

  it('throws when db returns no rows', async () => {
    const db = makeDb([]);
    const svc = new IncidentsService(db);
    await expect(
      svc.create({ type: 'flood', lng: 44.0, lat: 33.0, ttlHours: 1 }),
    ).rejects.toThrow('incident insert returned no rows');
  });
});

describe('IncidentsService.listNear', () => {
  it('returns mapped incidents', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 3_600_000);
    const rows = [
      {
        id: '22222222-2222-2222-2222-222222222222',
        type: 'roadblock',
        description: null,
        reported_by: '33333333-3333-3333-3333-333333333333',
        created_at: now,
        expires_at: future,
        lng: 44.3,
        lat: 33.2,
      },
    ];
    const db = makeDb(rows);
    const svc = new IncidentsService(db);

    const result = await svc.listNear({ lat: 33.2, lng: 44.3, radiusKm: 5 });
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('roadblock');
    expect(result[0]!.active).toBe(true);
    expect(result[0]!.location).toEqual([44.3, 33.2]);
  });

  it('returns empty array when no incidents nearby', async () => {
    const db = makeDb([]);
    const svc = new IncidentsService(db);
    const result = await svc.listNear({ lat: 33.0, lng: 44.0, radiusKm: 1 });
    expect(result).toEqual([]);
  });
});
