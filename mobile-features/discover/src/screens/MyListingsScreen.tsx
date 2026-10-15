import type { ListingType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMarketplaceClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

export function MyListingsScreen() {
  const client = useMarketplaceClient();
  const router = useRouter();
  const session = useSession();
  const [items, setItems] = useState<ListingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (!session?.userId) return;
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const res = await client.listListings({ query: { limit: 20, sellerId: session.userId } });
      if (res.status === 200) setItems(res.body.items);
    } catch { /* noop */ }
    setLoading(false);
    setRefreshing(false);
  }, [client, session?.userId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.bg }]}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>{t('marketplace.myListings')}</Text>
        <Pressable
          style={[styles.createBtn, { backgroundColor: COLORS.accent }]}
          onPress={() => router.push('/discover/marketplace/create')}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, { backgroundColor: COLORS.surface }]}
            onPress={() => router.push(`/discover/marketplace/${item.id}`)}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: COLORS.text }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.rowPrice, { color: COLORS.accent }]}>
                {t('marketplace.price', { price: item.price, currency: item.currency })}
              </Text>
            </View>
            <Text style={[styles.rowStatus, { color: item.status === 'sold' ? '#E53E3E' : COLORS.secondary }]}>
              {t(`marketplace.status.${item.status}` as never)}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={
          <View style={sharedStyles.center}>
            <Text style={{ color: COLORS.secondary }}>{t('marketplace.empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  createBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: { padding: 14, borderRadius: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  rowPrice: { fontSize: 13, fontWeight: '700' },
  rowStatus: { fontSize: 12, fontWeight: '600' },
});
