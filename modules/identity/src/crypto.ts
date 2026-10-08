import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from 'node:crypto';

/** Keyed hash (HMAC-SHA256, hex) used for phone lookup and for stored OTP codes. */
export const mac = (key: string, data: string): string => createHmac('sha256', key).update(data).digest('hex');

/** AES-256-GCM; output is base64(iv | tag | ciphertext). */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function decrypt(key: Buffer, stored: string): string {
  const raw = Buffer.from(stored, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export const randomCode = (): string => randomInt(1_000_000).toString().padStart(6, '0');
