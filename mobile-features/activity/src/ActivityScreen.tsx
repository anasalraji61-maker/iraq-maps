import { type NotificationItem } from '@iraq-maps/contracts';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { useEffect, useState, useCallback, type ReactElement } from 'react';
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

I18nManager.forceRTL(true);

type NotifItem = NotificationItem & { _type?: string };

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

function notifIcon(data?: Record<string, string>): string {
  const type = data?.['type'];
  if (type === 'liked') return '❤️';
  if (type === 'commented') return '💬';
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
      accessibilityLabel={item.title + '. ' + item.body}
      accessibilityState={{ selected: unread }}
    >
      <Text style={styles.icon}>{notifIcon(item.data)}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

export function ActivityScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const [items, setItems] = useState<NotifItem[]>([]);
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
        setError('تعذر تحميل الإشعارات');
      }
    } catch {
      setError('تعذر تحميل الإشعارات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, session]);

  useEffect(() => { void load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const handlePress = useCallback(async (item: NotifItem) => {
    if (item.readAt !== null) return;
    try {
      await api.notifications.markRead({
        params: { id: item.id },
        body: {},
      });
      setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n));
    } catch {
      // best-effort
    }
  }, [api]);

  const markAllRead = useCallback(async () => {
    const unread = items.filter(n => n.readAt === null);
    await Promise.allSettled(
      unread.map(n => api.notifications.markRead({ params: { id: n.id }, body: {} })),
    );
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }, [api, items]);

  const unreadCount = items.filter(n => n.readAt === null).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={() => { void markAllRead(); }} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>تعليم الكل مقروء</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1976D2" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { void load(); }} style={styles.retryBtn}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      ) : !session ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>سجّل دخولك لرؤية إشعاراتك</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>لا توجد إشعارات بعد</Text>
          <Text style={styles.emptySubtext}>ستظهر هنا إشعارات الإعجابات والتعليقات والرسائل</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotifRow item={item} onPress={handlePress} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#1976D2']} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  markAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  markAllText: { color: '#BBD6FB', fontSize: 13 },
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
  icon: { fontSize: 24, lineHeight: 28 },
  rowBody: { flex: 1 },
  title: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 2 },
  titleUnread: { fontWeight: '700', color: '#1976D2' },
  body: { fontSize: 13, color: '#666', lineHeight: 18 },
  time: { fontSize: 11, color: '#999', marginTop: 4 },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#1976D2',
    marginTop: 8, flexShrink: 0,
  },
  separator: { height: 1, backgroundColor: '#F0F0F0' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#555', fontWeight: '500', textAlign: 'center', marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
  errorText: { fontSize: 15, color: '#C62828', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#1976D2', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
