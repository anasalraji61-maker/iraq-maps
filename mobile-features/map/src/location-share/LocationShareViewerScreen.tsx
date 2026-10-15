/**
 * LocationShareViewerScreen – anyone with the share link can open this screen
 * and see the sender's live location on a map, polling every 5 seconds.
 */
import type { LngLat } from '@iraq-maps/contracts';
import { Text, tokens } from '@iraq-maps/ui';
import { useLocalSearchParams } from 'expo-router';
import { type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Camera, Map as MapView, Marker as MarkerView } from '@maplibre/maplibre-react-native';
import { useLocationShare } from './useLocationShare';
import { t } from '../strings';

const TILES_URL = process.env['EXPO_PUBLIC_TILES_URL'] ?? 'https://demotiles.maplibre.org/style.json';

export function LocationShareViewerScreen(): ReactElement {
  const { shareId } = useLocalSearchParams<{ shareId?: string }>();
  const { share, expired, loading, error } = useLocationShare(shareId ?? null);

  if (loading && !share) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
        <Text variant="body" style={styles.statusText}>
          {t('locationShare.loading')}
        </Text>
      </View>
    );
  }

  if (expired) {
    return (
      <View style={styles.center}>
        <Text variant="title">{t('locationShare.expiredTitle')}</Text>
        <Text variant="body" style={styles.statusText}>
          {t('locationShare.expiredBody')}
        </Text>
      </View>
    );
  }

  if (error === 'not_found') {
    return (
      <View style={styles.center}>
        <Text variant="title">{t('locationShare.notFoundTitle')}</Text>
        <Text variant="body" style={styles.statusText}>
          {t('locationShare.notFoundBody')}
        </Text>
      </View>
    );
  }

  const location: LngLat | null = share?.location ?? null;
  const center: [number, number] = location ? [location[0], location[1]] : [44.361, 33.325];

  return (
    <View style={styles.container}>
      <MapView style={styles.map} mapStyle={TILES_URL}>
        <Camera
          center={center}
          zoom={location ? 14 : 6}
          easing="fly"
          duration={600}
        />
        {location && (
          <MarkerView lngLat={center}>
            <View style={styles.marker}>
              <Text variant="body">📍</Text>
            </View>
          </MarkerView>
        )}
      </MapView>

      <View style={styles.overlay}>
        {!location ? (
          <Text variant="caption" style={styles.waitingText}>
            {t('locationShare.waitingForLocation')}
          </Text>
        ) : (
          <Text variant="caption" style={styles.updatedText}>
            {t('locationShare.lastUpdated', {
              time: share ? new Date(share.updatedAt).toLocaleTimeString() : '',
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space.l,
    backgroundColor: tokens.color.bg,
  },
  statusText: {
    color: tokens.color.textMuted,
    textAlign: 'center',
    marginTop: tokens.space.s,
  },
  overlay: {
    position: 'absolute',
    bottom: tokens.space.l,
    start: tokens.space.m,
    end: tokens.space.m,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.m,
    padding: tokens.space.s,
    alignItems: 'center',
  },
  waitingText: {
    color: tokens.color.textMuted,
  },
  updatedText: {
    color: tokens.color.text,
  },
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
