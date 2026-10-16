import { type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

export interface PlaceRecommendationData {
  placeId: string;
  name: string;
  address?: string;
  category?: string;
  aiReason?: string;
  estimatedPrice?: string;
  distanceMeters?: number;
  rating?: number;
}

export interface PlaceRecommendationCardProps {
  data: PlaceRecommendationData;
  onPress: (placeId: string) => void;
  onMessagePress?: (placeId: string, name: string) => void;
  onTellMeMore?: (placeId: string, name: string, reason: string) => void;
  compact?: boolean;
}

const PRIMARY = '#1565C0';
const PRIMARY_LIGHT = '#E3F2FD';

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} ${t('recommendations.distance', { dist: '' }).trim()}`;
  }
  return `${(meters / 1000).toFixed(1)} ${t('recommendations.distanceKm', { dist: '' }).trim()}`;
}

function StarRating({ rating }: { rating: number }): ReactElement {
  const full = Math.floor(rating);
  const stars = Array.from({ length: 5 }, (_, i) => i < full ? '★' : '☆');
  return (
    <View style={styles.starsRow}>
      {stars.map((s, i) => (
        <Text key={i} style={[styles.star, i < full ? styles.starFull : styles.starEmpty]}>
          {s}
        </Text>
      ))}
      <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
    </View>
  );
}

export function PlaceRecommendationCard({
  data,
  onPress,
  onMessagePress,
  onTellMeMore,
  compact = false,
}: PlaceRecommendationCardProps): ReactElement {
  const { placeId, name, address, category, aiReason, estimatedPrice, distanceMeters, rating } = data;

  if (compact) {
    return (
      <Pressable
        style={styles.compactCard}
        onPress={() => onPress(placeId)}
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        <View style={styles.compactIcon}>
          <Text style={styles.compactIconText}>📍</Text>
        </View>
        <View style={styles.compactBody}>
          <Text style={styles.compactName} numberOfLines={1}>{name}</Text>
          {category ? <Text style={styles.compactCategory}>{category}</Text> : null}
        </View>
        {distanceMeters != null && (
          <Text style={styles.compactDistance}>{formatDistance(distanceMeters)}</Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      {/* Header row */}
      <Pressable
        style={styles.header}
        onPress={() => onPress(placeId)}
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        <View style={styles.iconBox}>
          <Text style={styles.iconText}>🏢</Text>
        </View>
        <View style={styles.headerBody}>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          {category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{category}</Text>
            </View>
          ) : null}
        </View>
        {distanceMeters != null && (
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceText}>{formatDistance(distanceMeters)}</Text>
          </View>
        )}
      </Pressable>

      {/* Address */}
      {address ? (
        <View style={styles.addressRow}>
          <Text style={styles.addressPin}>📌</Text>
          <Text style={styles.address} numberOfLines={1}>{address}</Text>
        </View>
      ) : null}

      {/* Rating */}
      {rating != null && <StarRating rating={rating} />}

      {/* AI reason */}
      {aiReason ? (
        <View style={styles.aiReasonBox}>
          <Text style={styles.aiReasonIcon}>✨</Text>
          <Text style={styles.aiReason}>{aiReason}</Text>
        </View>
      ) : null}

      {/* Price */}
      {estimatedPrice ? (
        <Text style={styles.price}>{t('recommendations.estimatedPrice', { price: estimatedPrice })}</Text>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => onPress(placeId)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.viewOnMap')}
        >
          <Text style={styles.actionBtnText}>{t('chat.viewOnMap')}</Text>
        </Pressable>

        {onMessagePress && (
          <Pressable
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => onMessagePress(placeId, name)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.compose')}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>{t('chat.compose')}</Text>
          </Pressable>
        )}

        {onTellMeMore && aiReason && (
          <Pressable
            style={[styles.actionBtn, styles.actionBtnGhost]}
            onPress={() => onTellMeMore(placeId, name, aiReason)}
            accessibilityRole="button"
            accessibilityLabel={t('recommendations.tellMeMore')}
          >
            <Text style={[styles.actionBtnText, styles.actionBtnTextGhost]}>{t('recommendations.tellMeMore')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  headerBody: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'auto' as const,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryText: {
    fontSize: 11,
    color: '#6A1B9A',
    fontWeight: '600',
  },
  distanceBadge: {
    backgroundColor: '#F1F8E9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  distanceText: {
    fontSize: 11,
    color: '#33691E',
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 4,
  },
  addressPin: {
    fontSize: 12,
  },
  address: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    textAlign: 'auto' as const,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 2,
  },
  star: {
    fontSize: 14,
  },
  starFull: {
    color: '#FFA000',
  },
  starEmpty: {
    color: '#BDBDBD',
  },
  ratingValue: {
    fontSize: 12,
    color: '#666',
    marginStart: 4,
  },
  aiReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  aiReasonIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  aiReason: {
    flex: 1,
    fontSize: 12,
    color: '#5D4037',
    lineHeight: 18,
    textAlign: 'auto' as const,
  },
  price: {
    fontSize: 12,
    color: '#388E3C',
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    flexWrap: 'wrap',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: PRIMARY,
  },
  actionBtnSecondary: {
    backgroundColor: '#43A047',
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
  actionBtnText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
  actionBtnTextSecondary: {
    color: '#FFF',
  },
  actionBtnTextGhost: {
    color: PRIMARY,
  },
  // Compact variant
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PRIMARY_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIconText: {
    fontSize: 16,
  },
  compactBody: {
    flex: 1,
  },
  compactName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  compactCategory: {
    fontSize: 11,
    color: '#888',
  },
  compactDistance: {
    fontSize: 11,
    color: '#33691E',
    fontWeight: '600',
  },
});
