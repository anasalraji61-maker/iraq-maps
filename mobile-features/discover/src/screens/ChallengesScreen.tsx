import type { ChallengeType2 } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useChallengesClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

I18nManager.forceRTL(true);

type Tab = 'active' | 'upcoming' | 'completed';

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(1, max > 0 ? value / max : 0);
  return (
    <View style={[progressStyles.track, { backgroundColor: COLORS.border }]}>
      <View style={[progressStyles.fill, { width: `${pct * 100}%`, backgroundColor: COLORS.primary }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginVertical: 8 },
  fill: { height: 6, borderRadius: 3 },
});

function ChallengeCard({ challenge, onPress }: { challenge: ChallengeType2; onPress: () => void }) {
  return (
    <Pressable style={[styles.card, { backgroundColor: COLORS.surface }]} onPress={onPress} accessibilityRole="button">
      <View style={styles.cardRow}>
        <View style={[styles.typeBadge, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.typeBadgeText}>{t(`challenges.types.${challenge.type}` as never)}</Text>
        </View>
        <Text style={[styles.cardTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>{challenge.title}</Text>
      </View>
      <ProgressBar value={challenge.myProgress} max={challenge.targetCount} />
      <Text style={[styles.progressText, { color: COLORS.textSecondary }]}>
        {t('challenges.progress', { current: challenge.myProgress, total: challenge.targetCount })}
      </Text>
      {challenge.reward && (
        <Text style={[styles.reward, { color: COLORS.primary }]}>
          {t('challenges.reward', { reward: challenge.reward })}
        </Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={[styles.meta, { color: COLORS.textSecondary }]}>
          {t('challenges.participants', { count: challenge.totalParticipants })}
        </Text>
        {challenge.myRank && (
          <Text style={[styles.rank, { color: COLORS.primary }]}>
            {t('challenges.myRank', { rank: challenge.myRank })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function ChallengesScreen() {
  const client = useChallengesClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('active');
  const [items, setItems] = useState<ChallengeType2[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      const res = await client.listChallenges({ query: { status: tab } });
      if (res.status === 200) setItems(res.body.items);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, tab]);

  useEffect(() => { void load(); }, [load]);

  const TABS: Tab[] = ['active', 'upcoming', 'completed'];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>{t('challenges.title')}</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((tabKey) => (
          <Pressable
            key={tabKey}
            style={[styles.tabBtn, tabKey === tab && { borderBottomColor: COLORS.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(tabKey)}
          >
            <Text style={[styles.tabText, { color: tabKey === tab ? COLORS.primary : COLORS.textSecondary }]}>
              {t(`challenges.${tabKey}` as never)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={[sharedStyles.center, { flex: 1 }]}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={[sharedStyles.center, { flex: 1 }]}>
          <Text style={{ color: COLORS.textSecondary }}>{t('challenges.loadError')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ChallengeCard challenge={item} onPress={() => router.push(`/discover/challenges/${item.id}`)} />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={sharedStyles.center}>
              <Text style={{ color: COLORS.textSecondary }}>{t('challenges.empty')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '500' },
  card: { borderRadius: 12, padding: 14, marginBottom: 12, elevation: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  typeBadgeText: { color: '#fff', fontSize: 11 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  progressText: { fontSize: 12 },
  reward: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  meta: { fontSize: 12 },
  rank: { fontSize: 12, fontWeight: '600' },
});
