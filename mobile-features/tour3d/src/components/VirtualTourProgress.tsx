import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

interface VirtualTourProgressProps {
  currentIndex: number;
  totalCount: number;
}

export function VirtualTourProgress({ currentIndex, totalCount }: VirtualTourProgressProps) {
  const progress = totalCount > 0 ? (currentIndex + 1) / totalCount : 0;
  const isComplete = currentIndex >= totalCount - 1 && totalCount > 0;

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}>
      <View style={styles.header}>
        <Text style={styles.label}>{t('viewer.progress.label')}</Text>
        {isComplete && (
          <Text style={styles.completeLabel}>{t('viewer.progress.complete')}</Text>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <View style={styles.dots}>
        {Array.from({ length: totalCount }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.dotActive,
              i < currentIndex && styles.dotCompleted,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  completeLabel: {
    fontSize: 12,
    color: '#c9a84c',
    fontWeight: '600',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#c9a84c',
    borderRadius: 2,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    backgroundColor: '#c9a84c',
    transform: [{ scale: 1.25 }],
  },
  dotCompleted: {
    backgroundColor: 'rgba(201, 168, 76, 0.5)',
  },
});
