/**
 * Photon geocoder adapter (photon.komoot.io-compatible API, self-hosted at PHOTON_URL).
 * All calls go through the backend — never from the mobile app.
 *
 * Photon API reference: https://photon.komoot.io/ (identical to self-hosted Photon).
 */
import type {
  AddressSuggestion,
  AutocompleteQuery,
  GeocoderClient,
  GeocodeQuery,
  GeocodeResult,
  ReverseGeocodeQuery,
  ReverseGeocodeResult,
} from '@iraq-maps/contracts';
import { formatIraqAddress, isInIraq, photonPropsToComponents } from './address-format';

interface PhotonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

interface PhotonResponse {
  type: 'FeatureCollection';
  features: PhotonFeature[];
}

/** Milliseconds to wait before aborting a Photon request. */
const TIMEOUT_MS = 5_000;

function idFromFeature(f: PhotonFeature): string {
  const props = f.properties;
  const osm_type = typeof props['osm_type'] === 'string' ? props['osm_type'] : 'X';
  const osm_id = typeof props['osm_id'] === 'number' ? String(props['osm_id']) : 'unknown';
  return `${osm_type}/${osm_id}`;
}

function osmRefFromFeature(f: PhotonFeature): string | undefined {
  const props = f.properties;
  const type = props['osm_type'];
  const id = props['osm_id'];
  if (typeof type === 'string' && typeof id === 'number') return `${type}/${id}`;
  return undefined;
}

function bboxFromExtent(f: PhotonFeature): [number, number, number, number] | undefined {
  const ext = f.properties['extent'];
  if (Array.isArray(ext) && ext.length === 4) {
    const nums = ext as number[];
    const w = nums[0] as number;
    const s = nums[1] as number;
    const e = nums[2] as number;
    const n = nums[3] as number;
    return [w, s, e, n];
  }
  return undefined;
}

/**
 * Confidence heuristic from the Photon result rank and OSM type.
 * rank is undocumented; this is a best-effort approximation.
 */
function confidenceFromFeature(f: PhotonFeature, queryLength: number): number {
  const name = typeof f.properties['name'] === 'string' ? f.properties['name'] as string : '';
  if (name.length === 0) return 0.3;
  // Longer queries matching shorter names → lower confidence
  const ratio = Math.min(name.length / Math.max(queryLength, 1), 1);
  return Math.max(0.3, Math.min(0.95, ratio));
}

function featureToGeocodeResult(f: PhotonFeature, locale: 'ar' | 'ckb' | 'en', queryLength: number): GeocodeResult {
  const [lng, lat] = f.geometry.coordinates;
  const components = photonPropsToComponents(f.properties, locale);
  const address = formatIraqAddress(components);
  const photonName = typeof f.properties['name'] === 'string' ? f.properties['name'] as string : '';
  if (photonName && !address.full) {
    address.full = photonName;
    address.short = photonName;
  }

  return {
    id: idFromFeature(f),
    location: [lng, lat],
    bbox: bboxFromExtent(f),
    address,
    confidence: confidenceFromFeature(f, queryLength),
    osmRef: osmRefFromFeature(f),
  };
}

export class PhotonClient implements GeocoderClient {
  readonly kind = 'photon' as const;

  constructor(private readonly baseUrl: string) {}

  private async fetch<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Photon returned ${res.status}`);
      return await res.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    const params: Record<string, string> = {
      q: query.q,
      limit: String(query.limit),
      lang: query.locale === 'ckb' ? 'ar' : query.locale,
      // Bias to Iraq center if no specific point given
      lat: String(query.near ? query.near[1] : 33.3),
      lon: String(query.near ? query.near[0] : 44.4),
      // Restrict to Iraq (bbox: [west, south, east, north])
      bbox: '38.79,29.06,48.57,37.38',
    };

    const data = await this.fetch<PhotonResponse>('/api', params);
    return data.features
      .filter((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return isInIraq(lat, lng);
      })
      .map((f) => featureToGeocodeResult(f, query.locale, query.q.length));
  }

  async reverseGeocode(query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null> {
    if (!isInIraq(query.lat, query.lng)) return null;

    const params: Record<string, string> = {
      lat: String(query.lat),
      lon: String(query.lng),
      lang: query.locale === 'ckb' ? 'ar' : query.locale,
    };

    const data = await this.fetch<PhotonResponse>('/reverse', params);
    if (data.features.length === 0) return null;

    const f = data.features[0]!;
    const [fLng, fLat] = f.geometry.coordinates;
    const distanceM = haversineMetres(query.lat, query.lng, fLat, fLng);
    const components = photonPropsToComponents(f.properties, query.locale);
    const address = formatIraqAddress(components);

    return {
      location: [fLng, fLat] as [number, number],
      address,
      distanceM,
      osmRef: osmRefFromFeature(f),
    };
  }

  async autocomplete(query: AutocompleteQuery): Promise<AddressSuggestion[]> {
    // Photon doesn't have a dedicated autocomplete endpoint; use forward geocode with a low limit.
    const params: Record<string, string> = {
      q: query.partial,
      limit: String(query.limit),
      lang: query.locale === 'ckb' ? 'ar' : query.locale,
      lat: String(query.near ? query.near[1] : 33.3),
      lon: String(query.near ? query.near[0] : 44.4),
      bbox: '38.79,29.06,48.57,37.38',
    };

    const data = await this.fetch<PhotonResponse>('/api', params);
    return data.features
      .filter((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return isInIraq(lat, lng);
      })
      .map((f): AddressSuggestion => {
        const [lng, lat] = f.geometry.coordinates;
        const name = typeof f.properties['name'] === 'string' ? f.properties['name'] as string : '';
        const city = typeof f.properties['city'] === 'string' ? f.properties['city'] as string : '';
        const state = typeof f.properties['state'] === 'string' ? f.properties['state'] as string : '';
        const sublabel = [city, state].filter(Boolean).join('، ') || undefined;

        return {
          id: idFromFeature(f),
          label: name || sublabel || '',
          sublabel,
          location: [lng, lat],
          bbox: bboxFromExtent(f),
        };
      })
      .filter((s) => s.label.length > 0);
  }
}

/** Haversine distance in metres between two WGS84 points. */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
