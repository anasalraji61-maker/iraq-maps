import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CityDescriptor, OSM_ATTRIBUTION, type CityId, type CityImportRecord, type PlaceId, type PlaceImportRecord } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { captureLogs, createLogger } from '@iraq-maps/observability';
import { placesQueryConformance, randomIp } from '@iraq-maps/testing';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEARCH_PER_MINUTE } from './http';
import { importCity, importFiles } from './import';
import { placesMigrationsDir, placesModule } from './index';
import { PgPlaces } from './query';
import { fillSource, TileFiles } from './tiles';

const logs = captureLogs();
let tdb: TestDatabase;
let app: NestFastifyApplication;
let dir: string;

/** A one-tile PMTiles v3 archive: z0/0/0 holds `tile` (gzip), uncompressed root directory, zooms 0..14. */
function pmtilesArchive(tile: Buffer): Buffer {
  const dir = Buffer.from([1, 0, 1, tile.length, 1]); // 1 entry: tile id 0, run length 1, length, offset 0 (+1)
  const header = Buffer.alloc(127);
  header.write('PMTiles', 0);
  header.writeUInt8(3, 7);
  const fields = [127, dir.length, 127 + dir.length, 0, 0, 0, 127 + dir.length, tile.length, 1, 1, 1];
  fields.forEach((v, i) => header.writeBigUInt64LE(BigInt(v), 8 + 8 * i));
  [1, 2, 1, 0, 14].forEach((v, i) => header.writeUInt8(v, 97 + i)); // internal: none, tiles: gzip, MVT, minzoom, maxzoom
  return Buffer.concat([header, dir, tile]);
}
const MVT = Buffer.from('fixture tile bytes');
const GLYPHS = Buffer.from('fixture glyph bytes');

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: [{ schema: 'places', migrationsDir: placesMigrationsDir }] });
  dir = await mkdtemp(join(tmpdir(), 'places-test-'));
  await writeFile(join(dir, 'baghdad.pmtiles'), pmtilesArchive(gzipSync(MVT)));
  await mkdir(join(dir, 'glyphs', 'Noto Sans Arabic Regular'), { recursive: true });
  await writeFile(join(dir, 'glyphs', 'Noto Sans Arabic Regular', '0-255.pbf'), GLYPHS);
  class TestApp {}
  const env = { APP_ENV: 'test', TILES_SOURCE: join(dir, '{city}.pmtiles'), GLYPHS_SOURCE: join(dir, 'glyphs') };
  app = await NestFactory.create<NestFastifyApplication>({ module: TestApp, imports: [placesModule({ db: tdb.db, env })] }, new FastifyAdapter(), { logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  logs.stop();
  await app?.close();
  await tdb?.drop();
  if (dir) await rm(dir, { recursive: true, force: true });
});

const get = (url: string, remoteAddress = '127.0.0.1') => app.inject({ method: 'GET', url, remoteAddress });

placesQueryConformance('PgPlaces (PostGIS)', () => ({
  port: new PgPlaces(tdb.db),
  seed: async (city, records) => void (await importCity(tdb.db, city, records)),
}));

// Hand-made records, not OSM data. City `testville` keeps them apart from the conformance city.
const city: CityImportRecord = { id: 'testville' as CityId, names: { ar: 'مدينة', ckb: 'شار', en: 'Testville' }, bbox: [44, 33, 45, 34], center: [44.4, 33.3] };
const records: PlaceImportRecord[] = [
  { id: 'n1', kind: 'place', names: { name: 'مطعم الكرخ', en: 'Karkh Grill' }, category: 'food', location: [44.4, 33.3], tags: { website: 'www.no-scheme.example', phone: '0770 000 0000' } },
  { id: 'w2', kind: 'street', names: { name: 'شارع حيفا' }, category: null, location: [44.401, 33.301], tags: {} },
  { id: 'n3', kind: 'area', names: { name: 'الكرخ' }, category: null, location: [44.402, 33.3], tags: {} },
];
const ndjson = (rs: PlaceImportRecord[]) => rs.map((r) => JSON.stringify(r)).join('\n');

