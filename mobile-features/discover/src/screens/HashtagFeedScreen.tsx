/**
 * HashtagFeedScreen — shows posts whose body contains a specific #hashtag.
 * Uses searchPosts with the hashtag as query.
 */
import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { COLORS, formatRelativeTime, getTypeBadgeColors, HashtagText, sharedStyles } from './shared';

I18nManager.forceRTL(true);

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 < 100 ? 0 : 1)}k`;
  return String(n);
}

interface HashtagPostCardProps {
  post: DiscoverPostType;
  onPress: () => void;
  onHashtagPress: (tag: string) => void;
}

function HashtagPostCard({ post, onPress, onHashtagPress }: HashtagPostCardProps): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);
  const TYPE_LABEL_KEYS: Record<string, string> = {
    photo: t('post.type.photo'),
    tip: t('post.type.tip'),
    event: t('post.type.event'),
    offer: t('post.type.offer'),
  };
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={styles.postCard}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.postMeta}>{post.authorId.slice(0, 8)} · {formatRelativeTime(post.createdAt, t)}</Text>
        <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.typeBadgeText, { color: badgeColors.text }]}>
            {TYPE_LABEL_KEYS[post.type] ?? post.type}
          </Text>
        </View>
      </View>
      <HashtagText text={post.body} style={styles.postBody} onHashtagPress={onHashtagPress} />
      <View style={styles.stats}>
        <Text style={styles.statText}>{t('post.like')} {formatCount(post.likeCount)}</Text>
        <Text style={styles.statDot}>{' · '}</Text>
        <Text style={styles.statText}>{t('post.comment')} {formatCount(post.commentCount)}</Text>
      </View>
    </Pressable>
  );
}

export function HashtagFeedScreen(): ReactElement {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const hashtag = `#${tag ?? ''}`;
  const api = useDiscoverClient();
  const router = useRouter();

  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<string | undefined>(undefined);

  const load = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setError(null);
      cursor.current = undefined;
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await api.searchPosts({ query: { q: hashtag, cursor: cursor.current, limit: 10 } });
      if (res.status === 200) {
        const { items, nextCursor: nc } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        cursor.current = nc;
        setNextCursor(nc);
      } else {
        setError(t('feed.loadError'));
      }
    } catch {
      setError(t('feed.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [api, hashtag]);

  useEffect(() => { void load(true); }, [load]);

  const handleEndReached = useCallback(() => {
    if (!loadingMore && nextCursor) void load(false);
  }, [load, loadingMore, nextCursor]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const handleHashtagPress = useCallback((pressedTag: string) => {
    const bare = pressedTag.replace(/^#/, '');
    router.push({ pathname: '/discover/hashtag/[tag]', params: { tag: bare } } as never);
  }, [router]);

  return (
    <View style={sharedStyles.container}>
      <View style={sharedStyles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={styles.backBtn}
        >
          <Text style={styles.backText}>{'‹'}</Text>
        </Pressable>
        <Text style={sharedStyles.headerTitle}>{hashtag}</Text>
      </View>
      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 32 }} size="large" color={COLORS.primary} />
      ) : error ? (
        <View style={sharedStyles.emptyContainer}>
          <Text style={[sharedStyles.emptyText, { color: COLORS.error }]}>{error}</Text>
          <Pressable onPress={() => void load(true)} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('feed.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={sharedStyles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={({ item }) => (
            <HashtagPostCard
              post={item}
              onPress={() => router.push({ pathname: '/discover/[postId]', params: { postId: item.id } } as never)}
              onHashtagPress={handleHashtagPress}
            />
          )}
          ListEmptyComponent={
            <View style={sharedStyles.emptyContainer}>
              <Text style={sharedStyles.emptyText}>{t('hashtag.empty', { tag: hashtag })}</Text>
            </View>
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ paddingVertical: 12 }} size="small" color={COLORS.primary} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { position: 'absolute', start: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 8 },
  backText: { color: '#FFF', fontSize: 28, lineHeight: 32 },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
  postCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  postMeta: { fontSize: 11, color: COLORS.textMuted },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  postBody: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  statText: { fontSize: 12, color: COLORS.textMuted },
  statDot: { fontSize: 12, color: COLORS.textMuted },
});
