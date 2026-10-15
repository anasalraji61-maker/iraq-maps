import { tour3dContract } from '@iraq-maps/contracts';
import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { Tour3DService } from './tour3d.service';

export const TOUR3D_SERVICE = Symbol('Tour3DService');

const problem = <S extends number>(status: S, code: string, title: string) =>
  ({ status, body: { type: 'about:blank', title, status, code } }) as const;

@Controller()
export class Tour3DController {
  constructor(@Inject(TOUR3D_SERVICE) private readonly svc: Tour3DService) {}

  @TsRestHandler(tour3dContract.listScenes)
  listScenes() {
    return tsRestHandler(tour3dContract.listScenes, async ({ query }) => {
      const result = await this.svc.listScenes({
        city: query.city,
        category: query.category,
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
        cursor: query.cursor,
        limit: query.limit,
      });
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(tour3dContract.getScene)
  getScene() {
    return tsRestHandler(tour3dContract.getScene, async ({ params }) => {
      const scene = await this.svc.getScene(params.id);
      if (!scene) return problem(404, 'scene_not_found', 'Scene not found');
      return { status: 200 as const, body: scene };
    });
  }

  @TsRestHandler(tour3dContract.getSceneAssets)
  getSceneAssets() {
    return tsRestHandler(tour3dContract.getSceneAssets, async ({ params, query }) => {
      // Verify scene exists
      const scene = await this.svc.getScene(params.id);
      if (!scene) return problem(404, 'scene_not_found', 'Scene not found');

      const result = await this.svc.getSceneAssets(params.id, query.cursor, query.limit);
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(tour3dContract.createScene)
  createScene() {
    return tsRestHandler(tour3dContract.createScene, async ({ body }) => {
      try {
        const [lng, lat] = body.location;
        const scene = await this.svc.createScene({
          nameAr: body.nameAr,
          nameCkb: body.nameCkb,
          nameEn: body.nameEn,
          descriptionAr: body.descriptionAr,
          lng,
          lat,
          altitude: body.altitude,
          city: body.city,
          category: body.category,
          thumbnailUrl: body.thumbnailUrl,
        });
        return { status: 201 as const, body: scene };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return problem(400, 'invalid_scene', msg);
      }
    });
  }

  @TsRestHandler(tour3dContract.addAsset)
  addAsset() {
    return tsRestHandler(tour3dContract.addAsset, async ({ params, body }) => {
      try {
        const asset = await this.svc.addAsset(params.id, {
          type: body.type,
          url: body.url,
          heading: body.heading,
          pitch: body.pitch,
          altitude: body.altitude,
          sequenceOrder: body.sequenceOrder,
          labelAr: body.labelAr,
          labelEn: body.labelEn,
        });
        if (!asset) return problem(404, 'scene_not_found', 'Scene not found');
        return { status: 201 as const, body: asset };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return problem(400, 'invalid_asset', msg);
      }
    });
  }

  @TsRestHandler(tour3dContract.recordView)
  recordView() {
    return tsRestHandler(tour3dContract.recordView, async ({ params }) => {
      const found = await this.svc.incrementViewCount(params.id);
      if (!found) return problem(404, 'scene_not_found', 'Scene not found');
      return { status: 204 as const, body: undefined };
    });
  }
}
