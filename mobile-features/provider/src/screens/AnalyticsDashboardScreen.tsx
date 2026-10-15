/**
 * AnalyticsDashboardScreen — full business intelligence dashboard for providers.
 * Shows overview KPIs, line/bar/pie charts, heatmap, conversion funnel,
 * customer demographics and review trend.
 */
import { Screen } from '@iraq-maps/ui';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from '../components/charts/BarChart';
import { HeatmapGrid, type HeatmapCell } from '../components/charts/HeatmapGrid';
import { LineChart, type LineChartDataPoint } from '../components/charts/LineChart';
import { PieChart, type PieSlice } from '../components/charts/PieChart';
import { SkeletonBlock } from '../skeleton';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  primary: '#1976D2',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#7C3AED',
  teal: '#0891B2',
  bg: '#F5F5F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#666666',
  muted: '#AAAAAA',
  border: '#E0E0E0',
};

type DateRange = '7d' | '30d' | '90d' | 'custom';

// ─── Mock data generators ─────────────────────────────────────────────────────
function makeViewsData(days: number): LineChartDataPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    label: `${i + 1}`,
    value: Math.floor(40 + Math.random() * 120 + Math.sin(i / 3) * 30),
  }));
}

function makeHeatmapData(): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const base = hour >= 9 && hour <= 21 ? 30 : 3;
      const weekend = day === 4 || day === 5 ? 1.5 : 1;
      cells.push({ day, hour, value: Math.floor((base + Math.random() * 40) * weekend) });
    }
  }
  return cells;
}

function makeSourceSlices(): PieSlice[] {
  return [
    { label: t('analytics.sourceMap'), value: 420, color: C.primary },
    { label: t('analytics.sourceSearch'), value: 280, color: C.green },
    { label: t('analytics.sourceDiscover'), value: 160, color: C.amber },
    { label: t('analytics.sourceDirect'), value: 90, color: C.purple },
  ];
}

function makeWeekdayBarData(): Array<{ label: string; value: number; color?: string }> {
  const labels = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  return labels.map((label) => ({
    label,
    value: Math.floor(50 + Math.random() * 150),
    color: C.primary,
  }));
}

interface OverviewStats {
  views: number; viewsDelta: number;
  clicks: number; clicksDelta: number;
  messages: number; messagesDelta: number;
  bookings: number; bookingsDelta: number;
}

function mockStats(range: DateRange): OverviewStats {
  const multiplier = range === '7d' ? 1 : range === '30d' ? 4.2 : 12;
  return {
    views: Math.floor(950 * multiplier),
    viewsDelta: 12.4,
    clicks: Math.floor(210 * multiplier),
    clicksDelta: -3.1,
    messages: Math.floor(87 * multiplier),
    messagesDelta: 22.0,
    bookings: Math.floor(34 * multiplier),
    bookingsDelta: 8.7,
  };
}

