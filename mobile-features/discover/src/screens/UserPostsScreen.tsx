import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { useFollows } from '../useFollows';
import { COLORS, sharedStyles, formatRelativeTime, getTypeBadgeColors } from './shared';

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function PostCard({ post }: { post: DiscoverPostType }): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);
  const TYPE_LABEL: Record<string, string> = {
    photo: t('post.type.photo'),
    tip: t('post.type.tip'),
    event: t('post.type.event'),
    offer: t('post.type.offer'),
  };
  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.timestampText, { color: COLORS.textSecondary }]}>
          {formatRelativeTime(post.createdAt, t)}
        </Text>
        <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.typeText, { color: badgeColors.text }]}>
            {TYPE_LABEL[post.type] ?? post.type}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: COLORS.textPrimary }]}>{post.body}</Text>
      <View style={styles.counters}>
        <Text style={[styles.counterText, { color: COLORS.textSecondary }]}>
          {t('post.like')} {formatCount(post.likeCount)}
        </Text>
        <Text style={[styles.counterText, { color: COLORS.textSecondary }]}>
          {t('post.comment')} {formatCount(post.commentCount)}
        </Text>
      </View>
    </View>
  );
}

export function UserPostsScreen(): ReactElement {
  const { authorId } = useLocalSearchParams<{ authorId: string }>();
  const api = useDiscoverClient();
  const router = useRouter();
  const { isFollowing, toggleFollow } = useFollows();
  const following = authorId ? isFollowing(authorId) : false;
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadPosts = useCallback(async (reset = false) => {
    if (!authorId) return;
    if (!reset && (!hasMore || loadingMore)) return;
    if (reset) setRefreshing(true);
    else setLoadingMore(true);
    setError(undefined);
    try {
      const res = await api.userPosts({
        params: { authorId },
        query: { cursor: reset ? undefined : cursor, limit: 10 },
      });
      if (res.status === 200) {
        const { items, nextCursor } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      }
    } catch {
      setError(t('userPosts.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [api, authorId, cursor, hasMore, loadingMore]);

  // Mount-only: loadPosts recreates on every state change, mount-only is intentional
  useEffect(() => { void loadPosts(true); }, []);

  return (
    <View style={[sharedStyles.container, { backgroundColor: COLORS.background }]}>
      <View style={sharedStyles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={[styles.backBtnText, { color: COLORS.primary }]}>{'‹'}</Text>
        </Pressable>
        <Text style={sharedStyles.headerTitle}>{t('userPosts.title')}</Text>
        {authorId ? (
          <Pressable
            style={[styles.followBtn, following && styles.followBtnActive]}
            onPress={() => { void toggleFollow(authorId); }}
            accessibilityRole="button"
            accessibilityLabel={following ? t('follow.unfollow') : t('follow.follow')}
          >
            <Text style={[styles.followBtnText, following && styles.followBtnTextActive]}>
              {following ? t('follow.following') : t('follow.follow')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={[sharedStyles.errorRow, { backgroundColor: COLORS.surface }]}>
          <Text style={[sharedStyles.errorText, { color: COLORS.error }]}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void loadPosts(true); }} />}
        onEndReached={() => { void loadPosts(false); }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1976D2" />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: COLORS.textSecondary }]}>{t('userPosts.empty')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ paddingVertical: 12 }} size="small" color="#1976D2" /> : null
        }
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  timestampText: { fontSize: 11 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 12, fontWeight: '600' },
  bodyText: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  counters: { flexDirection: 'row', gap: 16 },
  counterText: { fontSize: 13 },
  backBtn: { paddingEnd: 12, paddingVertical: 4 },
  backBtnText: { fontSize: 26, fontWeight: '400', lineHeight: 28 },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginStart: 8,
  },
  followBtnActive: {
    backgroundColor: COLORS.primary,
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  followBtnTextActive: {
    color: '#FFF',
  },
});
