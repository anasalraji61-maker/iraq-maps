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
        const incident = await this.svc.reportIncident({
          type: body.type,
          severity: body.severity,
          lng,
          lat,
          description: body.description,
          ttlHours: body.ttlHours,
          anonymous: body.anonymous,
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
      const types = query.types
        ? (query.types.split(',').map((s) => s.trim()).filter(Boolean) as Parameters<typeof this.svc.getActiveIncidents>[0]['types'])
        : undefined;
      const incidents = await this.svc.getActiveIncidents({
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
        types,
      });
      return { status: 200 as const, body: { items: incidents } };
    });
  }

  @TsRestHandler(incidentsContract.vote)
  voteIncident() {
    return tsRestHandler(incidentsContract.vote, async ({ params, body }) => {
      try {
        const incident = await this.svc.voteIncident(
          // userId will be injected from auth guard in production;
          // placeholder here – real auth wires req.user.id
          'anonymous',
          params.id,
          body.vote === 'confirm',
        );
        return { status: 200 as const, body: incident };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return problem(404, 'not_found', msg);
        return problem(400, 'vote_failed', msg);
      }
    });
  }

  @TsRestHandler(incidentsContract.leaderboard)
  getLeaderboard() {
    return tsRestHandler(incidentsContract.leaderboard, async ({ query }) => {
      const leaderboard = await this.svc.getTopContributors({
        cityId: query.cityId,
        period: query.period,
      });
      return { status: 200 as const, body: leaderboard };
    });
  }
}
