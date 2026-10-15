import { type DiscoverPostType, type Inquiry, type NotificationItem } from '@iraq-maps/contracts';
import { href, recentRoutes, savedPlaces, type RecentRoute, type SavedPlace, useApi, useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { useActivityMessagingClient } from './messagingClient';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { t } from './strings';

I18nManager.forceRTL(true);

// ──────────────────────────────────────────────
// Skeleton loader
// ──────────────────────────────────────────────

function SkeletonBox({ width, height }: { width: number; height: number }): ReactElement {
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
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 4 }, { opacity }]} accessibilityElementsHidden />;
}

function SkeletonNotifRow(): ReactElement {
  return (
    <View testID="skeleton-notif-row" style={skeletonStyles.row}>
      <View style={skeletonStyles.icon} />
      <View style={skeletonStyles.body}>
        <SkeletonBox width={160} height={12} />
        <SkeletonBox width={220} height={11} />
        <SkeletonBox width={60} height={10} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E0E0E0' },
  body: { flex: 1, gap: 6 },
});

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

type Tab = 'notifications' | 'routes' | 'saved' | 'posts' | 'inquiries';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('timeNow');
  if (minutes < 60) return t('timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('timeHours', { n: hours });
  return t('timeDays', { n: Math.floor(hours / 24) });
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }): ReactElement {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyIcon} accessibilityElementsHidden>{icon}</Text>
      <Text style={styles.emptyText}>{title}</Text>
      <Text style={styles.emptySubtext}>{subtitle}</Text>
    </View>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <View style={styles.center}>
      <Text style={styles.errorText}>{t('loadError')}</Text>
      <Pressable onPress={onRetry} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel={t('retry')}>
        <Text style={styles.retryText}>{t('retry')}</Text>
      </Pressable>
    </View>
  );
}

// ──────────────────────────────────────────────
// Notifications tab
// ──────────────────────────────────────────────

type NotifItem = NotificationItem & { _type?: string };

function notifIcon(data?: Record<string, string>): string {
  const type = data?.['type'];
  if (type === 'liked' || type === 'post_liked') return '❤️';
  if (type === 'commented' || type === 'post_commented') return '💬';
  if (type === 'message') return '✉️';
  if (type === 'verification') return '✅';
  return '🔔';
}

function NotifRow({ item, onPress }: { item: NotifItem; onPress: (item: NotifItem) => void }): ReactElement {
  const unread = item.readAt === null;
  return (
    <Pressable
      style={[styles.row, unread && styles.rowUnread]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      accessibilityState={{ selected: unread }}
    >
      <Text style={styles.rowIcon} accessibilityElementsHidden>{notifIcon(item.data)}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowSub} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      {unread ? <View style={styles.unreadDot} accessibilityElementsHidden /> : null}
    </Pressable>
  );
}

const NOTIF_PAGE_SIZE = 15;

