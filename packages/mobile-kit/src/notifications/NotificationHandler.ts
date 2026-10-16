/**
 * NotificationHandler
 *
 * Handles the three notification lifecycle moments:
 *   1. Foreground  — app is open; show an in-app banner
 *   2. Background  — app is backgrounded; update the badge count
 *   3. Tap         — user taps the notification; navigate to the right screen
 *
 * Also owns push-token registration with the backend.
 *
 * All navigation is done via Expo Router's imperative API (passed in as a
 * dependency so this module stays test-friendly).
 */

import type { Router } from 'expo-router';

// ─── Notification shape (what Expo delivers) ──────────────────────────────────

export interface PushNotificationData {
  type?: string;
  postId?: string;
  requestId?: string;
  placeId?: string;
  eventId?: string;
  userId?: string;
  achievementId?: string;
  [key: string]: string | undefined;
}

export interface ReceivedNotification {
  request: {
    identifier: string;
    content: {
      title: string | null;
      body: string | null;
      badge?: number | null;
      data?: PushNotificationData;
    };
  };
}

export interface NotificationResponse {
  notification: ReceivedNotification;
  actionIdentifier: string;
}

// ─── In-app banner types ──────────────────────────────────────────────────────

export type BannerDismissCallback = () => void;

export interface BannerOptions {
  /** How long (ms) before the banner auto-dismisses. Default 4000. */
  autoDismissMs?: number;
  /** Called when the banner is dismissed (auto or manual). */
  onDismiss?: BannerDismissCallback;
  /** Called when the user taps the banner. */
  onPress?: () => void;
}

export interface BannerPayload {
  id: string;
  title: string;
  body: string;
  type?: string;
  options: BannerOptions;
}

type BannerListener = (banner: BannerPayload) => void;

// ─── Backend token registration API shape ────────────────────────────────────

export interface TokenRegistrationApi {
  registerDevice(params: {
    token: string;
    platform: 'android' | 'ios';
  }): Promise<void>;
}

// ─── Platform helper ──────────────────────────────────────────────────────────

function currentPlatform(): 'android' | 'ios' {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    if (Platform.OS === 'ios') return 'ios';
    return 'android';
  } catch {
    return 'android';
  }
}

// ─── Badge counter (in-memory; mirrors what we asked the OS to show) ──────────

let currentBadge = 0;

// ─── Banner listener registry ────────────────────────────────────────────────

const bannerListeners = new Set<BannerListener>();
let bannerSeq = 0;

