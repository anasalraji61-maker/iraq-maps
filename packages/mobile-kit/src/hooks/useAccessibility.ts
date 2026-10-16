/**
 * useAccessibility — unified hook for screen-reader, font scale, high contrast and motion prefs.
 *
 * Usage:
 *   const { isScreenReaderActive, fontScale, reduceMotion } = useAccessibility();
 *   const label = accessibilityLabel('common:accessibility.screenReader.backButton');
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';
import { t } from '@iraq-maps/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessibilityState {
  /** True when VoiceOver (iOS) or TalkBack (Android) is running. */
  isScreenReaderActive: boolean;
  /**
   * System font scale factor (1.0 = default).
   * Use `sp(n) = Math.round(n * fontScale)` to scale font sizes.
   */
  fontScale: number;
  /**
   * True when the OS "Increase Contrast" / "Bold Text" accessibility setting
   * is active. On Android this approximates via accessibility service state.
   */
  isHighContrast: boolean;
  /**
   * True when the OS "Reduce Motion" setting is active.
   * Disable or shorten animations when this is true.
   */
  reduceMotion: boolean;
  /**
   * Resolves an i18n key to an accessibility label string in the current locale.
   * Falls back gracefully to the key itself if not found.
   *
   * @example accessibilityLabel('common:accessibility.screenReader.backButton')
   */
  accessibilityLabel: (key: Parameters<typeof t>[0]) => string;
  /**
   * Scale a point size according to the current system font scale.
   * Pass `maxScale` to cap (e.g. for icon labels at 1.3).
   */
  sp: (points: number, maxScale?: number) => number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getInitialScreenReaderState(): boolean {
  // AccessibilityInfo.isScreenReaderEnabled() is async; we start with false
  // and correct immediately in the effect.
  return false;
}

function getInitialReduceMotionState(): boolean {
  return false;
}

/** On iOS `isReduceMotionEnabled` is a direct API; on Android we fall back to false. */
async function checkReduceMotion(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      return await AccessibilityInfo.isReduceMotionEnabled();
    } catch {
      return false;
    }
  }
  // React Native doesn't expose a synchronous reduceMotion API on Android yet.
  return false;
}

/**
 * On iOS, "Increase Contrast" is queryable. On Android there's no direct
 * equivalent, so we return false and let callers handle it gracefully.
 */
async function checkHighContrast(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      // isHighTextContrastEnabled is present on RN ≥ 0.71 on iOS; cast to avoid missing-type errors.
      const fn = (AccessibilityInfo as unknown as { isHighTextContrastEnabled?: () => Promise<boolean> })
        .isHighTextContrastEnabled;
      const result = await fn?.();
      return result ?? false;
    } catch {
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns real-time accessibility state from the OS, updated whenever any
 * relevant setting changes while the component is mounted.
 */
export function useAccessibility(): AccessibilityState {
  const { fontScale } = useWindowDimensions();

  const [isScreenReaderActive, setScreenReader] = useState(getInitialScreenReaderState);
  const [isHighContrast, setHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(getInitialReduceMotionState);

  // Ref so the stable `accessibilityLabel` callback doesn't re-render callers.
  const stateRef = useRef({ isScreenReaderActive, fontScale, isHighContrast, reduceMotion });
  stateRef.current = { isScreenReaderActive, fontScale, isHighContrast, reduceMotion };

  useEffect(() => {
    let mounted = true;

    // --- Initial reads ---
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReader(enabled);
    });

    checkReduceMotion().then((val) => {
      if (mounted) setReduceMotion(val);
    });

    checkHighContrast().then((val) => {
      if (mounted) setHighContrast(val);
    });

    // --- Live subscriptions ---
    const srSub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      setScreenReader(enabled);
    });

    // reduceMotionChanged exists on iOS (RN ≥ 0.64) and is silently absent on Android.
    const rmSub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });

    // highTextContrastChanged is iOS only (RN ≥ 0.71); cast to any since the type
    // definitions don't always include it but the runtime may support it.
    const hcSub = (AccessibilityInfo.addEventListener as (event: string, handler: (v: boolean) => void) => { remove(): void } | undefined)?.(
      'highTextContrastChanged',
      (enabled: boolean) => { setHighContrast(enabled); },
    );

    return () => {
      mounted = false;
      srSub.remove();
      rmSub.remove();
      if (typeof hcSub?.remove === 'function') hcSub.remove();
    };
  }, []);

  // Stable callback – does not change between renders.
  const accessibilityLabel = (key: Parameters<typeof t>[0]): string => t(key);

  const sp = (points: number, maxScale?: number): number => {
    const scale = maxScale !== undefined ? Math.min(fontScale, maxScale) : fontScale;
    return Math.round(points * scale);
  };

  return {
    isScreenReaderActive,
    fontScale,
    isHighContrast,
    reduceMotion,
    accessibilityLabel,
    sp,
  };
}
