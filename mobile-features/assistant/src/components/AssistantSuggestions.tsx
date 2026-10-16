/**
 * AssistantSuggestions — context-aware suggestion chips shown above the chat input.
 * Refreshes every 5 minutes. Suggestions are based on time-of-day, location, and
 * user history. No real API call; data comes from the stub generators below.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const _PRIMARY = '#1976D2';
const ICON_DISMISS = String.fromCharCode(0x2715);
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface SuggestionChip {
  id: string;
  text: string;
  icon: string;
  category: 'time' | 'location' | 'traffic' | 'history';
}

export interface AssistantSuggestionsProps {
  lat?: number;
  lng?: number;
  /** User visit history (place category strings) */
  recentCategories?: string[];
  /** Whether there is heavy traffic at the current location */
  heavyTraffic?: boolean;
  /** Called when the user taps a suggestion */
  onSelect: (text: string) => void;
  /** Optional label for the chip section */
  sectionLabel?: string;
}

// ─── Suggestion generators ────────────────────────────────────────────────────

function getHourOfDay(): number {
  return new Date().getHours();
}

function timeSuggestions(hour: number): SuggestionChip[] {
  if (hour >= 5 && hour < 11) {
    return [
      { id: 'ts-breakfast', text: t('suggestions.nearbyBreakfast'), icon: '🌅', category: 'time' },
      { id: 'ts-morning', text: t('suggestions.coffeeNearby'), icon: '☕', category: 'time' },
    ];
  }
  if (hour >= 11 && hour < 15) {
    return [
      { id: 'ts-lunch', text: t('suggestions.nearbyLunch'), icon: '🍽️', category: 'time' },
      { id: 'ts-pharmacy', text: t('suggestions.nearbyPharmacy'), icon: '💊', category: 'time' },
    ];
  }
  if (hour >= 15 && hour < 18) {
    return [
      { id: 'ts-cafe', text: t('suggestions.afternoonCafe'), icon: '☕', category: 'time' },
      { id: 'ts-shopping', text: t('suggestions.nearbyShops'), icon: '🛍️', category: 'time' },
    ];
  }
  if (hour >= 18 && hour < 22) {
    return [
      { id: 'ts-dinner', text: t('suggestions.nearbyDinner'), icon: '🌙', category: 'time' },
      { id: 'ts-park', text: t('suggestions.eveningParks'), icon: '🌳', category: 'time' },
    ];
  }
  return [
    { id: 'ts-24h', text: t('suggestions.open24h'), icon: '🕐', category: 'time' },
  ];
}

function locationSuggestions(lat?: number, lng?: number): SuggestionChip[] {
  if (lat == null || lng == null) return [];
  // Simple heuristic: Baghdad center ~33.3, 44.4
  const nearBaghdadCenter = Math.abs(lat - 33.3) < 0.05 && Math.abs(lng - 44.4) < 0.05;
  const nearMosul = Math.abs(lat - 36.33) < 0.1 && Math.abs(lng - 43.12) < 0.1;
  const nearErbil = Math.abs(lat - 36.19) < 0.1 && Math.abs(lng - 44.01) < 0.1;

  if (nearBaghdadCenter) {
    return [
      { id: 'loc-rashid', text: t('suggestions.exploreAlRashid'), icon: '🏛️', category: 'location' },
      { id: 'loc-museum', text: t('suggestions.iraqiMuseum'), icon: '🏺', category: 'location' },
    ];
  }
  if (nearMosul) {
    return [
      { id: 'loc-mosul', text: t('suggestions.mosulAttractions'), icon: '🕌', category: 'location' },
    ];
  }
  if (nearErbil) {
    return [
      { id: 'loc-erbil', text: t('suggestions.erbilCitadel'), icon: '🏰', category: 'location' },
    ];
  }
  return [
    { id: 'loc-area', text: t('suggestions.tellMeAboutArea'), icon: '📍', category: 'location' },
    { id: 'loc-nearby', text: t('suggestions.whatNearby'), icon: '🔍', category: 'location' },
  ];
}

function trafficSuggestions(heavyTraffic: boolean): SuggestionChip[] {
  if (!heavyTraffic) return [];
  return [
    { id: 'tr-alt', text: t('suggestions.alternateRoute'), icon: '🚗', category: 'traffic' },
    { id: 'tr-wait', text: t('suggestions.nearbyWait'), icon: '⏱️', category: 'traffic' },
  ];
}