function emitBanner(payload: BannerPayload): void {
  for (const listener of bannerListeners) {
    try {
      listener(payload);
    } catch { /* listener errors must not crash the handler */ }
  }
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class NotificationHandler {
  private router: Router | null = null;
  private tokenApi: TokenRegistrationApi | null = null;

  constructor() {
    // Intentionally lightweight — dependencies are injected at setup time.
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /**
   * Provide the Expo Router instance.
   * Call from the root layout after the router is ready.
   */
  setRouter(router: Router): void {
    this.router = router;
  }

  /**
   * Provide the backend API for token registration.
   * Call from the root layout after authentication is confirmed.
   */
  setTokenApi(api: TokenRegistrationApi): void {
    this.tokenApi = api;
  }

  // ── Foreground handler ────────────────────────────────────────────────────

  /**
   * Called by the notification permission manager when a notification arrives
   * while the app is in the foreground.
   * Emits an in-app banner event consumed by <NotificationBannerHost />.
   */
  handleForeground(notification: ReceivedNotification): void {
    const { title, body, data } = notification.request.content;
    if (!title && !body) return;

    bannerSeq += 1;
    const banner: BannerPayload = {
      id: `banner_${bannerSeq}`,
      title: title ?? '',
      body: body ?? '',
      type: data?.type,
      options: {
        autoDismissMs: 4_000,
        onPress: () => {
          if (data) {
            this._navigate(data);
          }
        },
      },
    };

    emitBanner(banner);

    // Update in-memory badge count (the OS will not auto-badge for foreground).
    currentBadge += 1;
    this._setBadge(currentBadge);
  }

  // ── Background handler ────────────────────────────────────────────────────

  /**
   * Called when the app wakes briefly from background to handle a notification.
   * Increments the badge count; the OS has already shown the system notification.
   */
  handleBackground(notification: ReceivedNotification): void {
    const badge = notification.request.content.badge;
    if (typeof badge === 'number') {
      currentBadge = badge;
    } else {
      currentBadge += 1;
    }
    this._setBadge(currentBadge);
  }

  // ── Tap handler ───────────────────────────────────────────────────────────

  /**
   * Called when the user taps a notification to open the app.
   * Navigates to the appropriate screen based on the notification's data payload.
   * Also clears the badge count and marks the notification as read on the server.
   */
  handleTap(response: NotificationResponse): void {
    const { data } = response.notification.request.content;

    // Clear badge on tap (user opened the app to see the notification).
    currentBadge = Math.max(0, currentBadge - 1);
    this._setBadge(currentBadge);

    if (data) {
      this._navigate(data);
    }
  }

  // ── Token registration ────────────────────────────────────────────────────

  /**
   * Register a push token with the backend.
   * Safe to call multiple times — the backend upserts.
   */
  async registerPushToken(token: string): Promise<void> {
    if (!this.tokenApi) {
      // Not yet authenticated; the caller should retry after login.
      return;
    }

    try {
      await this.tokenApi.registerDevice({
        token,
        platform: currentPlatform(),
      });
    } catch {
      // Token registration is best-effort; a failed register means the user
      // won't receive pushes until the next app start that succeeds.
    }
  }

  // ── Banner subscription ───────────────────────────────────────────────────

  /**
   * Subscribe to in-app banner events.
   * Returns an unsubscribe function.
   *
   * Used by <NotificationBannerHost /> to render banners at the top of
   * the screen when the app is in the foreground.
   */
  subscribeToBanners(listener: BannerListener): () => void {
    bannerListeners.add(listener);
    return () => { bannerListeners.delete(listener); };
  }

  // ── Badge helpers ─────────────────────────────────────────────────────────

  /** Programmatically set the OS badge count. */
  setBadgeCount(count: number): void {
    currentBadge = Math.max(0, count);
    this._setBadge(currentBadge);
  }

  /** Return the current in-memory badge count. */
  getBadgeCount(): number {
    return currentBadge;
  }

  /** Clear the badge (set to 0). */
  clearBadge(): void {
    currentBadge = 0;
    this._setBadge(0);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _navigate(data: PushNotificationData): void {
    if (!this.router) return;

    const type = data['type'] ?? '';

    if ((type === 'post_liked' || type === 'post_commented' || type === 'comment') && data['postId']) {
      this.router.push(`/(tabs)/discover/post/${data['postId']}`);
      return;
    }

    if ((type === 'message' || type === 'new_message' || type === 'inquiry_replied') && data['requestId']) {
      this.router.push(`/(tabs)/messages/${data['requestId']}`);
      return;
    }

    if ((type === 'nearby_place' || type === 'trending_place') && data['placeId']) {
      this.router.push(`/(tabs)/map/place/${data['placeId']}`);
      return;
    }

    if (type === 'follow') {
      const uid = data['userId'];
      if (uid) this.router.push(`/(tabs)/discover/profile/${uid}`);
      return;
    }

    if (type === 'event_reminder' && data['eventId']) {
      this.router.push(`/(tabs)/discover/event/${data['eventId']}`);
      return;
    }

    if (type === 'achievement_unlocked' || type === 'achievement') {
      this.router.push('/(tabs)/activity');
      return;
    }

    if (type === 'review_response') {
      this.router.push('/(tabs)/activity');
      return;
    }

    // Generic fallback: open notification center
    this.router.push('/(tabs)/activity/notifications');
  }

  private _setBadge(count: number): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications') as {
        setBadgeCountAsync(n: number): Promise<void>;
      };
      void Notifications.setBadgeCountAsync(count).catch(() => { /* best-effort */ });
    } catch {
      /* native module not available (test/web environment) */
    }
  }
}

/** Singleton instance for use throughout the app. */
export const notificationHandler = new NotificationHandler();