describe('import', () => {
  const files = { city: '', input: '' };
  beforeAll(async () => {
    Object.assign(files, { city: join(dir, 'city.json'), input: join(dir, 'places.ndjson') });
    await writeFile(files.city, JSON.stringify(city));
  });
  const count = async () => (await tdb.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM places.osm_features WHERE city_id = ${city.id}`)).rows[0]?.n;

  it('imports NDJSON idempotently: a re-run replaces the city rows without duplicates', async () => {
    await writeFile(files.input, `${ndjson(records)}\n\n`);
    expect(await importFiles(tdb.db, files)).toEqual({ place: 1, street: 1, area: 1 });
    expect(await importFiles(tdb.db, files)).toEqual({ place: 1, street: 1, area: 1 });
    expect(await count()).toBe(3);
    await writeFile(files.input, ndjson(records.slice(0, 2)));
    await importFiles(tdb.db, files);
    expect(await count()).toBe(2);
    await writeFile(files.input, ndjson(records));
    await importFiles(tdb.db, files);
  });

  it('rejects a bad line by its number, and imports nothing', async () => {
    await writeFile(files.input, `${ndjson(records)}\n{"id":"x1","secret":"value"}\n`);
    await expect(importFiles(tdb.db, files)).rejects.toThrow(/^places import: line 4 is not a PlaceImportRecord$/);
    await writeFile(files.input, ndjson(records));
    expect(await count()).toBe(3);
  });

  it('sets the nearest area, folds the article, and drops OSM contacts that break the response contract', async () => {
    const port = new PgPlaces(tdb.db);
    const [hit] = await port.search({ q: 'كرخ', city: city.id, lang: 'ar', limit: 5 });
    expect(hit).toMatchObject({ id: 'n1', area: { name: 'الكرخ' } });
    expect((await port.search({ q: 'حيفا', city: city.id, lang: 'ar', limit: 5 }))[0]).toMatchObject({ id: 'w2', area: { name: 'الكرخ' } });
    expect(await port.getById('n1' as PlaceId)).toMatchObject({ osmContacts: { phone: '0770 000 0000', website: undefined }, hoursRaw: null });
  });
});

describe('pipeline fixture through the CLI (CliContracts.placesImport)', () => {
  it('imports baghdad-mini and finds places, streets and areas by any spelling, ordered by near', async () => {
    const fixture = fileURLToPath(new URL('../../../geo-services/pipeline/tests/fixtures/baghdad-mini/', import.meta.url));
    const { stdout } = await promisify(execFile)('pnpm', ['run', '--silent', 'import', '--city', `${fixture}city.json`, '--input', `${fixture}places.ndjson`], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, APP_ENV: 'test', DATABASE_URL: tdb.url },
    });
    expect(Object.values(JSON.parse(stdout) as Record<string, number>).every((n) => n > 0)).toBe(true);
    const search = async (q: string, near = '') =>
      (await get(`/v1/search?q=${encodeURIComponent(q)}&city=baghdad${near && `&near=${near}`}`)).json().items as { id: string; kind: string }[];
    for (const q of ['اربيل', 'أربيل', 'إربيل']) expect((await search(q))[0]?.id, q).toBe('n101');
    for (const q of ['قلعه', 'قلعة']) expect((await search(q))[0]?.id, q).toBe('n102');
    expect(await search('كرادة')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'n302', kind: 'area' }), expect.objectContaining({ id: 'w1001', kind: 'street' })]));
    expect((await search('شارع ٦٢', '44.43,33.29')).slice(0, 2).map((r) => r.id)).toEqual(['w1004', 'w1003']);
    expect((await search('شارع ٦٢', '44.4,33.32')).slice(0, 2).map((r) => r.id)).toEqual(['w1003', 'w1004']);
    expect((await get('/v1/places/n101')).json()).toMatchObject({ area: { en: 'Karrada' }, osmContacts: { website: 'https://example.com/erbil-restaurant' } });
  }, 30_000);
});

describe('ODbL separation', () => {
  it('places.osm_* tables hold only OSM-derived columns', async () => {
    const { rows } = await tdb.db.execute<{ t: string; c: string }>(sql`
      SELECT table_name AS t, column_name AS c FROM information_schema.columns
      WHERE table_schema = 'places' AND table_name LIKE 'osm\_%' ORDER BY table_name, column_name`);
    // Adding a provider-owned column here (owner, claim, provider phone, photos...) must fail this test: use a separate table.
    const osmDerived = ['area_names', 'category', 'city_id', 'id', 'kind', 'location', 'names', 'opening_hours', 'phone', 'search_text', 'website'];
    expect(rows).toEqual(osmDerived.map((c) => ({ t: 'osm_features', c })));
  });
});

describe('HTTP', () => {
  it('searches, ranks by proximity, and answers 400 for an invalid query', async () => {
    const res = await get(`/v1/search?q=${encodeURIComponent('الكرخ')}&city=testville&near=44.402,33.3`);
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([expect.objectContaining({ id: 'n1', kind: 'place' }), expect.objectContaining({ id: 'n3', kind: 'area', distanceM: 0 })]);
    for (const q of ['', 'x'.repeat(101), '%00'])
      expect((await get(`/v1/search?q=${q}&city=testville`)).statusCode, q).toBe(400);
    expect((await get('/v1/search?q=a&city=Bad_City')).statusCode).toBe(400);
    expect((await get('/v1/search?q=a&city=testville&near=500,33')).statusCode).toBe(400);
  });

  it('serves place details, a 404 Problem for a missing id, and nearby', async () => {
    expect((await get('/v1/places/n1')).json()).toMatchObject({ id: 'n1', source: 'osm', attribution: '© OpenStreetMap contributors' });
    const missing = await get('/v1/places/n424242');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ type: 'about:blank', title: 'No such place', status: 404, code: 'place_not_found' });
    expect((await get('/v1/places/..%2F..')).statusCode).toBe(400);
    const nearby = await get('/v1/places/nearby?city=testville&near=44.4,33.3&radiusM=500');
    expect(nearby.json().items.map((p: { id: string }) => p.id)).toEqual(['n1']);
  });

  it('lists cities with fallback tile and glyph URLs and the OSM attribution', async () => {
    const { items } = (await get('/v1/cities')).json();
    for (const item of items) CityDescriptor.parse(item);
    expect(items).toContainEqual({
      ...city,
      tilesUrl: '/v1/cities/testville/tiles/{z}/{x}/{y}',
      glyphsUrl: '/v1/cities/testville/glyphs/{fontstack}/{range}.pbf',
      attribution: OSM_ATTRIBUTION,
    });
  });

  it(`rate-limits search and nearby to ${SEARCH_PER_MINUTE} per minute per client IP`, async () => {
    const ip = randomIp();
    const url = '/v1/places/nearby?city=testville&near=44.4,33.3';
    const codes = await Promise.all(Array.from({ length: SEARCH_PER_MINUTE }, () => get(url, ip).then((r) => r.statusCode)));
    expect(new Set(codes)).toEqual(new Set([200]));
    const limited = await get(`/v1/search?q=a&city=testville`, ip);
    expect([limited.statusCode, limited.json().code]).toEqual([429, 'rate_limited']);
    expect((await get(url, randomIp())).statusCode).toBe(200);
  });
});

describe('tile and glyph fallback', () => {
  it('serves a stored tile gzipped with MVT headers, 204 for an empty address, 404 without an archive', async () => {
    const res = await get('/v1/cities/baghdad/tiles/0/0/0');
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({ 'content-type': 'application/vnd.mapbox-vector-tile', 'content-encoding': 'gzip' });
    expect(gunzipSync(res.rawPayload)).toEqual(MVT);
    expect((await get('/v1/cities/baghdad/tiles/1/1/1')).statusCode).toBe(204);
    expect((await get('/v1/cities/erbil/tiles/0/0/0')).statusCode).toBe(404);
    expect((await get('/v1/cities/baghdad/tiles/0/1/0')).statusCode).toBe(400);
    expect(logs.text()).not.toContain(dir);
  });

  it('serves glyph ranges, trying each font of the stack, and 404 for a missing range', async () => {
    const res = await get(`/v1/cities/baghdad/glyphs/${encodeURIComponent('Missing Font,Noto Sans Arabic Regular')}/0-255.pbf`);
    expect([res.statusCode, res.headers['content-type']]).toEqual([200, 'application/x-protobuf']);
    expect(res.rawPayload).toEqual(GLYPHS);
    expect((await get(`/v1/cities/baghdad/glyphs/${encodeURIComponent('Noto Sans Arabic Regular')}/256-511.pbf`)).statusCode).toBe(404);
  });

  it('hands a public https source to the client directly, in the CityDescriptor URL formats', () => {
    const urls = new TileFiles({ TILES_SOURCE: 'https://cdn.example/{city}.pmtiles', GLYPHS_SOURCE: 'https://cdn.example/glyphs' }, createLogger({ name: 'test' })).urls('baghdad');
    expect(urls).toEqual({ tilesUrl: 'pmtiles://https://cdn.example/baghdad.pmtiles', glyphsUrl: 'https://cdn.example/glyphs/{fontstack}/{range}.pbf' });
    expect(() => CityDescriptor.parse({ ...city, ...urls, attribution: OSM_ATTRIBUTION })).not.toThrow();
  });

  it('rejects path traversal at the contract and again when resolving the path', async () => {
    for (const url of [
      '/v1/cities/baghdad/glyphs/..%2F..%2F..%2Fetc/0-255.pbf',
      '/v1/cities/baghdad/glyphs/Noto/..%2F..%2Fpasswd',
      '/v1/cities/..%2F..%2Fetc/tiles/0/0/0',
      '/v1/cities/baghdad/glyphs/..%5C..%5Cetc/0-255.pbf',
    ])
      expect((await get(url)).statusCode, url).toBe(400);
    expect((await get('/v1/cities/baghdad/tiles/../../../../etc/passwd')).statusCode).toBe(404);
    expect(fillSource('/srv/glyphs/{fontstack}/{range}', { fontstack: '..', range: '0-255.pbf' })).toBeNull();
    expect(fillSource('/srv/glyphs/{fontstack}/{range}', { fontstack: 'a', range: '../../../etc/passwd' })).toBeNull();
    expect(fillSource('/srv/{city}.pmtiles', { city: '../etc/x' })).toBeNull();
    expect(fillSource('/srv/{city}.pmtiles', { city: 'baghdad' })).toBe('/srv/baghdad.pmtiles');
    expect(fillSource('/srv/glyphs/{fontstack}/{range}', { fontstack: 'Noto Sans', range: '0-255.pbf' })).toBe('/srv/glyphs/Noto Sans/0-255.pbf');
    expect(fillSource('https://cdn.example/{city}/{fontstack}', { city: 'baghdad', fontstack: '../a b' })).toBe('https://cdn.example/baghdad/..%2Fa%20b');
  });
});

describe('search performance sanity', () => {
  const words = ['مطعم', 'صيدلية', 'جامع', 'مدرسة', 'شارع', 'مخبز', 'فندق', 'سوق', 'الرشيد', 'الكرادة', 'المنصور', 'الأعظمية', 'الشفاء', 'النور', 'بغداد', 'السلام', 'الزهراء', 'الأمل'];
  const pick = (i: number, salt: number) => words[(i * salt + salt) % words.length];

  it('uses the trigram index and answers within budget on 20k rows', async () => {
    const perf = { ...city, id: 'perf-city' as CityId };
    const rows: PlaceImportRecord[] = Array.from({ length: 20_000 }, (_, i) => ({
      id: `n${1_000_000 + i}`,
      kind: (['place', 'street', 'area'] as const)[i % 3]!,
      names: { name: `${pick(i, 7)} ${pick(i, 13)} ${i}` },
      category: i % 3 === 0 ? 'food' : null,
      location: [44.2 + (i % 200) / 1000, 33.2 + Math.floor(i / 200) / 1000],
      tags: {},
    }));
    await importCity(tdb.db, perf, rows);
    const { rows: plan } = await tdb.db.execute<{ 'QUERY PLAN': string }>(
      sql`EXPLAIN SELECT id FROM places.osm_features WHERE city_id = 'perf-city' AND ${'قلعه'} <% search_text`,
    );
    expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toContain('osm_features_search_idx');

    const port = new PgPlaces(tdb.db);
    const times: number[] = [];
    let found = 0;
    for (const q of [...words, 'مطعم الرشيد', 'صيدليه الشفا', 'كراده']) {
      for (const near of [undefined, [44.3, 33.25] as [number, number]]) {
        const start = performance.now();
        found += Number((await port.search({ q, city: perf.id, near, lang: 'ar', limit: 20 })).length > 0);
        times.push(performance.now() - start);
      }
    }
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]!;
    expect(found).toBeGreaterThanOrEqual(2 * words.length);
    expect(p95).toBeLessThan(300);
  }, 60_000);
});
