/**
 * MapClusters – cluster overlapping place markers on a MapLibre map.
 *
 * Uses a pure-JS spatial clustering algorithm (grid-based) so there are
 * no native dependencies beyond react-native-maps / MapLibre.  The component
 * is rendered over the MapLibre camera layer; each cluster is an Animated
 * circle with a count badge that zooms the camera in on tap.
 *
 * Props match the pattern used by IncidentMarkers and other overlay components
 * in this codebase.
 *
 * Algorithm:
 *  - Bucket markers into a lat/lng grid whose cell size scales with zoom level.
 *  - Each non-empty cell becomes a cluster pinned at the mean lat/lng of its members.
 *  - Cells with one member are shown as individual markers.
 *  - When the camera zooms past the cluster threshold the markers animate back to
 *    their individual positions (scale 1 → 0 on cluster, 0 → 1 on marker).
 *
 * Color: clusters are tinted by the dominant category in the cell.
 */

import type { PlaceCategory, PlaceSummary } from '@iraq-maps/contracts';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  I18nManager,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ClusterableMarker {
  place: PlaceSummary;
  /** Localised display name, pre-computed by the parent. */
  name: string;
  /** Category icon emoji, e.g. "🍽". */
  icon: string;
  /** Screen-space position in [x, y] pixels from the map origin. */
  screenX: number;
  screenY: number;
}

interface Cluster {
  id: string;
  /** Member count. */
  count: number;
  /** Centre screen position. */
  x: number;
  y: number;
  /** Dominant category among members. */
  category: PlaceCategory | null;
  /** The single marker when count === 1. */
  solo?: ClusterableMarker;
}

export interface MapClustersProps {
  /** All visible markers at the current viewport. */
  markers: ClusterableMarker[];
  /** Current zoom level (1–22). Clustering is active when zoom < clusterThreshold. */
  zoom: number;
  /** Zoom level at which individual markers are shown instead of clusters. Default 14. */
  clusterThreshold?: number;
  /** Cluster cell size in screen pixels. Default 60. */
  cellSize?: number;
  onMarkerPress: (marker: ClusterableMarker) => void;
  /** Called when a cluster is tapped; caller should zoom in. */
  onClusterPress: (cluster: Cluster) => void;
}

// ── Category colours ──────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  food: '#E53935',
  cafe: '#6D4C41',
  lodging: '#1565C0',
  shopping: '#E91E63',
  tourism: '#00897B',
  health: '#43A047',
  finance: '#546E7A',
  fuel: '#F57C00',
  office: '#5C6BC0',
  worship: '#8D6E63',
  education: '#0277BD',
  government: '#37474F',
  transport: '#F4511E',
  entertainment: '#8E24AA',
  default: '#78909C',
};

function clusterColor(category: PlaceCategory | null): string {
  return CATEGORY_COLOR[category ?? 'default'] ?? CATEGORY_COLOR['default']!;
}

// ── Clustering algorithm ──────────────────────────────────────────────────────

function buildClusters(markers: ClusterableMarker[], cellSize: number): Cluster[] {
  const cells = new Map<string, ClusterableMarker[]>();

  for (const m of markers) {
    const cellX = Math.floor(m.screenX / cellSize);
    const cellY = Math.floor(m.screenY / cellSize);
    const key = `${cellX}:${cellY}`;
    const cell = cells.get(key);
    if (cell) cell.push(m);
    else cells.set(key, [m]);
  }

  const clusters: Cluster[] = [];
  for (const [key, members] of cells) {
    const cx = members.reduce((s, m) => s + m.screenX, 0) / members.length;
    const cy = members.reduce((s, m) => s + m.screenY, 0) / members.length;

    // Dominant category: most frequent non-null category in cell
    const catFreq = new Map<string, number>();
    for (const m of members) {
      if (m.place.category) {
        catFreq.set(m.place.category, (catFreq.get(m.place.category) ?? 0) + 1);
      }
    }
    let dominantCat: PlaceCategory | null = null;
    let maxFreq = 0;
    for (const [cat, freq] of catFreq) {
      if (freq > maxFreq) { dominantCat = cat as PlaceCategory; maxFreq = freq; }
    }

    clusters.push({
      id: key,
      count: members.length,
      x: cx,
      y: cy,
      category: dominantCat,
      solo: members.length === 1 ? members[0] : undefined,
    });
  }

  return clusters;
}

