import { discoverTestIDs, type DiscoverPostType } from '@iraq-maps/contracts';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { memo, useState, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  I18nManager,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { getTypeBadgeColors, sharedStyles, COLORS } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonBlock({ width, height, style }: { width: number | string; height: number; style?: object }): ReactElement {
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
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6, opacity }, style]}
      accessibilityElementsHidden
    />
  );
}

function SkeletonCard(): ReactElement {
  return (
    <View testID="skeleton-card" style={[skeletonStyles.card, { backgroundColor: COLORS.surface }]}>
      <View style={skeletonStyles.header}>
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={50} height={18} />
      </View>
      <SkeletonBlock width="100%" height={14} style={{ marginBottom: 6 }} />
      <SkeletonBlock width="75%" height={14} style={{ marginBottom: 12 }} />
      <View style={skeletonStyles.actions}>
        <SkeletonBlock width={70} height={28} />
        <SkeletonBlock width={70} height={28} />
        <SkeletonBlock width={70} height={28} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
});

function SkeletonFeed(): ReactElement {
  return (
    <View style={{ padding: 12 }} accessibilityLabel={t('feed.loading')}>
      {[1, 2, 3].map((k) => <SkeletonCard key={k} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n % 1000 < 100 ? 0 : 1)}k`;
  }
  return String(n);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('timeNow');
  if (minutes < 60) return t('timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeHours', { n: hours });
  return t('timeDays', { n: Math.floor(hours / 24) });
}

const TYPE_LABEL_KEYS: Record<string, 'post.type.photo' | 'post.type.tip' | 'post.type.event' | 'post.type.offer'> = {
  photo: 'post.type.photo',
  tip: 'post.type.tip',
  event: 'post.type.event',
  offer: 'post.type.offer',
};


const REPORT_REASONS = ['spam', 'inappropriate', 'misinformation', 'other'] as const;
type ReportReason = typeof REPORT_REASONS[number];

const PostItem = memo(function PostItem({
  post,
  placeName,
  firstImageUrl,
  onLike,
  onComment,
  onPlacePress,
  onReport,
  onDelete,
  onEdit,
  currentUserId,
}: {
  post: DiscoverPostType;
  placeName?: string;
  firstImageUrl?: string;
  onLike: (post: DiscoverPostType) => void;
  onComment: (post: DiscoverPostType) => void;
  onPlacePress: (placeId: string) => void;
  onReport: (postId: string, reason: ReportReason) => void;
  onDelete: (postId: string) => void;
  onEdit: (postId: string, body: string) => void;
  currentUserId?: string;
}): ReactElement {
  const isOwn = currentUserId === post.authorId;
  const badgeColors = getTypeBadgeColors(post.type);

  const handleShare = useCallback(() => {
    const message = t('post.shareText', { body: post.body, postId: post.id });
    void Share.share({ message });
  }, [post.body, post.id]);

  const handleMorePress = useCallback(() => {
    if (isOwn) {
      // Own post: show edit and delete options
      Alert.alert(
        t('post.more'),
        undefined,
        [
          {
            text: t('post.edit'),
            onPress: () => onEdit(post.id, post.body),
          },
          {
            text: t('post.delete'),
            style: 'destructive' as const,
            onPress: () => onDelete(post.id),
          },
          { text: t('post.reportCancel'), style: 'cancel' as const },
        ],
      );
      return;
    }
    // Others' posts: show report reasons
    const reasonLabels = REPORT_REASONS.map((r) => t(`post.reportReason.${r}`));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('post.reportTitle'),
          options: [...reasonLabels, t('post.reportCancel')],
          cancelButtonIndex: reasonLabels.length,
          destructiveButtonIndex: undefined,
        },
        (idx) => {
          const reason = REPORT_REASONS[idx];
          if (reason) onReport(post.id, reason);
        },
      );
    } else {
      Alert.alert(
        t('post.report'),
        t('post.reportTitle'),
        [
          ...REPORT_REASONS.map((r) => ({
            text: t(`post.reportReason.${r}`),
            onPress: () => onReport(post.id, r),
          })),
          { text: t('post.reportCancel'), style: 'cancel' as const },
        ],
      );
    }
  }, [post.id, post.body, onReport, onDelete, onEdit, isOwn]);

  return (
    <View testID={discoverTestIDs.feedItem(post.id)} style={[styles.card, { backgroundColor: COLORS.surface }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.authorText, { color: COLORS.textSecondary }]}>{post.authorId.slice(0, 8)}</Text>
          <Text style={[styles.timestampText, { color: COLORS.textSecondary }]}>{formatRelativeTime(post.createdAt)}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View
            style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}
            accessibilityRole="text"
            accessibilityLabel={t('post.typeA11y', { type: TYPE_LABEL_KEYS[post.type] ? t(TYPE_LABEL_KEYS[post.type]!) : post.type })}
          >
            <Text style={[styles.typeText, { color: badgeColors.text }]}>
              {TYPE_LABEL_KEYS[post.type] ? t(TYPE_LABEL_KEYS[post.type]!) : post.type}
            </Text>
          </View>
          <Pressable
            style={styles.moreBtn}
            onPress={handleMorePress}
            accessibilityRole="button"
            accessibilityLabel={t('post.more')}

          >
            <Text style={[styles.moreBtnText, { color: COLORS.textSecondary }]}>{t('post.moreIcon')}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: COLORS.textPrimary }]}>{post.body}</Text>
      {firstImageUrl ? (
        <Image source={{ uri: firstImageUrl }} style={styles.postImage} resizeMode="cover" />
      ) : null}
      {post.placeId ? (
        <Pressable
          style={styles.placeChip}
          onPress={() => onPlacePress(post.placeId!)}
          accessibilityRole="button"
          accessibilityLabel={placeName ?? post.placeId.slice(0, 8)}
        >
          <Text style={styles.placeChipText}>📍 {placeName ?? post.placeId.slice(0, 8)}</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          testID={discoverTestIDs.likeButton(post.id)}
          style={[styles.actionBtn, { backgroundColor: COLORS.border }, post.isLikedByMe && styles.actionBtnActive]}
          onPress={() => { Vibration.vibrate(30); onLike(post); }}
          accessibilityRole="button"
          accessibilityLabel={t('post.likeA11y', { author: post.authorId.slice(0, 8) })}
        >
          <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }, post.isLikedByMe && styles.actionBtnTextActive]}>
            {t('post.like')} {formatCount(post.likeCount)}
          </Text>
        </Pressable>
        <Pressable
          testID={discoverTestIDs.commentButton(post.id)}
          style={[styles.actionBtn, { backgroundColor: COLORS.border }]}
          onPress={() => onComment(post)}
          accessibilityRole="button"
        >
          <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>
            {t('post.comment')} {formatCount(post.commentCount)}
          </Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.border }]} onPress={handleShare} accessibilityRole="button">
          <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>{t('post.share')}</Text>
        </Pressable>
      </View>
    </View>
  );
});

export function DiscoverFeedScreen(): ReactElement {
  const api = useDiscoverClient();
  const extApi = useApi();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [placeNames, setPlaceNames] = useState<Readonly<Record<string, string>>>({});
  const [mediaUrls, setMediaUrls] = useState<Readonly<Record<string, string>>>({});
  const fetchingPlaceIds = useRef(new Set<string>());
  const fetchingAssetIds = useRef(new Set<string>());
  const [editingPost, setEditingPost] = useState<{ id: string; body: string } | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadFeed = useCallback(async (reset = false) => {
    if (!reset && (!hasMore || loadingMore)) return;
    if (reset) {
      setRefreshing(true);
    } else {
      setLoadingMore(true);
    }
    setError(undefined);
    setIsNetworkError(false);
    try {
      const res = await api.listFeed({ query: { cursor: reset ? undefined : cursor, limit: 10 } });
      if (res.status === 200) {
        const { items, nextCursor } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      }
    } catch (err) {
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && (err.message.includes('Network') || err.message.includes('fetch') || err.message.includes('network')));
      setIsNetworkError(isNetwork);
      setError(isNetwork ? t('feed.networkError') : t('feed.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [api, cursor, hasMore, loadingMore]);

  // Load once on mount. loadFeed recreates on every state change so adding it
  // to deps would cause an infinite reload loop; mount-only is intentional.
  useEffect(() => { void loadFeed(true); }, []);

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
          const res = await extApi.places.get({ params: { id } });
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
  }, [posts, placeNames, extApi]);

  // Fetch signed read URLs for first asset of posts that have media
  useEffect(() => {
    const assetIds = posts
      .flatMap((p) => p.mediaAssetIds.slice(0, 1))
      .filter((id) => !!id && !mediaUrls[id] && !fetchingAssetIds.current.has(id));
    if (assetIds.length === 0) return;
    assetIds.forEach((id) => fetchingAssetIds.current.add(id));
    void Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const res = await extApi.media.readUrl({ params: { assetId }, query: { size: 'thumbnail' } });
          if (res.status === 200) {
            const url: string = res.body.url.startsWith('/') ? `${res.body.url}` : res.body.url;
            setMediaUrls((prev) => ({ ...prev, [assetId]: url }));
          }
        } catch {
          // silent — image simply won't show
        } finally {
          fetchingAssetIds.current.delete(assetId);
        }
      }),
    );
  }, [posts, mediaUrls, extApi]);

  const handleRefresh = useCallback(() => { void loadFeed(true); }, [loadFeed]);
  const handleEndReached = useCallback(() => { void loadFeed(false); }, [loadFeed]);

  const handleReport = useCallback(async (postId: string, reason: ReportReason) => {
    try {
      await api.reportPost({ params: { postId }, body: { reason } });
      Alert.alert(t('post.reportSuccess'));
    } catch {
      Alert.alert(t('post.reportError'));
    }
  }, [api]);

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await api.deletePost({ params: { postId } });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      Alert.alert(t('post.deleteError'));
    }
  }, [api]);

  const handleOpenEdit = useCallback((postId: string, body: string) => {
    setEditingPost({ id: postId, body });
    setEditBody(body);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingPost || editBody.trim().length === 0) return;
    setEditSaving(true);
    try {
      const res = await api.updatePost({ params: { postId: editingPost.id }, body: { body: editBody.trim() } });
      if (res.status === 200) {
        setPosts((prev) => prev.map((p) => p.id === editingPost.id ? { ...p, body: res.body.body } : p));
        setEditingPost(null);
      } else {
        Alert.alert(t('post.editError'));
      }
    } catch {
      Alert.alert(t('post.editError'));
    } finally {
      setEditSaving(false);
    }
  }, [api, editingPost, editBody]);

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

  const handleComment = useCallback((post: DiscoverPostType) => {
    router.push({
      pathname: '/discover/[postId]/index',
      params: { postId: post.id, postJson: JSON.stringify(post) },
    });
  }, [router]);

  const handlePlacePress = useCallback((placeId: string) => {
    router.push({ pathname: '/', params: { focusPlaceId: placeId } });
  }, [router]);

  const handleCreate = useCallback(() => {
    router.push('/discover/create');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('feed.title')}</Text>
      </View>
      {error ? (
        <View style={[styles.errorRow, { backgroundColor: COLORS.surface }]}>
          <Text style={[styles.errorText, { color: COLORS.error }]}>{error}</Text>
          {isNetworkError ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() => { void loadFeed(true); }}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>{t('feed.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        accessibilityRole="list"
        renderItem={({ item }) => (
          <PostItem
            post={item}
            placeName={item.placeId ? placeNames[item.placeId] : undefined}
            firstImageUrl={item.mediaAssetIds[0] ? mediaUrls[item.mediaAssetIds[0]] : undefined}
            onLike={handleLike}
            onComment={handleComment}
            onPlacePress={handlePlacePress}
            onReport={handleReport}
            onDelete={handleDelete}
            onEdit={handleOpenEdit}
            currentUserId={currentUserId}
          />
        )}
        initialNumToRender={5}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? (
            <SkeletonFeed />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('feed.empty')}</Text>
              <Pressable style={styles.emptyCreateBtn} onPress={handleCreate}>
                <Text style={styles.emptyCreateBtnText}>{t('post.create')}</Text>
              </Pressable>
            </View>
          )
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
        accessibilityRole="button"
        accessibilityLabel={t('post.create')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <Modal
        visible={editingPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalBox}>
            <Text style={styles.editModalTitle}>{t('post.editTitle')}</Text>
            <TextInput
              style={styles.editModalInput}
              value={editBody}
              onChangeText={setEditBody}
              multiline
              maxLength={1000}
              placeholder={t('post.editPlaceholder')}
              autoFocus
              accessibilityLabel={t('post.editPlaceholder')}
            />
            <View style={styles.editModalActions}>
              <Pressable
                style={styles.editModalCancel}
                onPress={() => setEditingPost(null)}
                accessibilityRole="button"
                accessibilityLabel={t('post.editCancel')}
              >
                <Text style={styles.editModalCancelText}>{t('post.editCancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.editModalSave, editSaving && { opacity: 0.6 }]}
                onPress={() => { void handleSaveEdit(); }}
                disabled={editSaving}
                accessibilityRole="button"
                accessibilityLabel={t('post.editSave')}
              >
                {editSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.editModalSaveText}>{t('post.editSave')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: sharedStyles.container,
  header: sharedStyles.header,
  headerTitle: sharedStyles.headerTitle,
  errorRow: { ...sharedStyles.errorRow, flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorText: { ...sharedStyles.errorText, flex: 1 },
  retryBtn: { backgroundColor: COLORS.error, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryBtnText: { color: COLORS.surface, fontSize: 13, fontWeight: '600' },
  listContent: { padding: 12, paddingBottom: 80 },
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
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreBtn: {
    padding: 2,
  },
  moreBtnText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  authorText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  timestampText: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  typeBadge: { backgroundColor: COLORS.primaryXLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  bodyText: {
    fontSize: 15,
    color: '#222',
    lineHeight: 22,
    textAlign: 'auto',
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
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
  editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  editModalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420 },
  editModalTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' },
  editModalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  editModalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  editModalCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  editModalCancelText: { fontSize: 14, color: '#555' },
  editModalSave: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1976D2', minWidth: 70, alignItems: 'center' },
  editModalSaveText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
