import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { and, desc, eq, lt, sql as drizzleSql, notInArray } from 'drizzle-orm';
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

export interface PhotoMetadata {
  width: number;
  height: number;
  /** IANA mime type of the processed file. */
  mime: string;
  /** Dominant colours as hex strings, up to 5. */
  dominantColors: string[];
  /** Blurhash placeholder string. */
  blurhash: string;
  /** Original capture date if present in EXIF (GPS removed). */
  capturedAt: string | null;
  /** Camera make/model stripped of GPS. */
  cameraMake: string | null;
  cameraModel: string | null;
}

export interface ModerationResult {
  safe: boolean;
  confidence: number;
  /** Flagged categories (empty when safe). */
  categories: string[];
}

export interface GalleryPhoto {
  assetId: AssetId;
  ownerId: UserId;
  purpose: MediaPurpose;
  status: string;
  /** Signed URL for the 'medium' variant or full asset as fallback. */
  url: string;
  thumbUrl: string;
}

export interface GalleryPage {
  photos: GalleryPhoto[];
  total: number;
  nextCursor: string | null;
}

export interface GalleryOptions {
  limit?: number;
  cursor?: string;
  /** 'newest' | 'oldest'. Default 'newest'. */
  sort?: 'newest' | 'oldest';
}

export interface PhotoStats {
  total: number;
  /** ISO string of the most recently processed asset, or null. */
  lastAddedAt: string | null;
  /** Total size of all assets in bytes. */
  totalBytes: number;
}

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

  // ─── Photo size variants ──────────────────────────────────────────────────────

  /** Named size variants for place photos. */
  static readonly PHOTO_SIZES = {
    thumb:    { w: 150, h: 150, fit: 'cover'  as const },
    small:    { w: 400, h: 300, fit: 'inside' as const },
    medium:   { w: 800, h: 600, fit: 'inside' as const },
    large:    { w: 1200, h: 900, fit: 'inside' as const },
    original: null,
  } as const;

  /**
   * Resize an asset to all place-photo variants and persist them in object storage.
   * Keys follow the pattern `<assetId>.<sizeName>.webp`.
   * Returns a map of size name → signed read URL (TTL 1 h).
   */
  async processPlacePhoto(
    photoId: AssetId,
  ): Promise<Record<string, string>> {
    const [row] = await this.db
      .select()
      .from(assetTable)
      .where(eq(assetTable.id, photoId));

    if (!row || row.status !== 'ready' || !row.storageKey) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Asset not found or not ready',
        status: 404,
        code: 'asset_not_found',
      });
    }

    const raw = await this.storage.get(row.storageKey);
    if (!raw) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Object not found in storage',
        status: 404,
        code: 'object_not_found',
      });
    }

    const src = Buffer.from(raw);
    const urls: Record<string, string> = {};

    for (const [name, dims] of Object.entries(MediaService.PHOTO_SIZES)) {
      const variantKey = `${photoId}.${name}.webp`;

      if (dims === null) {
        // Original – just sign the existing key.
        const signed = await this.storage.signRead(row.storageKey, READ_URL_TTL_S);
        urls[name] = signed.url;
        continue;
      }

      const pipeline = sharp(src).webp({ quality: name === 'thumb' ? 75 : 85 });
      if (dims.fit === 'cover') {
        pipeline.resize(dims.w, dims.h, { fit: 'cover', position: 'attention' });
      } else {
        pipeline.resize(dims.w, dims.h, { fit: 'inside', withoutEnlargement: true });
      }

      const buf = await pipeline.toBuffer();
      await this.storage.put(variantKey, new Uint8Array(buf), 'image/webp');

      const signed = await this.storage.signRead(variantKey, READ_URL_TTL_S);
      urls[name] = signed.url;
    }

    return urls;
  }

  // ─── Photo metadata ───────────────────────────────────────────────────────────

  /**
   * Extract photo metadata from a processed asset.
   * GPS data is never included (privacy requirement).
   */
  async generatePhotoMetadata(photoId: AssetId): Promise<PhotoMetadata> {
    const [row] = await this.db
      .select()
      .from(assetTable)
      .where(eq(assetTable.id, photoId));

    if (!row || row.status !== 'ready' || !row.storageKey) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Asset not ready',
        status: 404,
        code: 'asset_not_found',
      });
    }

    const raw = await this.storage.get(row.storageKey);
    if (!raw) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Object not found in storage',
        status: 404,
        code: 'object_not_found',
      });
    }

    const img = sharp(Buffer.from(raw));
    const meta = await img.metadata();
    const { width = 0, height = 0 } = meta;

    // Extract dominant colours via small stats sample (4×4 tile).
    const { dominant } = await img
      .resize(4, 4, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data }) => {
        const counts: Map<string, number> = new Map();
        for (let i = 0; i < data.length; i += 3) {
          const hex = `#${data[i]!.toString(16).padStart(2, '0')}${data[i + 1]!.toString(16).padStart(2, '0')}${data[i + 2]!.toString(16).padStart(2, '0')}`;
          counts.set(hex, (counts.get(hex) ?? 0) + 1);
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        return { dominant: sorted.slice(0, 5).map(([h]) => h) };
      });

    // Generate blurhash (4×3 components).
    const blurhash = await this._computeBlurhash(Buffer.from(raw));

    // Safe EXIF subset – never GPS.
    const exif = meta.exif ? this._safeExif(meta.exif) : {};

    return {
      width,
      height,
      mime: 'image/webp',
      dominantColors: dominant,
      blurhash,
      capturedAt: (exif.DateTimeOriginal as string | undefined) ?? null,
      cameraMake: (exif.Make as string | undefined) ?? null,
      cameraModel: (exif.Model as string | undefined) ?? null,
    };
  }

  /** Strip GPS tags from raw EXIF buffer; return safe scalar fields only. */
  private _safeExif(exifBuf: Buffer): Record<string, unknown> {
    // We don't bundle an EXIF parser here; sharp strips GPS on processAsset().
    // This method is a forward hook for when a lightweight EXIF reader is added.
    void exifBuf;
    return {};
  }

  // ─── Content moderation stub ──────────────────────────────────────────────────

  /**
   * Stub content moderator.
   * Replace body with a real vision-model call once the adapter exists.
   */
  async detectContentModerator(_photoId: AssetId): Promise<ModerationResult> {
    return { safe: true, confidence: 0.99, categories: [] };
  }

  // ─── Place photo gallery ──────────────────────────────────────────────────────

  /**
   * Return a paginated gallery of ready assets that belong to a given place's provider.
   * Because the media schema does not embed placeId, this method accepts a list of
   * assetIds that the caller resolves from the providers schema.
   */
  async getPlacePhotoGallery(
    assetIds: AssetId[],
    opts: GalleryOptions = {},
  ): Promise<GalleryPage> {
    const { limit = 20, cursor, sort = 'newest' } = opts;

    if (assetIds.length === 0) {
      return { photos: [], total: 0, nextCursor: null };
    }

    // Resolve order from caller-supplied list (display order is determined by caller).
    let ordered = [...assetIds];
    if (sort === 'oldest') ordered = ordered.reverse();

    const cursorIdx = cursor ? ordered.indexOf(cursor as AssetId) + 1 : 0;
    const page = ordered.slice(cursorIdx, cursorIdx + limit);
    const nextCursor = cursorIdx + limit < ordered.length ? ordered[cursorIdx + limit] ?? null : null;

    const rows = page.length > 0
      ? await this.db
          .select()
          .from(assetTable)
          .where(
            and(
              eq(assetTable.status, 'ready'),
              // drizzle-orm notInArray used inverted: use sql IN instead
              drizzleSql`${assetTable.id} = ANY(ARRAY[${drizzleSql.join(page.map((id) => drizzleSql`${id}::uuid`), drizzleSql`, `)}])`,
            ),
          )
      : [];

    // Sign URLs for each photo.
    const photos: GalleryPhoto[] = (await Promise.all(
      page.map(async (id): Promise<GalleryPhoto | null> => {
        const row = rows.find((r) => r.id === id);
        if (!row?.storageKey) {
          return null;
        }

        const mediumKey = `${id}.medium.webp`;
        const thumbKey  = `${id}.thumb.webp`;

        const [mediumExists, thumbExists] = await Promise.all([
          this.storage.get(mediumKey).then((b) => !!b),
          this.storage.get(thumbKey).then((b) => !!b),
        ]);

        const [urlResult, thumbResult] = await Promise.all([
          this.storage.signRead(mediumExists ? mediumKey : row.storageKey, READ_URL_TTL_S),
          this.storage.signRead(thumbExists  ? thumbKey  : row.storageKey, READ_URL_TTL_S),
        ]);

        return {
          assetId: row.id as AssetId,
          ownerId: row.ownerId as UserId,
          purpose: row.purpose as MediaPurpose,
          status: row.status,
          url: urlResult.url,
          thumbUrl: thumbResult.url,
        } satisfies GalleryPhoto;
      }),
    )).filter((x): x is GalleryPhoto => x !== null);

    return { photos, total: assetIds.length, nextCursor };
  }

  /**
   * Return a paginated gallery of ready assets owned by a user, optionally filtered by purpose.
   */
  async getGallery(
    ownerId: UserId,
    purpose?: MediaPurpose,
    opts: GalleryOptions = {},
  ): Promise<GalleryPage> {
    const { limit = 20, cursor, sort = 'newest' } = opts;

    const conditions = [
      eq(assetTable.ownerId, ownerId),
      eq(assetTable.status, 'ready' as const),
      ...(purpose ? [eq(assetTable.purpose, purpose)] : []),
    ];

    const rows = await this.db
      .select()
      .from(assetTable)
      .where(and(...conditions))
      .orderBy(sort === 'oldest' ? assetTable.createdAt : desc(assetTable.createdAt));

    const ordered = rows.map((r) => r.id as AssetId);
    const cursorIdx = cursor ? ordered.indexOf(cursor as AssetId) + 1 : 0;
    const page = ordered.slice(cursorIdx, cursorIdx + limit);
    const nextCursor = cursorIdx + limit < ordered.length ? ordered[cursorIdx + limit] ?? null : null;

    const photos: GalleryPhoto[] = (await Promise.all(
      page.map(async (id): Promise<GalleryPhoto | null> => {
        const row = rows.find((r) => r.id === id);
        if (!row?.storageKey) return null;
        const [urlResult] = await Promise.all([
          this.storage.signRead(row.storageKey, READ_URL_TTL_S),
        ]);
        return {
          assetId: row.id as AssetId,
          ownerId: row.ownerId as UserId,
          purpose: row.purpose as MediaPurpose,
          status: row.status,
          url: urlResult.url,
          thumbUrl: urlResult.url,
        } satisfies GalleryPhoto;
      }),
    )).filter((x): x is GalleryPhoto => x !== null);

    return { photos, total: ordered.length, nextCursor };
  }

  // ─── Photo ordering & cover ────────────────────────────────────────────────────

  /**
   * Validate that all photoIds are ready assets owned by the same provider.
   * Returns the validated AssetId array in the requested order.
   * Throws BadRequestException for unknown or unowned assets.
   */
  async reorderPhotos(
    ownerId: UserId,
    photoIds: AssetId[],
  ): Promise<AssetId[]> {
    if (photoIds.length === 0) return [];

    const rows = await this.db
      .select({ id: assetTable.id, ownerId: assetTable.ownerId, status: assetTable.status })
      .from(assetTable)
      .where(eq(assetTable.ownerId, ownerId));

    const owned = new Map(rows.map((r) => [r.id, r]));

    for (const id of photoIds) {
      const row = owned.get(id);
      if (!row) {
        throw new BadRequestException({
          type: 'about:blank',
          title: `Asset ${id} not found or not owned by this user`,
          status: 400,
          code: 'asset_not_owned',
        });
      }
      if (row.status !== 'ready') {
        throw new BadRequestException({
          type: 'about:blank',
          title: `Asset ${id} is not ready`,
          status: 400,
          code: 'asset_not_ready',
        });
      }
    }

    // Ordering is persisted by the providers module; we just validate here.
    return photoIds;
  }

  /**
   * Validate that a given asset exists, is ready, and is owned by ownerId.
   * The providers module is responsible for persisting the cover pointer.
   */
  async setCoverPhoto(ownerId: UserId, photoId: AssetId): Promise<void> {
    const [row] = await this.db
      .select()
      .from(assetTable)
      .where(and(eq(assetTable.id, photoId), eq(assetTable.ownerId, ownerId)));

    if (!row) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Asset not found or not owned by this provider',
        status: 404,
        code: 'asset_not_found',
      });
    }
    if (row.status !== 'ready') {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'Asset is not ready',
        status: 400,
        code: 'asset_not_ready',
      });
    }
    // Caller (providers module) persists coverAssetId.
  }

  // ─── Photo statistics ─────────────────────────────────────────────────────────

  /**
   * Return aggregate photo stats for a set of asset IDs.
   */
  async getPhotoStats(assetIds: AssetId[]): Promise<PhotoStats> {
    if (assetIds.length === 0) {
      return { total: 0, lastAddedAt: null, totalBytes: 0 };
    }

    const rows = await this.db
      .select({
        processedAt: assetTable.processedAt,
        sizeBytes: assetTable.sizeBytes,
      })
      .from(assetTable)
      .where(
        and(
          eq(assetTable.status, 'ready'),
          drizzleSql`${assetTable.id} = ANY(ARRAY[${drizzleSql.join(assetIds.map((id) => drizzleSql`${id}::uuid`), drizzleSql`, `)}])`,
        ),
      );

    const total = rows.length;
    const totalBytes = rows.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);
    const latest = rows
      .map((r) => r.processedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      total,
      lastAddedAt: latest ? latest.toISOString() : null,
      totalBytes,
    };
  }

  // ─── Bulk delete ──────────────────────────────────────────────────────────────

  /**
   * Delete multiple assets, verifying ownership for each.
   * Returns counts of deleted and skipped (not owned / not found).
   */
  async bulkDeletePhotos(
    photoIds: AssetId[],
    userId: UserId,
  ): Promise<{ deleted: number; skipped: number }> {
    let deleted = 0;
    let skipped = 0;

    for (const id of photoIds) {
      const [row] = await this.db
        .select()
        .from(assetTable)
        .where(and(eq(assetTable.id, id), eq(assetTable.ownerId, userId)));

      if (!row) {
        skipped++;
        continue;
      }

      // Remove main key and all size variants from object storage.
      if (row.storageKey) {
        await this.storage.delete(row.storageKey).catch(() => undefined);
      }
      for (const sizeName of Object.keys(MediaService.PHOTO_SIZES)) {
        await this.storage.delete(`${id}.${sizeName}.webp`).catch(() => undefined);
      }

      await this.db.delete(assetTable).where(eq(assetTable.id, id));
      deleted++;
    }

    return { deleted, skipped };
  }

  // ─── Blurhash ─────────────────────────────────────────────────────────────────

  /**
   * Compute a blurhash string for a processed asset.
   * Uses a 32×32 downscale and 4×3 component grid.
   */
  async generateBlurhash(photoId: AssetId): Promise<string> {
    const [row] = await this.db
      .select()
      .from(assetTable)
      .where(eq(assetTable.id, photoId));

    if (!row || row.status !== 'ready' || !row.storageKey) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Asset not found or not ready',
        status: 404,
        code: 'asset_not_found',
      });
    }

    const raw = await this.storage.get(row.storageKey);
    if (!raw) {
      throw new NotFoundException({
        type: 'about:blank',
        title: 'Object not found in storage',
        status: 404,
        code: 'object_not_found',
      });
    }

    return this._computeBlurhash(Buffer.from(raw));
  }

  /**
   * Internal blurhash computation.
   * Encodes a 4×3 DCT hash from a 32×32 thumbnail using the standard algorithm.
   */
  private async _computeBlurhash(src: Buffer): Promise<string> {
    const { data, info } = await sharp(src)
      .resize(32, 32, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height } = info;
    const componentsX = 4;
    const componentsY = 3;

    // DCT coefficient extraction.
    const factors: [number, number, number][] = [];
    for (let j = 0; j < componentsY; j++) {
      for (let i = 0; i < componentsX; i++) {
        const norm = i === 0 && j === 0 ? 1 : 2;
        let r = 0, g = 0, b = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const basis =
              norm *
              Math.cos((Math.PI * i * x) / width) *
              Math.cos((Math.PI * j * y) / height);
            const idx = (y * width + x) * 3;
            r += basis * sRGBToLinear(data[idx]!);
            g += basis * sRGBToLinear(data[idx + 1]!);
            b += basis * sRGBToLinear(data[idx + 2]!);
          }
        }
        const scale = 1 / (width * height);
        factors.push([r * scale, g * scale, b * scale]);
      }
    }

    // Encode using base-83.
    const dc = factors[0]!;
    const ac = factors.slice(1);

    let hash = '';

    // Size flag.
    const sizeFlag = (componentsX - 1) + (componentsY - 1) * 9;
    hash += encode83(sizeFlag, 1);

    // Quantise AC components.
    const maxAc = ac.length > 0
      ? Math.max(...ac.flatMap(([r, g, b]) => [Math.abs(r), Math.abs(g), Math.abs(b)]))
      : 0;
    const quantisedMaxAc = ac.length > 0 ? Math.max(0, Math.min(82, Math.floor(maxAc * 166 - 0.5))) : 0;
    hash += encode83(quantisedMaxAc, 1);

    // DC value.
    hash += encode83(encodeDC(dc[0], dc[1], dc[2]), 4);

    // AC values.
    const acScale = (quantisedMaxAc + 1) / 166;
    for (const [r, g, b] of ac) {
      hash += encode83(encodeAC(r, g, b, acScale), 2);
    }

    return hash;
  }
}