// ── Main component ────────────────────────────────────────────────────────────

export function MapClusters({
  markers,
  zoom,
  clusterThreshold = 14,
  cellSize = 60,
  onMarkerPress,
  onClusterPress,
}: MapClustersProps): ReactElement {
  const isClustered = zoom < clusterThreshold;

  const clusters = useMemo(
    () => (isClustered ? buildClusters(markers, cellSize) : markers.map((m) => ({
      id: m.place.id,
      count: 1,
      x: m.screenX,
      y: m.screenY,
      category: m.place.category,
      solo: m,
    }))),
    [markers, isClustered, cellSize],
  );

  return (
    <>
      {clusters.map((cluster) =>
        cluster.count > 1 ? (
          <ClusterBubble
            key={cluster.id}
            cluster={cluster}
            onPress={() => onClusterPress(cluster)}
          />
        ) : cluster.solo ? (
          <SingleMarker
            key={cluster.solo.place.id}
            marker={cluster.solo}
            onPress={() => onMarkerPress(cluster.solo!)}
          />
        ) : null,
      )}
    </>
  );
}

// ── Cluster bubble ─────────────────────────────────────────────────────────────

interface ClusterBubbleProps {
  cluster: Cluster;
  onPress: () => void;
}

function ClusterBubble({ cluster, onPress }: ClusterBubbleProps): ReactElement {
  const scale = useRef(new Animated.Value(0)).current;
  const color = clusterColor(cluster.category);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
      speed: 14,
    }).start();
    return () => {
      Animated.timing(scale, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    };
  }, [scale]);

  // Bubble size scales with cluster population (capped at 60px)
  const size = Math.min(60, 36 + Math.log2(cluster.count) * 6);

  return (
    <Animated.View
      style={[
        bubbleStyles.wrap,
        {
          // eslint-disable-next-line no-restricted-syntax
          left: cluster.x - size / 2,
          top: cluster.y - size / 2,
          transform: [{ scale }],
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('cluster.label', { count: cluster.count })}
        style={[
          bubbleStyles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ]}
        activeOpacity={0.8}
      >
        <RNText style={[bubbleStyles.count, { fontSize: cluster.count > 99 ? 11 : 14 }]}>
          {cluster.count > 999 ? '999+' : String(cluster.count)}
        </RNText>
      </TouchableOpacity>
      {/* Outer ring for density feel */}
      <View
        style={[
          bubbleStyles.ring,
          {
            width: size + 10,
            height: size + 10,
            borderRadius: (size + 10) / 2,
            borderColor: color,
            top: -5,
            start: -5,
          },
        ]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  count: { color: '#fff', fontWeight: '700' },
  ring: { position: 'absolute', borderWidth: 1.5, opacity: 0.35 },
});

// ── Single marker ─────────────────────────────────────────────────────────────

interface SingleMarkerProps {
  marker: ClusterableMarker;
  onPress: () => void;
}

function SingleMarker({ marker, onPress }: SingleMarkerProps): ReactElement {
  const scale = useRef(new Animated.Value(0)).current;
  const color = clusterColor(marker.place.category);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 12,
    }).start();
    return () => {
      Animated.timing(scale, { toValue: 0, duration: 100, useNativeDriver: true }).start();
    };
  }, [scale]);

  return (
    <Animated.View
      style={[
        markerStyles.wrap,
        {
          // eslint-disable-next-line no-restricted-syntax
          left: marker.screenX - 18,
          top: marker.screenY - 36,
          transform: [{ scale }],
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={marker.name}
        activeOpacity={0.8}
      >
        <View style={[markerStyles.pin, { backgroundColor: color }]}>
          <RNText style={markerStyles.icon}>{marker.icon}</RNText>
        </View>
        <View style={[markerStyles.tail, { borderTopColor: color }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const markerStyles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  pin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  icon: { fontSize: 18 },
  tail: {
    width: 0,
    height: 0,
    borderStartWidth: 6,
    borderEndWidth: 6,
    borderTopWidth: 8,
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
  },
});
