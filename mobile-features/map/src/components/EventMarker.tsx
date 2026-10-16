/**
 * EventMarker – map overlay markers for Iraq Smart Maps events.
 *
 * Renders event markers positioned in screen-space over a MapLibre camera layer,
 * following the same pattern as MapClusters and IncidentMarkers.
 *
 * Features:
 *  - Calendar icon with event-type colour per category
 *  - Category emoji icon inside the marker
 *  - Pulsing animation for "happening now" events
 *  - Cluster badge when multiple events share the same screen position
 *  - Accessible labels for screen readers
 */

/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import type { DiscoverEventType } from '@iraq-maps/contracts';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  I18nManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventMarkerItem {
  event: DiscoverEventType;
  /** Screen-space position in [x, y] pixels from the map origin. */
  screenX: number;
  screenY: number;
}

interface EventCluster {
  id: string;
  count: number;
  x: number;
  y: number;
  /** The dominant category among members. */
  dominantCategory: string;
  /** If count === 1, the single event. */
  solo?: EventMarkerItem;
  /** Whether any member is happening right now. */
  hasLive: boolean;
}

export interface EventMarkerProps {
  /** Events already projected to screen coordinates by the parent map screen. */
  markers: EventMarkerItem[];
  /** Called when user taps a single event marker. */
  onEventPress: (event: DiscoverEventType) => void;
  /** Called when user taps a cluster; map should zoom in. */
  onClusterPress: (clusterId: string, lat: number, lng: number) => void;
  /** Current map zoom level (0–22). */
  zoom: number;
}

// ─── Category configuration ───────────────────────────────────────────────────

interface CategoryConfig {
  color: string;
  icon: string;
  label: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  cultural:      { color: '#9C27B0', icon: '🎭', label: 'ثقافي' },
  food:          { color: '#FF9800', icon: '🍽️', label: 'طعام' },
  sport:         { color: '#4CAF50', icon: '⚽', label: 'رياضي' },
  business:      { color: '#2196F3', icon: '💼', label: 'أعمال' },
  education:     { color: '#00BCD4', icon: '📚', label: 'تعليمي' },
  entertainment: { color: '#E91E63', icon: '🎉', label: 'ترفيهي' },
  social:        { color: '#607D8B', icon: '👥', label: 'اجتماعي' },
  concert:       { color: '#F44336', icon: '🎵', label: 'حفل' },
  exhibition:    { color: '#795548', icon: '🖼️', label: 'معرض' },
  workshop:      { color: '#009688', icon: '🔧', label: 'ورشة' },
  sports:        { color: '#4CAF50', icon: '🏅', label: 'رياضة' },
  food_festival: { color: '#FF5722', icon: '🍜', label: 'مهرجان طعام' },
  religious:     { color: '#3F51B5', icon: '🕌', label: 'ديني' },
  community:     { color: '#8BC34A', icon: '🏘️', label: 'مجتمعي' },
  other:         { color: '#9E9E9E', icon: '📌', label: 'أخرى' },
};

const DEFAULT_CONFIG: CategoryConfig = { color: '#9E9E9E', icon: '📌', label: 'فعالية' };

function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORY_CONFIG[category] ?? DEFAULT_CONFIG;
}

// ─── Is happening now ─────────────────────────────────────────────────────────

function isHappeningNow(event: DiscoverEventType): boolean {
  const now = Date.now();
  return (
    new Date(event.startTime).getTime() <= now &&
    new Date(event.endTime).getTime() >= now
  );
}

// ─── Clustering algorithm ─────────────────────────────────────────────────────

/** Cell size in pixels at which markers are merged into a cluster. */
function clusterCellSize(zoom: number): number {
  if (zoom >= 16) return 30;
  if (zoom >= 13) return 50;
  if (zoom >= 10) return 80;
  return 120;
}

function clusterMarkers(markers: EventMarkerItem[], zoom: number): EventCluster[] {
  const cellSize = clusterCellSize(zoom);
  const cells = new Map<string, EventMarkerItem[]>();

  for (const m of markers) {
    const cx = Math.floor(m.screenX / cellSize);
    const cy = Math.floor(m.screenY / cellSize);
    const key = `${cx}:${cy}`;
    const existing = cells.get(key) ?? [];
    existing.push(m);
    cells.set(key, existing);
  }

  const clusters: EventCluster[] = [];
  let id = 0;

  for (const [, members] of cells) {
    const x = members.reduce((s, m) => s + m.screenX, 0) / members.length;
    const y = members.reduce((s, m) => s + m.screenY, 0) / members.length;

    // Dominant category = most frequent
    const catFreq = new Map<string, number>();
    for (const m of members) {
      catFreq.set(m.event.category, (catFreq.get(m.event.category) ?? 0) + 1);
    }
    let dominantCategory = 'other';
    let maxFreq = 0;
    for (const [cat, freq] of catFreq) {
      if (freq > maxFreq) { maxFreq = freq; dominantCategory = cat; }
    }

    const hasLive = members.some((m) => isHappeningNow(m.event));

    clusters.push({
      id: String(id++),
      count: members.length,
      x,
      y,
      dominantCategory,
      solo: members.length === 1 ? members[0] : undefined,
      hasLive,
    });
  }

  return clusters;
}

