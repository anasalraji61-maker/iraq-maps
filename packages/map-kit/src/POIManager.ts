/**
 * POIManager – POI icon catalogue, priority system and custom marker factory.
 *
 * - Maps PlaceCategory → SVG / emoji icon.
 * - Assigns a zoom-threshold (minZoom) so important POIs appear earlier.
 * - Builds MapLibre symbol layer expressions for icon-image.
 * - Provides a `MarkerFactory` that creates custom HTML/SVG marker elements
 *   for React Native MapLibre (passed as renderToImage blobs).
 *
 * @public frozen stub (M4)
 */

import type { PlaceCategory, PlaceSummary } from '@iraq-maps/contracts';

// ---------------------------------------------------------------------------
// Icon catalogue
// ---------------------------------------------------------------------------

/**
 * Maps a PlaceCategory to a Unicode emoji (used as a text-field symbol
 * in MapLibre or as a React Native Text icon).
 */
export const CATEGORY_EMOJI: Partial<Record<PlaceCategory, string>> & Record<string, string> = {
  food: '🍽️',
  cafe: '☕',
  lodging: '🏨',
  shopping: '🛍️',
  tourism: '🗺️',
  health: '🏥',
  finance: '🏦',
  fuel: '⛽',
  office: '🏢',
  worship: '🕌',
  education: '🏫',
  government: '🏛️',
  transport: '🚌',
  entertainment: '🎭',
  // Extended
  pharmacy: '💊',
  atm: '🏧',
  parking: '🅿️',
  supermarket: '🏪',
  bakery: '🥖',
  fastfood: '🌮',
  park: '🌳',
  sport: '⚽',
  hospital: '🏥',
  clinic: '🩺',
  hotel: '🏩',
  hostel: '🛏️',
  unknown: '📍',
};

/** Icon image id registered in the MapLibre map – matches the category. */
export function categoryImageId(category: PlaceCategory | string | undefined): string {
  const cat = category ?? 'unknown';
  return `poi-${cat}`;
}

// ---------------------------------------------------------------------------
// Priority / minZoom system
// ---------------------------------------------------------------------------

/**
 * Categories that should appear at low zoom levels (high-importance).
 * Lower priority number = appears at lower zoom = more important.
 */
const CATEGORY_MIN_ZOOM: Partial<Record<PlaceCategory, number>> & Record<string, number> = {
  health: 12,
  fuel: 12,
  transport: 12,
  government: 12,
  education: 13,
  finance: 13,
  food: 14,
  cafe: 14,
  lodging: 14,
  shopping: 14,
  pharmacy: 14,
  worship: 14,
  tourism: 14,
  entertainment: 15,
  parking: 15,
};

const DEFAULT_MIN_ZOOM = 15;

/** Returns the minimum zoom at which a POI of the given category is shown. */
export function poiMinZoom(category: PlaceCategory | string | undefined): number {
  return CATEGORY_MIN_ZOOM[category ?? ''] ?? DEFAULT_MIN_ZOOM;
}

/**
 * Builds a MapLibre match expression that maps 'class' (OSM feature class)
 * to the minimum zoom, for use with `minzoom` override per feature.
 */
export function buildPoiMinZoomExpression(categories: string[]): unknown[] {
  const pairs = categories.flatMap((c) => [c, poiMinZoom(c)]);
  return ['match', ['get', 'category'], ...pairs, DEFAULT_MIN_ZOOM];
}

// ---------------------------------------------------------------------------
// Symbol layer spec
// ---------------------------------------------------------------------------

/**
 * Build the MapLibre symbol layer specification for the POI source.
 * Requires icon images to be pre-loaded via map.loadImage() for each category.
 */
export function buildPoiSymbolLayerSpec(sourceId: string) {
  return {
    id: 'custom-poi-icons',
    type: 'symbol' as const,
    source: sourceId,
    minzoom: 12,
    layout: {
      'icon-image': [
        'coalesce',
        ['image', ['concat', 'poi-', ['get', 'category']]],
        ['image', 'poi-unknown'],
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 14, 0.8, 16, 1.0],
      'icon-allow-overlap': false,
      'icon-anchor': 'bottom',
      'text-field': [
        'step',
        ['zoom'],
        '',
        14, ['coalesce', ['get', 'nameAr'], ['get', 'name'], ''],
      ],
      'text-font': ['NotoSans Arabic Regular'],
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 0.5],
      'text-max-width': 8,
      'text-optional': true,
    },
    paint: {
      'text-color': '#1f2328',
      'text-halo-color': 'rgba(255,255,255,0.92)',
      'text-halo-width': 1.5,
    },
  };
}

