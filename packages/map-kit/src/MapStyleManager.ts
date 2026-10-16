/**
 * MapStyleManager – build, switch and customise MapLibre style objects.
 *
 * Styles available:
 *   default   – standard vector map (from buildStyle in style.ts)
 *   night     – dark-mode vector map
 *   satellite – satellite imagery with vector labels
 *   terrain   – terrain/hillshade variant
 *   minimal   – labels-only, minimal roads
 *
 * All label layers respect the user's chosen locale (Arabic-primary, RTL).
 *
 * @public frozen stub (M4)
 */

import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Locale } from '@iraq-maps/contracts';
import { buildStyle, type StyleSource } from './style';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MapStyleName = 'default' | 'night' | 'satellite' | 'terrain' | 'minimal';

export interface StyleManagerOptions {
  apiBaseUrl: string;
  locale: Locale;
  /** Satellite tile URL (our backend or pmtiles://), required for satellite style. */
  satelliteUrl?: string;
}

export interface StyleOverride {
  /** Layers to add on top of the base style. */
  extraLayers?: LayerSpecification[];
  /** Layer paint/layout overrides keyed by layer id. */
  layerOverrides?: Record<string, { paint?: Record<string, unknown>; layout?: Record<string, unknown> }>;
  /** Extra GeoJSON or raster sources to inject. */
  extraSources?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Colour palettes
// ---------------------------------------------------------------------------

const NIGHT_PALETTE = {
  background: '#1a1b1e',
  landuse: '#22242a',
  water: '#1a3a5c',
  building: '#2a2d35',
  roadCasing: '#333740',
  roadMotorway: '#c8912a',
  roadTrunk: '#c8912a',
  roadPrimary: '#55606e',
  roadSecondary: '#444b55',
  roadOther: '#3a4048',
  label: '#c8cdd3',
  labelHalo: 'rgba(26,27,30,0.85)',
};

// ---------------------------------------------------------------------------
// Style builders
// ---------------------------------------------------------------------------

/**
 * Builds a night/dark-mode style by taking the base style and repainting
 * background, landuse, water and road layers with the night palette.
 */
function buildNightStyle(lang: Locale, source: StyleSource): StyleSpecification {
  const base = buildStyle(lang, source, null);

  const repaint = (id: string, paint: Record<string, unknown>): LayerSpecification | undefined => {
    const layer = base.layers.find((l) => l.id === id);
    if (!layer) return undefined;
    return { ...layer, paint: { ...(layer as { paint?: unknown }).paint, ...paint } } as LayerSpecification;
  };

  const patchedLayers: LayerSpecification[] = base.layers.map((layer) => {
    switch (layer.id) {
      case 'background':
        return repaint('background', { 'background-color': NIGHT_PALETTE.background }) ?? layer;
      case 'landuse':
        return repaint('landuse', { 'fill-color': NIGHT_PALETTE.landuse }) ?? layer;
      case 'water':
        return repaint('water', { 'fill-color': NIGHT_PALETTE.water }) ?? layer;
      case 'waterway':
        return repaint('waterway', { 'line-color': NIGHT_PALETTE.water }) ?? layer;
      case 'building':
        return repaint('building', { 'fill-color': NIGHT_PALETTE.building, 'fill-outline-color': '#33363e' }) ?? layer;
      case 'road-casing':
        return repaint('road-casing', { 'line-color': NIGHT_PALETTE.roadCasing }) ?? layer;
      case 'road':
        return repaint('road', { 'line-color': NIGHT_PALETTE.roadOther }) ?? layer;
      case 'road-label':
        return repaint('road-label', { 'text-color': NIGHT_PALETTE.label, 'text-halo-color': NIGHT_PALETTE.labelHalo }) ?? layer;
      case 'poi-label':
        return repaint('poi-label', { 'text-color': NIGHT_PALETTE.label, 'text-halo-color': NIGHT_PALETTE.labelHalo }) ?? layer;
      case 'place-label':
        return repaint('place-label', { 'text-color': NIGHT_PALETTE.label, 'text-halo-color': NIGHT_PALETTE.labelHalo }) ?? layer;
      default:
        return layer;
    }
  });

  return { ...base, layers: patchedLayers };
}

/**
 * Minimal style – only roads and labels; no landuse or POI dots.
 */
function buildMinimalStyle(lang: Locale, source: StyleSource): StyleSpecification {
  const base = buildStyle(lang, source, null);
  const keep = new Set(['background', 'water', 'waterway', 'road-casing', 'road', 'road-label', 'place-label', 'boundary']);
  return { ...base, layers: base.layers.filter((l) => keep.has(l.id)) };
}

/**
 * Terrain style – adds a hillshade layer from our own raster DEM source.
 */
function buildTerrainStyle(lang: Locale, source: StyleSource, demUrl: string | null): StyleSpecification {
  const base = buildStyle(lang, source, null);
  if (!demUrl) return base;

  const hillshadeLayer: LayerSpecification = {
    id: 'hillshade',
    type: 'hillshade',
    source: 'dem',
    paint: {
      'hillshade-exaggeration': 0.5,
      'hillshade-illumination-anchor': 'viewport',
    },
  };

  // Insert hillshade just above the background layer
  const bgIdx = base.layers.findIndex((l) => l.id === 'background');
  const layers = [...base.layers];
  layers.splice(bgIdx + 1, 0, hillshadeLayer);

  return {
    ...base,
    sources: {
      ...base.sources,
      dem: {
        type: 'raster-dem',
        url: demUrl,
        tileSize: 512,
        maxzoom: 14,
      },
    },
    layers,
    terrain: { source: 'dem', exaggeration: 1.2 },
  };
}

// ---------------------------------------------------------------------------
// MapStyleManager class
// ---------------------------------------------------------------------------

export class MapStyleManager {
  private options: StyleManagerOptions;
  private source: StyleSource;
  private currentStyle: MapStyleName = 'default';
  private customLayers: LayerSpecification[] = [];
  private demUrl: string | null = null;

