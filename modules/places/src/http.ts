import { citiesContract, OSM_ATTRIBUTION, placesContract } from '@iraq-maps/contracts';
import { Controller, HttpException, Inject, Req, Res } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import ipaddr from 'ipaddr.js';
import type { PgPlaces } from './query';
import type { TileFiles } from './tiles';

export const INTERNALS = Symbol('places internals');
interface Internals {
  places: PgPlaces;
  tiles: TileFiles;
  limiter: RateLimiter;
  tileLimiter: RateLimiter;
}

/** Per client network and minute: generous for debounced typing and the 200-query bench, small enough to stop a scraper. */
export const SEARCH_PER_MINUTE = 300;
/** Tiles and glyphs: a map screen loads a few dozen tiles per pan or zoom, and clients cache them for a day. */
export const TILES_PER_MINUTE = 1200;
const WINDOW_MS = 60_000;

/** The client network a limit counts: an IPv4 address (IPv4-mapped IPv6 included) or an IPv6 /64, one subscriber line. */
export function ipBucket(ip: string): string {
  if (!ipaddr.isValid(ip)) return 'unparsable'; // e.g. a junk X-Forwarded-For hop: all such requests share one budget
  const addr = ipaddr.process(ip);
  return addr.kind() === 'ipv4' ? addr.toString() : `${addr.toNormalizedString().split(':').slice(0, 4).join(':')}::/64`;
}

/**
 * A one-minute window per client network, opened by its first hit. In memory: the MVP runs one API instance.
 * Every window lasts the same time and a renewed one is re-inserted, so Map order is expiry order: the sweep stops at
 * the first live window (O(expired)), and at `maxKeys` the oldest window is evicted.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { hits: number; resetAt: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly maxKeys = 100_000,
    private readonly now = Date.now,
  ) {}

  allow(ip: string): boolean {
    const key = ipBucket(ip);
    const now = this.now();
    for (const [k, w] of this.windows) {
      if (w.resetAt > now) break;
      this.windows.delete(k);
    }
    const window = this.windows.get(key);
    if (window) return ++window.hits <= this.perMinute;
    if (this.windows.size >= this.maxKeys) this.windows.delete(this.windows.keys().next().value!);
    this.windows.set(key, { hits: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  get size(): number {
    return this.windows.size;
  }
}

const problem = <S extends number>(status: S, code: string, title: string) => ({ status, body: { type: 'about:blank', title, status, code } });
const rateLimited = problem(429, 'rate_limited', 'Too many requests, try again in a minute');
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
    return tsRestHandler(citiesContract.list, async () => {
      const cities = await places.listCities();
      return { status: 200, body: { items: await Promise.all(cities.map(async (city) => ({ ...city, ...(await tiles.urls(city.id)), attribution: OSM_ATTRIBUTION }))) } };
    });
  }

  // Single-route handlers: ts-rest's multi-route handler drops @Res passthrough, and Nest then never answers.
  @TsRestHandler(citiesContract.tile)
  tile(@Req() req: { ip: string }, @Res({ passthrough: true }) reply: Reply) {
    return tsRestHandler(citiesContract.tile, async ({ params: { id, z, x, y } }) => {
      const tile = (await this.knownCity(req.ip, id)) ? await this.internals.tiles.tile(id, z, x, y) : null;
      if (!tile) return notFound;
      if (tile === 'empty') return { status: 204, body: undefined };
      reply.header('cache-control', CACHE);
      if (tile.gzip) reply.header('content-encoding', 'gzip');
      return { status: 200, body: tile.data };
    });
  }

  @TsRestHandler(citiesContract.glyphs)
  glyphs(@Req() req: { ip: string }, @Res({ passthrough: true }) reply: Reply) {
    return tsRestHandler(citiesContract.glyphs, async ({ params: { id, fontstack, range } }) => {
      const data = (await this.knownCity(req.ip, id)) ? await this.internals.tiles.glyphs(id, fontstack, range) : null;
      if (!data) return notFound;
      reply.header('cache-control', CACHE);
      return { status: 200, body: data };
    });
  }

  /**
   * Tiles and glyphs: their own per-network budget, then the city registry before any source is touched.
   * The frozen routes declare no 429, so it is thrown (ProblemFilter keeps the Problem body); see the contract request.
   */
  private async knownCity(ip: string, city: string): Promise<boolean> {
    if (!this.internals.tileLimiter.allow(ip)) throw new HttpException(rateLimited.body, 429);
    return this.internals.places.hasCity(city);
  }
}
