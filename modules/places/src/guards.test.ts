import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CityDescriptor, OSM_ATTRIBUTION } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { createLogger } from '@iraq-maps/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ipBucket, RateLimiter } from './http';
import { placesModule } from './index';
import { resolveSource, TileFiles } from './tiles';

describe('RateLimiter', () => {
  it('counts IPv4-mapped IPv6 as its IPv4, and IPv6 by /64', () => {
    expect(ipBucket('::ffff:10.8.8.8')).toBe('10.8.8.8');
    expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe(ipBucket('2001:db8:1:2::ffff'));
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(ipBucket('2001:db8:1:2::1'));
    expect([ipBucket('2001:db8::1'), ipBucket('junk'), ipBucket('also junk')]).toEqual(['2001:db8:0:0::/64', 'unparsable', 'unparsable']);
    const limiter = new RateLimiter(1);
    expect([limiter.allow('10.8.8.8'), limiter.allow('::ffff:10.8.8.8')]).toEqual([true, false]);
  });

  it('opens a new window after a minute, sweeping only expired windows', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 100, () => now);
    limiter.allow('10.0.0.1');
    now = 30_000;
    limiter.allow('10.0.0.2');
    now = 60_000; // the first window has expired, the second has not
    expect(limiter.allow('10.0.0.3')).toBe(true);
    expect(limiter.size).toBe(2);
    expect([limiter.allow('10.0.0.2'), limiter.allow('10.0.0.1')]).toEqual([false, true]);
  });

  it('holds at most maxKeys windows, evicting the oldest, in constant time per request', () => {
    const limiter = new RateLimiter(1, 50_000);
    const ip = (i: number) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
    const start = performance.now();
    for (let i = 0; i < 100_000; i++) limiter.allow(ip(i));
    expect(performance.now() - start).toBeLessThan(10_000); // about 1-2 s; the earlier full sweep per new key took ~36 s
    expect(limiter.size).toBe(50_000);
    expect([limiter.allow(ip(0)), limiter.allow(ip(99_999))]).toEqual([true, false]);
  });
});

describe('placesModule config', () => {
  const load = (env: Record<string, string>) => () => placesModule({ db: {} as Db, env: { APP_ENV: 'test', ...env } });

  it('refuses credentials in a URL source, plain http in production and relative paths, naming only the variable', () => {
    expect(load({ TILES_SOURCE: 'https://user:s3cret@cdn.example/{city}.pmtiles' })).toThrow(/^places config: missing or invalid env vars: TILES_SOURCE$/);
    expect(load({ APP_ENV: 'production', GLYPHS_SOURCE: 'http://cdn.example/glyphs' })).toThrow(/^places config: values not allowed in production for env vars: GLYPHS_SOURCE$/);
    expect(load({ GLYPHS_SOURCE: 'glyphs' })).toThrow(/^places config: missing or invalid env vars: GLYPHS_SOURCE$/);
    expect(load({ APP_ENV: 'production', TILES_SOURCE: 'https://cdn.example/{city}.pmtiles', GLYPHS_SOURCE: '/srv/glyphs' })).not.toThrow();
  });
});

describe('tile and glyph sources', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'places-sources-')));
    await mkdir(join(dir, 'glyphs', 'Font'), { recursive: true });
    await writeFile(join(dir, 'glyphs', 'Font', '0-255.pbf'), 'glyphs');
    await mkdir(join(dir, 'secret'));
    await writeFile(join(dir, 'secret', '0-255.pbf'), 'secret');
    await symlink(join(dir, 'secret'), join(dir, 'glyphs', 'Linked'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('refuses dot segments, paths outside the source, symlinks leading out of it, and missing files', async () => {
    const glyphs = join(dir, 'glyphs', '{fontstack}', '{range}');
    expect(await resolveSource(glyphs, { fontstack: 'Font', range: '0-255.pbf' })).toBe(join(dir, 'glyphs', 'Font', '0-255.pbf'));
    expect(await resolveSource(glyphs, { fontstack: '..', range: '0-255.pbf' })).toBeNull();
    expect(await resolveSource(glyphs, { fontstack: 'Font', range: '../../secret/0-255.pbf' })).toBeNull();
    expect(await resolveSource(glyphs, { fontstack: 'Linked', range: '0-255.pbf' })).toBeNull();
    expect(await resolveSource(glyphs, { fontstack: 'Font', range: '256-511.pbf' })).toBeNull();
    expect(await resolveSource(join(dir, '{city}.pmtiles'), { city: '../etc/x' })).toBeNull();
  });

  it('percent-encodes URL values and refuses dot segments there too', async () => {
    expect(await resolveSource('https://cdn.example/{city}/{fontstack}', { city: 'baghdad', fontstack: '../a b' })).toBe('https://cdn.example/baghdad/..%2Fa%20b');
    expect(await resolveSource('https://cdn.example/{city}/x', { city: '..' })).toBeNull();
  });

  it('hands a public https source to the client directly, in the CityDescriptor URL formats', async () => {
    const urls = await new TileFiles({ TILES_SOURCE: 'https://cdn.example/{city}.pmtiles', GLYPHS_SOURCE: 'https://cdn.example/glyphs' }, createLogger({ name: 'test' })).urls('baghdad');
    expect(urls).toEqual({ tilesUrl: 'pmtiles://https://cdn.example/baghdad.pmtiles', glyphsUrl: 'https://cdn.example/glyphs/{fontstack}/{range}.pbf' });
    const city = { id: 'baghdad', names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' }, bbox: [44, 33, 45, 34], center: [44.4, 33.3] };
    expect(() => CityDescriptor.parse({ ...city, ...urls, attribution: OSM_ATTRIBUTION })).not.toThrow();
  });
});
