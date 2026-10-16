/**
 * AnalyticsDashboardScreen — comprehensive provider business analytics.
 *
 * Sections:
 *   • Period picker (7d / 30d / 90d / 1y)
 *   • Summary cards: views, impressions, messages, directions
 *   • Line chart: profile views over time
 *   • Bar chart: peak hours heatmap
 *   • Review score trend
 *   • Top search keywords
 *   • Conversion funnel
 *   • Competitor rank gauge
 *   • Export CSV button
 *   • Tips to improve
 *
 * All text via t(). RTL-safe (start/end, never left/right).
 * Charts use the existing animated chart components.
 */

import type {
  AnalyticsPeriod,
  BusinessAnalyticsSummary,
  CompetitorComparisonResponse,
  ConversionFunnelResponse,
  PeakVisitTimesResponse,
  ProfileViewsResponse,
  ReviewSummaryResponse,
  SearchKeywordsResponse,
} from '@iraq-maps/contracts';
import { businessAnalyticsContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  I18nManager,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from '../components/charts/BarChart';
import { LineChart } from '../components/charts/LineChart';
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
  heatLow: '#DBEAFE',
  heatHigh: '#1D4ED8',
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

// ─── Change badge ─────────────────────────────────────────────────────────────

function ChangeBadge({ value }: { value: number }): ReactElement {
  const pct = Math.round(Math.abs(value) * 100);
  if (Math.abs(value) < 0.005) {
    return <Text style={[styles.badge, styles.badgeNeutral]}>{t('bizAnalytics.changeNeutral')}</Text>;
  }
  if (value > 0) {
    return (
      <Text style={[styles.badge, styles.badgeUp]}>{t('bizAnalytics.changeUp', { pct })}</Text>
    );
  }
  return (
    <Text style={[styles.badge, styles.badgeDown]}>{t('bizAnalytics.changeDown', { pct })}</Text>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  change,
  color,
  icon,
}: {
  label: string;
  value: number | string;
  change?: number;
  color: string;
  icon: string;
}): ReactElement {
  return (
    <View style={[styles.summaryCard, { borderStartColor: color }]}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {change !== undefined ? <ChangeBadge value={change} /> : null}
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

// ─── Conversion funnel ────────────────────────────────────────────────────────

function ConversionFunnel({ data }: { data: ConversionFunnelResponse }): ReactElement {
  const steps = [
    {
      label: t('bizAnalytics.funnelImpressions'),
      value: data.impressions,
      color: C.primary,
    },
    {
      label: t('bizAnalytics.funnelViews'),
      value: data.profileViews,
      rate: data.impressionToViewRate,
      color: C.info,
    },
    {
      label: t('bizAnalytics.funnelActions'),
      value: data.actions,
      rate: data.viewToActionRate,
      color: C.success,
    },
  ];

  const maxVal = steps[0]?.value ?? 1;

  return (
    <View style={styles.funnel}>
      {steps.map((step, i) => {
        const widthPct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
        return (
          <View key={i} style={styles.funnelStep}>
            {step.rate !== undefined && step.rate !== null ? (
              <Text style={styles.funnelRate}>
                {t('bizAnalytics.funnelRate', { pct: Math.round(step.rate * 100) })}
              </Text>
            ) : null}
            <View style={[styles.funnelBar, { width: `${widthPct}%` as `${number}%`, backgroundColor: step.color }]}>
              <Text style={styles.funnelBarText}>{step.value.toLocaleString('ar-IQ')}</Text>
            </View>
            <Text style={styles.funnelLabel}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Competitor gauge ─────────────────────────────────────────────────────────

function CompetitorGauge({ data }: { data: CompetitorComparisonResponse }): ReactElement {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: data.percentile,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [data.percentile, animValue]);

  const positionLabel =
    data.position === 'above_avg'
      ? t('bizAnalytics.competitorAbove')
      : data.position === 'avg'
        ? t('bizAnalytics.competitorAvg')
        : t('bizAnalytics.competitorBelow');

  const positionColor =
    data.position === 'above_avg' ? C.success : data.position === 'avg' ? C.warning : C.danger;

  const gaugeW = CHART_W - 32;

  return (
    <View style={styles.competitorWrap}>
      <View style={styles.competitorHeader}>
        <Text style={styles.competitorRank}>
          {t('bizAnalytics.competitorRank', {
            rank: data.rank,
            total: data.totalInCategory,
          })}
        </Text>
        <Text style={[styles.competitorPosition, { color: positionColor }]}>{positionLabel}</Text>
      </View>

      {/* Gauge bar */}
      <View style={[styles.gaugeTrack, { width: gaugeW }]}>
        <Animated.View
          style={[
            styles.gaugeFill,
            {
              width: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [0, gaugeW],
              }),
              backgroundColor: positionColor,
            },
          ]}
        />
      </View>
      <View style={[styles.gaugeLabels, { width: gaugeW }]}>
        <Text style={styles.gaugeLabelStart}>0</Text>
        <Text style={styles.gaugeLabelEnd}>{data.totalInCategory}</Text>
      </View>

      {/* Comparison rows */}
      <View style={styles.compRows}>
        <CompRow
          label={t('bizAnalytics.competitorRating')}
          yours={data.yourAvgRating !== null ? data.yourAvgRating.toFixed(1) : '—'}
          market={data.categoryAvgRating !== null ? data.categoryAvgRating.toFixed(1) : '—'}
        />
        <CompRow
          label={t('bizAnalytics.competitorResponse')}
          yours={
            data.yourResponseRate !== null ? `${Math.round(data.yourResponseRate * 100)}%` : '—'
          }
          market={
            data.categoryAvgResponseRate !== null
              ? `${Math.round(data.categoryAvgResponseRate * 100)}%`
              : '—'
          }
        />
      </View>
    </View>
  );
}

function CompRow({
  label,
  yours,
  market,
}: {
  label: string;
  yours: string;
  market: string;
}): ReactElement {
  return (
    <View style={styles.compRow}>
      <Text style={styles.compRowLabel}>{label}</Text>
      <View style={styles.compRowValues}>
        <Text style={[styles.compRowValue, { color: C.primary }]}>
          {t('bizAnalytics.competitorYou')}: {yours}
        </Text>
        <Text style={styles.compRowValue}>
          {t('bizAnalytics.competitorMarket')}: {market}
        </Text>
      </View>
    </View>
  );
}

// ─── Keywords list ────────────────────────────────────────────────────────────

function KeywordsList({ data }: { data: SearchKeywordsResponse }): ReactElement {
  const maxCount = data.keywords[0]?.count ?? 1;

  if (data.keywords.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{t('bizAnalytics.keywordsEmpty')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.kwList}>
      {data.keywords.slice(0, 10).map((kw, i) => {
        const pct = maxCount > 0 ? kw.count / maxCount : 0;
        return (
          <View key={i} style={styles.kwRow}>
            <Text style={styles.kwRank}>{i + 1}</Text>
            <View style={styles.kwBarWrap}>
              <Text style={styles.kwLabel}>{kw.keyword}</Text>
              <View style={styles.kwTrack}>
                <View style={[styles.kwFill, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
              </View>
            </View>
            <Text style={styles.kwCount}>
              {t('bizAnalytics.keywordsCount', { count: kw.count })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Tips section ─────────────────────────────────────────────────────────────

const ALL_TIPS: Array<Parameters<typeof t>[0]> = [
  'bizAnalytics.tip_respond_fast',
  'bizAnalytics.tip_add_photos',
  'bizAnalytics.tip_ask_reviews',
  'bizAnalytics.tip_add_hours',
  'bizAnalytics.tip_create_offer',
  'bizAnalytics.tip_complete_profile',
];

function TipsSection({
  summary,
  competitor,
}: {
  summary: BusinessAnalyticsSummary | null;
  competitor: CompetitorComparisonResponse | null;
}): ReactElement {
  const tips: Array<Parameters<typeof t>[0]> = [];

  // Contextual tips
  if (summary && summary.messageCount > 0 && (summary.messageCount > 5)) {
    tips.push('bizAnalytics.tip_respond_fast');
  }
  if (competitor && competitor.position === 'below_avg') {
    tips.push('bizAnalytics.tip_ask_reviews');
    tips.push('bizAnalytics.tip_add_photos');
  }
  if (summary && summary.profileViews < 20) {
    tips.push('bizAnalytics.tip_complete_profile');
    tips.push('bizAnalytics.tip_add_hours');
  }

  // Fill with remaining tips
  for (const tip of ALL_TIPS) {
    if (tips.length >= 4) break;
    if (!tips.includes(tip)) tips.push(tip);
  }

  return (
    <View style={styles.tipsWrap}>
      {tips.slice(0, 4).map((tip, i) => (
        <View key={i} style={styles.tipRow}>
          <Text style={styles.tipBullet}>💡</Text>
          <Text style={styles.tipText}>{t(tip)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Peak hours bar ───────────────────────────────────────────────────────────

function PeakHoursChart({ data }: { data: PeakVisitTimesResponse }): ReactElement {
  // Heat-color interpolation: low → light blue, high → dark blue
  const barData = data.hourly.map((h) => {
    const t2 = h.score / 100;
    const r = Math.round(0xdb + (0x1d - 0xdb) * t2);
    const g = Math.round(0xea + (0x4e - 0xea) * t2);
    const b = Math.round(0xfe + (0xd8 - 0xfe) * t2);
    return {
      label: `${h.hour}`,
      value: h.score,
      color: `rgb(${r},${g},${b})`,
    };
  });

  return (
    <View>
      <BarChart
        data={barData}
        width={CHART_W}
        height={140}
        showValues={false}
      />
      <Text style={styles.peakHint}>{t('bizAnalytics.peakHoursHint')}</Text>
    </View>
  );
}

// ─── Review score summary ─────────────────────────────────────────────────────

function ReviewScoreSummary({ data }: { data: ReviewSummaryResponse }): ReactElement {
  const avgRating = data.avgRating?.value ?? null;

  return (
    <View style={styles.reviewSummaryWrap}>
      <View style={styles.reviewScoreBox}>
        <Text style={styles.reviewScoreBig}>
          {avgRating !== null ? avgRating.toFixed(1) : '—'}
        </Text>
        <Text style={styles.reviewScoreStars}>
          {avgRating !== null ? '★'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating)) : '☆☆☆☆☆'}
        </Text>
        <Text style={styles.reviewScoreCount}>
          {data.totalReviews} {t('bizAnalytics.reviewCount')}
        </Text>
      </View>

      {/* Distribution mini-bars */}
      <View style={styles.reviewDistWrap}>
        {data.distribution.map((d) => (
          <View key={d.star} style={styles.reviewDistRow}>
            <Text style={styles.reviewDistStar}>{d.star}★</Text>
            <View style={styles.reviewDistTrack}>
              <View
                style={[
                  styles.reviewDistFill,
                  {
                    width: `${Math.round(d.pct * 100)}%` as `${number}%`,
                    backgroundColor: d.star >= 4 ? C.success : d.star === 3 ? C.warning : C.danger,
                  },
                ]}
              />
            </View>
            <Text style={styles.reviewDistCount}>{d.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export interface AnalyticsDashboardScreenProps {
  providerId: string;
}

export function AnalyticsDashboardScreen({ providerId }: AnalyticsDashboardScreenProps): ReactElement {
  const api = useAnalyticsApi();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [summary, setSummary] = useState<BusinessAnalyticsSummary | null>(null);
  const [views, setViews] = useState<ProfileViewsResponse | null>(null);
  const [peakTimes, setPeakTimes] = useState<PeakVisitTimesResponse | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummaryResponse | null>(null);
  const [keywords, setKeywords] = useState<SearchKeywordsResponse | null>(null);
  const [funnel, setFunnel] = useState<ConversionFunnelResponse | null>(null);
  const [competitor, setCompetitor] = useState<CompetitorComparisonResponse | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const pid = providerId as Parameters<typeof api.summary>[0]['params']['providerId'];

        const [
          summaryRes,
          viewsRes,
          peakRes,
          reviewRes,
          kwRes,
          funnelRes,
          compRes,
        ] = await Promise.all([
          api.summary({ params: { providerId: pid }, query: { period } }),
          api.profileViews({ params: { providerId: pid }, query: { period } }),
          api.peakVisitTimes({ params: { providerId: pid } }),
          api.reviewSummary({ params: { providerId: pid }, query: { period } }),
          api.searchKeywords({ params: { providerId: pid }, query: { period } }),
          api.conversionFunnel({ params: { providerId: pid }, query: { period } }),
          api.competitorComparison({ params: { providerId: pid } }),
        ]);

        if (summaryRes.status === 200) setSummary(summaryRes.body);
        if (viewsRes.status === 200) setViews(viewsRes.body);
        if (peakRes.status === 200) setPeakTimes(peakRes.body);
        if (reviewRes.status === 200) setReviewSummary(reviewRes.body);
        if (kwRes.status === 200) setKeywords(kwRes.body);
        if (funnelRes.status === 200) setFunnel(funnelRes.body);
        if (compRes.status === 200) setCompetitor(compRes.body);
      } catch {
        setError(t('bizAnalytics.error'));
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

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const pid = providerId as Parameters<typeof api.exportReport>[0]['params']['providerId'];
      const res = await api.exportReport({ params: { providerId: pid }, query: { period } });
      if (res.status === 200) {
        if (Platform.OS !== 'web') {
          await Share.share({ title: res.body.filename, message: res.body.csvData });
        }
      } else {
        setError(t('bizAnalytics.exportFailed'));
      }
    } catch {
      setError(t('bizAnalytics.exportFailed'));
    } finally {
      setExporting(false);
    }
  }, [api, period, providerId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>{t('bizAnalytics.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (error && !summary) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>{t('bizAnalytics.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const viewsData =
    views?.daily.map((d) => ({ label: d.date.slice(5), value: d.count })) ?? [];

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
          <Text style={styles.headerTitle}>{t('bizAnalytics.title')}</Text>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && styles.exportBtnDisabled]}
            onPress={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Text style={styles.exportBtnText}>{t('bizAnalytics.exportCsv')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Period picker */}
        <PeriodPicker selected={period} onChange={setPeriod} />

        {/* Summary cards */}
        <SectionHeader title={t('bizAnalytics.summarySection')} />
        <View style={styles.summaryGrid}>
          {summary ? (
            <>
              <SummaryCard
                label={t('bizAnalytics.profileViews')}
                value={summary.profileViews.toLocaleString('ar-IQ')}
                change={summary.changeVsPrevious.profileViews}
                color={C.primary}
                icon="👁️"
              />
              <SummaryCard
                label={t('bizAnalytics.searchImpressions')}
                value={summary.searchImpressions.toLocaleString('ar-IQ')}
                change={summary.changeVsPrevious.searchImpressions}
                color={C.info}
                icon="🔍"
              />
              <SummaryCard
                label={t('bizAnalytics.messages')}
                value={summary.messageCount.toLocaleString('ar-IQ')}
                change={summary.changeVsPrevious.messageCount}
                color={C.success}
                icon="💬"
              />
              <SummaryCard
                label={t('bizAnalytics.directions')}
                value={summary.directionRequests.toLocaleString('ar-IQ')}
                change={summary.changeVsPrevious.directionRequests}
                color={C.warning}
                icon="🗺️"
              />
              <SummaryCard
                label={t('bizAnalytics.phoneClicks')}
                value={summary.phoneClicks.toLocaleString('ar-IQ')}
                color={C.danger}
                icon="📞"
              />
              <SummaryCard
                label={t('bizAnalytics.websiteClicks')}
                value={summary.websiteClicks.toLocaleString('ar-IQ')}
                color="#7C3AED"
                icon="🌐"
              />
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t('bizAnalytics.noData')}</Text>
              <Text style={styles.emptyHint}>{t('bizAnalytics.noDataHint')}</Text>
            </View>
          )}
        </View>

        {/* Profile views line chart */}
        {viewsData.length > 0 ? (
          <>
            <SectionHeader title={t('bizAnalytics.viewsOverTime')} />
            <View style={styles.card}>
              <LineChart
                data={viewsData}
                width={CHART_W}
                height={160}
                color={C.primary}
                showDots={viewsData.length <= 30}
                showGrid
                showLabels
                labelStep={Math.max(1, Math.floor(viewsData.length / 8))}
              />
            </View>
          </>
        ) : null}

        {/* Peak hours heatmap */}
        {peakTimes ? (
          <>
            <SectionHeader title={t('bizAnalytics.peakHoursTitle')} />
            <View style={styles.card}>
              <PeakHoursChart data={peakTimes} />
            </View>
          </>
        ) : null}

        {/* Review summary */}
        {reviewSummary && reviewSummary.totalReviews > 0 ? (
          <>
            <SectionHeader title={t('bizAnalytics.avgRating')} />
            <View style={styles.card}>
              <ReviewScoreSummary data={reviewSummary} />
            </View>
          </>
        ) : null}

        {/* Top search keywords */}
        {keywords ? (
          <>
            <SectionHeader title={t('bizAnalytics.keywordsTitle')} />
            <View style={styles.card}>
              <KeywordsList data={keywords} />
            </View>
          </>
        ) : null}

        {/* Conversion funnel */}
        {funnel ? (
          <>
            <SectionHeader title={t('bizAnalytics.conversionFunnelTitle')} />
            <View style={styles.card}>
              <ConversionFunnel data={funnel} />
            </View>
          </>
        ) : null}

        {/* Competitor gauge */}
        {competitor ? (
          <>
            <SectionHeader title={t('bizAnalytics.competitorTitle')} />
            <View style={styles.card}>
              <CompetitorGauge data={competitor} />
            </View>
          </>
        ) : null}

        {/* Tips */}
        <SectionHeader title={t('bizAnalytics.tipsTitle')} />
        <View style={styles.card}>
          <TipsSection summary={summary} competitor={competitor} />
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
  retryBtn: { backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  retryBtnText: { color: '#FFF', fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  exportBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF4FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnText: { color: C.primary, fontWeight: '600', fontSize: 13 },

  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#E2E8F0' },
  periodBtnActive: { backgroundColor: C.primary },
  periodBtnText: { fontSize: 13, fontWeight: '500', color: C.textMuted },
  periodBtnTextActive: { color: '#FFF' },

  sectionHeader: { marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.text },

  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  summaryCard: { width: (SCREEN_W - 42) / 2, backgroundColor: C.card, borderRadius: 12, padding: 14, borderStartWidth: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  summaryIcon: { fontSize: 22, marginBottom: 6 },
  summaryValue: { fontSize: 22, fontWeight: '700', color: C.text },
  summaryLabel: { fontSize: 12, color: C.textMuted, marginTop: 2 },

  badge: { marginTop: 6, fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  badgeUp: { backgroundColor: '#D1FAE5', color: '#065F46' },
  badgeDown: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  badgeNeutral: { backgroundColor: '#F1F5F9', color: C.textMuted },

  emptyBox: { flex: 1, alignItems: 'center', paddingVertical: 24, gap: 4 },
  emptyText: { color: C.textMuted, fontSize: 14, textAlign: 'center' },
  emptyHint: { color: C.textMuted, fontSize: 12, textAlign: 'center' },

  peakHint: { color: C.textMuted, fontSize: 11, marginTop: 6, textAlign: 'center' },

  funnel: { gap: 10 },
  funnelStep: { gap: 4 },
  funnelRate: { color: C.textMuted, fontSize: 11, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  funnelBar: { height: 36, borderRadius: 6, justifyContent: 'center', paddingHorizontal: 12, minWidth: 60 },
  funnelBarText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  funnelLabel: { color: C.textMuted, fontSize: 12 },

  competitorWrap: { gap: 12 },
  competitorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  competitorRank: { fontSize: 16, fontWeight: '700', color: C.text },
  competitorPosition: { fontSize: 13, fontWeight: '600' },
  gaugeTrack: { height: 10, backgroundColor: '#E2E8F0', borderRadius: 5, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 5 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  gaugeLabelStart: { fontSize: 10, color: C.textMuted },
  gaugeLabelEnd: { fontSize: 10, color: C.textMuted },
  compRows: { gap: 8 },
  compRow: { gap: 2 },
  compRowLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  compRowValues: { flexDirection: 'row', gap: 12 },
  compRowValue: { fontSize: 13, color: C.text },

  kwList: { gap: 8 },
  kwRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kwRank: { width: 20, fontSize: 12, color: C.textMuted, textAlign: 'center' },
  kwBarWrap: { flex: 1, gap: 2 },
  kwLabel: { fontSize: 13, color: C.text },
  kwTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  kwFill: { height: '100%', backgroundColor: C.primary, borderRadius: 3 },
  kwCount: { fontSize: 11, color: C.textMuted, minWidth: 56, textAlign: I18nManager.isRTL ? 'left' : 'right' },

  tipsWrap: { gap: 12 },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tipBullet: { fontSize: 16, lineHeight: 22 },
  tipText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 20 },

  reviewSummaryWrap: { flexDirection: 'row', gap: 16 },
  reviewScoreBox: { alignItems: 'center', width: 90 },
  reviewScoreBig: { fontSize: 36, fontWeight: '800', color: C.text },
  reviewScoreStars: { fontSize: 16, color: C.warning, letterSpacing: 2 },
  reviewScoreCount: { fontSize: 11, color: C.textMuted, marginTop: 4, textAlign: 'center' },
  reviewDistWrap: { flex: 1, gap: 5 },
  reviewDistRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewDistStar: { fontSize: 12, color: C.textMuted, width: 24 },
  reviewDistTrack: { flex: 1, height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' },
  reviewDistFill: { height: '100%', borderRadius: 4 },
  reviewDistCount: { fontSize: 11, color: C.textMuted, width: 24, textAlign: 'center' },

  bottomPad: { height: 40 },
});
