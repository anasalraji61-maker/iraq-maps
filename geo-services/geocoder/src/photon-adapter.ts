/**
 * Photon geocoder HTTP adapter for Iraq Smart Maps.
 *
 * Photon is an open-source geocoder based on OpenStreetMap data.
 * We run our own self-hosted Photon instance (see geo-services/README.md).
 *
 * Docs: https://photon.komoot.io/
 * License: Apache 2.0 (server); data © OpenStreetMap (ODbL)
 *
 * Iraq bbox: 29.0–37.5 N, 38.5–48.8 E
 * We always pass location_bias_scale to boost Iraqi results.
 *
 * Never use tile.openstreetmap.org or any other OSM tile endpoint here.
 * Attribution: "Map data © OpenStreetMap contributors"
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single Photon result feature (GeoJSON). */
export interface PhotonFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: PhotonProperties;
}

export interface PhotonProperties {
  osm_id?: number;
  osm_type?: 'N' | 'W' | 'R';
  osm_key?: string;
  osm_value?: string;
  name?: string;
  /** Street name */
  street?: string;
  housenumber?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
  /** Neighbourhood or suburb */
  suburb?: string;
  postcode?: string;
  /** Localised name (Arabic when lang=ar) */
  'name:ar'?: string;
  'name:en'?: string;
  extent?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

/** Photon FeatureCollection response. */
export interface PhotonResponse {
  type: 'FeatureCollection';
  features: PhotonFeature[];
}

/** Structured geocode result (independent of Photon internals). */
export interface GeoPoint {
  lat: number;
  lon: number;
  /** Display name — Arabic preferred. */
  nameAr: string;
  nameEn?: string;
  /** Short place description for search results. */
  description?: string;
  /** Country ISO code. */
  countryCode?: string;
  /** Whether this result is inside Iraq. */
  inIraq: boolean;
  /** Confidence 0–1; higher = better match. */
  confidence: number;
  /** Source attribution. */
  attribution: 'Map data © OpenStreetMap contributors';
  /** Raw Photon properties for further processing. */
  raw: PhotonProperties;
  /** OSM ID prefix: "n", "w", or "r". */
  osmId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Iraq bounding box [minLon, minLat, maxLon, maxLat]. */
export const IRAQ_BBOX: [number, number, number, number] = [38.5, 29.0, 48.8, 37.5];
/** Default Photon base URL (local instance). Override via PHOTON_BASE_URL env var. */
const DEFAULT_PHOTON_URL = 'http://localhost:2322';

const ATTRIBUTION = 'Map data © OpenStreetMap contributors' as const;

// ---------------------------------------------------------------------------
// Photon adapter
// ---------------------------------------------------------------------------

export interface PhotonAdapterOptions {
  /** Base URL of the Photon instance. Default: http://localhost:2322 */
  baseUrl?: string;
  /** Request timeout in milliseconds. Default: 5000 */
  timeoutMs?: number;
  /** Max results to fetch. Default: 10 */
  limit?: number;
  /** Preferred language for display names. Default: "ar" */
  lang?: string;
}

export class PhotonAdapter {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly defaultLimit: number;
  private readonly lang: string;

  constructor(opts: PhotonAdapterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env['PHOTON_BASE_URL'] ?? DEFAULT_PHOTON_URL).replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.defaultLimit = opts.limit ?? 10;
    this.lang = opts.lang ?? 'ar';
  }

  // -------------------------------------------------------------------------
  // Forward geocode: text → coordinates
  // -------------------------------------------------------------------------

  /**
   * Forward geocode a query string, optionally biased near a coordinate.
   *
   * @param query  Search text (Arabic or English).
   * @param near   Optional [lat, lon] bias point.
   * @param limit  Max results.
   */
  async geocode(
    query: string,
    near?: [number, number],
    limit?: number,
  ): Promise<GeoPoint[]> {
    const url = this.buildForwardUrl(query, near, limit ?? this.defaultLimit);
    const response = await this.fetch(url);
    return response.features.map((f) => this.featureToGeoPoint(f, query));
  }

