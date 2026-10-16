/* eslint-disable no-restricted-syntax */
/**
 * useLocation — device location with permission management.
 *
 * Uses expo-location (peer dependency) to:
 * - Request foreground location permission.
 * - Watch the current position with configurable accuracy.
 * - Handle permission denied gracefully.
 * - Track heading (compass direction).
 * - Default to Baghdad coordinates when location is unavailable.
 *
 * This hook NEVER stores coordinates in persistent storage.
 * Coordinate data is only held in component state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Baghdad fallback ──────────────────────────────────────────────────────────

/** Baghdad city centre — used as the default when location is unavailable. */
export const BAGHDAD_CENTER = { latitude: 33.3152, longitude: 44.3661 } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type PermissionStatus = 'undetermined' | 'granted' | 'denied' | 'unavailable';

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface LocationState {
  /** Current device coordinates, or null. */
  coords: Coordinates | null;
  /** Permission state for foreground location. */
  permission: PermissionStatus;
  /** True while the initial location fetch is in progress. */
  loading: boolean;
  /** Error message if location failed. */
  error: string | null;
  /** Heading from the device compass (0–360 degrees from north). */
  heading: number | null;
  /** Request (or re-request) location permission. */
  requestPermission(): Promise<boolean>;
  /** Manually refresh the current position. */
  refresh(): Promise<void>;
  /** Fallback: Baghdad centre when real location is unavailable. */
  fallback: typeof BAGHDAD_CENTER;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLocation(): LocationState {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const watchSub = useRef<{ remove(): void } | null>(null);
  const headingSub = useRef<{ remove(): void } | null>(null);

  // Lazy-load expo-location to avoid hard dependency in library code
  async function getExpoLocation() {
    try {
      return await import('expo-location');
    } catch {
      return null;
    }
  }

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const ExpoLocation = await getExpoLocation();
    if (!ExpoLocation) {
      setPermission('unavailable');
      setError('خدمة الموقع غير متاحة على هذا الجهاز');
      return false;
    }
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) {
        setError('لم يتم منح إذن الوصول إلى الموقع');
      } else {
        setError(null);
      }
      return granted;
    } catch {
      setPermission('unavailable');
      setError('فشل طلب إذن الموقع');
      return false;
    }
  }, []);

  const refresh = useCallback(async () => {
    const ExpoLocation = await getExpoLocation();
    if (!ExpoLocation || permission !== 'granted') return;
    try {
      setLoading(true);
      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      setCoords({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        altitude: pos.coords.altitude ?? null,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
        timestamp: pos.timestamp,
      });
      setError(null);
    } catch {
      setError('تعذّر الحصول على الموقع');
    } finally {
      setLoading(false);
    }
  }, [permission]);

  // Start watching after permission is granted
  useEffect(() => {
    if (permission !== 'granted') return;

    let active = true;

    async function startWatch() {
      const ExpoLocation = await getExpoLocation();
      if (!ExpoLocation || !active) return;

      try {
        setLoading(true);
        // Initial position
        const pos = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        if (active) {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            altitude: pos.coords.altitude ?? null,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
            timestamp: pos.timestamp,
          });
        }

        // Continuous watch
        watchSub.current = await ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (loc) => {
            if (!active) return;
            setCoords({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? null,
              altitude: loc.coords.altitude ?? null,
              heading: loc.coords.heading ?? null,
              speed: loc.coords.speed ?? null,
              timestamp: loc.timestamp,
            });
          },
        );

        // Compass heading
        headingSub.current = await ExpoLocation.watchHeadingAsync((h) => {
          if (active) setHeading(h.trueHeading ?? h.magHeading);
        });
      } catch {
        if (active) setError('فشل بدء تتبع الموقع');
      } finally {
        if (active) setLoading(false);
      }
    }

    void startWatch();

    return () => {
      active = false;
      watchSub.current?.remove();
      headingSub.current?.remove();
    };
  }, [permission]);

  // Check permission on mount
  useEffect(() => {
    async function checkPerm() {
      const ExpoLocation = await getExpoLocation();
      if (!ExpoLocation) {
        setPermission('unavailable');
        return;
      }
      const { status } = await ExpoLocation.getForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermission('granted');
      } else if (status === 'denied') {
        setPermission('denied');
      }
      // 'undetermined' stays as-is until user calls requestPermission
    }
    void checkPerm();
  }, []);

  return {
    coords,
    permission,
    loading,
    error,
    heading,
    requestPermission,
    refresh,
    fallback: BAGHDAD_CENTER,
  };
}
