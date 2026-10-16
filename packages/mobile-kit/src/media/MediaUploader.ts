/**
 * MediaUploader – uploads images and videos to the backend API.
 * Never talks to S3 directly; all uploads go through the backend,
 * which issues a signed URL and then confirms the upload.
 *
 * Depends on `uploadAsset` from ../upload-asset (existing M3 stub).
 */
import type { ApiClient } from '@iraq-maps/api-client';
import type { AssetId, MediaPurpose } from '@iraq-maps/contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadProgressCallback = (progress: number) => void;

export interface UploadResult {
  assetId: AssetId;
  /** Public CDN URL returned by the backend after confirmation. */
  publicUrl?: string;
}

export interface UploadImageOptions {
  /** Local file URI. */
  uri: string;
  /** Backend media purpose (e.g. 'story', 'post', 'avatar'). */
  purpose: MediaPurpose;
  /** Optional progress callback (0–1). */
  onProgress?: UploadProgressCallback;
}

export interface UploadVideoOptions {
  uri: string;
  purpose: MediaPurpose;
  /** Optional progress callback (0–1). */
  onProgress?: UploadProgressCallback;
}

export interface DeleteMediaOptions {
  /** The public CDN URL or assetId to remove. */
  assetId: AssetId;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mimeFromUri(uri: string, isVideo: boolean): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (isVideo) {
    const videoMap: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      webm: 'video/webm',
      m4v: 'video/mp4',
    };
    return videoMap[ext ?? ''] ?? 'video/mp4';
  }
  const imageMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return imageMap[ext ?? ''] ?? 'image/jpeg';
}

/**
 * PUT a blob to a signed upload URL with simulated progress reporting.
 * Real XHR-based progress requires a native fetch override; this approximation
 * fires progress callbacks at fixed intervals while the fetch is in flight.
 */
async function putWithProgress(
  url: string,
  blob: Blob,
  mime: string,
  onProgress?: UploadProgressCallback,
): Promise<void> {
  if (!onProgress) {
    const res = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': mime },
    });
    if (!res.ok) throw new Error(`PUT failed: ${res.status}`);
    return;
  }

  // Simulated progress: tick every 300ms until fetch resolves.
  let done = false;
  let elapsed = 0;
  const TICK = 300;
  const ESTIMATED_MS = Math.max(1000, blob.size / 50_000); // rough estimate

  const ticker = setInterval(() => {
    elapsed += TICK;
    if (!done) {
      onProgress(Math.min(0.9, elapsed / ESTIMATED_MS));
    }
  }, TICK);

  try {
    const res = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': mime },
    });
    if (!res.ok) throw new Error(`PUT failed: ${res.status}`);
    done = true;
    onProgress(1);
  } finally {
    clearInterval(ticker);
  }
}

// ─── MediaUploader ────────────────────────────────────────────────────────────

export class MediaUploader {
  private readonly api: ApiClient;
  private readonly apiBaseUrl: string;

  constructor(api: ApiClient, apiBaseUrl: string) {
    this.api = api;
    this.apiBaseUrl = apiBaseUrl;
  }

  private resolveUrl(u: string): string {
    return u.startsWith('/') ? this.apiBaseUrl.replace(/\/+$/, '') + u : u;
  }

  /**
   * Upload a local image URI to the backend media service.
   * The app never constructs an S3 URL; the backend returns a signed PUT URL.
   */
  async uploadImage(options: UploadImageOptions): Promise<UploadResult> {
    const { uri, purpose, onProgress } = options;
    const mime = mimeFromUri(uri, false) as
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp';

    onProgress?.(0.05);

    // 1. Fetch blob
    const response = await fetch(uri);
    const blob = await response.blob();
    const size = blob.size;

    onProgress?.(0.1);

    // 2. Request upload ticket
    const ticketRes = await this.api.media.createUpload({
      body: { purpose, mime, size },
    });
    if (ticketRes.status !== 201) {
      throw new Error(`Upload ticket failed: ${ticketRes.status}`);
    }
    const { assetId, uploadUrl } = ticketRes.body;

    onProgress?.(0.15);

    // 3. PUT to signed URL
    await putWithProgress(
      this.resolveUrl(uploadUrl),
      blob,
      mime,
      onProgress ? (p: number) => onProgress(0.15 + p * 0.75) : undefined,
    );

    onProgress?.(0.9);

    // 4. Confirm upload
    const confirmRes = await this.api.media.completeUpload({
      params: { assetId },
    });
    if (confirmRes.status !== 202) {
      throw new Error(`Upload confirmation failed: ${confirmRes.status}`);
    }

    onProgress?.(1);

    const publicUrl =
      'publicUrl' in confirmRes.body
        ? (confirmRes.body as { publicUrl?: string }).publicUrl
        : undefined;

    return { assetId, publicUrl };
  }

  /**
   * Upload a local video URI.
   * Identical flow to uploadImage; the mime type is video/mp4 by default.
   */
  async uploadVideo(options: UploadVideoOptions): Promise<UploadResult> {
    const { uri, purpose, onProgress } = options;
    const mime = mimeFromUri(uri, true) as 'video/mp4';

    onProgress?.(0.05);

    const response = await fetch(uri);
    const blob = await response.blob();
    const size = blob.size;

    onProgress?.(0.1);

    const ticketRes = await this.api.media.createUpload({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: { purpose, mime: mime as any, size },
    });
    if (ticketRes.status !== 201) {
      throw new Error(`Video upload ticket failed: ${ticketRes.status}`);
    }
    const { assetId, uploadUrl } = ticketRes.body;

    onProgress?.(0.15);

    await putWithProgress(
      this.resolveUrl(uploadUrl),
      blob,
      mime,
      onProgress ? (p: number) => onProgress(0.15 + p * 0.75) : undefined,
    );

    onProgress?.(0.9);

    const confirmRes = await this.api.media.completeUpload({
      params: { assetId },
    });
    if (confirmRes.status !== 202) {
      throw new Error(`Video upload confirmation failed: ${confirmRes.status}`);
    }

    onProgress?.(1);

    const publicUrl =
      'publicUrl' in confirmRes.body
        ? (confirmRes.body as { publicUrl?: string }).publicUrl
        : undefined;

    return { assetId, publicUrl };
  }

  /**
   * Request deletion of a previously uploaded asset.
   * The backend removes it from object storage.
   */
  async deleteMedia(options: DeleteMediaOptions): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (this.api.media as any).deleteAsset?.({
      params: { assetId: options.assetId },
    });
    if (res && res.status !== 204) {
      throw new Error(`Delete failed: ${res.status}`);
    }
  }

  /**
   * Upload multiple images concurrently (up to `concurrency` at a time).
   * Returns an array of UploadResult in the same order as the input.
   */
  async uploadImages(
    items: UploadImageOptions[],
    concurrency = 2,
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = new Array(items.length);
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((item) => this.uploadImage(item)),
      );
      batchResults.forEach((r, j) => { results[i + j] = r; });
    }
    return results;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a MediaUploader bound to the given API client and base URL.
 * Use this inside a React hook that calls useApi() and useApiBaseUrl().
 */
export function createMediaUploader(api: ApiClient, apiBaseUrl: string): MediaUploader {
  return new MediaUploader(api, apiBaseUrl);
}