  /**
   * Reverse geocode a coordinate to an address.
   *
   * @param lat  Latitude.
   * @param lon  Longitude.
   */
  async reverse(lat: number, lon: number): Promise<GeoPoint | null> {
    const url = this.buildReverseUrl(lat, lon);
    const response = await this.fetch(url);
    if (response.features.length === 0) return null;
    return this.featureToGeoPoint(response.features[0], '');
  }

  // -------------------------------------------------------------------------
  // URL builders
  // -------------------------------------------------------------------------

  private buildForwardUrl(
    query: string,
    near: [number, number] | undefined,
    limit: number,
  ): string {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(limit, 50)),
      lang: this.lang,
      // Boost Iraq results by providing the center of Iraq as bias
      lat: near ? String(near[0]) : '33.3',
      lon: near ? String(near[1]) : '44.4',
      location_bias_scale: '0.5',
    });
    // Restrict to Iraq using bounding box
    // Photon supports bbox as minLon,minLat,maxLon,maxLat
    params.set('bbox', IRAQ_BBOX.join(','));
    return `${this.baseUrl}/api?${params.toString()}`;
  }

  private buildReverseUrl(lat: number, lon: number): string {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      lang: this.lang,
    });
    return `${this.baseUrl}/reverse?${params.toString()}`;
  }

  // -------------------------------------------------------------------------
  // HTTP fetch with timeout
  // -------------------------------------------------------------------------

  private async fetch(url: string): Promise<PhotonResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'IraqSmartMaps/1.0 (geo-services; ODbL)',
        },
      });
      if (!res.ok) {
        throw new PhotonError(`Photon HTTP ${res.status}: ${res.statusText}`, res.status);
      }
      const json = (await res.json()) as PhotonResponse;
      return json;
    } catch (err) {
      if (err instanceof PhotonError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new PhotonError('Photon request timed out', 408);
      }
      throw new PhotonError(`Photon fetch error: ${String(err)}`, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Feature → GeoPoint conversion
  // -------------------------------------------------------------------------

  private featureToGeoPoint(feature: PhotonFeature, query: string): GeoPoint {
    const props = feature.properties;
    const [lon, lat] = feature.geometry.coordinates;

    const nameAr =
      props['name:ar'] ??
      props.name ??
      props.street ??
      query;

    const nameEn = props['name:en'] ?? props.name;

    // Build description from city + state
    const descParts: string[] = [];
    if (props.suburb) descParts.push(props.suburb);
    if (props.city) descParts.push(props.city);
    if (props.state) descParts.push(props.state);
    const description = descParts.join('، ') || undefined;

    const countryCode = props.country_code?.toUpperCase();
    const inIraq = isInIraq(lat, lon) || countryCode === 'IQ';

    // Confidence: boost Iraq results
    const confidence = inIraq ? 0.9 : 0.5;

    // Build OSM ID
    let osmId: string | undefined;
    if (props.osm_id && props.osm_type) {
      const prefix = { N: 'n', W: 'w', R: 'r' }[props.osm_type] ?? 'n';
      osmId = `${prefix}${props.osm_id}`;
    }

    return {
      lat,
      lon,
      nameAr,
      nameEn,
      description,
      countryCode,
      inIraq,
      confidence,
      attribution: ATTRIBUTION,
      raw: props,
      osmId,
    };
  }

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  async isHealthy(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/`;
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2000);
      const res = await globalThis.fetch(url, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if [lat, lon] is inside the Iraq bounding box. */
export function isInIraq(lat: number, lon: number): boolean {
  return (
    lat >= IRAQ_BBOX[1] &&
    lat <= IRAQ_BBOX[3] &&
    lon >= IRAQ_BBOX[0] &&
    lon <= IRAQ_BBOX[2]
  );
}

/** Filter an array of GeoPoints to those inside Iraq, sorted by confidence desc. */
export function filterAndRankIraq(points: GeoPoint[]): GeoPoint[] {
  return points
    .filter((p) => p.inIraq)
    .sort((a, b) => b.confidence - a.confidence);
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class PhotonError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'PhotonError';
  }

  get isTransient(): boolean {
    return this.statusCode === 0 || this.statusCode === 408 || this.statusCode >= 500;
  }
}
