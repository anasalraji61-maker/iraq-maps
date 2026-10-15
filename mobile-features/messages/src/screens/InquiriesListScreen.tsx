import { type Inquiry, type MessageStatus } from '@iraq-maps/contracts';
import { Card, EmptyState, Screen, Text, Banner } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, ScrollView, RefreshControl, Pressable, View, StyleSheet, Text as RNText } from 'react-native';
import { useMessagingClient } from '../client';
import { useReadReceiptsMap } from '../hooks/useReadReceipts';
import { t } from '../strings';

const PRIMARY = '#1976D2';
const SUCCESS = '#388E3C';

/** Priority order: read > delivered > replied > sent > queued/handed_off/failed. */
const STATUS_RANK: Record<MessageStatus, number> = {
  read: 6,
  delivered: 5,
  replied: 4,
  sent: 3,
  handed_off: 2,
  queued: 1,
  failed: 0,
};

/** Return the most-advanced status across all targets of an inquiry. */
function topStatus(targets: Inquiry['targets']): MessageStatus | null {
  if (targets.length === 0) return null;
  return targets.reduce<MessageStatus>((best, tgt) => {
    return (STATUS_RANK[tgt.status] ?? 0) > (STATUS_RANK[best] ?? 0) ? tgt.status : best;
  }, targets[0]!.status);
}

/** Inline checkmark indicator that mirrors WhatsApp / Telegram conventions. */
function InlineStatusIcon({ status }: { status: MessageStatus | null }): ReactElement | null {
  if (!status || status === 'queued' || status === 'failed') return null;
  const isRead = status === 'read';
  const icon = status === 'sent' ? '✓' : '✓✓';
  return (
    <RNText
      style={{ fontSize: 12, color: isRead ? PRIMARY : '#9E9E9E', marginStart: 4 }}
      accessibilityLabel={t(`list.status.${status}`)}
      testID={`status-icon-${status}`}
    >
      {icon}
    </RNText>
  );
}

/** Converts an ISO datetime string into a human-readable relative time label. */
function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return t('time.justNow');
  if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('time.hoursAgo', { n: diffH });
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return t('time.yesterday');
  if (diffDays < 2) return t('time.today');
  // Fall back to locale date string for older items.
  return new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonLine({ width, height }: { width: number; height: number }): ReactElement {
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
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 4 }, { opacity }]}
      accessibilityElementsHidden
    />
  );
}

function SkeletonInquiryCard(): ReactElement {
  return (
    <View testID="skeleton-inquiry-card" style={skeletonStyles.card}>
      <SkeletonLine width={200} height={14} />
      <View style={skeletonStyles.meta}>
        <SkeletonLine width={60} height={11} />
        <SkeletonLine width={50} height={11} />
        <SkeletonLine width={48} height={20} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  muted: { fontSize: 12, color: '#757575' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PRIMARY,
    marginTop: 5,
  },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
});

type BadgeInfo = { label: string; color: string } | null;

function getInquiryBadge(targets: Inquiry['targets']): BadgeInfo {
  if (targets.length === 0) return null;
  const statuses = targets.map((tgt) => tgt.status);
  if (statuses.some((s) => s === 'replied')) {
    return { label: t('list.badgeReplied'), color: SUCCESS };
  }
  if (statuses.every((s) => s === 'failed')) {
    return { label: t('list.badgeFailed'), color: '#C62828' };
  }
  if (statuses.some((s) => s === 'sent' || s === 'delivered' || s === 'read')) {
    return { label: t('list.badgeSent'), color: PRIMARY };
  }
  return { label: t('list.badgePending'), color: '#F57C00' };
}

export function InquiriesListScreen(): ReactElement {
  const api = useMessagingClient();
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const readMap = useReadReceiptsMap(inquiries.map((i) => i.id));
  // Start as true so the skeleton shows immediately on first render
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(undefined);
    try {
      const res = await api.listInquiries({ query: {} });
      if (res.status === 200) {
        setInquiries(res.body.items);
        setNextCursor(res.body.nextCursor);
      }
    } catch {
      setError(t('list.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.listInquiries({ query: { cursor: nextCursor } });
      if (res.status === 200) {
        setInquiries((prev) => [...prev, ...res.body.items]);
        setNextCursor(res.body.nextCursor);
      }
    } catch {
      // Best-effort; user can retry by scrolling again
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading && inquiries.length === 0) {
    return (
      <Screen>
        <Text variant="title">{t('list.title')}</Text>
        <View accessibilityLabel={t('list.loading')}>
          {[1, 2, 3].map((k) => <SkeletonInquiryCard key={k} />)}
        </View>
      </Screen>
    );
  }

  if (!loading && inquiries.length === 0 && !error) {
    return (
      <Screen>
        <EmptyState
          title={t('list.empty')}
          body={t('list.emptyBody')}
          action={{ label: t('list.start'), onPress: () => router.push('/messages/new') }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">{t('list.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      <ScrollView
        testID="inquiries-list-scroll"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void load(true); }} />}
        onScrollEndDrag={() => { void loadMore(); }}
      >
        {inquiries.map((inq) => {
          const badge = getInquiryBadge(inq.targets);
          const placesLabel = inq.targets.length === 1
            ? t('list.placeCount')
            : t('list.placesCount', { count: inq.targets.length });
          const isUnread = !readMap[inq.id];
          const msgStatus = topStatus(inq.targets);
          return (
            <Card key={inq.id} onPress={() => router.push({ pathname: '/messages/[requestId]', params: { requestId: inq.id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                {isUnread ? (
                  <View
                    style={styles.unreadDot}
                    accessibilityLabel={t('detail.unread')}
                    accessibilityRole="text"
                    testID="unread-dot"
                  />
                ) : null}
                <RNText style={isUnread ? { fontWeight: '700', fontSize: 14 } : { fontSize: 14 }}>{inq.text.slice(0, 80)}</RNText>
                <InlineStatusIcon status={msgStatus} />
              </View>
              <View style={styles.meta}>
                <RNText style={styles.muted}>{fmtRelative(inq.createdAt)}</RNText>
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
        {nextCursor ? (
          <Pressable
            style={styles.loadMoreBtn}
            onPress={() => { void loadMore(); }}
            disabled={loadingMore}
            accessibilityRole="button"
          >
            <RNText style={styles.loadMoreText}>
              {loadingMore ? '…' : t('list.loadMore')}
            </RNText>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
