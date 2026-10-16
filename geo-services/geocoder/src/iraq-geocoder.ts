/**
 * Iraq-specific geocoder with two-tier fallback.
 *
 * Tier 1: Self-hosted Photon instance (OSM-based, Arabic-aware).
 * Tier 2: Iraq place database (curated list of cities, neighbourhoods, landmarks).
 *
 * The geocoder:
 *   - Boosts results inside the Iraq bbox (29.0–37.5 N, 38.5–48.8 E).
 *   - Supports Arabic queries via Unicode normalization.
 *   - Never calls tile.openstreetmap.org or any non-self-hosted endpoint.
 *   - Always returns attribution = "Map data © OpenStreetMap contributors".
 *   - Confidence envelopes satisfy the no-invented-data rule.
 *
 * ODbL compliance: all returned data is either from OSM (via Photon) or from
 * our curated Iraq place database. The two sources are never merged for
 * redistribution; attribution is always shown.
 */

import {
  PhotonAdapter,
  PhotonError,
  type GeoPoint,
  type PhotonAdapterOptions,
  isInIraq,
  IRAQ_BBOX,
} from './photon-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A geocode request. */
export interface GeocodeRequest {
  /** Query text (Arabic or English). */
  query: string;
  /** Optional bias point [lat, lon] for proximity ranking. */
  near?: [number, number];
  /** Max results to return. Default: 5 */
  limit?: number;
  /** Preferred language for display names. Default: "ar" */
  lang?: 'ar' | 'en' | 'ckb';
}

/** A reverse geocode request. */
export interface ReverseGeocodeRequest {
  lat: number;
  lon: number;
  /** Preferred language. Default: "ar" */
  lang?: 'ar' | 'en' | 'ckb';
}

/** Autocomplete request. */
export interface AutocompleteRequest {
  query: string;
  near?: [number, number];
  /** Max results. Default: 8 */
  limit?: number;
}

/** A single geocode result. */
export interface GeocodeResult {
  lat: number;
  lon: number;
  /** Display name (Arabic). */
  nameAr: string;
  nameEn?: string;
  /** Full formatted address (Arabic). */
  addressAr?: string;
  /** Short location label for search result lists. */
  shortLabel: string;
  /** Source tier. */
  source: 'photon' | 'local-db' | 'fallback';
  /** Confidence 0–1. */
  confidence: number;
  /** Whether inside Iraq bbox. */
  inIraq: boolean;
  /** OSM attribution — always present. */
  attribution: 'Map data © OpenStreetMap contributors';
  /** OSM element ID if available (e.g. "n12345"). */
  osmId?: string;
  /** Place type hint (city, neighbourhood, street, poi, ...) */
  placeType?: string;
}

/** Reverse geocode result. */
export interface ReverseGeocodeResult {
  /** Structured address parts. */
  governorate?: string;
  city?: string;
  district?: string;
  neighbourhood?: string;
  street?: string;
  houseNumber?: string;
  /** Full formatted Arabic address. */
  formattedAr: string;
  /** Nearest named place from local DB (fallback). */
  nearestPlace?: string;
  /** Distance to nearest place in metres (fallback only). */
  nearestPlaceDistanceM?: number;
  source: 'photon' | 'local-db' | 'fallback';
  confidence: number;
  inIraq: boolean;
  attribution: 'Map data © OpenStreetMap contributors';
}

// ---------------------------------------------------------------------------
// Iraq place database (curated — used when Photon is unavailable)
// ---------------------------------------------------------------------------

interface IraqPlace {
  nameAr: string;
  nameEn: string;
  lat: number;
  lon: number;
  type: 'governorate' | 'city' | 'district' | 'neighbourhood' | 'landmark';
  governorate?: string;
}

