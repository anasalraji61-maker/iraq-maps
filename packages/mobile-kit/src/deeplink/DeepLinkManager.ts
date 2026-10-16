/**
 * DeepLinkManager – handles incoming deep links and builds outgoing URLs.
 *
 * Security model:
 *  - All URLs are parsed and validated before any navigation takes place.
 *  - Parameter values are checked against allowlists / regex patterns.
 *  - Unknown deep link types are silently discarded.
 *  - URLs longer than DEEP_LINK_MAX_LENGTH are rejected outright.
 *  - Any parameter value longer than DEEP_LINK_MAX_PARAM_LENGTH is rejected.
 *
 * Usage:
 *   const manager = DeepLinkManager.getInstance();
 *   manager.registerHandler('place', ({ id }) => router.push(`/map/place/${id}`));
 *   manager.handle('iraqsmartmaps://place/abc123');
 */

import {
  DEEP_LINK_MAX_LENGTH,
  DEEP_LINK_MAX_PARAM_LENGTH,
  DEEP_LINK_SCHEME,
  DEEP_LINK_WEB_HOST,
  isValidId,
  isValidLatLng,
  isValidMode,
  isValidPlaceTab,
  isValidProviderSection,
  isValidQuery,
  type DeepLinkParams,
  type DeepLinkType,
  type EventDeepLinkParams,
  type PlaceDeepLinkParams,
  type PostDeepLinkParams,
  type ProviderDeepLinkParams,
  type RouteDeepLinkParams,
  type SearchDeepLinkParams,
  type Tour3DDeepLinkParams,
  type UserDeepLinkParams,
} from './DeepLinkTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeepLinkHandler<T extends DeepLinkParams = DeepLinkParams> = (params: T) => void | Promise<void>;

