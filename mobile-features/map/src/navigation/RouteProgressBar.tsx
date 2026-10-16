/**
 * RouteProgressBar – linear progress indicator for the active navigation session.
 *
 * Shows:
 *  - A full-width track divided into route segments.
 *  - The elapsed portion shaded in the primary colour; the remaining portion in muted grey.
 *  - The current segment highlighted with a bright dot.
 *  - Time and distance remaining (right side).
 *  - Next maneuver preview (icon + street name, left side).
 *
 * RTL-safe: the bar direction flips with I18nManager.isRTL.
 */

import type { Maneuver, ManeuverModifier, ManeuverType } from '@iraq-maps/contracts';
import { tokens } from '@iraq-maps/ui';
import { type ReactElement, useEffect, useRef } from 'react';
import {
  Animated,
  I18nManager,
  Platform,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { t } from '../strings';

// ── Maneuver icon mapping ────────────────────────────────────────────────────

type ManeuverIconKey = ManeuverType | `${ManeuverType}_${ManeuverModifier}`;

/** Unicode arrow / emoji characters used as lightweight maneuver icons. */
const MANEUVER_ICONS: Partial<Record<ManeuverIconKey, string>> = {
  depart: '🚦',
  arrive: '📍',
  continue: '⬆️',
  'turn_left': '⬅️',
  'turn_slight_left': '↖️',
  'turn_sharp_left': '↩️',
  'turn_right': '➡️',
  'turn_slight_right': '↗️',
  'turn_sharp_right': '↪️',
  uturn: '🔄',
  ramp: '↗️',
  exit: '↪️',
  fork: '⬆️',
  merge: '⬆️',
  roundabout_enter: '🔁',
  roundabout_exit: '🔁',
  ferry_enter: '⛴️',
  ferry_exit: '⛴️',
};

function maneuverIcon(type: ManeuverType, modifier?: ManeuverModifier): string {
  if (modifier) {
    const key = `${type}_${modifier}` as ManeuverIconKey;
    if (MANEUVER_ICONS[key]) return MANEUVER_ICONS[key]!;
  }
  return MANEUVER_ICONS[type as ManeuverIconKey] ?? '➡️';
}

// ── Time / distance formatters ───────────────────────────────────────────────

function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return t('navigation.lessThanMinute');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('navigation.minutesRemaining', { n: minutes });
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return t('navigation.hoursRemaining', { n: hours });
  return t('navigation.hoursMinutesRemaining', { h: hours, m: mins });
}