function NotificationsTab(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(NOTIF_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async (silent = false) => {
    if (!session) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await api.notifications.listNotifications({ query: {} });
      if (res.status === 200) {
        setItems(res.body.items as NotifItem[]);
        setError(undefined);
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, session]);

  useEffect(() => { void load(); }, [load]);

  const handlePress = useCallback(async (item: NotifItem) => {
    // Mark as read (best-effort, regardless of current state)
    try {
      if (item.readAt === null) {
        await api.notifications.markRead({ params: { id: item.id }, body: {} });
        setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
      }
    } catch { /* best-effort */ }
    // Deep-link navigation based on notification data
    const data = item.data ?? {};
    const type = data['type'];
    if ((type === 'post_liked' || type === 'post_commented') && data['postId']) {
      router.push(href('discoverPost', { postId: data['postId'] }));
    } else if (type === 'new_message' && data['requestId']) {
      router.push(href('messageThread', { requestId: data['requestId'] }));
    } else if (type === 'inquiry_replied' && data['requestId']) {
      router.push(href('messageThread', { requestId: data['requestId'] }));
    }
  }, [api, router]);

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => n.readAt === null);
    await Promise.allSettled(unread.map((n) => api.notifications.markRead({ params: { id: n.id }, body: {} })));
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }, [api, items]);

  // Auto-mark all notifications as read 1.5 s after the list loads (gives user time to see unread state).
  // We intentionally omit markAllRead from deps so we fire once per load, not on every items change.
  const markAllReadRef = useRef(markAllRead);
  markAllReadRef.current = markAllRead;
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => { void markAllReadRef.current(); }, 1500);
    return () => clearTimeout(timer);
  }, [loading]);

  const unreadCount = items.filter((n) => n.readAt === null).length;

  if (!session) {
    return <EmptyState icon="🔔" title={t('loginPrompt')} subtitle="" />;
  }
  if (loading) {
    return (
      <View style={styles.flex}>
        {[1, 2, 3, 4].map((k) => <SkeletonNotifRow key={k} />)}
      </View>
    );
  }
  if (error) return <LoadError onRetry={() => { void load(); }} />;

  return (
    <View style={styles.flex}>
      {unreadCount > 0 && (
        <View style={styles.markAllBar}>
          <Pressable onPress={() => { void markAllRead(); }} accessibilityRole="button" accessibilityLabel={t('markAllRead')}>
            <Text style={styles.markAllText}>{t('markAllRead')}</Text>
          </Pressable>
        </View>
      )}
      {items.length === 0 ? (
        <EmptyState icon="🔔" title={t('empty')} subtitle={t('emptySubtext')} />
      ) : (
        <FlatList
          data={items.slice(0, visibleCount)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotifRow item={item} onPress={handlePress} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setVisibleCount(NOTIF_PAGE_SIZE); void load(true); }} colors={['#1976D2']} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={() => {
            if (visibleCount < items.length) setVisibleCount((c) => c + NOTIF_PAGE_SIZE);
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            visibleCount < items.length ? (
              <Pressable
                style={styles.loadMoreBtn}
                onPress={() => setVisibleCount((c) => c + NOTIF_PAGE_SIZE)}
                accessibilityRole="button"
              >
                <Text style={styles.loadMoreText}>{t('loadMore')}</Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ──────────────────────────────────────────────
// Recent routes tab
// ──────────────────────────────────────────────

function formatDistance(m: number): string {
  if (m >= 1000) return t('distanceKm', { n: (m / 1000).toFixed(1) });
  return t('distanceM', { n: m });
}

function formatDuration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return t('durationMin', { n: min });
  return t('durationHour', { h: Math.floor(min / 60), m: min % 60 });
}

function RouteRow({ item, onRemove }: { item: RecentRoute; onRemove: (item: RecentRoute) => void }): ReactElement {
  const router = useRouter();
  const modeLabel = item.mode === 'walk' ? t('modeWalking') : t('modeDriving');
  const icon = item.mode === 'walk' ? '🚶' : '🚗';
  return (
    <View style={styles.row} accessibilityRole="none">
      <Text style={styles.rowIcon} accessibilityElementsHidden>{icon}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowSub}>{modeLabel} · {formatDistance(item.distanceM)} · {formatDuration(item.durationS)}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(item.at)}</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/route/[placeId]' as never, params: { placeId: item.placeId, mode: item.mode } })}
          style={styles.navigateAgainBtn}
          accessibilityRole="button"
          accessibilityLabel={t('navigateAgain')}
        >
          <Text style={styles.navigateAgainText}>{t('navigateAgain')}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => onRemove(item)} style={styles.removeBtn} accessibilityRole="button" accessibilityLabel={t('removeRoute')}>
        <Text style={styles.removeBtnText}>{t('removeRoute')}</Text>
      </Pressable>
    </View>
  );
}

function RoutesTab(): ReactElement {
  const [routes, setRoutes] = useState<RecentRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setRoutes(await recentRoutes.list());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRemove = useCallback(async (item: RecentRoute) => {
    setRoutes((prev) => prev.filter((r) => !(r.placeId === item.placeId && r.mode === item.mode)));
    await recentRoutes.remove(item.placeId, item.mode);
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1976D2" /></View>;
  if (routes.length === 0) return <EmptyState icon="🗺️" title={t('emptyRoutes')} subtitle={t('emptyRoutesSubtext')} />;

  return (
    <FlatList
      data={routes}
      keyExtractor={(item) => `${item.placeId}-${item.mode}`}
      renderItem={({ item }) => <RouteRow item={item} onRemove={handleRemove} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} colors={['#1976D2']} />}
    />
  );
}

// ──────────────────────────────────────────────
// Saved places tab
// ──────────────────────────────────────────────

function SavedRow({ item, onRemove }: { item: SavedPlace; onRemove: (item: SavedPlace) => void }): ReactElement {
  return (
    <View style={styles.row} accessibilityRole="none">
      <Text style={styles.rowIcon} accessibilityElementsHidden>{'📍'}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        {item.category ? <Text style={styles.rowSub}>{item.category}</Text> : null}
        <Text style={styles.rowTime}>{formatRelativeTime(item.savedAt)}</Text>
      </View>
      <Pressable onPress={() => onRemove(item)} style={styles.removeBtn} accessibilityRole="button" accessibilityLabel={t('removePlace')}>
        <Text style={styles.removeBtnText}>{t('removePlace')}</Text>
      </Pressable>
    </View>
  );
}

function SavedTab(): ReactElement {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setPlaces(await savedPlaces.list());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRemove = useCallback(async (item: SavedPlace) => {
    await savedPlaces.remove(item.placeId);
    setPlaces((prev) => prev.filter((p) => p.placeId !== item.placeId));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1976D2" /></View>;
  if (places.length === 0) return <EmptyState icon="🔖" title={t('emptySaved')} subtitle={t('emptySavedSubtext')} />;

  return (
    <FlatList
      data={places}
      keyExtractor={(item) => item.placeId}
      renderItem={({ item }) => <SavedRow item={item} onRemove={handleRemove} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} colors={['#1976D2']} />}
    />
  );
}

// ──────────────────────────────────────────────
// My posts tab
// ──────────────────────────────────────────────

function PostRow({ item, onDelete, onEdit }: { item: DiscoverPostType; onDelete: (postId: string) => void; onEdit: (postId: string, body: string) => void }): ReactElement {
  const hasMedia = item.mediaAssetIds && item.mediaAssetIds.length > 0;

  const handleDeletePress = useCallback(() => {
    Alert.alert(
      t('deletePostConfirmTitle'),
      t('deletePostConfirmMsg'),
      [
        { text: t('deletePostCancel'), style: 'cancel' as const },
        { text: t('deletePost'), style: 'destructive' as const, onPress: () => onDelete(item.id) },
      ],
    );
  }, [item.id, onDelete]);

  return (
    <View style={styles.row} accessibilityRole="none">
      <Text style={styles.rowIcon} accessibilityElementsHidden>{hasMedia ? '📷' : '📝'}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.rowSub}>{t('postLikes', { n: item.likeCount })} · {t('postComments', { n: item.commentCount })}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      <View style={styles.postActions}>
        <Pressable
          style={styles.editPostBtn}
          onPress={() => onEdit(item.id, item.body)}
          accessibilityRole="button"
          accessibilityLabel={t('editPost')}
        >
          <Text style={styles.editPostBtnText}>{t('editPost')}</Text>
        </Pressable>
        <Pressable
          style={styles.deletePostBtn}
          onPress={handleDeletePress}
          accessibilityRole="button"
          accessibilityLabel={t('deletePost')}
        >
          <Text style={styles.deletePostBtnText}>{t('deletePost')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PostsTab(): ReactElement {
  const api = useApi();
  const session = useSession();
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [editingPost, setEditingPost] = useState<{ id: string; body: string } | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const editInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setLoading(true);
    try {
      // Fetch feed and filter to posts by the current user
      const res = await api.discover.listFeed({ query: { limit: 50 } });
      if (res.status === 200) {
        const userId = session.state.status === 'signedIn' ? session.state.user.id : null;
        const mine = res.body.items.filter((p) => p.authorId === userId);
        setPosts(mine);
        setError(undefined);
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [api, session]);

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await api.discover.deletePost({ params: { postId } });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      Alert.alert(t('deletePostError'));
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
      const res = await api.discover.updatePost({ params: { postId: editingPost.id }, body: { body: editBody.trim() } });
      if (res.status === 200) {
        setPosts((prev) => prev.map((p) => p.id === editingPost.id ? { ...p, body: res.body.body } : p));
        setEditingPost(null);
      } else {
        Alert.alert(t('editPostError'));
      }
    } catch {
      Alert.alert(t('editPostError'));
    } finally {
      setEditSaving(false);
    }
  }, [api, editingPost, editBody]);

  useEffect(() => { void load(); }, [load]);

  if (!session) return <EmptyState icon="📝" title={t('loginPrompt')} subtitle="" />;
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1976D2" /></View>;
  if (error) return <LoadError onRetry={() => { void load(); }} />;
  if (posts.length === 0) return <EmptyState icon="📝" title={t('emptyPosts')} subtitle={t('emptyPostsSubtext')} />;

  return (
    <>
      <Modal
        visible={editingPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalBox}>
            <Text style={styles.editModalTitle}>{t('editPostTitle')}</Text>
            <TextInput
              ref={editInputRef}
              style={styles.editModalInput}
              value={editBody}
              onChangeText={setEditBody}
              multiline
              maxLength={1000}
              placeholder={t('editPostPlaceholder')}
              autoFocus
              accessibilityLabel={t('editPostPlaceholder')}
            />
            <View style={styles.editModalActions}>
              <Pressable
                style={styles.editModalCancel}
                onPress={() => setEditingPost(null)}
                accessibilityRole="button"
                accessibilityLabel={t('editPostCancel')}
              >
                <Text style={styles.editModalCancelText}>{t('editPostCancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.editModalSave, editSaving && { opacity: 0.6 }]}
                onPress={() => { void handleSaveEdit(); }}
                disabled={editSaving}
                accessibilityRole="button"
                accessibilityLabel={t('editPostSave')}
              >
                {editSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.editModalSaveText}>{t('editPostSave')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PostRow item={item} onDelete={(id) => { void handleDelete(id); }} onEdit={handleOpenEdit} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }}
          colors={['#1976D2']}
          tintColor="#1976D2"
        />
      }
    />
    </>
  );
}

// ──────────────────────────────────────────────
// My inquiries tab
// ──────────────────────────────────────────────

function inquiryStatus(targets: Inquiry['targets']): string {
  if (targets.some((t) => t.status === 'replied')) return t('inquiryStatusReplied');
  if (targets.every((t) => t.status === 'failed')) return t('inquiryStatusClosed');
  if (targets.some((t) => t.status === 'sent' || t.status === 'delivered' || t.status === 'read')) return t('inquiryStatusSent');
  return t('inquiryStatusPending');
}

const INQUIRY_ICON = '✉️'; // ✉️ — kept as variable to avoid jsx-literal-string lint

function InquiryRow({ item }: { item: Inquiry }): ReactElement {
  const count = item.targets.length;
  const placesLabel = count === 1 ? t('inquiryTarget') : t('inquiryTargets', { n: count });
  const statusLabel = inquiryStatus(item.targets);

  return (
    <View style={styles.row} accessibilityRole="none">
      <Text style={styles.rowIcon} accessibilityElementsHidden>{INQUIRY_ICON}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.text}</Text>
        <Text style={styles.rowSub}>{placesLabel} · {statusLabel}</Text>
        <Text style={styles.rowTime}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
    </View>
  );
}

function InquiriesTab(): ReactElement {
  const messagingApi = useActivityMessagingClient();
  const session = useSession();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Use a ref to stable-ise the client so useEffect doesn't re-trigger on each render
  const apiRef = useRef(messagingApi);
  apiRef.current = messagingApi;

  const load = useCallback(async (silent = false) => {
    if (!session) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await apiRef.current.listInquiries({ query: {} });
      if (res.status === 200) {
        setItems(res.body.items);
        setError(undefined);
      } else {
        setError(t('loadError'));
      }
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  if (!session) {
    return <EmptyState icon={INQUIRY_ICON} title={t('loginPrompt')} subtitle="" />;
  }
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1976D2" /></View>;
  if (error) return <LoadError onRetry={() => { void load(); }} />;
  if (items.length === 0) return <EmptyState icon={INQUIRY_ICON} title={t('emptyInquiries')} subtitle={t('emptyInquiriesSubtext')} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <InquiryRow item={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} colors={['#1976D2']} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

// ──────────────────────────────────────────────
// Root screen
// ──────────────────────────────────────────────

export function ActivityScreen(): ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('notifications');

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'notifications', label: t('tabNotifications') },
    { id: 'routes', label: t('tabRoutes') },
    { id: 'saved', label: t('tabSaved') },
    { id: 'posts', label: t('tabPosts') },
    { id: 'inquiries', label: t('tabInquiries') },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('title')}</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar} accessibilityRole="tablist">
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.id }}
            accessibilityLabel={tab.label}
          >
            <Text
              style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={styles.tabUnderline} />}
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      <View style={styles.flex}>
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'routes' && <RoutesTab />}
        {activeTab === 'saved' && <SavedTab />}
        {activeTab === 'posts' && <PostsTab />}
        {activeTab === 'inquiries' && <InquiriesTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  flex: { flex: 1 },
  header: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    position: 'relative',
  },
  tabItemActive: {},
  tabLabel: { fontSize: 12, color: '#888', textAlign: 'center' },
  tabLabelActive: { color: '#1976D2', fontWeight: '600' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    start: 4,
    end: 4,
    height: 2,
    backgroundColor: '#1976D2',
    borderRadius: 1,
  },
  markAllBar: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  markAllText: { color: '#1976D2', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    gap: 12,
  },
  rowUnread: { backgroundColor: '#E3F2FD' },
  rowIcon: { fontSize: 24, lineHeight: 28 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 2 },
  rowTitleUnread: { fontWeight: '700', color: '#1976D2' },
  rowSub: { fontSize: 13, color: '#666', lineHeight: 18 },
  rowTime: { fontSize: 11, color: '#999', marginTop: 4 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#1976D2',
    marginTop: 8, flexShrink: 0,
  },
  removeBtn: { padding: 8, marginTop: -4 },
  navigateAgainBtn: { alignSelf: 'flex-start', marginTop: 2 },
  navigateAgainText: { fontSize: 13, color: '#1976D2', fontWeight: '600' },
  removeBtnText: { fontSize: 16, color: '#999' },
  postActions: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  editPostBtn: { padding: 6 },
  editPostBtnText: { fontSize: 13, color: '#1976D2', fontWeight: '500' },
  deletePostBtn: { padding: 6 },
  deletePostBtnText: { fontSize: 13, color: '#C62828', fontWeight: '500' },
  editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  editModalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420 },
  editModalTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' },
  editModalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  editModalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  editModalCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  editModalCancelText: { fontSize: 14, color: '#555' },
  editModalSave: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1976D2', minWidth: 70, alignItems: 'center' },
  editModalSaveText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#F0F0F0' },
  loadMoreBtn: { alignItems: 'center', padding: 14 },
  loadMoreText: { fontSize: 14, color: '#1976D2', fontWeight: '600' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#555', fontWeight: '500', textAlign: 'center', marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  errorText: { fontSize: 15, color: '#C62828', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#1976D2', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
