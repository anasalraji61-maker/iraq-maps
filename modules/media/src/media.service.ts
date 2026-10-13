import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
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

export const DB_TOKEN = 'media:db';
export const OUTBOX_TOKEN = 'media:outbox';

const READ_URL_TTL_S = 3600;
const UPLOAD_URL_TTL_S = 900;
const MAX_DIMENSION = 1920;

@Injectable()
export class MediaService implements MediaPort {
  private readonly outbox: OutboxPublisher<DbTx>;

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    @Inject(PortTokens.ObjectStorage) private readonly storage: ObjectStorage,
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

  async deleteAsset(assetId: AssetId): Promise<void> {
    const [row] = await this.db.select().from(assetTable).where(eq(assetTable.id, assetId));
    if (!row) return;
    if (row.storageKey) await this.storage.delete(row.storageKey);
    await this.db.delete(assetTable).where(eq(assetTable.id, assetId));
  }
}
