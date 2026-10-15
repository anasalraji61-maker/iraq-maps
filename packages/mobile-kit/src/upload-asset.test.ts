/**
 * Unit tests for uploadAsset: mime detection, upload flow (ticket → PUT → confirm).
 * ApiClient and fetch are mocked.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { uploadAsset } from './upload-asset';
import type { ApiClient } from '@iraq-maps/api-client';

const ASSET_ID = '00000000-0000-0000-0000-000000000001' as ReturnType<typeof String> & { _brand: 'AssetId' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function makeApi(overrides?: Partial<{ status: number; confirmStatus: number }>): ApiClient {
  const ticketStatus = overrides?.status ?? 201;
  const confirmStatus = overrides?.confirmStatus ?? 202;
  return {
    media: {
      createUpload: jest.fn(async () => ({
        status: ticketStatus,
        body: { assetId: ASSET_ID, uploadUrl: 'https://s3.example.com/put?sig=x', headers: {}, expiresAt: '2026-10-15T13:00:00.000Z' },
      })),
      completeUpload: jest.fn(async () => ({
        status: confirmStatus,
        body: { assetId: ASSET_ID, status: 'processing' },
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ApiClient;
}

function mockFetch(ok = true, blobSize = 12345): void {
  const blob = { size: blobSize, type: 'image/jpeg' };
  (global.fetch as jest.MockedFunction<AnyFn>) = jest.fn(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('file://')) {
      return { ok: true, blob: async () => blob } as unknown as Response;
    }
    // PUT call
    return { ok, status: ok ? 200 : 500 } as unknown as Response;
  });
}

describe('uploadAsset', () => {
  beforeEach(() => {
    mockFetch();
  });

  it('returns the assetId on a successful upload', async () => {
    const api = makeApi();
    const id = await uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.jpg', purpose: 'provider_photo' });
    expect(id).toBe(ASSET_ID);
  });

  it('detects png mime type from .png extension', async () => {
    const api = makeApi();
    await uploadAsset(api, 'https://api.example.com', { uri: 'file://logo.png', purpose: 'provider_logo' });
    expect(api.media.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ mime: 'image/png' }) }),
    );
  });

  it('detects webp mime type from .webp extension', async () => {
    const api = makeApi();
    await uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.webp', purpose: 'provider_photo' });
    expect(api.media.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ mime: 'image/webp' }) }),
    );
  });

  it('defaults to jpeg for unknown extension', async () => {
    const api = makeApi();
    await uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.bmp', purpose: 'provider_photo' });
    expect(api.media.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ mime: 'image/jpeg' }) }),
    );
  });

  it('throws when ticket request fails', async () => {
    const api = makeApi({ status: 400 });
    await expect(uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.jpg', purpose: 'provider_photo' })).rejects.toThrow('upload ticket failed');
  });

  it('throws when PUT upload fails', async () => {
    mockFetch(false);
    const api = makeApi();
    await expect(uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.jpg', purpose: 'provider_photo' })).rejects.toThrow('PUT upload failed');
  });

  it('throws when confirm upload fails', async () => {
    const api = makeApi({ confirmStatus: 409 });
    await expect(uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.jpg', purpose: 'provider_photo' })).rejects.toThrow('confirm failed');
  });

  it('resolves relative upload URLs against apiBaseUrl', async () => {
    const api: ApiClient = {
      media: {
        createUpload: jest.fn(async () => ({
          status: 201,
          body: { assetId: ASSET_ID, uploadUrl: '/v1/media/fs/abc.jpg', headers: {}, expiresAt: '2026-10-15T13:00:00.000Z' },
        })),
        completeUpload: jest.fn(async () => ({ status: 202, body: { assetId: ASSET_ID, status: 'processing' } })),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as ApiClient;

    await uploadAsset(api, 'https://api.example.com', { uri: 'file://photo.jpg', purpose: 'provider_photo' });
    const putCall = (global.fetch as jest.MockedFunction<AnyFn>).mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any[]) => typeof c[1] === 'object' && c[1]?.method === 'PUT',
    );
    expect(putCall?.[0]).toBe('https://api.example.com/v1/media/fs/abc.jpg');
  });
});