/** Curated list of Iraqi cities, districts, and landmarks. */
const IRAQ_PLACES: IraqPlace[] = [
  // Governorate capitals / major cities
  { nameAr: 'بغداد', nameEn: 'Baghdad', lat: 33.3406, lon: 44.4009, type: 'city', governorate: 'بغداد' },
  { nameAr: 'البصرة', nameEn: 'Basra', lat: 30.5085, lon: 47.7804, type: 'city', governorate: 'البصرة' },
  { nameAr: 'الموصل', nameEn: 'Mosul', lat: 36.3394, lon: 43.1358, type: 'city', governorate: 'نينوى' },
  { nameAr: 'أربيل', nameEn: 'Erbil', lat: 36.1901, lon: 44.0091, type: 'city', governorate: 'أربيل' },
  { nameAr: 'السليمانية', nameEn: 'Sulaymaniyah', lat: 35.5573, lon: 45.4348, type: 'city', governorate: 'السليمانية' },
  { nameAr: 'كركوك', nameEn: 'Kirkuk', lat: 35.4681, lon: 44.3922, type: 'city', governorate: 'كركوك' },
  { nameAr: 'النجف', nameEn: 'Najaf', lat: 31.9954, lon: 44.3351, type: 'city', governorate: 'النجف' },
  { nameAr: 'كربلاء', nameEn: 'Karbala', lat: 32.6158, lon: 44.0244, type: 'city', governorate: 'كربلاء' },
  { nameAr: 'الحلة', nameEn: 'Hilla', lat: 32.4722, lon: 44.4220, type: 'city', governorate: 'بابل' },
  { nameAr: 'الديوانية', nameEn: 'Diwaniyah', lat: 31.9834, lon: 44.9269, type: 'city', governorate: 'القادسية' },
  { nameAr: 'العمارة', nameEn: 'Amarah', lat: 31.8350, lon: 47.1460, type: 'city', governorate: 'ميسان' },
  { nameAr: 'الناصرية', nameEn: 'Nasiriyah', lat: 31.0613, lon: 46.2542, type: 'city', governorate: 'ذي قار' },
  { nameAr: 'السماوة', nameEn: 'Samawah', lat: 31.3181, lon: 45.2791, type: 'city', governorate: 'المثنى' },
  { nameAr: 'الكوت', nameEn: 'Kut', lat: 32.4859, lon: 45.8285, type: 'city', governorate: 'واسط' },
  { nameAr: 'بعقوبة', nameEn: 'Baqubah', lat: 33.7481, lon: 44.6451, type: 'city', governorate: 'ديالى' },
  { nameAr: 'الرمادي', nameEn: 'Ramadi', lat: 33.4243, lon: 43.2991, type: 'city', governorate: 'الأنبار' },
  { nameAr: 'الفلوجة', nameEn: 'Fallujah', lat: 33.3512, lon: 43.7868, type: 'city', governorate: 'الأنبار' },
  { nameAr: 'تكريت', nameEn: 'Tikrit', lat: 34.5992, lon: 43.6866, type: 'city', governorate: 'صلاح الدين' },
  { nameAr: 'دهوك', nameEn: 'Duhok', lat: 36.8669, lon: 42.9918, type: 'city', governorate: 'دهوك' },
  { nameAr: 'حلبجة', nameEn: 'Halabja', lat: 35.1788, lon: 45.9872, type: 'city', governorate: 'السليمانية' },
  { nameAr: 'زاخو', nameEn: 'Zakho', lat: 37.1425, lon: 42.6770, type: 'city', governorate: 'دهوك' },
  { nameAr: 'سامراء', nameEn: 'Samarra', lat: 34.2000, lon: 43.8758, type: 'city', governorate: 'صلاح الدين' },
  { nameAr: 'الحويجة', nameEn: 'Hawija', lat: 35.3655, lon: 43.7367, type: 'city', governorate: 'كركوك' },
  { nameAr: 'خانقين', nameEn: 'Khanaqin', lat: 34.3475, lon: 45.3799, type: 'city', governorate: 'ديالى' },
  { nameAr: 'كفري', nameEn: 'Kifri', lat: 34.6904, lon: 44.9566, type: 'city', governorate: 'ديالى' },
  { nameAr: 'القائم', nameEn: 'Al-Qaim', lat: 34.3773, lon: 41.1130, type: 'city', governorate: 'الأنبار' },
  { nameAr: 'عنه', nameEn: 'Anah', lat: 34.3627, lon: 41.9954, type: 'city', governorate: 'الأنبار' },
  { nameAr: 'هيت', nameEn: 'Hit', lat: 33.6430, lon: 42.8256, type: 'city', governorate: 'الأنبار' },
  { nameAr: 'الخالص', nameEn: 'Khalis', lat: 33.8454, lon: 44.5329, type: 'city', governorate: 'ديالى' },
  { nameAr: 'المقدادية', nameEn: 'Muqdadiyah', lat: 33.9748, lon: 44.9346, type: 'city', governorate: 'ديالى' },
  // Baghdad districts
  { nameAr: 'الكرخ', nameEn: 'Karkh', lat: 33.3408, lon: 44.3649, type: 'district', governorate: 'بغداد' },
  { nameAr: 'الرصافة', nameEn: 'Rusafa', lat: 33.3366, lon: 44.4232, type: 'district', governorate: 'بغداد' },
  { nameAr: 'الكرادة', nameEn: 'Karrada', lat: 33.3062, lon: 44.4069, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'المنصور', nameEn: 'Mansour', lat: 33.3376, lon: 44.3503, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الزعفرانية', nameEn: 'Zafaraniyya', lat: 33.2459, lon: 44.4516, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الأعظمية', nameEn: "A'zamiyah", lat: 33.3762, lon: 44.4171, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الكاظمية', nameEn: 'Kadhimiyya', lat: 33.3818, lon: 44.3388, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الشعب', nameEn: "Sha'ab", lat: 33.3950, lon: 44.4333, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الباب الشرقي', nameEn: 'Bab al-Sharji', lat: 33.3360, lon: 44.4098, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'المدينة الطبية', nameEn: 'Medical City', lat: 33.3476, lon: 44.4001, type: 'landmark', governorate: 'بغداد' },
  { nameAr: 'الجادرية', nameEn: 'Jadiriyya', lat: 33.2899, lon: 44.3829, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الدورة', nameEn: 'Dora', lat: 33.2576, lon: 44.3853, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'المشتل', nameEn: 'Mashtal', lat: 33.2946, lon: 44.4627, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'زيونة', nameEn: 'Zayouna', lat: 33.3091, lon: 44.4572, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الوزيرية', nameEn: 'Waziriya', lat: 33.3608, lon: 44.4083, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'بغداد الجديدة', nameEn: 'New Baghdad', lat: 33.3288, lon: 44.4828, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'الغزالية', nameEn: 'Ghazaliya', lat: 33.3751, lon: 44.3038, type: 'neighbourhood', governorate: 'بغداد' },
  { nameAr: 'حي الجامعة', nameEn: 'University District', lat: 33.3278, lon: 44.3598, type: 'neighbourhood', governorate: 'بغداد' },
  // Landmarks
  { nameAr: 'مطار بغداد الدولي', nameEn: 'Baghdad International Airport', lat: 33.2625, lon: 44.2346, type: 'landmark', governorate: 'بغداد' },
  { nameAr: 'المنطقة الخضراء', nameEn: 'Green Zone', lat: 33.3162, lon: 44.3869, type: 'landmark', governorate: 'بغداد' },
  { nameAr: 'متحف العراق الوطني', nameEn: 'Iraq Museum', lat: 33.3366, lon: 44.3839, type: 'landmark', governorate: 'بغداد' },
  { nameAr: 'حرم الإمام علي', nameEn: 'Imam Ali Shrine', lat: 32.0032, lon: 44.3154, type: 'landmark', governorate: 'النجف' },
  { nameAr: 'حرم الإمام الحسين', nameEn: 'Imam Hussein Shrine', lat: 32.6161, lon: 44.0328, type: 'landmark', governorate: 'كربلاء' },
  { nameAr: 'الجامع الكبير الموصل', nameEn: 'Great Mosque of Mosul', lat: 36.3443, lon: 43.1200, type: 'landmark', governorate: 'نينوى' },
  { nameAr: 'آثار بابل', nameEn: 'Babylon Ruins', lat: 32.5428, lon: 44.4215, type: 'landmark', governorate: 'بابل' },
  { nameAr: 'مطار أربيل', nameEn: 'Erbil International Airport', lat: 36.2357, lon: 43.9632, type: 'landmark', governorate: 'أربيل' },
  { nameAr: 'مطار البصرة', nameEn: 'Basra International Airport', lat: 30.5488, lon: 47.6622, type: 'landmark', governorate: 'البصرة' },
  { nameAr: 'قلعة أربيل', nameEn: 'Erbil Citadel', lat: 36.1920, lon: 44.0097, type: 'landmark', governorate: 'أربيل' },
  { nameAr: 'أهوار جنوب العراق', nameEn: 'Mesopotamian Marshes', lat: 31.0000, lon: 47.2000, type: 'landmark', governorate: 'البصرة' },
  { nameAr: 'جبال قنديل', nameEn: 'Qandil Mountains', lat: 36.6830, lon: 45.0270, type: 'landmark', governorate: 'أربيل' },
];

// ---------------------------------------------------------------------------
// Arabic text normalization for search
// ---------------------------------------------------------------------------

function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ٟ]/g, '')          // remove tashkeel
    .replace(/[آأإ]/g, 'ا') // normalize alef variants → ا
    .replace(/ى/g, 'ي')              // ى → ي
    .replace(/ة/g, 'ه')              // ة → ه
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Tokenize a query into search terms. */
function tokenize(query: string): string[] {
  const stopWords = new Set(['في', 'من', 'إلى', 'على', 'عند', 'near', 'in', 'at', 'the', 'of']);
  return normalizeArabic(query)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));
}

