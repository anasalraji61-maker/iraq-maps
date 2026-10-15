import { type DiscoverEventType } from '@iraq-maps/contracts';
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
import { useEventsClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

export function EventDetailScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const client = useEventsClient();
  const session = useSession();
  const [event, setEvent] = useState<DiscoverEventType | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await client.getEvent({ params: { eventId: eventId as never } });
      if (res.status === 200) setEvent(res.body);
    } catch { /* handled by null state */ }
    setLoading(false);
  }, [client, eventId]);

  useEffect(() => { void load(); }, [load]);

  const handleRsvp = async () => {
    if (!event) return;
    setRsvpLoading(true);
    try {
      if (event.isAttending) {
        await client.cancelRsvp({ params: { eventId: eventId as never } });
        setEvent({ ...event, isAttending: false, attendeeCount: event.attendeeCount - 1 });
      } else {
        await client.rsvpEvent({ params: { eventId: eventId as never }, body: {} });
        setEvent({ ...event, isAttending: true, attendeeCount: event.attendeeCount + 1 });
      }
    } catch {
      Alert.alert(t('events.rsvpError'));
    }
    setRsvpLoading(false);
  };

  if (loading) return (
    <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.background }]}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );

  if (!event) return (
    <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.background }]}>
      <Text style={{ color: COLORS.textSecondary }}>{t('events.loadError')}</Text>
    </View>
  );

  const start = new Date(event.startTime).toLocaleString('ar-IQ');
  const end = new Date(event.endTime).toLocaleString('ar-IQ');
  const isFull = event.maxAttendees !== null && event.attendeeCount >= event.maxAttendees && !event.isAttending;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.background }}>
      {event.imageUrl ? (
        <Image source={{ uri: event.imageUrl }} style={styles.hero} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.hero, { backgroundColor: '#E0E0E0' }]} />
      )}
      <View style={styles.content}>
        <Text style={[styles.title, { color: COLORS.textPrimary }]}>{event.title}</Text>
        <Text style={[styles.meta, { color: COLORS.textSecondary }]}>{t('events.startTime')}: {start}</Text>
        <Text style={[styles.meta, { color: COLORS.textSecondary }]}>{t('events.endTime')}: {end}</Text>
        <Text style={[styles.meta, { color: COLORS.textSecondary }]}>{t('events.address')}: {event.address}</Text>
        <Text style={[styles.meta, { color: COLORS.textSecondary }]}>
          {t('events.attendees', { count: event.attendeeCount })}
          {event.maxAttendees ? ` / ${event.maxAttendees}` : ''}
        </Text>
        <Text style={[styles.description, { color: COLORS.textPrimary }]}>{event.description}</Text>

        {( session.state.status === 'signedIn' ? session.state.user.id : undefined ) ? (
          <Pressable
            style={[
              styles.rsvpBtn,
              { backgroundColor: event.isAttending ? '#ccc' : isFull ? '#aaa' : COLORS.primary },
            ]}
            onPress={handleRsvp}
            disabled={rsvpLoading || isFull}
            accessibilityRole="button"
          >
            {rsvpLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.rsvpBtnText}>
                {isFull ? t('events.full') : event.isAttending ? t('events.cancelRsvp') : t('events.rsvp')}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 220 },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  meta: { fontSize: 13, marginBottom: 4 },
  description: { fontSize: 15, lineHeight: 22, marginTop: 12 },
  rsvpBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  rsvpBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
