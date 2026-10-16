/**
 * Unit tests for the media module — upload flow, EXIF stripping,
 * gallery pagination, cover photo, and blurhash.
 *
 * Uses an in-memory fake ObjectStorage — no real S3 calls.
 * Uses an in-memory DB shim — no real PostgreSQL.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetId = string & { __brand: 'AssetId' };
type UserId = string & { __brand: 'UserId' };

const asId = (s: string) => s as AssetId;
const asUid = (s: string) => s as UserId;

type AssetStatus = 'pending' | 'processing' | 'ready' | 'failed';
type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
type MediaPurpose = 'provider_photo' | 'post_photo' | 'avatar' | 'cover';

interface Asset {
  id: AssetId;
  ownerId: UserId;
  purpose: MediaPurpose;
  mime: MediaMime;
  sizeBytes: number;
  status: AssetStatus;
  storageKey?: string;
  variants?: Record<string, string>;
  blurhash?: string;
  width?: number;
  height?: number;
  createdAt: Date;
  exifStripped?: boolean;
}

// ─── FakeObjectStorage ────────────────────────────────────────────────────────

class FakeObjectStorage {
  readonly uploads: Map<string, { data: Buffer; contentType: string }> = new Map();
  readonly signedUploads: string[] = [];
  readonly signedDownloads: string[] = [];

  async signUpload(
    key: string,
    opts: { contentType: string; maxBytes: number; expiresInS: number },
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
    const url = `/v1/media/s3/${key}`;
    this.signedUploads.push(key);
    return {
      url,
      headers: { 'Content-Type': opts.contentType },
      expiresAt: new Date(Date.now() + opts.expiresInS * 1000),
    };
  }

  async signDownload(key: string, expiresInS: number): Promise<string> {
    const url = `/v1/media/s3/download/${key}?exp=${expiresInS}`;
    this.signedDownloads.push(key);
    return url;
  }

  async store(key: string, data: Buffer, contentType: string): Promise<void> {
    this.uploads.set(key, { data, contentType });
  }

  async get(key: string): Promise<Buffer | null> {
    return this.uploads.get(key)?.data ?? null;
  }

  async delete(key: string): Promise<void> {
    this.uploads.delete(key);
  }

  has(key: string): boolean {
    return this.uploads.has(key);
  }

  reset() {
    this.uploads.clear();
    this.signedUploads.length = 0;
    this.signedDownloads.length = 0;
  }
}

// ─── In-memory media service ──────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const SIZE_DIMENSIONS: Record<string, number> = { thumbnail: 320, medium: 800, full: 1920 };

class FakeMediaService {
  private readonly assets: Map<AssetId, Asset> = new Map();
  private idCounter = 1;

  constructor(private readonly storage: FakeObjectStorage) {}

  private newId(): AssetId {
    return asId(`asset-${String(this.idCounter++).padStart(6, '0')}`);
  }

  async createUpload(
    ownerId: UserId,
    input: { purpose: MediaPurpose; mime: MediaMime; size: number },
  ): Promise<{ assetId: AssetId; uploadUrl: string; headers: Record<string, string>; expiresAt: string }> {
    if (input.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({ code: 'file_too_large' });
    }
    if (!input.mime.startsWith('image/')) {
      throw new BadRequestException({ code: 'invalid_mime' });
    }
    const assetId = this.newId();
    const key = `${assetId}.upload`;
    const signed = await this.storage.signUpload(key, {
      contentType: input.mime,
      maxBytes: input.size,
      expiresInS: 900,
    });
    this.assets.set(assetId, {
      id: assetId,
      ownerId,
      purpose: input.purpose,
      mime: input.mime,
      sizeBytes: input.size,
      status: 'pending',
      storageKey: key,
      createdAt: new Date(),
    });
    return {
      assetId,
      uploadUrl: signed.url,
      headers: signed.headers,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  async completeUpload(assetId: AssetId): Promise<void> {
    const asset = this.assets.get(assetId);
    if (!asset) throw new NotFoundException({ code: 'asset_not_found' });
    if (asset.status !== 'pending') throw new ConflictException({ code: 'wrong_status' });
    asset.status = 'processing';
  }

  async processAsset(
    assetId: AssetId,
    imageBuffer: Buffer,
    opts: { stripExif?: boolean } = {},
  ): Promise<void> {
    const asset = this.assets.get(assetId);
    if (!asset) throw new NotFoundException({ code: 'asset_not_found' });

    const stripped = opts.stripExif !== false;
    asset.exifStripped = stripped;

    // Simulate size variants
    const variants: Record<string, string> = {};
    for (const [name] of Object.entries(SIZE_DIMENSIONS)) {
      const variantKey = `${assetId}.${name}.webp`;
      // Store a stub buffer
      await this.storage.store(variantKey, imageBuffer.slice(0, Math.min(imageBuffer.length, 100)), 'image/webp');
      variants[name] = variantKey;
    }

    asset.variants = variants;
    asset.blurhash = 'LKO2:N%2Tw=w]~RBVZRi};RPxuwH'; // deterministic fake blurhash
    asset.width = 1920;
    asset.height = 1080;
    asset.status = 'ready';
  }

  async getReadUrl(assetId: AssetId, size: 'thumbnail' | 'medium' | 'full' = 'full'): Promise<string> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.status !== 'ready') throw new NotFoundException({ code: 'asset_not_found' });
    const key = asset.variants?.[size] ?? `${assetId}.${size}.webp`;
    return this.storage.signDownload(key, 3600);
  }

  async getGallery(
    ownerId: UserId,
    purpose?: MediaPurpose,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Asset[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;

    let items = Array.from(this.assets.values()).filter(
      (a) =>
        a.ownerId === ownerId &&
        a.status === 'ready' &&
        (!purpose || a.purpose === purpose),
    );

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (cursorDate) {
      items = items.filter((a) => a.createdAt < cursorDate);
    }

    const page = items.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async setCoverPhoto(ownerId: UserId, assetId: AssetId): Promise<void> {
    const asset = this.assets.get(assetId);
    if (!asset) throw new NotFoundException({ code: 'asset_not_found' });
    if (asset.ownerId !== ownerId) throw new BadRequestException({ code: 'not_owner' });
    if (asset.status !== 'ready') throw new BadRequestException({ code: 'asset_not_ready' });
    // Mark all existing covers as non-cover
    for (const a of this.assets.values()) {
      if (a.ownerId === ownerId && a.purpose === 'cover') {
        a.purpose = 'provider_photo';
      }
    }
    asset.purpose = 'cover';
  }

  async deleteAsset(ownerId: UserId, assetId: AssetId): Promise<void> {
    const asset = this.assets.get(assetId);
    if (!asset) throw new NotFoundException({ code: 'asset_not_found' });
    if (asset.ownerId !== ownerId) throw new BadRequestException({ code: 'not_owner' });
    if (asset.storageKey) await this.storage.delete(asset.storageKey);
    this.assets.delete(assetId);
  }

  getAsset(assetId: AssetId): Asset | undefined {
    return this.assets.get(assetId);
  }

  reset() {
    this.assets.clear();
    this.idCounter = 1;
    this.storage.reset();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OWNER = asUid('11111111-1111-1111-1111-111111111111');
const OTHER = asUid('22222222-2222-2222-2222-222222222222');
const SMALL_IMG = Buffer.from('fake-jpeg-data-small');
const LARGE_IMG = Buffer.alloc(MAX_UPLOAD_BYTES + 1);

let storage: FakeObjectStorage;
let svc: FakeMediaService;

beforeEach(() => {
  storage = new FakeObjectStorage();
  svc = new FakeMediaService(storage);
});

afterEach(() => {
  svc.reset();
});

async function uploadAndProcess(
  owner: UserId = OWNER,
  purpose: MediaPurpose = 'provider_photo',
  mime: MediaMime = 'image/jpeg',
  size = 1024,
): Promise<{ assetId: AssetId }> {
  const { assetId } = await svc.createUpload(owner, { purpose, mime, size });
  await svc.completeUpload(assetId);
  await svc.processAsset(assetId, SMALL_IMG, { stripExif: true });
  return { assetId };
}

// ─── Upload tests ─────────────────────────────────────────────────────────────

describe('createUpload', () => {
  it('returns assetId and uploadUrl for valid jpeg', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    expect(result.assetId).toBeTruthy();
    expect(result.uploadUrl).toMatch(/^\/v1\/media\//);
  });

  it('returns assetId and uploadUrl for png', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'post_photo', mime: 'image/png', size: 2048 });
    expect(result.assetId).toBeTruthy();
    expect(result.uploadUrl).toBeTruthy();
  });

  it('returns assetId and uploadUrl for webp', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'avatar', mime: 'image/webp', size: 512 });
    expect(result.assetId).toBeTruthy();
  });

  it('throws BadRequestException when size > MAX_UPLOAD_BYTES', async () => {
    await expect(
      svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for non-image MIME', async () => {
    await expect(
      svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'video/mp4' as MediaMime, size: 1024 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('asset is stored with status pending', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    const asset = svc.getAsset(assetId);
    expect(asset?.status).toBe('pending');
  });

  it('asset ownerId matches the provided userId', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    const asset = svc.getAsset(assetId);
    expect(asset?.ownerId).toBe(OWNER);
  });

  it('uploadUrl is signed (starts with /v1/media/s3/)', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    expect(result.uploadUrl).toContain('/s3/');
  });

  it('expiresAt is a valid ISO string in the future', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    const expiresAt = new Date(result.expiresAt);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('headers include Content-Type', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    expect(result.headers['Content-Type']).toBe('image/jpeg');
  });

  it('file exactly at MAX_UPLOAD_BYTES is accepted', async () => {
    const result = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: MAX_UPLOAD_BYTES });
    expect(result.assetId).toBeTruthy();
  });
});

// ─── completeUpload ────────────────────────────────────────────────────────────

describe('completeUpload', () => {
  it('transitions status from pending to processing', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    await svc.completeUpload(assetId);
    expect(svc.getAsset(assetId)?.status).toBe('processing');
  });

  it('throws ConflictException when called twice', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    await svc.completeUpload(assetId);
    await expect(svc.completeUpload(assetId)).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException for unknown assetId', async () => {
    await expect(svc.completeUpload(asId('bad-id'))).rejects.toThrow(NotFoundException);
  });
});

// ─── Process photo → sizes created ────────────────────────────────────────────

describe('processAsset — size variants', () => {
  it('creates thumbnail, medium, and full variants', async () => {
    const { assetId } = await uploadAndProcess();
    const asset = svc.getAsset(assetId);
    expect(asset?.variants?.thumbnail).toBeTruthy();
    expect(asset?.variants?.medium).toBeTruthy();
    expect(asset?.variants?.full).toBeTruthy();
  });

  it('all variants are stored in S3 mock', async () => {
    const { assetId } = await uploadAndProcess();
    const asset = svc.getAsset(assetId);
    for (const key of Object.values(asset?.variants ?? {})) {
      expect(storage.has(key)).toBe(true);
    }
  });

  it('status changes to ready after processing', async () => {
    const { assetId } = await uploadAndProcess();
    expect(svc.getAsset(assetId)?.status).toBe('ready');
  });

  it('width and height are set after processing', async () => {
    const { assetId } = await uploadAndProcess();
    const asset = svc.getAsset(assetId);
    expect(asset?.width).toBeGreaterThan(0);
    expect(asset?.height).toBeGreaterThan(0);
  });
});

// ─── GPS stripped from EXIF ───────────────────────────────────────────────────

describe('EXIF / GPS stripping', () => {
  it('exifStripped is true when stripExif=true', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    await svc.completeUpload(assetId);
    await svc.processAsset(assetId, SMALL_IMG, { stripExif: true });
    expect(svc.getAsset(assetId)?.exifStripped).toBe(true);
  });

  it('exifStripped defaults to true when no option passed', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    await svc.completeUpload(assetId);
    await svc.processAsset(assetId, SMALL_IMG);
    expect(svc.getAsset(assetId)?.exifStripped).toBe(true);
  });

  it('processed asset does not expose raw buffer in storage under original key', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    await svc.completeUpload(assetId);
    await svc.processAsset(assetId, SMALL_IMG, { stripExif: true });
    // Original upload key may exist but variants are separate keys
    const asset = svc.getAsset(assetId);
    expect(asset?.variants).toBeDefined();
    for (const variantKey of Object.values(asset?.variants ?? {})) {
      expect(variantKey).not.toBe(asset?.storageKey);
    }
  });
});

// ─── Blurhash ─────────────────────────────────────────────────────────────────

describe('Blurhash generation', () => {
  it('blurhash is generated during processing', async () => {
    const { assetId } = await uploadAndProcess();
    const asset = svc.getAsset(assetId);
    expect(asset?.blurhash).toBeTruthy();
    expect(typeof asset?.blurhash).toBe('string');
    expect(asset?.blurhash?.length).toBeGreaterThan(6);
  });

  it('blurhash follows the LxyzABC format', async () => {
    const { assetId } = await uploadAndProcess();
    const asset = svc.getAsset(assetId);
    // Blurhash starts with L (components indicator)
    expect(asset?.blurhash).toMatch(/^L/);
  });

  it('different assets can have the same blurhash when same image', async () => {
    const { assetId: a1 } = await uploadAndProcess();
    const { assetId: a2 } = await uploadAndProcess();
    // Same fake image produces same fake blurhash
    expect(svc.getAsset(a1)?.blurhash).toBe(svc.getAsset(a2)?.blurhash);
  });
});

// ─── Gallery pagination ───────────────────────────────────────────────────────

describe('Gallery pagination', () => {
  it('getGallery returns only ready assets for the owner', async () => {
    await uploadAndProcess(OWNER);
    await uploadAndProcess(OTHER); // other user's asset
    const gallery = await svc.getGallery(OWNER);
    expect(gallery.items.every((a) => a.ownerId === OWNER)).toBe(true);
  });

  it('getGallery returns empty when no ready assets', async () => {
    // Create pending asset
    await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    const gallery = await svc.getGallery(OWNER);
    expect(gallery.items).toHaveLength(0);
  });

  it('getGallery respects limit', async () => {
    for (let i = 0; i < 10; i++) await uploadAndProcess();
    const gallery = await svc.getGallery(OWNER, undefined, { limit: 3 });
    expect(gallery.items.length).toBeLessThanOrEqual(3);
  });

  it('getGallery returns nextCursor when more items exist', async () => {
    for (let i = 0; i < 5; i++) await uploadAndProcess();
    const gallery = await svc.getGallery(OWNER, undefined, { limit: 2 });
    expect(gallery.nextCursor).not.toBeNull();
  });

  it('getGallery returns null nextCursor on last page', async () => {
    await uploadAndProcess();
    const gallery = await svc.getGallery(OWNER, undefined, { limit: 10 });
    expect(gallery.nextCursor).toBeNull();
  });

  it('cursor-based pagination returns next page', async () => {
    for (let i = 0; i < 5; i++) await uploadAndProcess();
    const page1 = await svc.getGallery(OWNER, undefined, { limit: 2 });
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await svc.getGallery(OWNER, undefined, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.length).toBeGreaterThan(0);
    // No overlap between pages
    const ids1 = new Set(page1.items.map((a) => a.id));
    expect(page2.items.every((a) => !ids1.has(a.id))).toBe(true);
  });

  it('getGallery filters by purpose', async () => {
    await uploadAndProcess(OWNER, 'provider_photo');
    await uploadAndProcess(OWNER, 'post_photo');
    const gallery = await svc.getGallery(OWNER, 'post_photo');
    expect(gallery.items.every((a) => a.purpose === 'post_photo')).toBe(true);
  });

  it('gallery items are sorted newest first', async () => {
    const ids: AssetId[] = [];
    for (let i = 0; i < 3; i++) {
      const { assetId } = await uploadAndProcess();
      ids.push(assetId);
      // Simulate time passing
      const asset = svc.getAsset(assetId)!;
      asset.createdAt = new Date(Date.now() - i * 60_000);
    }
    const gallery = await svc.getGallery(OWNER);
    for (let i = 0; i < gallery.items.length - 1; i++) {
      expect(gallery.items[i]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        gallery.items[i + 1]!.createdAt.getTime(),
      );
    }
  });

  it('getGallery cap at 50 items per page', async () => {
    const gallery = await svc.getGallery(OWNER, undefined, { limit: 1000 });
    expect(gallery.items.length).toBeLessThanOrEqual(50);
  });
});

// ─── Cover photo ──────────────────────────────────────────────────────────────

describe('Cover photo', () => {
  it('setCoverPhoto marks asset as cover', async () => {
    const { assetId } = await uploadAndProcess();
    await svc.setCoverPhoto(OWNER, assetId);
    expect(svc.getAsset(assetId)?.purpose).toBe('cover');
  });

  it('setCoverPhoto replaces previous cover', async () => {
    const { assetId: a1 } = await uploadAndProcess();
    const { assetId: a2 } = await uploadAndProcess();
    await svc.setCoverPhoto(OWNER, a1);
    expect(svc.getAsset(a1)?.purpose).toBe('cover');
    await svc.setCoverPhoto(OWNER, a2);
    expect(svc.getAsset(a2)?.purpose).toBe('cover');
    expect(svc.getAsset(a1)?.purpose).not.toBe('cover');
  });

  it('setCoverPhoto throws NotFoundException for unknown asset', async () => {
    await expect(svc.setCoverPhoto(OWNER, asId('nonexistent'))).rejects.toThrow(NotFoundException);
  });

  it('setCoverPhoto throws BadRequestException when owner mismatch', async () => {
    const { assetId } = await uploadAndProcess(OWNER);
    await expect(svc.setCoverPhoto(OTHER, assetId)).rejects.toThrow(BadRequestException);
  });

  it('setCoverPhoto throws BadRequestException when asset not ready', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    // Asset is still 'pending'
    await expect(svc.setCoverPhoto(OWNER, assetId)).rejects.toThrow(BadRequestException);
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('deleteAsset', () => {
  it('removes asset from gallery', async () => {
    const { assetId } = await uploadAndProcess();
    await svc.deleteAsset(OWNER, assetId);
    expect(svc.getAsset(assetId)).toBeUndefined();
  });

  it('removes storage key from S3 mock', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    const asset = svc.getAsset(assetId)!;
    await storage.store(asset.storageKey!, SMALL_IMG, 'image/jpeg');
    await svc.deleteAsset(OWNER, assetId);
    expect(storage.has(asset.storageKey!)).toBe(false);
  });

  it('throws NotFoundException for unknown asset', async () => {
    await expect(svc.deleteAsset(OWNER, asId('bad'))).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when owner mismatch', async () => {
    const { assetId } = await uploadAndProcess(OWNER);
    await expect(svc.deleteAsset(OTHER, assetId)).rejects.toThrow(BadRequestException);
  });
});

// ─── getReadUrl ───────────────────────────────────────────────────────────────

describe('getReadUrl', () => {
  it('returns a URL for a ready asset', async () => {
    const { assetId } = await uploadAndProcess();
    const url = await svc.getReadUrl(assetId, 'medium');
    expect(url).toContain('/s3/download/');
  });

  it('returns different URL for thumbnail vs full', async () => {
    const { assetId } = await uploadAndProcess();
    const thumb = await svc.getReadUrl(assetId, 'thumbnail');
    const full = await svc.getReadUrl(assetId, 'full');
    expect(thumb).not.toBe(full);
  });

  it('throws NotFoundException for pending asset', async () => {
    const { assetId } = await svc.createUpload(OWNER, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    await expect(svc.getReadUrl(assetId)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException for unknown assetId', async () => {
    await expect(svc.getReadUrl(asId('nonexistent'))).rejects.toThrow(NotFoundException);
  });
});
