import { citiesContract, OSM_ATTRIBUTION, placesContract } from '@iraq-maps/contracts';
import { Controller, Inject, Req, Res } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { PgPlaces } from './query';
import type { TileFiles } from './tiles';

export const INTERNALS = Symbol('places internals');
interface Internals {
  places: PgPlaces;
  tiles: TileFiles;
  limiter: RateLimiter;
}

/** Per client IP: generous for debounced typing and the 200-query bench, small enough to stop a scraper. */
export const SEARCH_PER_MINUTE = 300;

/** A one-minute window per key, opened by its first hit. In memory: the MVP runs one API instance. */
export class RateLimiter {
  private readonly windows = new Map<string, { hits: number; resetAt: number }>();

  constructor(private readonly perMinute: number) {}

  allow(key: string): boolean {
    const now = Date.now();
    const window = this.windows.get(key);
    if (window && window.resetAt > now) return ++window.hits <= this.perMinute;
    if (this.windows.size >= 10_000) for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    this.windows.set(key, { hits: 1, resetAt: now + 60_000 });
    return true;
  }
}

const problem = <S extends number>(status: S, code: string, title: string) => ({ status, body: { type: 'about:blank', title, status, code } });
const rateLimited = problem(429, 'rate_limited', 'Too many searches, try again in a minute');
const notFound = problem(404, 'not_found', 'Not found');
const CACHE = 'public, max-age=86400';
type Reply = { header(name: string, value: string): unknown };

/** Public routes (no token): the integrator lists them in IdentityAuthGuard's exemptions. */
@Controller()
export class PlacesController {
  constructor(@Inject(INTERNALS) private readonly internals: Internals) {}

  @TsRestHandler(placesContract)
  places(@Req() req: { ip: string }) {
    const { places, limiter } = this.internals;
    return tsRestHandler(placesContract, {
      search: async ({ query }) => (limiter.allow(req.ip) ? { status: 200, body: { items: await places.search(query) } } : rateLimited),
      nearby: async ({ query }) => (limiter.allow(req.ip) ? { status: 200, body: { items: await places.nearby(query) } } : rateLimited),
      get: async ({ params }) => {
        const place = await places.getById(params.id);
        return place ? { status: 200, body: place } : problem(404, 'place_not_found', 'No such place');
      },
    });
  }

  @TsRestHandler(citiesContract.list)
  cities() {
    const { places, tiles } = this.internals;
    return tsRestHandler(citiesContract.list, async () => ({
      status: 200,
      body: { items: (await places.listCities()).map((city) => ({ ...city, ...tiles.urls(city.id), attribution: OSM_ATTRIBUTION })) },
    }));
  }

  // Single-route handlers: ts-rest's multi-route handler drops @Res passthrough, and Nest then never answers.
  @TsRestHandler(citiesContract.tile)
  tile(@Res({ passthrough: true }) reply: Reply) {
    return tsRestHandler(citiesContract.tile, async ({ params: { id, z, x, y } }) => {
      const tile = await this.internals.tiles.tile(id, z, x, y);
      if (!tile) return notFound;
      if (tile === 'empty') return { status: 204, body: undefined };
      reply.header('cache-control', CACHE);
      if (tile.gzip) reply.header('content-encoding', 'gzip');
      return { status: 200, body: tile.data };
    });
  }

  @TsRestHandler(citiesContract.glyphs)
  glyphs(@Res({ passthrough: true }) reply: Reply) {
    return tsRestHandler(citiesContract.glyphs, async ({ params }) => {
      const data = await this.internals.tiles.glyphs(params.id, params.fontstack, params.range);
      if (!data) return notFound;
      reply.header('cache-control', CACHE);
      return { status: 200, body: data };
    });
  }
}
