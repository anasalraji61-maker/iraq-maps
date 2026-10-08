// M3: ObjectStorage and MediaPort fakes and conformance suites.
import { randomUUID } from 'node:crypto';
import { SignedUrlString, StorageKey, type AssetId, type AssetStatus, type MediaAsset, type MediaPort, type ObjectStorage, type UserId } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';

const key = (k: string) => StorageKey.parse(k);

/** In-memory ObjectStorage. Signed URLs use the fake: scheme and are never fetched. */
export class FakeObjectStorage implements ObjectStorage {
  readonly kind = 'fake' as const;
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  private readonly signed = (k: string, op: string, expiresInS: number) => {
    const expiresAt = new Date(Date.now() + expiresInS * 1000);
    return { url: `fake://${op}/${key(k)}?exp=${expiresAt.getTime()}`, expiresAt };
  };
  async signUpload(k: string, opts: { contentType: string; maxBytes: number; expiresInS: number }) {
    return { ...this.signed(k, 'put', opts.expiresInS), headers: { 'content-type': opts.contentType } };
  }
  async signRead(k: string, expiresInS: number) {
    return this.signed(k, 'get', expiresInS);
  }
  async put(k: string, body: Uint8Array, contentType: string) {
    this.objects.set(key(k), { body: new Uint8Array(body), contentType });
  }
  async get(k: string) {
    return this.objects.get(key(k))?.body ?? null;
  }
  async delete(k: string) {
    this.objects.delete(key(k));
  }
}

export function objectStorageConformance(name: string, make: () => ObjectStorage | Promise<ObjectStorage>): void {
  describe(`ObjectStorage conformance: ${name}`, () => {
    const k = () => `${randomUUID()}.jpg`;

    it('stores, reads back and deletes an object; delete is idempotent and a missing key reads null', async () => {
      const storage = await make();
      const id = k();
      const body = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3);
      await storage.put(id, body, 'image/jpeg');
      expect(await storage.get(id)).toEqual(body);
      await storage.delete(id);
      await storage.delete(id);
      expect(await storage.get(id)).toBeNull();
    });

    it('signs uploads and reads that expire', async () => {
      const storage = await make();
      const before = Date.now();
      const upload = await storage.signUpload(k(), { contentType: 'image/jpeg', maxBytes: 1024, expiresInS: 300 });
      const read = await storage.signRead(k(), 60);
      for (const [signed, ttl] of [[upload, 300], [read, 60]] as const) {
        expect(signed.url).toMatch(/^([a-z][a-z0-9+.-]*:\/\/|\/v1\/)\S+$/);
        expect(signed.expiresAt.getTime()).toBeGreaterThan(before);
        expect(signed.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttl * 1000 + 1000);
      }
      expect(typeof upload.headers).toBe('object');
    });

    it('refuses keys that are not flat StorageKeys', async () => {
      const storage = await make();
      for (const bad of ['../x.jpg', '/etc/passwd', 'a/b.jpg']) {
        await expect(storage.put(bad, Uint8Array.of(1), 'image/jpeg')).rejects.toThrow();
        await expect(storage.get(bad)).rejects.toThrow();
      }
    });
  });
}

/** In-memory MediaPort; seed() adds an asset in any status. */
export class FakeMediaPort implements MediaPort {
  readonly assets = new Map<AssetId, MediaAsset>();
  seed(asset: { ownerId: UserId; status: AssetStatus }): AssetId {
    const id = randomUUID() as AssetId;
    this.assets.set(id, { id, purpose: 'provider_photo', ...asset });
    return id;
  }
  async getAsset(id: AssetId) {
    return this.assets.get(id) ?? null;
  }
  async readUrl(id: AssetId) {
    return this.assets.get(id)?.status === 'ready' ? `https://media.test/${id}.webp?exp=${Date.now() + 300_000}` : null;
  }
}

export interface MediaHarness {
  port: MediaPort;
  /** Stores an asset owned by ownerId in `status`. */
  seed(asset: { ownerId: UserId; status: AssetStatus }): Promise<AssetId>;
}

export function mediaPortConformance(name: string, make: () => MediaHarness | Promise<MediaHarness>): void {
  describe(`MediaPort conformance: ${name}`, () => {
    it('describes an asset, and signs a read URL only once it is ready', async () => {
      const h = await make();
      const ownerId = randomUUID() as UserId;
      const ready = await h.seed({ ownerId, status: 'ready' });
      const processing = await h.seed({ ownerId, status: 'processing' });
      expect(await h.port.getAsset(ready)).toMatchObject({ id: ready, ownerId, purpose: 'provider_photo', status: 'ready' });
      expect(SignedUrlString.safeParse(await h.port.readUrl(ready)).success).toBe(true);
      expect(await h.port.readUrl(processing)).toBeNull();
    });

    it('answers null for an unknown asset', async () => {
      const h = await make();
      const unknown = randomUUID() as AssetId;
      expect([await h.port.getAsset(unknown), await h.port.readUrl(unknown)]).toEqual([null, null]);
    });
  });
}
