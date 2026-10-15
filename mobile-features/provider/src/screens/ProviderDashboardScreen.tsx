import { testIDs, type ProviderStatus } from '@iraq-maps/contracts';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { Badge, Button, EmptyState, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, View, Text as RNText } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';
import { useMessagingApi } from '../messaging-api';

// ─── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonBlock({ width, height }: { width: number; height: number }): ReactElement {
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
  return <Animated.View style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6 }, { opacity }]} accessibilityElementsHidden />;
}

function DashboardSkeleton(): ReactElement {
  return (
    <Screen>
      <View testID="skeleton-dashboard" style={{ gap: 12, padding: 16 }}>
        <SkeletonBlock width={120} height={20} />
        <SkeletonBlock width={80} height={14} />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {[1, 2, 3, 4].map((k) => (
            <View key={k} style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 8, padding: 12, gap: 6, borderStartWidth: 4, borderStartColor: '#E0E0E0' }}>
              <SkeletonBlock width={28} height={28} />
              <SkeletonBlock width={36} height={18} />
              <SkeletonBlock width={60} height={11} />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;

interface AnalyticsData {
  /** Always null until a backend analytics endpoint is available. */
  viewsToday: number | null;
  /** Derived from inbox inquiry count. */
  incomingMessages: number | null;
  /** Count of discover posts authored by this provider's user. */
  posts: number | null;
  /** Always null until a backend rating endpoint is available. */
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
  const session = useSession();
  const messagingApi = useMessagingApi();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    const userId = session?.state.status === 'signedIn' ? session.state.user.id : null;
    try {
      const [inboxRes, feedRes] = await Promise.all([
        messagingApi.listProviderInquiries({ query: {} }),
        userId ? api.discover.listFeed({ query: { limit: 50 } }) : Promise.resolve(null),
      ]);
      setAnalytics((prev) => ({
        ...prev,
        incomingMessages: inboxRes.status === 200 ? inboxRes.body.items.length : prev.incomingMessages,
        posts: feedRes?.status === 200
          ? feedRes.body.items.filter((p) => p.authorId === userId).length
          : prev.posts,
      }));
    } catch {
      // analytics are non-critical; silently ignore fetch errors
    }
  }, [api, messagingApi, session]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchAnalytics()]);
    setRefreshing(false);
  }, [fetchStatus, fetchAnalytics]);

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

  if (loading) return <DashboardSkeleton />;

  if (!status) {
    return (
      <Screen>
        <EmptyState title={t('dashboard.title')} body={t('dashboard.status')} />
      </Screen>
    );
  }

  const fmt = (v: number | null): string => (v === null ? '—' : String(v));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void handleRefresh(); }} colors={['#1976D2']} />}
      >
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF' },
  content: { padding: 16 },
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
