import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ObjectStorage, MediaMime } from '@iraq-maps/contracts';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string; // for R2/MinIO
}

export class S3ObjectStorage implements ObjectStorage {
  readonly kind = 's3' as const;
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(
    config: S3StorageConfig,
    client?: S3Client,
  ) {
    this.bucket = config.bucket;
    this.client = client ?? new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: !!config.endpoint, // required for MinIO
    });
  }

  async signUpload(
    key: string,
    opts: { contentType: MediaMime; maxBytes: number; expiresInS: number },
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
      ContentLength: opts.maxBytes,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: opts.expiresInS });
    const expiresAt = new Date(Date.now() + opts.expiresInS * 1000);
    return { url, headers: { 'content-type': opts.contentType }, expiresAt };
  }

  async signRead(key: string, expiresInS: number): Promise<{ url: string; expiresAt: Date }> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, { expiresIn: expiresInS });
    const expiresAt = new Date(Date.now() + expiresInS * 1000);
    return { url, expiresAt };
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
      return out;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Creates an S3ObjectStorage from env vars; returns null when S3_BUCKET is unset (dev/test uses FileObjectStorage). */
export function createS3StorageFromEnv(): S3ObjectStorage | null {
  const bucket = process.env['S3_BUCKET'];
  if (!bucket) return null;
  return new S3ObjectStorage({
    bucket,
    region: process.env['S3_REGION'] ?? 'auto',
    endpoint: process.env['S3_ENDPOINT'],
  });
}
