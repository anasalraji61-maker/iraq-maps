/**
 * Deep link type definitions for Iraq Smart Maps.
 *
 * URL scheme: iraqsmartmaps://
 * HTTPS fallback: https://iraqsmartmaps.app/
 *
 * All deep links are validated for security before processing.
 */

// ─── Scheme ──────────────────────────────────────────────────────────────────

export const DEEP_LINK_SCHEME = 'iraqsmartmaps';
export const DEEP_LINK_WEB_HOST = 'iraqsmartmaps.app';

// Maximum length for any deep link URL to prevent resource exhaustion attacks.
export const DEEP_LINK_MAX_LENGTH = 2048;

// Maximum length for any single parameter value.
export const DEEP_LINK_MAX_PARAM_LENGTH = 512;

// Allowed characters for resource IDs (UUIDs and slug-style IDs).
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

// Allowed characters for search queries (Unicode word chars + spaces + common punctuation).
const QUERY_PATTERN = /^[\p{L}\p{N}\p{Zs}\s.,!?؟،؛:'"()-]{1,200}$/u;

// ─── Route types ─────────────────────────────────────────────────────────────

export type DeepLinkType =
  | 'place'
  | 'post'
  | 'user'
  | 'provider'
  | 'route'
  | 'search'
  | 'event'
  | 'tour3d';

// ─── Param shapes ────────────────────────────────────────────────────────────

export interface PlaceDeepLinkParams {
  type: 'place';
  /** UUID of the place. */
  id: string;
  /** Optional: open straight to the tab (reviews, photos, info). */
  tab?: 'reviews' | 'photos' | 'info';
}

export interface PostDeepLinkParams {
  type: 'post';
  /** UUID of the post. */
  id: string;
  /** Optional: scroll to a specific comment. */
  commentId?: string;
}

export interface UserDeepLinkParams {
  type: 'user';
  /** UUID of the user. */
  id: string;
}

export interface ProviderDeepLinkParams {
  type: 'provider';
  /** UUID of the provider. */
  id: string;
  /** Optional: open straight to a section. */
  section?: 'contact' | 'gallery' | 'reviews' | 'map';
}

export interface RouteDeepLinkParams {
  type: 'route';
  /** Origin: "lat,lng" or a place ID prefixed with "place:". */
  from: string;
  /** Destination: "lat,lng" or a place ID prefixed with "place:". */
  to: string;
  /** Transport mode. Defaults to "car". */
  mode?: 'car' | 'bicycle' | 'foot';
}

export interface SearchDeepLinkParams {
  type: 'search';
  /** Free-text query. */
  q?: string;
  /** Category filter slug. */
  category?: string;
  /** City filter. */
  city?: string;
}

export interface EventDeepLinkParams {
  type: 'event';
  /** UUID of the event. */
  id: string;
}

export interface Tour3DDeepLinkParams {
  type: 'tour3d';
  /** UUID of the 3-D tour. */
  id: string;
}

export type DeepLinkParams =
  | PlaceDeepLinkParams
  | PostDeepLinkParams
  | UserDeepLinkParams
  | ProviderDeepLinkParams
  | RouteDeepLinkParams
  | SearchDeepLinkParams
  | EventDeepLinkParams
  | Tour3DDeepLinkParams;

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Returns true when an ID string has only safe characters. */
export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Returns true when a search query has only safe characters. */
export function isValidQuery(q: string): boolean {
  return QUERY_PATTERN.test(q);
}

/** Returns true when a lat,lng pair string is structurally valid. */
export function isValidLatLng(value: string): boolean {
  if (value.startsWith('place:')) {
    return isValidId(value.slice(6));
  }
  const parts = value.split(',');
  if (parts.length !== 2) return false;
  const lat = parseFloat(parts[0] ?? '');
  const lng = parseFloat(parts[1] ?? '');
  if (isNaN(lat) || isNaN(lng)) return false;
  // Rough bounding box for Iraq + surrounding region (29–38 N, 38–49 E) but
  // we accept any global coordinate to allow routes that start outside Iraq.
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Returns true when a transport mode string is one of the allowed values. */
export function isValidMode(mode: string): boolean {
  return mode === 'car' || mode === 'bicycle' || mode === 'foot';
}

/** Returns true when a place tab string is one of the allowed values. */
export function isValidPlaceTab(tab: string): boolean {
  return tab === 'reviews' || tab === 'photos' || tab === 'info';
}

/** Returns true when a provider section string is one of the allowed values. */
export function isValidProviderSection(s: string): boolean {
  return s === 'contact' || s === 'gallery' || s === 'reviews' || s === 'map';
}

// ─── Screen mapping ───────────────────────────────────────────────────────────

/** Maps a deep link type to the Expo Router screen path it should open. */
export const DEEP_LINK_SCREEN_MAP: Record<DeepLinkType, string> = {
  place: '/(tabs)/map/place/[id]',
  post: '/(tabs)/discover/post/[id]',
  user: '/(tabs)/discover/user/[id]',
  provider: '/(tabs)/map/provider/[id]',
  route: '/(tabs)/map/route',
  search: '/(tabs)/map/search',
  event: '/(tabs)/discover/event/[id]',
  tour3d: '/(tabs)/map/tour3d/[id]',
};

// ─── OG types ────────────────────────────────────────────────────────────────

/** Types that have Open Graph pages on the server. */
export type OgResourceType = 'place' | 'post' | 'user' | 'event';
