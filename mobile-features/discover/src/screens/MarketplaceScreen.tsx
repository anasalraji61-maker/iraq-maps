import type { ListingType } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMarketplaceClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

I18nManager.forceRTL(true);

function ListingCard({ listing, onPress }: { listing: ListingType; onPress: () => void }) {
  return (
    <Pressable style={[styles.card, { backgroundColor: COLORS.surface }]} onPress={onPress} accessibilityRole="button">
      {listing.images[0] ? (
        <Image source={{ uri: listing.images[0] }} style={styles.thumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.thumb, { backgroundColor: '#E0E0E0' }]} />
      )}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: COLORS.text }]} numberOfLines={2}>{listing.title}</Text>
        <Text style={[styles.price, { color: COLORS.accent }]}>
          {t('marketplace.price', { price: listing.price, currency: listing.currency })}
        </Text>
        <Text style={[styles.category, { color: COLORS.secondary }]}>
          {t(`marketplace.categories.${listing.category}` as never)}
        </Text>
        <Text style={[styles.status, { color: listing.status === 'sold' ? '#E53E3E' : COLORS.secondary }]}>
          {t(`marketplace.status.${listing.status}` as never)}
        </Text>
      </View>
    </Pressable>
  );
}

export function MarketplaceScreen() {
  const client = useMarketplaceClient();
  const router = useRouter();
  const [items, setItems] = useState<ListingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      const res = await client.listListings({ query: { limit: 20 } });
      if (res.status === 200) setItems(res.body.items);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.bg }]}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>{t('marketplace.title')}</Text>
        <Pressable
          style={[styles.createBtn, { backgroundColor: COLORS.accent }]}
          onPress={() => router.push('/discover/marketplace/create')}
          accessibilityRole="button"
          accessibilityLabel={t('marketplace.create')}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={sharedStyles.center}>
          <Text style={{ color: COLORS.secondary }}>{t('marketplace.loadError')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ListingCard listing={item} onPress={() => router.push(`/discover/marketplace/${item.id}`)} />
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 80, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={sharedStyles.center}>
              <Text style={{ color: COLORS.secondary }}>{t('marketplace.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  createBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 10, overflow: 'hidden', elevation: 2, marginBottom: 10 },
  thumb: { width: '100%', height: 120 },
  cardBody: { padding: 8 },
  cardTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  price: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  category: { fontSize: 11, marginBottom: 2 },
  status: { fontSize: 11 },
});
