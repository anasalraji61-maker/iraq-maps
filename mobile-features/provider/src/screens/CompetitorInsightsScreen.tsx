/**
 * CompetitorInsightsScreen — anonymous market benchmark comparison for providers.
 */
import { Screen } from '@iraq-maps/ui';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SkeletonBlock } from '../skeleton';
import { t } from '../strings';

I18nManager.forceRTL(true);

const C = {
  primary: '#1976D2',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#7C3AED',
  bg: '#F5F5F5',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#666666',
  muted: '#AAAAAA',
  border: '#E0E0E0',
  you: '#1976D2',
  market: '#9CA3AF',
};

interface BenchmarkMetric {
  label: string;
  yourValue: number;
  marketAvg: number;
  unit: string;
  higherIsBetter: boolean;
  format?: (v: number) => string;
}

interface MarketData {
  yourRating: number;
  marketRating: number;
  yourResponseTimeMin: number;
  marketResponseTimeMin: number;
  yourPriceIndex: number;   // 1=budget … 4=luxury
  marketPriceIndex: number;
  yourRank: number;
  marketSize: number;
  tips: string[];
  positionLabel: string;
}

function mockMarketData(): MarketData {
  return {
    yourRating: 4.3,
    marketRating: 4.1,
    yourResponseTimeMin: 18,
    marketResponseTimeMin: 42,
    yourPriceIndex: 2,
    marketPriceIndex: 2.5,
    yourRank: 4,
    marketSize: 38,
    tips: [
      t('competitor.tip1'),
      t('competitor.tip2'),
      t('competitor.tip3'),
      t('competitor.tip4'),
    ],
    positionLabel: t('competitor.positionAboveAvg'),
  };
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

function CompareBar({ label, yours, market, unit, higherIsBetter }: {
  label: string; yours: number; market: number; unit: string; higherIsBetter: boolean;
}): ReactElement {
  const max = Math.max(yours, market, 1);
  const youW = (yours / max) * 100;
  const mktW = (market / max) * 100;
  const youWin = higherIsBetter ? yours >= market : yours <= market;
  return (
    <View style={styles.compareRow}>
      <Text style={styles.compareLabel}>{label}</Text>
      <View style={styles.compareBars}>
        {/* Your bar */}
        <View style={styles.barLineRow}>
          <Text style={styles.barLineLegend}>{t('competitor.you')}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${youW}%`, backgroundColor: youWin ? C.green : C.red }]} />
          </View>
          <Text style={[styles.barLineValue, { color: youWin ? C.green : C.red }]}>
            {yours}{unit}
          </Text>
        </View>
        {/* Market bar */}
        <View style={styles.barLineRow}>
          <Text style={styles.barLineLegend}>{t('competitor.market')}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${mktW}%`, backgroundColor: C.market }]} />
          </View>
          <Text style={[styles.barLineValue, { color: C.sub }]}>
            {market}{unit}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PriceIndexDots({ value, max = 4 }: { value: number; max?: number }): ReactElement {
  return (
    <View style={styles.priceDots}>
      {Array.from({ length: max }, (_, i) => (
        <View
          key={i}
          style={[
            styles.priceDot,
            { backgroundColor: i < Math.round(value) ? C.primary : C.border },
          ]}
        />
      ))}
    </View>
  );
}