function formatRemainingDistance(metres: number): string {
  if (metres < 1000) return t('navigation.distanceM', { n: Math.round(metres) });
  return t('navigation.distanceKm', { n: (metres / 1000).toFixed(1) });
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface RouteProgressBarProps {
  /** Current progress fraction 0–1. */
  progress: number;
  /** Remaining time in seconds. */
  remainingS: number;
  /** Remaining distance in metres. */
  remainingM: number;
  /** Active (current) maneuver to preview. */
  activeManeuver: Maneuver | null;
  /** Next maneuver (upcoming). */
  nextManeuver: Maneuver | null;
  /** Whether the user is currently off-route. */
  offRoute?: boolean;
  /** Estimated arrival time (Date). */
  eta?: Date | null;
  /** Accessibility label for the progress track. */
  accessibilityLabel?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * RouteProgressBar renders a compact navigation HUD:
 *  - Top row: next maneuver icon + street name  |  ETA
 *  - Progress track with animated fill
 *  - Bottom row: remaining distance  |  remaining time
 */
export function RouteProgressBar({
  progress,
  remainingS,
  remainingM,
  activeManeuver,
  nextManeuver,
  offRoute = false,
  eta,
}: RouteProgressBarProps): ReactElement {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const animatedWidth = useRef(new Animated.Value(clampedProgress)).current;

  // Animate the fill width when progress changes.
  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: clampedProgress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [clampedProgress, animatedWidth]);

  const isRTL = I18nManager.isRTL;

  // The maneuver we show in the "next turn" slot.
  const previewManeuver = activeManeuver ?? nextManeuver;
  const icon = previewManeuver
    ? maneuverIcon(previewManeuver.type, previewManeuver.modifier)
    : null;
  const streetName = previewManeuver?.streetNames[0] ?? '';

  // Off-route warning overrides the normal street name.
  const instructionText = offRoute
    ? t('navigation.offRoute')
    : streetName || t('navigation.followRoute');

  // ETA string.
  const etaStr = eta
    ? eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <View
      style={[styles.container, offRoute && styles.offRouteContainer]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clampedProgress * 100) }}
    >
      {/* ── Top row: maneuver preview + ETA ── */}
      <View style={[styles.topRow, isRTL && styles.rowReversed]}>
        <View style={[styles.maneuverBlock, isRTL && styles.rowReversed]}>
          {icon ? (
            <RNText style={styles.maneuverIcon} accessibilityElementsHidden>
              {icon}
            </RNText>
          ) : null}
          <RNText
            style={[styles.maneuverText, offRoute && styles.offRouteText]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {instructionText}
          </RNText>
        </View>

        {etaStr ? (
          <View style={styles.etaBlock}>
            <RNText style={styles.etaLabel}>{t('navigation.eta')}</RNText>
            <RNText style={styles.etaValue}>{etaStr}</RNText>
          </View>
        ) : null}
      </View>

      {/* ── Progress track ── */}
      <View style={styles.trackContainer} accessibilityElementsHidden>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              {
                width: animatedWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: offRoute ? tokens.color.danger : tokens.color.primary,
              },
              isRTL && styles.fillRTL,
            ]}
          />
          {/* Current position dot */}
          <Animated.View
            style={[
              styles.dot,
              {
                [isRTL ? 'right' : 'left']: animatedWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                backgroundColor: offRoute ? tokens.color.danger : tokens.color.primary,
              },
            ]}
          />
        </View>
      </View>

      {/* ── Bottom row: distance + time ── */}
      <View style={[styles.bottomRow, isRTL && styles.rowReversed]}>
        <RNText style={styles.remainingText}>
          {formatRemainingDistance(remainingM)}
        </RNText>

        {/* Next maneuver preview chip */}
        {nextManeuver && !offRoute ? (
          <View style={[styles.nextManeuverChip, isRTL && styles.rowReversed]}>
            <RNText style={styles.chipIcon}>
              {maneuverIcon(nextManeuver.type, nextManeuver.modifier)}
            </RNText>
            <RNText style={styles.chipText} numberOfLines={1}>
              {nextManeuver.streetNames[0] ?? ''}
            </RNText>
          </View>
        ) : null}

        <RNText style={styles.remainingText}>
          {formatRemainingTime(remainingS)}
        </RNText>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const TRACK_HEIGHT = 6;
const DOT_SIZE = 14;
const CONTAINER_RADIUS = 16;

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.surface,
    borderRadius: CONTAINER_RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  offRouteContainer: {
    borderWidth: 2,
    borderColor: tokens.color.danger,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowReversed: {
    flexDirection: 'row-reverse',
  },
  maneuverBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  maneuverIcon: {
    fontSize: 20,
  },
  maneuverText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
    flex: 1,
  },
  offRouteText: {
    color: tokens.color.danger,
  },
  etaBlock: {
    alignItems: 'flex-end',
    marginStart: 8,
  },
  etaLabel: {
    fontSize: 10,
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  etaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.text,
  },
  trackContainer: {
    height: DOT_SIZE,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: tokens.color.border,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'visible',
  },
  fill: {
    position: 'absolute',
    top: 0,
    start: 0,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  fillRTL: {
    start: undefined,
    end: 0,
  },
  dot: {
    position: 'absolute',
    top: -(DOT_SIZE - TRACK_HEIGHT) / 2,
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2,
    borderColor: tokens.color.surface,
    marginStart: -(DOT_SIZE / 2),
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  remainingText: {
    fontSize: 13,
    color: tokens.color.textMuted,
  },
  nextManeuverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.border,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    maxWidth: 140,
  },
  chipIcon: {
    fontSize: 12,
  },
  chipText: {
    fontSize: 11,
    color: tokens.color.textMuted,
    flex: 1,
  },
});
