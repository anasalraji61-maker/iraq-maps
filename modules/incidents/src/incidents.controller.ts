import { incidentsContract } from '@iraq-maps/contracts';
import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { IncidentsService } from './incidents.service';

export const INCIDENTS_SERVICE = Symbol('incidents service');

const problem = <S extends number>(status: S, code: string, title: string) =>
  ({ status, body: { type: 'about:blank', title, status, code } }) as const;

@Controller()
export class IncidentsController {
  constructor(@Inject(INCIDENTS_SERVICE) private readonly svc: IncidentsService) {}

  @TsRestHandler(incidentsContract.create)
  createIncident() {
    return tsRestHandler(incidentsContract.create, async ({ body }) => {
      try {
        const [lng, lat] = body.location;
        const incident = await this.svc.create({
          type: body.type,
          lng,
          lat,
          description: body.description,
          ttlHours: body.ttlHours,
        });
        return { status: 201 as const, body: incident };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return problem(400, 'invalid_incident', msg);
      }
    });
  }

  @TsRestHandler(incidentsContract.list)
  listIncidents() {
    return tsRestHandler(incidentsContract.list, async ({ query }) => {
      const incidents = await this.svc.listNear({
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
      });
      return { status: 200 as const, body: { items: incidents } };
    });
  }
}
