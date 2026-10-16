import { useState, useCallback, type ReactElement } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, formatCount, formatRelativeTime, getTypeBadgeColors, HashtagText } from '../screens/shared';
import { t } from '../strings';

export interface FeaturedPostData {
  id: string;
  authorId: string;
  authorVerified?: boolean;
  placeId?: string;
  placeName?: string;
  type: 'photo' | 'tip' | 'event' | 'offer';
  category?: string;
  body: string;
  mediaAssetIds: string[];
  likeCount: number;
  commentCount: number;
  viewCount?: number;
  isLikedByMe: boolean;
  createdAt: string;
  featuredLabel?: string; // e.g. "منشور مميز"
}

interface FeaturedPostProps {
  item: FeaturedPostData;
  mediaBaseUrl?: string;
  onPress: (postId: string) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onAuthorPress: (authorId: string) => void;
  onHashtagPress: (hashtag: string) => void;
  onShare?: (postId: string) => void;
}

export function FeaturedPost({
  item,
  mediaBaseUrl = '',
  onPress,
  onLike,
  onAuthorPress,
  onHashtagPress,
  onShare,
}: FeaturedPostProps): ReactElement {
  const [liked, setLiked] = useState(item.isLikedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);

  const handleLike = useCallback(() => {
    const next = !liked;
    setLiked(next);
    setLikeCount((prev) => (next ? prev + 1 : Math.max(0, prev - 1)));
    onLike(item.id, liked);
  }, [liked, item.id, onLike]);

  const badgeColors = getTypeBadgeColors(item.type);
  const hasImage = item.mediaAssetIds.length > 0;
  const imageUri = hasImage ? `${mediaBaseUrl}/v1/media/${item.mediaAssetIds[0]}` : undefined;

  return (
    <Pressable
      style={styles.card}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={item.body.slice(0, 80)}
    >
      {/* Featured label */}
      {item.featuredLabel ? (
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>{item.featuredLabel}</Text>
        </View>
      ) : null}

      {/* Hero image */}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.heroImage}
          resizeMode="cover"
          accessibilityLabel={item.body.slice(0, 60)}
        />
      ) : (
        <View style={[styles.heroImage, styles.heroImagePlaceholder]}>
          <Text style={styles.heroImagePlaceholderText}>
            {item.type === 'photo' ? '🖼' :
             item.type === 'tip' ? '💡' :
             item.type === 'event' ? '🎉' : '🏷'}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Type badge + place */}
        <View style={styles.metaRow}>
          <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
            <Text style={[styles.typeBadgeText, { color: badgeColors.text }]}>
              {t(`post.type.${item.type}` as Parameters<typeof t>[0])}
            </Text>
          </View>
          {item.placeName ? (
            <Text style={styles.placeName} numberOfLines={1}>
              📍 {item.placeName}
            </Text>
          ) : null}
        </View>

        {/* Body text */}
        <HashtagText
          text={item.body}
          style={styles.body}
          onHashtagPress={onHashtagPress}
        />

        {/* Author row + stats */}
        <View style={styles.footer}>
          <Pressable
            onPress={() => onAuthorPress(item.authorId)}
            style={styles.authorRow}
            accessibilityRole="button"
            accessibilityLabel={item.authorId}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.authorId.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.authorName}>
                {item.authorId.slice(0, 12)}
                {item.authorVerified ? (
                  <Text style={styles.verifiedBadge}> {t('post.verifiedIcon')}</Text>
                ) : null}
              </Text>
              <Text style={styles.timeAgo}>{formatRelativeTime(item.createdAt, t)}</Text>
            </View>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionBtn, liked && styles.actionBtnActive]}
              onPress={handleLike}
              accessibilityRole="button"
              accessibilityLabel={t('post.likeA11y', { author: item.authorId })}
            >
              <Text style={[styles.actionIcon, liked && styles.actionIconActive]}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                {liked ? '❤️' : '🤍'}
              </Text>
              <Text style={[styles.actionCount, liked && styles.actionCountActive]}>
                {formatCount(likeCount)}
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionBtn}
              onPress={() => onPress(item.id)}
              accessibilityRole="button"
              accessibilityLabel={t('post.commentA11y' as Parameters<typeof t>[0])}
            >
              <Text style={styles.actionIcon}>💬</Text>
              <Text style={styles.actionCount}>{formatCount(item.commentCount)}</Text>
            </Pressable>

            {onShare ? (
              <Pressable
                style={styles.actionBtn}
                onPress={() => onShare(item.id)}
                accessibilityRole="button"
                accessibilityLabel={t('post.share')}
              >
                <Text style={styles.actionIcon}>↗</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Featured section (title + list) ─────────────────────────────────────────

interface FeaturedSectionProps {
  items: FeaturedPostData[];
  mediaBaseUrl?: string;
  onPress: (postId: string) => void;
  onLike: (postId: string, currentlyLiked: boolean) => void;
  onAuthorPress: (authorId: string) => void;
  onHashtagPress: (hashtag: string) => void;
  onShare?: (postId: string) => void;
  title?: string;
}

export function FeaturedSection({
  items,
  mediaBaseUrl,
  onPress,
  onLike,
  onAuthorPress,
  onHashtagPress,
  onShare,
  title,
}: FeaturedSectionProps): ReactElement {
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={styles.sectionTitle}>{title}</Text>
      ) : null}
      {items.map((item) => (
        <FeaturedPost
          key={item.id}
          item={item}
          mediaBaseUrl={mediaBaseUrl}
          onPress={onPress}
          onLike={onLike}
          onAuthorPress={onAuthorPress}
          onHashtagPress={onHashtagPress}
          onShare={onShare}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    start: 12,
    zIndex: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  featuredBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  heroImage: {
    width: '100%',
    height: 200,
    backgroundColor: COLORS.border,
  },
  heroImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryXLight,
  },
  heroImagePlaceholderText: {
    fontSize: 48,
  },
  content: {
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  placeName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
    textAlign: 'auto',
  },
  body: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 22,
    textAlign: 'auto',
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  verifiedBadge: {
    color: COLORS.primary,
  },
  timeAgo: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'auto',
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
  },
  actionBtnActive: {
    backgroundColor: '#FFEBEE',
  },
  actionIcon: {
    fontSize: 16,
  },
  actionIconActive: {
    // active styling via emoji change
  },
  actionCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  actionCountActive: {
    color: '#D32F2F',
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
