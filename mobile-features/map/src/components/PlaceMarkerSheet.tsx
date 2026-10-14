import type { PlaceSummary } from '@iraq-maps/contracts';
import { Button, tokens } from '@iraq-maps/ui';
import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { formatDistance, t } from '../strings';

export interface PlaceMarkerSheetProps {
  place: PlaceSummary | null;
  /** Localised display name already resolved by the caller. */
  name: string;
  /** Category icon emoji. */
  icon: string;
  /** Category label. */
  category: string | undefined;
  onViewDetails: () => void;
  onDirections: () => void;
  onDismiss: () => void;
}

const SHEET_HEIGHT = 160;

/**
 * Compact bottom sheet shown when the user taps a map marker.
 * Animates in/out with translateY; dismissible by swiping down or tapping the backdrop.
 * No external library — pure Animated.View with translateY.
 */
export function PlaceMarkerSheet({
  place,
  name,
  icon,
  category,
  onViewDetails,
  onDirections,
  onDismiss,
}: PlaceMarkerSheetProps): ReactElement | null {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  useEffect(() => {
    if (place) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 200, useNativeDriver: true }).start();
    }
  }, [place, translateY]);

  if (!place) return null;

  const distanceText = place.distanceM !== null && place.distanceM !== undefined ? formatDistance(place.distanceM) : undefined;

  return (
    <>
      {/* Backdrop — tap to dismiss */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityLabel={t('markerSheet.dismiss')}
      />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        {/* Drag handle */}
        <View style={styles.handle} />
        <View style={styles.header}>
          <RNText style={[styles.flex1, styles.titleText]} numberOfLines={1}>
            {`${icon} ${name}`}
          </RNText>
        </View>
        {(category || distanceText) ? (
          <View style={styles.meta}>
            {category ? <RNText style={styles.captionText}>{category}</RNText> : null}
            {distanceText ? <RNText style={styles.captionText}>{distanceText}</RNText> : null}
          </View>
        ) : null}
        <View style={styles.actions}>
          <View style={styles.flex1}>
            <Button label={t('markerSheet.viewDetails')} onPress={onViewDetails} />
          </View>
          <View style={styles.flex1}>
            <Button label={t('markerSheet.directions')} onPress={onDirections} />
          </View>
        </View>
      </Animated.View>
    </>
  );
}

const { color, space, radius, font } = tokens;
const styles = StyleSheet.create({
  flex1: { flex: 1 },
  titleText: { fontSize: font.size.subtitle, fontFamily: font.family, color: color.text },
  captionText: { fontSize: font.size.caption, fontFamily: font.family, color: color.textMuted },
  sheet: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: color.bg,
    borderTopStartRadius: radius.l,
    borderTopEndRadius: radius.l,
    padding: space.m,
    gap: space.s,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    marginBottom: space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    flexDirection: 'row',
    gap: space.s,
  },
  actions: {
    flexDirection: 'row',
    gap: space.s,
  },
});
