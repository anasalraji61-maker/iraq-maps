/**
 * TourProgressBar – animated progress indicator for a multi-stop tour.
 * Shows step dots, a fill bar, elapsed/remaining scene counts, and labels.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepInfo {
  label?: string;
  completed: boolean;
}

interface TourProgressBarProps {
  /** 0-based index of the current step. */
  currentIndex: number;
  /** Total number of steps in the tour. */
  totalCount: number;
  /** Optional per-step label array (length should match totalCount). */
  steps?: StepInfo[];
  /** Whether the tour is complete (currentIndex >= totalCount - 1). */
  isComplete?: boolean;
  /** Accent colour; defaults to the gold brand colour. */
  accentColor?: string;
  /** Called when user taps a dot to jump to that step. */
  onStepPress?: (index: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_ACCENT = '#c9a84c';
const MAX_VISIBLE_DOTS = 8; // above this, show count badge instead

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TourProgressBar({
  currentIndex,
  totalCount,
  steps,
  isComplete = false,
  accentColor = DEFAULT_ACCENT,
  onStepPress,
}: TourProgressBarProps) {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const completeAnim = useRef(new Animated.Value(0)).current;

  const safeIndex = Math.max(0, Math.min(currentIndex, totalCount - 1));
  const progress = totalCount > 1 ? safeIndex / (totalCount - 1) : 1;
  const progressPercent = Math.round(progress * 100);

  // Animate fill bar when index changes
  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, fillAnim]);

  // Animate complete badge
  useEffect(() => {
    if (isComplete || safeIndex === totalCount - 1) {
      Animated.spring(completeAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      completeAnim.setValue(0);
    }
  }, [isComplete, safeIndex, totalCount, completeAnim]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const useDots = totalCount <= MAX_VISIBLE_DOTS;
  const completedAll = safeIndex >= totalCount - 1;

  return (
    <View style={styles.container} accessibilityLabel={t('progress.label')}>
      {/* Header row: label + percent */}
      <View style={styles.headerRow}>
        <Text style={styles.label}>
          {completedAll ? t('viewer.progress.complete') : t('progress.label')}
        </Text>
        <View style={styles.rightMeta}>
          <Text style={[styles.percent, { color: accentColor }]}>
            {progressPercent}%
          </Text>
          <Text style={styles.stepCount}>
            {t('viewer.sceneLabel', { current: safeIndex + 1, total: totalCount })}
          </Text>
        </View>
      </View>

      {/* Fill bar */}
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            { width: fillWidth, backgroundColor: accentColor },
          ]}
        />
        {/* Completion glow pulse */}
        {completedAll && (
          <Animated.View
            style={[
              styles.barGlow,
              {
                backgroundColor: accentColor,
                opacity: completeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
              },
            ]}
          />
        )}
      </View>

      {/* Dots (small tour) or count badge (large tour) */}
      {useDots ? (
        <View style={styles.dotsRow}>
          {Array.from({ length: totalCount }, (_, i) => {
            const isDone = i <= safeIndex;
            const isCurrent = i === safeIndex;
            const stepInfo = steps?.[i];

            return (
              <Pressable
                key={i}
                style={styles.dotWrapper}
                onPress={onStepPress ? () => onStepPress(i) : undefined}
                disabled={!onStepPress}
                accessibilityRole={onStepPress ? 'button' : 'none'}
                accessibilityLabel={stepInfo?.label ?? `${t('progress.label')} ${i + 1}`}
                accessibilityState={{ selected: isCurrent }}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    isDone && { backgroundColor: accentColor },
                    isCurrent && styles.dotCurrent,
                    isCurrent && {
                      borderColor: accentColor,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                    },
                  ]}
                >
                  {isDone && !isCurrent && (
                    <Text style={styles.dotCheck}>{t('icon.check')}</Text>
                  )}
                  {isCurrent && (
                    <View style={[styles.dotInner, { backgroundColor: accentColor }]} />
                  )}
                </Animated.View>
                {stepInfo?.label && (
                  <Text
                    style={[styles.dotLabel, isCurrent && { color: accentColor, fontWeight: '700' }]}
                    numberOfLines={1}
                  >
                    {stepInfo.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.countRow}>
          <View style={[styles.countBadge, { borderColor: accentColor }]}>
            <Text style={[styles.countText, { color: accentColor }]}>
              {safeIndex + 1} / {totalCount}
            </Text>
          </View>
          <Text style={styles.countSub}>
            {totalCount - safeIndex - 1 > 0
              ? t('progress.remaining', { count: totalCount - safeIndex - 1 })
              : t('viewer.progress.complete')}
          </Text>
        </View>
      )}

      {/* Completion badge */}
      {completedAll && (
        <Animated.View
          style={[
            styles.completeBadge,
            { backgroundColor: accentColor, transform: [{ scale: completeAnim }] },
          ]}
        >
          <Text style={styles.completeIcon}>🏁</Text>
          <Text style={styles.completeText}>{t('viewer.progress.complete')}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingHorizontal: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  rightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  percent: {
    fontSize: 15,
    fontWeight: '800',
  },
  stepCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },
  barTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: 3,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dotWrapper: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCurrent: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotCheck: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '800',
  },
  dotLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    maxWidth: 40,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countBadge: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: {
    fontSize: 13,
    fontWeight: '800',
  },
  countSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 4,
  },
  completeIcon: { fontSize: 16 },
  completeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
