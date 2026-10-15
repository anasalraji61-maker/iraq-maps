/**
 * Unit tests for FakeObjectStorage and objectStorageConformance.
 */
import { describe, expect, it } from 'vitest';
import { FakeObjectStorage, objectStorageConformance } from './media';

describe('FakeObjectStorage', () => {
  it('has kind fake', () => {
    const storage = new FakeObjectStorage();
    expect(storage.kind).toBe('fake');
  });

  it('get returns null for a non-existent key', async () => {
    const storage = new FakeObjectStorage();
    expect(await storage.get('nonexistent.jpg')).toBeNull();
  });

  it('put then get round-trips binary data', async () => {
    const storage = new FakeObjectStorage();
    const body = new Uint8Array([1, 2, 3, 4]);
    await storage.put('test.bin', body, 'application/octet-stream');
    expect(await storage.get('test.bin')).toEqual(body);
  });

  it('delete removes the stored object', async () => {
    const storage = new FakeObjectStorage();
    await storage.put('todelete.jpg', new Uint8Array([5, 6, 7]), 'image/jpeg');
    await storage.delete('todelete.jpg');
    expect(await storage.get('todelete.jpg')).toBeNull();
  });

  it('delete is idempotent (no error for missing key)', async () => {
    const storage = new FakeObjectStorage();
    await expect(storage.delete('missing.jpg')).resolves.toBeUndefined();
  });

  it('signUpload returns a URL and content-type header', async () => {
    const storage = new FakeObjectStorage();
    const result = await storage.signUpload('photo.jpg', { contentType: 'image/jpeg', maxBytes: 1024, expiresInS: 60 });
    expect(result.url).toBeTruthy();
    expect(result.headers['content-type']).toBe('image/jpeg');
  });

  it('signUpload expiresAt is in the future', async () => {
    const storage = new FakeObjectStorage();
    const result = await storage.signUpload('photo.jpg', { contentType: 'image/jpeg', maxBytes: 1024, expiresInS: 60 });
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('signRead returns a URL with future expiresAt', async () => {
    const storage = new FakeObjectStorage();
    const result = await storage.signRead('photo.jpg', 120);
    expect(result.url).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

objectStorageConformance('FakeObjectStorage', () => new FakeObjectStorage());
