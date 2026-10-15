/**
 * Small horizontal chip strip showing nearby POIs during active navigation.
 * Categories: fuel, food, cafe. Tapping a chip opens the place details page.
 */
import type { CityDescriptor, LngLat, PlaceSummary } from '@iraq-maps/contracts';
import { pickName } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, useApi } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { t } from '../strings';

const NEARBY_CATEGORIES = ['fuel', 'food', 'cafe'] as const;
const NEARBY_RADIUS_M = 500;
const NEARBY_LIMIT = 6;

const CATEGORY_ICONS: Record<string, string> = {
  fuel: '⛽',
  food: '🍽️',
  cafe: '☕',
};

interface Props {
  city: CityDescriptor;
  /** Current user position (lon, lat). */
  position: LngLat | null;
}

/** Renders small chips for nearby fuel/food/cafe during navigation. */
export function NearbyNavChips({ city, position }: Props): ReactElement | null {
  const api = useApi();
  const router = useRouter();
  const lang = getLocale();
  const [places, setPlaces] = useState<PlaceSummary[]>([]);

  useEffect(() => {
    if (!position) return;
    const near = position.map((v) => v.toFixed(5)).join(',');
    // Fetch each category separately and merge
    void Promise.all(
      NEARBY_CATEGORIES.map((cat) =>
        api.places
          .nearby({ query: { city: city.id, near, radiusM: NEARBY_RADIUS_M, limit: 2, category: cat } })
          .then((res) => (res.status === 200 ? res.body.items : []))
          .catch(() => [] as PlaceSummary[]),
      ),
    ).then((arrays) => setPlaces(arrays.flat().slice(0, NEARBY_LIMIT)));
    // Re-fetch when position changes significantly (~100 m)
  }, [api, city.id, position?.[0]?.toFixed(3), position?.[1]?.toFixed(3)]);

  if (!places.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
      accessibilityLabel={t('nearbyNav.title')}
    >
      {places.map((place) => {
        const name = pickName(place.names, lang);
        const icon = place.category ? (CATEGORY_ICONS[place.category] ?? '📍') : '📍';
        const dist = place.distanceM != null ? `${Math.round(place.distanceM)}م` : '';
        return (
          <Pressable
            key={place.id}
            style={styles.chip}
            onPress={() => router.push(href('place', { placeId: place.id }))}
            accessibilityRole="button"
            accessibilityLabel={name}
          >
            <Text style={styles.icon}>{icon}</Text>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            {dist ? <Text style={styles.dist}>{dist}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { maxHeight: 56 },
  content: { gap: 8, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    maxWidth: 160,
  },
  icon: { fontSize: 14 },
  name: { fontSize: 12, color: '#222', fontWeight: '500', flexShrink: 1 },
  dist: { fontSize: 11, color: '#888' },
});
