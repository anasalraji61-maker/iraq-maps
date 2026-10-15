import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

/**
 * Thin wrapper around expo-haptics with named interactions.
 * All methods are no-ops on devices without haptic support.
 */
export function useHaptics() {
  const light = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  const medium = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  const success = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  const error = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }, []);

  /** Light tap: filter chips, tabs, minor toggles */
  const tap = light;
  /** Medium impact: like/save toggle */
  const like = medium;
  /** Success notification: message sent, post created */
  const sent = success;
  /** Error notification: failed action */
  const fail = error;

  return { tap, like, sent, fail, light, medium, success, error };
}
