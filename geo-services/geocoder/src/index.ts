/**
 * @iraq-maps/geocoder-bridge
 *
 * Iraq-specific geocoder bridge: text ↔ coordinates using a self-hosted
 * Photon instance with a local Iraq place database as fallback.
 *
 * Attribution: "Map data © OpenStreetMap contributors" (ODbL)
 * Iraq bbox: 29.0–37.5 N, 38.5–48.8 E
 */

export {
  IraqGeocoder,
  createIraqGeocoder,
  type IraqGeocoderOptions,
  type GeocodeRequest,
  type GeocodeResult,
  type ReverseGeocodeRequest,
  type ReverseGeocodeResult,
  type AutocompleteRequest,
} from './iraq-geocoder.js';

export {
  PhotonAdapter,
  PhotonError,
  type PhotonAdapterOptions,
  type PhotonFeature,
  type PhotonProperties,
  type PhotonResponse,
  type GeoPoint,
  isInIraq,
  filterAndRankIraq,
  IRAQ_BBOX,
} from './photon-adapter.js';
