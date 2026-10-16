/**
 * SearchAlongRouteScreen — search for services (fuel, food, ATM) along an active route.
 *
 * Shows:
 * - Category tabs (fuel / restaurants / ATMs)
 * - List of nearby places with detour time
 * - "Add to route" button for each result
 */
import type { RouteResult } from '@iraq-maps/contracts';
import { Button, Screen, Text, tokens } from '@iraq-maps/ui';
import { Text as RNText } from 'react-native';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlongCategory = 'fuel' | 'food' | 'atm';

export interface AlongRoutePlace {
  id: string;
  name: string;
  /** Distance from the nearest route point in metres. */
  distanceFromRouteM: number;
  /** Additional driving time in minutes if the driver detours here. */
  detourMinutes: number;
  /** Distance from the driver's current position in metres. */
  distanceFromUserM: number;
  /** Optional rating (0–5). */
  rating?: number;
  /** Whether the place is currently open. */
  isOpen?: boolean;
  category: AlongCategory;
}

export interface SearchAlongRouteScreenProps {
  route: RouteResult;
  places: AlongRoutePlace[];
  isLoading: boolean;
  error?: string;
  activeCategory: AlongCategory;
  onCategoryChange: (cat: AlongCategory) => void;
  onAddToRoute: (place: AlongRoutePlace) => void;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDist(m: number): string {
  return m < 1000
    ? t('searchAlong.m', { n: Math.round(m) })
    : t('searchAlong.km', { n: (m / 1000).toFixed(1) });
}

function categoryLabel(cat: AlongCategory): string {
  switch (cat) {
    case 'fuel': return t('searchAlong.fuel');
    case 'food': return t('searchAlong.food');
    case 'atm': return t('searchAlong.atm');
  }
}

function categoryEmoji(cat: AlongCategory): string {
  switch (cat) {
    case 'fuel': return '⛽';
    case 'food': return '🍽️';
    case 'atm': return '🏧';
  }
}

function RatingStars({ rating }: { rating: number }): ReactElement {
  const full = Math.round(rating);
  const stars = Array.from({ length: 5 }, (_, i) => (i < full ? '★' : '☆')).join('');
  return <Text style={itemStyles.rating}>{stars} {rating.toFixed(1)}</Text>;
}

// ─── Category tab ─────────────────────────────────────────────────────────────

function CategoryTab({
  cat,
  active,
  onPress,
}: {
  cat: AlongCategory;
  active: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[tabStyles.tab, active && tabStyles.tabActive]}
      testID={`along.tab.${cat}`}
    >
      <Text style={[tabStyles.label, active && tabStyles.labelActive]}>
        {categoryEmoji(cat)} {categoryLabel(cat)}
      </Text>
    </TouchableOpacity>
  );
}

const tabStyles = StyleSheet.create({
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
  },
  tabActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  label: { fontSize: 13, fontWeight: '500', color: tokens.color.text },
  labelActive: { color: '#2563EB', fontWeight: '700' },
});

// ─── Place row ────────────────────────────────────────────────────────────────

function PlaceRow({
  place,
  onAdd,
}: {
  place: AlongRoutePlace;
  onAdd: () => void;
}): ReactElement {
  return (
    <View style={itemStyles.row} testID={`along.place.${place.id}`}>
      <View style={itemStyles.iconWrap}>
        <Text style={itemStyles.emoji}>{categoryEmoji(place.category)}</Text>
      </View>
      <View style={itemStyles.body}>
        <RNText style={itemStyles.name} numberOfLines={1}>{place.name}</RNText>
        <View style={itemStyles.metaRow}>
          <Text tone="muted" style={itemStyles.meta}>
            {fmtDist(place.distanceFromUserM)}
          </Text>
          <Text style={[itemStyles.detour, place.detourMinutes <= 2 && itemStyles.detourGood]}>
            {t('searchAlong.detour', { min: place.detourMinutes })}
          </Text>
          {place.isOpen === false ? (
            <Text style={itemStyles.closed}>مغلق</Text>
          ) : null}
        </View>
        {place.rating != null ? <RatingStars rating={place.rating} /> : null}
      </View>
      <TouchableOpacity
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('searchAlong.addToRoute')}
        style={itemStyles.addBtn}
        testID={`along.add.${place.id}`}
      >
        <Text style={itemStyles.addBtnLabel}>+ {t('searchAlong.addToRoute')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const itemStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s,
    paddingVertical: tokens.space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.color.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: tokens.color.text },
  metaRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  meta: { fontSize: 12 },
  detour: { fontSize: 12, color: '#F59E0B', fontWeight: '500' },
  detourGood: { color: '#22C55E' },
  rating: { fontSize: 12, color: '#F59E0B' },
  closed: { fontSize: 12, color: '#EF4444' },
  addBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  addBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

const CATEGORIES: AlongCategory[] = ['fuel', 'food', 'atm'];

export function SearchAlongRouteScreen({
  places,
  isLoading,
  error,
  activeCategory,
  onCategoryChange,
  onAddToRoute,
  onClose,
}: SearchAlongRouteScreenProps): ReactElement {
  const filtered = places.filter((p) => p.category === activeCategory);

  return (
    <Screen testID="along.screen">
      {/* Header */}
      <View style={screenStyles.header}>
        <Text variant="title">{t('searchAlong.title')}</Text>
        <Button label={t('active.close')} variant="secondary" onPress={onClose} testID="along.close" />
      </View>

      {/* Category tabs */}
      <View style={screenStyles.tabs} accessibilityRole="tablist">
        {CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat}
            cat={cat}
            active={activeCategory === cat}
            onPress={() => onCategoryChange(cat)}
          />
        ))}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={screenStyles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text tone="muted">{t('searchAlong.searching')}</Text>
        </View>
      ) : error != null ? (
        <View style={screenStyles.center}>
          <Text tone="muted">{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={screenStyles.center}>
          <Text style={screenStyles.emptyEmoji}>{categoryEmoji(activeCategory)}</Text>
          <Text tone="muted">{t('searchAlong.noResults')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlaceRow
              place={item}
              onAdd={() => onAddToRoute(item)}
            />
          )}
          contentContainerStyle={screenStyles.list}
          showsVerticalScrollIndicator={false}
          testID="along.list"
        />
      )}
    </Screen>
  );
}

const screenStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: tokens.space.s,
  },
  tabs: {
    flexDirection: 'row',
    gap: tokens.space.s,
    flexWrap: 'wrap',
    paddingBottom: tokens.space.s,
  },
  list: { gap: 0, paddingBottom: tokens.space.l },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.space.s },
  emptyEmoji: { fontSize: 40 },
});
