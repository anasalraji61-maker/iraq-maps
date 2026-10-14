import { discoverTestIDs, type DiscoverPostType } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';

I18nManager.forceRTL(true);

const TYPE_LABEL_KEYS: Record<string, 'post.type.photo' | 'post.type.tip' | 'post.type.event' | 'post.type.offer'> = {
  photo: 'post.type.photo',
  tip: 'post.type.tip',
  event: 'post.type.event',
  offer: 'post.type.offer',
};

const TYPE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  photo: { bg: '#E3F2FD', text: '#1976D2' },
  tip:   { bg: '#E8F5E9', text: '#388E3C' },
  event: { bg: '#FFF3E0', text: '#F57C00' },
  offer: { bg: '#FFEBEE', text: '#D32F2F' },
};

function PostItem({
  post,
  placeName,
  onLike,
  onComment,
  onPlacePress,
}: {
  post: DiscoverPostType;
  placeName?: string;
  onLike: (post: DiscoverPostType) => void;
  onComment: (postId: string) => void;
  onPlacePress: (placeId: string) => void;
}): ReactElement {
  const badgeColors = TYPE_BADGE_COLORS[post.type] ?? { bg: '#E3F2FD', text: '#1976D2' };

  const handleShare = useCallback(() => {
    void Share.share({ message: post.body });
  }, [post.body]);

  return (
    <View testID={discoverTestIDs.feedItem(post.id)} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.authorText}>{post.authorId.slice(0, 8)}</Text>
        <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.typeText, { color: badgeColors.text }]}>
            {TYPE_LABEL_KEYS[post.type] ? t(TYPE_LABEL_KEYS[post.type]!) : post.type}
          </Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{post.body}</Text>
      {post.placeId ? (
        <Pressable style={styles.placeChip} onPress={() => onPlacePress(post.placeId!)}>
          <Text style={styles.placeChipText}>📍 {placeName ?? post.placeId.slice(0, 8)}</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          testID={discoverTestIDs.likeButton(post.id)}
          style={[styles.actionBtn, post.isLikedByMe && styles.actionBtnActive]}
          onPress={() => onLike(post)}
        >
          <Text style={[styles.actionBtnText, post.isLikedByMe && styles.actionBtnTextActive]}>
            {t('post.like')} {post.likeCount}
          </Text>
        </Pressable>
        <Pressable
          testID={discoverTestIDs.commentButton(post.id)}
          style={styles.actionBtn}
          onPress={() => onComment(post.id)}
        >
          <Text style={styles.actionBtnText}>
            {t('post.comment')} {post.commentCount}
          </Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={handleShare}>
          <Text style={styles.actionBtnText}>{t('post.share')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function DiscoverFeedScreen(): ReactElement {
  const api = useDiscoverClient();
  const placesApi = useApi();
  const router = useRouter();
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [placeNames, setPlaceNames] = useState<Readonly<Record<string, string>>>({});
  const fetchingPlaceIds = useRef(new Set<string>());

  const loadFeed = useCallback(async (reset = false) => {
    if (!reset && (!hasMore || loadingMore)) return;
    if (reset) {
      setRefreshing(true);
    } else {
      setLoadingMore(true);
    }
    setError(undefined);
    try {
      const res = await api.listFeed({ query: { cursor: reset ? undefined : cursor, limit: 10 } });
      if (res.status === 200) {
        const { items, nextCursor } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      }
    } catch {
      setError(t('feed.loadError'));
    } finally {
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [api, cursor, hasMore, loadingMore]);

  useEffect(() => { void loadFeed(true); }, []); // eslint-disable-line

  // Fetch place names for any post.placeId not yet loaded
  useEffect(() => {
    const ids = posts
      .map((p) => p.placeId)
      .filter((id): id is NonNullable<typeof id> => !!id && !placeNames[id as string] && !fetchingPlaceIds.current.has(id as string));
    if (ids.length === 0) return;
    ids.forEach((id) => fetchingPlaceIds.current.add(id as string));
    void Promise.all(
      ids.map(async (id) => {
        const idStr = id as string;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (placesApi as any).places.get({ params: { id } });
          if (res.status === 200) {
            const name: string = res.body.names.ar ?? res.body.names.name;
            setPlaceNames((prev) => ({ ...prev, [idStr]: name }));
          }
        } catch {
          // silent — place chip falls back to id slice
        } finally {
          fetchingPlaceIds.current.delete(idStr);
        }
      }),
    );
  }, [posts, placeNames, placesApi]);

  const handleRefresh = useCallback(() => { void loadFeed(true); }, [loadFeed]);
  const handleEndReached = useCallback(() => { void loadFeed(false); }, [loadFeed]);

  const handleLike = useCallback(async (post: DiscoverPostType) => {
    try {
      const postId = post.id;
      if (post.isLikedByMe) {
        const res = await api.unlikePost({ params: { postId } });
        if (res.status === 200) {
          setPosts((prev) =>
            prev.map((p) => p.id === postId ? { ...p, isLikedByMe: false, likeCount: res.body.likeCount } : p),
          );
        }
      } else {
        const res = await api.likePost({ params: { postId }, body: {} });
        if (res.status === 200) {
          setPosts((prev) =>
            prev.map((p) => p.id === postId ? { ...p, isLikedByMe: true, likeCount: res.body.likeCount } : p),
          );
        }
      }
    } catch {
      // silent — like is best-effort
    }
  }, [api]);

  const handleComment = useCallback((postId: string) => {
    router.push({ pathname: '/discover/comments', params: { postId } });
  }, [router]);

  const handlePlacePress = useCallback((placeId: string) => {
    router.push({ pathname: '/', params: { focusPlaceId: placeId } });
  }, [router]);

  const handleCreate = useCallback(() => {
    router.push('/discover/create');
  }, [router]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('feed.title')}</Text>
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostItem
            post={item}
            placeName={item.placeId ? placeNames[item.placeId] : undefined}
            onLike={handleLike}
            onComment={handleComment}
            onPlacePress={handlePlacePress}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          !refreshing ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('feed.empty')}</Text>
              <Pressable style={styles.emptyCreateBtn} onPress={handleCreate}>
                <Text style={styles.emptyCreateBtnText}>{t('post.create')}</Text>
              </Pressable>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.loadingMore} size="small" color="#1976D2" /> : null
        }
        contentContainerStyle={styles.listContent}
      />
      <Pressable
        testID={discoverTestIDs.createPostButton}
        style={styles.fab}
        onPress={handleCreate}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  errorRow: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    textAlign: 'auto',
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#FFF',
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
  authorText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  typeBadge: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  bodyText: {
    fontSize: 15,
    color: '#222',
    lineHeight: 22,
    textAlign: 'auto',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
  },
  actionBtnActive: {
    backgroundColor: '#BBDEFB',
  },
  actionBtnText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  actionBtnTextActive: {
    color: '#1565C0',
  },
  placeChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  placeChipText: {
    fontSize: 13,
    color: '#388E3C',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyCreateBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingMore: {
    paddingVertical: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    end: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 32,
  },
});
