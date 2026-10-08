import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { citiesContract, Glyphs, OSM_ATTRIBUTION, PlaceDetails, Problem, SearchResult } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// AC#4 on the composed app (createApp). The fixture city is the pipeline's output for the CC0 fixture
// baghdad-mini.osm.xml (geo-services/pipeline/tests/fixtures/baghdad-mini), imported with the places import CLI
// (CliContracts.placesImport) twice, since an import must be idempotent. The tiles and glyphs fallbacks read a
// one-tile PMTiles archive and a glyph directory written here (TILES_SOURCE, GLYPHS_SOURCE).
// Until apps/api wires placesModule, which adds the `places` migrations to moduleMigrations, the suite is skipped.
const wired = moduleMigrations.some((m) => m.schema === 'places');
const fixture = (name: string) => fileURLToPath(new URL(`../../../geo-services/pipeline/tests/fixtures/baghdad-mini/${name}`, import.meta.url));
/** One MVT layer "poi" (version 2, extent 4096) and no features: the protobuf the tile route must hand back. */
const mvt = Uint8Array.of(0x1a, 10, 0x78, 2, 0x0a, 3, ...Buffer.from('poi'), 0x28, 0x80, 0x20);
const glyphs = Uint8Array.of(0x0a, 0x00);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let dir: string;
let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;

