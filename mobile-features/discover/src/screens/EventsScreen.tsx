import { type DiscoverEventType } from '@iraq-maps/contracts';
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
import { useEventsClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

I18nManager.forceRTL(true);

function EventCard({
  event,
  onPress,
}: {
  event: DiscoverEventType;
  onPress: () => void;
}) {
  const start = new Date(event.startTime);
  const dateStr = start.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <Pressable style={[styles.card, { backgroundColor: COLORS.surface }]} onPress={onPress} accessibilityRole="button">
      {event.imageUrl ? (
        <Image source={{ uri: event.imageUrl }} style={styles.cardImage} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, { color: COLORS.text }]} numberOfLines={2}>{event.title}</Text>
        <Text style={[styles.cardMeta, { color: COLORS.secondary }]}>{dateStr}</Text>
        <Text style={[styles.cardMeta, { color: COLORS.secondary }]} numberOfLines={1}>{event.address}</Text>
        <View style={styles.cardFooter}>
          <Text style={[styles.badge, { backgroundColor: COLORS.accent, color: '#fff' }]}>
            {t(`events.categories.${event.category}` as never)}
          </Text>
          <Text style={[styles.cardMeta, { color: COLORS.secondary }]}>
            {t('events.attendees', { count: event.attendeeCount })}
          </Text>
          {event.isAttending && (
            <Text style={[styles.attendingBadge, { color: COLORS.accent }]}>{t('events.attending')}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function EventsScreen() {
  const router = useRouter();
  const client = useEventsClient();
  const [events, setEvents] = useState<DiscoverEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      const res = await client.listEvents({ query: { limit: 20 } });
      if (res.status === 200) setEvents(res.body.items);
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
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>{t('events.title')}</Text>
        <Pressable
          style={[styles.createBtn, { backgroundColor: COLORS.accent }]}
          onPress={() => router.push('/discover/events/create')}
          accessibilityRole="button"
          accessibilityLabel={t('events.create')}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={sharedStyles.center}>
          <Text style={{ color: COLORS.secondary }}>{t('events.loadError')}</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <EventCard event={item} onPress={() => router.push(`/discover/events/${item.id}`)} />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={sharedStyles.center}>
              <Text style={{ color: COLORS.secondary }}>{t('events.empty')}</Text>
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
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 12, overflow: 'hidden', elevation: 2 },
  cardImage: { width: '100%', height: 140 },
  cardImagePlaceholder: { backgroundColor: '#E0E0E0' },
  cardBody: { padding: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardMeta: { fontSize: 12, marginBottom: 2 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, fontSize: 11, overflow: 'hidden' },
  attendingBadge: { fontSize: 12, fontWeight: '600' },
});
