/**
 * SavedPostsScreen — shows posts the current user has bookmarked locally.
 */
import type { DiscoverPostType } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { type ReactElement, useEffect, useRef } from 'react';
import {
  Animated,
  FlatList,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { useSavedPosts } from '../useSavedPosts';
import { COLORS, getTypeBadgeColors, formatRelativeTime } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBlock({ width, height }: { width: number; height: number }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6 }, { opacity }]} accessibilityElementsHidden />;
}

function SavedPostSkeletonCard(): ReactElement {
  return (
    <View testID="skeleton-saved-post" style={[styles.card, { gap: 8 }]}>
      <View style={styles.cardHeader}>
        <SkeletonBlock width={50} height={14} />
        <SkeletonBlock width={60} height={10} />
      </View>
      <SkeletonBlock width={240} height={12} />
      <SkeletonBlock width={180} height={12} />
      <SkeletonBlock width={120} height={12} />
      <View style={styles.cardFooter}>
        <SkeletonBlock width={100} height={10} />
        <SkeletonBlock width={60} height={26} />
      </View>
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function SavedPostRow({ post, onUnsave }: { post: DiscoverPostType; onUnsave: (p: DiscoverPostType) => void }): ReactElement {
  const router = useRouter();
  const badge = getTypeBadgeColors(post.type);

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/discover/${post.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={post.body}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.typeBadge, { backgroundColor: badge.bg, color: badge.text }]}>
          {t(`post.type.${post.type}` as never)}
        </Text>
        <Text style={styles.time}>{formatRelativeTime(post.createdAt, t)}</Text>
      </View>

      <Text style={styles.body} numberOfLines={3}>{post.body}</Text>

      <View style={styles.cardFooter}>
        <Text style={styles.stats}>
          {t('feed.trendingStats', { likes: post.likeCount, comments: post.commentCount })}
        </Text>
        <Pressable
          style={styles.unsaveBtn}
          onPress={() => onUnsave(post)}
          accessibilityRole="button"
          accessibilityLabel={t('saved.remove')}
          hitSlop={8}
        >
          <Text style={styles.unsaveTxt}>{t('saved.remove')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function SavedPostsScreen(): ReactElement {
  const { savedPosts, toggleSave, loading } = useSavedPosts();

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('saved.title')}</Text>
        <View style={styles.list}>
          {Array.from({ length: 4 }, (_, i) => <SavedPostSkeletonCard key={i} />)}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('saved.title')}</Text>
      <FlatList
        data={savedPosts as DiscoverPostType[]}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <SavedPostRow post={item} onUnsave={(p) => { void toggleSave(p); }} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>{t('saved.empty')}</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    textAlign: 'auto',
  },
  list: { padding: 12, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  time: { fontSize: 12, color: COLORS.textMuted },
  body: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20, marginBottom: 10 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stats: { fontSize: 13, color: COLORS.textSecondary },
  unsaveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: COLORS.errorBg,
  },
  unsaveTxt: { fontSize: 12, color: COLORS.error, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTxt: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center' },
});
