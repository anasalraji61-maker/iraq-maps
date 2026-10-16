/**
 * useHaptic — vibration feedback hook.
 *
 * Provides haptic feedback patterns via React Native's Vibration API.
 * On iOS, uses the platform-specific durations for natural feedback.
 * On Android, uses the Vibration API with defined patterns.
 *
 * Usage:
 *   const haptic = useHaptic();
 *   haptic.light();        // subtle tap
 *   haptic.medium();       // standard tap
 *   haptic.heavy();        // strong tap
 *   haptic.success();      // success pattern (double tap)
 *   haptic.error();        // error pattern (long buzz)
 *   haptic.warning();      // warning (triple short)
 *   haptic.selection();    // selection changed (very light)
 *   haptic.notify(type);   // notify variant
 */
import { useCallback } from 'react';
import { Platform, Vibration } from 'react-native';

// ── Platform patterns ─────────────────────────────────────────────────────────

/** Android vibration pattern: [wait, vibrate, wait, vibrate, ...] */
const ANDROID = {
  light:     [0, 10] as const,
  medium:    [0, 30] as const,
  heavy:     [0, 60] as const,
  success:   [0, 20, 80, 20] as const,
  error:     [0, 80, 50, 80] as const,
  warning:   [0, 20, 40, 20, 40, 20] as const,
  selection: [0, 8] as const,
};

// iOS haptic engine is accessed via Haptics (expo-haptics when available).
// We define a lightweight shim that falls back to Vibration when expo-haptics is absent.

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection';

/** Attempt to call expo-haptics if installed; return false if not available. */
async function iosHaptic(style: HapticStyle): Promise<boolean> {
  try {
    // Dynamic import avoids hard dependency on expo-haptics
    const mod = await import('expo-haptics').catch(() => null);
    if (!mod) return false;
    switch (style) {
      case 'light':
        await mod.impactAsync(mod.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await mod.impactAsync(mod.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await mod.impactAsync(mod.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await mod.notificationAsync(mod.NotificationFeedbackType.Success);
        break;
      case 'error':
        await mod.notificationAsync(mod.NotificationFeedbackType.Error);
        break;
      case 'warning':
        await mod.notificationAsync(mod.NotificationFeedbackType.Warning);
        break;
      case 'selection':
        await mod.selectionAsync();
        break;
    }
    return true;
  } catch {
    return false;
  }
}

function androidHaptic(style: HapticStyle) {
  const pattern = ANDROID[style];
  Vibration.vibrate(pattern as unknown as number[]);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface HapticControls {
  /** Very light tap (e.g. button down). */
  light(): void;
  /** Standard tap (e.g. button confirmed). */
  medium(): void;
  /** Strong tap (e.g. destructive action). */
  heavy(): void;
  /** Success feedback (double-tap). */
  success(): void;
  /** Error feedback (long buzz). */
  error(): void;
  /** Warning feedback (triple short). */
  warning(): void;
  /** Selection-changed feedback (very subtle). */
  selection(): void;
  /** Trigger any named pattern. */
  trigger(style: HapticStyle): void;
  /** Cancel any ongoing vibration. */
  cancel(): void;
}

export function useHaptic(): HapticControls {
  const trigger = useCallback((style: HapticStyle) => {
    if (Platform.OS === 'ios') {
      void iosHaptic(style);
    } else {
      androidHaptic(style);
    }
  }, []);

  return {
    light:     useCallback(() => trigger('light'),     [trigger]),
    medium:    useCallback(() => trigger('medium'),    [trigger]),
    heavy:     useCallback(() => trigger('heavy'),     [trigger]),
    success:   useCallback(() => trigger('success'),   [trigger]),
    error:     useCallback(() => trigger('error'),     [trigger]),
    warning:   useCallback(() => trigger('warning'),   [trigger]),
    selection: useCallback(() => trigger('selection'), [trigger]),
    trigger,
    cancel:    useCallback(() => Vibration.cancel(), []),
  };
}
