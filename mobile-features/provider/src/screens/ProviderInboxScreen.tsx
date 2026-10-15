import { messagingTestIDs, type Inquiry } from '@iraq-maps/contracts';
import { EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { FlatList, I18nManager, Pressable, RefreshControl, StyleSheet, Text as RNText, View } from 'react-native';

I18nManager.forceRTL(true);
import { useMessagingApi } from '../messaging-api';
import { t } from '../strings';
import { SkeletonBlock } from '../skeleton';

const PRIMARY = '#1976D2';

// ─── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonInboxRow(): ReactElement {
  return (
    <View testID="skeleton-inbox-row" style={skeletonStyles.row}>
      <View style={skeletonStyles.avatar} />
      <View style={skeletonStyles.content}>
        <SkeletonBlock width={200} height={13} />
        <SkeletonBlock width={120} height={11} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0E0E0' },
  content: { flex: 1, gap: 6 },
});

// ─────────────────────────────────────────────────────────────────────────────

function formatInitials(userId: string): string {
  return userId.slice(0, 2).toUpperCase();
}

/** Returns a relative time string for the given ISO timestamp. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t('inbox.timeJustNow');
  if (mins < 60) return t('inbox.timeMinsAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('inbox.timeHoursAgo', { n: hours });
  return t('inbox.timeDaysAgo', { n: Math.floor(hours / 24) });
}

/** Returns urgency color and label for a message that has not been replied to. */
function getUrgency(iso: string, replied: boolean): { color: string; label: string } | null {
  if (replied) return null;
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours >= 24) return { color: '#DC2626', label: t('inbox.responseOverdue') };
  if (hours >= 1) return { color: '#F97316', label: t('inbox.responseUrgent') };
  return null;
}

type InboxFilter = 'all' | 'unread' | 'replied';
const INBOX_FILTERS: InboxFilter[] = ['all', 'unread', 'replied'];

