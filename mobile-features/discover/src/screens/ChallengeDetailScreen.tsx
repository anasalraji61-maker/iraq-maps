import type { ChallengeType2, ChallengeLeaderEntryType } from '@iraq-maps/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useChallengesClient } from '../socialClient';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

function CelebrationBanner({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity]);

  return (
    <Animated.View style={[styles.banner, { opacity, backgroundColor: COLORS.accent }]}>
      <Text style={styles.bannerText}>{t('challenges.completedBanner')}</Text>
    </Animated.View>
  );
}

function AnimatedProgressBar({ value, max }: { value: number; max: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const pct = Math.min(1, max > 0 ? value / max : 0);

  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 600, useNativeDriver: false }).start();
  }, [pct, anim]);

  return (
    <View style={[barStyles.track, { backgroundColor: COLORS.border }]}>
      <Animated.View
        style={[
          barStyles.fill,
          {
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            backgroundColor: COLORS.accent,
          },
        ]}
      />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { height: 10, borderRadius: 5, overflow: 'hidden', marginVertical: 8 },
  fill: { height: 10, borderRadius: 5 },
});

export function ChallengeDetailScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const client = useChallengesClient();
  const [challenge, setChallenge] = useState<ChallengeType2 | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderEntryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [progLoading, setProgLoading] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const load = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    try {
      const res = await client.getChallenge({ params: { challengeId: challengeId as never } });
      if (res.status === 200) {
        setChallenge(res.body.challenge);
        setLeaderboard(res.body.leaderboard);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [client, challengeId]);

  useEffect(() => { void load(); }, [load]);

  const handleParticipate = async () => {
    if (!challenge || challenge.status !== 'active') return;
    setProgLoading(true);
    try {
      const res = await client.recordProgress({
        params: { challengeId: challengeId as never },
        body: { increment: 1 },
      });
      if (res.status === 200) {
        setChallenge({ ...challenge, myProgress: res.body.newProgress });
        if (res.body.completed) setCelebrated(true);
      }
    } catch {
      Alert.alert(t('challenges.progressError'));
    }
    setProgLoading(false);
  };

  if (loading) return (
    <View style={[sharedStyles.center, { flex: 1, backgroundColor: COLORS.bg }]}>
      <ActivityIndicator color={COLORS.accent} />
    </View>
  );

  if (!challenge) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <CelebrationBanner visible={celebrated} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: COLORS.text }]}>{challenge.title}</Text>
        <View style={[styles.typeBadge, { backgroundColor: COLORS.accent }]}>
          <Text style={styles.typeBadgeText}>{t(`challenges.types.${challenge.type}` as never)}</Text>
        </View>
        <Text style={[styles.description, { color: COLORS.text }]}>{challenge.description}</Text>

        <AnimatedProgressBar value={challenge.myProgress} max={challenge.targetCount} />
        <Text style={[styles.progressText, { color: COLORS.secondary }]}>
          {t('challenges.progress', { current: challenge.myProgress, total: challenge.targetCount })}
        </Text>

        {challenge.reward ? (
          <Text style={[styles.reward, { color: COLORS.accent }]}>
            {t('challenges.reward', { reward: challenge.reward })}
          </Text>
        ) : (
          <Text style={[styles.reward, { color: COLORS.secondary }]}>{t('challenges.noReward')}</Text>
        )}

        <Text style={[styles.meta, { color: COLORS.secondary }]}>
          {t('challenges.participants', { count: challenge.totalParticipants })}
        </Text>
        {challenge.myRank ? (
          <Text style={[styles.meta, { color: COLORS.accent }]}>
            {t('challenges.myRank', { rank: challenge.myRank })}
          </Text>
        ) : null}

        {challenge.status === 'active' && (
          <Pressable
            style={[styles.participateBtn, { backgroundColor: progLoading ? '#aaa' : COLORS.accent }]}
            onPress={handleParticipate}
            disabled={progLoading}
            accessibilityRole="button"
          >
            {progLoading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.participateBtnText}>{t('challenges.participate')}</Text>
            )}
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { color: COLORS.text }]}>{t('challenges.leaderboard')}</Text>
        {leaderboard.map((entry) => (
          <View key={`${entry.rank}-${entry.userId}`} style={[styles.leaderRow, { backgroundColor: COLORS.surface }]}>
            <Text style={[styles.rankNum, { color: entry.rank <= 3 ? COLORS.accent : COLORS.secondary }]}>
              #{entry.rank}
            </Text>
            <Text style={[styles.leaderName, { color: COLORS.text }]}>{entry.displayName}</Text>
            <Text style={[styles.leaderProgress, { color: COLORS.secondary }]}>{entry.progress}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, start: 0, end: 0, zIndex: 99, padding: 16, alignItems: 'center' },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 12 },
  typeBadgeText: { color: '#fff', fontSize: 12 },
  description: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  progressText: { fontSize: 12, marginBottom: 4 },
  reward: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  meta: { fontSize: 12, marginBottom: 4 },
  participateBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  participateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 6, gap: 12 },
  rankNum: { width: 30, fontWeight: '700', fontSize: 14 },
  leaderName: { flex: 1, fontSize: 14 },
  leaderProgress: { fontSize: 14, fontWeight: '600' },
});
