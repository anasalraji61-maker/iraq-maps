// M3 contracts: media uploads, processing and signed URLs.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { Problem, UserId } from './common';

const c = initContract();

/** @public frozen contract (M3) */
export const AssetId = z.string().uuid().brand<'AssetId'>();
export type AssetId = z.infer<typeof AssetId>;
/** @public frozen contract (M3) */
export const MediaPurpose = z.enum(['provider_photo']);
export type MediaPurpose = z.infer<typeof MediaPurpose>;
/** The client compresses to JPEG before upload; PNG and WebP are accepted as they are.
 * @public frozen contract (M3) */
export const MediaMime = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type MediaMime = z.infer<typeof MediaMime>;
/** @public frozen contract (M3) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** @public frozen contract (M3) */
export const AssetStatus = z.enum(['pending', 'processing', 'ready', 'failed']);
export type AssetStatus = z.infer<typeof AssetStatus>;

/** Flat object keys, e.g. `<assetId>.jpg`: no slashes, so no `..` or absolute paths can reach a storage driver.
 * @public frozen contract (M3) */
export const StorageKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}(\.[a-z0-9]{1,5})?$/);

/** A signed URL: absolute (S3/R2), or root-relative `/v1/...` (the filesystem driver), which the client resolves
 * against its API base URL like the city descriptor's URLs.
 * @public frozen contract (M3) */
export const SignedUrlString = z.string().max(2048).regex(/^(https?:\/\/\S+|\/v1\/\S+)$/);

/** @public frozen contract (M3) */
export const UploadTicket = z.object({
  assetId: AssetId,
  /** Signed PUT URL: S3/R2 presigned, or the filesystem driver's /v1/media/fs route. */
  uploadUrl: SignedUrlString,
  /** Headers the PUT must send as they are (content type, length limits). */
  headers: z.record(z.string()),
  expiresAt: z.string().datetime(),
});
/** @public frozen contract (M3) */
export const SignedUrl = z.object({ url: SignedUrlString, expiresAt: z.string().datetime() });

const signature = z.object({ exp: z.coerce.number().int().positive(), sig: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/) });

/** @public frozen contract (M3), served by modules/media */
export const mediaContract = c.router(
  {
    createUpload: {
      method: 'POST',
      path: '/media/uploads',
      body: z.object({ purpose: MediaPurpose, mime: MediaMime, size: z.number().int().min(1).max(MAX_UPLOAD_BYTES) }),
      responses: { 201: UploadTicket, 400: Problem, 401: Problem, 429: Problem },
    },
    /** Starts processing (resize, strip all EXIF); media.asset.ready.v1 follows. 409: nothing uploaded, or done already. */
    completeUpload: {
      method: 'POST',
      path: '/media/uploads/:assetId/complete',
      pathParams: z.object({ assetId: AssetId }),
      body: c.noBody(),
      responses: { 202: z.object({ assetId: AssetId, status: AssetStatus }), 400: Problem, 401: Problem, 404: Problem, 409: Problem },
    },
    /** The owner's short-lived read URL. 404 for anyone else; 409 until ready. */
    readUrl: {
      method: 'GET',
      path: '/media/:assetId/url',
      pathParams: z.object({ assetId: AssetId }),
      responses: { 200: SignedUrl, 401: Problem, 404: Problem, 409: Problem },
    },
    /** The filesystem driver's signed object routes (dev, test, e2e). Public: the HMAC signature (MEDIA_SIGNING_SECRET)
     * over method, key and expiry is the authorization. 403: bad or expired signature. */
    fsPut: {
      method: 'PUT',
      path: '/media/fs/:key',
      pathParams: z.object({ key: StorageKey }),
      query: signature,
      body: c.type<Uint8Array>(),
      responses: { 204: c.noBody(), 400: Problem, 403: Problem, 413: Problem },
    },
    fsGet: {
      method: 'GET',
      path: '/media/fs/:key',
      pathParams: z.object({ key: StorageKey }),
      query: signature,
      responses: { 200: c.otherResponse({ contentType: 'image/webp', body: c.type<Uint8Array>() }), 403: Problem, 404: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** Object storage behind modules/media: the filesystem driver (modules/media) or S3/R2/MinIO (adapters/storage-s3).
 * Keys are StorageKey; implementations reject anything else. */
export interface ObjectStorage {
  readonly kind: 'fs' | 's3' | 'fake';
  /** A direct client upload: PUT the body to `url` with exactly `headers` before `expiresAt`. */
  signUpload(key: string, opts: { contentType: MediaMime; maxBytes: number; expiresInS: number }): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }>;
  signRead(key: string, expiresInS: number): Promise<{ url: string; expiresAt: Date }>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** null when the key does not exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
}

/** @public frozen contract (M3) */
export interface MediaAsset {
  id: AssetId;
  ownerId: UserId;
  purpose: MediaPurpose;
  status: AssetStatus;
}

/** modules/media's port (providers attaches photos and shows them). */
export interface MediaPort {
  getAsset(id: AssetId): Promise<MediaAsset | null>;
  /** A short-lived signed read URL of a ready asset; null otherwise. */
  readUrl(id: AssetId): Promise<string | null>;
}

/** Merged into the event registry (events.ts). */
export const mediaEventPayloads = {
  'media.asset.ready.v1': z.object({ assetId: AssetId, ownerId: UserId, purpose: MediaPurpose }),
} as const;
