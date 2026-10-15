import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Tour3DAnnotation } from '@iraq-maps/contracts';
import { t } from '../strings';

const ICON_MAP: Record<string, string> = {
  info: 'ℹ️',
  place: '📍',
  photo: '📸',
  food: '🍽',
  mosque: '🕌',
  historic: '🏛',
  shop: '🛍',
};

interface TourAnnotationMarkerProps {
  annotation: Tour3DAnnotation;
  onPress?: (annotation: Tour3DAnnotation) => void;
}

export function TourAnnotationMarker({ annotation, onPress }: TourAnnotationMarkerProps) {
  const label = annotation.labelAr ?? annotation.labelEn ?? '';
  const icon = ICON_MAP[annotation.iconType] ?? '📍';

  return (
    <Pressable
      onPress={() => onPress?.(annotation)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('viewer.annotation.tapToLearnMore')}
    >
      <View style={styles.bubble}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.tail} />
      {label.length > 0 && (
        <View style={styles.labelContainer}>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    borderWidth: 2,
    borderColor: '#c9a84c',
  },
  tail: {
    width: 0,
    height: 0,
    borderStartWidth: 6,
    borderEndWidth: 6,
    borderTopWidth: 8,
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
    borderTopColor: '#c9a84c',
    marginTop: -1,
  },
  icon: {
    fontSize: 20,
  },
  labelContainer: {
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 120,
  },
  label: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
  },
});