export interface ParseResult {
  /** Whether the URL is structurally a recognised deep link. */
  recognised: boolean;
  /** The parsed params if recognised and valid. */
  params?: DeepLinkParams;
  /** Human-readable reason for rejection (for logging; never shown to users). */
  error?: string;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class DeepLinkManager {
  private static instance: DeepLinkManager | undefined;

  /** Keyed by DeepLinkType. Last registered handler wins. */
  private handlers = new Map<DeepLinkType, DeepLinkHandler>();

  /** Optional global fallback when no handler is registered for a type. */
  private fallbackHandler?: DeepLinkHandler;

  private constructor() {}

  static getInstance(): DeepLinkManager {
    if (!DeepLinkManager.instance) {
      DeepLinkManager.instance = new DeepLinkManager();
    }
    return DeepLinkManager.instance;
  }

  /** Reset the singleton — useful in tests. */
  static _reset(): void {
    DeepLinkManager.instance = undefined;
  }

  // ─── Handler registration ───────────────────────────────────────────────────

  /** Register a handler for a deep link type. Returns an unregister function. */
  registerHandler<T extends DeepLinkParams>(
    type: T['type'],
    handler: DeepLinkHandler<T>,
  ): () => void {
    this.handlers.set(type as DeepLinkType, handler as DeepLinkHandler);
    return () => {
      if (this.handlers.get(type as DeepLinkType) === (handler as DeepLinkHandler)) {
        this.handlers.delete(type as DeepLinkType);
      }
    };
  }

  /** Register a fallback handler for unhandled deep link types. */
  registerFallback(handler: DeepLinkHandler): void {
    this.fallbackHandler = handler;
  }

  // ─── Dispatch ───────────────────────────────────────────────────────────────

  /**
   * Parse and dispatch a deep link URL.
   * Returns false when the URL is not a recognised deep link or fails validation.
   */
  handle(url: string): boolean {
    const result = this.parseDeepLink(url);
    if (!result.recognised || !result.params) return false;

    const handler = this.handlers.get(result.params.type) ?? this.fallbackHandler;
    if (handler) {
      void Promise.resolve(handler(result.params));
    }
    return true;
  }

  // ─── Parsing ────────────────────────────────────────────────────────────────

  /** Parse a URL into typed DeepLinkParams. */
  parseDeepLink(url: string): ParseResult {
    if (!url || typeof url !== 'string') {
      return { recognised: false, error: 'empty url' };
    }

    if (url.length > DEEP_LINK_MAX_LENGTH) {
      return { recognised: false, error: 'url too long' };
    }

    let parsed: URL;
    try {
      // Treat custom scheme URLs as http: for URL parsing compatibility.
      const normalised = url.startsWith(`${DEEP_LINK_SCHEME}://`)
        ? url.replace(`${DEEP_LINK_SCHEME}://`, 'http://deeplink/')
        : url;
      parsed = new URL(normalised);
    } catch {
      return { recognised: false, error: 'malformed url' };
    }

    // Determine path segments based on origin URL.
    let segments: string[];
    let searchParams: URLSearchParams;

    if (url.startsWith(`${DEEP_LINK_SCHEME}://`)) {
      // iraqsmartmaps://place/abc → host=deeplink, path=/place/abc
      segments = parsed.pathname.split('/').filter(Boolean);
      searchParams = parsed.searchParams;
    } else if (
      parsed.hostname === DEEP_LINK_WEB_HOST ||
      parsed.hostname === `www.${DEEP_LINK_WEB_HOST}`
    ) {
      // https://iraqsmartmaps.app/place/abc
      segments = parsed.pathname.split('/').filter(Boolean);
      searchParams = parsed.searchParams;
    } else {
      return { recognised: false, error: 'unknown host' };
    }

    const type = segments[0] as DeepLinkType | undefined;
    if (!type) {
      return { recognised: false, error: 'missing type segment' };
    }

    return this._parseByType(type, segments, searchParams);
  }

  /** Validate a URL: returns true only when parseDeepLink succeeds without error. */
  validateDeepLink(url: string): boolean {
    const result = this.parseDeepLink(url);
    return result.recognised && !result.error;
  }

  private _parseByType(
    type: DeepLinkType,
    segments: string[],
    params: URLSearchParams,
  ): ParseResult {
    switch (type) {
      case 'place': {
        const id = segments[1];
        if (!id || !isValidId(id)) {
          return { recognised: true, error: 'invalid place id' };
        }
        const tab = params.get('tab') ?? undefined;
        const result: PlaceDeepLinkParams = { type: 'place', id };
        if (tab) {
          if (!isValidPlaceTab(tab)) return { recognised: true, error: 'invalid tab' };
          result.tab = tab as PlaceDeepLinkParams['tab'];
        }
        return { recognised: true, params: result };
      }

      case 'post': {
        const id = segments[1];
        if (!id || !isValidId(id)) {
          return { recognised: true, error: 'invalid post id' };
        }
        const commentId = params.get('comment') ?? undefined;
        if (commentId && !isValidId(commentId)) {
          return { recognised: true, error: 'invalid comment id' };
        }
        const result: PostDeepLinkParams = { type: 'post', id };
        if (commentId) result.commentId = commentId;
        return { recognised: true, params: result };
      }

      case 'user': {
        const id = segments[1];
        if (!id || !isValidId(id)) {
          return { recognised: true, error: 'invalid user id' };
        }
        const result: UserDeepLinkParams = { type: 'user', id };
        return { recognised: true, params: result };
      }

      case 'provider': {
        const id = segments[1];
        if (!id || !isValidId(id)) {
          return { recognised: true, error: 'invalid provider id' };
        }
        const section = params.get('section') ?? undefined;
        const result: ProviderDeepLinkParams = { type: 'provider', id };
        if (section) {
          if (!isValidProviderSection(section)) return { recognised: true, error: 'invalid section' };
          result.section = section as ProviderDeepLinkParams['section'];
        }
        return { recognised: true, params: result };
      }

      case 'route': {
        const from = params.get('from') ?? '';
        const to = params.get('to') ?? '';
        if (!from || !isValidLatLng(from)) {
          return { recognised: true, error: 'invalid from' };
        }
        if (!to || !isValidLatLng(to)) {
          return { recognised: true, error: 'invalid to' };
        }
        const mode = params.get('mode') ?? 'car';
        if (!isValidMode(mode)) {
          return { recognised: true, error: 'invalid mode' };
        }
        const result: RouteDeepLinkParams = { type: 'route', from, to, mode: mode as RouteDeepLinkParams['mode'] };
        return { recognised: true, params: result };
      }

      case 'search': {
        const q = params.get('q') ?? undefined;
        const category = params.get('category') ?? undefined;
        const city = params.get('city') ?? undefined;

        if (q && q.length > DEEP_LINK_MAX_PARAM_LENGTH) {
          return { recognised: true, error: 'query too long' };
        }
        if (q && !isValidQuery(q)) {
          return { recognised: true, error: 'invalid query characters' };
        }
        if (category && !isValidId(category)) {
          return { recognised: true, error: 'invalid category' };
        }
        if (city && !isValidId(city)) {
          return { recognised: true, error: 'invalid city' };
        }

        const result: SearchDeepLinkParams = { type: 'search' };
        if (q) result.q = q;
        if (category) result.category = category;
        if (city) result.city = city;
        return { recognised: true, params: result };
      }

      case 'event': {
        const id = segments[1];
        if (!id || !isValidId(id)) {
          return { recognised: true, error: 'invalid event id' };
        }
        const result: EventDeepLinkParams = { type: 'event', id };
        return { recognised: true, params: result };
      }

      case 'tour3d': {
        const id = segments[1];
        if (!id || !isValidId(id)) {
          return { recognised: true, error: 'invalid tour3d id' };
        }
        const result: Tour3DDeepLinkParams = { type: 'tour3d', id };
        return { recognised: true, params: result };
      }

      default:
        return { recognised: false, error: `unknown type: ${String(type)}` };
    }
  }

  // ─── URL building ────────────────────────────────────────────────────────────

  /**
   * Build a deep link URL for the given params.
   * Returns the custom-scheme URL (iraqsmartmaps://).
   */
  build(params: DeepLinkParams): string {
    switch (params.type) {
      case 'place': {
        const base = `${DEEP_LINK_SCHEME}://place/${encodeURIComponent(params.id)}`;
        return params.tab ? `${base}?tab=${params.tab}` : base;
      }

      case 'post': {
        const base = `${DEEP_LINK_SCHEME}://post/${encodeURIComponent(params.id)}`;
        return params.commentId ? `${base}?comment=${encodeURIComponent(params.commentId)}` : base;
      }

      case 'user': {
        return `${DEEP_LINK_SCHEME}://user/${encodeURIComponent(params.id)}`;
      }

      case 'provider': {
        const base = `${DEEP_LINK_SCHEME}://provider/${encodeURIComponent(params.id)}`;
        return params.section ? `${base}?section=${params.section}` : base;
      }

      case 'route': {
        const qp = new URLSearchParams({
          from: params.from,
          to: params.to,
        });
        if (params.mode && params.mode !== 'car') qp.set('mode', params.mode);
        return `${DEEP_LINK_SCHEME}://route?${qp.toString()}`;
      }

      case 'search': {
        const qp = new URLSearchParams();
        if (params.q) qp.set('q', params.q);
        if (params.category) qp.set('category', params.category);
        if (params.city) qp.set('city', params.city);
        const qs = qp.toString();
        return qs ? `${DEEP_LINK_SCHEME}://search?${qs}` : `${DEEP_LINK_SCHEME}://search`;
      }

      case 'event': {
        return `${DEEP_LINK_SCHEME}://event/${encodeURIComponent(params.id)}`;
      }

      case 'tour3d': {
        return `${DEEP_LINK_SCHEME}://tour3d/${encodeURIComponent(params.id)}`;
      }
    }
  }

  /**
   * Build an HTTPS web fallback URL for the given params.
   * Used for sharing with users who don't have the app installed.
   */
  buildWebUrl(params: DeepLinkParams): string {
    const deepUrl = this.build(params);
    // Replace scheme with https://host
    return deepUrl.replace(`${DEEP_LINK_SCHEME}://`, `https://${DEEP_LINK_WEB_HOST}/`);
  }
}

/** Convenience singleton accessor. */
export const deepLinkManager = DeepLinkManager.getInstance();
