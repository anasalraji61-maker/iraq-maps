/**
 * RouteHistoryScreen — past navigation trips, monthly stats,
 * favourite destinations, map replay stub, export and clear history.
 */
import { Text, tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripRecord {
  id: string;
  originName: string;
  destinationName: string;
  distanceM: number;
  durationS: number;
  startedAt: string;
}

interface FavDestination {
  name: string;
  visits: number;
  lastVisit: string;
}

interface MonthlyStats {
  totalKm: number;
  tripCount: number;
  avgDailyKm: number;
  longestKm: number;
}

export interface RouteHistoryScreenProps {
  onClose?: () => void;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'iraq_maps.trip_history';

async function loadHistory(): Promise<TripRecord[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = require('@react-native-async-storage/async-storage').default as {
      getItem: (k: string) => Promise<string | null>;
    };
    const raw = await AS.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TripRecord[]) : [];
  } catch {
    return [];
  }
}

async function clearHistory(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = require('@react-native-async-storage/async-storage').default as {
      removeItem: (k: string) => Promise<void>;
    };
    await AS.removeItem(HISTORY_KEY);
  } catch {
    // non-fatal
  }
}

// ─── Mock history for dev/demo ─────────────────────────────────────────────────

function mockHistory(): TripRecord[] {
  const now = Date.now();
  return [
    {
      id: 'h1',
      originName: 'البيت',
      destinationName: 'العمل — وزارة الاتصالات',
      distanceM: 12400,
      durationS: 2520,
      startedAt: new Date(now - 2 * 3600000).toISOString(),
    },
    {
      id: 'h2',
      originName: 'العمل',
      destinationName: 'مطعم الدجاج المشوي — الكرادة',
      distanceM: 3200,
      durationS: 840,
      startedAt: new Date(now - 26 * 3600000).toISOString(),
    },
    {
      id: 'h3',
      originName: 'البيت',
      destinationName: 'مول بغداد',
      distanceM: 18700,
      durationS: 3900,
      startedAt: new Date(now - 50 * 3600000).toISOString(),
    },
    {
      id: 'h4',
      originName: 'مول بغداد',
      destinationName: 'البيت',
      distanceM: 18300,
      durationS: 4200,
      startedAt: new Date(now - 46 * 3600000).toISOString(),
    },
    {
      id: 'h5',
      originName: 'البيت',
      destinationName: 'العمل — وزارة الاتصالات',
      distanceM: 12400,
      durationS: 2280,
      startedAt: new Date(now - 74 * 3600000).toISOString(),
    },
    {
      id: 'h6',
      originName: 'العمل',
      destinationName: 'البيت',
      distanceM: 12600,
      durationS: 3060,
      startedAt: new Date(now - 70 * 3600000).toISOString(),
    },
    {
      id: 'h7',
      originName: 'البيت',
      destinationName: 'مستشفى ابن سينا',
      distanceM: 9100,
      durationS: 1980,
      startedAt: new Date(now - 5 * 24 * 3600000).toISOString(),
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (h === 0) return t('active.durationMin', { n: Math.max(1, m) });
  return t('active.durationHourMin', { h, m });
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-IQ', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function computeMonthlyStats(trips: TripRecord[]): MonthlyStats {
  if (trips.length === 0) {
    return { totalKm: 0, tripCount: 0, avgDailyKm: 0, longestKm: 0 };
  }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthTrips = trips.filter((t) => new Date(t.startedAt).getTime() >= monthStart);
  const totalM = monthTrips.reduce((s, t) => s + t.distanceM, 0);
  const longest = Math.max(...trips.map((t) => t.distanceM));
  const dayOfMonth = now.getDate();
  return {
    totalKm: parseFloat((totalM / 1000).toFixed(1)),
    tripCount: monthTrips.length,
    avgDailyKm: parseFloat((totalM / 1000 / Math.max(1, dayOfMonth)).toFixed(1)),
    longestKm: parseFloat((longest / 1000).toFixed(1)),
  };
}

function computeFavDestinations(trips: TripRecord[]): FavDestination[] {
  const map = new Map<string, { visits: number; lastVisit: string }>();
  for (const trip of trips) {
    const prev = map.get(trip.destinationName);
    if (!prev || trip.startedAt > prev.lastVisit) {
      map.set(trip.destinationName, {
        visits: (prev?.visits ?? 0) + 1,
        lastVisit: trip.startedAt,
      });
    } else {
      map.set(trip.destinationName, { ...prev, visits: prev.visits + 1 });
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5);
}

function buildExportText(trips: TripRecord[]): string {
  const lines = trips.map((trip) =>
    `${fmtDateTime(trip.startedAt)} | ${trip.originName} → ${trip.destinationName} | ${fmtDist(trip.distanceM)} | ${fmtDuration(trip.durationS)}`,
  );
  return `سجل رحلاتي — خرائط العراق\n\n${lines.join('\n')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatsTileProps {
  value: string;
  label: string;
  dark: boolean;
}

function StatsTile({ value, label, dark }: StatsTileProps): ReactElement {
  return (
    <View style={[styles.statsTile, dark && styles.statsTileDark]}>
      <Text style={[styles.statsTileValue, dark && styles.textPrimaryDark]}>{value}</Text>
      <Text style={[styles.statsTileLabel, dark && styles.textSecondaryDark]}>{label}</Text>
    </View>
  );
}

interface TripRowProps {
  trip: TripRecord;
  dark: boolean;
}

function TripRow({ trip, dark }: TripRowProps): ReactElement {
  return (
    <View style={[styles.tripRow, dark && styles.tripRowDark]}>
      <View style={[styles.tripIconWrap, dark && styles.tripIconWrapDark]}>
        <Text style={styles.tripIcon}>🚗</Text>
      </View>
      <View style={styles.tripInfo}>
        <RNText style={[styles.tripDest, dark && styles.textPrimaryDark]} numberOfLines={1}>
          {trip.destinationName}
        </RNText>
        <RNText style={[styles.tripOrigin, dark && styles.textSecondaryDark]} numberOfLines={1}>
          {`${trip.originName} →`}
        </RNText>
        <View style={styles.tripMeta}>
          <Text style={[styles.tripMetaText, dark && styles.textSecondaryDark]}>
            {fmtDist(trip.distanceM)}
          </Text>
          <Text style={[styles.tripMetaDot, dark && styles.textSecondaryDark]}>·</Text>
          <Text style={[styles.tripMetaText, dark && styles.textSecondaryDark]}>
            {fmtDuration(trip.durationS)}
          </Text>
          <Text style={[styles.tripMetaDot, dark && styles.textSecondaryDark]}>·</Text>
          <Text style={[styles.tripMetaText, dark && styles.textSecondaryDark]}>
            {fmtDateTime(trip.startedAt)}
          </Text>
        </View>
      </View>
    </View>
  );
}

interface FavDestRowProps {
  dest: FavDestination;
  index: number;
  dark: boolean;
}

function FavDestRow({ dest, index, dark }: FavDestRowProps): ReactElement {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <View style={[styles.favRow, dark && styles.favRowDark]}>
      <Text style={styles.favMedal}>{medals[index] ?? `${index + 1}.`}</Text>
      <View style={styles.favInfo}>
        <RNText style={[styles.favName, dark && styles.textPrimaryDark]} numberOfLines={1}>
          {dest.name}
        </RNText>
        <Text style={[styles.favMeta, dark && styles.textSecondaryDark]}>
          {t('history.visits', { n: dest.visits })}
          {'  ·  '}
          {t('history.date', { date: new Date(dest.lastVisit).toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }) })}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function RouteHistoryScreen({ onClose }: RouteHistoryScreenProps): ReactElement {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async () => {
    const stored = await loadHistory();
    // For demo: if empty, use mock data
    setTrips(stored.length > 0 ? stored : mockHistory());
  }, []);

  useEffect(() => {
    void fetchTrips().finally(() => setLoading(false));
  }, [fetchTrips]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTrips();
    setRefreshing(false);
  }, [fetchTrips]);

  const stats = useMemo(() => computeMonthlyStats(trips), [trips]);
  const favDests = useMemo(() => computeFavDestinations(trips), [trips]);

  const handleExport = useCallback(async () => {
    const text = buildExportText(trips);
    try {
      await Share.share({ message: text });
    } catch {
      // user cancelled
    }
  }, [trips]);

  const handleClear = useCallback(() => {
    Alert.alert(t('history.clearHistory'), t('history.clearConfirm'), [
      { text: t('history.clearNo'), style: 'cancel' },
      {
        text: t('history.clearYes'),
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setTrips([]);
        },
      },
    ]);
  }, []);

  const handleMapReplay = useCallback((_trip: TripRecord) => {
    Alert.alert(t('history.mapReplay'), t('history.mapReplaySoon'), [{ text: 'حسناً' }]);
  }, []);

  if (loading) {
    return (
      <View style={[styles.root, dark && styles.rootDark]}>
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, dark && styles.textSecondaryDark]}>
            {t('traffic.loading')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      {/* Header */}
      <View style={[styles.header, dark && styles.headerDark]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
            <Text style={[styles.closeBtnText, dark && styles.textPrimaryDark]}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, dark && styles.textPrimaryDark]}>
          {t('history.title')}
        </Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Monthly summary */}
        <View style={[styles.monthBanner, dark && styles.monthBannerDark]}>
          <Text style={[styles.monthBannerText, dark && styles.textPrimaryDark]}>
            {t('history.monthlyKm', { km: stats.totalKm })}
          </Text>
          <Text style={[styles.monthBannerSub, dark && styles.textSecondaryDark]}>
            {t('history.tripCount', { n: stats.tripCount })}
          </Text>
        </View>

        {/* Stats tiles */}
        <View style={styles.statsRow}>
          <StatsTile
            value={`${stats.avgDailyKm} كم`}
            label={t('history.avgDaily', { km: '' }).split(':')[0] ?? ''}
            dark={dark}
          />
          <StatsTile
            value={`${stats.longestKm} كم`}
            label={t('history.longestTrip', { km: '' }).split(':')[0] ?? ''}
            dark={dark}
          />
          <StatsTile
            value={String(stats.tripCount)}
            label={t('history.tripCount', { n: '' }).replace('{n} ', '')}
            dark={dark}
          />
        </View>

        {/* Favourite destinations */}
        {favDests.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, dark && styles.textSecondaryDark]}>
              {t('history.favorites')}
            </Text>
            <View style={[styles.card, dark && styles.cardDark]}>
              {favDests.map((dest, i) => (
                <FavDestRow key={dest.name} dest={dest} index={i} dark={dark} />
              ))}
            </View>
          </>
        )}

        {/* Trip list */}
        <Text style={[styles.sectionTitle, dark && styles.textSecondaryDark, styles.sectionTitleSpaced]}>
          {t('history.title')}
        </Text>

        {trips.length === 0 ? (
          <View style={[styles.card, dark && styles.cardDark, styles.emptyCard]}>
            <Text style={[styles.emptyText, dark && styles.textSecondaryDark]}>
              {t('history.noHistory')}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, dark && styles.cardDark]}>
            {trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                onPress={() => handleMapReplay(trip)}
                accessibilityRole="button"
              >
                <TripRow trip={trip} dark={dark} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsCol}>
          <Pressable
            style={[styles.actionBtn, dark ? styles.actionBtnSecDark : styles.actionBtnSec]}
            onPress={handleExport}
            accessibilityRole="button"
          >
            <Text style={[styles.actionBtnText, dark && styles.textPrimaryDark]}>
              📤 {t('history.exportHistory')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnDestructive]}
            onPress={handleClear}
            accessibilityRole="button"
          >
            <Text style={styles.actionBtnDestructiveText}>
              🗑️ {t('history.clearHistory')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  rootDark: {
    backgroundColor: '#121212',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerDark: {
    backgroundColor: '#1e1e1e',
    borderBottomColor: '#333',
  },
  closeBtn: {
    width: 32,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#333',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  monthBanner: {
    backgroundColor: tokens.color.primary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  monthBannerDark: {
    backgroundColor: tokens.color.primary,
  },
  monthBannerText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  monthBannerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statsTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  statsTileDark: {
    backgroundColor: '#1e1e1e',
  },
  statsTileValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  statsTileLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  sectionTitleSpaced: {
    marginTop: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardDark: {
    backgroundColor: '#1e1e1e',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
  tripRow: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  tripRowDark: {
    borderBottomColor: '#2e2e2e',
  },
  tripIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  tripIconWrapDark: {
    backgroundColor: '#1a3a1a',
  },
  tripIcon: {
    fontSize: 18,
  },
  tripInfo: {
    flex: 1,
  },
  tripDest: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  tripOrigin: {
    fontSize: 12,
    color: '#888',
    marginVertical: 2,
  },
  tripMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  tripMetaText: {
    fontSize: 12,
    color: '#888',
  },
  tripMetaDot: {
    fontSize: 12,
    color: '#ccc',
  },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  favRowDark: {
    borderBottomColor: '#2e2e2e',
  },
  favMedal: {
    fontSize: 22,
    marginEnd: 12,
  },
  favInfo: {
    flex: 1,
  },
  favName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  favMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  actionsCol: {
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionBtnSec: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  actionBtnSecDark: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#444',
  },
  actionBtnText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtnDestructive: {
    backgroundColor: '#fdecea',
  },
  actionBtnDestructiveText: {
    color: '#c62828',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPad: {
    height: 60,
  },
  textPrimaryDark: {
    color: '#e0e0e0',
  },
  textSecondaryDark: {
    color: '#999',
  },
});
