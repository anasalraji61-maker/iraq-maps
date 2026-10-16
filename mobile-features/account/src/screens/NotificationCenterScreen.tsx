/**
 * NotificationCenterScreen
 *
 * Full notification inbox with:
 *   – Smart Alerts section at top (contextual, ephemeral)
 *   – Type filter tabs: All / Messages / Social / Places / Promotions
 *   – Notifications grouped by date bucket (Today / Yesterday / This Week / Older)
 *   – Read / unread visual state with unread count badge
 *   – Swipe-to-delete with confirmation
 *   – Mark-all-read action
 *   – Clear-all with GDPR disclosure
 *   – Empty states per filter
 *   – Tap navigates to the relevant screen
 *
 * All UI text via t(). Layout uses start/end (RTL-safe). Baghdad UTC+3 for
 * quiet-hours note.
 *
 * Route: account/notification-center
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const td = t as (k: any, p?: Record<string, string | number>) => string;

I18nManager.forceRTL(true);

// ─── Icons (unicode; no image assets) ────────────────────────────────────────

const ICON_BACK        = '←';
const ICON_BELL        = '🔔';
const ICON_MESSAGE     = '💬';
const ICON_REVIEW      = '⭐';
const ICON_LIKE        = '❤️';
const ICON_FOLLOW      = '👤';
const ICON_MENTION     = '@';
const ICON_CHALLENGE   = '🏆';
const ICON_PROMO       = '🏷️';
const ICON_INCIDENT    = '⚠️';
const ICON_PLACE       = '📍';
const ICON_SYSTEM      = '🔧';
const ICON_CHECK_ALL   = '✓✓';
const ICON_TRASH       = '🗑';
const ICON_SMART       = '✨';
const ICON_CHEVRON     = '›';

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType =
  | 'message'
  | 'review'
  | 'like'
  | 'follow'
  | 'mention'
  | 'challenge'
  | 'promotion'
  | 'incident'
  | 'place_update'
  | 'system'
  | 'general';

type FilterTab = 'all' | 'messages' | 'social' | 'places' | 'promotions';

interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  data?: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  relativeTime: string;
}

interface SmartAlert {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  generatedAt: string;
}

type DateBucket = 'today' | 'yesterday' | 'thisWeek' | 'older';

interface GroupedSection {
  bucket: DateBucket;
  items: NotifItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateBucket(isoDate: string): DateBucket {
  const now = new Date();
  const d = new Date(isoDate);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const weekStart = new Date(todayStart.getTime() - 6 * 86_400_000);

  if (d >= todayStart) return 'today';
  if (d >= yesterdayStart) return 'yesterday';
  if (d >= weekStart) return 'thisWeek';
  return 'older';
}

function bucketLabel(bucket: DateBucket): string {
  switch (bucket) {
    case 'today':     return td('notifCenter.sectionToday');
    case 'yesterday': return td('notifCenter.sectionYesterday');
    case 'thisWeek':  return td('notifCenter.sectionThisWeek');
    case 'older':     return td('notifCenter.sectionOlder');
  }
}

function typeIcon(type: NotifType): string {
  switch (type) {
    case 'message':      return ICON_MESSAGE;
    case 'review':       return ICON_REVIEW;
    case 'like':         return ICON_LIKE;
    case 'follow':       return ICON_FOLLOW;
    case 'mention':      return ICON_MENTION;
    case 'challenge':    return ICON_CHALLENGE;
    case 'promotion':    return ICON_PROMO;
    case 'incident':     return ICON_INCIDENT;
    case 'place_update': return ICON_PLACE;
    case 'system':
    default:             return ICON_SYSTEM;
  }
}

function typeColor(type: NotifType): string {
  switch (type) {
    case 'message':      return '#2563EB';
    case 'review':       return '#D97706';
    case 'like':         return '#DC2626';
    case 'follow':       return '#7C3AED';
    case 'mention':      return '#0891B2';
    case 'challenge':    return '#B45309';
    case 'promotion':    return '#16A34A';
    case 'incident':     return '#EA580C';
    case 'place_update': return '#0F766E';
    case 'system':
    default:             return '#6B7280';
  }
}

/** Map a notification's data payload to a deep-link path. */
function notifRoute(item: NotifItem): string | null {
  const d = item.data ?? {};
  if (item.type === 'message' && d['requestId']) return `/(tabs)/messages/${d['requestId']}`;
  if (item.type === 'review' && d['placeId']) return `/(tabs)/map/place/${d['placeId']}`;
  if ((item.type === 'like' || item.type === 'mention') && d['postId']) return `/(tabs)/discover/post/${d['postId']}`;
  if (item.type === 'follow' && d['userId']) return `/(tabs)/discover/profile/${d['userId']}`;
  if (item.type === 'challenge' && d['challengeId']) return `/(tabs)/activity`;
  if (item.type === 'promotion' && d['placeId']) return `/(tabs)/map/place/${d['placeId']}`;
  if (item.type === 'place_update' && d['placeId']) return `/(tabs)/map/place/${d['placeId']}`;
  if (item.type === 'incident') return `/(tabs)/map`;
  return null;
}

