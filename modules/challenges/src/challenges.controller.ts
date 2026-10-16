import {
  type AuthPrincipal,
  type UserId,
  challengesV2Contract,
  adminChallengesV2Contract,
} from '@iraq-maps/contracts';
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { ChallengesService } from './challenges.service';

interface AuthedRequest {
  principal?: AuthPrincipal;
  headers: Record<string, string | string[] | undefined>;
}

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank' as const, title, status, code },
});

function locale(req: AuthedRequest): 'ar' | 'en' {
  const raw = req.headers['accept-language'];
  const lang = Array.isArray(raw) ? raw[0] : raw;
  return lang?.startsWith('en') ? 'en' : 'ar';
}

@Controller()
export class ChallengesController {
  constructor(private readonly svc: ChallengesService) {}

  @TsRestHandler(challengesV2Contract)
  handle(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId as UserId | undefined;
    const loc = locale(req);

    return tsRestHandler(challengesV2Contract, {
      listChallenges: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.getActiveChallenges(userId, {
          status: query.status,
          kind: query.kind,
          cityId: query.cityId,
          featured: query.featured,
          cursor: query.cursor,
          limit: query.limit,
          locale: loc,
        });
        return { status: 200, body: result };
      },

      getChallengeDetail: async ({ params, query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const result = await this.svc.getChallengeDetail(
            params.challengeId,
            userId,
            query.leaderboardLimit,
            loc,
          );
          return { status: 200, body: result };
        } catch (e: unknown) {
          if ((e as Error).message?.includes('not found')) {
            return problem(404, 'not_found', 'Challenge not found') as never;
          }
          throw e;
        }
      },

      updateProgress: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const result = await this.svc.updateProgress(userId, params.challengeId, body.increment);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          if (msg.includes('not found')) return problem(404, 'not_found', msg) as never;
          return problem(400, 'bad_request', msg) as never;
        }
      },

      claimReward: async ({ params }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const result = await this.svc.claimReward(userId, params.challengeId);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          if (msg.includes('not found')) return problem(404, 'not_found', msg) as never;
          if (msg.toLowerCase().includes('already')) return problem(409, 'already_claimed', msg) as never;
          return problem(400, 'bad_request', msg) as never;
        }
      },

      getMyCompletedChallenges: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.getMyCompletedChallenges(userId, {
          cursor: query.cursor,
          limit: query.limit,
          locale: loc,
        });
        return { status: 200, body: result };
      },

      getTopParticipants: async ({ params, query }) => {
        try {
          const result = await this.svc.getTopParticipants(params.challengeId, query.limit);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          if (msg.includes('not found')) return problem(404, 'not_found', msg) as never;
          throw e;
        }
      },
    });
  }

  @TsRestHandler(adminChallengesV2Contract)
  handleAdmin(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId as UserId | undefined;
    const roles = req.principal?.roles ?? [];
    const loc = locale(req);

    const requireAdmin = () => {
      if (!userId) return problem(401, 'unauthorized', 'Authentication required');
      if (!roles.includes('admin') && !roles.includes('moderator')) return problem(403, 'forbidden', 'Admin only');
      return null;
    };

    return tsRestHandler(adminChallengesV2Contract, {
      listChallengesAdmin: async ({ query }) => {
        const guard = requireAdmin();
        if (guard) return guard as never;
        const result = await this.svc.listChallengesAdmin({
          status: query.status,
          cursor: query.cursor,
          limit: query.limit,
          locale: loc,
        });
        return { status: 200, body: result };
      },

      createChallenge: async ({ body }) => {
        const guard = requireAdmin();
        if (guard) return guard as never;
        try {
          const result = await this.svc.createChallenge(userId!, body, loc);
          return { status: 201, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          return problem(400, 'bad_request', msg) as never;
        }
      },

      updateChallenge: async ({ params, body }) => {
        const guard = requireAdmin();
        if (guard) return guard as never;
        try {
          const result = await this.svc.updateChallenge(params.challengeId, body, loc);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          if (msg.includes('not found')) return problem(404, 'not_found', msg) as never;
          return problem(400, 'bad_request', msg) as never;
        }
      },

      forceComplete: async ({ params }) => {
        const guard = requireAdmin();
        if (guard) return guard as never;
        try {
          const result = await this.svc.forceComplete(userId!, params.challengeId, params.userId);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          if (msg.includes('not found')) return problem(404, 'not_found', msg) as never;
          throw e;
        }
      },

      getChallengeAnalytics: async ({ params }) => {
        const guard = requireAdmin();
        if (guard) return guard as never;
        try {
          const result = await this.svc.getChallengeAnalytics(params.challengeId);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = (e as Error).message ?? '';
          if (msg.includes('not found')) return problem(404, 'not_found', msg) as never;
          throw e;
        }
      },
    });
  }
}
