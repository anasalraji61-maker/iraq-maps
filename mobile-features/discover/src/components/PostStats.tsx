/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, formatCount } from '../screens/shared';
import { t } from '../strings';
import { useDiscoverClient } from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostStatsData {
  viewCount: number;
  uniqueViewerCount: number;
  likeCount: number;
  commentCount: number;
  bookmarkCount?: number;
  shareCount?: number;
  /** Hourly view counts for the last 24h (oldest first). */
  viewsHourly?: number[];
  /** Hourly like counts for the last 24h. */
  likesHourly?: number[];
  topCountries?: Array<{ name: string; count: number }>;
  audienceBreakdown?: { followers: number; nonFollowers: number };
}

// ─── MiniBar chart ───────────────────────────────────────────────────────────

interface MiniBarProps {
  data: number[];
  width: number;
  height: number;
  color?: string;
  label?: string;
}

function MiniBar({ data, width, height, color = COLORS.primary, label }: MiniBarProps): ReactElement {
  if (data.length === 0) return <View style={{ width, height }} />;
  const maxVal = Math.max(...data, 1);
  const barWidth = Math.max(2, (width / data.length) - 2);

  return (
    <View>
      {label ? <Text style={barStyles.label}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }}>
        {data.map((v, i) => {
          const barHeight = Math.max(2, (v / maxVal) * height);
          return (
            <View
              key={i}
              style={{
                width: barWidth,
                height: barHeight,
                backgroundColor: i === data.length - 1 ? color : `${color}80`,
                borderRadius: 2,
              }}
              accessibilityElementsHidden
            />
          );
        })}
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  label: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: 4,
    textAlign: 'auto',
  },
});

// ─── Stat tile ────────────────────────────────────────────────────────────────

interface StatTileProps {
  icon: string;
  value: number;
  label: string;
  color?: string;
  subValue?: string;
}

function StatTile({ icon, value, label, color = COLORS.primary, subValue }: StatTileProps): ReactElement {
  return (
    <View style={tileStyles.tile}>
      <Text style={tileStyles.icon}>{icon}</Text>
      <Text style={[tileStyles.value, { color }]}>{formatCount(value)}</Text>
      <Text style={tileStyles.label}>{label}</Text>
      {subValue ? <Text style={tileStyles.subValue}>{subValue}</Text> : null}
    </View>
  );
}

const tileStyles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 80,
  },
  icon: {
    fontSize: 22,
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  subValue: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});

// ─── Audience donut (simple bar) ─────────────────────────────────────────────

interface AudienceBarProps {
  followers: number;
  nonFollowers: number;
}

function AudienceBar({ followers, nonFollowers }: AudienceBarProps): ReactElement {
  const total = followers + nonFollowers;
  if (total === 0) return <View />;
  const followerPct = Math.round((followers / total) * 100);

  return (
    <View style={audStyles.container}>
      <Text style={audStyles.title}>{t('trending.audienceLabel' as Parameters<typeof t>[0])}</Text>
      <View style={audStyles.barRow}>
        <View style={[audStyles.barSegment, { flex: followers, backgroundColor: COLORS.primary }]} />
        <View style={[audStyles.barSegment, { flex: nonFollowers, backgroundColor: COLORS.border }]} />
      </View>
      <View style={audStyles.legendRow}>
        <View style={audStyles.legendItem}>
          <View style={[audStyles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={audStyles.legendText}>
            {t('follow.follow')} {followerPct}%
          </Text>
        </View>
        <View style={audStyles.legendItem}>
          <View style={[audStyles.legendDot, { backgroundColor: COLORS.border }]} />
          <Text style={audStyles.legendText}>
            {t('suggestions.reasonPopular' as Parameters<typeof t>[0])} {100 - followerPct}%
          </Text>
        </View>
      </View>
    </View>
  );
}

const audStyles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'auto',
  },
  barRow: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});

// ─── PostStats main component ─────────────────────────────────────────────────

interface PostStatsProps {
  postId: string;
  viewerId: string;
  /** Pre-loaded stats; if omitted will be fetched */
  initialStats?: PostStatsData;
  onClose?: () => void;
}

