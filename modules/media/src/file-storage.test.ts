/**
 * Unit tests for FileObjectStorage and verifySignature.
 * Uses a temp directory to avoid polluting the system.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { FileObjectStorage, verifySignature } from './file-storage';

function makeTmpDir(): string {
  return path.join(os.tmpdir(), `media-test-${crypto.randomBytes(6).toString('hex')}`);
}

describe('verifySignature', () => {
  const SECRET = 'test-secret';

  it('accepts a valid signature for a future expiry', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    // Build a real signature using the same HMAC algorithm as the module
    const sig = crypto.createHmac('sha256', SECRET).update(`GET:abc.jpg:${exp}`).digest('base64url');
    expect(verifySignature(SECRET, 'GET', 'abc.jpg', exp, sig)).toBe(true);
  });

  it('rejects an expired signature (past expiry + buffer)', () => {
    const exp = Math.floor(Date.now() / 1000) - 100;
    const sig = crypto.createHmac('sha256', SECRET).update(`GET:abc.jpg:${exp}`).digest('base64url');
    expect(verifySignature(SECRET, 'GET', 'abc.jpg', exp, sig)).toBe(false);
  });

  it('rejects a tampered signature (same length, wrong bytes)', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    // Build a real-length base64url string but from a wrong HMAC
    const wrongSig = crypto.createHmac('sha256', 'wrong-secret').update(`GET:abc.jpg:${exp}`).digest('base64url');
    expect(verifySignature(SECRET, 'GET', 'abc.jpg', exp, wrongSig)).toBe(false);
  });

  it('rejects a signature for a different method', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = crypto.createHmac('sha256', SECRET).update(`PUT:abc.jpg:${exp}`).digest('base64url');
    // sig was built for PUT but we verify for GET
    expect(verifySignature(SECRET, 'GET', 'abc.jpg', exp, sig)).toBe(false);
  });

  it('rejects a signature for a different key', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = crypto.createHmac('sha256', SECRET).update(`GET:other.jpg:${exp}`).digest('base64url');
    expect(verifySignature(SECRET, 'GET', 'abc.jpg', exp, sig)).toBe(false);
  });
});

describe('FileObjectStorage', () => {
  let storage: FileObjectStorage;

  beforeEach(() => {
    storage = new FileObjectStorage({ dir: makeTmpDir(), secret: 'test-secret' });
  });

  it('has kind fs', () => {
    expect(storage.kind).toBe('fs');
  });

  it('signUpload returns a root-relative /v1/ URL', async () => {
    const result = await storage.signUpload('abc123.jpg', { contentType: 'image/jpeg', maxBytes: 1024, expiresInS: 60 });
    expect(result.url).toMatch(/^\/v1\/media\/fs\/abc123\.jpg\?/);
  });

  it('signUpload returns correct content-type header', async () => {
    const result = await storage.signUpload('abc123.jpg', { contentType: 'image/png', maxBytes: 1024, expiresInS: 60 });
    expect(result.headers['content-type']).toBe('image/png');
  });

  it('signRead returns a root-relative /v1/ URL', async () => {
    const result = await storage.signRead('abc123.jpg', 60);
    expect(result.url).toMatch(/^\/v1\/media\/fs\/abc123\.jpg\?/);
  });

  it('get returns null for a non-existent key', async () => {
    const data = await storage.get('nonexistent.jpg');
    expect(data).toBeNull();
  });

  it('put then get round-trips binary data', async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    await storage.put('test.bin', body, 'application/octet-stream');
    const retrieved = await storage.get('test.bin');
    expect(retrieved).toEqual(body);
  });

  it('delete is idempotent (no error on missing key)', async () => {
    await expect(storage.delete('nonexistent.jpg')).resolves.toBeUndefined();
  });

  it('delete removes a stored file', async () => {
    await storage.put('todelete.bin', new Uint8Array([7, 8, 9]), 'application/octet-stream');
    await storage.delete('todelete.bin');
    const data = await storage.get('todelete.bin');
    expect(data).toBeNull();
  });
});
