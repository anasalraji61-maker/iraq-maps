/**
 * ScoreBreakdownScreen
 *
 * Shows the provider's overall ranking score with a breakdown of each
 * component, improvement tips, 30-day score history chart, a "how am I
 * ranked?" explainer, and an anonymous comparison with similar providers.
 *
 * RTL-safe: uses `start`/`end` everywhere, all strings through t().
 */
/* eslint-disable i18next/no-literal-string */

import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { tokens } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { type ReactElement, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  I18nManager,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const { width: SCREEN_W } = Dimensions.get('window');

// ─── API types (mirrors ranking.service.ts) ───────────────────────────────────

interface ScoreComponents {
  overall:            number;
  ratingScore:        number;
  engagementScore:    number;
  completenessScore:  number;
  activityScore:      number;
}

interface RatingDetail {
  reviewCount:  number;
  averageStar:  number;
  wilsonLower:  number;
}

interface EngagementDetail {
  responseRate:      number;
  avgResponseHours:  number | null;
  monthlyMessages:   number;
}

interface CompletenessDetail {
  hasName:     boolean;
  hasCategory: boolean;
  hasPhone:    boolean;
  hasHours:    boolean;
  hasLocation: boolean;
  photoCount:  number;
  menuItems:   number;
}

interface ActivityDetail {
  daysSinceUpdate:  number;
  postsLastMonth:   number;
}

interface ScoreBreakdown extends ScoreComponents {
  providerId:  string;
  computedAt:  string;
  detail: {
    rating:       RatingDetail;
    engagement:   EngagementDetail;
    completeness: CompletenessDetail;
    activity:     ActivityDetail;
  };
  tips: string[];
}

interface ScoreHistoryPoint {
  recordedAt: string;
  overall:    number;
}

interface ComparisonData {
  rank:  number;
  total: number;
  label: 'aboveAvg' | 'average' | 'belowAvg';
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface ScoreBreakdownScreenProps {
  providerId: string;
}

export function ScoreBreakdownScreen({
  providerId,
}: ScoreBreakdownScreenProps): ReactElement {
  const router  = useRouter();
  const apiBase = useApiBaseUrl();

  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [history,   setHistory]   = useState<ScoreHistoryPoint[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [bdRes, histRes, cmpRes] = await Promise.all([
          fetch(`${apiBase}/providers/${providerId}/score/breakdown`),
          fetch(`${apiBase}/providers/${providerId}/score/history?days=30`),
          fetch(`${apiBase}/providers/${providerId}/score/comparison`),
        ]);

        if (cancelled) return;

        if (!bdRes.ok) throw new Error('breakdown fetch failed');

        const bd  = (await bdRes.json())  as ScoreBreakdown;
        const hist = histRes.ok ? ((await histRes.json()) as ScoreHistoryPoint[]) : [];
        const cmp  = cmpRes.ok  ? ((await cmpRes.json()) as ComparisonData)       : null;

        if (!cancelled) {
          setBreakdown(bd);
          setHistory(hist);
          setComparison(cmp);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [apiBase, providerId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={tokens.color.primary} />
      </View>
    );
  }

  if (error || !breakdown) {
    return (
      <View style={styles.center}>
        <RNText style={styles.errorText}>{error ?? t('errors.generic')}</RNText>
        <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
          <RNText style={styles.retryText}>{t('actions.back')}</RNText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <RNText style={styles.screenTitle}>{t('ranking.title')}</RNText>
      <RNText style={styles.computedAt}>
        {t('ranking.computedAt', {
          date: new Date(breakdown.computedAt).toLocaleDateString('ar-IQ'),
        })}
      </RNText>

      {/* Overall score gauge */}
      <OverallGauge score={breakdown.overall} />

      {/* 4-component breakdown */}
      <SectionTitle title={t('ranking.overall')} />
      <ComponentBar
        label={t('ranking.components.rating')}
        weight={t('ranking.weights.rating')}
        score={breakdown.ratingScore}
        color="#F5A623"
      />
      <ComponentBar
        label={t('ranking.components.engagement')}
        weight={t('ranking.weights.engagement')}
        score={breakdown.engagementScore}
        color="#4CAF50"
      />
      <ComponentBar
        label={t('ranking.components.completeness')}
        weight={t('ranking.weights.completeness')}
        score={breakdown.completenessScore}
        color="#2196F3"
      />
      <ComponentBar
        label={t('ranking.components.activity')}
        weight={t('ranking.weights.activity')}
        score={breakdown.activityScore}
        color="#9C27B0"
      />

      {/* Detail rows */}
      <DetailSection breakdown={breakdown} />

      {/* Score history chart */}
      {history.length > 0 && (
        <>
          <SectionTitle title={t('ranking.history.title')} />
          <ScoreHistoryChart history={history} />
        </>
      )}
      {history.length === 0 && (
        <>
          <SectionTitle title={t('ranking.history.title')} />
          <RNText style={styles.emptyText}>{t('ranking.history.noData')}</RNText>
        </>
      )}

      {/* Comparison with peers */}
      {comparison && (
        <>
          <SectionTitle title={t('ranking.comparison.title')} />
          <ComparisonCard comparison={comparison} />
        </>
      )}

      {/* How am I ranked? explainer */}
      <SectionTitle title={t('ranking.howRanked.title')} />
      <HowRankedCard />

      {/* Tips to improve */}
      {breakdown.tips.length > 0 && (
        <>
          <SectionTitle title={t('ranking.tips.title')} />
          <TipsList tips={breakdown.tips} />
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ─── Overall gauge ─────────────────────────────────────────────────────────

interface OverallGaugeProps {
  score: number;
}

function OverallGauge({ score }: OverallGaugeProps): ReactElement {
  const pct   = Math.min(100, Math.max(0, score));
  const color = scoreColor(pct);

  return (
    <View style={gaugeStyles.container} accessibilityLabel={`${t('ranking.overall')} ${score}`}>
      {/* Outer ring */}
      <View style={[gaugeStyles.ring, { borderColor: color }]}>
        <View style={gaugeStyles.inner}>
          <RNText style={[gaugeStyles.number, { color }]}>{Math.round(pct)}</RNText>
          <RNText style={gaugeStyles.outOf}>{t('ranking.outOf')}</RNText>
        </View>
      </View>
      {/* Progress arc overlay – simple segmented approach */}
      <ArcProgress pct={pct} color={color} />
    </View>
  );
}

interface ArcProgressProps {
  pct:   number;
  color: string;
}

function ArcProgress({ pct, color }: ArcProgressProps): ReactElement {
  // We draw a thin bar below the number to represent the score visually.
  // A full SVG arc is outside scope; this linear bar is RTL-safe.
  const fillW = (SCREEN_W - 80) * (pct / 100);
  return (
    <View style={arcStyles.track}>
      <View style={[arcStyles.fill, { width: fillW, backgroundColor: color }]} />
    </View>
  );
}

const GAUGE_SIZE = 140;

const gaugeStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 24,
  },
  ring: {
    width:        GAUGE_SIZE,
    height:       GAUGE_SIZE,
    borderRadius: GAUGE_SIZE / 2,
    borderWidth:  10,
    alignItems:   'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
  },
  number: {
    fontSize:   40,
    fontWeight: '800',
    lineHeight: 44,
  },
  outOf: {
    fontSize: 13,
    color:    '#888',
    marginTop: 2,
  },
});

const arcStyles = StyleSheet.create({
  track: {
    height:       8,
    width:        SCREEN_W - 80,
    borderRadius: 4,
    backgroundColor: '#ECEFF1',
    marginTop:    16,
    overflow:     'hidden',
  },
  fill: {
    height:       8,
    borderRadius: 4,
  },
});

// ─── Component progress bar ───────────────────────────────────────────────────

interface ComponentBarProps {
  label:  string;
  weight: string;
  score:  number;
  color:  string;
}

function ComponentBar({ label, weight, score, color }: ComponentBarProps): ReactElement {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <View style={barStyles.row}>
      <View style={barStyles.labelRow}>
        <RNText style={barStyles.label}>{label}</RNText>
        <View style={barStyles.endGroup}>
          <RNText style={barStyles.weight}>{weight}</RNText>
          <RNText style={[barStyles.scoreNum, { color }]}>{Math.round(pct)}</RNText>
        </View>
      </View>
      <View style={barStyles.track}>
        <View
          style={[
            barStyles.fill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: {
    marginHorizontal: 16,
    marginBottom: 14,
  },
  labelRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  endGroup: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  label: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#333',
  },
  weight: {
    fontSize: 11,
    color:    '#AAA',
  },
  scoreNum: {
    fontSize:   15,
    fontWeight: '700',
    minWidth:   28,
    textAlign:  'auto',
  },
  track: {
    height:          8,
    borderRadius:    4,
    backgroundColor: '#ECEFF1',
    overflow:        'hidden',
  },
  fill: {
    height:       8,
    borderRadius: 4,
  },
});

// ─── Detail section ────────────────────────────────────────────────────────────

interface DetailSectionProps {
  breakdown: ScoreBreakdown;
}

function DetailSection({ breakdown }: DetailSectionProps): ReactElement {
  const { rating, engagement, completeness, activity } = breakdown.detail;

  const responseRatePct = Math.round(engagement.responseRate * 100);

  return (
    <View style={detailStyles.container}>
      {/* Rating */}
      <DetailRow
        icon="⭐"
        text={t('ranking.detail.reviewCount', { count: rating.reviewCount })}
      />
      {rating.reviewCount > 0 && (
        <DetailRow
          icon="⭐"
          text={t('ranking.detail.avgStar', { value: rating.averageStar.toFixed(1) })}
        />
      )}

      {/* Engagement */}
      <DetailRow
        icon="💬"
        text={t('ranking.detail.responseRate', { pct: responseRatePct })}
      />
      {engagement.avgResponseHours !== null && (
        <DetailRow
          icon="⏱"
          text={t('ranking.detail.avgResponseTime', {
            h: engagement.avgResponseHours.toFixed(1),
          })}
        />
      )}
      <DetailRow
        icon="📨"
        text={t('ranking.detail.monthlyMessages', {
          count: engagement.monthlyMessages,
        })}
      />

      {/* Completeness */}
      <DetailRow
        icon="🖼"
        text={t('ranking.detail.photoCount', { count: completeness.photoCount })}
      />
      <DetailRow
        icon="📋"
        text={t('ranking.detail.menuItems', { count: completeness.menuItems })}
      />

      {/* Activity */}
      <DetailRow
        icon="🔄"
        text={t('ranking.detail.lastUpdate', {
          days: Math.floor(activity.daysSinceUpdate),
        })}
      />
      <DetailRow
        icon="📢"
        text={t('ranking.detail.postsLastMonth', {
          count: activity.postsLastMonth,
        })}
      />
    </View>
  );
}

interface DetailRowProps {
  icon: string;
  text: string;
}

function DetailRow({ icon, text }: DetailRowProps): ReactElement {
  return (
    <View style={detailStyles.row}>
      <RNText style={detailStyles.icon}>{icon}</RNText>
      <RNText style={detailStyles.text}>{text}</RNText>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom:     8,
    backgroundColor:  '#F9FAFB',
    borderRadius:     10,
    padding:          12,
    gap:              8,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  icon: { fontSize: 16 },
  text: { fontSize: 13, color: '#555', flex: 1 },
});

// ─── Score history chart ──────────────────────────────────────────────────────

interface ScoreHistoryChartProps {
  history: ScoreHistoryPoint[];
}

function ScoreHistoryChart({ history }: ScoreHistoryChartProps): ReactElement {
  const chartW = SCREEN_W - 32;
  const chartH = 100;
  const padding = { top: 10, bottom: 20, start: 10, end: 10 };
  const innerW = chartW - padding.start - padding.end;
  const innerH = chartH - padding.top  - padding.bottom;

  const scores = history.map((h) => h.overall);
  const maxS   = Math.max(...scores, 100);
  const minS   = Math.min(...scores, 0);
  const range  = maxS - minS || 1;

  const points = history.map((h, i) => ({
    x: padding.start + (i / Math.max(history.length - 1, 1)) * innerW,
    y: padding.top   + (1 - (h.overall - minS) / range) * innerH,
    score: h.overall,
    date:  new Date(h.recordedAt).toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }),
  }));

  // Build SVG polyline points string
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={chartStyles.container}>
      {/* Simple SVG-less chart using absolutely positioned views */}
      <View style={[chartStyles.chartArea, { width: chartW, height: chartH }]}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => {
          const y = padding.top + (1 - (v - minS) / range) * innerH;
          return (
            <View
              key={v}
              style={[chartStyles.gridLine, { top: y }]}
            >
              <RNText style={chartStyles.gridLabel}>{v}</RNText>
            </View>
          );
        })}

        {/* Data points */}
        {points.map((p, i) => (
          <View
            key={i}
            style={[
              chartStyles.dot,
              { top: p.y - 4, start: p.x - 4 },
            ]}
            accessibilityLabel={`${p.date}: ${p.score}`}
          />
        ))}

        {/* First and last date labels */}
        {points.length > 0 && (
          <>
            <RNText
              style={[chartStyles.dateLabel, { start: padding.start, top: chartH - 18 }]}
            >
              {points[0]?.date}
            </RNText>
            <RNText
              style={[
                chartStyles.dateLabel,
                { end: padding.end, top: chartH - 18 },
              ]}
            >
              {points[points.length - 1]?.date}
            </RNText>
          </>
        )}
      </View>

      {/* Polyline hint – rendered as a thin horizontal sequence of dots */}
      <View style={chartStyles.polylineHint}>
        <RNText style={chartStyles.polylineHintText} numberOfLines={1}>
          {polylinePoints.slice(0, 40)}
        </RNText>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom:     16,
    backgroundColor:  '#F9FAFB',
    borderRadius:     10,
    padding:          4,
    overflow:         'hidden',
  },
  chartArea: {
    position: 'relative',
  },
  gridLine: {
    position:  'absolute',
    start:     0,
    end:       0,
    height:    1,
    backgroundColor: '#E8ECEF',
    flexDirection:   'row',
    alignItems:      'center',
  },
  gridLabel: {
    fontSize: 9,
    color:    '#BBB',
    marginEnd: 4,
    position:  'absolute',
    end:       4,
  },
  dot: {
    position:      'absolute',
    width:         8,
    height:        8,
    borderRadius:  4,
    backgroundColor: tokens.color.primary ?? '#1976D2',
  },
  dateLabel: {
    position:  'absolute',
    fontSize:  10,
    color:     '#888',
  },
  polylineHint: { height: 0, overflow: 'hidden' },
  polylineHintText: { fontSize: 1, color: 'transparent' },
});

