/**
 * HeatmapLayer — MapLibre heatmap overlay for crowding data.
 *
 * Features:
 *  - Fetches /v1/crowding/heatmap every 5 minutes (live) or on demand (historic).
 *  - Intensity gradient: green → yellow → orange → red.
 *  - "ازدحام الآن" toggle button to show/hide the layer.
 *  - Floating legend overlay.
 *  - Fades to 30 % opacity when offline (detects via NetInfo).
 *  - RTL-safe: all flex uses start/end, text via t().
 *
 * Architecture notes:
 *  - Does NOT import from modules/* — all data comes through the API URL prop.
 *  - All text goes through the t() prop (caller provides the bound translator).
 *  - Works as a standalone MapLibre layer component; host adds it inside a <MapView>.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal MapLibre layer/source shape — avoids hard dep on ml-js internals. */
interface MLSource {
  setData(data: GeoJSON.FeatureCollection): void;
}

/** Props type for the MapLibre GeoJSONSource + Layer passed from host. */
export interface HeatmapLayerHostProps {
  /** Fully-qualified API base URL, e.g. "https://api.iraq-maps.app". */
  apiBaseUrl: string;
  /**
   * Current visible bbox as "west,south,east,north".
   * Parent map should debounce camera-change events before updating this.
   */
  bbox: string;
  /**
   * When set, the layer displays projected crowding for this ISO datetime
   * instead of live data.
   */
  projectedTime?: string;
  /** Called with the MapLibre source id so the host can add layers beneath. */
  onSourceReady?: (sourceId: string) => void;
  /** Whether the heatmap toggle is visible (default true). */
  showToggle?: boolean;
  /** Override initial visibility (default false — user opts in). */
  defaultVisible?: boolean;
  /** t() bound to the feature namespace. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Children rendered inside the map container (MapLibre layers/sources). */
  children?: (props: {
    sourceId: string;
    visible: boolean;
    geoJSON: GeoJSON.FeatureCollection;
  }) => ReactElement | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEATMAP_SOURCE_ID = 'crowding-heatmap-source';
const HEATMAP_LAYER_ID = 'crowding-heatmap';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const OFFLINE_OPACITY = 0.3;
const ONLINE_OPACITY = 1.0;

/** MapLibre heatmap-color expression: intensity 0–1 → colour. */
export const HEATMAP_COLOR_EXPR = [
  'interpolate',
  ['linear'],
  ['heatmap-density'],
  0,   'rgba(0,0,0,0)',
  0.1, 'rgba(67,160,71,0.6)',   // green
  0.3, 'rgba(156,204,101,0.7)', // light green
  0.5, 'rgba(251,192,45,0.8)',  // yellow
  0.7, 'rgba(251,140,0,0.9)',   // orange
  0.9, 'rgba(229,57,53,1.0)',   // red
  1.0, 'rgba(183,28,28,1.0)',   // dark red
] as const;

/** MapLibre heatmap-weight expression driven by the GeoJSON "intensity" property. */
export const HEATMAP_WEIGHT_EXPR = [
  'interpolate',
  ['linear'],
  ['get', 'intensity'],
  0, 0,
  1, 1,
] as const;

/** MapLibre heatmap radius — grows with zoom level. */
export const HEATMAP_RADIUS_EXPR = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10, 15,
  14, 35,
  17, 60,
] as const;

/** MapLibre heatmap opacity — fades in as you zoom. */
export const HEATMAP_OPACITY_EXPR = [
  'interpolate',
  ['linear'],
  ['zoom'],
  10, 0.5,
  14, 0.8,
  17, 0.85,
] as const;

// ── Legend colours (must match HEATMAP_COLOR_EXPR) ───────────────────────────

