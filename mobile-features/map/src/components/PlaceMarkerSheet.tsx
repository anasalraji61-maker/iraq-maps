import type { PlaceSummary } from '@iraq-maps/contracts';
import { Button, tokens } from '@iraq-maps/ui';
import { useEffect, useRef, type ReactElement } from 'react';
import { Animated, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { openNow } from '../hours';
import { formatDistance, t } from '../strings';

export interface PlaceMarkerSheetProps {
  place: PlaceSummary | null;
  /** Localised display name already resolved by the caller. */
  name: string;
  /** Category icon emoji. */
  icon: string;
  /** Category label. */
  category: string | undefined;
  /** Whether the place is currently saved by the user. */
  isSaved?: boolean;
  /**
   * OSM opening_hours raw string, when available (e.g. from a cached place details call).
   * When provided, an Open / Closed badge is shown in the popup.
   */
  hoursRaw?: string | null;
  onViewDetails: () => void;
  onDirections: () => void;
  onDismiss: () => void;
  /** Called when the user taps Save / Saved. */
  onSave?: () => void;
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
  isSaved = false,
  hoursRaw,
  onViewDetails,
  onDirections,
  onDismiss,
  onSave,
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
  // Feature 3: open/closed badge from hoursRaw
  const openStatus: boolean | null = hoursRaw ? openNow(hoursRaw) : null;

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
          {openStatus !== null ? (
            <View style={[styles.openBadge, openStatus ? styles.openBadgeOpen : styles.openBadgeClosed]}>
              <RNText style={[styles.openBadgeText, openStatus ? styles.openBadgeTextOpen : styles.openBadgeTextClosed]}>
                {openStatus ? t('markerSheet.openBadge') : t('markerSheet.closedBadge')}
              </RNText>
            </View>
          ) : null}
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
          {onSave ? (
            <View style={styles.flex1}>
              <Button
                label={isSaved ? t('markerSheet.saved') : t('markerSheet.save')}
                onPress={onSave}
                variant={isSaved ? 'secondary' : 'primary'}
              />
            </View>
          ) : null}
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
    gap: space.s,
  },
  openBadge: { paddingHorizontal: space.s, paddingVertical: 2, borderRadius: 12 },
  openBadgeOpen: { backgroundColor: '#DCFCE7' },
  openBadgeClosed: { backgroundColor: '#FEE2E2' },
  openBadgeText: { fontSize: 12, fontWeight: '600' },
  openBadgeTextOpen: { color: '#16A34A' },
  openBadgeTextClosed: { color: '#DC2626' },
  meta: {
    flexDirection: 'row',
    gap: space.s,
  },
  actions: {
    flexDirection: 'row',
    gap: space.s,
  },
});