/** Provider inbox: paginated list of inquiries with unread badge and empty state. */
export function ProviderInboxScreen(): ReactElement {
  const api = useMessagingApi();
  const router = useRouter();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  // Client-side read tracking: new items arriving before the screen was opened
  // are considered unread. We treat items already present on first load as read;
  // only items that arrive on subsequent refreshes are marked unread.
  const initialLoaded = useRef(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await api.listProviderInquiries({ query: {} });
      if (res.status === 200) {
        const incoming = res.body.items;
        setItems(incoming);
        setNextCursor(res.body.nextCursor);

        if (!initialLoaded.current) {
          // Mark all items on first load as read
          setReadIds(new Set(incoming.map((i) => i.id)));
          initialLoaded.current = true;
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.listProviderInquiries({ query: { cursor: nextCursor } });
      if (res.status === 200) {
        setItems((prev) => [...prev, ...res.body.items]);
        setNextCursor(res.body.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [api, nextCursor, loadingMore]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const unreadCount = items.filter((i) => !readIds.has(i.id)).length;

  const filteredItems = items.filter((i) => {
    if (activeFilter === 'unread') return !readIds.has(i.id);
    if (activeFilter === 'replied') return i.targets.some((tgt) => tgt.status === 'replied');
    return true;
  });

  const markAllRead = useCallback(() => {
    setReadIds(new Set(items.map((i) => i.id)));
  }, [items]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text variant="title">{t('inbox.title')}</Text>
        </View>
        {[1, 2, 3].map((k) => <SkeletonInboxRow key={k} />)}
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <View style={styles.emptyContainer}>
          <RNText style={styles.emptyIcon}>📭</RNText>
          <EmptyState title={t('inbox.noMessages')} body={t('inbox.noMessagesBody')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerStart}>
          <Text variant="title">{t('inbox.title')}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge} accessibilityLabel={`${unreadCount} ${t('inbox.unread')}`}>
              <RNText style={styles.unreadText}>{unreadCount}</RNText>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable
            testID="provider.inbox.markAllRead"
            onPress={markAllRead}
            accessibilityRole="button"
            accessibilityLabel={t('inbox.markAllRead')}
            style={styles.markAllBtn}
          >
            <RNText style={styles.markAllText}>{t('inbox.markAllRead')}</RNText>
          </Pressable>
        )}
      </View>
      {/* Status filter tabs */}
      <View style={styles.filterRow}>
        {INBOX_FILTERS.map((key) => (
          <Pressable
            key={key}
            style={[styles.filterTab, activeFilter === key && styles.filterTabActive]}
            onPress={() => setActiveFilter(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeFilter === key }}
            testID={`inbox-filter-${key}`}
          >
            <RNText style={[styles.filterTabText, activeFilter === key && styles.filterTabTextActive]}>
              {t(`inbox.filter${key.charAt(0).toUpperCase()}${key.slice(1)}` as Parameters<typeof t>[0])}
            </RNText>
          </Pressable>
        ))}
      </View>
      <FlatList
        testID="provider-inbox-list"
        data={filteredItems}
        ListEmptyComponent={<RNText style={styles.emptyFilter}>{t('inbox.emptyFilter')}</RNText>}
        keyExtractor={(item) => item.id}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={nextCursor ? (
          <Pressable
            style={styles.loadMoreBtn}
            onPress={() => { void loadMore(); }}
            disabled={loadingMore}
            accessibilityRole="button"
          >
            <RNText style={styles.loadMoreText}>
              {loadingMore ? '…' : t('inbox.loadMore')}
            </RNText>
          </Pressable>
        ) : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const isUnread = !readIds.has(item.id);
          const replied = item.targets.some((tgt) => tgt.status === 'replied');
          const urgency = getUrgency(item.createdAt, replied);
          return (
            <Pressable
              testID={messagingTestIDs.inboxItem(item.id)}
              style={[styles.row, isUnread && styles.rowUnread]}
              accessibilityRole="button"
              accessibilityLabel={t('inbox.itemA11y', { userId: item.userId })}
              accessibilityState={{ selected: isUnread }}
              onPress={() => {
                markRead(item.id);
                router.push({ pathname: '/provider/inbox/[id]', params: { id: item.id } } as never);
              }}
            >
              <View style={[styles.avatar, isUnread && styles.avatarUnread]}>
                <RNText style={isUnread ? styles.avatarTextUnread : undefined}>{formatInitials(item.userId)}</RNText>
              </View>
              <View style={styles.content}>
                <RNText numberOfLines={2} style={isUnread ? styles.boldText : undefined}>{item.text}</RNText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RNText style={styles.muted}>{timeAgo(item.createdAt)}</RNText>
                  {urgency ? (
                    <View style={[styles.urgencyChip, { backgroundColor: urgency.color }]}>
                      <RNText style={styles.urgencyText}>{urgency.label}</RNText>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.badge}>
                {isUnread && <View style={styles.dot} />}
                <RNText style={styles.muted}>{item.targets[0]?.status ?? ''}</RNText>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  headerStart: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  markAllBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EFF6FF' },
  markAllText: { fontSize: 12, color: '#1D4ED8', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  rowUnread: { backgroundColor: '#EFF6FF' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  avatarUnread: { backgroundColor: '#BFDBFE' },
  avatarTextUnread: { fontWeight: '700', color: '#1D4ED8' },
  content: { flex: 1, gap: 4 },
  boldText: { fontWeight: '700' },
  badge: { alignItems: 'flex-end', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6', alignSelf: 'flex-end' },
  muted: { color: '#6B7280' },
  urgencyChip: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  urgencyText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F0F0' },
  filterTabActive: { backgroundColor: PRIMARY },
  filterTabText: { fontSize: 13, color: '#555', fontWeight: '500' },
  filterTabTextActive: { color: '#FFF' },
  emptyFilter: { textAlign: 'center', color: '#9E9E9E', fontSize: 14, paddingTop: 32 },
});
