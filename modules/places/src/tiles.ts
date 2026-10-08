import { open, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Logger } from '@iraq-maps/observability';
import { Compression, FetchSource, PMTiles, type Source } from 'pmtiles';

const isUrl = (s: string) => /^https?:\/\//.test(s);
/** Fonts tried per glyph request, so a long fontstack cannot multiply reads. */
const MAX_FONTS = 3;

const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * Fills the `{name}` placeholders of a TILES_SOURCE or GLYPHS_SOURCE template, or null when the result could leave the
 * source. Every value already matches a strict contract regex, so these checks are defence in depth:
 * - a value that is a dot segment (`.` or `..`) is refused;
 * - in a URL, every value is percent-encoded;
 * - a local path must exist and stay inside the directory that holds the template's first placeholder (or its file),
 *   both as written and after resolving symlinks. The real path is returned.
 */
export async function resolveSource(template: string, params: Record<string, string>): Promise<string | null> {
  if (Object.values(params).some((v) => v === '.' || v === '..')) return null;
  const url = isUrl(template);
  const filled = template.replace(/\{(\w+)\}/g, (_, key: string) => (url ? encodeURIComponent(params[key] ?? '') : (params[key] ?? '')));
  if (url) return filled;
  const root = dirname(resolve(`${template.split('{')[0]}_`));
  const path = resolve(filled);
  const real = inside(root, path) && (await Promise.all([realpath(root), realpath(path)]).catch(() => null));
  return real && inside(...real) ? real[1] : null;
}

/** pmtiles Source over a local file: each range is one open + positioned read. */
const fileSource = (path: string): Source => ({
  getKey: () => path,
  async getBytes(offset, length) {
    const file = await open(path, 'r');
    try {
      const { buffer, bytesRead } = await file.read(Buffer.alloc(length), 0, length, offset);
      return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead) };
    } finally {
      await file.close();
    }
  },
});

async function read(src: string): Promise<Buffer | null> {
  if (!isUrl(src)) return readFile(src).catch(() => null);
  const res = await fetch(src, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  return res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
}

interface TileSources {
  TILES_SOURCE?: string;
  GLYPHS_SOURCE?: string;
}

/** The fallback tile and glyph server of ADR-0008. */
export class TileFiles {
  private readonly archives = new Map<string, PMTiles>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly sources: TileSources,
    private readonly log: Logger,
  ) {}

  /** CityDescriptor URLs: a public https source goes to the client directly, anything else through the fallback routes. */
  async urls(city: string): Promise<{ tilesUrl: string; glyphsUrl: string }> {
    const { TILES_SOURCE: tiles, GLYPHS_SOURCE: glyphs } = this.sources;
    return {
      tilesUrl: tiles && isUrl(tiles) ? `pmtiles://${await resolveSource(tiles, { city })}` : `/v1/cities/${city}/tiles/{z}/{x}/{y}`,
      glyphsUrl: glyphs && isUrl(glyphs) ? `${await resolveSource(glyphs, { city })}/{fontstack}/{range}.pbf` : `/v1/cities/${city}/glyphs/{fontstack}/{range}.pbf`,
    };
  }

  /**
   * null: no archive for this city (404). 'empty': the archive has no tile there (204). Otherwise the tile as stored,
   * still gzipped when the archive's tile compression is gzip: the PMTiles decompress hook is the identity for tiles
   * (directories are decompressed by the cache, which keeps its own default).
   */
  async tile(city: string, z: number, x: number, y: number): Promise<{ data: Buffer; gzip: boolean } | 'empty' | null> {
    const src = this.sources.TILES_SOURCE && (await resolveSource(this.sources.TILES_SOURCE, { city }));
    if (!src) return null;
    const archive = this.archives.get(src) ?? new PMTiles(isUrl(src) ? new FetchSource(src) : fileSource(src), undefined, async (data) => data);
    try {
      const tile = await archive.getZxy(z, x, y);
      this.archives.set(src, archive);
      if (!tile) return 'empty';
      return { data: Buffer.from(tile.data), gzip: (await archive.getHeader()).tileCompression === Compression.Gzip };
    } catch (err) {
      // A failed header read stays cached inside the PMTiles instance, so drop it and retry on the next request.
      this.archives.delete(src);
      // Once per city and process: the route is public, so a broken archive would otherwise log on every request.
      if (!this.warned.has(city)) this.log.warn({ city, errorCode: (err as { code?: unknown }).code ?? (err as Error).name }, 'tile source unreadable');
      this.warned.add(city);
      return null;
    }
  }

  /** The first of the first MAX_FONTS fonts of a comma-separated fontstack that has this range. */
  async glyphs(city: string, fontstack: string, range: string): Promise<Buffer | null> {
    if (!this.sources.GLYPHS_SOURCE) return null;
    for (const font of fontstack.split(',').slice(0, MAX_FONTS)) {
      const src = await resolveSource(`${this.sources.GLYPHS_SOURCE}/{fontstack}/{range}`, { city, fontstack: font.trim(), range });
      const data = src && (await read(src));
      if (data) return data;
    }
    return null;
  }
}
