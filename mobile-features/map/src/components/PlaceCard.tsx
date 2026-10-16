/**
 * PlaceCard – reusable card component for displaying a place summary.
 *
 * Variants:
 *  - compact   (default): one horizontal row — thumbnail, name, category, distance, open badge
 *  - expanded:            vertical card — larger thumbnail, name, category, rating, distance, open badge
 *  - skeleton:            grey placeholder blocks while data loads (no place prop required)
 *
 * Usage:
 *   <PlaceCard place={p} name="…" icon="🍽" variant="compact" onPress={…} />
 *   <PlaceCard skeleton />
 */

import type { PlaceSummary } from '@iraq-maps/contracts';
import { type ReactElement } from 'react';
import {
  Image,
  I18nManager,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { openNow } from '../hours';
import { formatDistance, t } from '../strings';

I18nManager.forceRTL(true);

const STAR = '★';

// ── Props ──────────────────────────────────────────────────────────────────────

/** Ranking badge shown on high-scoring or featured providers. */
export type RankingBadge = 'topRated' | 'featured' | 'bestMatch';

export interface PlaceCardProps {
  place?: PlaceSummary;
  /** Localised display name. Required unless skeleton=true. */
  name?: string;
  /** Category icon emoji. */
  icon?: string;
  /** Localised category label. */
  category?: string;
  /** OSM opening_hours raw string for open/closed badge. */
  hoursRaw?: string | null;
  /** Average rating (0-5). */
  rating?: number;
  /** Review count. */
  reviewCount?: number;
  /** Photo URI for thumbnail. */
  photoUri?: string | null;
  variant?: 'compact' | 'expanded';
  /** Renders skeleton loading state. */
  skeleton?: boolean;
  /** Optional ranking badge (top-rated / featured / best-match). */
  rankingBadge?: RankingBadge;
  onPress?: () => void;
  testID?: string;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PlaceCard({
  place,
  name,
  icon,
  category,
  hoursRaw,
  rating,
  reviewCount,
  photoUri,
  variant = 'compact',
  skeleton = false,
  rankingBadge,
  onPress,
  testID,
}: PlaceCardProps): ReactElement {
  if (skeleton) {
    return variant === 'expanded' ? <ExpandedSkeleton /> : <CompactSkeleton />;
  }

  if (!place || !name) return <CompactSkeleton />;

  const openStatus = hoursRaw ? openNow(hoursRaw) : null;

  if (variant === 'expanded') {
    return (
      <ExpandedCard
        place={place}
        name={name}
        icon={icon}
        category={category}
        openStatus={openStatus}
        rating={rating}
        reviewCount={reviewCount}
        photoUri={photoUri}
        rankingBadge={rankingBadge}
        onPress={onPress}
        testID={testID}
      />
    );
  }

  return (
    <CompactCard
      place={place}
      name={name}
      icon={icon}
      category={category}
      openStatus={openStatus}
      rating={rating}
      photoUri={photoUri}
      rankingBadge={rankingBadge}
      onPress={onPress}
      testID={testID}
    />
  );
}

// ── Compact variant ───────────────────────────────────────────────────────────

interface CompactCardProps {
  place: PlaceSummary;
  name: string;
  icon?: string;
  category?: string;
  openStatus: boolean | null;
  rating?: number;
  photoUri?: string | null;
  rankingBadge?: RankingBadge;
  onPress?: () => void;
  testID?: string;
}

function CompactCard({
  place,
  name,
  icon,
  category,
  openStatus,
  rating,
  photoUri,
  rankingBadge,
  onPress,
  testID,
}: CompactCardProps): ReactElement {
  return (
    <TouchableOpacity
      style={compactStyles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      testID={testID ?? 'placeCard.compact'}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      <View style={compactStyles.thumbWrap}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={compactStyles.thumb} resizeMode="cover" />
        ) : (
          <View style={[compactStyles.thumb, compactStyles.thumbPlaceholder]}>
            <RNText style={compactStyles.iconText}>{icon ?? '📍'}</RNText>
          </View>
        )}
        {openStatus !== null ? (
          <View style={[compactStyles.dot, openStatus ? compactStyles.dotOpen : compactStyles.dotClosed]} />
        ) : null}
      </View>

      {/* Info */}
      <View style={compactStyles.info}>
        <View style={compactStyles.nameRow}>
          <RNText style={compactStyles.name} numberOfLines={1}>{name}</RNText>
          {rankingBadge ? <RankingBadgeChip badge={rankingBadge} /> : null}
        </View>
        <View style={compactStyles.metaRow}>
          {category ? (
            <RNText style={compactStyles.category} numberOfLines={1}>{category}</RNText>
          ) : null}
          {rating ? (
            <>
              <RNText style={compactStyles.dot2}>·</RNText>
              <RNText style={compactStyles.rating}>{STAR} {rating.toFixed(1)}</RNText>
            </>
          ) : null}
        </View>
        {place.distanceM !== null && place.distanceM !== undefined ? (
          <RNText style={compactStyles.distance}>{formatDistance(place.distanceM)}</RNText>
        ) : null}
      </View>

      {/* Open badge */}
      {openStatus !== null ? (
        <View style={[compactStyles.badge, openStatus ? compactStyles.badgeOpen : compactStyles.badgeClosed]}>
          <RNText style={compactStyles.badgeText}>
            {openStatus ? t('markerSheet.openBadge') : t('markerSheet.closedBadge')}
          </RNText>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const compactStyles = StyleSheet.create({
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: '#fff',
  },
  thumbWrap: { position: 'relative' },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbPlaceholder: { backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22 },
  dot: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  dotOpen: { backgroundColor: '#43A047' },
  dotClosed: { backgroundColor: '#E53935' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  category: { fontSize: 12, color: '#888', flexShrink: 1 },
  dot2: { fontSize: 12, color: '#CCC' },
  rating: { fontSize: 12, color: '#F5A623' },
  distance: { fontSize: 11, color: '#AAA' },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeOpen: { backgroundColor: '#E8F5E9' },
  badgeClosed: { backgroundColor: '#FFEBEE' },
  badgeText: { fontSize: 11, fontWeight: '600' },
});

// ── Expanded variant ──────────────────────────────────────────────────────────

// ── Ranking badge chip ────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<RankingBadge, { color: string; bg: string; labelKey: string }> = {
  topRated:  { color: '#F5A623', bg: '#FFF3E0', labelKey: 'ranking.badge.topRated'  },
  featured:  { color: '#9C27B0', bg: '#F3E5F5', labelKey: 'ranking.badge.featured'  },
  bestMatch: { color: '#1976D2', bg: '#E3F2FD', labelKey: 'ranking.badge.bestMatch' },
};

function RankingBadgeChip({ badge }: { badge: RankingBadge }): ReactElement {
  const cfg = BADGE_CONFIG[badge];
  return (
    <View style={[rankBadgeStyles.chip, { backgroundColor: cfg.bg }]}>
      <RNText style={[rankBadgeStyles.text, { color: cfg.color }]}>
        {t(cfg.labelKey as Parameters<typeof t>[0])}
      </RNText>
    </View>
  );
}

const rankBadgeStyles = StyleSheet.create({
  chip: {
    borderRadius:     10,
    paddingHorizontal: 7,
    paddingVertical:   2,
  },
  text: {
    fontSize:   10,
    fontWeight: '700',
  },
});

// ── Expanded variant ──────────────────────────────────────────────────────────

interface ExpandedCardProps {
  place: PlaceSummary;
  name: string;
  icon?: string;
  category?: string;
  openStatus: boolean | null;
  rating?: number;
  reviewCount?: number;
  photoUri?: string | null;
  rankingBadge?: RankingBadge;
  onPress?: () => void;
  testID?: string;
}

function ExpandedCard({
  place,
  name,
  icon,
  category,
  openStatus,
  rating,
  reviewCount,
  photoUri,
  rankingBadge,
  onPress,
  testID,
}: ExpandedCardProps): ReactElement {
  return (
    <TouchableOpacity
      style={expandedStyles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      testID={testID ?? 'placeCard.expanded'}
      activeOpacity={0.75}
    >
      {/* Hero image */}
      <View style={expandedStyles.heroWrap}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={expandedStyles.hero} resizeMode="cover" />
        ) : (
          <View style={[expandedStyles.hero, expandedStyles.heroPlaceholder]}>
            <RNText style={expandedStyles.heroIcon}>{icon ?? '📍'}</RNText>
          </View>
        )}
        {openStatus !== null ? (
          <View
            style={[
              expandedStyles.openBadge,
              openStatus ? expandedStyles.openBadgeOpen : expandedStyles.openBadgeClosed,
            ]}
          >
            <RNText style={expandedStyles.openBadgeText}>
              {openStatus ? t('markerSheet.openBadge') : t('markerSheet.closedBadge')}
            </RNText>
          </View>
        ) : null}
      </View>

      {/* Details */}
      <View style={expandedStyles.body}>
        <View style={expandedStyles.nameRow}>
          <RNText style={expandedStyles.name} numberOfLines={2}>{name}</RNText>
          {rankingBadge ? <RankingBadgeChip badge={rankingBadge} /> : null}
        </View>
        <View style={expandedStyles.metaRow}>
          {category ? (
            <RNText style={expandedStyles.category}>{category}</RNText>
          ) : null}
          {rating ? (
            <>
              <View style={expandedStyles.dot} />
              <RNText style={expandedStyles.rating}>
                {STAR} {rating.toFixed(1)}
              </RNText>
              {reviewCount ? (
                <RNText style={expandedStyles.reviewCount}>({reviewCount})</RNText>
              ) : null}
            </>
          ) : null}
        </View>
        {place.distanceM !== null && place.distanceM !== undefined ? (
          <RNText style={expandedStyles.distance}>{formatDistance(place.distanceM)}</RNText>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const expandedStyles = StyleSheet.create({
  card: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  heroWrap: { position: 'relative' },
  hero: { width: '100%', height: 100 },
  heroPlaceholder: { backgroundColor: '#ECEFF1', alignItems: 'center', justifyContent: 'center' },
  heroIcon: { fontSize: 36 },
  openBadge: {
    position: 'absolute',
    top: 6,
    start: 6,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openBadgeOpen: { backgroundColor: 'rgba(67,160,71,0.9)' },
  openBadgeClosed: { backgroundColor: 'rgba(229,57,53,0.9)' },
  openBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  body: { padding: 10, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap' },
  name: { fontSize: 13, fontWeight: '600', color: '#111', lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  category: { fontSize: 11, color: '#888' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#CCC' },
  rating: { fontSize: 11, color: '#F5A623' },
  reviewCount: { fontSize: 11, color: '#AAA' },
  distance: { fontSize: 11, color: '#AAA' },
});

// ── Skeleton variants ─────────────────────────────────────────────────────────

function CompactSkeleton(): ReactElement {
  return (
    <View style={skStyles.compactRow}>
      <View style={skStyles.compactThumb} />
      <View style={skStyles.info}>
        <View style={[skStyles.bar, { width: '65%' }]} />
        <View style={[skStyles.bar, { width: '40%', marginTop: 4 }]} />
      </View>
    </View>
  );
}

function ExpandedSkeleton(): ReactElement {
  return (
    <View style={skStyles.expandedCard}>
      <View style={skStyles.expandedHero} />
      <View style={skStyles.expandedBody}>
        <View style={[skStyles.bar, { width: '80%' }]} />
        <View style={[skStyles.bar, { width: '50%', marginTop: 6 }]} />
      </View>
    </View>
  );
}

const SKELETON_BG = '#E8E8E8';

const skStyles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  compactThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: SKELETON_BG },
  info: { flex: 1, gap: 2 },
  bar: { height: 13, borderRadius: 6, backgroundColor: SKELETON_BG },
  expandedCard: {
    width: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
  },
  expandedHero: { width: '100%', height: 100, backgroundColor: SKELETON_BG },
  expandedBody: { padding: 10 },
});
