/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, formatCount } from '../screens/shared';
import { t } from '../strings';

// ─── Sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  width: number;
  height: number;
  color?: string;
}

function Sparkline({ data, width, height, color = COLORS.primary }: SparklineProps): ReactElement {
  if (data.length < 2) {
    return <View style={{ width, height }} />;
  }

  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;

  // Build SVG-like path using View positions
  const segmentWidth = width / (data.length - 1);
  const points = data.map((v, i) => ({
    x: i * segmentWidth,
    y: height - ((v - minVal) / range) * (height - 4) - 2,
  }));

  return (
    <View style={{ width, height, position: 'relative' }}>
      {points.slice(0, -1).map((pt, i) => {
        const next = points[i + 1]!;
        const dx = next.x - pt.x;
        const dy = next.y - pt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              start: pt.x,
              top: pt.y,
              width: len,
              height: 2,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: '0 50%',
            }}
            accessibilityElementsHidden
          />
        );
      })}
      {/* End dot */}
      <View
        style={{
          position: 'absolute',
          start: (points[points.length - 1]?.x ?? 0) - 3,
          top: (points[points.length - 1]?.y ?? 0) - 3,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
        accessibilityElementsHidden
      />
    </View>
  );
}

// ─── HashtagTrend card ────────────────────────────────────────────────────────

export interface HashtagTrendData {
  hashtag: string;
  count: number;
  /** Optional hourly counts for the last 12 hours (oldest first). */
  sparkline?: number[];
  rank?: number;
  growth?: number; // percentage growth vs previous 24h
}

interface HashtagTrendProps {
  item: HashtagTrendData;
  onPress: (hashtag: string) => void;
  compact?: boolean;
}

export function HashtagTrend({ item, onPress, compact = false }: HashtagTrendProps): ReactElement {
  const sparkData = item.sparkline ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, item.count];
  const isRising = (item.growth ?? 0) > 0;
  const growthAbs = Math.abs(item.growth ?? 0);

  if (compact) {
    return (
      <Pressable
        style={styles.compactCard}
        onPress={() => onPress(item.hashtag)}
        accessibilityRole="button"
        accessibilityLabel={`${item.hashtag} ${formatCount(item.count)} ${t('feed.trendingHashtagsTitle')}`}
      >
        <Text style={styles.compactHashtag} numberOfLines={1}>
          #{item.hashtag}
        </Text>
        <Text style={styles.compactCount}>{formatCount(item.count)}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={styles.card}
      onPress={() => onPress(item.hashtag)}
      accessibilityRole="button"
      accessibilityLabel={`${item.hashtag} ${formatCount(item.count)} ${t('feed.trendingHashtagsTitle')}`}
    >
      <View style={styles.left}>
        {item.rank != null ? (
          <Text style={styles.rank}>#{item.rank}</Text>
        ) : null}
        <View style={styles.textBlock}>
          <Text style={styles.hashtag} numberOfLines={1}>
            #{item.hashtag}
          </Text>
          <Text style={styles.count}>
            {formatCount(item.count)} {t('hashtag.postCount', { n: item.count })}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        {item.sparkline ? (
          <Sparkline
            data={sparkData}
            width={60}
            height={28}
            color={isRising ? COLORS.success : COLORS.primary}
          />
        ) : null}
        {item.growth != null ? (
          <Text style={[styles.growth, isRising ? styles.growthUp : styles.growthDown]}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
          {isRising ? '▲' : '▼'} {growthAbs}%
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── HashtagTrendList ─────────────────────────────────────────────────────────

interface HashtagTrendListProps {
  items: HashtagTrendData[];
  onPress: (hashtag: string) => void;
  compact?: boolean;
}

export function HashtagTrendList({ items, onPress, compact = false }: HashtagTrendListProps): ReactElement {
  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t('feed.trendingHashtagsTitle')}</Text>
      </View>
    );
  }

  if (compact) {
    return (
      <View style={styles.compactRow}>
        {items.map((item) => (
          <HashtagTrend key={item.hashtag} item={item} onPress={onPress} compact />
        ))}
      </View>
    );
  }

  return (
    <View>
      {items.map((item, idx) => (
        <HashtagTrend key={item.hashtag} item={{ ...item, rank: idx + 1 }} onPress={onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  rank: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    minWidth: 24,
    textAlign: 'center',
  },
  textBlock: {
    flex: 1,
  },
  hashtag: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'auto',
  },
  count: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'auto',
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    marginStart: 10,
  },
  growth: {
    fontSize: 11,
    fontWeight: '600',
  },
  growthUp: {
    color: COLORS.success,
  },
  growthDown: {
    color: COLORS.error,
  },
  compactCard: {
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactHashtag: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  compactCount: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  compactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
