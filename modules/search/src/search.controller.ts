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

      // ------------------------------------------------------------------
      // POST /v1/search/nlp
      // ------------------------------------------------------------------
      nlpSearch: async ({ body }) => {
        const userId = extractUserId(req) as unknown as UserId | null;
        const { query, near, city, lang, limit } = body;

        let lat: number | undefined;
        let lng: number | undefined;
        if (near) {
          const parts = near.split(',').map(Number);
          if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
            [lng, lat] = parts as [number, number];
          }
        }

        const result = await this.service.searchWithNLP(
          userId,
          query,
          { lat, lng, city: city as unknown as CityId },
          lang ?? 'ar',
          limit ?? 20,
        );

        return { status: 200 as const, body: result };
      },

      // ------------------------------------------------------------------
      // GET /v1/search/autocomplete
      // ------------------------------------------------------------------
      autocomplete: async ({ query }) => {
        const userId = extractUserId(req) as unknown as UserId | null;
        const { q, lat, lng, city, lang, limit } = query;

        const result = await this.service.autocomplete(
          q,
          lat,
          lng,
          city as unknown as CityId,
          userId,
          lang ?? 'ar',
          limit ?? 8,
        );

        return { status: 200 as const, body: result };
      },

      // ------------------------------------------------------------------
      // GET /v1/search/suggested  (auth required)
      // ------------------------------------------------------------------
      suggestedSearches: async ({ query }) => {
        const userId = extractUserId(req);
        if (!userId) return unauthorized;

        const { lat, lng, limit } = query;

        const suggestions = await this.service.getSuggestedSearches(
          userId as unknown as UserId,
          lat,
          lng,
          undefined,
          limit ?? 10,
        );

        return { status: 200 as const, body: { suggestions } };
      },

      // ------------------------------------------------------------------
      // POST /v1/search/alerts  (auth required)
      // ------------------------------------------------------------------
      saveAlert: async ({ body }) => {
        const userId = extractUserId(req);
        if (!userId) return unauthorized;

        // Alert persistence lives in a future milestone. Return a stub UUID for now.
        // The real implementation will insert into search.search_alerts and trigger a BullMQ job.
        const stubId = `00000000-0000-0000-0000-${Date.now().toString().padStart(12, '0')}`;
        void body; // silence lint until implemented
        return { status: 201 as const, body: { alertId: stubId } };
      },

      // ------------------------------------------------------------------
      // DELETE /v1/search/alerts/:alertId  (auth required)
      // ------------------------------------------------------------------
      deleteAlert: async ({ params }) => {
        const userId = extractUserId(req);
        if (!userId) return unauthorized;

        void params; // stub — real deletion in future milestone
        return { status: 204 as const, body: undefined };
      },
    });
  }
}
