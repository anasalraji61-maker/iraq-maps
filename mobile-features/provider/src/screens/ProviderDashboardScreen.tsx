import { testIDs, type ProviderMe, type ProviderStatus } from '@iraq-maps/contracts';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Badge, Button, EmptyState, ListItem, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View, Text as RNText, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';
import { useMessagingApi } from '../messaging-api';
import { SkeletonBlock } from '../skeleton';

const PRIMARY = '#1976D2';
import { AnalyticsChartCard } from './AnalyticsChartCard';

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
  /** Percentage of inquiries that have received a reply (0–100), derived from inbox. */
  replyRate: number | null;
  /** 7-day inquiry counts [6 days ago … today], derived from inbox createdAt. Null until loaded. */
  inquiryDays: number[] | null;
}

// ─── Profile Completeness ─────────────────────────────────────────────────────

interface CompletenessItem { key: 'photo' | 'hours' | 'phone' | 'description' | 'location'; done: boolean }

function computeCompleteness(provider: ProviderMe): CompletenessItem[] {
  return [
    { key: 'photo', done: (provider.photos ?? []).length > 0 },
    { key: 'hours', done: !!provider.hoursRaw },
    { key: 'phone', done: !!provider.phone },
    { key: 'description', done: (provider.prices ?? []).length > 0 || (provider.links ?? []).length > 0 },
    { key: 'location', done: !!provider.location },
  ];
}

