import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { ObjectStorage, MediaMime } from '@iraq-maps/contracts';

const TTL_BUFFER_S = 5;

function hmac(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function sign(secret: string, method: string, key: string, expiresAt: Date): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const sig = hmac(secret, `${method}:${key}:${exp}`);
  return `exp=${exp}&sig=${sig}`;
}

export function verifySignature(secret: string, method: string, key: string, exp: number, sig: string): boolean {
  const expected = hmac(secret, `${method}:${key}:${exp}`);
  const now = Math.floor(Date.now() / 1000);
  if (now > exp + TTL_BUFFER_S) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/**
 * Filesystem-backed ObjectStorage for dev/test. Stores blobs in TMP_STORAGE_PATH.
 * Signed URLs are root-relative /v1/media/fs/{key}?exp=...&sig=...
 */
export class FileObjectStorage implements ObjectStorage {
  readonly kind = 'fs' as const;
  private readonly dir: string;
  private readonly secret: string;

  constructor(opts?: { dir?: string; secret?: string }) {
    this.dir = opts?.dir ?? process.env['TMP_STORAGE_PATH'] ?? '/tmp/iraq-maps-media';
    this.secret = opts?.secret ?? process.env['MEDIA_SIGNING_SECRET'] ?? 'dev-secret';
    fs.mkdirSync(this.dir, { recursive: true });
  }

  async signUpload(
    key: string,
    opts: { contentType: MediaMime; maxBytes: number; expiresInS: number },
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + opts.expiresInS * 1000);
    const qs = sign(this.secret, 'PUT', key, expiresAt);
    return {
      url: `/v1/media/fs/${key}?${qs}`,
      headers: { 'content-type': opts.contentType },
      expiresAt,
    };
  }

  async signRead(key: string, expiresInS: number): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + expiresInS * 1000);
    const qs = sign(this.secret, 'GET', key, expiresAt);
    return { url: `/v1/media/fs/${key}?${qs}`, expiresAt };
  }

  async put(key: string, body: Uint8Array, _contentType: string): Promise<void> {
    const dest = path.join(this.dir, key);
    await fsPromises.writeFile(dest, body);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const filePath = path.join(this.dir, key);
    try {
      const buf = await fsPromises.readFile(filePath);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fsPromises.unlink(path.join(this.dir, key));
    } catch {
      // idempotent
    }
  }
}
