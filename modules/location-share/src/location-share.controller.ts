import { locationShareContract } from '@iraq-maps/contracts';
import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { LocationShareService } from './location-share.service';

export const LOCATION_SHARE_SERVICE = Symbol('location share service');

const problem = <S extends number>(status: S, code: string, title: string) =>
  ({ status, body: { type: 'about:blank', title, status, code } }) as const;

@Controller()
export class LocationShareController {
  constructor(@Inject(LOCATION_SHARE_SERVICE) private readonly svc: LocationShareService) {}

  @TsRestHandler(locationShareContract.create)
  createShare() {
    return tsRestHandler(locationShareContract.create, async ({ body }) => {
      const share = await this.svc.create({ ttlHours: body.ttlHours });
      return { status: 201 as const, body: share };
    });
  }

  @TsRestHandler(locationShareContract.get)
  getShare() {
    return tsRestHandler(locationShareContract.get, async ({ params }) => {
      const result = await this.svc.get(params.shareId);
      if (result === null) return problem(404, 'not_found', 'Share not found');
      if (result === 'expired') return problem(410, 'gone', 'Share has expired');
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(locationShareContract.update)
  updateShare() {
    return tsRestHandler(locationShareContract.update, async ({ params, body }) => {
      const [lng, lat] = body.location;
      const result = await this.svc.update({ shareId: params.shareId, lng, lat });
      if (result === null) return problem(404, 'not_found', 'Share not found');
      if (result === 'expired') return problem(410, 'gone', 'Share has expired');
      if (result === 'forbidden') return problem(403, 'forbidden', 'Not the share owner');
      return { status: 200 as const, body: result };
    });
  }
}
