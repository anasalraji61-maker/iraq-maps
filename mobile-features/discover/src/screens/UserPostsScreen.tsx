import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import {
  Animated,
  Alert,
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

function UserPostSkeletonCard(): ReactElement {
  return (
    <View testID="skeleton-user-post" style={[styles.card, { backgroundColor: COLORS.surface, gap: 8, padding: 14, marginBottom: 10 }]}>
      <View style={styles.cardHeader}>
        <SkeletonBlock width={80} height={10} />
        <SkeletonBlock width={40} height={14} />
      </View>
      <SkeletonBlock width={240} height={12} />
      <SkeletonBlock width={170} height={12} />
      <View style={styles.counters}>
        <SkeletonBlock width={60} height={10} />
        <SkeletonBlock width={60} height={10} />
      </View>
    </View>
  );
}

function pinnedKey(authorId: string): string {
  return `@iraq-maps/pinned-post/${authorId}`;
}

async function loadPinnedId(authorId: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(pinnedKey(authorId)); } catch { return null; }
}

async function savePinnedId(authorId: string, postId: string | null): Promise<void> {
  try {
    if (postId) await AsyncStorage.setItem(pinnedKey(authorId), postId);
    else await AsyncStorage.removeItem(pinnedKey(authorId));
  } catch { /* non-critical */ }
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function PostCard({
  post,
  isPinned,
  isOwnProfile,
  onTogglePin,
}: {
  post: DiscoverPostType;
  isPinned: boolean;
  isOwnProfile: boolean;
  onTogglePin: (postId: string) => void;
}): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);
  const TYPE_LABEL: Record<string, string> = {
    photo: t('post.type.photo'),
    tip: t('post.type.tip'),
    event: t('post.type.event'),
    offer: t('post.type.offer'),
  };
  return (
    <View style={[styles.card, { backgroundColor: COLORS.surface, borderStartColor: isPinned ? COLORS.primary : 'transparent', borderStartWidth: isPinned ? 3 : 0 }]}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.timestampText, { color: COLORS.textSecondary }]}>
            {formatRelativeTime(post.createdAt, t)}
          </Text>
          {isPinned ? (
            <View style={styles.pinnedBadge}>
              <Text style={styles.pinnedBadgeText}>{t('pin.pinnedBadge')}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}>
            <Text style={[styles.typeText, { color: badgeColors.text }]}>
              {TYPE_LABEL[post.type] ?? post.type}
            </Text>
          </View>
          {isOwnProfile ? (
            <Pressable
              onPress={() => onTogglePin(post.id)}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? t('pin.unpin') : t('pin.pin')}
              style={styles.pinBtn}
            >
              <Text style={styles.pinBtnText}>{isPinned ? '📌' : '📍'}</Text>
            </Pressable>
          ) : null}
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
  const session = useSession();
  const currentUserId = session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const { isFollowing, toggleFollow } = useFollows();
  const following = authorId ? isFollowing(authorId) : false;
  const isOwnProfile = authorId === currentUserId;
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pinnedPostId, setPinnedPostId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!authorId) return;
    void loadPinnedId(authorId).then(setPinnedPostId);
  }, [authorId]);

  const handleTogglePin = useCallback((postId: string) => {
    if (!authorId) return;
    const newPinned = pinnedPostId === postId ? null : postId;
    setPinnedPostId(newPinned);
    void savePinnedId(authorId, newPinned);
    Alert.alert(t('pin.pinnedBadge'), newPinned ? t('pin.pinSuccess') : t('pin.unpinSuccess'));
  }, [authorId, pinnedPostId]);

  /** Sorted posts: pinned first */
  const sortedPosts = useMemo(() => {
    if (!pinnedPostId) return posts;
    const pinned = posts.find((p) => p.id === pinnedPostId);
    if (!pinned) return posts;
    return [pinned, ...posts.filter((p) => p.id !== pinnedPostId)];
  }, [posts, pinnedPostId]);

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
        data={sortedPosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            isPinned={item.id === pinnedPostId}
            isOwnProfile={isOwnProfile}
            onTogglePin={handleTogglePin}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void loadPosts(true); }} />}
        onEndReached={() => { void loadPosts(false); }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 0 }}>
              {Array.from({ length: 4 }, (_, i) => <UserPostSkeletonCard key={i} />)}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: COLORS.textSecondary }]}>{t('userPosts.empty')}</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <UserPostSkeletonCard /> : null
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
  pinnedBadge: {
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pinnedBadgeText: { fontSize: 10, color: COLORS.primaryDark, fontWeight: '600' },
  pinBtn: { padding: 4 },
  pinBtnText: { fontSize: 16 },
});
