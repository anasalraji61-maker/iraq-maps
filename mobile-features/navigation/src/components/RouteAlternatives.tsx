/**
 * RouteAlternatives — panel showing up to 3 route options before navigation starts.
 *
 * Features:
 * - Fastest / Shortest / Eco route cards
 * - Duration, distance, ETA per option
 * - Traffic-incident count badge
 * - Toll and highway/backroads indicators
 * - Animated selection highlight
 * - Full RTL support
 * - All text via t()
 */
import { t as tBase } from '../strings';
import { tokens } from '@iraq-maps/ui';

// Cast helper: preview.* keys exist at runtime but the NestedPaths type may not
// see them if the TypeScript literal inference misses them; use the same cast
// pattern as other navigation components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = tBase as (key: string, params?: Record<string, string | number>) => string;
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RouteVariantId = 'fastest' | 'shortest' | 'eco';

export interface RouteAlternative {
  id: RouteVariantId;
  /** Encoded polyline6 for map preview. */
  polyline6: string;
  /** Total duration in seconds. */
  durationS: number;
  /** Total distance in metres. */
  distanceM: number;
  /** Includes tolls? */
  hasToll: boolean;
  /** Primarily uses highways/motorways? */
  isHighway: boolean;
  /** Active traffic incident count on this route. */
  incidentCount: number;
  /** Traffic delay added to base duration (seconds). */
  trafficDelayS?: number;
}

