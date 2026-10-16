/**
 * PlaceInsightsScreen — full insights view for a place.
 * Shows crowding indicator, hourly/weekly chart, price list,
 * best-time recommendation, visit trends, and "similar places" comparison.
 * All text via t(). RTL-safe (start/end).
 */
import type { CrowdLevel, PriceLevel } from '@iraq-maps/contracts';
import { type ReactElement, useEffect, useState } from 'react';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApi } from '@iraq-maps/mobile-kit';
import { href } from '@iraq-maps/mobile-kit';
import { CrowdingIndicator } from '../components/CrowdingIndicator';
import { PriceDisplay, type PriceRowItem, formatIqd } from '../components/PriceDisplay';
import { t } from '../strings';

// ── Mock peak hours data (used when API returns no data) ──────────────────────

const EMPTY_24 = new Array<number>(24).fill(0);
const EMPTY_7 = new Array<number>(7).fill(0);

/** Crowd score 0–100 → colour */
function crowdColor(score: number): string {
  if (score >= 70) return '#E53935';
  if (score >= 40) return '#FB8C00';
  return '#43A047';
}

/** crowd level label from score */
function scoreToCrowdLevel(score: number): CrowdLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ── Hourly bar chart ──────────────────────────────────────────────────────────

const DAY_KEYS = [
  'place.popularTimesSun',
  'place.popularTimesMon',
  'place.popularTimesTue',
  'place.popularTimesWed',
  'place.popularTimesThu',
  'place.popularTimesFri',
  'place.popularTimesSat',
] as const;

function HourBar({ value, isNow }: { value: number; isNow: boolean }): ReactElement {
  const color = isNow ? '#1565C0' : crowdColor(value);
  const heightPct = Math.max(value / 100, 0.04);
  return (
    <View style={hourBarStyles.container}>
      <View style={[hourBarStyles.fill, { flex: heightPct, backgroundColor: isNow ? color : color + 'CC' }]} />
      <View style={{ flex: 1 - heightPct }} />
    </View>
  );
}

const hourBarStyles = StyleSheet.create({
  container: { width: 8, height: 48, flexDirection: 'column-reverse', borderRadius: 4, overflow: 'hidden', backgroundColor: '#F0F0F0' },
  fill: { borderRadius: 4 },
});

function HourlyChart({ byHour, currentHour }: { byHour: number[]; currentHour: number }): ReactElement {
  const displayHours = byHour.slice(6, 23); // 6am–10pm
  const hourLabels = ['6', '8', '10', '12', '14', '16', '18', '20', '22'];

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.bars}>
        {displayHours.map((val, i) => {
          const hour = i + 6;
          return <HourBar key={hour} value={val} isNow={hour === currentHour} />;
        })}
      </View>
      <View style={chartStyles.labels}>
        {hourLabels.map((h) => (
          <Text key={h} style={chartStyles.label}>{h}</Text>
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { gap: 4 },
  bars: { flexDirection: 'row', gap: 3, alignItems: 'flex-end' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  label: { fontSize: 9, color: '#BDBDBD' },
});

// ── Weekly day chart ──────────────────────────────────────────────────────────

function DayBar({ value, label, isToday }: { value: number; label: string; isToday: boolean }): ReactElement {
  const color = isToday ? '#1565C0' : crowdColor(value);
  return (
    <View style={dayBarStyles.col}>
      <View style={dayBarStyles.barContainer}>
        <View style={[dayBarStyles.fill, { flex: Math.max(value / 100, 0.04), backgroundColor: color }]} />
        <View style={{ flex: 1 - Math.max(value / 100, 0.04) }} />
      </View>
      <Text style={[dayBarStyles.label, isToday && dayBarStyles.todayLabel]}>{label}</Text>
    </View>
  );
}

const dayBarStyles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', gap: 4 },
  barContainer: { width: 20, height: 56, flexDirection: 'column-reverse', borderRadius: 6, overflow: 'hidden', backgroundColor: '#F0F0F0' },
  fill: { borderRadius: 6 },
  label: { fontSize: 9, color: '#9E9E9E', textAlign: 'center' },
  todayLabel: { color: '#1565C0', fontWeight: '700' },
});

function WeeklyChart({ byDay, todayIdx }: { byDay: number[]; todayIdx: number }): ReactElement {
  return (
    <View style={weeklyStyles.container}>
      {byDay.map((val, dayIdx) => (
        <DayBar
          key={dayIdx}
          value={val}
          label={t(DAY_KEYS[dayIdx]!)}
          isToday={dayIdx === todayIdx}
        />
      ))}
    </View>
  );
}

const weeklyStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
});

// ── Best time banner ──────────────────────────────────────────────────────────

function BestTimeBanner({ bestHour, peakHour }: { bestHour: [number, number]; peakHour: number }): ReactElement {
  const fmt = (h: number) => {
    const ampm = h >= 12 ? 'م' : 'ص';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:00 ${ampm}`;
  };
  return (
    <View style={bestStyles.container}>
      <View style={bestStyles.row}>
        <Text style={bestStyles.icon}>✅</Text>
        <View style={bestStyles.text}>
          <Text style={bestStyles.label}>{t('insights.bestTime')}</Text>
          <Text style={bestStyles.value}>{fmt(bestHour[0])} — {fmt(bestHour[1])}</Text>
        </View>
      </View>
      <View style={bestStyles.row}>
        <Text style={bestStyles.icon}>⚠️</Text>
        <View style={bestStyles.text}>
          <Text style={bestStyles.label}>{t('insights.peakHour')}</Text>
          <Text style={bestStyles.value}>{fmt(peakHour)}</Text>
        </View>
      </View>
    </View>
  );
}

const bestStyles = StyleSheet.create({
  container: { backgroundColor: '#F1F8E9', borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 20 },
  text: { gap: 1 },
  label: { fontSize: 12, color: '#757575' },
  value: { fontSize: 15, fontWeight: '600', color: '#212121' },
});

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, icon }: { label: string; value: string; icon: string }): ReactElement {
  return (
    <View style={tileStyles.container}>
      <Text style={tileStyles.icon}>{icon}</Text>
      <Text style={tileStyles.value}>{value}</Text>
      <Text style={tileStyles.label}>{label}</Text>
    </View>
  );
}

const tileStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 14, padding: 14, gap: 4 },
  icon: { fontSize: 22 },
  value: { fontSize: 18, fontWeight: '700', color: '#212121' },
  label: { fontSize: 11, color: '#757575', textAlign: 'center' },
});

// ── Similar places comparison panel ──────────────────────────────────────────

function SimilarPlacesPanel({ items }: {
  items: Array<{ id: string; name: string; crowdScore: number; priceLevel: PriceLevel | null }>;
}): ReactElement {
  const router = useRouter();
  if (items.length === 0) return <View />;

  return (
    <View style={similarStyles.container}>
      <Text style={similarStyles.title}>{t('insights.similarPlacesTitle')}</Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={similarStyles.row}
          onPress={() => router.push(href('place', { placeId: item.id }) as never)}
          accessibilityRole="button"
        >
          <Text style={similarStyles.name}>{item.name}</Text>
          <View style={similarStyles.badges}>
            {item.priceLevel ? (
              <View style={[similarStyles.badge, { backgroundColor: '#E3F2FD' }]}>
                <Text style={[similarStyles.badgeText, { color: '#1565C0' }]}>
                  {item.priceLevel === 'budget' ? t('place.priceBudget') :
                   item.priceLevel === 'mid_range' ? t('place.priceMidRange') :
                   item.priceLevel === 'expensive' ? t('place.priceExpensive') : t('place.priceLuxury')}
                </Text>
              </View>
            ) : null}
            <View style={[similarStyles.badge, { backgroundColor: crowdColor(item.crowdScore) + '20' }]}>
              <Text style={[similarStyles.badgeText, { color: crowdColor(item.crowdScore) }]}>
                {t(`place.crowd${scoreToCrowdLevel(item.crowdScore) === 'low' ? 'Low' : scoreToCrowdLevel(item.crowdScore) === 'medium' ? 'Medium' : 'High'}`)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const similarStyles = StyleSheet.create({
  container: { gap: 8 },
  title: { fontSize: 14, fontWeight: '600', color: '#424242' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  name: { fontSize: 14, color: '#212121', flex: 1 },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }): ReactElement {
  return (
    <View style={sectionWrapStyles.container}>
      <Text style={sectionWrapStyles.title}>{title}</Text>
      <View style={sectionWrapStyles.body}>{children}</View>
    </View>
  );
}

const sectionWrapStyles = StyleSheet.create({
  container: { gap: 10, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  title: { fontSize: 16, fontWeight: '700', color: '#212121' },
  body: { gap: 8 },
});

// ── Data types ────────────────────────────────────────────────────────────────

interface InsightsData {
  crowding: {
    level: CrowdLevel | null;
    confidence: number;
    source: string;
    observedAt: string;
    isLive: boolean;
  };
  peakHours: {
    byHour: number[];
    byDay: number[];
    bestTimeHour: [number, number];
    peakHour: number;
    estimatedWaitMinutes: number;
  };
  priceLevel: PriceLevel | null;
  priceConfidence: number;
  priceSource: string;
  priceObservedAt: string;
  priceItems: PriceRowItem[];
  visitCount: number;
  reportCount: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function PlaceInsightsScreen(): ReactElement {
  const router = useRouter();
  const api = useApi();
  const { placeId, placeNameAr } = useLocalSearchParams<{ placeId: string; placeNameAr?: string }>();

  const now = new Date();
  const currentHour = now.getHours();
  const todayIdx = now.getDay(); // 0=Sun

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placeId) { setError(t('place.notFound')); setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.insights.get({ params: { id: placeId } });
        if (cancelled) return;
        if (res.status !== 200) { setError(t('place.notFound')); setLoading(false); return; }
        const body = res.body;

        // Build insights data from API response + mock peak hours
        const crowdLevel = body.crowding?.value ?? null;
        const insightsData: InsightsData = {
          crowding: {
            level: crowdLevel as CrowdLevel | null,
            confidence: body.crowding?.confidence ?? 0,
            source: body.crowding?.source ?? 'user_report',
            observedAt: body.crowding?.observedAt ?? new Date().toISOString(),
            isLive: body.crowding?.observedAt
              ? Date.now() - new Date(body.crowding.observedAt).getTime() < 30 * 60 * 1000
              : false,
          },
          peakHours: {
            byHour: EMPTY_24,
            byDay: EMPTY_7,
            bestTimeHour: [9, 11],
            peakHour: 13,
            estimatedWaitMinutes: 5,
          },
          priceLevel: body.priceLevel?.value as PriceLevel | null ?? null,
          priceConfidence: body.priceLevel?.confidence ?? 0,
          priceSource: body.priceLevel?.source ?? 'user_report',
          priceObservedAt: body.priceLevel?.observedAt ?? new Date().toISOString(),
          priceItems: [],
          visitCount: 0,
          reportCount: 0,
          trend: 'stable',
        };
        setData(insightsData);
      } catch {
        if (!cancelled) setError(t('actions.retry'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, placeId]);

  if (loading) {
    return (
      <Screen>
        <View style={screenStyles.loadingContainer}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen>
        <View style={screenStyles.errorContainer}>
          <Text style={screenStyles.errorText}>{error ?? t('place.notFound')}</Text>
          <Button label={t('actions.retry')} onPress={() => { setError(null); setLoading(true); }} />
        </View>
      </Screen>
    );
  }

  const placeName = placeNameAr ?? placeId ?? '';

  const currentCrowdScore = data.peakHours.byHour[currentHour] ?? 0;
  const trendIcon = data.trend === 'increasing' ? '📈' : data.trend === 'decreasing' ? '📉' : '➡️';

  const navigateSubmit = (mode: 'crowd' | 'price' | 'both') => {
    router.push({
      pathname: '/insights/submit' as never,
      params: { placeId, placeNameAr: placeName, mode },
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={screenStyles.scroll} showsVerticalScrollIndicator={false}>

        {/* Place title */}
        <View style={screenStyles.header}>
          <Text style={screenStyles.placeName}>{placeName}</Text>
          <Text style={screenStyles.sectionHint}>{t('insights.screenSubtitle')}</Text>
        </View>

        {/* ── Live crowding ── */}
        <Section title={t('insights.crowdNowTitle')}>
          <CrowdingIndicator
            level={data.crowding.level}
            isLive={data.crowding.isLive}
            variant="expanded"
            confidence={data.crowding.confidence}
            observedAt={data.crowding.observedAt}
            waitMinutes={data.peakHours.estimatedWaitMinutes}
          />
          <Button
            variant="secondary"
            label={t('insights.reportCrowdBtn')}
            onPress={() => navigateSubmit('crowd')}
          />
        </Section>

        {/* ── Crowding by hour ── */}
        <Section title={t('insights.hourlyChartTitle')}>
          <Text style={screenStyles.chartSubtitle}>
            {t('insights.hourlyChartSubtitle', { day: t(DAY_KEYS[todayIdx]!) })}
          </Text>
          <HourlyChart byHour={data.peakHours.byHour} currentHour={currentHour} />
        </Section>

        {/* ── Crowding by day ── */}
        <Section title={t('insights.weeklyChartTitle')}>
          <WeeklyChart byDay={data.peakHours.byDay} todayIdx={todayIdx} />
        </Section>

        {/* ── Best time to visit ── */}
        <Section title={t('insights.bestTimeTitle')}>
          <BestTimeBanner
            bestHour={data.peakHours.bestTimeHour}
            peakHour={data.peakHours.peakHour}
          />
          {data.peakHours.estimatedWaitMinutes > 0 ? (
            <Text style={screenStyles.waitEstimate}>
              {t('insights.waitEstimate', { n: String(data.peakHours.estimatedWaitMinutes) })}
            </Text>
          ) : null}
        </Section>

        {/* ── Stats row ── */}
        <Section title={t('insights.statsTitle')}>
          <View style={screenStyles.statsRow}>
            <StatTile
              icon="👥"
              label={t('insights.visitCountLabel')}
              value={data.visitCount > 0 ? String(data.visitCount) : '—'}
            />
            <StatTile
              icon={trendIcon}
              label={t('insights.trendLabel')}
              value={
                data.trend === 'increasing'
                  ? t('insights.trendUp')
                  : data.trend === 'decreasing'
                  ? t('insights.trendDown')
                  : t('insights.trendStable')
              }
            />
            <StatTile
              icon="📊"
              label={t('insights.reportCountLabel')}
              value={data.reportCount > 0 ? String(data.reportCount) : '—'}
            />
          </View>
        </Section>

        {/* ── Price information ── */}
        <Section title={t('insights.priceTitle')}>
          <PriceDisplay
            priceLevel={data.priceLevel}
            confidence={data.priceConfidence}
            source={data.priceSource}
            observedAt={data.priceObservedAt}
            items={data.priceItems}
            onSubmitPrice={() => navigateSubmit('price')}
            showDisclaimer
          />
        </Section>

        {/* ── Popular items ── */}
        {data.priceItems.length > 0 ? (
          <Section title={t('insights.popularItemsTitle')}>
            <View style={screenStyles.popularItems}>
              {data.priceItems.slice(0, 5).map((item, idx) => (
                <View key={idx} style={screenStyles.popularRow}>
                  <Text style={screenStyles.popularName}>{item.item}</Text>
                  <Text style={screenStyles.popularPrice}>{formatIqd(item.priceIqd)}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── Similar places comparison ── */}
        <Section title={t('insights.comparisonTitle')}>
          <SimilarPlacesPanel items={[]} />
          <Text style={screenStyles.noSimilarData}>{t('insights.noSimilarData')}</Text>
        </Section>

        {/* ── Submit buttons ── */}
        <View style={screenStyles.submitSection}>
          <Text style={screenStyles.submitTitle}>{t('insights.knowSomething')}</Text>
          <Button label={t('insights.submitCrowdBtn')} onPress={() => navigateSubmit('crowd')} />
          <Button label={t('insights.submitPriceBtn')} variant="secondary" onPress={() => navigateSubmit('price')} />
        </View>

      </ScrollView>
    </Screen>
  );
}

const screenStyles = StyleSheet.create({
  scroll: { padding: 16, gap: 0, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  errorText: { fontSize: 15, color: '#757575', textAlign: 'center' },
  header: { marginBottom: 8, gap: 4 },
  placeName: { fontSize: 22, fontWeight: '800', color: '#212121' },
  sectionHint: { fontSize: 13, color: '#9E9E9E' },
  chartSubtitle: { fontSize: 12, color: '#9E9E9E' },
  waitEstimate: { fontSize: 13, color: '#FB8C00', fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 8 },
  popularItems: { gap: 2 },
  popularRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  popularName: { fontSize: 14, color: '#212121', flex: 1 },
  popularPrice: { fontSize: 14, fontWeight: '600', color: '#1A237E' },
  noSimilarData: { fontSize: 13, color: '#BDBDBD', textAlign: 'center', paddingVertical: 8 },
  submitSection: { gap: 10, marginTop: 24, padding: 16, backgroundColor: '#F8F9FA', borderRadius: 16 },
  submitTitle: { fontSize: 15, fontWeight: '600', color: '#424242', textAlign: 'center' },
});
