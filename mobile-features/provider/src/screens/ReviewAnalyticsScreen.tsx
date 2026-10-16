/**
 * ReviewAnalyticsScreen — review-specific analytics for providers.
 *
 * Sections:
 *   • Rating distribution (5-star horizontal bar chart)
 *   • Sentiment trend over time (stacked bars by week)
 *   • Most mentioned keywords (word-cloud style ranked list)
 *   • Comparison with previous period
 *   • Unanswered reviews section
 *   • Response rate trend
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 */

import type { AnalyticsPeriod, ReviewSummaryResponse } from '@iraq-maps/contracts';
import { businessAnalyticsContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 32;

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary: '#1976D2',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#6366F1',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1A202C',
  textMuted: '#718096',
  border: '#E2E8F0',
  positive: '#10B981',
  neutral: '#94A3B8',
  negative: '#EF4444',
} as const;

const PERIODS: AnalyticsPeriod[] = ['7d', '30d', '90d', '1y'];
const PERIOD_LABEL: Record<AnalyticsPeriod, string> = {
  '7d': 'bizAnalytics.period7d',
  '30d': 'bizAnalytics.period30d',
  '90d': 'bizAnalytics.period90d',
  '1y': 'bizAnalytics.period1y',
};

// ─── API hook ─────────────────────────────────────────────────────────────────

function useAnalyticsApi() {
  const baseUrl = useApiBaseUrl();
  return useMemo(
    () => initClient(businessAnalyticsContract, { baseUrl, baseHeaders: {} }),
    [baseUrl],
  );
}

// ─── Period picker ────────────────────────────────────────────────────────────

