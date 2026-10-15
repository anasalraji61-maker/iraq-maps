import { type Inquiry } from '@iraq-maps/contracts';
import { Card, EmptyState, Screen, Text, Banner } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useState, useEffect, type ReactElement } from 'react';
import { ScrollView, RefreshControl, View, StyleSheet, Text as RNText } from 'react-native';
import { useMessagingClient } from '../client';
import { t } from '../strings';

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  muted: { fontSize: 12, color: '#757575' },
});

type BadgeInfo = { label: string; color: string } | null;

function getInquiryBadge(targets: Inquiry['targets']): BadgeInfo {
  if (targets.length === 0) return null;
  const statuses = targets.map((t) => t.status);
  if (statuses.some((s) => s === 'replied')) {
    return { label: t('list.badgeReplied'), color: '#388E3C' };
  }
  if (statuses.every((s) => s === 'failed')) {
    return { label: t('list.badgeFailed'), color: '#C62828' };
  }
  if (statuses.some((s) => s === 'sent' || s === 'delivered' || s === 'read')) {
    return { label: t('list.badgeSent'), color: '#1976D2' };
  }
  return { label: t('list.badgePending'), color: '#F57C00' };
}

export function InquiriesListScreen(): ReactElement {
  const api = useMessagingClient();
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await api.listInquiries({ query: {} });
      if (res.status === 200) setInquiries(res.body.items);
    } catch {
      setError(t('list.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!loading && inquiries.length === 0 && !error) {
    return (
      <Screen>
        <EmptyState
          title={t('list.empty')}
          action={{ label: t('list.start'), onPress: () => router.push('/messages/new') }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">{t('list.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      <ScrollView testID="inquiries-list-scroll" refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        {inquiries.map((inq) => {
          const badge = getInquiryBadge(inq.targets);
          const placesLabel = inq.targets.length === 1
            ? t('list.placeCount')
            : t('list.placesCount', { count: inq.targets.length });
          return (
            <Card key={inq.id} onPress={() => router.push({ pathname: '/messages/[requestId]', params: { requestId: inq.id } })}>
              <Text>{inq.text.slice(0, 80)}</Text>
              <View style={styles.meta}>
                <RNText style={styles.muted}>{inq.createdAt.slice(0, 10)}</RNText>
                {inq.targets.length > 0 ? <RNText style={styles.muted}>{placesLabel}</RNText> : null}
                {badge ? (
                  <View style={[styles.badge, { backgroundColor: badge.color }]} accessibilityRole="text" accessibilityLabel={badge.label}>
                    <RNText style={styles.badgeText}>{badge.label}</RNText>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