function historySuggestions(recentCategories: string[]): SuggestionChip[] {
  const chips: SuggestionChip[] = [];
  if (recentCategories.includes('cafe')) {
    chips.push({ id: 'hist-cafe', text: t('suggestions.newCafes'), icon: '☕', category: 'history' });
  }
  if (recentCategories.includes('restaurant')) {
    chips.push({ id: 'hist-rest', text: t('suggestions.newRestaurants'), icon: '🍴', category: 'history' });
  }
  if (recentCategories.includes('hotel')) {
    chips.push({ id: 'hist-hotel', text: t('suggestions.hotelDeals'), icon: '🏨', category: 'history' });
  }
  if (chips.length === 0 && recentCategories.length > 0) {
    chips.push({ id: 'hist-more', text: t('suggestions.moreLike', { category: recentCategories[0]! }), icon: '🔄', category: 'history' });
  }
  return chips;
}

function buildSuggestions(
  lat?: number,
  lng?: number,
  recentCategories: string[] = [],
  heavyTraffic = false,
): SuggestionChip[] {
  const hour = getHourOfDay();
  const all = [
    ...timeSuggestions(hour),
    ...locationSuggestions(lat, lng),
    ...trafficSuggestions(heavyTraffic),
    ...historySuggestions(recentCategories),
  ];
  // Deduplicate by id, cap at 8
  const seen = new Set<string>();
  return all.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  }).slice(0, 8);
}

// ─── Chip animation wrapper ───────────────────────────────────────────────────

function AnimatedChip({
  chip,
  index,
  onPress,
  entering,
}: {
  chip: SuggestionChip;
  index: number;
  onPress: (text: string) => void;
  entering: boolean;
}): ReactElement {
  const translateY = useRef(new Animated.Value(entering ? 20 : 0)).current;
  const opacity = useRef(new Animated.Value(entering ? 0 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity, index]);

  const categoryColors: Record<SuggestionChip['category'], string> = {
    time: '#E8F5E9',
    location: '#E3F2FD',
    traffic: '#FFF3E0',
    history: '#F3E5F5',
  };
  const categoryBorderColors: Record<SuggestionChip['category'], string> = {
    time: '#A5D6A7',
    location: '#BBDEFB',
    traffic: '#FFCC80',
    history: '#CE93D8',
  };

  return (
    <Animated.View style={{ transform: [{ translateY }], opacity }}>
      <Pressable
        style={[
          styles.chip,
          {
            backgroundColor: categoryColors[chip.category],
            borderColor: categoryBorderColors[chip.category],
          },
        ]}
        onPress={() => onPress(chip.text)}
        accessibilityRole="button"
        accessibilityLabel={chip.text}
      >
        <Text style={styles.chipIcon}>{chip.icon}</Text>
        <Text style={styles.chipText} numberOfLines={2}>{chip.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssistantSuggestions({
  lat,
  lng,
  recentCategories = [],
  heavyTraffic = false,
  onSelect,
  sectionLabel,
}: AssistantSuggestionsProps): ReactElement | null {
  const [suggestions, setSuggestions] = useState<SuggestionChip[]>(() =>
    buildSuggestions(lat, lng, recentCategories, heavyTraffic),
  );
  const [entering, setEntering] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const isFirstMount = useRef(true);

  const refresh = useCallback(() => {
    setEntering(true);
    setSuggestions(buildSuggestions(lat, lng, recentCategories, heavyTraffic));
  }, [lat, lng, recentCategories, heavyTraffic]);

  // Refresh when props change (location update, traffic change)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    refresh();
  }, [lat, lng, heavyTraffic, refresh]);

  // Periodic refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleDismiss = () => {
    Animated.timing(containerOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setDismissed(true);
    });
  };

  if (dismissed || suggestions.length === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>{sectionLabel ?? t('suggestions.forYou')}</Text>
        <Pressable
          onPress={handleDismiss}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel={t('suggestions.dismiss')}
        >
          <Text style={styles.dismissBtnText} accessibilityElementsHidden>{ICON_DISMISS}</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={t('suggestions.containerA11y')}
      >
        {suggestions.map((chip, i) => (
          <AnimatedChip
            key={chip.id}
            chip={chip}
            index={i}
            onPress={text => {
              onSelect(text);
            }}
            entering={entering}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    textAlign: 'auto',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissBtnText: {
    color: '#BDBDBD',
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: 10,
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  chipIcon: {
    fontSize: 15,
  },
  chipText: {
    fontSize: 13,
    color: '#212121',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'auto',
  },
});
