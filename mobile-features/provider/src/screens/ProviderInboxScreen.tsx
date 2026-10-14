import { messagingTestIDs, type Inquiry } from '@iraq-maps/contracts';
import { EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { FlatList, I18nManager, Pressable, RefreshControl, StyleSheet, Text as RNText, View } from 'react-native';

I18nManager.forceRTL(true);
import { useMessagingApi } from '../messaging-api';
import { t } from '../strings';

function formatInitials(userId: string): string {
  return userId.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Provider inbox: paginated list of inquiries. Tap to open detail. */
export function ProviderInboxScreen(): ReactElement {
  const api = useMessagingApi();
  const router = useRouter();
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listProviderInquiries({ query: {} });
      if (res.status === 200) setItems(res.body.items);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); void load(); };

  if (loading) return <Screen>{null}</Screen>;

  if (items.length === 0) {
    return (
      <Screen>
        <EmptyState title={t('inbox.title')} body={t('inbox.noMessages')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">{t('inbox.title')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <Pressable
            testID={messagingTestIDs.inboxItem(item.id)}
            style={styles.row}
            onPress={() => router.push({ pathname: '/provider/inbox/[id]', params: { id: item.id } } as never)}
          >
            <View style={styles.avatar}>
              <RNText>{formatInitials(item.userId)}</RNText>
            </View>
            <View style={styles.content}>
              <RNText numberOfLines={2}>{item.text}</RNText>
              <RNText style={styles.muted}>{formatDate(item.createdAt)}</RNText>
            </View>
            <View style={styles.badge}>
              <RNText style={styles.muted}>{item.targets[0]?.status ?? ''}</RNText>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, gap: 4 },
  badge: { alignItems: 'flex-end' },
  muted: { color: '#6B7280' },
});