/** Score a place against query tokens (0 = no match, higher = better). */
function scorePlace(place: IraqPlace, tokens: string[]): number {
  const nameNorm = normalizeArabic(place.nameAr) + ' ' + place.nameEn.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (nameNorm.includes(token)) {
      // Exact start-of-word match scores higher
      score += nameNorm.startsWith(token) ? 2 : 1;
    }
  }
  // Boost higher-level places (cities > neighbourhoods)
  const typeBoost = { governorate: 0.4, city: 0.3, district: 0.2, neighbourhood: 0.1, landmark: 0.15 };
  score += typeBoost[place.type] ?? 0;
  return score;
}

// ---------------------------------------------------------------------------
// Haversine distance helper
// ---------------------------------------------------------------------------

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// IraqGeocoder
// ---------------------------------------------------------------------------

export interface IraqGeocoderOptions {
  photon?: PhotonAdapterOptions;
  /** Disable Photon (use local DB only). Useful for testing. */
  photonDisabled?: boolean;
}

const ATTRIBUTION = 'Map data © OpenStreetMap contributors' as const;

export class IraqGeocoder {
  private readonly photon: PhotonAdapter;
  private readonly photonDisabled: boolean;

  constructor(opts: IraqGeocoderOptions = {}) {
    this.photon = new PhotonAdapter(opts.photon);
    this.photonDisabled = opts.photonDisabled ?? false;
  }

