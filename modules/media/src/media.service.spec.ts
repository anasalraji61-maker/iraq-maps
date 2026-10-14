import { BadRequestException, ConflictException } from '@nestjs/common';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import type { UserId } from '@iraq-maps/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mediaMigrationsDir, MediaService, FileObjectStorage } from './index.js';
import { assetTable } from './schema.js';
import { eq } from 'drizzle-orm';

let tdb: TestDatabase;
let svc: MediaService;
let storage: FileObjectStorage;

const ownerId = '11111111-1111-1111-1111-111111111111' as UserId;

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: [{ schema: 'media', migrationsDir: mediaMigrationsDir }] });
  storage = new FileObjectStorage({ secret: 'test-secret' });
  svc = new MediaService(tdb.db, storage);
});

afterAll(async () => {
  await tdb?.drop();
});

describe('createUpload', () => {
  it('throws BadRequestException when size > MAX_UPLOAD_BYTES (10 MB)', async () => {
    await expect(
      svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a pending asset and returns an uploadUrl', async () => {
    const result = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 1024 });
    expect(result.assetId).toBeTruthy();
    expect(result.uploadUrl).toMatch(/^\/v1\/media\/fs\//);

    const [row] = await tdb.db.select().from(assetTable).where(eq(assetTable.id, result.assetId));
    expect(row?.status).toBe('pending');
    expect(row?.ownerId).toBe(ownerId);
  });
});

describe('completeUpload', () => {
  it('transitions status from pending to processing', async () => {
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 512 });

    await svc.completeUpload(assetId);

    const [row] = await tdb.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    expect(row?.status).toBe('processing');
  });

  it('throws ConflictException when called again on a processing asset', async () => {
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 512 });
    await svc.completeUpload(assetId);
    await expect(svc.completeUpload(assetId)).rejects.toThrow(ConflictException);
  });
});

describe('processAsset (EXIF stripping)', () => {
  it('strips EXIF/GPS metadata from the output', async () => {
    // Build a JPEG with GPS EXIF embedded using sharp.
    // sharp.Exif type does not expose GPSInfo; embed via IFD0 text and check exif absence after stripping.
    const jpegWithExif = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .withExifMerge({
        IFD0: {
          Copyright: 'Test © 2024',
          Make: 'TestCamera',
          ImageDescription: 'GPS:33.333N,44.383E',
        },
      })
      .jpeg()
      .toBuffer();

    // Confirm EXIF is present before processing
    const metaBefore = await sharp(jpegWithExif).metadata();
    expect(metaBefore.exif).toBeDefined();

    // Create an asset and put the JPEG into storage
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: jpegWithExif.length });
    await svc.completeUpload(assetId);

    // Write the raw JPEG to storage under the upload key
    const uploadKey = `${assetId}.upload`;
    await storage.put(uploadKey, new Uint8Array(jpegWithExif), 'image/jpeg');

    await svc.processAsset(assetId);

    // Read back the processed webp
    const processedKey = `${assetId}.webp`;
    const processedBytes = await storage.get(processedKey);
    expect(processedBytes).not.toBeNull();

    // Verify metadata is stripped
    const metaAfter = await sharp(Buffer.from(processedBytes!)).metadata();
    expect(metaAfter.exif).toBeUndefined();
    expect(metaAfter.format).toBe('webp');
  });
});

describe('cleanupOrphaned', () => {
  it('deletes pending assets older than the grace period', async () => {
    // Create a pending asset and backdate its created_at to exceed the grace period
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 256 });
    const pastCutoff = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    await tdb.db.update(assetTable).set({ createdAt: pastCutoff }).where(eq(assetTable.id, assetId));

    const { deleted } = await svc.cleanupOrphaned();
    expect(deleted).toBeGreaterThanOrEqual(1);

    const [row] = await tdb.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    expect(row).toBeUndefined();
  });

  it('does NOT delete ready assets even if they are old', async () => {
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 256 });
    await svc.completeUpload(assetId);
    // processAsset needs real storage data; instead force status to 'ready' directly
    await tdb.db.update(assetTable).set({ status: 'ready', storageKey: `${assetId}.webp` }).where(eq(assetTable.id, assetId));
    const pastCutoff = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await tdb.db.update(assetTable).set({ createdAt: pastCutoff }).where(eq(assetTable.id, assetId));

    await svc.cleanupOrphaned();

    const [row] = await tdb.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    expect(row).toBeDefined();
    expect(row?.status).toBe('ready');
  });
});

describe('getReadUrl', () => {
  it('returns null when asset is not ready', async () => {
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 512 });
    const url = await svc.readUrl(assetId);
    expect(url).toBeNull();
  });

  it('returns a signed URL when asset is ready', async () => {
    const { assetId } = await svc.createUpload(ownerId, { purpose: 'provider_photo', mime: 'image/jpeg', size: 512 });
    await svc.completeUpload(assetId);

    // Build minimal JPEG and process it
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();
    const uploadKey = `${assetId}.upload`;
    await storage.put(uploadKey, new Uint8Array(jpg), 'image/jpeg');
    await svc.processAsset(assetId);

    const url = await svc.readUrl(assetId);
    expect(url).toMatch(/^\/v1\/media\/fs\//);
  });
});
