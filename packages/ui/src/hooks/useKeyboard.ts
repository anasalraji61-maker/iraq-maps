/**
 * useKeyboard — soft keyboard height and visibility hook.
 *
 * Subscribes to RN keyboard events and returns:
 * - isOpen: whether the keyboard is currently visible.
 * - height: current keyboard height in dp (0 when closed).
 * - animatedHeight: Animated.Value tracking height for smooth transitions.
 *
 * Works correctly on both iOS and Android.
 * On Android, set android:windowSoftInputMode="adjustResize" for accurate heights.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';
import type { KeyboardEvent } from 'react-native';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KeyboardState {
  /** True while the keyboard is visible. */
  isOpen: boolean;
  /** Current keyboard height in density-independent pixels. */
  height: number;
  /** Animated.Value that tracks height, for use in Animated.View styles. */
  animatedHeight: Animated.Value;
  /** Dismiss the keyboard programmatically. */
  dismiss(): void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useKeyboard(): KeyboardState {
  const [isOpen, setIsOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function onShow(e: KeyboardEvent) {
      const kbHeight = e.endCoordinates.height;
      setIsOpen(true);
      setHeight(kbHeight);
      Animated.timing(animatedHeight, {
        toValue: kbHeight,
        duration: Platform.OS === 'ios' ? (e.duration ?? 250) : 200,
        useNativeDriver: false,
      }).start();
    }

    function onHide(e: KeyboardEvent) {
      setIsOpen(false);
      setHeight(0);
      Animated.timing(animatedHeight, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e.duration ?? 200) : 150,
        useNativeDriver: false,
      }).start();
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const sub1 = Keyboard.addListener(showEvent, onShow);
    const sub2 = Keyboard.addListener(hideEvent, onHide);

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [animatedHeight]);

  return {
    isOpen,
    height,
    animatedHeight,
    dismiss: Keyboard.dismiss,
  };
}

// ── Companion: useAvoidKeyboard ───────────────────────────────────────────────

/**
 * Returns a paddingBottom value to add to a scrollable container so that
 * content is not hidden behind the soft keyboard.
 * On iOS with KeyboardAvoidingView already in use, pass `enabled: false`.
 */
export function useAvoidKeyboard(enabled = true): number {
  const { isOpen, height } = useKeyboard();
  if (!enabled) return 0;
  return isOpen ? height : 0;
}