  // -------------------------------------------------------------------------
  // Forward geocode: text → coordinates
  // -------------------------------------------------------------------------

  /**
   * Geocode a text query to coordinates.
   *
   * Strategy:
   *   1. Try Photon (boosted to Iraq bbox).
   *   2. If Photon fails or returns no Iraq results, fall back to local DB.
   *   3. Filter and rank by proximity if `near` is given.
   */
  async geocode(req: GeocodeRequest): Promise<GeocodeResult[]> {
    const limit = req.limit ?? 5;
    let photonResults: GeocodeResult[] = [];

    if (!this.photonDisabled) {
      try {
        const raw = await this.photon.geocode(req.query, req.near, limit * 2);
        photonResults = raw
          .filter((p) => p.inIraq)
          .map((p) => this.geoPointToResult(p, 'photon'));
      } catch (err) {
        if (!(err instanceof PhotonError && err.isTransient)) throw err;
        // Transient error — fall through to local DB
      }
    }

    if (photonResults.length >= limit) {
      return this.rankResults(photonResults, req.near).slice(0, limit);
    }

    // Supplement with local DB results
    const dbResults = this.searchLocalDb(req.query, req.near, limit);
    const combined = deduplicateResults([...photonResults, ...dbResults]);
    return this.rankResults(combined, req.near).slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Reverse geocode: coordinates → address
  // -------------------------------------------------------------------------

  /**
   * Reverse geocode a coordinate to a structured Iraqi address.
   *
   * Strategy:
   *   1. Try Photon reverse.
   *   2. If Photon fails, find nearest place in local DB.
   */
  async reverseGeocode(req: ReverseGeocodeRequest): Promise<ReverseGeocodeResult> {
    if (!isInIraq(req.lat, req.lon)) {
      return {
        formattedAr: 'خارج العراق',
        source: 'fallback',
        confidence: 0,
        inIraq: false,
        attribution: ATTRIBUTION,
      };
    }

    if (!this.photonDisabled) {
      try {
        const point = await this.photon.reverse(req.lat, req.lon);
        if (point) {
          return this.geoPointToReverseResult(point, req.lat, req.lon);
        }
      } catch (err) {
        if (!(err instanceof PhotonError && err.isTransient)) throw err;
      }
    }

    // Fallback: nearest local DB place
    return this.reverseFromLocalDb(req.lat, req.lon);
  }

  // -------------------------------------------------------------------------
  // Autocomplete: fast prefix search
  // -------------------------------------------------------------------------

  /**
   * Fast autocomplete for the search bar.
   *
   * Strategy:
   *   1. Local DB first (instant, no network).
   *   2. Then Photon for POIs not in the local DB.
   *   3. Merge, deduplicate, rank.
   */
  async autocomplete(req: AutocompleteRequest): Promise<GeocodeResult[]> {
    const limit = req.limit ?? 8;
    const dbResults = this.searchLocalDb(req.query, req.near, limit);

    if (this.photonDisabled || req.query.length < 2) {
      return dbResults.slice(0, limit);
    }

    let photonResults: GeocodeResult[] = [];
    try {
      const raw = await this.photon.geocode(req.query, req.near, limit);
      photonResults = raw
        .filter((p) => p.inIraq)
        .map((p) => this.geoPointToResult(p, 'photon'));
    } catch {
      // Autocomplete degrades gracefully to local DB only
    }

    // Local DB results go first (they're faster / more curated)
    const combined = deduplicateResults([...dbResults, ...photonResults]);
    return this.rankResults(combined, req.near).slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // Local DB search
  // -------------------------------------------------------------------------

  private searchLocalDb(
    query: string,
    near: [number, number] | undefined,
    limit: number,
  ): GeocodeResult[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const scored = IRAQ_PLACES
      .map((p) => ({ place: p, score: scorePlace(p, tokens) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 3); // over-fetch for proximity re-ranking

    return scored.map(({ place, score }) => ({
      lat: place.lat,
      lon: place.lon,
      nameAr: place.nameAr,
      nameEn: place.nameEn,
      addressAr: buildAddressAr(place),
      shortLabel: buildShortLabel(place),
      source: 'local-db' as const,
      confidence: Math.min(score / 4, 0.85),
      inIraq: true,
      attribution: ATTRIBUTION,
      placeType: place.type,
    }));
  }

  private reverseFromLocalDb(lat: number, lon: number): ReverseGeocodeResult {
    let nearest: IraqPlace | null = null;
    let minDist = Infinity;

    for (const p of IRAQ_PLACES) {
      const d = haversineM(lat, lon, p.lat, p.lon);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }

    if (!nearest) {
      return {
        formattedAr: 'موقع غير معروف',
        source: 'fallback',
        confidence: 0,
        inIraq: true,
        attribution: ATTRIBUTION,
      };
    }

    const formattedAr = buildAddressAr(nearest);
    return {
      neighbourhood: nearest.type === 'neighbourhood' ? nearest.nameAr : undefined,
      district: nearest.type === 'district' ? nearest.nameAr : undefined,
      city: ['city', 'landmark'].includes(nearest.type) ? nearest.nameAr : undefined,
      governorate: nearest.governorate,
      formattedAr,
      nearestPlace: nearest.nameAr,
      nearestPlaceDistanceM: Math.round(minDist),
      source: 'local-db',
      confidence: Math.max(0, 1 - minDist / 10_000), // confidence drops with distance
      inIraq: true,
      attribution: ATTRIBUTION,
    };
  }

  // -------------------------------------------------------------------------
  // Ranking
  // -------------------------------------------------------------------------

  private rankResults(
    results: GeocodeResult[],
    near: [number, number] | undefined,
  ): GeocodeResult[] {
    if (!near) return results.sort((a, b) => b.confidence - a.confidence);

    return results.sort((a, b) => {
      // Combine confidence with inverse distance
      const distA = haversineM(near[0], near[1], a.lat, a.lon);
      const distB = haversineM(near[0], near[1], b.lat, b.lon);
      const scoreA = a.confidence - distA / 200_000;
      const scoreB = b.confidence - distB / 200_000;
      return scoreB - scoreA;
    });
  }

  // -------------------------------------------------------------------------
  // Conversion helpers
  // -------------------------------------------------------------------------

  private geoPointToResult(point: GeoPoint, source: 'photon' | 'local-db'): GeocodeResult {
    const props = point.raw;
    const parts: string[] = [];
    if (props.suburb) parts.push(props.suburb);
    if (props.city) parts.push(props.city);
    if (props.state) parts.push(props.state);
    const addressAr = parts.join('، ') || undefined;
    const shortLabel = parts.slice(0, 2).join('، ');

    return {
      lat: point.lat,
      lon: point.lon,
      nameAr: point.nameAr,
      nameEn: point.nameEn,
      addressAr,
      shortLabel,
      source,
      confidence: point.confidence,
      inIraq: point.inIraq,
      attribution: ATTRIBUTION,
      osmId: point.osmId,
      placeType: props.osm_value ?? props.osm_key,
    };
  }

  private geoPointToReverseResult(
    point: GeoPoint,
    _lat: number,
    _lon: number,
  ): ReverseGeocodeResult {
    const props = point.raw;
    const parts: string[] = [];
    if (props.suburb) parts.push(props.suburb);
    if (props.street) parts.push(props.street);
    if (props.city) parts.push(props.city);
    if (props.state) parts.push(props.state);

    return {
      street: props.street,
      houseNumber: props.housenumber,
      neighbourhood: props.suburb,
      district: props.district ?? props.county,
      city: props.city,
      governorate: props.state,
      formattedAr: parts.join('، '),
      source: 'photon',
      confidence: point.confidence,
      inIraq: point.inIraq,
      attribution: ATTRIBUTION,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAddressAr(place: IraqPlace): string {
  const parts: string[] = [place.nameAr];
  if (place.governorate && place.governorate !== place.nameAr) {
    parts.push(place.governorate);
  }
  return parts.join('، ');
}

function buildShortLabel(place: IraqPlace): string {
  if (place.governorate && place.governorate !== place.nameAr) {
    return `${place.nameAr}، ${place.governorate}`;
  }
  return place.nameAr;
}

function deduplicateResults(results: GeocodeResult[]): GeocodeResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    // Deduplicate by rounded coordinates (within ~110m)
    const key = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a default IraqGeocoder configured for the local stack. */
export function createIraqGeocoder(opts: IraqGeocoderOptions = {}): IraqGeocoder {
  return new IraqGeocoder(opts);
}
