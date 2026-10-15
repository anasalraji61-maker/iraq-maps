import { describe, it, expect, vi } from 'vitest';
import { LocationShareService } from './location-share.service';
import type { Db } from '@iraq-maps/db-kit';

function makeDb(rows: unknown[]): Db {
  return { execute: vi.fn().mockResolvedValue({ rows }) } as unknown as Db;
}

describe('LocationShareService', () => {
  describe('create', () => {
    it('returns a LocationShare with null location on creation', async () => {
      const now = new Date();
      const expires = new Date(now.getTime() + 2 * 3_600_000);
      const db = makeDb([{
        share_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        owner_id: null,
        lng: null,
        lat: null,
        expires_at: expires,
        created_at: now,
        updated_at: now,
      }]);
      const svc = new LocationShareService(db);
      const share = await svc.create({ ttlHours: 2 });
      expect(share.shareId).toBe('aaaaaaaa-0000-0000-0000-000000000001');
      expect(share.location).toBeNull();
    });
  });

  describe('get', () => {
    it('returns null when no row found', async () => {
      const db = makeDb([]);
      const svc = new LocationShareService(db);
      const result = await svc.get('aaaaaaaa-0000-0000-0000-000000000001');
      expect(result).toBeNull();
    });

    it('returns expired when expires_at is in the past', async () => {
      const past = new Date(Date.now() - 1000);
      const db = makeDb([{
        share_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        owner_id: null,
        lng: 44.4,
        lat: 33.3,
        expires_at: past,
        created_at: past,
        updated_at: past,
      }]);
      const svc = new LocationShareService(db);
      const result = await svc.get('aaaaaaaa-0000-0000-0000-000000000001');
      expect(result).toBe('expired');
    });

    it('returns LocationShare when valid', async () => {
      const future = new Date(Date.now() + 3_600_000);
      const now = new Date();
      const db = makeDb([{
        share_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        owner_id: null,
        lng: 44.4,
        lat: 33.3,
        expires_at: future,
        created_at: now,
        updated_at: now,
      }]);
      const svc = new LocationShareService(db);
      const result = await svc.get('aaaaaaaa-0000-0000-0000-000000000001');
      expect(result).not.toBeNull();
      expect(result).not.toBe('expired');
      if (result && result !== 'expired') {
        expect(result.location).toEqual([44.4, 33.3]);
      }
    });
  });

  describe('update', () => {
    it('returns forbidden when requester is not owner', async () => {
      const future = new Date(Date.now() + 3_600_000);
      const now = new Date();
      const db = makeDb([{
        share_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        owner_id: 'aaaaaaaa-0000-0000-0000-000000000002',
        lng: null,
        lat: null,
        expires_at: future,
        created_at: now,
        updated_at: now,
      }]);
      const svc = new LocationShareService(db);
      const result = await svc.update({
        shareId: 'aaaaaaaa-0000-0000-0000-000000000001',
        lng: 44.4,
        lat: 33.3,
        requesterId: 'aaaaaaaa-0000-0000-0000-000000000099',
      });
      expect(result).toBe('forbidden');
    });
  });
});
