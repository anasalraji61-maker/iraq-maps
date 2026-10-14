import { testIDs, type ProviderStatus } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Badge, Button, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View, Text as RNText } from 'react-native';
import { t } from '../strings';
import { useMessagingApi } from '../messaging-api';

const POLL_INTERVAL_MS = 30_000;

interface AnalyticsData {
  // TODO: fetch from providers analytics endpoint when available
  viewsToday: number | null;
  // derived from inbox count
  incomingMessages: number | null;
  // TODO: fetch from discover module endpoint when available
  posts: number | null;
  // TODO: fetch from providers rating endpoint when available
  rating: number | null;
}

interface AnalyticsCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
}

function AnalyticsCard({ label, value, color, icon }: AnalyticsCardProps): ReactElement {
  return (
    <View style={[styles.card, { borderStartColor: color }]}>
      <RNText style={styles.cardIcon}>{icon}</RNText>
      <View style={styles.cardBody}>
        <RNText style={styles.cardValue}>{value}</RNText>
        <RNText style={styles.cardLabel}>{label}</RNText>
      </View>
    </View>
  );
}

/** Provider dashboard: shows account status badge and simple analytics cards. */
export function ProviderDashboardScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();
  const messagingApi = useMessagingApi();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    viewsToday: null,
    incomingMessages: null,
    posts: null,
    rating: null,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.providers.me();
      if (res.status === 200) setStatus(res.body.status);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchAnalytics = useCallback(async () => {
    // TODO: replace viewsToday with real analytics API call when endpoint is available
    // TODO: replace posts with real discover API call when endpoint is available
    // TODO: replace rating with real rating API call when endpoint is available
    try {
      const res = await messagingApi.listProviderInquiries({ query: {} });
      if (res.status === 200) {
        setAnalytics((prev) => ({ ...prev, incomingMessages: res.body.items.length }));
      }
    } catch {
      // analytics are non-critical; silently ignore fetch errors
    }
  }, [messagingApi]);

  useEffect(() => {
    void fetchStatus();
    void fetchAnalytics();
  }, [fetchStatus, fetchAnalytics]);

  // Auto-poll every 30 s while verification is in progress
  useEffect(() => {
    if (status === 'verified' || status === null) return;
    const interval = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, fetchStatus]);

  if (loading) return <Screen>{null}</Screen>;

  if (!status) {
    return (
      <Screen>
        <EmptyState title={t('dashboard.title')} body={t('dashboard.status')} />
      </Screen>
    );
  }

  const fmt = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <Screen scroll>
      <Text variant="title">{t('dashboard.title')}</Text>
      <Text>{t('dashboard.status')}</Text>
      <Badge testID={testIDs.provider.status} label={t(`dashboard.${status}`)} />

      <View style={styles.grid}>
        <AnalyticsCard
          label={t('dashboard.analytics.viewsToday')}
          value={fmt(analytics.viewsToday)}
          color="#3B82F6"
          icon="👁"
        />
        <AnalyticsCard
          label={t('dashboard.analytics.incomingMessages')}
          value={fmt(analytics.incomingMessages)}
          color="#10B981"
          icon="✉️"
        />
        <AnalyticsCard
          label={t('dashboard.analytics.posts')}
          value={fmt(analytics.posts)}
          color="#F59E0B"
          icon="📝"
        />
        <AnalyticsCard
          label={t('dashboard.analytics.rating')}
          value={analytics.rating === null ? '—' : `${analytics.rating} ★`}
          color="#EF4444"
          icon="⭐"
        />
      </View>

      {status !== 'verified' && (
        <Button
          label={t('dashboard.refresh')}
          onPress={() => { void fetchStatus(); }}
        />
      )}
      <Button
        variant="secondary"
        label={t('dashboard.editProfile')}
        onPress={() => router.push('/provider/edit-profile' as never)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderStartWidth: 4,
    padding: 14,
  },
  cardIcon: { fontSize: 24 },
  cardBody: { flex: 1 },
  cardValue: { fontSize: 22, fontWeight: '700' },
  cardLabel: { fontSize: 12, marginTop: 2 },
});
