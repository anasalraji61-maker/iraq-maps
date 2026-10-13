import { routesContract } from '@iraq-maps/contracts';
import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { RoutingService } from './service';

export const ROUTING_SERVICE = Symbol('routing service');

const problem = <S extends number>(status: S, code: string, title: string) =>
  ({ status, body: { type: 'about:blank', title, status, code } }) as const;

@Controller()
export class RoutingController {
  constructor(@Inject(ROUTING_SERVICE) private readonly service: RoutingService) {}

  @TsRestHandler(routesContract.create)
  route() {
    return tsRestHandler(routesContract.create, async ({ body }) => {
      try {
        const result = await this.service.route(body);
        if (!result) return problem(404, 'no_route', 'No route between the given points');
        return { status: 200 as const, body: result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('unreachable') || msg.includes('unavailable')) {
          return problem(503, 'routing_unavailable', 'Routing engine is unavailable');
        }
        return problem(503, 'routing_unavailable', 'Routing engine error');
      }
    });
  }
}
