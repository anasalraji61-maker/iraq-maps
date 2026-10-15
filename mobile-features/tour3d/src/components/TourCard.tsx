import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Tour3DScene } from '@iraq-maps/contracts';
import { t } from '../strings';

interface TourCardProps {
  scene: Tour3DScene;
  onPress: (scene: Tour3DScene) => void;
}

export function TourCard({ scene, onPress }: TourCardProps) {
  const name = scene.nameAr ?? scene.nameEn ?? '';
  const hasThumb = !!scene.thumbnailUrl;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(scene)}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <View style={styles.thumbnail}>
        {hasThumb ? (
          <Image
            source={{ uri: scene.thumbnailUrl! }}
            style={styles.thumbnailImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Text style={styles.thumbnailIcon}>🏛</Text>
          </View>
        )}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText} numberOfLines={1}>
            {t(`category.${scene.category as 'heritage'}` as Parameters<typeof t>[0])}
          </Text>
        </View>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <View style={styles.stats}>
          <Text style={styles.stat}>
            {t('list.views', { count: scene.viewCount })}
          </Text>
          {scene.assetCount > 0 && (
            <Text style={styles.stat}>
              {t('list.assets', { count: scene.assetCount })}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardPressed: {
    opacity: 0.85,
  },
  thumbnail: {
    height: 160,
    backgroundColor: '#e8e0d5',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailIcon: {
    fontSize: 48,
  },
  categoryBadge: {
    position: 'absolute',
    bottom: 8,
    start: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  info: {
    padding: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 6,
  },
  stat: {
    fontSize: 12,
    color: '#777',
  },
});
