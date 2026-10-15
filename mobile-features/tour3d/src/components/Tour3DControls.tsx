import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

interface Tour3DControlsProps {
  currentIndex: number;
  totalCount: number;
  showAnnotations: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleAnnotations: () => void;
}

export function Tour3DControls({
  currentIndex,
  totalCount,
  showAnnotations,
  onPrevious,
  onNext,
  onToggleAnnotations,
}: Tour3DControlsProps) {
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  return (
    <View style={styles.container}>
      {/* Scene label */}
      <Text style={styles.sceneLabel}>
        {t('viewer.sceneLabel', { current: currentIndex + 1, total: totalCount })}
      </Text>

      {/* Navigation row */}
      <View style={styles.navRow}>
        <Pressable
          style={[styles.navButton, !hasPrevious && styles.navButtonDisabled]}
          onPress={onPrevious}
          disabled={!hasPrevious}
          accessibilityRole="button"
          accessibilityLabel={t('viewer.controls.previous')}
        >
          <Text style={[styles.navButtonText, !hasPrevious && styles.navButtonTextDisabled]}>
            {'→'}
          </Text>
          <Text style={[styles.navButtonLabel, !hasPrevious && styles.navButtonTextDisabled]}>
            {t('viewer.controls.previous')}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.annotationButton, showAnnotations && styles.annotationButtonActive]}
          onPress={onToggleAnnotations}
          accessibilityRole="button"
          accessibilityLabel={t('viewer.controls.toggleAnnotations')}
        >
          <Text style={styles.annotationButtonText}>📍</Text>
        </Pressable>

        <Pressable
          style={[styles.navButton, !hasNext && styles.navButtonDisabled]}
          onPress={onNext}
          disabled={!hasNext}
          accessibilityRole="button"
          accessibilityLabel={t('viewer.controls.next')}
        >
          <Text style={[styles.navButtonLabel, !hasNext && styles.navButtonTextDisabled]}>
            {t('viewer.controls.next')}
          </Text>
          <Text style={[styles.navButtonText, !hasNext && styles.navButtonTextDisabled]}>
            {'←'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    gap: 10,
  },
  sceneLabel: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.85,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#c9a84c',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#555',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  navButtonLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: '#999',
  },
  annotationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  annotationButtonActive: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
  },
  annotationButtonText: {
    fontSize: 20,
  },
});