export function PostStats({ postId, viewerId, initialStats, onClose }: PostStatsProps): ReactElement {
  const api = useDiscoverClient();
  const [stats, setStats] = useState<PostStatsData | null>(initialStats ?? null);
  const [loading, setLoading] = useState(!initialStats);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (initialStats) return;
    setLoading(true);
    api.getPostStats({ params: { postId } })
      .then((res) => {
        if (res.status === 200) {
          setStats(res.body as PostStatsData);
        } else {
          setError(t('postDetail.loadError'));
        }
      })
      .catch(() => setError(t('postDetail.loadError')))
      .finally(() => setLoading(false));
  }, [postId, viewerId, api, initialStats]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !stats) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error ?? t('postDetail.loadError')}</Text>
      </View>
    );
  }

  // Build hourly axis labels (last 24h, every 6h)
  const now = new Date();
  const hourLabels = Array.from({ length: 4 }, (_, i) => {
    const h = new Date(now.getTime() - (3 - i) * 6 * 60 * 60 * 1000);
    return `${h.getHours()}:00`;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('trending.statsTitle' as Parameters<typeof t>[0])}</Text>
        {onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
            <Text style={styles.closeBtn}>{t('lightbox.closeSymbol')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Stat tiles */}
      <View style={styles.tilesRow}>
        <StatTile
          icon="👁"
          value={stats.viewCount}
          label={t('postDetail.views', { n: stats.viewCount })}
          subValue={stats.uniqueViewerCount > 0 ? formatCount(stats.uniqueViewerCount) : undefined}
        />
        <StatTile
          icon="❤️"
          value={stats.likeCount}
          label={t('post.like')}
          color="#D32F2F"
        />
        <StatTile
          icon="💬"
          value={stats.commentCount}
          label={t('post.comment')}
        />
        {stats.bookmarkCount != null ? (
          <StatTile
            icon="🔖"
            value={stats.bookmarkCount}
            label={t('saved.save')}
            color={COLORS.success}
          />
        ) : null}
      </View>

      {/* Views chart */}
      {stats.viewsHourly && stats.viewsHourly.length > 0 ? (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>{t('trending.viewsChartTitle' as Parameters<typeof t>[0])}</Text>
          <MiniBar
            data={stats.viewsHourly}
            width={280}
            height={48}
            color={COLORS.primary}
          />
          <View style={styles.chartAxisRow}>
            {hourLabels.map((lbl, i) => (
              <Text key={i} style={styles.axisLabel}>{lbl}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* Likes chart */}
      {stats.likesHourly && stats.likesHourly.length > 0 ? (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>{t('trending.likesChartTitle' as Parameters<typeof t>[0])}</Text>
          <MiniBar
            data={stats.likesHourly}
            width={280}
            height={36}
            color="#D32F2F"
          />
        </View>
      ) : null}

      {/* Audience breakdown */}
      {stats.audienceBreakdown ? (
        <View style={styles.section}>
          <AudienceBar
            followers={stats.audienceBreakdown.followers}
            nonFollowers={stats.audienceBreakdown.nonFollowers}
          />
        </View>
      ) : null}

      {/* Engagement rate */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('trending.engagementRate' as Parameters<typeof t>[0])}</Text>
        <View style={styles.engagementRow}>
          {([
            {
              key: 'like_rate' as const,
              label: t('post.like'),
              value: stats.viewCount > 0 ? `${((stats.likeCount / stats.viewCount) * 100).toFixed(1)}%` : '—',
              color: COLORS.error,
            },
            {
              key: 'comment_rate' as const,
              label: t('post.comment'),
              value: stats.viewCount > 0 ? `${((stats.commentCount / stats.viewCount) * 100).toFixed(1)}%` : '—',
              color: COLORS.primary,
            },
          ] as const).map((item) => (
            <View key={item.key} style={styles.engagementItem}>
              <Text style={[styles.engagementValue, { color: item.color }]}>{item.value}</Text>
              <Text style={styles.engagementLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  closeBtn: {
    fontSize: 18,
    color: COLORS.textMuted,
    padding: 4,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'auto',
  },
  chartAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  axisLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  engagementRow: {
    flexDirection: 'row',
    gap: 24,
  },
  engagementItem: {
    alignItems: 'center',
  },
  engagementValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  engagementLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
