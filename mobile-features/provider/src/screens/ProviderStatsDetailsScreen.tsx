/**
 * ProviderStatsDetailsScreen — hourly (today) and daily (7-day) breakdown of
 * views, clicks and inquiries.
 *
 * Data comes from the existing inquiry inbox + discover feed (same approach as
 * the analytics cards on the dashboard). Hourly breakdown is derived from
 * items whose createdAt is today; daily from the last 7 days.
 */
import { useApi } from '@iraq-maps/mobile-kit';
import { Screen, Text } from '@iraq-maps/ui';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { t } from '../strings';
import { useMessagingApi } from '../messaging-api';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Mini bar-chart ───────────────────────────────────────────────────────────

interface BarData {
  label: string;
  value: number;
}

function MiniBarChart({
  data,
  color,
}: {
  data: BarData[];
  color: string;
}): ReactElement {
  if (data.length === 0) {
    return <RNText style={styles.noData}>{t('stats.noData')}</RNText>;
  }
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barW = Math.floor(((SCREEN_W - 64) / data.length) - 4);
  const chartH = 80;

  return (
    <View style={styles.chartWrap}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH, gap: 4 }}>
        {data.map((d) => {
          const h = Math.max(2, (d.value / maxVal) * chartH);
          return (
            <View key={d.label} style={{ alignItems: 'center', flex: 1 }}>
              {d.value > 0 && (
                <RNText style={[styles.barCount, { color }]}>{d.value}</RNText>
              )}
              <View
                style={[
                  styles.bar,
                  { height: h, backgroundColor: color, width: Math.max(barW, 6) },
                ]}
                testID={`bar-${d.label}`}
              />
              <RNText style={styles.barLabel} numberOfLines={1}>{d.label}</RNText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

interface StatsState {
  inquiryHourly: BarData[];   // 0–23 h, today
  inquiryDaily: BarData[];    // last 7 days
  totalInquiries: number;
  avgPerDay: number;
}

export function ProviderStatsDetailsScreen(): ReactElement {
  const api = useApi();
  const messagingApi = useMessagingApi();
  const [stats, setStats] = useState<StatsState | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await messagingApi.listProviderInquiries({ query: {} });
      if (res.status !== 200) return;

      const items = res.body.items;
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      // Hourly buckets for today (0–23)
      const hourly: number[] = Array(24).fill(0);
      // Daily buckets: index 0 = 6 days ago, index 6 = today
      const daily: number[] = Array(7).fill(0);

      for (const inq of items) {
        const d = new Date(inq.createdAt);
        const dateStr = d.toISOString().slice(0, 10);

        // Daily
        const todayMs = new Date(todayStr).getTime();
        const diffDays = Math.round((todayMs - new Date(dateStr).getTime()) / 86_400_000);
        if (diffDays >= 0 && diffDays < 7) {
          daily[6 - diffDays] = (daily[6 - diffDays] ?? 0) + 1;
        }

        // Hourly (only today)
        if (dateStr === todayStr) {
          hourly[d.getHours()] = (hourly[d.getHours()] ?? 0) + 1;
        }
      }

      // Build label arrays
      const hourlyData: BarData[] = Array.from({ length: 24 }, (_, h) => ({
        label: `${h}`,
        value: hourly[h] ?? 0,
      }));

      const dailyData: BarData[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { label: `${d.getMonth() + 1}/${d.getDate()}`, value: daily[i] ?? 0 };
      });

      const total = items.length;
      const avgPerDay = Math.round(daily.reduce((a, b) => a + b, 0) / 7);

      setStats({ inquiryHourly: hourlyData, inquiryDaily: dailyData, totalInquiries: total, avgPerDay });
    } finally {
      setLoading(false);
    }
  }, [api, messagingApi]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <Screen><ActivityIndicator style={{ marginTop: 40 }} /></Screen>;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="title">{t('stats.title')}</Text>

        {stats && (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <RNText style={styles.summaryValue}>{stats.totalInquiries}</RNText>
                <RNText style={styles.summaryLabel}>{t('stats.total', { n: stats.totalInquiries })}</RNText>
              </View>
              <View style={styles.summaryCard}>
                <RNText style={styles.summaryValue}>{stats.avgPerDay}</RNText>
                <RNText style={styles.summaryLabel}>{t('stats.avgPerDay', { n: stats.avgPerDay })}</RNText>
              </View>
            </View>

            <View style={styles.section}>
              <RNText style={styles.sectionTitle}>{t('stats.daily')}</RNText>
              <MiniBarChart data={stats.inquiryDaily} color="#1976D2" />
            </View>

            <View style={styles.section}>
              <RNText style={styles.sectionTitle}>{t('stats.hourly')}</RNText>
              <MiniBarChart data={stats.inquiryHourly} color="#E65100" />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  section: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEE',
    gap: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#333', textAlign: 'auto' },
  chartWrap: { overflow: 'hidden' },
  bar: { borderRadius: 2 },
  barLabel: { fontSize: 9, color: '#999', marginTop: 2, textAlign: 'center' },
  barCount: { fontSize: 9, fontWeight: '700', marginBottom: 1, textAlign: 'center' },
  noData: { fontSize: 13, color: '#BBB', textAlign: 'auto' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: { fontSize: 28, fontWeight: '700', color: '#1565C0' },
  summaryLabel: { fontSize: 12, color: '#1976D2', textAlign: 'center' },
});
