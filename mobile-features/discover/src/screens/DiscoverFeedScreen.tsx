import { discoverTestIDs, type DiscoverPostType } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { useState, useCallback, type ReactElement } from 'react';
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
import { useDiscoverClient } from '../client.js';
import { t } from '../strings.js';

I18nManager.forceRTL(true);

const TYPE_LABEL_KEYS: Record<string, 'post.type.photo' | 'post.type.tip' | 'post.type.event' | 'post.type.offer'> = {
  photo: 'post.type.photo',
  tip: 'post.type.tip',
  event: 'post.type.event',
  offer: 'post.type.offer',
};

function PostItem({
  post,
  onLike,
  onComment,
}: {
  post: DiscoverPostType;
  onLike: (post: DiscoverPostType) => void;
  onComment: (postId: string) => void;
}): ReactElement {
  return (
    <View testID={discoverTestIDs.feedItem(post.id)} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.authorText}>{post.authorId.slice(0, 8)}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{TYPE_LABEL_KEYS[post.type] ? t(TYPE_LABEL_KEYS[post.type]!) : post.type}</Text>
        </View>
      </View>
      <Text style={styles.bodyText}>{post.body}</Text>
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
      </View>
    </View>
  );
}

export function DiscoverFeedScreen(): ReactElement {
  const api = useDiscoverClient();
  const router = useRouter();
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

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
          <PostItem post={item} onLike={handleLike} onComment={handleComment} />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          !refreshing ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('feed.empty')}</Text>
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
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
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