  constructor(source: StyleSource, options: StyleManagerOptions) {
    this.source = source;
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Return the full MapLibre StyleSpecification for a named style. */
  build(name: MapStyleName, override: StyleOverride = {}): StyleSpecification {
    this.currentStyle = name;
    let spec = this.buildBase(name);
    spec = this.applyOverride(spec, override);
    return spec;
  }

  /** Re-build the current style (e.g. after locale change). */
  rebuild(override: StyleOverride = {}): StyleSpecification {
    return this.build(this.currentStyle, override);
  }

  /** Change the locale and return a new style. */
  setLocale(locale: Locale): this {
    this.options = { ...this.options, locale };
    return this;
  }

  /** Change the satellite URL. */
  setSatelliteUrl(url: string | null): this {
    this.options = { ...this.options, satelliteUrl: url ?? undefined };
    return this;
  }

  /** Set the raster DEM URL for terrain hillshade. */
  setDemUrl(url: string | null): this {
    this.demUrl = url;
    return this;
  }

  /** True when the current style has a satellite base layer. */
  get isSatellite(): boolean {
    return this.currentStyle === 'satellite';
  }

  /** True when the current style is a dark/night style. */
  get isDark(): boolean {
    return this.currentStyle === 'night';
  }

  /**
   * Build a custom style JSON by composing layer toggles.
   * Layers not in the keep-set are removed from the base style.
   */
  buildCustom(keepLayerIds: Set<string>, extraLayers: LayerSpecification[] = []): StyleSpecification {
    const base = buildStyle(this.options.locale, this.source, this.options.satelliteUrl ?? null);
    const filtered = base.layers.filter((l) => keepLayerIds.has(l.id));
    return { ...base, layers: [...filtered, ...extraLayers] };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildBase(name: MapStyleName): StyleSpecification {
    const { locale, satelliteUrl } = this.options;
    switch (name) {
      case 'default':
        return buildStyle(locale, this.source, null);
      case 'night':
        return buildNightStyle(locale, this.source);
      case 'satellite':
        return buildStyle(locale, this.source, satelliteUrl ?? null);
      case 'terrain':
        return buildTerrainStyle(locale, this.source, this.demUrl);
      case 'minimal':
        return buildMinimalStyle(locale, this.source);
    }
  }

  private applyOverride(spec: StyleSpecification, override: StyleOverride): StyleSpecification {
    let { layers, sources } = spec;

    if (override.extraSources) {
      sources = { ...sources, ...override.extraSources };
    }

    if (override.layerOverrides) {
      layers = layers.map((layer) => {
        const ov = override.layerOverrides![layer.id];
        if (!ov) return layer;
        return {
          ...layer,
          paint: { ...(layer as { paint?: unknown }).paint, ...ov.paint },
          layout: { ...(layer as { layout?: unknown }).layout, ...ov.layout },
        } as LayerSpecification;
      });
    }

    if (override.extraLayers?.length) {
      layers = [...layers, ...override.extraLayers];
    }

    return { ...spec, sources, layers };
  }
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

export function createStyleManager(source: StyleSource, options: StyleManagerOptions): MapStyleManager {
  return new MapStyleManager(source, options);
}