/** Filter tab → applicable notification types. */
function filterTypes(tab: FilterTab): NotifType[] | null {
  switch (tab) {
    case 'messages':   return ['message'];
    case 'social':     return ['like', 'follow', 'mention', 'review', 'challenge'];
    case 'places':     return ['place_update', 'incident'];
    case 'promotions': return ['promotion'];
    case 'all':
    default:           return null; // null = no filter
  }
}

// ─── Mock data (replaced by API call in production) ──────────────────────────

function mockNotifs(): NotifItem[] {
  const now = Date.now();
  return [
    { id: 'n1', type: 'message', title: 'رسالة جديدة', body: 'ردّ عليك مطعم المنصور', data: { requestId: 'r1' }, readAt: null, createdAt: new Date(now - 5 * 60_000).toISOString(), relativeTime: 'منذ 5 دقائق' },
    { id: 'n2', type: 'like', title: 'إعجاب جديد', body: 'أعجب أحمد بمنشورك', data: { postId: 'p1' }, readAt: null, createdAt: new Date(now - 30 * 60_000).toISOString(), relativeTime: 'منذ 30 دقيقة' },
    { id: 'n3', type: 'follow', title: 'متابع جديد', body: 'بدأ سعد بمتابعتك', data: { userId: 'u1' }, readAt: new Date(now - 2 * 3_600_000).toISOString(), createdAt: new Date(now - 2 * 3_600_000).toISOString(), relativeTime: 'منذ ساعتين' },
    { id: 'n4', type: 'promotion', title: 'عرض خاص', body: 'خصم 30% في مقهى الرشيد اليوم فقط', data: { placeId: 'pl1' }, readAt: null, createdAt: new Date(now - 5 * 3_600_000).toISOString(), relativeTime: 'منذ 5 ساعات' },
    { id: 'n5', type: 'review', title: 'تقييم جديد', body: 'ترك علي تقييماً جديداً على نشاطك', data: { placeId: 'pl2' }, readAt: null, createdAt: new Date(now - 86_400_000).toISOString(), relativeTime: 'أمس' },
    { id: 'n6', type: 'incident', title: 'ازدحام مروري', body: 'تأخير في شارع الرشيد باتجاه الكرخ', data: {}, readAt: null, createdAt: new Date(now - 86_400_000 - 3_600_000).toISOString(), relativeTime: 'أمس' },
    { id: 'n7', type: 'place_update', title: 'تحديث مكان', body: 'غيّر مطعم المعقل مواعيده الرسمية', data: { placeId: 'pl3' }, readAt: new Date(now - 2 * 86_400_000).toISOString(), createdAt: new Date(now - 2 * 86_400_000).toISOString(), relativeTime: 'منذ يومين' },
    { id: 'n8', type: 'challenge', title: 'تحدي جديد', body: 'اكشف عن 5 مطاعم جديدة هذا الشهر', data: { challengeId: 'c1' }, readAt: null, createdAt: new Date(now - 3 * 86_400_000).toISOString(), relativeTime: 'منذ 3 أيام' },
    { id: 'n9', type: 'system', title: 'تحديث التطبيق', body: 'إصدار جديد متاح. حدّث الآن للحصول على آخر المميزات.', data: {}, readAt: new Date(now - 5 * 86_400_000).toISOString(), createdAt: new Date(now - 5 * 86_400_000).toISOString(), relativeTime: 'منذ 5 أيام' },
  ];
}

