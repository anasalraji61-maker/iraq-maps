import type { AuthPrincipal, UserId } from '@iraq-maps/contracts';
import { reputationContract } from '@iraq-maps/contracts';
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { ReputationService } from './reputation.service';

interface AuthedRequest {
  principal?: AuthPrincipal;
}

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: {
    type: 'about:blank' as const,
    title,
    status,
    code,
  },
});

@Controller()
export class ReputationController {
  constructor(private readonly svc: ReputationService) {}

  @TsRestHandler(reputationContract)
  handle(@Req() req: AuthedRequest) {
    const currentUserId = req.principal?.userId as UserId | undefined;

    return tsRestHandler(reputationContract, {
      getReputation: async ({ params }) => {
        const summary = await this.svc.getReputation(params.userId as UserId);
        return { status: 200, body: summary as never };
      },

      getMyReputation: async () => {
        if (!currentUserId)
          return problem(401, 'unauthorized', 'Authentication required') as never;
        const summary = await this.svc.getReputation(currentUserId);
        return { status: 200, body: summary as never };
      },

      getUserBadges: async ({ params }) => {
        const badges = await this.svc.getUserBadges(params.userId as UserId);
        return { status: 200, body: { items: badges as never[] } };
      },

      getPointsHistory: async ({ params, query }) => {
        if (!currentUserId)
          return problem(401, 'unauthorized', 'Authentication required') as never;
        // Only the user can view their own history
        if (params.userId !== (currentUserId as string))
          return problem(403, 'forbidden', 'Forbidden') as never;
        const result = await this.svc.getPointsHistory(params.userId as UserId, {
          limit: query.limit,
          cursor: query.cursor,
        });
        return { status: 200, body: result as never };
      },

      getLeaderboard: async ({ query }) => {
        const result = await this.svc.getLeaderboard(
          query.city,
          query.category ?? 'overall',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query.period as any,
          { limit: query.limit },
        );
        return { status: 200, body: result as never };
      },

      getMyRank: async ({ query }) => {
        if (!currentUserId)
          return problem(401, 'unauthorized', 'Authentication required') as never;
        const rank = await this.svc.getMyRank(
          currentUserId,
          query.city,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query.period as any,
        );
        if (!rank) return { status: 200, body: { rank: null, periodPoints: 0 } as never };
        return { status: 200, body: rank as never };
      },
    });
  }
}
