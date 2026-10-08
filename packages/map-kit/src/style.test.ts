import { describe, expect, it } from '@jest/globals';
import { CityDescriptor, Glyphs, Locale, OSM_ATTRIBUTION, TileSchema } from '@iraq-maps/contracts';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildStyle, resolveSource, type StyleSource } from './style';

const API = 'http://10.0.2.2:3000';
const xyz: StyleSource = { tilesUrl: `${API}/v1/cities/baghdad/tiles/{z}/{x}/{y}`, glyphsUrl: `${API}/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf` };
const pmtiles: StyleSource = { ...xyz, tilesUrl: 'pmtiles://https://data.example.org/baghdad.pmtiles' };

/** Calls fn on every array (expression) nested anywhere in v. */
const visit = (v: unknown, fn: (e: readonly unknown[]) => void): void => {
  if (Array.isArray(v)) {
    fn(v);
    v.forEach((x) => visit(x, fn));
  } else if (v && typeof v === 'object') Object.values(v).forEach((x) => visit(x, fn));
};

describe('resolveSource', () => {
  const descriptor = (tilesUrl: string, glyphsUrl: string) =>
    CityDescriptor.parse({ id: 'baghdad', names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' }, bbox: [44.2, 33.2, 44.6, 33.5], center: [44.37, 33.31], tilesUrl, glyphsUrl, attribution: OSM_ATTRIBUTION });
  const relative = descriptor('/v1/cities/baghdad/tiles/{z}/{x}/{y}', '/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf');

  it('resolves root-relative URLs against the API base URL, with or without trailing slashes', () => {
    expect(resolveSource(relative, API)).toEqual(xyz);
    expect(resolveSource(relative, `${API}/`)).toEqual(xyz);
    expect(resolveSource(relative, 'https://api.example.org/base//')).toEqual({
      tilesUrl: 'https://api.example.org/base/v1/cities/baghdad/tiles/{z}/{x}/{y}',
      glyphsUrl: 'https://api.example.org/base/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf',
    });
  });

  it('passes absolute and pmtiles:// URLs through', () => {
    expect(resolveSource(descriptor(pmtiles.tilesUrl, pmtiles.glyphsUrl), 'https://other.example')).toEqual(pmtiles);
    expect(resolveSource(descriptor(xyz.tilesUrl, xyz.glyphsUrl), 'https://other.example')).toEqual(xyz);
  });
});

describe('buildStyle', () => {
  const symbolLayers = (lang: Locale) => buildStyle(lang, xyz).layers.filter((l) => l.type === 'symbol');

  it.each<[Locale, string[]]>([
    ['ar', ['name:ar', 'name:ckb']],
    ['ckb', ['name:ckb', 'name:ar']],
    ['en', ['name:en', 'name:ar', 'name:ckb']],
  ])('labels %s as coalesce(%j..., name) on every symbol layer', (lang, fields) => {
    expect(symbolLayers(lang).length).toBeGreaterThanOrEqual(3);
    for (const layer of symbolLayers(lang)) expect(layer.layout?.['text-field']).toEqual(['coalesce', ...fields.map((f) => ['get', f]), ['get', 'name']]);
  });

  it('sets Glyphs.fontstack, a legible halo and the descriptor glyphs URL', () => {
    for (const layer of symbolLayers('ar')) {
      expect(layer.layout?.['text-font']).toEqual([Glyphs.fontstack]);
      expect(layer.paint).toMatchObject({ 'text-color': '#1f2328', 'text-halo-width': 1.5 });
    }
    expect(buildStyle('ar', xyz).glyphs).toBe(xyz.glyphsUrl);
  });

  it.each<[Locale, string, StyleSource]>(Locale.options.flatMap((lang) => [[lang, 'pmtiles://', pmtiles], [lang, 'XYZ', xyz]]))(
    'passes style-spec validation with zero errors (%s, %s)',
    (lang, _kind, source) => {
      expect(validateStyleMin(buildStyle(lang, source))).toEqual([]);
    },
  );

  it('reads pmtiles:// as a TileJSON url and XYZ as tiles with the TileSchema zoom range', () => {
    expect(buildStyle('ar', pmtiles).sources).toEqual({ city: { type: 'vector', url: pmtiles.tilesUrl, attribution: OSM_ATTRIBUTION } });
    expect(buildStyle('ar', xyz).sources).toEqual({
      city: { type: 'vector', tiles: [xyz.tilesUrl], minzoom: TileSchema.minZoom, maxzoom: TileSchema.maxZoom, attribution: OSM_ATTRIBUTION },
    });
  });

  it('draws every TileSchema layer and references only its fields and classes', () => {
    const drawn = new Set<string>();
    for (const layer of buildStyle('en', xyz).layers) {
      if (layer.type === 'background') continue;
      const name = layer['source-layer'] as keyof typeof TileSchema.layers;
      expect(layer.source).toBe('city');
      expect(Object.keys(TileSchema.layers)).toContain(name);
      drawn.add(name);
      visit(layer, (e) => {
        if (e[0] === 'get') expect(TileSchema.fields).toContain(e[1]);
        if (e[0] === 'match') expect(e.slice(2, -1).filter((_, i) => i % 2 === 0)).toEqual(TileSchema.layers[name].classes);
      });
    }
    expect([...drawn].sort()).toEqual(Object.keys(TileSchema.layers).sort());
  });
});
