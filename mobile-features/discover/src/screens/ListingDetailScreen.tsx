import type { ListingType } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMarketplaceClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

export function ListingDetailScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const client = useMarketplaceClient();
  const session = useSession();
  const [listing, setListing] = useState<ListingType | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageIdx, setImageIdx] = useState(0);
  const [markingLoading, setMarkingLoading] = useState(false);

  const load = useCallback(async () => {
    if (!listingId) return;
    setLoading(true);
    try {
      const res = await client.getListing({ params: { listingId: listingId as never } });
      if (res.status === 200) setListing(res.body);
    } catch { /* noop */ }
    setLoading(false);
  }, [client, listingId]);

  useEffect(() => { void load(); }, [load]);

  const handleMarkSold = async () => {
    if (!listing) return;
    setMarkingLoading(true);
    try {
      const res = await client.updateListing({
        params: { listingId: listingId as never },
        body: { status: 'sold' },
      });
      if (res.status === 200) setListing(res.body);
      else Alert.alert(t('marketplace.updateError'));
    } catch {
      Alert.alert(t('marketplace.updateError'));
    }
    setMarkingLoading(false);
  };

  if (loading) return (
    <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.bg }]}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );

  if (!listing) return null;

  const isOwner = session?.userId === listing.sellerId;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {listing.images.length > 0 ? (
        <>
          <Image
            source={{ uri: listing.images[imageIdx] ?? listing.images[0] }}
            style={styles.hero}
            accessibilityIgnoresInvertColors
          />
          {listing.images.length > 1 && (
            <View style={styles.imageDots}>
              {listing.images.map((_, i) => (
                <Pressable key={i} onPress={() => setImageIdx(i)}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: i === imageIdx ? COLORS.accent : COLORS.border },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={[styles.hero, { backgroundColor: '#E0E0E0' }]} />
      )}

      <View style={styles.content}>
        <Text style={[styles.title, { color: COLORS.text }]}>{listing.title}</Text>
        <Text style={[styles.price, { color: COLORS.accent }]}>
          {t('marketplace.price', { price: listing.price, currency: listing.currency })}
        </Text>
        <Text style={[styles.badge, { backgroundColor: COLORS.surface, color: COLORS.secondary }]}>
          {t(`marketplace.categories.${listing.category}` as never)}
        </Text>
        <Text style={[
          styles.statusBadge,
          { color: listing.status === 'sold' ? '#E53E3E' : COLORS.secondary },
        ]}>
          {t(`marketplace.status.${listing.status}` as never)}
        </Text>

        <Text style={[styles.description, { color: COLORS.text }]}>{listing.description}</Text>

        <View style={[styles.sellerBox, { backgroundColor: COLORS.surface }]}>
          <Text style={[styles.sellerName, { color: COLORS.text }]}>
            {t('marketplace.seller', { name: listing.sellerName })}
          </Text>
        </View>

        {!isOwner && listing.status === 'active' && (
          <Pressable
            style={[styles.contactBtn, { backgroundColor: COLORS.accent }]}
            onPress={() => {/* navigate to messaging */}}
            accessibilityRole="button"
          >
            <Text style={styles.contactBtnText}>{t('marketplace.contact')}</Text>
          </Pressable>
        )}

        {isOwner && listing.status === 'active' && (
          <Pressable
            style={[styles.soldBtn, { backgroundColor: markingLoading ? '#aaa' : '#E53E3E' }]}
            onPress={handleMarkSold}
            disabled={markingLoading}
            accessibilityRole="button"
          >
            {markingLoading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.soldBtnText}>{t('marketplace.markSold')}</Text>
            )}
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 260 },
  imageDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  price: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 12, overflow: 'hidden', marginBottom: 4 },
  statusBadge: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  description: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
  sellerBox: { padding: 12, borderRadius: 10, marginBottom: 16 },
  sellerName: { fontSize: 14, fontWeight: '600' },
  contactBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  contactBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  soldBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  soldBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
