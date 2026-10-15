/**
 * TourOverlay: a self-contained, step-through tooltip component for feature discovery.
 * All text arrives as pre-translated strings — callers use their own t() before passing.
 *
 * @example
 * <TourOverlay
 *   visible={showTour}
 *   steps={[
 *     { id: 'like',   title: t('tour.like.title'),   body: t('tour.like.body') },
 *     { id: 'search', title: t('tour.search.title'), body: t('tour.search.body') },
 *   ]}
 *   nextLabel={t('tour.next')}
 *   doneLabel={t('tour.done')}
 *   skipLabel={t('tour.skip')}
 *   onDone={() => setShowTour(false)}
 * />
 */
import { useCallback, useState, type ReactElement } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TOUR_DONE_KEY = '@iraq-maps/tour-v1-done';

export interface TourStep {
  id: string;
  title: string;
  body?: string;
}

interface Props {
  visible: boolean;
  steps: TourStep[];
  nextLabel: string;
  doneLabel: string;
  skipLabel: string;
  onDone: () => void;
}

/** Overlay that walks the user through feature-discovery steps. */
export function TourOverlay({ visible, steps, nextLabel, doneLabel, skipLabel, onDone }: Props): ReactElement | null {
  const [idx, setIdx] = useState(0);

  const advance = useCallback(() => {
    const next = idx + 1;
    if (next >= steps.length) {
      void markDone(onDone);
    } else {
      setIdx(next);
      AccessibilityInfo.announceForAccessibility(steps[next]?.title ?? '');
    }
  }, [idx, steps, onDone]);

  const skip = useCallback(() => {
    void markDone(onDone);
  }, [onDone]);

  if (!visible || steps.length === 0) return null;
  const step = steps[idx];
  if (!step) return null;

  const isLast = idx === steps.length - 1;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={skip}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        {/* Tap backdrop to skip */}
        <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel={skipLabel} />

        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.title} accessibilityRole="header">
            {step.title}
          </Text>
          {step.body ? <Text style={styles.body}>{step.body}</Text> : null}

          {/* step dots */}
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View
                key={s.id}
                style={[styles.dot, i === idx && styles.dotActive]}
                accessibilityElementsHidden
              />
            ))}
          </View>

          <View style={styles.actions}>
            {!isLast && (
              <Pressable onPress={skip} style={styles.skipBtn} accessibilityRole="button">
                <Text style={styles.skipText}>{skipLabel}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={advance}
              style={styles.nextBtn}
              accessibilityRole="button"
            >
              <Text style={styles.nextText}>{isLast ? doneLabel : nextLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

async function markDone(onDone: () => void) {
  try {
    await AsyncStorage.setItem(TOUR_DONE_KEY, '1');
  } catch {
    // ignore storage errors
  }
  onDone();
}

/** Returns true if the tour has not been seen yet. Call once after login. */
export async function shouldShowTour(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(TOUR_DONE_KEY);
    return !val;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B1F24',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#545B64',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C4C9CF',
  },
  dotActive: {
    backgroundColor: '#0A6B4B',
    width: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 15,
    color: '#545B64',
  },
  nextBtn: {
    flex: 1,
    backgroundColor: '#0A6B4B',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  nextText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
