import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { and, eq, lt, sql as drizzleSql, notInArray } from 'drizzle-orm';
import sharp from 'sharp';
import type { Queue } from 'bullmq';
import {
  type AssetId,
  type MediaMime,
  type MediaPurpose,
  type ObjectStorage,
  type UserId,
  MAX_UPLOAD_BYTES,
  PortTokens,
  type OutboxPublisher,
  type MediaPort,
  type MediaAsset,
} from '@iraq-maps/contracts';
import type { Db, DbTx } from '@iraq-maps/db-kit';
import { createOutboxPublisher } from '@iraq-maps/db-kit';
// OutboxPublisher used for ready event below
import { assetTable } from './schema.js';
import { IMAGE_PROCESSING_QUEUE, type ImageProcessingJob } from './image-processing-worker.js';

export const IMAGE_PROCESSING_QUEUE_TOKEN = 'media:image-processing-queue';

export const DB_TOKEN = 'media:db';
export const OUTBOX_TOKEN = 'media:outbox';

const READ_URL_TTL_S = 3600;
const UPLOAD_URL_TTL_S = 900;
const MAX_DIMENSION = 1920;

/** Pixel widths for named size variants. */
const SIZE_DIMENSIONS: Record<string, number> = { thumbnail: 320, medium: 800, full: MAX_DIMENSION };

/** Allowed MIME type prefix for validation. */
const ALLOWED_MIME_PREFIX = 'image/';

