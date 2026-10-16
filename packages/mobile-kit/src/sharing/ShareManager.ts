/**
 * ShareManager – build share payloads for places, posts, routes, events and profiles.
 *
 * All share operations produce a SharePayload that can be handed to the native
 * Share sheet (React Native's Share.share) or used to generate a share card PNG.
 *
 * The manager never contacts external services directly; all URLs are built
 * through DeepLinkManager, which is the single source of truth for URL shapes.
 */

import { DeepLinkManager } from '../deeplink/DeepLinkManager';
import { DEEP_LINK_WEB_HOST } from '../deeplink/DeepLinkTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SharePayload {
  /** Native-share title (shown in iOS share sheet header). */
  title: string;
  /** Short descriptive message. */
  message: string;
  /** Web URL for link previews. */
  url: string;
  /** Custom-scheme URL for in-app resolution. */
  deepLink: string;
}

export interface SharePlaceInput {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  categoryAr?: string;
  /** Latitude, used to build a map coordinates share. */
  lat?: number;
  lng?: number;
}

export interface SharePostInput {
  id: string;
  authorName: string;
  bodyPreview: string;
  /** Category or hashtag context. */
  context?: string;
}

export interface ShareRouteInput {
  fromLabel: string;
  toLabel: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode?: 'car' | 'bicycle' | 'foot';
  /** Estimated travel time as a pre-formatted string (e.g. "٢٥ دقيقة"). */
  durationLabel?: string;
}

export interface ShareEventInput {
  id: string;
  titleAr: string;
  titleEn?: string | null;
  dateLabel?: string;
  locationNameAr?: string;
}

export interface ShareProfileInput {
  id: string;
  displayName: string;
  /** Handle or username without @. */
  handle?: string;
}

export interface ShareCardData {
  type: 'place' | 'post' | 'route' | 'event' | 'profile';
  title: string;
  subtitle?: string;
  body?: string;
  url: string;
  deepLink: string;
  /** Optional icon emoji or category symbol. */
  icon?: string;
  /** Latitude for map card. */
  lat?: number;
  lng?: number;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class ShareManager {
  private static instance: ShareManager | undefined;
  private readonly deepLinks: DeepLinkManager;

  private constructor() {
    this.deepLinks = DeepLinkManager.getInstance();
  }

  static getInstance(): ShareManager {
    if (!ShareManager.instance) {
      ShareManager.instance = new ShareManager();
    }
    return ShareManager.instance;
  }

  static _reset(): void {
    ShareManager.instance = undefined;
  }

  // ─── Place ─────────────────────────────────────────────────────────────────

  sharePlace(place: SharePlaceInput): SharePayload {
    const deepLink = this.deepLinks.build({ type: 'place', id: place.id });
    const url = `https://${DEEP_LINK_WEB_HOST}/place/${encodeURIComponent(place.id)}`;
    const name = place.nameAr;
    const category = place.categoryAr ? ` · ${place.categoryAr}` : '';
    const title = `${name}${category}`;
    const message = place.lat != null && place.lng != null
      ? `${name}${category}\n📍 ${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}\n${url}`
      : `${name}${category}\n${url}`;
    return { title, message, url, deepLink };
  }

  sharePlaceCard(place: SharePlaceInput): ShareCardData {
    const { url, deepLink } = this.sharePlace(place);
    return {
      type: 'place',
      title: place.nameAr,
      subtitle: place.categoryAr,
      url,
      deepLink,
      icon: '📍',
      lat: place.lat,
      lng: place.lng,
    };
  }

  // ─── Post ──────────────────────────────────────────────────────────────────

  sharePost(post: SharePostInput): SharePayload {
    const deepLink = this.deepLinks.build({ type: 'post', id: post.id });
    const url = `https://${DEEP_LINK_WEB_HOST}/post/${encodeURIComponent(post.id)}`;
    const preview = post.bodyPreview.length > 80
      ? post.bodyPreview.slice(0, 77) + '…'
      : post.bodyPreview;
    const title = post.authorName;
    const message = `${post.authorName}: ${preview}\n${url}`;
    return { title, message, url, deepLink };
  }

  sharePostCard(post: SharePostInput): ShareCardData {
    const { url, deepLink } = this.sharePost(post);
    return {
      type: 'post',
      title: post.authorName,
      subtitle: post.context,
      body: post.bodyPreview,
      url,
      deepLink,
      icon: '✍️',
    };
  }

  // ─── Route ─────────────────────────────────────────────────────────────────

  shareRoute(input: ShareRouteInput): SharePayload {
    const from = `${input.fromLat},${input.fromLng}`;
    const to = `${input.toLat},${input.toLng}`;
    const deepLink = this.deepLinks.build({
      type: 'route',
      from,
      to,
      mode: input.mode ?? 'car',
    });
    const url = `https://${DEEP_LINK_WEB_HOST}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const duration = input.durationLabel ? ` · ${input.durationLabel}` : '';
    const title = `${input.fromLabel} → ${input.toLabel}`;
    const message = `${title}${duration}\n${url}`;
    return { title, message, url, deepLink };
  }

  shareRouteCard(input: ShareRouteInput): ShareCardData {
    const { url, deepLink } = this.shareRoute(input);
    return {
      type: 'route',
      title: `${input.fromLabel} → ${input.toLabel}`,
      subtitle: input.durationLabel,
      url,
      deepLink,
      icon: '🗺️',
    };
  }

  // ─── Event ─────────────────────────────────────────────────────────────────

  shareEvent(event: ShareEventInput): SharePayload {
    const deepLink = this.deepLinks.build({ type: 'event', id: event.id });
    const url = `https://${DEEP_LINK_WEB_HOST}/event/${encodeURIComponent(event.id)}`;
    const location = event.locationNameAr ? ` · ${event.locationNameAr}` : '';
    const date = event.dateLabel ? ` · ${event.dateLabel}` : '';
    const title = event.titleAr;
    const message = `${event.titleAr}${date}${location}\n${url}`;
    return { title, message, url, deepLink };
  }

  shareEventCard(event: ShareEventInput): ShareCardData {
    const { url, deepLink } = this.shareEvent(event);
    return {
      type: 'event',
      title: event.titleAr,
      subtitle: event.dateLabel ?? event.locationNameAr,
      url,
      deepLink,
      icon: '📅',
    };
  }

  // ─── Profile ───────────────────────────────────────────────────────────────

  shareProfile(user: ShareProfileInput): SharePayload {
    const deepLink = this.deepLinks.build({ type: 'user', id: user.id });
    const url = `https://${DEEP_LINK_WEB_HOST}/user/${encodeURIComponent(user.id)}`;
    const handle = user.handle ? ` (@${user.handle})` : '';
    const title = user.displayName;
    const message = `${user.displayName}${handle}\n${url}`;
    return { title, message, url, deepLink };
  }

  shareProfileCard(user: ShareProfileInput): ShareCardData {
    const { url, deepLink } = this.shareProfile(user);
    return {
      type: 'profile',
      title: user.displayName,
      subtitle: user.handle ? `@${user.handle}` : undefined,
      url,
      deepLink,
      icon: '👤',
    };
  }

  // ─── Generic card generator ────────────────────────────────────────────────

  /**
   * Generate a generic ShareCardData for any share type.
   * This is the entry point for the ShareCard component.
   */
  generateShareCard(
    type: ShareCardData['type'],
    data: Omit<ShareCardData, 'type'>,
  ): ShareCardData {
    return { type, ...data };
  }
}

/** Convenience singleton accessor. */
export const shareManager = ShareManager.getInstance();