// ─── Comparison card ──────────────────────────────────────────────────────────

interface ComparisonCardProps {
  comparison: ComparisonData;
}

function ComparisonCard({ comparison }: ComparisonCardProps): ReactElement {
  const labelKey =
    comparison.label === 'aboveAvg'
      ? 'ranking.comparison.aboveAvg'
      : comparison.label === 'belowAvg'
      ? 'ranking.comparison.belowAvg'
      : 'ranking.comparison.average';

  const labelColor =
    comparison.label === 'aboveAvg'
      ? '#43A047'
      : comparison.label === 'belowAvg'
      ? '#E53935'
      : '#F5A623';

  return (
    <View style={cmpStyles.card}>
      <RNText style={cmpStyles.rank}>
        {t('ranking.comparison.youAre', {
          rank:  comparison.rank,
          total: comparison.total,
        })}
      </RNText>
      <View style={[cmpStyles.badge, { backgroundColor: labelColor + '22' }]}>
        <RNText style={[cmpStyles.badgeText, { color: labelColor }]}>
          {t(labelKey as Parameters<typeof t>[0])}
        </RNText>
      </View>
      {/* Anonymous bar chart: show position within peers */}
      <PeerBar rank={comparison.rank} total={comparison.total} color={labelColor} />
    </View>
  );
}