function mockSmartAlerts(): SmartAlert[] {
  return [
    { id: 'sa1', type: 'favorite_promo', title: 'عرض خاص في مقهى الرشيد', body: 'خصم 20% اليوم فقط! لا تفوّته.', data: { placeId: 'pl1' }, generatedAt: new Date().toISOString() },
    { id: 'sa2', type: 'challenge_expiring', title: 'تحديتك توشك على الانتهاء!', body: 'تحدي "استكشاف بغداد" ينتهي خلال ساعتين.', data: { challengeId: 'c1' }, generatedAt: new Date().toISOString() },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SmartAlertCardProps {
  alert: SmartAlert;
  onPress: () => void;
}

function SmartAlertCard({ alert, onPress }: SmartAlertCardProps): ReactElement {
  return (
    <TouchableOpacity style={styles.smartCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.smartIcon}>{ICON_SMART}</Text>
      <View style={styles.smartContent}>
        <Text style={styles.smartTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.smartBody} numberOfLines={2}>{alert.body}</Text>
      </View>
      <Text style={styles.smartChevron}>{ICON_CHEVRON}</Text>
    </TouchableOpacity>
  );
}

interface NotifRowProps {
  item: NotifItem;
  onPress: () => void;
  onDelete: () => void;
}

function NotifRow({ item, onPress, onDelete }: NotifRowProps): ReactElement {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [deleting, setDeleting] = useState(false);

  const handleSwipe = useCallback(() => {
    // Swipe-to-delete: slide left to reveal delete button
    Animated.timing(slideAnim, {
      toValue: -80,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setDeleting(true);
  }, [slideAnim]);

  const handleCancel = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setDeleting(false);
  }, [slideAnim]);

  const isUnread = item.readAt === null;
  const color = typeColor(item.type);

  return (
    <View style={styles.rowWrapper}>
      {/* Delete reveal */}
      <View style={styles.deleteReveal}>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteBtnText}>{ICON_TRASH}</Text>
          <Text style={styles.deleteBtnLabel}>{td('notifCenter.swipeDelete')}</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[styles.row, { transform: [{ translateX: slideAnim }] }]}>
        {/* Unread dot */}
        {isUnread && <View style={[styles.unreadDot, { backgroundColor: color }]} />}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
          <Text style={styles.iconText}>{typeIcon(item.type)}</Text>
        </View>

        {/* Content */}
        <Pressable style={styles.rowContent} onPress={onPress}>
          <Text
            style={[styles.rowTitle, isUnread && styles.rowTitleUnread]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.rowTime}>{item.relativeTime}</Text>
        </Pressable>

        {/* Swipe handle */}
        <TouchableOpacity
          style={styles.swipeHandle}
          onPress={deleting ? handleCancel : handleSwipe}
          hitSlop={{ top: 10, bottom: 10, start: 10, end: 10 }}
        >
          <Text style={styles.swipeHandleText}>{deleting ? '✕' : '⋮'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function NotificationCenterScreen(): ReactElement {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [smartAlerts, setSmartAlerts] = useState<SmartAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // TODO: replace with real API call via useNotifApi hook
      await new Promise((r) => setTimeout(r, 300));
      const data = mockNotifs();
      const alerts = mockSmartAlerts();
      setNotifs(data);
      setSmartAlerts(alerts);
      setUnreadCount(data.filter((n) => !n.readAt).length);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter by tab
  const filteredNotifs = useMemo(() => {
    const types = filterTypes(activeTab);
    if (!types) return notifs;
    return notifs.filter((n) => types.includes(n.type));
  }, [notifs, activeTab]);

  // Group by date bucket
  const sections = useMemo((): GroupedSection[] => {
    const map = new Map<DateBucket, NotifItem[]>();
    for (const item of filteredNotifs) {
      const bucket = dateBucket(item.createdAt);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(item);
    }
    const order: DateBucket[] = ['today', 'yesterday', 'thisWeek', 'older'];
    return order
      .filter((b) => map.has(b))
      .map((b) => ({ bucket: b, items: map.get(b)! }));
  }, [filteredNotifs]);

  // Mark all read
  const handleMarkAllRead = useCallback(() => {
    setNotifs((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  }, []);

  // Clear all
  const handleClearAll = useCallback(() => {
    Alert.alert(
      td('notifCenter.clearConfirmTitle'),
      td('notifCenter.clearConfirmBody'),
      [
        { text: td('notifCenter.cancel'), style: 'cancel' },
        {
          text: td('notifCenter.clearConfirm'),
          style: 'destructive',
          onPress: () => {
            setNotifs([]);
            setUnreadCount(0);
          },
        },
      ],
    );
  }, []);

  // Delete single notification
  const handleDelete = useCallback((id: string) => {
    setNotifs((prev) => {
      const removed = prev.find((n) => n.id === id);
      const updated = prev.filter((n) => n.id !== id);
      if (removed && !removed.readAt) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      return updated;
    });
  }, []);

  // Tap notification → navigate + mark read
  const handleTap = useCallback((item: NotifItem) => {
    // Mark as read
    setNotifs((prev) =>
      prev.map((n) =>
        n.id === item.id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    if (!item.readAt) setUnreadCount((c) => Math.max(0, c - 1));

    // Navigate
    const route = notifRoute(item);
    if (route) router.push(route as Parameters<typeof router.push>[0]);
  }, [router]);

  // Tap smart alert
  const handleSmartAlertTap = useCallback((alert: SmartAlert) => {
    const d = alert.data;
    if (d['placeId']) router.push(`/(tabs)/map/place/${d['placeId']}` as Parameters<typeof router.push>[0]);
    else if (d['challengeId']) router.push('/(tabs)/activity');
    else router.push('/(tabs)/map');
  }, [router]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderFilterTab = (tab: FilterTab, label: string) => (
    <TouchableOpacity
      key={tab}
      style={[styles.tab, activeTab === tab && styles.tabActive]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderSection = (section: GroupedSection) => (
    <View key={section.bucket}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{bucketLabel(section.bucket)}</Text>
      </View>
      {section.items.map((item) => (
        <NotifRow
          key={item.id}
          item={item}
          onPress={() => handleTap(item)}
          onDelete={() => handleDelete(item.id)}
        />
      ))}
    </View>
  );

  // ── Empty state ───────────────────────────────────────────────────────────

  const isEmpty = sections.length === 0;

  const emptyState = (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>{ICON_BELL}</Text>
      <Text style={styles.emptyTitle}>
        {activeTab === 'all'
          ? td('notifCenter.emptyTitle')
          : td('notifCenter.emptyFilterTitle')}
      </Text>
      <Text style={styles.emptyBody}>
        {activeTab === 'all'
          ? td('notifCenter.emptyBody')
          : td('notifCenter.emptyFilterBody')}
      </Text>
    </View>
  );

  // ── Header ────────────────────────────────────────────────────────────────

  const header = (
    <>
      {/* Smart Alerts */}
      {smartAlerts.length > 0 && (
        <View style={styles.smartSection}>
          <View style={styles.smartSectionHeader}>
            <Text style={styles.smartSectionTitle}>{td('notifCenter.sectionSmartAlerts')}</Text>
          </View>
          {smartAlerts.map((a) => (
            <SmartAlertCard
              key={a.id}
              alert={a}
              onPress={() => handleSmartAlertTap(a)}
            />
          ))}
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContainer}
      >
        {renderFilterTab('all',        td('notifCenter.tabAll'))}
        {renderFilterTab('messages',   td('notifCenter.tabMessages'))}
        {renderFilterTab('social',     td('notifCenter.tabSocial'))}
        {renderFilterTab('places',     td('notifCenter.tabPlaces'))}
        {renderFilterTab('promotions', td('notifCenter.tabPromotions'))}
      </ScrollView>
    </>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
        >
          <Text style={styles.backIcon}>{ICON_BACK}</Text>
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.screenTitle}>{td('notifCenter.title')}</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleMarkAllRead}
              hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
            >
              <Text style={styles.actionBtnText}>{ICON_CHECK_ALL}</Text>
            </TouchableOpacity>
          )}
          {notifs.length > 0 && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleClearAll}
              hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
            >
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>{ICON_TRASH}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.bucket}
          renderItem={({ item }) => renderSection(item)}
          ListHeaderComponent={header}
          ListEmptyComponent={isEmpty ? emptyState : null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
          contentContainerStyle={isEmpty ? styles.listEmpty : styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COLORS = {
  bg:        '#F9FAFB',
  surface:   '#FFFFFF',
  border:    '#E5E7EB',
  text:      '#111827',
  textSub:   '#6B7280',
  accent:    '#2563EB',
  unread:    '#EFF6FF',
  tabActive: '#2563EB',
  tabInactive: '#9CA3AF',
  smart:     '#FFFBEB',
  smartBorder: '#FDE68A',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: COLORS.accent },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  badge: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
    paddingHorizontal: 5,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 6 },
  actionBtnText: { fontSize: 18, color: COLORS.accent },

  // Smart alerts
  smartSection: {
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    backgroundColor: COLORS.smart,
    borderWidth: 1,
    borderColor: COLORS.smartBorder,
    overflow: 'hidden',
  },
  smartSectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.smartBorder,
  },
  smartSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
    textAlign: 'right',
  },
  smartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.smartBorder + '80',
  },
  smartIcon: { fontSize: 20, marginEnd: 10 },
  smartContent: { flex: 1 },
  smartTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  smartBody: { fontSize: 13, color: COLORS.textSub, marginTop: 2, textAlign: 'right' },
  smartChevron: { fontSize: 18, color: COLORS.textSub, marginStart: 6 },

  // Filter tabs
  tabsScroll: { backgroundColor: COLORS.surface, marginTop: 12 },
  tabsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  tabText: { fontSize: 13, color: COLORS.tabInactive, fontWeight: '500' },
  tabTextActive: { color: '#FFF', fontWeight: '600' },

  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSub,
    textTransform: 'uppercase',
    textAlign: 'right',
  },

  // Notification row
  rowWrapper: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    marginHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  deleteReveal: {
    position: 'absolute',
    insetInlineEnd: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: { alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' },
  deleteBtnText: { fontSize: 20, color: '#FFF' },
  deleteBtnLabel: { fontSize: 11, color: '#FFF', marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginEnd: 4,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 20 },
  rowContent: { flex: 1 },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    textAlign: 'right',
  },
  rowTitleUnread: { fontWeight: '700' },
  rowBody: {
    fontSize: 13,
    color: COLORS.textSub,
    marginTop: 2,
    textAlign: 'right',
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginTop: 4,
    textAlign: 'right',
  },
  swipeHandle: { padding: 8 },
  swipeHandleText: { fontSize: 18, color: COLORS.textSub },

  // Loading / empty
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 40 },
  listEmpty: { flex: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 22 },
});
