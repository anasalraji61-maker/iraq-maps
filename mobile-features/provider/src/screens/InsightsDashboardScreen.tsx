/**
 * Provider Insights Dashboard — top keywords, peak hours, source breakdown, conversion rate.
 */
import { providerInsightsContract, type ProviderInsights, type ProviderInsightsDateRange } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
import { initClient } from '@ts-rest/core';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
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
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const COLOR_GREEN = '#10B981';
const COLOR_AMBER = '#F59E0B';
const RANGES: ProviderInsightsDateRange[] = ['7d', '30d', '90d'];
const RANGE_LABELS: Record<ProviderInsightsDateRange, string> = {
  '7d': 'insights.range7d',
  '30d': 'insights.range30d',
  '90d': 'insights.range90d',
};

function useInsightsApi() {
  const baseUrl = useApiBaseUrl();
  useApi();
  return useMemo(() => initClient(providerInsightsContract, { baseUrl, baseHeaders: {} }), [baseUrl]);
}

function SectionCard({ title, children }: { title: string; children: ReactElement }): ReactElement {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }): ReactElement {
  const pct = max > 0 ? value / max : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

function KeywordsSection({ keywords }: { keywords: ProviderInsights['topKeywords'] }): ReactElement {
  const max = keywords[0]?.count ?? 1;
  return (
    <SectionCard title={t('insights.topKeywords')}>
      <View style={{ gap: 6 }}>
        {keywords.length === 0 ? (
          <Text style={styles.noData}>{t('insights.noData')}</Text>
        ) : (
          keywords.slice(0, 8).map((kw) => (
            <BarRow key={kw.keyword} label={kw.keyword} value={kw.count} max={max} color={PRIMARY} />
          ))
        )}
      </View>
    </SectionCard>
  );
}

function PeakHoursSection({ hours }: { hours: ProviderInsights['peakHours'] }): ReactElement {
  const max = hours.reduce((m, h) => Math.max(m, h.count), 1);
  return (
    <SectionCard title={t('insights.peakHours')}>
      <View style={{ gap: 4 }}>
        {hours.length === 0 ? (
          <Text style={styles.noData}>{t('insights.noData')}</Text>
        ) : (
          hours.map((h) => (
            <BarRow key={h.hour} label={t('insights.hour', { h: h.hour })} value={h.count} max={max} color='#7C3AED' />
          ))
        )}
      </View>
    </SectionCard>
  );
}

function SourceSection({ breakdown }: { breakdown: ProviderInsights['sourceBreakdown'] }): ReactElement {
  const total = breakdown.mapSearch + breakdown.direct + breakdown.discover;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <SectionCard title={t('insights.sourceBreakdown')}>
      <View style={{ gap: 8 }}>
        {[
          { label: t('insights.mapSearch'), value: breakdown.mapSearch, color: PRIMARY },
          { label: t('insights.direct'), value: breakdown.direct, color: COLOR_GREEN },
          { label: t('insights.discover'), value: breakdown.discover, color: COLOR_AMBER },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.sourceRow}>
            <View style={[styles.sourceColor, { backgroundColor: color }]} />
            <Text style={styles.sourceLabel}>{label}</Text>
            <Text style={styles.sourceValue}>{value} ({pct(value)}%)</Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

function ConversionSection({ rate }: { rate: number | null }): ReactElement {
  return (
    <SectionCard title={t('insights.conversionRate')}>
      <View style={styles.conversionBox}>
        {rate === null ? (
          <Text style={styles.noData}>{t('insights.noData')}</Text>
        ) : (
          <>
            <Text style={styles.conversionPct}>{Math.round(rate * 100)}%</Text>
            <View style={styles.conversionBar}>
              <View style={[styles.conversionFill, { width: `${Math.round(rate * 100)}%` }]} />
            </View>
          </>
        )}
      </View>
    </SectionCard>
  );
}

export function InsightsDashboardScreen({ providerId }: { providerId: string }): ReactElement {
  const api = useInsightsApi();
  const [range, setRange] = useState<ProviderInsightsDateRange>('30d');
  const [insights, setInsights] = useState<ProviderInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (r: ProviderInsightsDateRange, refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.get({ params: { providerId: providerId as any }, query: { range: r } });
      if (res.status === 200) setInsights(res.body);
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [api, providerId]);

  useEffect(() => { void load(range); }, [load, range]);

  const handleRangeChange = useCallback((r: ProviderInsightsDateRange) => {
    setRange(r);
    void load(r);
  }, [load]);

  return (
    <Screen>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(range, true)} />}
        >
          <Text style={styles.screenTitle}>{t('insights.title')}</Text>

          {/* Date range tabs */}
          <View style={styles.rangeRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}
                onPress={() => handleRangeChange(r)}
              >
                <Text style={[styles.rangeBtnText, range === r && styles.rangeBtnTextActive]}>
                  {t(RANGE_LABELS[r] as Parameters<typeof t>[0])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <Text style={styles.loadingText}>{t('dashboard.status')}</Text>
          ) : insights ? (
            <>
              <KeywordsSection keywords={insights.topKeywords} />
              <PeakHoursSection hours={insights.peakHours} />
              <SourceSection breakdown={insights.sourceBreakdown} />
              <ConversionSection rate={insights.conversionRate} />
            </>
          ) : (
            <Text style={styles.noData}>{t('insights.noData')}</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { padding: 16, gap: 12 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  rangeBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0' },
  rangeBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  rangeBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  rangeBtnTextActive: { color: '#FFF' },
  sectionCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 70, fontSize: 12, color: '#555' },
  barTrack: { flex: 1, height: 10, backgroundColor: '#EEE', borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { width: 30, fontSize: 12, color: '#333', textAlign: 'center' },
  noData: { color: '#AAA', fontStyle: 'italic', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceColor: { width: 12, height: 12, borderRadius: 6 },
  sourceLabel: { flex: 1, fontSize: 13, color: '#333' },
  sourceValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  conversionBox: { alignItems: 'center', gap: 8 },
  conversionPct: { fontSize: 36, fontWeight: '800', color: PRIMARY },
  conversionBar: { width: '100%', height: 12, backgroundColor: '#EEE', borderRadius: 6, overflow: 'hidden' },
  conversionFill: { height: '100%', backgroundColor: PRIMARY, borderRadius: 6 },
  loadingText: { textAlign: 'center', marginTop: 40, color: '#888' },
});
