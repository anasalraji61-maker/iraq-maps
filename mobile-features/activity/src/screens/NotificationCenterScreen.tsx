/**
 * NotificationCenterScreen — full-featured notification inbox
 * Groups: Today / Yesterday / This Week / Older
 * Swipe-to-delete, long-press context menu, tap to navigate, pull-to-refresh,
 * "mark all read" in header, empty state with illustration.
 */
import { type NotificationItem } from '@iraq-maps/contracts';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  I18nManager,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const DANGER = '#C62828';
const UNREAD_BG = '#E3F2FD';
const SWIPE_THRESHOLD = 80;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type NotifType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'mention'
  | 'message'
  | 'event_reminder'
  | 'challenge_update'
  | 'nearby_place'
  | 'system'
  | 'promo'
  | 'general';

interface RichNotif extends NotificationItem {
  notifType: NotifType;
}

interface Section {
  title: string;
  data: RichNotif[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectType(n: NotificationItem): NotifType {
  const raw = n.data?.['type'] ?? '';
  if (raw === 'post_liked' || raw === 'liked') return 'like';
  if (raw === 'post_commented' || raw === 'commented') return 'comment';
  if (raw === 'follow') return 'follow';
  if (raw === 'mention') return 'mention';
  if (raw === 'message' || raw === 'new_message' || raw === 'inquiry_replied') return 'message';
  if (raw === 'event_reminder') return 'event_reminder';
  if (raw === 'challenge_update') return 'challenge_update';
  if (raw === 'nearby_place') return 'nearby_place';
  if (raw === 'system' || raw === 'verification') return 'system';
  if (raw === 'promo') return 'promo';
  return 'general';
}

const TYPE_META: Record<NotifType, { icon: string; color: string }> = {
  like:             { icon: '❤️',  color: '#E91E63' },
  comment:          { icon: '💬',  color: '#1976D2' },
  follow:           { icon: '👤',  color: '#7B1FA2' },
  mention:          { icon: '@',   color: '#0097A7' },
  message:          { icon: '✉️',  color: '#388E3C' },
  event_reminder:   { icon: '📅',  color: '#F57C00' },
  challenge_update: { icon: '🏆',  color: '#FBC02D' },
  nearby_place:     { icon: '📍',  color: '#E64A19' },
  system:           { icon: '✅',  color: '#455A64' },
  promo:            { icon: '🎁',  color: '#C2185B' },
  general:          { icon: '🔔',  color: '#757575' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return t('timeNow');
  if (m < 60) return t('timeMinutes', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('timeHours', { n: h });
  return t('timeDays', { n: Math.floor(h / 24) });
}

function groupByTime(items: RichNotif[]): Section[] {
  const now = Date.now();
  const DAY = 86_400_000;
  const todayStart    = now - (now % DAY);          // midnight UTC approx
  const yesterdayStart = todayStart - DAY;
  const weekStart      = todayStart - 6 * DAY;

  const buckets: Record<string, RichNotif[]> = {
    today: [], yesterday: [], week: [], older: [],
  };

  for (const n of items) {
    const ts = new Date(n.createdAt).getTime();
    if (ts >= todayStart)     buckets['today']!.push(n);
    else if (ts >= yesterdayStart) buckets['yesterday']!.push(n);
    else if (ts >= weekStart)  buckets['week']!.push(n);
    else                       buckets['older']!.push(n);
  }

  const sections: Section[] = [];
  if (buckets['today']!.length)     sections.push({ title: t('groupToday'),     data: buckets['today']! });
  if (buckets['yesterday']!.length) sections.push({ title: t('groupYesterday'), data: buckets['yesterday']! });
  if (buckets['week']!.length)      sections.push({ title: t('groupThisWeek'), data: buckets['week']! });
  if (buckets['older']!.length)     sections.push({ title: t('groupOlder'),     data: buckets['older']! });
  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonBox({ width, height }: { width: number; height: number }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 4 }, { opacity }]} accessibilityElementsHidden />;
}

function SkeletonRow(): ReactElement {
  return (
    <View style={styles.row}>
      <View style={styles.iconCircle} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width={160} height={12} />
        <SkeletonBox width={220} height={11} />
        <SkeletonBox width={60} height={10} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyNotifications(): ReactElement {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIllustration} accessibilityElementsHidden>{'🔔'}</Text>
      <Text style={styles.emptyTitle}>{t('notifCenterEmpty')}</Text>
      <Text style={styles.emptySub}>{t('notifCenterEmptySub')}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single notification row
// ─────────────────────────────────────────────────────────────────────────────

interface NotifRowProps {
  item: RichNotif;
  onPress: (item: RichNotif) => void;
  onDelete: (item: RichNotif) => void;
  onMarkRead: (item: RichNotif) => void;
  onMuteSender: (item: RichNotif) => void;
}

function NotifRow({ item, onPress, onDelete, onMarkRead, onMuteSender }: NotifRowProps): ReactElement {
  const unread = item.readAt === null;
  const meta = TYPE_META[item.notifType];
  const translateX = useRef(new Animated.Value(0)).current;
  const dismissed = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_e, g) => {
        const dx = I18nManager.isRTL ? Math.min(0, g.dx) : Math.max(0, g.dx);
        translateX.setValue(dx);
      },
      onPanResponderRelease: (_e, g) => {
        const delta = I18nManager.isRTL ? -g.dx : g.dx;
        if (delta > SWIPE_THRESHOLD && !dismissed.current) {
          dismissed.current = true;
          Animated.timing(translateX, { toValue: 500, duration: 200, useNativeDriver: true }).start(() => {
            onDelete(item);
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const handleLongPress = useCallback(() => {
    const options = [
      t('ctxMarkRead'),
      t('ctxDelete'),
      t('ctxMuteSender'),
      t('ctxCancel'),
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 1, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) onMarkRead(item);
          if (idx === 1) onDelete(item);
          if (idx === 2) onMuteSender(item);
        },
      );
    } else {
      Alert.alert(t('ctxTitle'), undefined, [
        { text: t('ctxMarkRead'),   onPress: () => onMarkRead(item) },
        { text: t('ctxDelete'),     onPress: () => onDelete(item), style: 'destructive' },
        { text: t('ctxMuteSender'), onPress: () => onMuteSender(item) },
        { text: t('ctxCancel'),     style: 'cancel' },
      ]);
    }
  }, [item, onMarkRead, onDelete, onMuteSender]);

  return (
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
      <Pressable
        style={[styles.row, unread && styles.rowUnread]}
        onPress={() => onPress(item)}
        onLongPress={handleLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
        accessibilityState={{ selected: unread }}
        delayLongPress={400}
      >
        {/* icon circle */}
        <View style={[styles.iconCircle, { backgroundColor: `${meta.color}22` }]}>
          <Text style={styles.iconText} accessibilityElementsHidden>{meta.icon}</Text>
        </View>

        <View style={styles.rowBody}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rowSub} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.rowTime}>{formatRelative(item.createdAt)}</Text>
        </View>

        {unread ? <View style={[styles.unreadDot, { backgroundColor: meta.color }]} accessibilityElementsHidden /> : null}
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationCenterScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();

  const [items, setItems] = useState<RichNotif[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const enrich = (ns: NotificationItem[]): RichNotif[] =>
    ns.map((n) => ({ ...n, notifType: detectType(n) }));

  const load = useCallback(async (silent = false) => {
    if (!session) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await api.notifications.listNotifications({ query: { unreadOnly: false } });
      if (res.status === 200) {
        setItems(enrich(res.body.items));
        setNextCursor(res.body.nextCursor ?? null);
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

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.notifications.listNotifications({ query: { unreadOnly: false, cursor: nextCursor } });
      if (res.status === 200) {
        setItems((prev) => [...prev, ...enrich(res.body.items)]);
        setNextCursor(res.body.nextCursor ?? null);
      }
    } catch { /* best-effort */ } finally {
      setLoadingMore(false);
    }
  }, [api, nextCursor, loadingMore]);

  useEffect(() => { void load(); }, [load]);

  // ── Actions ──

  const handlePress = useCallback(async (item: RichNotif) => {
    if (item.readAt === null) {
      try {
        await api.notifications.markRead({ params: { id: item.id }, body: {} });
        setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
      } catch { /* best-effort */ }
    }
    const d = item.data ?? {};
    if ((item.notifType === 'like' || item.notifType === 'comment') && d['postId']) {
      router.push(href('discoverPost', { postId: d['postId'] }));
    } else if (item.notifType === 'message' && d['requestId']) {
      router.push(href('messageThread', { requestId: d['requestId'] }));
    } else if (item.notifType === 'nearby_place' && d['placeId']) {
      router.push(href('place', { placeId: d['placeId'] }));
    }
  }, [api, router]);

  const handleDelete = useCallback(async (item: RichNotif) => {
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    try { await api.notifications.dismissNotification({ params: { id: item.id } }); } catch { /* best-effort */ }
  }, [api]);

  const handleMarkRead = useCallback(async (item: RichNotif) => {
    if (item.readAt !== null) return;
    try {
      await api.notifications.markRead({ params: { id: item.id }, body: {} });
      setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
    } catch { /* best-effort */ }
  }, [api]);

  const handleMuteSender = useCallback((_item: RichNotif) => {
    // Placeholder — muting requires a sender concept; show a toast for now
    Alert.alert(t('ctxMuteConfirmTitle'), t('ctxMuteConfirmMsg'));
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    const unread = items.filter((n) => n.readAt === null);
    await Promise.allSettled(unread.map((n) => api.notifications.markRead({ params: { id: n.id }, body: {} })));
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }, [api, items]);

  // ── Derived data ──

  const sections = useMemo(() => groupByTime(items), [items]);
  const unreadCount = items.filter((n) => n.readAt === null).length;

  // ── Render ──

  if (!session) {
    return (
      <View style={styles.screen}>
        <ScreenHeader unreadCount={0} onMarkAll={() => {}} />
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIllustration} accessibilityElementsHidden>{'🔔'}</Text>
          <Text style={styles.emptyTitle}>{t('loginPrompt')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader unreadCount={unreadCount} onMarkAll={() => { void handleMarkAllRead(); }} />

      {loading ? (
        <View style={styles.flex}>
          {[1, 2, 3, 4, 5].map((k) => <SkeletonRow key={k} />)}
        </View>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { void load(); }} accessibilityRole="button">
            <Text style={styles.retryText}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <EmptyNotifications />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotifRow
              item={item}
              onPress={handlePress}
              onDelete={handleDelete}
              onMarkRead={handleMarkRead}
              onMuteSender={handleMuteSender}
            />
          )}
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); setNextCursor(null); void load(true); }}
              colors={[PRIMARY]}
              tintColor={PRIMARY}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          stickySectionHeadersEnabled={false}
          onEndReached={() => { void loadMore(); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={PRIMARY} />
              </View>
            ) : nextCursor ? (
              <Pressable style={styles.footer} onPress={() => { void loadMore(); }} accessibilityRole="button">
                <Text style={styles.loadMoreText}>{t('loadMore')}</Text>
              </Pressable>
            ) : null
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header sub-component
// ─────────────────────────────────────────────────────────────────────────────

function ScreenHeader({ unreadCount, onMarkAll }: { unreadCount: number; onMarkAll: () => void }): ReactElement {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{t('notifCenterTitle')}</Text>
      {unreadCount > 0 && (
        <Pressable onPress={onMarkAll} accessibilityRole="button" accessibilityLabel={t('markAllRead')}>
          <Text style={styles.markAllText}>{t('markAllRead')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: '#F5F5F5' },
  flex:            { flex: 1 },
  header:          { backgroundColor: PRIMARY, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:     { color: '#FFF', fontSize: 18, fontWeight: '600' },
  markAllText:     { color: '#B3E5FC', fontSize: 13 },
  sectionHeader:   { backgroundColor: '#EEEEEE', paddingHorizontal: 16, paddingVertical: 6 },
  sectionTitle:    { fontSize: 12, fontWeight: '600', color: '#757575', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:             { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', gap: 12 },
  rowUnread:       { backgroundColor: UNREAD_BG },
  iconCircle:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3E3E3', flexShrink: 0 },
  iconText:        { fontSize: 18, lineHeight: 22 },
  rowBody:         { flex: 1 },
  rowTitle:        { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 2 },
  rowTitleUnread:  { fontWeight: '700', color: '#111' },
  rowSub:          { fontSize: 13, color: '#666', lineHeight: 18 },
  rowTime:         { fontSize: 11, color: '#999', marginTop: 4 },
  unreadDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 10, flexShrink: 0 },
  separator:       { height: 1, backgroundColor: '#F0F0F0' },
  listContent:     { paddingBottom: 24 },
  footer:          { alignItems: 'center', padding: 14 },
  loadMoreText:    { fontSize: 14, color: PRIMARY, fontWeight: '600' },
  emptyWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIllustration: { fontSize: 64, marginBottom: 16 },
  emptyTitle:      { fontSize: 16, fontWeight: '600', color: '#555', textAlign: 'center', marginBottom: 8 },
  emptySub:        { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 20 },
  errorText:       { fontSize: 15, color: DANGER, textAlign: 'center', marginBottom: 16 },
  retryBtn:        { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:       { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