/** Assets not referenced by any post after this many ms are eligible for cleanup. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MediaService implements MediaPort {
  private readonly outbox: OutboxPublisher<DbTx>;

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(PortTokens.ObjectStorage) private readonly storage: ObjectStorage,
    @Optional() @Inject(IMAGE_PROCESSING_QUEUE_TOKEN)
    private readonly imageQueue: Queue<ImageProcessingJob> | null = null,
  ) {
    this.outbox = createOutboxPublisher(db);
  }

  async createUpload(
    ownerId: UserId,
    input: { purpose: MediaPurpose; mime: MediaMime; size: number },
  ): Promise<{ assetId: AssetId; uploadUrl: string; headers: Record<string, string>; expiresAt: string }> {
    if (input.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException({ type: 'about:blank', title: 'File too large', status: 400, code: 'file_too_large' });
    }
    if (!input.mime.startsWith(ALLOWED_MIME_PREFIX)) {
      throw new BadRequestException({ type: 'about:blank', title: 'Only image/* MIME types are accepted', status: 400, code: 'invalid_mime' });
    }

    const [row] = await this.db
      .insert(assetTable)
      .values({ ownerId, purpose: input.purpose, mime: input.mime, sizeBytes: input.size, status: 'pending' })
      .returning({ id: assetTable.id });

    if (!row) throw new Error('insert returned no row');

    const assetId = row.id as AssetId;
    const key = `${assetId}.upload`;
    const signed = await this.storage.signUpload(key, {
      contentType: input.mime,
      maxBytes: input.size,
      expiresInS: UPLOAD_URL_TTL_S,
    });

    await this.db.update(assetTable).set({ storageKey: key }).where(eq(assetTable.id, assetId));

    return {
      assetId,
      uploadUrl: signed.url,
      headers: signed.headers,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  async completeUpload(assetId: AssetId): Promise<void> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    if (!row) throw new NotFoundException({ type: 'about:blank', title: 'Asset not found', status: 404, code: 'asset_not_found' });
    if (row.status !== 'pending') {
      throw new ConflictException({ type: 'about:blank', title: 'Already completed or processing', status: 409, code: 'wrong_status' });
    }

    // Status update only: media.asset.processing.v1 is not yet in the event registry.
    // The processing worker polls for status='processing' rows; the ready event follows from processAsset().
    await this.db.update(assetTable).set({ status: 'processing' }).where(eq(assetTable.id, assetId));
  }

  async processAsset(assetId: AssetId): Promise<void> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    if (!row || !row.storageKey) throw new NotFoundException({ type: 'about:blank', title: 'Asset not found', status: 404, code: 'asset_not_found' });

    const raw = await this.storage.get(row.storageKey);
    if (!raw) throw new NotFoundException({ type: 'about:blank', title: 'Object not found in storage', status: 404, code: 'object_not_found' });

    // Resize to max 1920px longest edge, strip ALL metadata (sharp default), convert to webp.
    // Do NOT call keepExif(), withExif(), keepIccProfile() or withMetadata() — any of those re-attaches metadata.
    const processed = await sharp(Buffer.from(raw))
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const readyKey = `${assetId}.webp`;
    await this.storage.put(readyKey, new Uint8Array(processed), 'image/webp');

    await this.db.transaction(async (tx) => {
      await tx
        .update(assetTable)
        .set({ status: 'ready', storageKey: readyKey, processedAt: new Date() })
        .where(eq(assetTable.id, assetId));
      await this.outbox.publish(
        {
          id: crypto.randomUUID(),
          name: 'media.asset.ready.v1',
          occurredAt: new Date().toISOString(),
          payload: { assetId, ownerId: row.ownerId as UserId, purpose: row.purpose as MediaPurpose },
        },
        tx,
      );
    });
  }

  async getAsset(id: AssetId): Promise<MediaAsset | null> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, id));
    if (!row) return null;
    return { id: row.id as AssetId, ownerId: row.ownerId as UserId, purpose: row.purpose as MediaPurpose, status: row.status };
  }

  async readUrl(id: AssetId): Promise<string | null> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, id));
    if (!row || row.status !== 'ready' || !row.storageKey) return null;
    const signed = await this.storage.signRead(row.storageKey, READ_URL_TTL_S);
    return signed.url;
  }

  /** Returns a signed read URL for a named size variant.
   *  'full' resolves to the regular ready key; 'thumbnail'/'medium' use a derived key.
   *  Falls back to the full asset URL when the variant has not been generated yet. */
  async readUrlWithSize(id: AssetId, size: 'thumbnail' | 'medium' | 'full'): Promise<string | null> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, id));
    if (!row || row.status !== 'ready' || !row.storageKey) return null;
    if (size === 'full') {
      const signed = await this.storage.signRead(row.storageKey, READ_URL_TTL_S);
      return signed.url;
    }
    const variantKey = `${id}.${size}.webp`;
    // Use variant if it exists; fall back to full asset URL if not yet generated.
    const variantData = await this.storage.get(variantKey);
    const keyToSign = variantData ? variantKey : row.storageKey;
    const signed = await this.storage.signRead(keyToSign, READ_URL_TTL_S);
    return signed.url;
  }

  /** Generates a resized variant for the given size, stores it, and returns its signed URL.
   *  When the image-processing queue is available, resize is enqueued as a background job.
   *  Otherwise falls back to inline processing (acceptable for tests and single-process setups). */
  async resizeAsset(assetId: AssetId, size: 'thumbnail' | 'medium' | 'full'): Promise<string | null> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    if (!row || row.status !== 'ready' || !row.storageKey) return null;

    if (size === 'full') {
      const signed = await this.storage.signRead(row.storageKey, READ_URL_TTL_S);
      return signed.url;
    }

    const variantKey = `${assetId}.${size}.webp`;
    const dimension = SIZE_DIMENSIONS[size] ?? MAX_DIMENSION;

    // Return cached variant if already generated.
    const existing = await this.storage.get(variantKey);
    if (!existing) {
      if (this.imageQueue) {
        // Offload to background worker; caller will get the full-asset URL until the variant is ready.
        await this.imageQueue.add(
          IMAGE_PROCESSING_QUEUE,
          { assetId, inputPath: row.storageKey, outputPath: variantKey, width: dimension, height: dimension },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
        );
        // Return full asset URL while the variant is being generated.
        const signed = await this.storage.signRead(row.storageKey, READ_URL_TTL_S);
        return signed.url;
      }

      // Inline fallback (no queue available).
      const raw = await this.storage.get(row.storageKey);
      if (!raw) return null;
      const resized = await sharp(Buffer.from(raw))
        .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: size === 'thumbnail' ? 70 : 82 })
        .toBuffer();
      await this.storage.put(variantKey, new Uint8Array(resized), 'image/webp');
    }

    const signed = await this.storage.signRead(variantKey, READ_URL_TTL_S);
    return signed.url;
  }

  /** Deletes assets that remain in 'pending' status for longer than ORPHAN_GRACE_MS
   *  (i.e. the upload was never completed and no post referenced them).
   *  Also deletes 'ready' assets that are no longer referenced by any discover post or provider photo.
   *  Intended to be called by a scheduled job.
   */
  async cleanupOrphaned(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS);

    // Collect UUIDs referenced by discover.post.media_asset_ids (uuid[]) and providers.provider.photo_asset_ids (text JSON array).
    // Cross-schema raw SQL: these schemas are on the same Postgres instance.
    const referencedRows = await this.db.execute<{ id: string }>(
      drizzleSql`
        SELECT unnest(media_asset_ids) AS id FROM discover.post WHERE media_asset_ids IS NOT NULL
        UNION
        SELECT jsonb_array_elements_text(photo_asset_ids::jsonb)::uuid AS id
        FROM providers.provider
        WHERE photo_asset_ids <> '[]' AND photo_asset_ids <> 'null'
      `,
    );
    const referenced = new Set(referencedRows.rows.map((r) => r.id));

    // Pending assets older than grace period (upload never completed).
    const stalePending = await this.db
      .select({ id: assetTable.id, storageKey: assetTable.storageKey })
      .from(assetTable)
      .where(and(eq(assetTable.status, 'pending'), lt(assetTable.createdAt, cutoff)));

    // Ready assets not referenced by any discover post or provider.
    const staleReady =
      referenced.size > 0
        ? await this.db
            .select({ id: assetTable.id, storageKey: assetTable.storageKey })
            .from(assetTable)
            .where(
              and(
                eq(assetTable.status, 'ready'),
                lt(assetTable.createdAt, cutoff),
                notInArray(assetTable.id, [...referenced] as AssetId[]),
              ),
            )
        : await this.db
            .select({ id: assetTable.id, storageKey: assetTable.storageKey })
            .from(assetTable)
            .where(and(eq(assetTable.status, 'ready'), lt(assetTable.createdAt, cutoff)));

    const staleOrphans = [...stalePending, ...staleReady];

    let deleted = 0;
    for (const row of staleOrphans) {
      if (row.storageKey) {
        await this.storage.delete(row.storageKey).catch(() => undefined);
        // Also remove any generated variant keys.
        for (const size of ['thumbnail', 'medium'] as const) {
          await this.storage.delete(`${row.id}.${size}.webp`).catch(() => undefined);
        }
      }
      await this.db.delete(assetTable).where(eq(assetTable.id, row.id as AssetId));
      deleted++;
    }
    return { deleted };
  }

  async deleteAsset(assetId: AssetId): Promise<void> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    if (!row) return;
    if (row.storageKey) await this.storage.delete(row.storageKey);
    await this.db.delete(assetTable).where(eq(assetTable.id, assetId));
  }
}
