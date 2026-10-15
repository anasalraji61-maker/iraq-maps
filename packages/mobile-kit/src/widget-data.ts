/**
 * WidgetDataService — prepares data for iOS/Android home screen widgets.
 *
 * Widgets cannot run JavaScript on-demand; they read a shared data store
 * (UserDefaults on iOS, SharedPreferences on Android, or a JSON file via
 * expo-file-system for Expo widgets). This service writes a snapshot to
 * AsyncStorage under a well-known key so the native widget extension
 * can pick it up via the shared app group.
 *
 * Call `WidgetDataService.refresh()` after:
 *   - app foreground
 *   - notification received
 *   - user opens the activity tab
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WidgetSnapshot {
  /** ISO 8601 timestamp of last refresh. */
  updatedAt: string;
  /** Count of unread notifications at last refresh. */
  unreadNotificationCount: number;
  /** Count of nearby places surfaced on the map at last refresh. */
  nearbyPlacesCount: number;
  /** User's display name (shown in the widget header). */
  displayName: string;
}

const WIDGET_KEY = '@iraq-maps/widget-snapshot';

/** Reads the last-written widget snapshot, or null if never written. */
export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetSnapshot;
  } catch {
    return null;
  }
}

/** Writes a new widget snapshot. Call from the main app after fetching fresh counts. */
export async function writeWidgetSnapshot(
  data: Omit<WidgetSnapshot, 'updatedAt'>,
): Promise<void> {
  const snapshot: WidgetSnapshot = { ...data, updatedAt: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(snapshot));
  } catch {
    // storage full or unavailable — non-fatal
  }
}

/** Convenience object mirroring a class-style API. */
export const WidgetDataService = {
  read: readWidgetSnapshot,
  write: writeWidgetSnapshot,
} as const;