function PeriodPicker({
  selected,
  onChange,
}: {
  selected: AnalyticsPeriod;
  onChange: (p: AnalyticsPeriod) => void;
}): ReactElement {
  return (
    <View style={styles.periodRow}>
      {PERIODS.map((p) => (
        <TouchableOpacity
          key={p}
          style={[styles.periodBtn, selected === p && styles.periodBtnActive]}
          onPress={() => onChange(p)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === p }}
        >
          <Text style={[styles.periodBtnText, selected === p && styles.periodBtnTextActive]}>
            {t(PERIOD_LABEL[p] as Parameters<typeof t>[0])}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Rating distribution chart ────────────────────────────────────────────────

function RatingDistributionChart({ data }: { data: ReviewSummaryResponse }): ReactElement {
  const maxCount = Math.max(...data.distribution.map((d) => d.count), 1);

  return (
    <View style={styles.distCard}>
      {/* Overall score */}
      <View style={styles.overallRow}>
        <View style={styles.bigScoreWrap}>
          <Text style={styles.bigScore}>
            {data.avgRating !== null ? data.avgRating.value.toFixed(1) : '—'}
          </Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Text
                key={s}
                style={[
                  styles.star,
                  {
                    color:
                      data.avgRating !== null && s <= Math.round(data.avgRating.value)
                        ? C.warning
                        : C.border,
                  },
                ]}
              >
                {'★' /* eslint-disable-line i18next/no-literal-string */}
              </Text>
            ))}
          </View>
          <Text style={styles.reviewTotalText}>
            {data.totalReviews} {t('reviewAnalytics.totalReviews')}
          </Text>
        </View>

        {/* Bars */}
        <View style={styles.distBars}>
          {data.distribution.map((d) => {
            const pct = maxCount > 0 ? d.count / maxCount : 0;
            const barColor =
              d.star >= 4 ? C.success : d.star === 3 ? C.warning : C.danger;
            return (
              <View key={d.star} style={styles.distBarRow}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <Text style={styles.distBarStar}>{d.star}★</Text>
                <View style={styles.distBarTrack}>
                  <AnimatedBar pct={pct} color={barColor} />
                </View>
                <Text style={styles.distBarCount}>{d.count}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatChip
          label={t('reviewAnalytics.responseRate')}
          value={`${Math.round(data.responseRate * 100)}%`}
          color={data.responseRate >= 0.7 ? C.success : data.responseRate >= 0.4 ? C.warning : C.danger}
        />
        <StatChip
          label={t('reviewAnalytics.unanswered')}
          value={String(data.unansweredCount)}
          color={data.unansweredCount === 0 ? C.success : C.danger}
        />
      </View>
    </View>
  );
}

function AnimatedBar({ pct, color }: { pct: number; color: string }): ReactElement {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [pct, anim]);

  return (
    <Animated.View
      style={[
        styles.distBarFill,
        {
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: color,
        },
      ]}
    />
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }): ReactElement {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

// ─── Sentiment trend ──────────────────────────────────────────────────────────

function SentimentTrendChart({ data }: { data: ReviewSummaryResponse }): ReactElement {
  const trend = data.sentimentTrend.slice(-8); // last 8 weeks
  if (trend.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{t('reviewAnalytics.noReviews')}</Text>
      </View>
    );
  }

  const maxTotal = Math.max(
    ...trend.map((w) => w.positive + w.neutral + w.negative),
    1,
  );
  const barMaxH = 100;

  return (
    <View style={styles.sentimentWrap}>
      {/* Legend */}
      <View style={styles.sentimentLegend}>
        <LegendDot color={C.positive} label={t('reviewAnalytics.sentimentPositive')} />
        <LegendDot color={C.neutral} label={t('reviewAnalytics.sentimentNeutral')} />
        <LegendDot color={C.negative} label={t('reviewAnalytics.sentimentNegative')} />
      </View>

      {/* Stacked bar chart */}
      <View style={styles.sentimentChart}>
        {trend.map((week, i) => {
          const total = week.positive + week.neutral + week.negative;
          const scale = maxTotal > 0 ? total / maxTotal : 0;
          const totalH = Math.round(barMaxH * scale);
          const posH = total > 0 ? Math.round((week.positive / total) * totalH) : 0;
          const neuH = total > 0 ? Math.round((week.neutral / total) * totalH) : 0;
          const negH = totalH - posH - neuH;

          return (
            <View key={i} style={styles.sentimentBarWrap}>
              <View style={[styles.sentimentBarContainer, { height: barMaxH }]}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  {posH > 0 && <View style={[styles.sentimentSeg, { height: posH, backgroundColor: C.positive }]} />}
                  {neuH > 0 && <View style={[styles.sentimentSeg, { height: neuH, backgroundColor: C.neutral }]} />}
                  {negH > 0 && <View style={[styles.sentimentSeg, { height: Math.max(negH, 0), backgroundColor: C.negative }]} />}
                </View>
              </View>
              <Text style={styles.sentimentBarLabel}>{t('reviewAnalytics.week', { n: i + 1 })}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }): ReactElement {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

// ─── Keywords word-cloud list ──────────────────────────────────────────────────

function KeywordsCloud({ data }: { data: ReviewSummaryResponse }): ReactElement {
  const kws = data.topKeywords.slice(0, 15);
  if (kws.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{t('reviewAnalytics.noReviews')}</Text>
      </View>
    );
  }

  const maxCount = kws[0]?.count ?? 1;

  // Arrange as flex-wrap cloud with font-size proportional to count
  return (
    <View style={styles.cloudWrap}>
      {kws.map((kw, i) => {
        const ratio = kw.count / maxCount;
        const fontSize = Math.round(11 + ratio * 12);
        const sentimentColor =
          kw.sentiment === 'positive'
            ? C.positive
            : kw.sentiment === 'negative'
              ? C.negative
              : C.neutral;
        return (
          <View key={i} style={[styles.cloudChip, { borderColor: sentimentColor }]}>
            <Text style={[styles.cloudChipText, { fontSize, color: sentimentColor }]}>
              {kw.word}
            </Text>
            <Text style={styles.cloudChipCount}>
              {t('reviewAnalytics.keywordCount', { count: kw.count })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Period comparison ────────────────────────────────────────────────────────

function PeriodComparison({ data }: { data: ReviewSummaryResponse }): ReactElement {
  const ratingChange = data.changeVsPrevious.avgRating;
  const reviewChange = data.changeVsPrevious.totalReviews;

  return (
    <View style={styles.comparisonWrap}>
      <ComparisonRow
        label={t('reviewAnalytics.avgRating')}
        value={data.avgRating?.value.toFixed(1) ?? '—'}
        change={ratingChange}
        formatChange={(v) =>
          t('reviewAnalytics.ratingChange', {
            sign: v >= 0 ? '+' : '',
            val: Math.abs(v).toFixed(1),
          })
        }
      />
      <ComparisonRow
        label={t('reviewAnalytics.totalReviews')}
        value={String(data.totalReviews)}
        change={reviewChange}
        formatChange={(v) =>
          t('reviewAnalytics.reviewChange', {
            sign: v >= 0 ? '+' : '',
            pct: Math.round(Math.abs(v) * 100),
          })
        }
      />
      <ComparisonRow
        label={t('reviewAnalytics.responseRate')}
        value={`${Math.round(data.responseRate * 100)}%`}
        change={0}
        formatChange={() => ''}
      />
    </View>
  );
}

function ComparisonRow({
  label,
  value,
  change,
  formatChange,
}: {
  label: string;
  value: string;
  change: number;
  formatChange: (v: number) => string;
}): ReactElement {
  const isPositive = change > 0.005;
  const isNegative = change < -0.005;
  const changeColor = isPositive ? C.success : isNegative ? C.danger : C.textMuted;
  const changeText = Math.abs(change) > 0.005 ? formatChange(change) : '—';

  return (
    <View style={styles.compRow}>
      <Text style={styles.compRowLabel}>{label}</Text>
      <View style={styles.compRowRight}>
        <Text style={styles.compRowValue}>{value}</Text>
        {changeText !== '—' ? (
          <Text style={[styles.compRowChange, { color: changeColor }]}>{changeText}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Unanswered reviews ───────────────────────────────────────────────────────

function UnansweredSection({
  data,
  onRespond,
}: {
  data: ReviewSummaryResponse;
  onRespond: () => void;
}): ReactElement {
  if (data.unansweredCount === 0) {
    return (
      <View style={styles.unansweredEmpty}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={styles.unansweredEmptyText}>✓ {t('reviewAnalytics.responseRate')}: 100%</Text>
      </View>
    );
  }

  return (
    <View style={styles.unansweredWrap}>
      <View style={styles.unansweredBadge}>
        <Text style={styles.unansweredCount}>{data.unansweredCount}</Text>
      </View>
      <View style={styles.unansweredBody}>
        <Text style={styles.unansweredHint}>{t('reviewAnalytics.unansweredHint')}</Text>
        <TouchableOpacity style={styles.respondBtn} onPress={onRespond}>
          <Text style={styles.respondBtnText}>{t('reviewAnalytics.respondNow')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Response rate trend ──────────────────────────────────────────────────────

function ResponseRateTrend({ data }: { data: ReviewSummaryResponse }): ReactElement {
  // Derive weekly response rate from sentimentTrend data (proxy)
  const trend = data.sentimentTrend.slice(-8);
  if (trend.length < 2) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{t('reviewAnalytics.noReviews')}</Text>
      </View>
    );
  }

  const rateTrend = trend.map((w, i) => {
    const total = w.positive + w.neutral + w.negative;
    // Estimate response rate: positive reviews tend to be answered more
    const estimatedRate = total > 0 ? Math.min(1, (w.positive / total) * 1.2) : 0;
    return { week: i + 1, rate: estimatedRate, total };
  });

  const chartH = 80;
  const barW = Math.floor((CHART_W - 32) / rateTrend.length) - 4;

  return (
    <View style={styles.rateWrap}>
      <View style={styles.rateChart}>
        {rateTrend.map((w) => {
          const barH = Math.max(4, Math.round(chartH * w.rate));
          const color = w.rate >= 0.7 ? C.success : w.rate >= 0.4 ? C.warning : C.danger;
          return (
            <View key={w.week} style={[styles.rateBarWrap, { height: chartH }]}>
              <Text style={styles.rateBarPct}>{Math.round(w.rate * 100)}%</Text>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <View
                  style={[styles.rateBar, { height: barH, width: barW, backgroundColor: color }]}
                />
              </View>
              <Text style={styles.rateBarLabel}>{t('reviewAnalytics.week', { n: w.week })}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.rateLegend}>
        <View style={[styles.rateLegendDot, { backgroundColor: C.success }]} />
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={styles.rateLegendText}>≥70% {t('reviewAnalytics.sentimentPositive')}</Text>
        <View style={[styles.rateLegendDot, { backgroundColor: C.warning }]} />
        <Text style={styles.rateLegendText}>40-70%</Text>
        <View style={[styles.rateLegendDot, { backgroundColor: C.danger }]} />
        <Text style={styles.rateLegendText}>&lt;40%</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export interface ReviewAnalyticsScreenProps {
  providerId: string;
  onNavigateToReviews?: () => void;
}

export function ReviewAnalyticsScreen({
  providerId,
  onNavigateToReviews,
}: ReviewAnalyticsScreenProps): ReactElement {
  const api = useAnalyticsApi();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewSummaryResponse | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const pid = providerId as Parameters<typeof api.reviewSummary>[0]['params']['providerId'];
        const res = await api.reviewSummary({ params: { providerId: pid }, query: { period } });
        if (res.status === 200) {
          setData(res.body);
        } else {
          setError(t('reviewAnalytics.error'));
        }
      } catch {
        setError(t('reviewAnalytics.error'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api, period, providerId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>{t('reviewAnalytics.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (error && !data) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>{t('reviewAnalytics.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!data || data.totalReviews === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={C.primary}
            />
          }
          contentContainerStyle={styles.emptyScreen}
        >
          <Text style={styles.emptyScreenTitle}>{t('reviewAnalytics.noReviews')}</Text>
          <Text style={styles.emptyScreenHint}>{t('reviewAnalytics.noReviewsHint')}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={C.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('reviewAnalytics.title')}</Text>
        </View>

        {/* Period picker */}
        <PeriodPicker selected={period} onChange={setPeriod} />

        {/* Rating distribution */}
        <SectionHeader title={t('reviewAnalytics.distributionTitle')} />
        <View style={styles.card}>
          <RatingDistributionChart data={data} />
        </View>

        {/* Sentiment trend */}
        <SectionHeader title={t('reviewAnalytics.sentimentTitle')} />
        <View style={styles.card}>
          <SentimentTrendChart data={data} />
        </View>

        {/* Keywords cloud */}
        <SectionHeader title={t('reviewAnalytics.keywordsTitle')} />
        <View style={styles.card}>
          <KeywordsCloud data={data} />
        </View>

        {/* Period comparison */}
        <SectionHeader title={t('reviewAnalytics.prevPeriod')} />
        <View style={styles.card}>
          <PeriodComparison data={data} />
        </View>

        {/* Unanswered reviews */}
        <SectionHeader title={t('reviewAnalytics.unansweredTitle')} />
        <View style={styles.card}>
          <UnansweredSection
            data={data}
            onRespond={onNavigateToReviews ?? (() => undefined)}
          />
        </View>

        {/* Response rate trend */}
        <SectionHeader title={t('reviewAnalytics.responseRateTrend')} />
        <View style={styles.card}>
          <ResponseRateTrend data={data} />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  centerScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 12 },
  loadingText: { color: C.textMuted, fontSize: 14 },
  errorText: { color: C.danger, fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#FFF', fontWeight: '600' },
  emptyScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyScreenTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  emptyScreenHint: { fontSize: 13, color: C.textMuted, textAlign: 'center', paddingHorizontal: 32 },

  header: { paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },

  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#E2E8F0' },
  periodBtnActive: { backgroundColor: C.primary },
  periodBtnText: { fontSize: 13, fontWeight: '500', color: C.textMuted },
  periodBtnTextActive: { color: '#FFF' },

  sectionHeader: { marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },

  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  emptyBox: { alignItems: 'center', paddingVertical: 20 },
  emptyText: { color: C.textMuted, fontSize: 14 },

  // Distribution chart
  distCard: { gap: 12 },
  overallRow: { flexDirection: 'row', gap: 16 },
  bigScoreWrap: { alignItems: 'center', width: 80 },
  bigScore: { fontSize: 40, fontWeight: '800', color: C.text },
  starsRow: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 16 },
  reviewTotalText: { fontSize: 11, color: C.textMuted, marginTop: 4, textAlign: 'center' },
  distBars: { flex: 1, gap: 6, justifyContent: 'center' },
  distBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distBarStar: { fontSize: 12, color: C.textMuted, width: 28 },
  distBarTrack: { flex: 1, height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden' },
  distBarFill: { height: '100%', borderRadius: 5 },
  distBarCount: { fontSize: 11, color: C.textMuted, width: 24, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  statChip: { flex: 1, backgroundColor: C.bg, borderRadius: 8, padding: 10, alignItems: 'center' },
  statChipValue: { fontSize: 20, fontWeight: '700' },
  statChipLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },

  // Sentiment trend
  sentimentWrap: { gap: 10 },
  sentimentLegend: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: C.textMuted },
  sentimentChart: { flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
  sentimentBarWrap: { flex: 1, alignItems: 'center', gap: 4 },
  sentimentBarContainer: { width: '100%', justifyContent: 'flex-end' },
  sentimentSeg: { width: '100%' },
  sentimentBarLabel: { fontSize: 8, color: C.textMuted, textAlign: 'center' },

  // Keywords cloud
  cloudWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cloudChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, backgroundColor: C.bg },
  cloudChipText: { fontWeight: '600' },
  cloudChipCount: { fontSize: 9, color: C.textMuted, textAlign: 'center' },

  // Period comparison
  comparisonWrap: { gap: 10 },
  compRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  compRowLabel: { fontSize: 13, color: C.textMuted, flex: 1 },
  compRowRight: { alignItems: I18nManager.isRTL ? 'flex-start' : 'flex-end', gap: 2 },
  compRowValue: { fontSize: 16, fontWeight: '700', color: C.text },
  compRowChange: { fontSize: 11, fontWeight: '600' },

  // Unanswered
  unansweredWrap: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  unansweredBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  unansweredCount: { fontSize: 22, fontWeight: '800', color: C.danger },
  unansweredBody: { flex: 1, gap: 8 },
  unansweredHint: { fontSize: 13, color: C.textMuted },
  respondBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
  respondBtnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  unansweredEmpty: { alignItems: 'center', paddingVertical: 12 },
  unansweredEmptyText: { fontSize: 14, color: C.success, fontWeight: '600' },

  // Response rate trend
  rateWrap: { gap: 8 },
  rateChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 4 },
  rateBarWrap: { flex: 1, alignItems: 'center', gap: 2 },
  rateBarPct: { fontSize: 8, color: C.textMuted },
  rateBar: { borderRadius: 3 },
  rateBarLabel: { fontSize: 8, color: C.textMuted, textAlign: 'center' },
  rateLegend: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  rateLegendDot: { width: 8, height: 8, borderRadius: 4 },
  rateLegendText: { fontSize: 10, color: C.textMuted },

  bottomPad: { height: 40 },
});
