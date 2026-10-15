import { type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

/** Mock crowd-level data: 24 hourly values (0–100) per weekday index (0=Mon). */
const MOCK_TIMES: number[][] = [
  // Mon
  [0,0,0,0,0,0,5,20,45,60,55,50,65,70,60,55,50,45,40,30,20,15,5,0],
  // Tue
  [0,0,0,0,0,0,5,25,50,65,60,55,70,75,65,60,55,50,45,35,25,15,5,0],
  // Wed
  [0,0,0,0,0,0,5,20,40,55,50,45,60,65,55,50,45,40,35,30,20,10,5,0],
  // Thu
  [0,0,0,0,0,0,5,25,55,70,65,60,75,80,70,65,60,55,50,40,30,20,10,0],
  // Fri — busiest day
  [0,0,0,0,0,0,10,30,60,80,85,80,75,70,85,90,85,80,70,60,45,30,15,5],
  // Sat
  [0,0,0,0,0,0,5,15,35,55,60,65,70,65,60,65,70,65,55,45,35,20,10,0],
  // Sun
  [0,0,0,0,0,0,5,10,25,40,45,40,50,55,45,40,35,30,25,20,15,10,5,0],
];

const DAY_KEYS = [
  'place.popularTimesMon',
  'place.popularTimesTue',
  'place.popularTimesWed',
  'place.popularTimesThu',
  'place.popularTimesFri',
  'place.popularTimesSat',
  'place.popularTimesSun',
] as const;

const HOUR_LABELS = ['6', '9', '12', '15', '18', '21'] as const;

function Bar({ value }: { value: number }): ReactElement {
  const heightPct = value / 100;
  const color = value > 70 ? '#EF5350' : value > 40 ? '#FFA726' : '#66BB6A';
  return (
    <View style={barStyles.container}>
      <View style={[barStyles.fill, { flex: heightPct, backgroundColor: color }]} />
      <View style={{ flex: 1 - heightPct }} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { width: 6, height: 40, flexDirection: 'column-reverse', borderRadius: 3, overflow: 'hidden', backgroundColor: '#E0E0E0' },
  fill: { borderRadius: 3 },
});

/** Shows a mock popular-times chart for Mon–Sun.  */
export function PopularTimesSection(): ReactElement {
  const now = new Date();
  // JS getDay(): 0=Sun → map to our 0=Mon
  const todayIdx = (now.getDay() + 6) % 7;
  const currentHour = now.getHours();
  const busyNow = (MOCK_TIMES[todayIdx]?.[currentHour] ?? 0) > 50;

  return (
    <View style={styles.container} testID="place.popularTimes">
      <Text style={styles.title}>{t('place.popularTimes')}</Text>
      <Text style={styles.subtitle}>
        {busyNow ? t('place.popularTimesBusyNow') : t('place.popularTimesQuiet')}
      </Text>
      <View style={styles.dayRow}>
        {MOCK_TIMES.map((hours, dayIdx) => (
          <View key={dayIdx} style={[styles.dayCol, dayIdx === todayIdx && styles.todayCol]}>
            <View style={styles.bars}>
              {hours.filter((_, hi) => hi >= 6 && hi <= 22).map((val, i) => (
                <Bar key={i} value={val} />
              ))}
            </View>
            <Text style={[styles.dayLabel, dayIdx === todayIdx && styles.todayLabel]}>
              {t(DAY_KEYS[dayIdx]!)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.hourRow}>
        {HOUR_LABELS.map((h) => (
          <Text key={h} style={styles.hourLabel}>{h}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, gap: 4 },
  title: { fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 12, color: '#757575', marginBottom: 4 },
  dayRow: { flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
  dayCol: { flex: 1, alignItems: 'center', gap: 4 },
  todayCol: { opacity: 1 },
  bars: { flexDirection: 'row', gap: 1, alignItems: 'flex-end' },
  dayLabel: { fontSize: 9, color: '#9E9E9E', textAlign: 'center' },
  todayLabel: { color: '#1565C0', fontWeight: '700' },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 2 },
  hourLabel: { fontSize: 9, color: '#BDBDBD' },
});
