/**
 * Geocoding contracts: address types for Iraq, reverse geocoding, structured geocoding,
 * autocomplete, and admin division hierarchy.
 *
 * The geocoding module wraps Photon (server-side only). Clients never call Photon directly.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { BBox, LngLat, Problem } from './common';

const c = initContract();

// ── Iraq bounding box ────────────────────────────────────────────────────────
/** Iraq's approximate bounding box [west, south, east, north] in WGS84. */
export const IRAQ_BBOX: [number, number, number, number] = [38.79, 29.06, 48.57, 37.38];

/** All 19 Iraqi governorates with their canonical IDs (kebab-case, English). */
export const IraqGovernorateId = z.enum([
  'baghdad',
  'basra',
  'ninewa',
  'sulaymaniyah',
  'erbil',
  'kirkuk',
  'duhok',
  'diyala',
  'anbar',
  'wasit',
  'babil',
  'karbala',
  'najaf',
  'qadisiyyah',
  'muthanna',
  'dhi-qar',
  'maysan',
  'saladin',
  'halabja',
]);
export type IraqGovernorateId = z.infer<typeof IraqGovernorateId>;

/** Localised names for a single admin division. */
export const AdminNames = z.object({
  ar: z.string().min(1).max(200),
  ckb: z.string().min(1).max(200).optional(),
  en: z.string().min(1).max(200),
});
export type AdminNames = z.infer<typeof AdminNames>;

/** A district (qadha) nested inside a governorate. */
export const IraqDistrict = z.object({
  id: z.string().min(1).max(64),
  names: AdminNames,
  center: LngLat,
  bbox: BBox.optional(),
});
export type IraqDistrict = z.infer<typeof IraqDistrict>;

/** A neighbourhood (hayy / mahalla) nested inside a district. */
export const IraqNeighborhood = z.object({
  id: z.string().min(1).max(64),
  names: AdminNames,
  center: LngLat,
  bbox: BBox.optional(),
  /** Informal / colloquial name used in everyday speech. */
  informalName: z.string().max(200).optional(),
});
export type IraqNeighborhood = z.infer<typeof IraqNeighborhood>;

/** Full governorate node in the admin hierarchy. */
export const IraqAdminDivision = z.object({
  id: IraqGovernorateId,
  names: AdminNames,
  center: LngLat,
  bbox: BBox,
  districts: z.array(IraqDistrict),
});
export type IraqAdminDivision = z.infer<typeof IraqAdminDivision>;

// ── Address component types ──────────────────────────────────────────────────

/**
 * Structured address components for Iraq.
 * All string fields carry their value in the requested locale (default: Arabic).
 */
export const AddressComponent = z.object({
  /** Governorate name (محافظة), e.g. "بغداد". */
  governorate: z.string().min(1).max(200).optional(),
  governorateId: IraqGovernorateId.optional(),
  /** City / town name within the governorate, e.g. "الكرادة". */
  city: z.string().min(1).max(200).optional(),
  /** District / qadha, e.g. "قضاء الرصافة". */
  district: z.string().min(1).max(200).optional(),
  /** Neighbourhood / mahalla / hayy, e.g. "حي الجامعة". */
  neighborhood: z.string().min(1).max(200).optional(),
  /** Street name, e.g. "شارع السعدون". */
  street: z.string().min(1).max(200).optional(),
  /** House / building number. */
  houseNumber: z.string().max(32).optional(),
  /** Postal code (not widely used in Iraq, but Photon may return one). */
  postcode: z.string().max(16).optional(),
  /** Free-form nearby landmark supplied by the user (e.g. "بجانب جامع الرحمن"). */
  landmark: z.string().max(300).optional(),
});
export type AddressComponent = z.infer<typeof AddressComponent>;