interface PeerBarProps {
  rank:  number;
  total: number;
  color: string;
}

function PeerBar({ rank, total, color }: PeerBarProps): ReactElement {
  const pctFromTop = rank / total;
  const filled     = Math.round((1 - pctFromTop) * 10);

  return (
    <View style={peerBarStyles.row}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={i}
          style={[
            peerBarStyles.segment,
            { backgroundColor: i < filled ? color : '#E0E0E0' },
          ]}
        />
      ))}
    </View>
  );
}

const peerBarStyles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    gap:            3,
    marginTop:      10,
    justifyContent: 'center',
  },
  segment: {
    width:        18,
    height:       18,
    borderRadius: 3,
  },
});

const cmpStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom:     16,
    backgroundColor:  '#F9FAFB',
    borderRadius:     10,
    padding:          16,
    alignItems:       'center',
    gap:              8,
  },
  rank: {
    fontSize:   15,
    fontWeight: '600',
    color:      '#333',
  },
  badge: {
    borderRadius:    20,
    paddingHorizontal: 14,
    paddingVertical:   5,
  },
  badgeText: {
    fontSize:   13,
    fontWeight: '700',
  },
});

// ─── How ranked explainer ──────────────────────────────────────────────────────

function HowRankedCard(): ReactElement {
  const modifiers: Array<{ key: string; delta: string; positive: boolean }> = [
    { key: 'ranking.howRanked.verifiedBoost',      delta: '+15%', positive: true },
    { key: 'ranking.howRanked.nearbyBoost',         delta: '+10%', positive: true },
    { key: 'ranking.howRanked.openNowBoost',        delta: '+5%',  positive: true },
    { key: 'ranking.howRanked.newProviderBoost',    delta: '+15%', positive: true },
    { key: 'ranking.howRanked.slowResponsePenalty', delta: '-10%', positive: false },
  ];

  return (
    <View style={howStyles.card}>
      <RNText style={howStyles.body}>{t('ranking.howRanked.body')}</RNText>
      <View style={howStyles.modList}>
        {modifiers.map((m) => (
          <View key={m.key} style={howStyles.modRow}>
            <RNText
              style={[
                howStyles.delta,
                { color: m.positive ? '#43A047' : '#E53935' },
              ]}
            >
              {m.delta}
            </RNText>
            <RNText style={howStyles.modLabel}>
              {t(m.key as Parameters<typeof t>[0])}
            </RNText>
          </View>
        ))}
      </View>
    </View>
  );
}

const howStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom:     16,
    backgroundColor:  '#F9FAFB',
    borderRadius:     10,
    padding:          16,
    gap:              10,
  },
  body: {
    fontSize:   13,
    color:      '#555',
    lineHeight: 20,
  },
  modList: { gap: 6 },
  modRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  delta: {
    fontSize:   14,
    fontWeight: '700',
    minWidth:   40,
    textAlign:  'auto',
  },
  modLabel: {
    fontSize: 13,
    color:    '#444',
    flex:     1,
  },
});

// ─── Tips list ────────────────────────────────────────────────────────────────

interface TipsListProps {
  tips: string[];
}

function TipsList({ tips }: TipsListProps): ReactElement {
  return (
    <View style={tipsStyles.container}>
      {tips.map((tipKey) => (
        <View key={tipKey} style={tipsStyles.row}>
          <RNText style={tipsStyles.bullet}>•</RNText>
          <RNText style={tipsStyles.text}>
            {t(tipKey as Parameters<typeof t>[0])}
          </RNText>
        </View>
      ))}
    </View>
  );
}

const tipsStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom:     16,
    backgroundColor:  '#FFF8E1',
    borderRadius:     10,
    padding:          14,
    gap:              8,
  },
  row: {
    flexDirection: 'row',
    gap:           8,
    alignItems:    'flex-start',
  },
  bullet: { fontSize: 16, color: '#F5A623', lineHeight: 20 },
  text:   { fontSize: 13, color: '#555',    lineHeight: 20, flex: 1 },
});

