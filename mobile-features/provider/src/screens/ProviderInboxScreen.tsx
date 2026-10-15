import { messagingTestIDs, type Inquiry } from '@iraq-maps/contracts';
import { EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, FlatList, I18nManager, Pressable, RefreshControl, StyleSheet, Text as RNText, View } from 'react-native';

I18nManager.forceRTL(true);
import { useMessagingApi } from '../messaging-api';
import { t } from '../strings';

// ─── Skeleton loader ─────────────────────────────────────────────────────────

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

function SkeletonInboxRow(): ReactElement {
  return (
    <View testID="skeleton-inbox-row" style={skeletonStyles.row}>
      <View style={skeletonStyles.avatar} />
      <View style={skeletonStyles.content}>
        <SkeletonBox width={200} height={13} />
        <SkeletonBox width={120} height={11} />
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Provider inbox: paginated list of inquiries with unread badge and empty state. */
export function ProviderInboxScreen(): ReactElement {
  const api = useMessagingApi();
  const router = useRouter();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
          <EmptyState title={t('inbox.title')} body={t('inbox.noMessages')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="title">{t('inbox.title')}</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge} accessibilityLabel={`${unreadCount} ${t('inbox.unread')}`}>
            <RNText style={styles.unreadText}>{unreadCount}</RNText>
          </View>
        )}
      </View>
      <FlatList
        testID="provider-inbox-list"
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const isUnread = !readIds.has(item.id);
          return (
            <Pressable
              testID={messagingTestIDs.inboxItem(item.id)}
              style={[styles.row, isUnread && styles.rowUnread]}
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
                <RNText style={styles.muted}>{formatDate(item.createdAt)}</RNText>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
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
});