/** A one-line formatted address in a given locale (Arabic by default, RTL). */
export const FormattedAddress = z.object({
  /** Full human-readable address string, RTL-safe. */
  full: z.string().min(1).max(500),
  /** Compact one-line form (neighbourhood + street, or landmark). */
  short: z.string().min(1).max(200),
  components: AddressComponent,
});
export type FormattedAddress = z.infer<typeof FormattedAddress>;

// ── Geocode results ──────────────────────────────────────────────────────────

/** Result from a forward or structured geocode. */
export const GeocodeResult = z.object({
  /** Internal feature id from Photon / OSM. */
  id: z.string().min(1).max(128),
  location: LngLat,
  bbox: BBox.optional(),
  address: FormattedAddress,
  /** Confidence score [0, 1]. 1 = exact match. */
  confidence: z.number().min(0).max(1),
  /** OSM element type and id, e.g. "node/12345". */
  osmRef: z.string().optional(),
});
export type GeocodeResult = z.infer<typeof GeocodeResult>;

/** Result from reverse geocoding a coordinate. */
export const ReverseGeocodeResult = z.object({
  location: LngLat,
  address: FormattedAddress,
  /** Distance from the queried coordinate to the nearest matched feature, in metres. */
  distanceM: z.number().nonnegative(),
  /** OSM element type and id, e.g. "way/67890". */
  osmRef: z.string().optional(),
});
export type ReverseGeocodeResult = z.infer<typeof ReverseGeocodeResult>;

/** A single autocomplete suggestion (for fast address-completion UI). */
export const AddressSuggestion = z.object({
  id: z.string().min(1).max(128),
  /** Display text shown in the dropdown. */
  label: z.string().min(1).max(300),
  /** Short secondary label (e.g. district / governorate). */
  sublabel: z.string().max(200).optional(),
  location: LngLat,
  bbox: BBox.optional(),
});
export type AddressSuggestion = z.infer<typeof AddressSuggestion>;

/** Named bounding box for a known area (city, district, neighbourhood). */
export const NamedBBox = z.object({
  name: z.string().min(1).max(200),
  bbox: BBox,
  center: LngLat,
  /** The admin level: governorate | city | district | neighborhood */
  level: z.enum(['governorate', 'city', 'district', 'neighborhood']),
});
export type NamedBBox = z.infer<typeof NamedBBox>;

// ── Request / query schemas ──────────────────────────────────────────────────

/** Forward geocode by free-form text. */
export const GeocodeQuery = z.object({
  q: z.string().min(1).max(300),
  /** Bias results toward this point. */
  near: LngLat.optional(),
  /** Limit to this governorate. */
  governorateId: IraqGovernorateId.optional(),
  limit: z.number().int().min(1).max(10).default(5),
  locale: z.enum(['ar', 'ckb', 'en']).default('ar'),
});
export type GeocodeQuery = z.infer<typeof GeocodeQuery>;

/** Structured geocode by address components. */
export const StructuredGeocodeQuery = z.object({
  governorateId: IraqGovernorateId.optional(),
  city: z.string().max(200).optional(),
  district: z.string().max(200).optional(),
  neighborhood: z.string().max(200).optional(),
  street: z.string().max(200).optional(),
  houseNumber: z.string().max(32).optional(),
  locale: z.enum(['ar', 'ckb', 'en']).default('ar'),
});
export type StructuredGeocodeQuery = z.infer<typeof StructuredGeocodeQuery>;

/** Reverse geocode a coordinate to an address. */
export const ReverseGeocodeQuery = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locale: z.enum(['ar', 'ckb', 'en']).default('ar'),
});
export type ReverseGeocodeQuery = z.infer<typeof ReverseGeocodeQuery>;

/** Autocomplete partial address text. */
export const AutocompleteQuery = z.object({
  partial: z.string().min(1).max(200),
  /** Restrict results to a governorate. */
  governorateId: IraqGovernorateId.optional(),
  /** Bias toward a point. */
  near: LngLat.optional(),
  limit: z.number().int().min(1).max(10).default(5),
  locale: z.enum(['ar', 'ckb', 'en']).default('ar'),
});
export type AutocompleteQuery = z.infer<typeof AutocompleteQuery>;

