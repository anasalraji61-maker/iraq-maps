/**
 * Font scaling / Dynamic Type support.
 *
 * All Text components should use `sp(n)` to size their text so the OS
 * accessibility font-size setting is respected.
 *
 * Usage:
 *   const { sp } = useFontScale();
 *   <Text style={{ fontSize: sp(16) }}>...</Text>
 *
 * Or use the raw hook to get the system font scale:
 *   const scale = useFontScaleValue();   // e.g. 1.3 when user has bumped font up
 */
import { useWindowDimensions } from 'react-native';

/** Returns the current system font scale factor (1.0 = default size). */
export function useFontScaleValue(): number {
  return useWindowDimensions().fontScale;
}

interface FontScaleResult {
  /** Scale a point size to the current Dynamic Type scale. */
  sp: (points: number) => number;
  /** Raw scale factor from the OS (e.g. 1.3). */
  scale: number;
}

/**
 * Returns a `sp()` helper that scales font sizes according to the system setting.
 * Pass `maxScale` to cap the size (e.g. for icon labels).
 */
export function useFontScale(maxScale?: number): FontScaleResult {
  const raw = useFontScaleValue();
  const scale = maxScale !== undefined ? Math.min(raw, maxScale) : raw;
  const sp = (points: number) => Math.round(points * scale);
  return { sp, scale };
}