function CompletenessBar({ provider, onEditPress }: { provider: ProviderMe; onEditPress: () => void }): ReactElement {
  const items = computeCompleteness(provider);
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, { toValue: pct / 100, duration: 600, useNativeDriver: false }).start();
  }, [barAnim, pct]);

  const barColor = pct < 40 ? '#EF4444' : pct < 80 ? '#F59E0B' : '#10B981';
  const missing = items.filter((i) => !i.done);

  return (
    <View style={completenessStyles.container} testID="provider-completeness">
      <View style={completenessStyles.header}>
        <RNText style={completenessStyles.title}>{t('dashboard.completeness.title')}</RNText>
        <RNText style={[completenessStyles.pct, { color: barColor }]}>
          {t('dashboard.completeness.percent', { pct })}
        </RNText>
      </View>
      <View style={completenessStyles.track}>
        <Animated.View
          style={[completenessStyles.fill, { backgroundColor: barColor, width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
          testID="completeness-fill"
        />
      </View>
      {missing.length > 0 && (
        <View style={completenessStyles.tips}>
          {missing.slice(0, 3).map((item) => (
            <RNText key={item.key} style={completenessStyles.tip} onPress={onEditPress}>
              {'• '}{t(`dashboard.completeness.${item.key}`)}
            </RNText>
          ))}
        </View>
      )}
    </View>
  );
}

const completenessStyles = StyleSheet.create({
  container: { backgroundColor: '#F0F4FF', borderRadius: 12, padding: 14, gap: 8, marginVertical: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: '600', color: '#333' },
  pct: { fontSize: 14, fontWeight: '700' },
  track: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  tips: { gap: 4, marginTop: 2 },
  tip: { fontSize: 12, color: '#1976D2' },
});

// ─────────────────────────────────────────────────────────────────────────────

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
  const [providerMe, setProviderMe] = useState<ProviderMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    viewsToday: null,
    incomingMessages: null,
    posts: null,
    rating: null,
    replyRate: null,
    inquiryDays: null,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.providers.me();
      if (res.status === 200) {
        setStatus(res.body.status);
        setProviderMe(res.body);
      }
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
      if (inboxRes.status === 200) {
        const items = inboxRes.body.items;
        // Bucket inquiries into last 7 days (index 0 = 6 days ago, index 6 = today).
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const buckets = Array<number>(7).fill(0);
        for (const inq of items) {
          const d = new Date(inq.createdAt);
          d.setUTCHours(0, 0, 0, 0);
          const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
          if (diffDays >= 0 && diffDays < 7) {
            const idx = 6 - diffDays;
            buckets[idx] = (buckets[idx] ?? 0) + 1;
          }
        }
        setAnalytics((prev) => ({
          ...prev,
          incomingMessages: items.length,
          replyRate: items.length > 0
            ? Math.round(
                (items.filter((inq) => inq.targets.some((tgt) => tgt.status === 'replied')).length /
                  items.length) * 100,
              )
            : prev.replyRate,
          inquiryDays: buckets,
          posts: feedRes?.status === 200
            ? feedRes.body.items.filter((p) => p.authorId === userId).length
            : prev.posts,
        }));
      } else {
        setAnalytics((prev) => ({
          ...prev,
          posts: feedRes?.status === 200
            ? feedRes.body.items.filter((p) => p.authorId === userId).length
            : prev.posts,
        }));
      }
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void handleRefresh(); }} colors={[PRIMARY]} />}
      >
      <Text variant="title">{t('dashboard.title')}</Text>
      <Text>{t('dashboard.status')}</Text>
      <Badge testID={testIDs.provider.status} label={t(`dashboard.${status}`)} />

      {providerMe && (
        <CompletenessBar
          provider={providerMe}
          onEditPress={() => router.push('/provider/edit-profile' as never)}
        />
      )}

      {providerMe?.avgResponseHours != null && (
        <ListItem
          testID="provider.avgResponseHours"
          title={t('dashboard.avgResponseHours', { hours: providerMe.avgResponseHours })}
        />
      )}

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
        <AnalyticsCard
          label={t('dashboard.analytics.replyRate')}
          value={analytics.replyRate === null ? '—' : `${analytics.replyRate}%`}
          color="#8B5CF6"
          icon="↩️"
        />
      </View>

      <AnalyticsChartCard
        providerId={session?.state.status === 'signedIn' ? session.state.user.id : 'anon'}
        metric="views"
      />
      <AnalyticsChartCard
        providerId={session?.state.status === 'signedIn' ? session.state.user.id : 'anon'}
        metric="inquiries"
        data={analytics.inquiryDays ?? undefined}
      />

      {providerMe && (providerMe.phone || (providerMe.links?.length ?? 0) > 0) ? (
        <ContactInfoSection provider={providerMe} />
      ) : null}

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
      <Button
        variant="secondary"
        label={t('posts.dashboardLink')}
        testID="provider.createPost"
        onPress={() => router.push('/provider/create-post' as never)}
      />
      <Button
        variant="secondary"
        label={t('gallery.dashboardLink')}
        testID="provider.photoGallery"
        onPress={() => router.push('/provider/photo-gallery' as never)}
      />
      <Button
        variant="secondary"
        label={t('notifications.dashboardLink')}
        testID="provider.notificationSettings"
        onPress={() => router.push('/provider/notification-settings' as never)}
      />
      <Button
        variant="secondary"
        label={t('stats.dashboardLink')}
        testID="provider.statsDetails"
        onPress={() => router.push('/provider/stats-details' as never)}
      />
      {providerMe?.claimedPlaceId ? (
        <Button
          testID="provider.viewPublicPage"
          variant="secondary"
          label={t('dashboard.viewPublicPage')}
          onPress={() => router.push(href('place', { placeId: providerMe.claimedPlaceId! }))}
        />
      ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Shows the provider's own contact info (phone + social) with consent state indicator. */
function ContactInfoSection({ provider }: { provider: ProviderMe }): ReactElement {
  const { phone, links = [], consents = [] } = provider;
  const phoneVisible = consents.includes('show_phone');
  const socialVisible = consents.includes('social_links');

  return (
    <View style={styles.contactSection}>
      <RNText style={styles.contactTitle}>{t('dashboard.contactTitle')}</RNText>
      {phone ? (
        <View style={styles.contactRow}>
          <RNText style={styles.contactLabel}>{t('dashboard.contactPhone')}</RNText>
          <RNText
            style={[styles.contactValue, phoneVisible ? styles.contactVisible : styles.contactHidden]}
            onPress={phoneVisible ? () => Linking.openURL(`tel:${phone.number.replace(/\s/g, '')}`).catch(() => undefined) : undefined}
          >
            {phone.number}
          </RNText>
          {!phoneVisible ? <RNText style={styles.consentNote}>{t('dashboard.contactConsentOff')}</RNText> : null}
        </View>
      ) : null}
      {links.length > 0 ? (
        <View style={styles.contactRow}>
          <RNText style={styles.contactLabel}>{t('dashboard.contactSocial')}</RNText>
          {links.map((link) => (
            <RNText
              key={link.url}
              style={[styles.contactValue, socialVisible ? styles.contactVisible : styles.contactHidden]}
              onPress={socialVisible ? () => Linking.openURL(link.url).catch(() => undefined) : undefined}
            >
              {link.kind}: {link.url}
            </RNText>
          ))}
          {!socialVisible ? <RNText style={styles.consentNote}>{t('dashboard.contactConsentOff')}</RNText> : null}
        </View>
      ) : null}
    </View>
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
  contactSection: { backgroundColor: '#F0F4FF', borderRadius: 10, padding: 14, gap: 8, marginVertical: 8 },
  contactTitle: { fontSize: 14, fontWeight: '700', color: '#1565C0', marginBottom: 4, textAlign: 'auto' },
  contactRow: { gap: 2 },
  contactLabel: { fontSize: 12, color: '#555', textAlign: 'auto' },
  contactValue: { fontSize: 14, textAlign: 'auto' },
  contactVisible: { color: PRIMARY, textDecorationLine: 'underline' },
  contactHidden: { color: '#999' },
  consentNote: { fontSize: 11, color: '#EF4444', textAlign: 'auto' },
});
