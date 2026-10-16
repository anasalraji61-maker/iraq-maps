/**
 * LocationMessage – shows a static map snippet for a shared location.
 * Tapping opens native maps app (Apple Maps / Google Maps).
 */
import { useCallback, type ReactElement } from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { t } from '../strings';

export interface LocationMessageProps {
  latitude: number;
  longitude: number;
  label?: string;
  accuracy?: number;
  /** Compact mode: smaller card, no label overflow */
  compact?: boolean;
  onPress?: (latitude: number, longitude: number) => void;
}

/** Build a deep-link to the native maps app */
function buildMapsUrl(lat: number, lng: number, label?: string): string {
  const encoded = label ? encodeURIComponent(label) : '';
  if (Platform.OS === 'ios') {
    return `maps://?q=${encoded}&ll=${lat},${lng}`;
  }
  return `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`;
}

/** Convert lat/lng to OSM tile coordinates for a given zoom level */
function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Format coordinate for display */
function formatCoord(val: number, pos: 'lat' | 'lng'): string {
  const abs = Math.abs(val).toFixed(5);
  if (pos === 'lat') return val >= 0 ? `${abs}°N` : `${abs}°S`;
  return val >= 0 ? `${abs}°E` : `${abs}°W`;
}

export function LocationMessage({
  latitude,
  longitude,
  label,
  accuracy,
  compact = false,
  onPress,
}: LocationMessageProps): ReactElement {
  const handlePress = useCallback(() => {
    if (onPress) {
      onPress(latitude, longitude);
      return;
    }
    void Linking.openURL(buildMapsUrl(latitude, longitude, label));
  }, [latitude, longitude, label, onPress]);

  const latStr = formatCoord(latitude, 'lat');
  const lngStr = formatCoord(longitude, 'lng');

  // Grid of 9 tiles (3×3) approximating a static map snippet
  const zoom = compact ? 14 : 15;
  const center = latLngToTile(latitude, longitude, zoom);

  return (
    <TouchableOpacity
      style={[styles.container, compact && styles.containerCompact]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('conversation.location')}
      activeOpacity={0.82}
    >
      {/* Map area */}
      <View style={[styles.mapArea, compact && styles.mapAreaCompact]}>
        {/* Tile grid placeholder – in production this would be a MapLibre snapshot */}
        <View style={styles.tileGrid}>
          {Array.from({ length: 9 }).map((_, i) => {
            const dx = (i % 3) - 1;
            const dy = Math.floor(i / 3) - 1;
            const tx = center.x + dx;
            const ty = center.y + dy;
            // NOTE: tile.openstreetmap.org is prohibited by HARD RULE 4.
            // Real tiles come from the self-hosted Planetiler/PMTiles instance.
            // This placeholder renders a muted grid to indicate a map area.
            return (
              <View
                key={i}
                style={[
                  styles.tile,
                  {
                    backgroundColor: i === 4
                      ? '#C8E6C9' // center tile slightly different
                      : '#DCE8DC',
                  },
                ]}
              >
                {i === 4 ? (
                  <Text style={styles.pinEmoji}>📍</Text>
                ) : null}
                {/* Tile coords in debug builds could go here */}
              </View>
            );
          })}
        </View>

        {/* Crosshair overlay */}
        <View style={styles.crosshairH} pointerEvents="none" />
        <View style={styles.crosshairV} pointerEvents="none" />

        {/* Accuracy circle hint */}
        {accuracy !== undefined && accuracy > 0 ? (
          <View
            style={[
              styles.accuracyCircle,
              { opacity: Math.max(0.15, 1 - accuracy / 200) },
            ]}
            pointerEvents="none"
          />
        ) : null}
      </View>

      {/* Footer */}
      <View style={[styles.footer, compact && styles.footerCompact]}>
        <View style={styles.coordRow}>
          <Text style={styles.coordText}>{latStr}</Text>
          <Text style={styles.coordSep}>·</Text>
          <Text style={styles.coordText}>{lngStr}</Text>
        </View>
        {label ? (
          <Text style={styles.label} numberOfLines={compact ? 1 : 2}>
            {label}
          </Text>
        ) : null}
        {accuracy !== undefined ? (
          <Text style={styles.accuracy}>
            ±{Math.round(accuracy)} m
          </Text>
        ) : null}
        <Text style={styles.tapHint}>{t('conversation.tapToOpenMap')}</Text>
      </View>
    </TouchableOpacity>
  );
}

const MAP_HEIGHT = 120;
const MAP_HEIGHT_COMPACT = 80;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    minWidth: 220,
    maxWidth: 280,
  },
  containerCompact: {
    minWidth: 180,
  },

  mapArea: {
    height: MAP_HEIGHT,
    backgroundColor: '#E0EDE0',
    position: 'relative',
    overflow: 'hidden',
  },
  mapAreaCompact: {
    height: MAP_HEIGHT_COMPACT,
  },

  tileGrid: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    width: '33.33%',
    height: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  pinEmoji: { fontSize: 22, textAlign: 'center' },

  crosshairH: {
    position: 'absolute',
    top: '50%',
    start: 0,
    end: 0,
    height: 1,
    backgroundColor: 'rgba(25,118,210,0.3)',
  },
  crosshairV: {
    position: 'absolute',
    start: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(25,118,210,0.3)',
  },

  accuracyCircle: {
    position: 'absolute',
    top: '50%',
    start: '50%',
    width: 40,
    height: 40,
    marginTop: -20,
    marginStart: -20,
    borderRadius: 20,
    backgroundColor: 'rgba(25,118,210,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(25,118,210,0.4)',
  },

  footer: {
    padding: 8,
    gap: 2,
  },
  footerCompact: {
    padding: 6,
  },

  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coordText: {
    fontSize: 10,
    color: '#757575',
    fontVariant: ['tabular-nums'],
  },
  coordSep: { fontSize: 10, color: '#BDBDBD' },

  label: {
    fontSize: 12,
    color: '#212121',
    fontWeight: '600',
    marginTop: 2,
  },
  accuracy: {
    fontSize: 10,
    color: '#9E9E9E',
  },
  tapHint: {
    fontSize: 10,
    color: '#1976D2',
    marginTop: 2,
  },
});