function MarketPositionGauge({ rank, total }: { rank: number; total: number }): ReactElement {
  const pct = total > 1 ? ((total - rank) / (total - 1)) * 100 : 50;
  const color = pct >= 75 ? C.green : pct >= 40 ? C.amber : C.red;
  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${pct}%`, backgroundColor: color }]} />
        <View style={[styles.gaugeThumb, { start: `${pct}%` as unknown as number, backgroundColor: color }]} />
      </View>
      <View style={styles.gaugeLabels}>
        <Text style={styles.gaugeLabelText}>{t('competitor.lowest')}</Text>
        <Text style={[styles.gaugeRankText, { color }]}>
          {t('competitor.rank', { rank: String(rank), total: String(total) })}
        </Text>
        <Text style={styles.gaugeLabelText}>{t('competitor.highest')}</Text>
      </View>
    </View>
  );
}

function TipCard({ text, index }: { text: string; index: number }): ReactElement {
  const colors = [C.primary, C.green, C.amber, C.purple];
  const color = colors[index % colors.length];
  return (
    <View style={[styles.tipCard, { borderStartColor: color }]}>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function CompetitorInsightsScreen({ providerId }: { providerId: string }): ReactElement {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setData(mockMarketData());
    if (refresh) setRefreshing(false); else setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen>
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <Text style={styles.screenTitle}>{t('competitor.title')}</Text>
          <Text style={styles.screenSubtitle}>{t('competitor.subtitle')}</Text>

          {/* Market position */}
          <SectionCard title={t('competitor.marketPosition')}>
            <>
              {loading || !data ? (
                <>
                  <SkeletonBlock width={200} height={16} />
                  <SkeletonBlock width="100%" height={16} />
                </>
              ) : (
                <>
                  <Text style={styles.positionBadge}>{data.positionLabel}</Text>
                  <MarketPositionGauge rank={data.yourRank} total={data.marketSize} />
                  <Text style={styles.positionNote}>
                    {t('competitor.rankNote', { rank: String(data.yourRank), total: String(data.marketSize) })}
                  </Text>
                </>
              )}
            </>
          </SectionCard>

          {/* Ratings comparison */}
          <SectionCard title={t('competitor.ratingsComparison')}>
            <>
              {loading || !data ? (
                <>
                  <SkeletonBlock width="100%" height={32} />
                  <SkeletonBlock width="100%" height={32} />
                </>
              ) : (
                <CompareBar
                  label={t('competitor.averageRating')}
                  yours={data.yourRating}
                  market={data.marketRating}
                  unit=" ★"
                  higherIsBetter
                />
              )}
            </>
          </SectionCard>

          {/* Response time comparison */}
          <SectionCard title={t('competitor.responseTime')}>
            <>
              {loading || !data ? (
                <>
                  <SkeletonBlock width="100%" height={32} />
                  <SkeletonBlock width="100%" height={32} />
                </>
              ) : (
                <CompareBar
                  label={t('competitor.avgResponseMin')}
                  yours={data.yourResponseTimeMin}
                  market={data.marketResponseTimeMin}
                  unit=" دق"
                  higherIsBetter={false}
                />
              )}
            </>
          </SectionCard>

          {/* Price range comparison */}
          <SectionCard title={t('competitor.priceRange')}>
            <>
              {loading || !data ? (
                <SkeletonBlock width="100%" height={40} />
              ) : (
                <View style={styles.priceCompare}>
                  <View style={styles.priceRow}>
                    <Text style={styles.barLineLegend}>{t('competitor.you')}</Text>
                    <PriceIndexDots value={data.yourPriceIndex} />
                    <Text style={styles.priceLabel}>
                      {data.yourPriceIndex <= 1 ? t('competitor.priceBudget') :
                       data.yourPriceIndex <= 2 ? t('competitor.priceMid') :
                       data.yourPriceIndex <= 3 ? t('competitor.pricePremium') : t('competitor.priceLuxury')}
                    </Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.barLineLegend}>{t('competitor.market')}</Text>
                    <PriceIndexDots value={data.marketPriceIndex} />
                    <Text style={styles.priceLabel}>
                      {data.marketPriceIndex <= 1.5 ? t('competitor.priceBudget') :
                       data.marketPriceIndex <= 2.5 ? t('competitor.priceMid') :
                       data.marketPriceIndex <= 3.5 ? t('competitor.pricePremium') : t('competitor.priceLuxury')}
                    </Text>
                  </View>
                </View>
              )}
            </>
          </SectionCard>

          {/* Tips to improve */}
          <SectionCard title={t('competitor.improvementTips')}>
            <>
              {loading || !data ? (
                <View style={{ gap: 8 }}>
                  {[1, 2, 3].map((k) => <SkeletonBlock key={k} width="100%" height={48} />)}
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {data.tips.map((tip, i) => (
                    <TipCard key={i} text={tip} index={i} />
                  ))}
                </View>
              )}
            </>
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  screenSubtitle: { fontSize: 13, color: C.sub, marginTop: 2, marginBottom: 4 },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  compareRow: { gap: 6 },
  compareLabel: { fontSize: 13, fontWeight: '600', color: C.text },
  compareBars: { gap: 4 },
  barLineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLineLegend: { width: 42, fontSize: 11, color: C.sub },
  barTrack: { flex: 1, height: 12, backgroundColor: '#EEE', borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barLineValue: { width: 40, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  gaugeContainer: { gap: 6 },
  gaugeTrack: { height: 12, backgroundColor: '#EEE', borderRadius: 6, overflow: 'visible', position: 'relative' },
  gaugeFill: { height: '100%', borderRadius: 6 },
  gaugeThumb: { position: 'absolute', top: -3, width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#FFF', marginStart: -9 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gaugeLabelText: { fontSize: 10, color: C.muted },
  gaugeRankText: { fontSize: 13, fontWeight: '700' },
  positionBadge: { fontSize: 15, fontWeight: '700', color: C.green },
  positionNote: { fontSize: 12, color: C.sub },
  priceCompare: { gap: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceDots: { flexDirection: 'row', gap: 4 },
  priceDot: { width: 16, height: 16, borderRadius: 8 },
  priceLabel: { fontSize: 12, color: C.sub },
  tipCard: { backgroundColor: '#F8F9FA', borderRadius: 8, padding: 10, borderStartWidth: 3 },
  tipText: { fontSize: 13, color: C.text, lineHeight: 20 },
});
