/**
 * Tour3DMapScreen – shows tour scenes on an interactive map with custom markers.
 * Uses MapLibre via @iraq-maps/map-kit.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Tour3DScene } from '@iraq-maps/contracts';
import { useTour3DClient } from '../client';
import { t } from '../strings';

type LoadState = 'loading' | 'loaded' | 'error';

/** Simplified map placeholder.
 *  Replace inner View with MapLibre <MapView> when @iraq-maps/map-kit is wired. */
function MapPlaceholder({
  scenes,
  onMarkerPress,
}: {
  scenes: Tour3DScene[];
  onMarkerPress: (scene: Tour3DScene) => void;
}) {
  return (
    <View style={mapStyles.placeholder}>
      <Text style={mapStyles.placeholderIcon}>🗺</Text>
      <Text style={mapStyles.placeholderTitle}>{t('map.title')}</Text>
      <Text style={mapStyles.placeholderCount}>
        {scenes.length} {t('viewer.assetCount', { count: scenes.length })}
      </Text>
      {/* List of scenes as tappable rows until the real map is wired */}
      {scenes.map((scene) => (
        <Pressable
          key={scene.id}
          style={({ pressed }) => [mapStyles.sceneRow, pressed && mapStyles.sceneRowPressed]}
          onPress={() => onMarkerPress(scene)}
          accessibilityRole="button"
          accessibilityLabel={scene.nameAr ?? scene.nameEn ?? ''}
        >
          <Text style={mapStyles.scenePin}>📍</Text>
          <Text style={mapStyles.sceneName} numberOfLines={1}>
            {scene.nameAr ?? scene.nameEn ?? ''}
          </Text>
          <Text style={mapStyles.sceneCoords}>
            {scene.location[1].toFixed(4)}, {scene.location[0].toFixed(4)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const mapStyles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#d4e3c6',
    padding: 24,
    gap: 8,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a4a1a',
  },
  placeholderCount: {
    fontSize: 13,
    color: '#555',
    marginBottom: 8,
  },
  sceneRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  sceneRowPressed: {
    opacity: 0.75,
  },
  scenePin: {
    fontSize: 18,
  },
  sceneName: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '600',
    textAlign: 'auto',
  },
  sceneCoords: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
  },
});

export function Tour3DMapScreen() {
  const router = useRouter();
  const client = useTour3DClient();

  const [scenes, setScenes] = useState<Tour3DScene[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const loadScenes = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await client.listScenes({ query: { limit: 50 } });
      if (res.status !== 200) throw new Error('fetch failed');
      setScenes(res.body.items);
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  }, [client]);

  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);

  const handleMarkerPress = (scene: Tour3DScene) => {
    router.push({ pathname: '/tour3d/[id]', params: { id: scene.id } } as Parameters<typeof router.push>[0]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('map.title')}</Text>
      </View>

      {loadState === 'loading' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#c9a84c" />
          <Text style={styles.statusText}>{t('map.loading')}</Text>
        </View>
      )}

      {loadState === 'error' && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{t('map.loadError')}</Text>
          <Pressable style={styles.retryButton} onPress={loadScenes} accessibilityRole="button">
            <Text style={styles.retryText}>{t('map.retry')}</Text>
          </Pressable>
        </View>
      )}

      {loadState === 'loaded' && (
        <MapPlaceholder scenes={scenes} onMarkerPress={handleMarkerPress} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e8',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0d8cc',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#c0392b',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#c9a84c',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