/** Validation result for a candidate Iraq address. */
export const AddressValidationResult = z.object({
  valid: z.boolean(),
  inIraq: z.boolean(),
  /** Component-level issues keyed by AddressComponent field name. */
  issues: z.record(z.string(), z.string()).optional(),
  /** Suggested correction if confidence is high enough. */
  suggestion: GeocodeResult.optional(),
});
export type AddressValidationResult = z.infer<typeof AddressValidationResult>;

// ── HTTP contract ────────────────────────────────────────────────────────────

/** @public geocodingContract — served by modules/geocoding */
export const geocodingContract = c.router(
  {
    /** Forward geocode: free-form text → list of candidates. */
    geocode: {
      method: 'GET',
      path: '/geocode',
      query: GeocodeQuery,
      responses: { 200: z.object({ results: z.array(GeocodeResult) }), 400: Problem, 503: Problem },
    },

    /** Structured geocode: address components → candidates. */
    geocodeStructured: {
      method: 'GET',
      path: '/geocode/structured',
      query: StructuredGeocodeQuery,
      responses: { 200: z.object({ results: z.array(GeocodeResult) }), 400: Problem, 503: Problem },
    },

    /** Reverse geocode: lat/lng → address. */
    reverseGeocode: {
      method: 'GET',
      path: '/geocode/reverse',
      query: ReverseGeocodeQuery,
      responses: {
        200: ReverseGeocodeResult,
        /** 404: coordinate is valid WGS84 but outside Iraq or too remote from any feature. */
        404: Problem,
        400: Problem,
        503: Problem,
      },
    },

    /** Fast address autocomplete (partial text, ≤ 10 suggestions). */
    autocomplete: {
      method: 'GET',
      path: '/geocode/autocomplete',
      query: AutocompleteQuery,
      responses: { 200: z.object({ suggestions: z.array(AddressSuggestion) }), 400: Problem, 503: Problem },
    },

    /** Iraq administrative division hierarchy (governorates → districts). */
    adminDivisions: {
      method: 'GET',
      path: '/geocode/admin-divisions',
      query: z.object({}),
      responses: { 200: z.object({ divisions: z.array(IraqAdminDivision) }) },
    },

    /** Bounding box for a named area (governorate, city, district, neighbourhood). */
    boundingBox: {
      method: 'GET',
      path: '/geocode/bbox',
      query: z.object({ name: z.string().min(1).max(200), locale: z.enum(['ar', 'ckb', 'en']).default('ar') }),
      responses: { 200: NamedBBox, 404: Problem, 400: Problem },
    },

    /** Neighbourhoods for a governorate or city, with centers. */
    neighborhoods: {
      method: 'GET',
      path: '/geocode/neighborhoods',
      query: z.object({
        governorateId: IraqGovernorateId.optional(),
        city: z.string().max(200).optional(),
        locale: z.enum(['ar', 'ckb', 'en']).default('ar'),
      }),
      responses: { 200: z.object({ neighborhoods: z.array(IraqNeighborhood) }), 400: Problem },
    },

    /** Validate whether an address string is within Iraq bounds. */
    validateAddress: {
      method: 'POST',
      path: '/geocode/validate',
      body: z.object({ address: z.string().min(1).max(500), locale: z.enum(['ar', 'ckb', 'en']).default('ar') }),
      responses: { 200: AddressValidationResult, 400: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

// ── GeocoderClient port ──────────────────────────────────────────────────────

/** External geocoder (Photon over HTTP). Modules that need geocoding inject this port. */
export interface GeocoderClient {
  readonly kind: 'photon' | 'fake';
  geocode(query: GeocodeQuery): Promise<GeocodeResult[]>;
  reverseGeocode(query: ReverseGeocodeQuery): Promise<ReverseGeocodeResult | null>;
  autocomplete(query: AutocompleteQuery): Promise<AddressSuggestion[]>;
}
