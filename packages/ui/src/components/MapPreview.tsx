/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * MapPreview — static map thumbnail for Iraq Maps.
 *
 * Renders a non-interactive map preview with:
 * - A static tile image centred on given coordinates.
 * - A pin marker at the target location.
 * - OSM attribution overlay (required by ODbL).
 * - Loading skeleton while the tile loads.
 * - Tap to open the full interactive map.
 *
 * NOTE: Uses the configured tile server (EXPO_PUBLIC_TILE_URL must point to
 * a self-hosted PMTiles / raster tile server, never tile.openstreetmap.org).
 * Falls back to a placeholder when the env var is absent (dev mode).
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { tokens } from '../tokens';

// ── Tile math ────────────────────────────────────────────────────────────────

function lon2tile(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat: number, zoom: number) {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

/** Build a tile URL for the given coordinate at the specified zoom. */
function tileUrl(lat: number, lon: number, zoom: number): string {
  const base =
    typeof process !== 'undefined'
      ? (process.env['EXPO_PUBLIC_TILE_URL'] ?? '')
      : '';
  if (!base) return '';
  const x = lon2tile(lon, zoom);
  const y = lat2tile(lat, zoom);
  return `${base}/${zoom}/${x}/${y}.png`;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MapPreviewProps {
  /** Latitude of the place to show. */
  lat: number;
  /** Longitude of the place to show. */
  lon: number;
  /** Zoom level for the static tile. Default: 15. */
  zoom?: number;
  /** Width. Default: '100%'. */
  width?: number | string;
  /** Height. Default: 180. */
  height?: number;
  /** Called when the user taps the preview. Use to open the full map. */
  onPress?: () => void;
  /** Accessibility label for the tap target. */
  accessibilityLabel?: string;
  /** Show the "تفتح الخريطة الكاملة" overlay hint. Default: true when onPress is set. */
  showOpenHint?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const { color, space, radius } = tokens;

const s = StyleSheet.create({
  root: {
    borderRadius: radius.m,
    overflow: 'hidden',
    backgroundColor: color.surface,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  skeleton: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    position: 'absolute',
    // centred — tile shows the target at its centre
    top: '50%',
    start: '50%',
    marginTop: -28,
    marginStart: -14,
    alignItems: 'center',
  },
  pinHead: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.primary,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  pinTail: {
    width: 2,
    height: 8,
    backgroundColor: color.primary,
  },
  attribution: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: space.xs,
    paddingVertical: 2,
  },
  attributionText: {
    fontSize: 10,
    color: '#333333',
    fontFamily: tokens.font.family,
  },
  openHint: {
    position: 'absolute',
    bottom: space.s,
    start: space.s,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.s,
    paddingHorizontal: space.s,
    paddingVertical: 4,
  },
  openHintText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: tokens.font.family,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E8F0E9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
  },
  placeholderIcon: {
    fontSize: 40,
  },
  placeholderText: {
    fontSize: 13,
    color: color.textMuted,
    fontFamily: tokens.font.family,
  },
  pressOverlay: {
    ...StyleSheet.absoluteFill,
  },
});

// ── Component ────────────────────────────────────────────────────────────────

export function MapPreview({
  lat,
  lon,
  zoom = 15,
  width = '100%',
  height = 180,
  onPress,
  accessibilityLabel = 'معاينة الخريطة — اضغط لفتح الخريطة الكاملة',
  showOpenHint,
  style,
  testID,
}: MapPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const url = tileUrl(lat, lon, zoom);
  const hint = showOpenHint ?? !!onPress;

  return (
    <View style={[s.root, { width, height } as ViewStyle, style]} testID={testID}>
      {url && !error ? (
        <Image
          source={{ uri: url }}
          style={s.image}
          resizeMode="cover"
          onLoadStart={() => { setLoading(true); setError(false); }}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={s.placeholder}>
          <Text style={s.placeholderIcon}>🗺️</Text>
          <Text style={s.placeholderText}>
            {error ? 'تعذّر تحميل الخريطة' : 'خريطة الموقع'}
          </Text>
        </View>
      )}

      {/* Loading skeleton */}
      {loading && url && !error && (
        <View style={s.skeleton}>
          <ActivityIndicator color={color.primary} />
        </View>
      )}

      {/* Pin marker */}
      {!error && !loading && (
        <View style={s.pin} pointerEvents="none">
          <View style={s.pinHead} />
          <View style={s.pinTail} />
        </View>
      )}

      {/* OSM attribution — required by ODbL */}
      <View style={s.attribution} pointerEvents="none">
        <Text style={s.attributionText}>© OpenStreetMap</Text>
      </View>

      {/* Open-full-map hint */}
      {hint && (
        <View style={s.openHint} pointerEvents="none">
          <Text style={s.openHintText}>افتح الخريطة الكاملة</Text>
        </View>
      )}

      {/* Tap overlay */}
      {onPress && (
        <Pressable
          style={s.pressOverlay}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        />
      )}
    </View>
  );
}

MapPreview.displayName = 'MapPreview';
