import { BadRequestException, Controller, ConflictException, Inject, NotFoundException } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import {
  mediaContract,
  type MediaMime,
  type MediaPurpose,
  SignedUrlString,
} from '@iraq-maps/contracts';
import type { MediaService } from './media.service.js';

export const MEDIA_SERVICE = 'media:service';

type SignedUrl = typeof SignedUrlString._type;

function problem(status: number, code: string, title: string) {
  return { type: 'about:blank' as const, title, status, code };
}

@Controller()
export class MediaController {
  constructor(@Inject(MEDIA_SERVICE) private readonly svc: MediaService) {}

  @TsRestHandler(mediaContract.createUpload)
  createUpload() {
    return tsRestHandler(mediaContract.createUpload, async ({ body }: { body: { purpose: MediaPurpose; mime: MediaMime; size: number } }) => {
      try {
        const result = await this.svc.createUpload('00000000-0000-0000-0000-000000000000' as import('@iraq-maps/contracts').UserId, body);
        return {
          status: 201 as const,
          body: {
            assetId: result.assetId,
            uploadUrl: result.uploadUrl as SignedUrl,
            headers: result.headers,
            expiresAt: result.expiresAt,
          },
        };
      } catch (e: unknown) {
        if (e instanceof BadRequestException) {
          const r = e.getResponse() as Record<string, unknown>;
          return { status: 400 as const, body: problem(400, String(r['code'] ?? 'bad_request'), String(r['title'] ?? 'Bad request')) };
        }
        throw e;
      }
    });
  }

  @TsRestHandler(mediaContract.completeUpload)
  completeUpload() {
    return tsRestHandler(mediaContract.completeUpload, async ({ params }: { params: { assetId: AssetId } }) => {
      try {
        await this.svc.completeUpload(params.assetId);
        return { status: 202 as const, body: { assetId: params.assetId, status: 'processing' as const } };
      } catch (e: unknown) {
        if (e instanceof NotFoundException) {
          const r = e.getResponse() as Record<string, unknown>;
          return { status: 404 as const, body: problem(404, String(r['code'] ?? 'not_found'), String(r['title'] ?? 'Not found')) };
        }
        if (e instanceof ConflictException) {
          const r = e.getResponse() as Record<string, unknown>;
          return { status: 409 as const, body: problem(409, String(r['code'] ?? 'conflict'), String(r['title'] ?? 'Conflict')) };
        }
        throw e;
      }
    });
  }

  @TsRestHandler(mediaContract.readUrl)
  readUrl() {
    return tsRestHandler(mediaContract.readUrl, async ({ params }: { params: { assetId: AssetId } }) => {
      const asset = await this.svc.getAsset(params.assetId);
      if (!asset) return { status: 404 as const, body: problem(404, 'asset_not_found', 'Asset not found') };
      if (asset.status !== 'ready') return { status: 409 as const, body: problem(409, 'not_ready', 'Asset not ready') };
      const url = await this.svc.readUrl(params.assetId);
      if (!url) return { status: 409 as const, body: problem(409, 'not_ready', 'Asset not ready') };
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      return { status: 200 as const, body: { url: url as SignedUrl, expiresAt } };
    });
  }

  @TsRestHandler(mediaContract.fsPut)
  fsPut() {
    return tsRestHandler(mediaContract.fsPut, async () => {
      return { status: 204 as const, body: undefined };
    });
  }

  @TsRestHandler(mediaContract.fsGet)
  fsGet() {
    return tsRestHandler(mediaContract.fsGet, async () => {
      return { status: 404 as const, body: problem(404, 'not_found', 'Not found') };
    });
  }
}
