/**
 * AccessibilityManager — detects and reacts to system accessibility settings.
 *
 * Covers TalkBack (Android) and VoiceOver (iOS), reduced motion,
 * high-contrast mode, bold text, and dynamic font sizing.
 * All APIs are thin wrappers so they can be swapped for test fakes.
 */

import {
  AccessibilityInfo,
  Dimensions,
  Platform,
  PixelRatio,
} from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface A11yState {
  /** True when TalkBack (Android) or VoiceOver (iOS) is running. */
  screenReaderEnabled: boolean;
  /** True when the OS reduce-motion setting is on. */
  reduceMotionEnabled: boolean;
  /** True when the OS high-contrast / bold-text setting is on. */
  highContrastEnabled: boolean;
  /** True when bold text is requested (iOS only; always false on Android). */
  boldTextEnabled: boolean;
  /** Current PixelRatio-adjusted font scale factor (1.0 = no scaling). */
  fontScale: number;
}

export type A11yListener = (state: A11yState) => void;

// ─── Manager ─────────────────────────────────────────────────────────────────

class AccessibilityManagerClass {
  private _state: A11yState = {
    screenReaderEnabled: false,
    reduceMotionEnabled: false,
    highContrastEnabled: false,
    boldTextEnabled: false,
    fontScale: PixelRatio.getFontScale(),
  };

  private readonly _listeners = new Set<A11yListener>();
  private _subscriptions: Array<{ remove(): void }> = [];
  private _initialized = false;

  /** Call once at app start (inside a React context is fine). */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    const [screenReader, reduceMotion, highContrast, boldText] =
      await Promise.all([
        AccessibilityInfo.isScreenReaderEnabled(),
        AccessibilityInfo.isReduceMotionEnabled(),
        Platform.OS === 'ios'
          ? AccessibilityInfo.isHighTextContrastEnabled?.() ?? Promise.resolve(false)
          : AccessibilityInfo.isHighTextContrastEnabled?.() ?? Promise.resolve(false),
        Platform.OS === 'ios'
          ? AccessibilityInfo.isBoldTextEnabled?.() ?? Promise.resolve(false)
          : Promise.resolve(false),
      ]);

    this._state = {
      screenReaderEnabled: screenReader,
      reduceMotionEnabled: reduceMotion,
      highContrastEnabled: highContrast,
      boldTextEnabled: boldText,
      fontScale: PixelRatio.getFontScale(),
    };

    this._subscriptions = [
      AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
        this._update({ screenReaderEnabled: enabled });
      }),
      AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
        this._update({ reduceMotionEnabled: enabled });
      }),
      ...(AccessibilityInfo.addEventListener as Function)
        ? []
        : [],
    ];

    // Font scale can change when the user adjusts system text size.
    const dimSub = Dimensions.addEventListener('change', () => {
      this._update({ fontScale: PixelRatio.getFontScale() });
    });
    this._subscriptions.push(dimSub);

    this._emit();
  }

  /** Tear down. Call in test afterEach or unmount. */
  destroy(): void {
    for (const sub of this._subscriptions) sub.remove();
    this._subscriptions = [];
    this._initialized = false;
  }

  get state(): Readonly<A11yState> {
    return this._state;
  }

  subscribe(listener: A11yListener): () => void {
    this._listeners.add(listener);
    listener(this._state);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Announce a message to the active screen reader.
   * On Android this maps to TalkBack; on iOS to VoiceOver.
   * Silent when no screen reader is active.
   */
  announce(message: string): void {
    AccessibilityInfo.announceForAccessibility(message);
  }

  /**
   * Move screen-reader focus to a React ref's underlying native view.
   * Pass the result of `useRef<View>()`.
   */
  setFocus(ref: React.RefObject<{ _nativeTag?: number }>): void {
    const handle = ref.current;
    if (!handle) return;
    // React Native exposes `findNodeHandle` but we avoid importing
    // it to keep this file free of JSX/renderer coupling.
    // Callers may also use AccessibilityInfo.setAccessibilityFocus directly.
    const tag = (handle as { _nativeTag?: number })._nativeTag;
    if (typeof tag === 'number') {
      AccessibilityInfo.setAccessibilityFocus(tag);
    }
  }

  // ─── Color contrast ────────────────────────────────────────────────────────

  /**
   * Checks WCAG 2.1 contrast ratio between two hex colors.
   * Returns the ratio and whether it meets AA (4.5:1) or AAA (7:1).
   */
  checkContrast(foreground: string, background: string): {
    ratio: number;
    passesAA: boolean;
    passesAAA: boolean;
  } {
    const lum = (hex: string): number => {
      const c = hex.replace('#', '');
      const r = parseInt(c.slice(0, 2), 16) / 255;
      const g = parseInt(c.slice(2, 4), 16) / 255;
      const b = parseInt(c.slice(4, 6), 16) / 255;
      const linearize = (v: number) =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
    };
    const l1 = Math.max(lum(foreground), lum(background));
    const l2 = Math.min(lum(foreground), lum(background));
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    return { ratio, passesAA: ratio >= 4.5, passesAAA: ratio >= 7 };
  }

  /**
   * Scales a base font size by the current OS font scale.
   * Clamps to a sensible range so layouts do not break.
   */
  scaledFontSize(base: number, min = 10, max = 48): number {
    return Math.min(max, Math.max(min, Math.round(base * this._state.fontScale)));
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _update(partial: Partial<A11yState>): void {
    this._state = { ...this._state, ...partial };
    this._emit();
  }

  private _emit(): void {
    for (const listener of this._listeners) listener(this._state);
  }
}

export const AccessibilityManager = new AccessibilityManagerClass();