// ─── Pulsing ring animation ───────────────────────────────────────────────────

function PulseRing({ color }: { color: string }): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={[
        pulseStyles.ring,
        { borderColor: color, transform: [{ scale }], opacity },
      ]}
      pointerEvents="none"
    />
  );
}

const pulseStyles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    top: -10,
    start: -10,
  },
});

// ─── Single event marker pin ──────────────────────────────────────────────────

function EventPin({
  item,
  onPress,
}: {
  item: EventMarkerItem;
  onPress: () => void;
}): ReactElement {
  const cfg = getCategoryConfig(item.event.category);
  const live = isHappeningNow(item.event);

  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 60,
      friction: 5,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const shortTitle =
    item.event.title.length > 18
      ? `${item.event.title.slice(0, 18)}…`
      : item.event.title;

  return (
    <Animated.View
      style={[
        pinStyles.wrapper,
        { left: item.screenX - 24, top: item.screenY - 56 },
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      {live && <PulseRing color={cfg.color} />}

      <TouchableOpacity
        style={[pinStyles.pin, { backgroundColor: cfg.color }]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${item.event.title} — ${cfg.label}`}
      >
        <Text style={pinStyles.icon}>{cfg.icon}</Text>
        {live && <View style={pinStyles.liveDot} />}
      </TouchableOpacity>

      {/* tail */}
      <View style={[pinStyles.tail, { borderTopColor: cfg.color }]} />

      {/* label bubble */}
      <View style={[pinStyles.label, { borderColor: cfg.color }]}>
        <Text style={pinStyles.labelText} numberOfLines={1}>
          {shortTitle}
        </Text>
      </View>
    </Animated.View>
  );
}

const pinStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    alignItems: 'center',
    width: 48,
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  icon: { fontSize: 20 },
  liveDot: {
    position: 'absolute',
    top: 2,
    end: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF1744',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  tail: {
    width: 0,
    height: 0,
    borderStartWidth: 8,
    borderEndWidth: 8,
    borderTopWidth: 10,
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
    marginTop: -1,
  },
  label: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
    maxWidth: 100,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  labelText: { fontSize: 10, color: '#222', fontWeight: '600', textAlign: 'center' },
});

// ─── Cluster bubble ───────────────────────────────────────────────────────────

function ClusterBubble({
  cluster,
  onPress,
}: {
  cluster: EventCluster;
  onPress: () => void;
}): ReactElement {
  const cfg = getCategoryConfig(cluster.dominantCategory);

  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 5,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // Size scales with count
  const size = cluster.count <= 5 ? 42 : cluster.count <= 20 ? 52 : 62;

  return (
    <Animated.View
      style={[
        clusterStyles.wrapper,
        {
          left: cluster.x - size / 2,
          top: cluster.y - size / 2,
          width: size,
          height: size,
        },
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      {cluster.hasLive && <PulseRing color={cfg.color} />}

      <TouchableOpacity
        style={[
          clusterStyles.bubble,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: cfg.color,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${cluster.count} فعاليات — ${cfg.label}`}
      >
        <Text style={clusterStyles.categoryIcon}>{getCategoryConfig(cluster.dominantCategory).icon}</Text>
        <Text style={[clusterStyles.count, { fontSize: cluster.count >= 100 ? 11 : 13 }]}>
          {cluster.count}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const clusterStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  categoryIcon: { fontSize: 14, marginBottom: -2 },
  count: { color: '#FFF', fontWeight: '800', lineHeight: 16 },
});

// ─── EventMarker ──────────────────────────────────────────────────────────────

/**
 * EventMarker renders all event markers for a map view.
 *
 * Position the `<EventMarker />` absolutely over the map surface.
 * Pass events already projected to screen-space coordinates by the parent.
 * The component handles clustering internally based on the current zoom level.
 */
export function EventMarker({
  markers,
  onEventPress,
  onClusterPress,
  zoom,
}: EventMarkerProps): ReactElement {
  const clusters = useMemo(
    () => clusterMarkers(markers, zoom),
    [markers, zoom],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {clusters.map((cluster) =>
        cluster.count === 1 && cluster.solo ? (
          <EventPin
            key={cluster.id}
            item={cluster.solo}
            onPress={() => {
              if (cluster.solo) onEventPress(cluster.solo.event);
            }}
          />
        ) : (
          <ClusterBubble
            key={cluster.id}
            cluster={cluster}
            onPress={() => {
              // Find centroid in event lat/lng space for zoom-in
              const lat = cluster.solo?.event.lat ?? 33.3152;
              const lng = cluster.solo?.event.lng ?? 44.3661;
              onClusterPress(cluster.id, lat, lng);
            }}
          />
        ),
      )}
    </View>
  );
}