describe.skipIf(!wired)('places and cities on the composed API', () => {
  beforeAll(async () => {
    tdb = await createTestDatabase({ modules: moduleMigrations });
    // `run`: a bare `pnpm import` is pnpm's own command.
    const args = ['--filter', '@iraq-maps/places', 'run', 'import', '--city', fixture('city.json'), '--input', fixture('places.ndjson')];
    const importCity = () => promisify(execFile)('pnpm', args, { env: { ...process.env, APP_ENV: 'test', DATABASE_URL: tdb.url } });
    await importCity();
    await importCity();
    dir = await mkdtemp(join(tmpdir(), 'e2e-places-'));
    await writeFile(join(dir, 'baghdad.pmtiles'), pmtiles(gzipSync(mvt)));
    await mkdir(join(dir, 'glyphs', Glyphs.fontstack), { recursive: true });
    await writeFile(join(dir, 'glyphs', Glyphs.fontstack, '0-255.pbf'), glyphs);
    const env = { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl, TILES_SOURCE: join(dir, '{city}.pmtiles'), GLYPHS_SOURCE: join(dir, 'glyphs') };
    app = await createApp({ env, otpSender: new FakeOtpSender() });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await tdb?.drop();
    if (dir) await rm(dir, { recursive: true });
  });

  const get = (url: string) => app.inject({ method: 'GET', url, remoteAddress: randomIp() });
  const search = async (q: string, near?: string) => {
    const res = await get(`/v1/search?${new URLSearchParams({ q, city: 'baghdad', ...(near && { near }) })}`);
    expect(res.statusCode).toBe(200);
    return SearchResult.parse(res.json()).items;
  };
  const city = async () => citiesContract.list.responses[200].parse((await get('/v1/cities')).json()).items.find((c) => c.id === 'baghdad');

  it('folds Arabic spellings to the same top result, once after a re-import', async () => {
    for (const q of ['اربيل', 'أربيل', 'إربيل']) {
      const items = await search(q);
      expect(items[0]?.id).toBe('n101');
      expect(items.filter((p) => p.id === 'n101')).toHaveLength(1);
    }
    for (const q of ['قلعه', 'قلعة']) expect((await search(q))[0]?.id).toBe('n102');
  });

  it('returns streets and areas', async () => {
    expect(await search('الكرادة')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'w1001', kind: 'street', category: null }), expect.objectContaining({ id: 'n302', kind: 'area', category: null })]),
    );
  });

  it('orders equal names by distance from near, with distanceM only when near is given', async () => {
    const [north] = await search('شارع 62', '44.4,33.32');
    const [south] = await search('شارع 62', '44.43,33.29');
    expect([north?.id, south?.id]).toEqual(['w1003', 'w1004']);
    expect(north?.distanceM).toBeLessThan(50);
    expect((await search('شارع 62'))[0]?.distanceM).toBeNull();
  });

  it('GET /v1/places/:id returns the OSM details, and a 404 Problem for a missing id', async () => {
    const res = await get('/v1/places/n101');
    expect(res.statusCode).toBe(200);
    const details = PlaceDetails.parse(res.json());
    expect(details).toMatchObject({ id: 'n101', kind: 'place', category: 'food', hoursRaw: 'Mo-Su 11:00-23:00', source: 'osm' });
    expect(details.osmContacts).toEqual({ phone: '+964 770 100 0101', website: 'https://example.com/erbil-restaurant' });
    expect(details.attribution).toContain(OSM_ATTRIBUTION);
    const missing = await get('/v1/places/n999999999');
    expect([missing.statusCode, Problem.parse(missing.json()).status]).toEqual([404, 404]);
  });

  it('answers an invalid query with a 400 Problem', async () => {
    for (const query of ['q=&city=baghdad', `q=${'ب'.repeat(101)}&city=baghdad`, 'q=x&city=baghdad&near=44.4', 'q=x&city=Baghdad']) {
      const res = await get(`/v1/search?${encodeURI(query)}`);
      expect([res.statusCode, Problem.parse(res.json()).status]).toEqual([400, 400]);
    }
  });

  it('GET /v1/cities describes the city with the fallback tilesUrl and glyphsUrl and the OSM attribution', async () => {
    expect(await city()).toMatchObject({
      names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' },
      bbox: [44.22, 33.2, 44.55, 33.45],
      tilesUrl: expect.stringContaining('/v1/cities/baghdad/tiles/{z}/{x}/{y}'),
      glyphsUrl: expect.stringMatching(/\/v1\/cities\/baghdad\/glyphs\/\{fontstack\}\/\{range\}\.pbf$/),
      attribution: expect.stringContaining(OSM_ATTRIBUTION),
    });
  });

  it('the tiles fallback at the descriptor tilesUrl serves the MVT from TILES_SOURCE', async () => {
    const { tilesUrl } = (await city())!;
    const tile = (z: number, x: number, y: number) => get(new URL(tilesUrl.replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`), 'http://api').pathname);
    const res = await tile(0, 0, 0);
    expect([res.statusCode, res.headers['content-type']]).toEqual([200, expect.stringMatching(/^application\/vnd\.mapbox-vector-tile/)]);
    const body = res.rawPayload;
    const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body; // gzip magic, else the bare protobuf
    expect(raw[0]).toBe(0x1a); // field 3 (layers), length-delimited: a Tile message
    expect(new Uint8Array(raw)).toEqual(mvt);
    expect((await tile(14, 10_000, 6_000)).statusCode).toBe(204); // a valid address the archive has no tile for
    expect((await tile(0, 1, 0)).statusCode).toBe(400); // outside zoom 0
  });

  it('the glyphs fallback serves GLYPHS_SOURCE ranges and refuses paths outside it', async () => {
    const { glyphsUrl } = (await city())!;
    const res = await get(new URL(glyphsUrl.replace('{fontstack}', encodeURIComponent(Glyphs.fontstack)).replace('{range}', '0-255'), 'http://api').pathname);
    expect([res.statusCode, res.headers['content-type']]).toEqual([200, expect.stringMatching(/^application\/x-protobuf/)]);
    expect(new Uint8Array(res.rawPayload)).toEqual(glyphs);
    expect((await get('/v1/cities/baghdad/glyphs/..%2F..%2F..%2Fetc/0-255.pbf')).statusCode).toBe(400);
  });
});

/**
 * PMTiles v3 (spec: github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md) holding `tile` (gzipped MVT) at 0/0/0:
 * a 127-byte header, an uncompressed root directory with one entry, empty metadata, then the tile.
 */
function pmtiles(tile: Uint8Array): Buffer {
  const root = Buffer.from([1, 0, 1, tile.length, 1]); // entries, tile id 0, run length 1, length (< 128), offset 0 + 1
  const meta = Buffer.from('{}');
  const header = Buffer.alloc(127);
  header.write('PMTiles\x03', 'latin1');
  const [rootAt, metaAt, dataAt] = [127, 127 + root.length, 127 + root.length + meta.length];
  // root, metadata, leaf directories and tile data (offset, length), then addressed tiles, tile entries, tile contents
  [rootAt, root.length, metaAt, meta.length, dataAt, 0, dataAt, tile.length, 1, 1, 1].forEach((n, i) => header.writeBigUInt64LE(BigInt(n), 8 + 8 * i));
  header.set([1, 1, 2, 1, 0, 0], 96); // clustered, directories uncompressed, tiles gzip, type MVT, zooms 0..0
  return Buffer.concat([header, root, meta, tile]);
}