export interface RouteAlternativesProps {
  routes: RouteAlternative[];
  selectedId: RouteVariantId;
  onSelect: (id: RouteVariantId) => void;
  onConfirm: (id: RouteVariantId) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.ceil((totalS % 3600) / 60);
  if (h === 0) return t('preview.durationMin', { n: Math.max(1, m) });
  if (m === 0) return t('preview.durationHour', { h });
  return t('preview.durationHourMin', { h, m });
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtEta(durationS: number): string {
  const eta = new Date(Date.now() + durationS * 1000);
  return eta.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function variantLabel(id: RouteVariantId): string {
  switch (id) {
    case 'fastest': return t('preview.altFastest');
    case 'shortest': return t('preview.altShortest');
    case 'eco': return t('preview.altRecommended');
  }
}

function variantEmoji(id: RouteVariantId): string {
  switch (id) {
    case 'fastest': return '⚡';
    case 'shortest': return '📏';
    case 'eco': return '🌿';
  }
}

function roadTypeLabel(isHighway: boolean): string {
  return isHighway ? t('preview.motorway') : t('preview.residential');
}

// ─── Single Route Card ────────────────────────────────────────────────────────

interface RouteCardProps {
  route: RouteAlternative;
  selected: boolean;
  isBest: boolean;
  onPress: () => void;
}

function RouteCard({ route, selected, isBest, onPress }: RouteCardProps): ReactElement {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const borderAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: selected ? 1.02 : 1,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }),
      Animated.timing(borderAnim, {
        toValue: selected ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [selected, scaleAnim, borderAnim]);

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.color.border, tokens.color.primary ?? '#2563EB'],
  });

  const bgColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.color.surface, '#EFF6FF'],
  });

  return (
    <Animated.View
      style={[
        cardStyles.card,
        { borderColor, backgroundColor: bgColor, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        style={cardStyles.inner}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${variantLabel(route.id)}: ${fmtDuration(route.durationS)}`}
        accessibilityState={{ selected }}
      >
        {/* Header row */}
        <View style={cardStyles.headerRow}>
          <RNText style={cardStyles.variantEmoji}>{variantEmoji(route.id)}</RNText>
          <RNText style={cardStyles.variantLabel}>{variantLabel(route.id)}</RNText>
          {isBest ? (
            <View style={cardStyles.bestBadge}>
              <RNText style={cardStyles.bestBadgeText}>{t('preview.altRecommended')}</RNText>
            </View>
          ) : null}
        </View>

        {/* Duration + distance */}
        <View style={cardStyles.metricsRow}>
          <RNText style={[cardStyles.duration, selected && cardStyles.durationSelected]}>
            {fmtDuration(route.durationS)}
          </RNText>
          <RNText style={cardStyles.dot}>·</RNText>
          <RNText style={cardStyles.distance}>{fmtDist(route.distanceM)}</RNText>
        </View>

        {/* ETA */}
        <RNText style={cardStyles.eta}>
          {t('preview.eta', { time: fmtEta(route.durationS) })}
        </RNText>

        {/* Traffic delay badge */}
        {route.trafficDelayS != null && route.trafficDelayS > 60 ? (
          <View style={cardStyles.delayBadge}>
            <RNText style={cardStyles.delayBadgeText}>
              {t('traffic.delayMin', { min: Math.ceil(route.trafficDelayS / 60) })}
            </RNText>
          </View>
        ) : null}

        {/* Tags row */}
        <View style={cardStyles.tagsRow}>
          {/* Road type */}
          <View style={cardStyles.tag}>
            <RNText style={cardStyles.tagText}>
              {route.isHighway ? '🛣️' : '🏘️'} {roadTypeLabel(route.isHighway)}
            </RNText>
          </View>

          {/* Toll */}
          {route.hasToll ? (
            <View style={[cardStyles.tag, cardStyles.tagToll]}>
              <RNText style={[cardStyles.tagText, cardStyles.tagTollText]}>
                💰 {t('preview.toll')}
              </RNText>
            </View>
          ) : null}

          {/* Incidents */}
          {route.incidentCount > 0 ? (
            <View style={[cardStyles.tag, cardStyles.tagIncident]}>
              <RNText style={[cardStyles.tagText, cardStyles.tagIncidentText]}>
                ⚠️ {route.incidentCount}
              </RNText>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    marginHorizontal: tokens.space.xs,
    width: 200,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  inner: {
    padding: tokens.space.m,
    gap: tokens.space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
  },
  variantEmoji: { fontSize: 18 },
  variantLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.text,
    flex: 1,
  },
  bestBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bestBadgeText: { fontSize: 10, fontWeight: '700', color: '#065F46' },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  duration: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.color.text,
  },
  durationSelected: {
    color: tokens.color.primary ?? '#2563EB',
  },
  dot: { fontSize: 16, color: tokens.color.border },
  distance: { fontSize: 14, color: '#6B7280' },
  eta: { fontSize: 13, color: '#6B7280' },
  delayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  delayBadgeText: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  tag: {
    backgroundColor: tokens.color.surface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  tagText: { fontSize: 11, color: tokens.color.text },
  tagToll: { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' },
  tagTollText: { color: '#9A3412' },
  tagIncident: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  tagIncidentText: { color: '#991B1B' },
});

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function RouteAlternatives({
  routes,
  selectedId,
  onSelect,
  onConfirm,
}: RouteAlternativesProps): ReactElement {
  const [localSelected, setLocalSelected] = useState<RouteVariantId>(selectedId);
  const confirmScaleAnim = useRef(new Animated.Value(1)).current;

  const handleSelect = useCallback(
    (id: RouteVariantId) => {
      setLocalSelected(id);
      onSelect(id);
      // Small bounce on confirm button
      Animated.sequence([
        Animated.timing(confirmScaleAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
        Animated.spring(confirmScaleAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 6 }),
      ]).start();
    },
    [onSelect, confirmScaleAnim],
  );

  // Fastest route = smallest durationS (using index 0 by convention)
  const bestIndex = routes.reduce(
    (best, r, i) => (r.durationS < routes[best]!.durationS ? i : best),
    0,
  );

  const selectedRoute = routes.find((r) => r.id === localSelected) ?? routes[0];

  return (
    <View style={panelStyles.container}>
      {/* Title */}
      <View style={panelStyles.titleRow}>
        <RNText style={panelStyles.title}>{t('preview.compareRoutes' as Parameters<typeof t>[0])}</RNText>
      </View>

      {/* Horizontally-scrollable route cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={panelStyles.cardsScroll}
        snapToInterval={212}
        decelerationRate="fast"
        accessibilityRole="list"
      >
        {routes.map((route, idx) => (
          <RouteCard
            key={route.id}
            route={route}
            selected={route.id === localSelected}
            isBest={idx === bestIndex}
            onPress={() => handleSelect(route.id)}
          />
        ))}
      </ScrollView>

      {/* Summary of selected route */}
      {selectedRoute != null ? (
        <View style={panelStyles.summaryRow}>
          <View style={panelStyles.summaryItem}>
            <RNText style={panelStyles.summaryLabel}>🕐</RNText>
            <RNText style={panelStyles.summaryValue}>
              {fmtDuration(selectedRoute.durationS)}
            </RNText>
          </View>
          <View style={panelStyles.summaryDivider} />
          <View style={panelStyles.summaryItem}>
            <RNText style={panelStyles.summaryLabel}>📍</RNText>
            <RNText style={panelStyles.summaryValue}>
              {fmtDist(selectedRoute.distanceM)}
            </RNText>
          </View>
          <View style={panelStyles.summaryDivider} />
          <View style={panelStyles.summaryItem}>
            <RNText style={panelStyles.summaryLabel}>🏁</RNText>
            <RNText style={panelStyles.summaryValue}>
              {fmtEta(selectedRoute.durationS)}
            </RNText>
          </View>
        </View>
      ) : null}

      {/* Confirm button */}
      <Animated.View style={{ transform: [{ scale: confirmScaleAnim }] }}>
        <Pressable
          style={({ pressed }) => [panelStyles.confirmBtn, pressed && panelStyles.confirmBtnPressed]}
          onPress={() => onConfirm(localSelected)}
          accessibilityRole="button"
          accessibilityLabel={t('preview.start')}
          testID="routes.confirm"
        >
          <RNText style={panelStyles.confirmBtnText}>
            {t('preview.start')} ←
          </RNText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.bg,
    paddingTop: tokens.space.s,
    paddingBottom: tokens.space.m,
    gap: tokens.space.s,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  titleRow: {
    paddingHorizontal: tokens.space.m,
    paddingBottom: tokens.space.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.text,
    writingDirection: 'rtl',
  },
  cardsScroll: {
    paddingHorizontal: tokens.space.m,
    paddingBottom: tokens.space.xs,
    gap: tokens.space.s,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: tokens.space.m,
    backgroundColor: tokens.color.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
    paddingVertical: tokens.space.s,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryLabel: { fontSize: 18 },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.text,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: tokens.color.border,
    marginVertical: 4,
  },
  confirmBtn: {
    marginHorizontal: tokens.space.m,
    backgroundColor: tokens.color.primary ?? '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 2,
  },
  confirmBtnPressed: {
    opacity: 0.88,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