// ─── Shared helpers ────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }): ReactElement {
  return (
    <RNText style={styles.sectionTitle}>{title}</RNText>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return '#43A047'; // green
  if (score >= 40) return '#F5A623'; // amber
  return '#E53935';                   // red
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  content: { paddingTop: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  screenTitle: {
    fontSize:        22,
    fontWeight:      '700',
    color:           '#111',
    marginHorizontal: 16,
    marginBottom:    4,
  },
  computedAt: {
    fontSize:        12,
    color:           '#AAA',
    marginHorizontal: 16,
    marginBottom:    8,
  },
  sectionTitle: {
    fontSize:        16,
    fontWeight:      '700',
    color:           '#333',
    marginHorizontal: 16,
    marginTop:       20,
    marginBottom:    10,
  },
  emptyText: {
    fontSize:        13,
    color:           '#AAA',
    marginHorizontal: 16,
    marginBottom:    8,
  },
  errorText: { fontSize: 14, color: '#E53935', textAlign: 'center' },
  retryBtn: {
    marginTop:         16,
    paddingHorizontal: 24,
    paddingVertical:   10,
    backgroundColor:   '#F0F4FF',
    borderRadius:      8,
  },
  retryText: { fontSize: 14, color: '#1976D2', fontWeight: '600' },
  bottomSpacer: { height: 40 },
});

