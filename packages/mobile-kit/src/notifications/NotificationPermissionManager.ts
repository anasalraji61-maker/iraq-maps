/**
 * NotificationPermissionManager
 *
 * Abstracts Expo Notifications permission APIs so the rest of the app
 * never calls expo-notifications directly.
 *
 * Expo APIs are accessed through a lazy import so the module can be
 * imported in test environments where the native module is not linked.
 * The stub below is used when the native module is unavailable.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionCheckResult {
  status: PermissionStatus;
  canAskAgain: boolean;
  /** True when the OS granted permission but the user disabled it system-wide. */
  systemDisabled: boolean;
}

export interface PermissionManagerOptions {
  /**
   * When true, requestPermission() first checks whether permission was already
   * granted and returns early without showing the OS dialog.
   */
  skipIfAlreadyGranted?: boolean;
}

// ─── Expo Notifications shim ──────────────────────────────────────────────────
// We do a dynamic require so tests (which lack the native module) can still
// import this file. The real Expo module is used on device.

interface ExpoPermissionsResult {
  status: string;
  canAskAgain: boolean;
  granted: boolean;
}

interface ExpoNotificationsModule {
  getPermissionsAsync(): Promise<ExpoPermissionsResult>;
  requestPermissionsAsync(options?: {
    ios?: { allowAlert?: boolean; allowBadge?: boolean; allowSound?: boolean };
  }): Promise<ExpoPermissionsResult>;
  getExpoPushTokenAsync(opts?: { projectId?: string }): Promise<{ data: string }>;
  setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }): void;
  addNotificationReceivedListener(handler: (n: unknown) => void): { remove(): void };
  addNotificationResponseReceivedListener(handler: (r: unknown) => void): { remove(): void };
  setBadgeCountAsync(count: number): Promise<void>;
  dismissAllNotificationsAsync(): Promise<void>;
}

function loadExpoNotifications(): ExpoNotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as ExpoNotificationsModule;
  } catch {
    return null;
  }
}

// ─── Stub for non-native environments ────────────────────────────────────────

const stubModule: ExpoNotificationsModule = {
  async getPermissionsAsync() {
    return { status: 'undetermined', canAskAgain: true, granted: false };
  },
  async requestPermissionsAsync() {
    return { status: 'undetermined', canAskAgain: true, granted: false };
  },
  async getExpoPushTokenAsync() {
    return { data: 'ExponentPushToken[STUB_TOKEN]' };
  },
  setNotificationHandler() { /* no-op in stub */ },
  addNotificationReceivedListener() { return { remove() { /* no-op */ } }; },
  addNotificationResponseReceivedListener() { return { remove() { /* no-op */ } }; },
  async setBadgeCountAsync() { /* no-op */ },
  async dismissAllNotificationsAsync() { /* no-op */ },
};

// ─── Linking shim ─────────────────────────────────────────────────────────────

interface LinkingModule {
  openSettings(): Promise<void>;
}

function loadLinking(): LinkingModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-linking') as LinkingModule;
  } catch {
    return null;
  }
}

// ─── Manager class ────────────────────────────────────────────────────────────

export class NotificationPermissionManager {
  private readonly expo: ExpoNotificationsModule;
  private readonly linking: LinkingModule | null;
  private readonly options: Required<PermissionManagerOptions>;

  constructor(options: PermissionManagerOptions = {}) {
    this.expo = loadExpoNotifications() ?? stubModule;
    this.linking = loadLinking();
    this.options = {
      skipIfAlreadyGranted: options.skipIfAlreadyGranted ?? true,
    };
  }

  // ── Core permission API ───────────────────────────────────────────────────

  /**
   * Request push-notification permission from the OS.
   * On Android 13+ this shows a system dialog on the first call.
   * On iOS it shows the standard alert/sound/badge request.
   *
   * @returns The resulting permission status.
   */
  async requestPermission(): Promise<PermissionStatus> {
    if (this.options.skipIfAlreadyGranted) {
      const current = await this.checkPermission();
      if (current.status === 'granted') return 'granted';
    }

    const result = await this.expo.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return this._mapStatus(result.status);
  }

  /**
   * Check the current permission status without showing any OS dialog.
   */
  async checkPermission(): Promise<PermissionCheckResult> {
    const result = await this.expo.getPermissionsAsync();
    return {
      status: this._mapStatus(result.status),
      canAskAgain: result.canAskAgain,
      systemDisabled: result.status === 'denied' && !result.canAskAgain,
    };
  }

  /**
   * Open the OS notification settings for this app.
   * Useful when the user previously denied permission and canAskAgain is false.
   */
  openSettings(): void {
    if (this.linking) {
      void this.linking.openSettings().catch(() => {
        /* best-effort; can fail if the OS doesn't support it */
      });
    }
  }

  // ── Token retrieval ───────────────────────────────────────────────────────

  /**
   * Retrieve the Expo push token for the current device.
   * Requires permission to already be granted.
   * Pass `projectId` if your app uses EAS project IDs.
   */
  async getPushToken(projectId?: string): Promise<string> {
    const result = await this.expo.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return result.data;
  }

  /**
   * Request permission and, if granted, return the push token.
   * Returns null if permission was denied.
   */
  async requestAndGetToken(projectId?: string): Promise<string | null> {
    const status = await this.requestPermission();
    if (status !== 'granted') return null;
    return this.getPushToken(projectId);
  }

  // ── Badge management ──────────────────────────────────────────────────────

  /** Set the numeric badge on the app icon. Pass 0 to clear. */
  async setBadgeCount(count: number): Promise<void> {
    await this.expo.setBadgeCountAsync(Math.max(0, count));
  }

  /** Clear all delivered notifications from the OS notification tray. */
  async clearDeliveredNotifications(): Promise<void> {
    await this.expo.dismissAllNotificationsAsync();
  }

  // ── Notification handler setup ────────────────────────────────────────────

  /**
   * Configure Expo's global foreground notification handler.
   * Call once at app startup (e.g. in the root layout).
   *
   * @param showAlert   Display the notification banner when the app is open.
   * @param playSound   Play the notification sound when the app is open.
   * @param setBadge    Update the badge count when the app is open.
   */
  configureForegroundHandler(
    showAlert = true,
    playSound = true,
    setBadge = true,
  ): void {
    this.expo.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: showAlert,
        shouldPlaySound: playSound,
        shouldSetBadge: setBadge,
      }),
    });
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  /**
   * Listen for notifications received while the app is in the foreground.
   * Returns an unsubscribe function.
   */
  addReceivedListener(handler: (notification: unknown) => void): () => void {
    const sub = this.expo.addNotificationReceivedListener(handler);
    return () => sub.remove();
  }

  /**
   * Listen for when the user taps a notification (foreground or background).
   * Returns an unsubscribe function.
   */
  addResponseListener(handler: (response: unknown) => void): () => void {
    const sub = this.expo.addNotificationResponseReceivedListener(handler);
    return () => sub.remove();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _mapStatus(raw: string): PermissionStatus {
    if (raw === 'granted') return 'granted';
    if (raw === 'denied') return 'denied';
    return 'undetermined';
  }
}

/** Singleton instance for use throughout the app. */
export const notificationPermissionManager = new NotificationPermissionManager();
