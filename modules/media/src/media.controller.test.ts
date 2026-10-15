/**
 * MediaController unit tests.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssetId, UserId } from '@iraq-maps/contracts';
import { MediaController } from './media.controller.js';
import type { MediaService } from './media.service.js';

type HandlerFn = (arg: unknown) => Promise<{ status: number; body: unknown }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callMethod(ctrl: any, method: string): HandlerFn {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return ctrl[method]() as HandlerFn;
}

const ASSET_ID = 'asset-001' as AssetId;
const USER_ID = 'user-001' as UserId;

function makeService(): MediaService {
  return {
    createUpload: vi.fn().mockResolvedValue({
      assetId: ASSET_ID,
      uploadUrl: 'https://s3.example.com/upload',
      headers: {},
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    }),
    completeUpload: vi.fn().mockResolvedValue(undefined),
    getAsset: vi.fn().mockResolvedValue({ id: ASSET_ID, status: 'ready' }),
    readUrl: vi.fn().mockResolvedValue('https://s3.example.com/asset-001'),
    readUrlWithSize: vi.fn().mockResolvedValue('https://s3.example.com/asset-001-thumb'),
    resizeAsset: vi.fn().mockResolvedValue('https://s3.example.com/asset-001-medium'),
  } as unknown as MediaService;
}

describe('MediaController', () => {
  let svc: MediaService;
  let ctrl: MediaController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new MediaController(svc);
  });

  it('createUpload returns 201 on success', async () => {
    const h = callMethod(ctrl, 'createUpload');
    const result = await h({ body: { purpose: 'place_photo', mime: 'image/jpeg', size: 1024 } });
    expect(result.status).toBe(201);
    expect(svc.createUpload).toHaveBeenCalledTimes(1);
  });

  it('createUpload returns 400 when service throws BadRequestException', async () => {
    vi.mocked(svc.createUpload).mockRejectedValueOnce(
      new BadRequestException({ code: 'too_large', title: 'File too large' }),
    );
    const h = callMethod(ctrl, 'createUpload');
    const result = await h({ body: { purpose: 'place_photo', mime: 'image/jpeg', size: 50_000_000 } });
    expect(result.status).toBe(400);
  });

  it('completeUpload returns 202 on success', async () => {
    const h = callMethod(ctrl, 'completeUpload');
    const result = await h({ params: { assetId: ASSET_ID } });
    expect(result.status).toBe(202);
    expect(svc.completeUpload).toHaveBeenCalledWith(ASSET_ID);
  });

  it('completeUpload returns 404 when asset not found', async () => {
    vi.mocked(svc.completeUpload).mockRejectedValueOnce(new NotFoundException({ code: 'not_found', title: 'Asset not found' }));
    const h = callMethod(ctrl, 'completeUpload');
    const result = await h({ params: { assetId: ASSET_ID } });
    expect(result.status).toBe(404);
  });

  it('completeUpload returns 409 on conflict', async () => {
    vi.mocked(svc.completeUpload).mockRejectedValueOnce(new ConflictException({ code: 'already_complete', title: 'Already complete' }));
    const h = callMethod(ctrl, 'completeUpload');
    const result = await h({ params: { assetId: ASSET_ID } });
    expect(result.status).toBe(409);
  });

  it('readUrl returns 200 with url', async () => {
    const h = callMethod(ctrl, 'readUrl');
    const result = await h({ params: { assetId: ASSET_ID }, query: {} });
    expect(result.status).toBe(200);
    expect(svc.readUrl).toHaveBeenCalledWith(ASSET_ID);
  });

  it('readUrl returns 404 when asset does not exist', async () => {
    vi.mocked(svc.getAsset).mockResolvedValueOnce(null);
    const h = callMethod(ctrl, 'readUrl');
    const result = await h({ params: { assetId: ASSET_ID }, query: {} });
    expect(result.status).toBe(404);
  });

  it('readUrl returns 409 when asset not ready', async () => {
    vi.mocked(svc.getAsset).mockResolvedValueOnce({ id: ASSET_ID, status: 'processing' } as never);
    const h = callMethod(ctrl, 'readUrl');
    const result = await h({ params: { assetId: ASSET_ID }, query: {} });
    expect(result.status).toBe(409);
  });

  it('readUrl with thumbnail size uses readUrlWithSize', async () => {
    const h = callMethod(ctrl, 'readUrl');
    const result = await h({ params: { assetId: ASSET_ID }, query: { size: 'thumbnail' } });
    expect(result.status).toBe(200);
    expect(svc.readUrlWithSize).toHaveBeenCalledWith(ASSET_ID, 'thumbnail');
  });

  it('fsPut returns 204', async () => {
    const h = callMethod(ctrl, 'fsPut');
    const result = await h({});
    expect(result.status).toBe(204);
  });

  it('fsGet returns 404', async () => {
    const h = callMethod(ctrl, 'fsGet');
    const result = await h({});
    expect(result.status).toBe(404);
  });
});
