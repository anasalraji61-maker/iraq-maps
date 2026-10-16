/**
 * CrowdingIndicator — reusable crowding widget.
 * Variants: compact (badge for map markers), expanded (full panel with pulse animation).
 * All text via t(). RTL-safe (start/end).
 */
import type { CrowdLevel } from '@iraq-maps/contracts';
import { type ReactElement, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@iraq-maps/ui';
import { t } from '../strings';

// ── Colours ──────────────────────────────────────────────────────────────────

const LEVEL_COLOR: Record<CrowdLevel, string> = {
  low: '#43A047',    // green
  medium: '#FB8C00', // amber
  high: '#E53935',   // red
};

const LEVEL_BG: Record<CrowdLevel, string> = {
  low: '#E8F5E9',
  medium: '#FFF3E0',
  high: '#FFEBEE',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type CrowdingIndicatorVariant = 'compact' | 'expanded' | 'badge';

export interface CrowdingIndicatorProps {
  /** Current crowd level; null shows no-data state. */
  level: CrowdLevel | null;
  /** Whether this is live data (shows animated pulse). */
  isLive?: boolean;
  /** Compact = one-line chip, expanded = full card, badge = tiny dot+label. */
  variant?: CrowdingIndicatorVariant;
  /** Confidence 0–1, shown in expanded variant. */
  confidence?: number;
  /** ISO datetime string for last observed time. */
  observedAt?: string;
  /** Extra info shown in tooltip/expanded area. */
  waitMinutes?: number;
  /** Called when the user taps the indicator. */
  onPress?: () => void;
}

// ── Pulse animation ───────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.5, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        ]),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale, opacity]);

  return (
    <View style={dotStyles.wrapper}>
      <Animated.View style={[dotStyles.ring, { borderColor: color, transform: [{ scale }], opacity }]} />
      <View style={[dotStyles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrapper: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

// ── Static dot (no animation) ─────────────────────────────────────────────────

function StaticDot({ color }: { color: string }): ReactElement {
  return <View style={[dotStyles.dot, { backgroundColor: color }]} />;
}

// ── Crowd label helpers ───────────────────────────────────────────────────────

function crowdLabel(level: CrowdLevel): string {
  if (level === 'low') return t('place.crowdLow');
  if (level === 'medium') return t('place.crowdMedium');
  return t('place.crowdHigh');
}

function crowdA11y(level: CrowdLevel): string {
  if (level === 'low') return t('insights.a11yCrowdLow');
  if (level === 'medium') return t('insights.a11yCrowdMedium');
  return t('insights.a11yCrowdHigh');
}

// ── Badge variant ─────────────────────────────────────────────────────────────

function BadgeVariant({ level }: { level: CrowdLevel }): ReactElement {
  const color = LEVEL_COLOR[level];
  return (
    <View style={[badgeStyles.container, { backgroundColor: LEVEL_BG[level] }]}>
      <StaticDot color={color} />
      <Text style={[badgeStyles.label, { color }]}>{crowdLabel(level)}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  label: { fontSize: 10, fontWeight: '600' },
});

// ── Compact variant ───────────────────────────────────────────────────────────

function CompactVariant({ level, isLive }: { level: CrowdLevel; isLive: boolean }): ReactElement {
  const color = LEVEL_COLOR[level];
  return (
    <View style={[compactStyles.container, { backgroundColor: LEVEL_BG[level], borderColor: color }]}>
      {isLive ? <PulseDot color={color} /> : <StaticDot color={color} />}
      <View style={compactStyles.text}>
        <Text style={[compactStyles.label, { color }]}>{crowdLabel(level)}</Text>
        {isLive ? <Text style={compactStyles.live}>{t('insights.live')}</Text> : null}
      </View>
    </View>
  );
}

const compactStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  text: { gap: 1 },
  label: { fontSize: 14, fontWeight: '600' },
  live: { fontSize: 10, color: '#757575' },
});

// ── Expanded variant ──────────────────────────────────────────────────────────

function ExpandedVariant({
  level,
  isLive,
  confidence,
  observedAt,
  waitMinutes,
}: {
  level: CrowdLevel;
  isLive: boolean;
  confidence?: number;
  observedAt?: string;
  waitMinutes?: number;
}): ReactElement {
  const color = LEVEL_COLOR[level];
  const bg = LEVEL_BG[level];

  // Format observed time
  let timeStr = '';
  if (observedAt) {
    try {
      const d = new Date(observedAt);
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      timeStr = '';
    }
  }

  return (
    <View style={[expandedStyles.container, { backgroundColor: bg, borderColor: color }]}>
      <View style={expandedStyles.header}>
        <View style={expandedStyles.titleRow}>
          {isLive ? <PulseDot color={color} /> : <StaticDot color={color} />}
          <Text style={[expandedStyles.title, { color }]}>{crowdLabel(level)}</Text>
          {isLive ? (
            <View style={[expandedStyles.liveBadge, { backgroundColor: color }]}>
              <Text style={expandedStyles.liveBadgeText}>{t('insights.live')}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Traffic light bars */}
      <View style={expandedStyles.trafficLight}>
        {(['low', 'medium', 'high'] as CrowdLevel[]).map((l) => (
          <View
            key={l}
            style={[
              expandedStyles.trafficDot,
              { backgroundColor: l === level ? LEVEL_COLOR[l] : '#E0E0E0' },
            ]}
          />
        ))}
      </View>

      {/* Confidence bar */}
      {confidence !== undefined ? (
        <View style={expandedStyles.confidenceRow}>
          <Text style={expandedStyles.metaLabel}>{t('insights.confidence')}</Text>
          <View style={expandedStyles.confidenceBar}>
            <View style={[expandedStyles.confidenceFill, { width: `${Math.round(confidence * 100)}%` as `${number}%`, backgroundColor: color }]} />
          </View>
          <Text style={expandedStyles.metaValue}>{Math.round(confidence * 100)}%</Text>
        </View>
      ) : null}

      {/* Wait time */}
      {waitMinutes !== undefined && waitMinutes > 0 ? (
        <Text style={expandedStyles.metaLabel}>
          {t('insights.waitTime', { n: String(waitMinutes) })}
        </Text>
      ) : null}

      {/* Last observed */}
      {timeStr ? (
        <Text style={expandedStyles.metaLabel}>
          {t('insights.lastObserved', { time: timeStr })}
        </Text>
      ) : null}
    </View>
  );
}

const expandedStyles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  header: { gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  liveBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  liveBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  trafficLight: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  trafficDot: { width: 28, height: 28, borderRadius: 14 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaLabel: { fontSize: 12, color: '#757575' },
  metaValue: { fontSize: 12, color: '#757575' },
  confidenceBar: { flex: 1, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden' },
  confidenceFill: { height: 4, borderRadius: 2 },
});

// ── No data state ─────────────────────────────────────────────────────────────

function NoDataState({ variant }: { variant: CrowdingIndicatorVariant }): ReactElement {
  if (variant === 'badge') {
    return (
      <View style={[badgeStyles.container, { backgroundColor: '#F5F5F5' }]}>
        <Text style={{ fontSize: 10, color: '#9E9E9E' }}>{t('place.noInsightsData')}</Text>
      </View>
    );
  }
  if (variant === 'compact') {
    return (
      <View style={[compactStyles.container, { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' }]}>
        <Text style={{ fontSize: 14, color: '#9E9E9E' }}>{t('place.noInsightsData')}</Text>
      </View>
    );
  }
  return (
    <View style={[expandedStyles.container, { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' }]}>
      <Text style={{ color: '#9E9E9E' }}>{t('place.noInsightsData')}</Text>
    </View>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * CrowdingIndicator — shows current crowding level with optional animation.
 * - badge: tiny coloured dot + label (for map marker overlays)
 * - compact: one-line chip with optional live pulse
 * - expanded: full card with confidence bar and wait time
 */
export function CrowdingIndicator({
  level,
  isLive = false,
  variant = 'compact',
  confidence,
  observedAt,
  waitMinutes,
  onPress,
}: CrowdingIndicatorProps): ReactElement {
  if (level === null) return <NoDataState variant={variant} />;

  const inner =
    variant === 'badge' ? (
      <BadgeVariant level={level} />
    ) : variant === 'compact' ? (
      <CompactVariant level={level} isLive={isLive} />
    ) : (
      <ExpandedVariant
        level={level}
        isLive={isLive}
        confidence={confidence}
        observedAt={observedAt}
        waitMinutes={waitMinutes}
      />
    );

  if (!onPress) return inner;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={level ? crowdA11y(level) : t('place.noInsightsData')}
    >
      {inner}
    </Pressable>
  );
}