const LEGEND_STEPS = [
  { label: 'heatmap.legendLow',    color: 'rgba(67,160,71,0.8)' },
  { label: 'heatmap.legendMedium', color: 'rgba(251,192,45,0.9)' },
  { label: 'heatmap.legendHigh',   color: 'rgba(251,140,0,1.0)' },
  { label: 'heatmap.legendVeryHigh', color: 'rgba(229,57,53,1.0)' },
] as const;

// ── GeoJSON builder ───────────────────────────────────────────────────────────

interface HeatmapPoint {
  lng: number;
  lat: number;
  intensity: { value: number };
}

function toGeoJSON(points: HeatmapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { intensity: p.intensity.value },
    })),
  };
}

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── Legend component ──────────────────────────────────────────────────────────

function HeatmapLegend({ t }: { t: (key: string) => string }): ReactElement {
  return (
    <View style={legendStyles.container} pointerEvents="none">
      <View style={legendStyles.title_row}>
        <View style={legendStyles.title_dot} />
      </View>
      {LEGEND_STEPS.map((step) => (
        <View key={step.label} style={legendStyles.row}>
          <View style={[legendStyles.swatch, { backgroundColor: step.color }]} />
          <View style={legendStyles.label_wrapper}>
            {/* Text component injected by caller to avoid cross-package import */}
            <RawText style={legendStyles.label}>{t(step.label)}</RawText>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Minimal RawText (avoids importing @iraq-maps/ui from map-kit) ─────────────
import { Text } from 'react-native';
const RawText = Text;

// ── Toggle button ─────────────────────────────────────────────────────────────

interface ToggleButtonProps {
  visible: boolean;
  loading: boolean;
  offline: boolean;
  onPress: () => void;
  t: (key: string) => string;
}

function ToggleButton({ visible, loading, offline, onPress, t }: ToggleButtonProps): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={[
        toggleStyles.button,
        visible && toggleStyles.buttonActive,
        offline && toggleStyles.buttonOffline,
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('heatmap.toggleA11y')}
      accessibilityState={{ checked: visible }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={visible ? '#fff' : '#1565C0'} />
      ) : (
        <RawText style={[toggleStyles.label, visible && toggleStyles.labelActive]}>
          {t('heatmap.toggleLabel')}
        </RawText>
      )}
    </Pressable>
  );
}

// ── Offline fade animation ────────────────────────────────────────────────────

function useOfflineFade(offline: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(ONLINE_OPACITY)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: offline ? OFFLINE_OPACITY : ONLINE_OPACITY,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [offline, opacity]);

  return opacity;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * HeatmapLayer — renders the crowding heatmap toggle + legend.
 * The actual MapLibre GeoJSONSource and HeatmapLayer are exposed via the
 * `children` render-prop so the host MapView can receive them inside its
 * render tree (required by @maplibre/maplibre-react-native).
 *
 * Usage:
 * ```tsx
 * <HeatmapLayer apiBaseUrl={API_URL} bbox={bbox} t={t}>
 *   {({ sourceId, visible, geoJSON }) =>
 *     visible ? (
 *       <>
 *         <GeoJSONSource id={sourceId} shape={geoJSON} />
 *         <HeatmapLayerML sourceID={sourceId} id="crowding-heatmap"
 *           style={{ heatmapColor: HEATMAP_COLOR_EXPR, … }} />
 *       </>
 *     ) : null
 *   }
 * </HeatmapLayer>
 * ```
 */
export function HeatmapLayer({
  apiBaseUrl,
  bbox,
  projectedTime,
  onSourceReady,
  showToggle = true,
  defaultVisible = false,
  t,
  children,
}: HeatmapLayerHostProps): ReactElement {
  const [visible, setVisible] = useState(defaultVisible);
  const [geoJSON, setGeoJSON] = useState<GeoJSON.FeatureCollection>(EMPTY_GEOJSON);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [reportCount, setReportCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeOpacity = useOfflineFade(offline);

  // ── Network monitoring ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(!(state.isConnected ?? true));
    });
    return () => unsub();
  }, []);

  // ── Fetch helper ───────────────────────────────────────────────────────────
  const fetchHeatmap = useCallback(async () => {
    if (!bbox || offline) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ bbox });
      if (projectedTime) params.set('time', projectedTime);
      params.set('minIntensity', '0.05');

      const res = await fetch(`${apiBaseUrl}/v1/crowding/heatmap?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json() as { points: HeatmapPoint[]; reportCount: number };
      setGeoJSON(toGeoJSON(data.points));
      setReportCount(data.reportCount ?? 0);
    } catch {
      // Network error — keep stale data, layer already faded by offline state.
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, bbox, projectedTime, offline]);

  // ── Auto-refresh every 5 min when visible ─────────────────────────────────
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    void fetchHeatmap();
    timerRef.current = setInterval(() => void fetchHeatmap(), REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, fetchHeatmap]);

  // ── Re-fetch when bbox / projectedTime changes ────────────────────────────
  useEffect(() => {
    if (visible) void fetchHeatmap();
  }, [bbox, projectedTime, visible, fetchHeatmap]);

  // ── Source ready callback ──────────────────────────────────────────────────
  useEffect(() => {
    onSourceReady?.(HEATMAP_SOURCE_ID);
  }, [onSourceReady]);

  // ── Toggle handler ─────────────────────────────────────────────────────────
  const handleToggle = useCallback(() => {
    setVisible((prev) => !prev);
    if (!visible) void fetchHeatmap();
  }, [visible, fetchHeatmap]);

  return (
    <>
      {/* MapLibre layers/sources via render prop */}
      <Animated.View style={{ opacity: fadeOpacity, position: 'absolute', width: 0, height: 0 }}>
        {children?.({ sourceId: HEATMAP_SOURCE_ID, visible, geoJSON })}
      </Animated.View>

      {/* Toggle button */}
      {showToggle ? (
        <View style={uiStyles.toggleContainer} pointerEvents="box-none">
          <ToggleButton
            visible={visible}
            loading={loading}
            offline={offline}
            onPress={handleToggle}
            t={t}
          />
        </View>
      ) : null}

      {/* Legend — visible only when layer is on */}
      {visible ? (
        <View style={uiStyles.legendContainer} pointerEvents="none">
          <HeatmapLegend t={t} />
          {reportCount > 0 ? (
            <RawText style={uiStyles.reportCount}>
              {t('heatmap.reportCount', { n: reportCount })}
            </RawText>
          ) : null}
          {offline ? (
            <RawText style={uiStyles.offlineBanner}>{t('heatmap.offline')}</RawText>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

// ── Exported constants for host to build MapLibre layers ─────────────────────

export { HEATMAP_SOURCE_ID, HEATMAP_LAYER_ID };

export const heatmapLayerStyle = {
  heatmapColor: HEATMAP_COLOR_EXPR,
  heatmapWeight: HEATMAP_WEIGHT_EXPR,
  heatmapRadius: HEATMAP_RADIUS_EXPR,
  heatmapOpacity: HEATMAP_OPACITY_EXPR,
  heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.0, 17, 1.5],
} as const;

// ── Styles ────────────────────────────────────────────────────────────────────

const toggleStyles = StyleSheet.create({
  button: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#1565C0',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  buttonActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  buttonOffline: {
    opacity: 0.55,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1565C0',
  },
  labelActive: {
    color: '#fff',
  },
});

const legendStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    minWidth: 140,
  },
  title_row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title_dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
    marginEnd: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  label_wrapper: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: '#424242',
  },
});

const uiStyles = StyleSheet.create({
  toggleContainer: {
    position: 'absolute',
    top: 16,
    end: 16,
  },
  legendContainer: {
    position: 'absolute',
    bottom: 80,
    start: 16,
  },
  reportCount: {
    marginTop: 4,
    fontSize: 10,
    color: '#757575',
  },
  offlineBanner: {
    marginTop: 4,
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
  },
});