// ─── Blurhash helpers (module-level) ──────────────────────────────────────────

function sRGBToLinear(v: number): number {
  const f = v / 255;
  return f <= 0.04045 ? f / 12.92 : Math.pow((f + 0.055) / 1.055, 2.4);
}

function linearToSRGB(v: number): number {
  const c = Math.max(0, Math.min(1, v));
  return c <= 0.0031308 ? Math.round(c * 12.92 * 255 + 0.5) : Math.round((1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255 + 0.5);
}

function encodeDC(r: number, g: number, b: number): number {
  return (linearToSRGB(r) << 16) | (linearToSRGB(g) << 8) | linearToSRGB(b);
}

function encodeAC(r: number, g: number, b: number, maxAc: number): number {
  const qr = Math.max(0, Math.min(18, Math.floor(signPow(r / maxAc, 0.5) * 9 + 9.5)));
  const qg = Math.max(0, Math.min(18, Math.floor(signPow(g / maxAc, 0.5) * 9 + 9.5)));
  const qb = Math.max(0, Math.min(18, Math.floor(signPow(b / maxAc, 0.5) * 9 + 9.5)));
  return qr * 19 * 19 + qg * 19 + qb;
}

function signPow(val: number, exp: number): number {
  return Math.sign(val) * Math.pow(Math.abs(val), exp);
}

const CHARS83 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function encode83(n: number, len: number): string {
  let result = '';
  for (let i = 1; i <= len; i++) {
    result += CHARS83[Math.floor(n / Math.pow(83, len - i)) % 83] ?? '0';
  }
  return result;
}