interface ReviewTrendPoint { label: string; value: number }
function makeReviewTrend(): ReviewTrendPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}`,
    value: parseFloat((4.0 + Math.random() * 0.8).toFixed(1)),
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function KpiCard({
  label, value, delta, color,
}: { label: string; value: string; delta: number; color: string }): ReactElement {
  const up = delta >= 0;
  return (
    <View style={[styles.kpi, { borderStartColor: color }]}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <View style={styles.kpiDelta}>
        <Text style={[styles.kpiDeltaText, { color: up ? C.green : C.red }]}>
          {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

function KpiSkeleton(): ReactElement {
  return (
    <View style={styles.kpiRow}>
      {[1, 2, 3, 4].map((k) => (
        <View key={k} style={[styles.kpi, { borderStartColor: C.border }]}>
          <SkeletonBlock width={48} height={20} />
          <SkeletonBlock width={56} height={12} />
          <SkeletonBlock width={36} height={11} />
        </View>
      ))}
    </View>
  );
}

function FunnelBar({ label, value, max, color, pct }: {
  label: string; value: number; max: number; color: string; pct: number;
}): ReactElement {
  const ratio = max > 0 ? value / max : 0;
  return (
    <View style={styles.funnelRow}>
      <Text style={styles.funnelLabel}>{label}</Text>
      <View style={styles.funnelTrack}>
        <View style={[styles.funnelFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.funnelValue}>{value}</Text>
      <Text style={[styles.funnelPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function DemographicsSection({ newPct }: { newPct: number }): ReactElement {
  const repeatPct = 100 - newPct;
  return (
    <SectionCard title={t('analytics.demographics')}>
      <>
        <View style={styles.demoRow}>
          <View style={[styles.demoBar, { flex: newPct / 100 as number, backgroundColor: C.primary }]} />
          <View style={[styles.demoBar, { flex: repeatPct / 100 as number, backgroundColor: C.teal }]} />
        </View>
        <View style={styles.demoLegendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: C.primary }]} />
            <Text style={styles.legendText}>{t('analytics.newCustomers')} {newPct}%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: C.teal }]} />
            <Text style={styles.legendText}>{t('analytics.repeatCustomers')} {repeatPct}%</Text>
          </View>
        </View>
      </>
    </SectionCard>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function AnalyticsDashboardScreen({ providerId }: { providerId: string }): ReactElement {
  const [range, setRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data state
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [viewsData, setViewsData] = useState<LineChartDataPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [sourceData, setSourceData] = useState<PieSlice[]>([]);
  const [weekdayData, setWeekdayData] = useState<Array<{ label: string; value: number; color?: string }>>([]);
  const [reviewTrend, setReviewTrend] = useState<ReviewTrendPoint[]>([]);

  const load = useCallback(async (r: DateRange, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    // Simulate network delay
    await new Promise((res) => setTimeout(res, 600));
    const days = r === '7d' ? 7 : r === '30d' ? 30 : 90;
    setStats(mockStats(r));
    setViewsData(makeViewsData(days));
    setHeatmapData(makeHeatmapData());
    setSourceData(makeSourceSlices());
    setWeekdayData(makeWeekdayBarData());
    setReviewTrend(makeReviewTrend());
    if (refresh) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => { void load(range); }, [load, range]);

  const RANGES: DateRange[] = ['7d', '30d', '90d'];
  const RANGE_LABELS: Record<DateRange, string> = {
    '7d': t('analytics.range7d'),
    '30d': t('analytics.range30d'),
    '90d': t('analytics.range90d'),
    custom: t('analytics.rangeCustom'),
  };

  // Funnel
  const funnelViews = stats?.views ?? 0;
  const funnelClicks = stats?.clicks ?? 0;
  const funnelMessages = stats?.messages ?? 0;
  const funnelBookings = stats?.bookings ?? 0;
  const funnelItems = [
    { label: t('analytics.views'), value: funnelViews, color: C.primary, pct: 100 },
    { label: t('analytics.clicks'), value: funnelClicks, color: C.teal, pct: funnelViews > 0 ? Math.round((funnelClicks / funnelViews) * 100) : 0 },
    { label: t('analytics.messages'), value: funnelMessages, color: C.amber, pct: funnelViews > 0 ? Math.round((funnelMessages / funnelViews) * 100) : 0 },
    { label: t('analytics.bookings'), value: funnelBookings, color: C.green, pct: funnelViews > 0 ? Math.round((funnelBookings / funnelViews) * 100) : 0 },
  ];

  return (
    <Screen>
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(range, true)} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.screenTitle}>{t('analytics.title')}</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={() => { /* stub: PDF export */ }}>
              <Text style={styles.exportBtnText}>{t('analytics.exportPdf')}</Text>
            </TouchableOpacity>
          </View>

          {/* Range picker */}
          <View style={styles.rangeRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}
                onPress={() => { setRange(r); void load(r); }}
              >
                <Text style={[styles.rangeBtnText, range === r && styles.rangeBtnTextActive]}>
                  {RANGE_LABELS[r]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* KPI overview */}
          {loading ? (
            <KpiSkeleton />
          ) : stats ? (
            <View style={styles.kpiRow}>
              <KpiCard label={t('analytics.views')} value={String(stats.views)} delta={stats.viewsDelta} color={C.primary} />
              <KpiCard label={t('analytics.clicks')} value={String(stats.clicks)} delta={stats.clicksDelta} color={C.teal} />
              <KpiCard label={t('analytics.messages')} value={String(stats.messages)} delta={stats.messagesDelta} color={C.amber} />
              <KpiCard label={t('analytics.bookings')} value={String(stats.bookings)} delta={stats.bookingsDelta} color={C.green} />
            </View>
          ) : null}

          {/* Views over time */}
          <SectionCard title={t('analytics.viewsOverTime')}>
            <LineChart
              data={viewsData}
              width={340}
              height={160}
              color={C.primary}
              labelStep={Math.ceil(viewsData.length / 6)}
              loading={loading}
            />
          </SectionCard>

          {/* Peak hours heatmap */}
          <SectionCard title={t('analytics.peakHours')}>
            <HeatmapGrid
              data={heatmapData}
              loading={loading}
              cellSize={13}
            />
          </SectionCard>

          {/* Traffic sources */}
          <SectionCard title={t('analytics.trafficSources')}>
            <PieChart
              data={sourceData}
              size={160}
              loading={loading}
              showLegend
            />
          </SectionCard>

          {/* Views by weekday */}
          <SectionCard title={t('analytics.viewsByDay')}>
            <BarChart
              data={weekdayData}
              width={340}
              height={160}
              loading={loading}
              defaultColor={C.primary}
            />
          </SectionCard>

          {/* Conversion funnel */}
          <SectionCard title={t('analytics.conversionFunnel')}>
            <View style={styles.funnelContainer}>
              {funnelItems.map((item, i) => (
                <FunnelBar
                  key={i}
                  label={item.label}
                  value={item.value}
                  max={funnelViews}
                  color={item.color}
                  pct={item.pct}
                />
              ))}
            </View>
          </SectionCard>

          {/* Review score trend */}
          <SectionCard title={t('analytics.reviewTrend')}>
            <LineChart
              data={reviewTrend.map((r) => ({ label: r.label, value: r.value }))}
              width={340}
              height={130}
              color={C.amber}
              loading={loading}
              unit=" ★"
            />
          </SectionCard>

          {/* Customer demographics */}
          <DemographicsSection newPct={62} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  exportBtn: { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  exportBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  rangeBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  rangeBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  rangeBtnText: { fontSize: 13, fontWeight: '600', color: C.sub },
  rangeBtnTextActive: { color: '#FFF' },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: C.card, borderRadius: 10, padding: 10, borderStartWidth: 3, gap: 3 },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 11, color: C.sub },
  kpiDelta: { flexDirection: 'row' },
  kpiDeltaText: { fontSize: 11, fontWeight: '600' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  funnelContainer: { gap: 8 },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  funnelLabel: { width: 56, fontSize: 12, color: C.sub },
  funnelTrack: { flex: 1, height: 12, backgroundColor: '#EEE', borderRadius: 6, overflow: 'hidden' },
  funnelFill: { height: '100%', borderRadius: 6 },
  funnelValue: { width: 36, fontSize: 12, color: C.text, textAlign: 'center', fontWeight: '600' },
  funnelPct: { width: 34, fontSize: 11, textAlign: 'end' as 'left' },
  demoRow: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', gap: 0 },
  demoBar: { height: '100%' },
  demoLegendRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: C.sub },
});
