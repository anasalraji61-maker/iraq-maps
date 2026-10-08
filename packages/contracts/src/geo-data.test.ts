import { describe, expect, it } from 'vitest';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CityDescriptor, CityImportRecord, PlaceImportRecord, SearchQuery, TileSchema, apiContract, pickName } from './index';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const jsonSchema = (schema: Parameters<typeof zodToJsonSchema>[0]) => json(zodToJsonSchema(schema, { $refStrategy: 'none' }));

describe('M1 geo-data contracts', () => {
  // The Python pipeline and the Java profile read these files; the tests fail when they drift from the TS source.
  it('schemas/*.json are the exports of the TS contracts', async () => {
    await expect(jsonSchema(PlaceImportRecord)).toMatchFileSnapshot('../schemas/place-import-record.schema.json');
    await expect(jsonSchema(CityImportRecord)).toMatchFileSnapshot('../schemas/city-import-record.schema.json');
    await expect(json(TileSchema)).toMatchFileSnapshot('../schemas/tile-schema.json');
  });

  it('labels fall back name:<lang>, name:ar, name:ckb, then name', () => {
    const names = { name: 'n', ar: 'a', ckb: 'k' };
    expect(pickName(names, 'en')).toBe('a');
    expect(pickName(names, 'ckb')).toBe('k');
    expect(pickName({ name: 'n', en: 'e' }, 'ar')).toBe('n');
  });

  it('bounds the search query and parses near as lng,lat', () => {
    const ok = SearchQuery.parse({ q: ' قلعه ', city: 'baghdad', near: '44.36,33.31', limit: '5' });
    expect(ok).toEqual({ q: 'قلعه', city: 'baghdad', near: [44.36, 33.31], lang: 'ar', limit: 5 });
    const base = { q: 'a', city: 'baghdad' };
    for (const bad of [{ q: '' }, { q: 'x'.repeat(101) }, { q: 'a\u0000' }, { near: '200,10' }, { limit: 51 }, { city: '../x' }]) {
      expect(SearchQuery.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });

  it('accepts only tile and glyph URL templates in a city descriptor', () => {
    const city = { id: 'baghdad', names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' }, bbox: [44.22, 33.2, 44.55, 33.45], center: [44.36, 33.31], attribution: '©' };
    const urls = (tilesUrl: string, glyphsUrl = '/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf') => CityDescriptor.safeParse({ ...city, tilesUrl, glyphsUrl }).success;
    expect(urls('/v1/cities/baghdad/tiles/{z}/{x}/{y}')).toBe(true);
    expect(urls('pmtiles://https://cdn.example/baghdad.pmtiles')).toBe(true);
    expect(urls('javascript:alert(1)')).toBe(false);
    expect(urls('/v1/cities/baghdad/tiles/{z}/{x}/{y}', 'file:///etc/{fontstack}/{range}.pbf')).toBe(false);
  });

  it('rejects glyph ranges that are not 256-aligned', () => {
    const params = apiContract.cities.glyphs.pathParams;
    const parse = (range: string) => params.safeParse({ id: 'baghdad', fontstack: 'Noto Sans Arabic Regular', range }).success;
    expect(parse('1536-1791.pbf')).toBe(true);
    expect(parse('1536-1792.pbf')).toBe(false);
    expect(parse('../../x.pbf')).toBe(false);
  });
});
