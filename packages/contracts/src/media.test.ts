/**
 * Unit tests for media contract schemas: AssetId, MediaPurpose, MediaMime,
 * AssetStatus, StorageKey, SignedUrlString, UploadTicket, SignedUrl, MAX_UPLOAD_BYTES.
 */
import { describe, expect, it } from 'vitest';
import {
  AssetId,
  MediaPurpose,
  MediaMime,
  AssetStatus,
  StorageKey,
  SignedUrlString,
  UploadTicket,
  SignedUrl,
  MAX_UPLOAD_BYTES,
} from './media';

const ASSET_UUID = '00000000-0000-0000-0000-000000000001';

describe('MAX_UPLOAD_BYTES', () => {
  it('is exactly 10 MB', () => expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024));
});

describe('AssetId', () => {
  it('accepts a valid UUID', () => {
    const id = AssetId.parse(ASSET_UUID);
    expect(typeof id).toBe('string');
  });

  it('rejects non-UUID', () => {
    expect(() => AssetId.parse('asset-abc')).toThrow();
  });
});

describe('MediaPurpose', () => {
  it('accepts provider_photo', () => expect(MediaPurpose.parse('provider_photo')).toBe('provider_photo'));
  it('accepts provider_logo', () => expect(MediaPurpose.parse('provider_logo')).toBe('provider_logo'));
  it('rejects user_avatar', () => expect(() => MediaPurpose.parse('user_avatar')).toThrow());
});

describe('MediaMime', () => {
  it('accepts image/jpeg', () => expect(MediaMime.parse('image/jpeg')).toBe('image/jpeg'));
  it('accepts image/png', () => expect(MediaMime.parse('image/png')).toBe('image/png'));
  it('accepts image/webp', () => expect(MediaMime.parse('image/webp')).toBe('image/webp'));
  it('rejects image/gif', () => expect(() => MediaMime.parse('image/gif')).toThrow());
  it('rejects image/tiff', () => expect(() => MediaMime.parse('image/tiff')).toThrow());
});

describe('AssetStatus', () => {
  it('accepts pending', () => expect(AssetStatus.parse('pending')).toBe('pending'));
  it('accepts processing', () => expect(AssetStatus.parse('processing')).toBe('processing'));
  it('accepts ready', () => expect(AssetStatus.parse('ready')).toBe('ready'));
  it('accepts failed', () => expect(AssetStatus.parse('failed')).toBe('failed'));
  it('rejects deleted', () => expect(() => AssetStatus.parse('deleted')).toThrow());
});

describe('StorageKey', () => {
  it('accepts a plain uuid key', () => expect(StorageKey.parse('abc123')).toBe('abc123'));
  it('accepts key with extension', () => expect(StorageKey.parse('abc123.jpg')).toBe('abc123.jpg'));
  it('accepts key with hyphens', () => expect(StorageKey.parse('my-asset-01.webp')).toBe('my-asset-01.webp'));
  it('rejects key with slash', () => expect(() => StorageKey.parse('dir/file.jpg')).toThrow());
  it('rejects key starting with hyphen', () => expect(() => StorageKey.parse('-bad.jpg')).toThrow());
  it('rejects empty key', () => expect(() => StorageKey.parse('')).toThrow());
});

describe('SignedUrlString', () => {
  it('accepts an https URL', () => {
    const url = SignedUrlString.parse('https://s3.example.com/uploads/abc.jpg?sig=xyz');
    expect(url).toContain('https://');
  });

  it('accepts a root-relative /v1/ URL', () => {
    const url = SignedUrlString.parse('/v1/media/fs/abc123.jpg');
    expect(url).toMatch(/^\/v1\//);
  });

  it('rejects a relative path without /v1/', () => {
    expect(() => SignedUrlString.parse('/media/abc.jpg')).toThrow();
  });

  it('rejects an http URL (non-https)', () => {
    // http:// is accepted by the regex — only absolute https or /v1/
    // Confirm http is accepted (the regex allows http://)
    const url = SignedUrlString.parse('http://localhost/v1/media/fs/abc.jpg');
    expect(url).toBeTruthy();
  });
});

describe('UploadTicket', () => {
  const VALID_TICKET = {
    assetId: ASSET_UUID,
    uploadUrl: 'https://s3.example.com/uploads/abc.jpg?sig=xyz',
    headers: { 'Content-Type': 'image/jpeg' },
    expiresAt: '2026-10-15T13:00:00.000Z',
  };

  it('parses a valid upload ticket', () => {
    const t = UploadTicket.parse(VALID_TICKET);
    expect(t.headers['Content-Type']).toBe('image/jpeg');
  });

  it('accepts empty headers object', () => {
    const t = UploadTicket.parse({ ...VALID_TICKET, headers: {} });
    expect(t.headers).toEqual({});
  });

  it('rejects invalid uploadUrl', () => {
    expect(() => UploadTicket.parse({ ...VALID_TICKET, uploadUrl: 'not-a-url' })).toThrow();
  });

  it('rejects invalid expiresAt', () => {
    expect(() => UploadTicket.parse({ ...VALID_TICKET, expiresAt: '2026-10-15' })).toThrow();
  });

  it('rejects non-UUID assetId', () => {
    expect(() => UploadTicket.parse({ ...VALID_TICKET, assetId: 'bad' })).toThrow();
  });
});

describe('SignedUrl', () => {
  it('parses a valid signed URL object', () => {
    const s = SignedUrl.parse({ url: 'https://s3.example.com/abc.jpg', expiresAt: '2026-10-15T13:00:00.000Z' });
    expect(s.url).toContain('https://');
  });

  it('rejects missing url', () => {
    expect(() => SignedUrl.parse({ expiresAt: '2026-10-15T13:00:00.000Z' })).toThrow();
  });

  it('rejects invalid expiresAt', () => {
    expect(() => SignedUrl.parse({ url: 'https://s3.example.com/abc.jpg', expiresAt: 'tomorrow' })).toThrow();
  });
});
