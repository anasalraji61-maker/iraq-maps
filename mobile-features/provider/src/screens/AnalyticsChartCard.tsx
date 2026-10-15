/**
 * AnalyticsChartCard — a bar-chart card for the provider dashboard.
 * Shows the last 7 days of a metric using View-based bars (no SVG library).
 * Data is currently seeded from a deterministic pseudo-random function
 * until a backend analytics endpoint is available.
 */
import { type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

const PRIMARY = '#1976D2';
const SUCCESS = '#388E3C';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simple LCG seeded by (providerId + metricKey + day) so the bars look
 * plausible and are stable within the same day.
 */
function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function generateWeekData(providerId: string, metric: string): number[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const seed = `${providerId}:${metric}:${d.toISOString().slice(0, 10)}`;
    return Math.round(seededRandom(seed) * 40 + 2); // 2–42
  });
}

/** Returns the abbreviated day label (Sat, Sun … Fri) in locale-neutral form. */
function dayLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - offset));
  return d.toLocaleDateString('ar', { weekday: 'short' });
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

function Bar({ value, max, color, label, isToday }: {
  value: number;
  max: number;
  color: string;
  label: string;
  isToday: boolean;
}): ReactElement {
  const height = Math.max(4, Math.round((value / max) * 72));
  return (
    <View style={barStyles.col}>
      <Text style={barStyles.value}>{value}</Text>
      <View style={barStyles.track}>
        <View
          style={[barStyles.bar, { height, backgroundColor: isToday ? color : color + '88' }]}
        />
      </View>
      <Text style={[barStyles.day, isToday && barStyles.dayToday]}>{label}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', gap: 2 },
  value: { fontSize: 10, color: '#555', fontVariant: ['tabular-nums'] },
  track: { height: 72, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 18, borderRadius: 4 },
  day: { fontSize: 10, color: '#999' },
  dayToday: { color: '#333', fontWeight: '700' },
});

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface AnalyticsChartCardProps {
  providerId: string;
  metric: 'views' | 'inquiries';
  /** Real 7-day data, index 0 = 6 days ago, index 6 = today. Falls back to seeded mock when absent. */
  data?: number[];
}

export function AnalyticsChartCard({ providerId, metric, data: realData }: AnalyticsChartCardProps): ReactElement {
  const data = realData ?? generateWeekData(providerId, metric);
  const max = Math.max(...data, 1);
  const color = metric === 'views' ? PRIMARY : SUCCESS;
  const total = data.reduce((s, v) => s + v, 0);
  const titleKey = metric === 'views' ? 'analytics.viewsTitle' : 'analytics.inquiriesTitle';
  const totalKey = metric === 'views' ? 'analytics.viewsTotal' : 'analytics.inquiriesTotal';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t(titleKey as never)}</Text>
        <Text style={[styles.total, { color }]}>{t(totalKey as never, { n: total })}</Text>
      </View>
      <View style={styles.chart}>
        {data.map((v, i) => (
          <Bar
            key={i}
            value={v}
            max={max}
            color={color}
            label={dayLabel(i)}
            isToday={i === 6}
          />
        ))}
      </View>
      <Text style={styles.caption}>{t('analytics.last7days')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 13, fontWeight: '700', color: '#333' },
  total: { fontSize: 13, fontWeight: '700' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  caption: { fontSize: 11, color: '#AAA', marginTop: 6, textAlign: 'auto' },
});