// ---------------------------------------------------------------------------
// Circle fallback layer (when icons aren't loaded)
// ---------------------------------------------------------------------------

export function buildPoiCircleFallbackLayerSpec(sourceId: string) {
  return {
    id: 'custom-poi-circles',
    type: 'circle' as const,
    source: sourceId,
    minzoom: 13,
    paint: {
      'circle-radius': 5,
      'circle-color': '#8a6d4b',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
    },
  };
}

// ---------------------------------------------------------------------------
// Marker factory
// ---------------------------------------------------------------------------

export interface MarkerOptions {
  category: PlaceCategory | string;
  label?: string;
  /** Whether to add a "selected/active" ring. */
  selected?: boolean;
  /** Accent colour override (hex). */
  color?: string;
}

/**
 * Returns an SVG string for a map pin that can be rasterised into a
 * MapLibre icon image via a canvas or a React Native SVG renderer.
 *
 * The pin is 40×52 px and has a coloured circle (category colour) with
 * an emoji icon in the centre, and a pointed tail at the bottom.
 */
export function buildMarkerSvg(opts: MarkerOptions): string {
  const color = opts.color ?? categoryColor(opts.category);
  const emoji = CATEGORY_EMOJI[opts.category] ?? '📍';
  const ring = opts.selected
    ? `<circle cx="20" cy="20" r="19" fill="none" stroke="#ffffff" stroke-width="3"/>`
    : '';
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" viewBox="0 0 40 52">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <circle cx="20" cy="20" r="18" fill="${color}"/>
    ${ring}
    <polygon points="14,34 26,34 20,50" fill="${color}"/>
  </g>
  <text x="20" y="26" text-anchor="middle" font-size="16" dominant-baseline="middle">${emoji}</text>
</svg>`.trim();
}

/**
 * Returns a simple colour associated with a category (for markers and chips).
 */
export function categoryColor(category: PlaceCategory | string | undefined): string {
  const MAP: Record<string, string> = {
    food: '#ef5350',
    cafe: '#8d6e63',
    lodging: '#ab47bc',
    shopping: '#ec407a',
    tourism: '#42a5f5',
    health: '#ef5350',
    finance: '#26a69a',
    fuel: '#ff7043',
    education: '#5c6bc0',
    worship: '#66bb6a',
    transport: '#26c6da',
    government: '#78909c',
    entertainment: '#ffca28',
    pharmacy: '#66bb6a',
    atm: '#26a69a',
    parking: '#78909c',
  };
  return MAP[category ?? ''] ?? '#8a6d4b';
}

// ---------------------------------------------------------------------------
// POI GeoJSON builder
// ---------------------------------------------------------------------------

export interface PoiFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    nameAr?: string;
    name?: string;
    category: string;
    minZoom: number;
    color: string;
  };
}

export function buildPoiFeature(place: PlaceSummary): PoiFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
    properties: {
      id: place.id,
      nameAr: place.nameAr,
      name: place.name,
      category: place.category ?? 'unknown',
      minZoom: poiMinZoom(place.category),
      color: categoryColor(place.category),
    },
  };
}

export function buildPoiGeoJSON(places: PlaceSummary[]): {
  type: 'FeatureCollection';
  features: PoiFeature[];
} {
  return { type: 'FeatureCollection', features: places.map(buildPoiFeature) };
}

// ---------------------------------------------------------------------------
// POIManager class
// ---------------------------------------------------------------------------

export class POIManager {
  private places: PlaceSummary[] = [];

  /** Replace the full POI set. */
  setPlaces(places: PlaceSummary[]): this {
    this.places = places;
    return this;
  }

  /** Return GeoJSON for all POIs. */
  toGeoJSON() {
    return buildPoiGeoJSON(this.places);
  }

  /** Return GeoJSON filtered by category. */
  filterByCategory(categories: string[]) {
    const set = new Set(categories);
    return buildPoiGeoJSON(this.places.filter((p) => set.has(p.category ?? '')));
  }

  /** Return GeoJSON for POIs visible at a given zoom level. */
  filterByZoom(zoom: number) {
    return buildPoiGeoJSON(this.places.filter((p) => poiMinZoom(p.category) <= zoom));
  }

  /** Find a POI by id. */
  getById(id: string): PlaceSummary | undefined {
    return this.places.find((p) => p.id === id);
  }

  /** Build the SVG string for a given place. */
  markerSvg(place: PlaceSummary, selected = false): string {
    return buildMarkerSvg({
      category: place.category ?? 'unknown',
      label: place.nameAr ?? place.name,
      selected,
    });
  }
}

export function createPOIManager(): POIManager {
  return new POIManager();
}
