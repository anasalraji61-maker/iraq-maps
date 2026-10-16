import { searchContract } from '@iraq-maps/contracts';
import type { CityId, UserId } from '@iraq-maps/contracts';
import { Controller, Inject, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { SearchService } from './search.service';

export const SEARCH_SERVICE = Symbol('SearchService');

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank', title, status, code },
} as const);

const _rateLimited = problem(429, 'rate_limited', 'Too many requests, try again in a minute');
const unauthorized = problem(401, 'unauthorized', 'Authentication required');

/** Extracts a userId from a Bearer token via the identity module's JWT payload.
 *  In this milestone the integrator wires IdentityAuthGuard; controllers just
 *  read (req as any).user?.sub. */
function extractUserId(req: { user?: { sub?: string } }): string | null {
  return req.user?.sub ?? null;
}

@Controller()
export class SearchController {
  constructor(@Inject(SEARCH_SERVICE) private readonly service: SearchService) {}

  @TsRestHandler(searchContract)
  handle(@Req() req: { ip: string; user?: { sub?: string } }) {
    return tsRestHandler(searchContract, {
      // ------------------------------------------------------------------
      // GET /v1/search
      // ------------------------------------------------------------------
      search: async ({ query }) => {
        const userId = extractUserId(req) as unknown as UserId;
        const { q, limit, cursor, ...filters } = query;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await this.service.search(userId, q, filters as any, {
          limit: limit ?? 20,
          cursor: cursor as string | undefined,
        });

        return { status: 200 as const, body: result };
      },

      // ------------------------------------------------------------------
      // GET /v1/search/suggestions
      // ------------------------------------------------------------------
      suggestions: async ({ query }) => {
        const { q, city, lang, limit } = query;

        const result = await this.service.getAutocompleteSuggestions(
          q,
          lang ?? 'ar',
          city as unknown as CityId,
          limit ?? 5,
        );

        return { status: 200 as const, body: result };
      },

      // ------------------------------------------------------------------
      // GET /v1/search/trending
      // ------------------------------------------------------------------
      trending: async ({ query }) => {
        const { city, limit } = query;

        const result = await this.service.getTrendingSearches(city as unknown as CityId, limit ?? 10);

        return { status: 200 as const, body: result };
      },

      // ------------------------------------------------------------------
      // GET /v1/search/history  (auth required)
      // ------------------------------------------------------------------
      getHistory: async (_args) => {
        const userId = extractUserId(req);
        if (!userId) return unauthorized;

        const history = await this.service.getSearchHistory(userId as unknown as UserId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { status: 200 as const, body: { history } as any };
      },

      // ------------------------------------------------------------------
      // DELETE /v1/search/history  (auth required)
      // ------------------------------------------------------------------
      deleteHistory: async () => {
        const userId = extractUserId(req);
        if (!userId) return unauthorized;

        await this.service.deleteSearchHistory(userId as unknown as UserId);
        return { status: 204 as const, body: undefined };
      },
    });
  }
}
