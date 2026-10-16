/**
 * RouteCompare — side-by-side comparison card for multiple route alternatives.
 * Shows distance, duration, road types, toll warnings, and traffic conditions for each option.
 */
import type { RouteResult } from '@iraq-maps/contracts';
import { Text, tokens } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { t } from '../strings';

export type RouteTag = 'fastest' | 'shortest' | 'recommended';

export interface RouteOption {
  route: RouteResult;
  tag?: RouteTag;
  /** Fraction of route on motorway (0–1). */
  motorwayFraction?: number;
  /** Fraction of route on residential streets (0–1). */
  residentialFraction?: number;
  /** Whether the route passes through any toll roads. */
  hasToll?: boolean;
  /** Traffic severity: 0 = none, 1 = light, 2 = moderate, 3 = heavy. */
  trafficLevel?: 0 | 1 | 2 | 3;
  /** Extra duration added by traffic in seconds. */
  trafficDelayS?: number;
}

export interface RouteCompareProps {
  options: RouteOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function fmtDist(m: number): string {
  return m < 1000 ? t('preview.distM', { n: Math.round(m) }) : t('preview.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return t('preview.durationMin', { n: mins });
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? t('preview.durationHourMin', { h, m: rem }) : t('preview.durationHour', { h });
}

function tagLabel(tag: RouteTag): string {
  switch (tag) {
    case 'fastest': return t('preview.altFastest');
    case 'shortest': return t('preview.altShortest');
    case 'recommended': return t('preview.altRecommended');
  }
}

function tagColor(tag: RouteTag): string {
  switch (tag) {
    case 'fastest': return '#2563EB';
    case 'shortest': return '#059669';
    case 'recommended': return '#7C3AED';
  }
}

function trafficLabel(level: 0 | 1 | 2 | 3): string {
  switch (level) {
    case 1: return t('preview.trafficLight');
    case 2: return t('preview.trafficModerate');
    case 3: return t('preview.trafficHeavy');
    default: return '';
  }
}

function trafficColor(level: 0 | 1 | 2 | 3): string {
  switch (level) {
    case 1: return '#22C55E';
    case 2: return '#F59E0B';
    case 3: return '#EF4444';
    default: return 'transparent';
  }
}

/** Mini road-type bar showing motorway / highway / residential fractions. */
function RoadTypeBar({ motorwayFraction = 0, residentialFraction = 0 }: { motorwayFraction?: number; residentialFraction?: number }): ReactElement {
  const highwayFraction = Math.max(0, 1 - motorwayFraction - residentialFraction);
  return (
    <View style={roadBarStyles.container}>
      {motorwayFraction > 0.02 ? (
        <View style={[roadBarStyles.segment, { flex: motorwayFraction, backgroundColor: '#1D4ED8' }]} />
      ) : null}
      {highwayFraction > 0.02 ? (
        <View style={[roadBarStyles.segment, { flex: highwayFraction, backgroundColor: '#6B7280' }]} />
      ) : null}
      {residentialFraction > 0.02 ? (
        <View style={[roadBarStyles.segment, { flex: residentialFraction, backgroundColor: '#9CA3AF' }]} />
      ) : null}
    </View>
  );
}

const roadBarStyles = StyleSheet.create({
  container: { height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#E5E7EB' },
  segment: { height: 6 },
});

/** One route option card. */
function RouteCard({
  option,
  index,
  selected,
  onPress,
}: {
  option: RouteOption;
  index: number;
  selected: boolean;
  onPress: () => void;
}): ReactElement {
  const { route, tag, motorwayFraction, residentialFraction, hasToll, trafficLevel = 0, trafficDelayS } = option;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t('preview.altRoute', { n: index + 1 })}
      testID={`route-option-${index}`}
    >
      <View style={[cardStyles.card, selected && cardStyles.cardSelected]}>
        {/* Header row: label + tag */}
        <View style={cardStyles.headerRow}>
          <Text variant="subtitle" style={selected ? cardStyles.labelSelected : undefined}>
            {t('preview.altRoute', { n: index + 1 })}
          </Text>
          {tag != null ? (
            <View style={[cardStyles.tagBadge, { backgroundColor: tagColor(tag) }]}>
              <Text style={cardStyles.tagText}>{tagLabel(tag)}</Text>
            </View>
          ) : null}
        </View>

        {/* Distance + duration */}
        <View style={cardStyles.statsRow}>
          <Text variant="title" style={cardStyles.durationText}>
            {fmtDuration(route.durationS)}
          </Text>
          <Text tone="muted" style={cardStyles.distText}>
            {fmtDist(route.distanceM)}
          </Text>
        </View>

        {/* Traffic delay */}
        {trafficLevel > 0 && trafficDelayS != null && trafficDelayS > 60 ? (
          <View style={[cardStyles.trafficRow, { backgroundColor: trafficColor(trafficLevel) + '22' }]}>
            <View style={[cardStyles.trafficDot, { backgroundColor: trafficColor(trafficLevel) }]} />
            <Text style={{ fontSize: 12, color: trafficColor(trafficLevel) }}>
              {trafficLabel(trafficLevel)} · +{Math.round(trafficDelayS / 60)} {t('preview.durationMin', { n: '' })}
            </Text>
          </View>
        ) : null}

        {/* Road type bar */}
        <RoadTypeBar motorwayFraction={motorwayFraction} residentialFraction={residentialFraction} />

        {/* Legend */}
        <View style={cardStyles.legendRow}>
          {(motorwayFraction ?? 0) > 0.05 ? (
            <View style={cardStyles.legendItem}>
              <View style={[cardStyles.legendDot, { backgroundColor: '#1D4ED8' }]} />
              <Text style={cardStyles.legendLabel}>{t('preview.motorway')}</Text>
            </View>
          ) : null}
          {(residentialFraction ?? 0) > 0.05 ? (
            <View style={cardStyles.legendItem}>
              <View style={[cardStyles.legendDot, { backgroundColor: '#9CA3AF' }]} />
              <Text style={cardStyles.legendLabel}>{t('preview.residential')}</Text>
            </View>
          ) : null}
        </View>

        {/* Toll warning */}
        {hasToll ? (
          <View style={cardStyles.tollRow}>
            <Text style={cardStyles.tollText}>⚠ {t('preview.tollWarning')}</Text>
          </View>
        ) : null}

        {/* Select button (only visible when not selected) */}
        {!selected ? (
          <View style={cardStyles.selectButton}>
            <Text style={cardStyles.selectButtonText}>{t('preview.selectRoute')}</Text>
          </View>
        ) : (
          <View style={cardStyles.selectedIndicator}>
            <Text style={cardStyles.selectedText}>✓</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const { space, color } = tokens;

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: space.m,
    gap: space.xs,
    borderWidth: 2,
    borderColor: color.border,
    minWidth: 180,
  },
  cardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelSelected: { color: '#1D4ED8' },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  statsRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
  durationText: { fontSize: 22 },
  distText: { fontSize: 14 },
  trafficRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  trafficDot: { width: 8, height: 8, borderRadius: 4 },
  legendRow: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap', marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: color.textMuted },
  tollRow: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  tollText: { fontSize: 11, color: '#92400E' },
  selectButton: { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
  selectButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  selectedIndicator: { alignItems: 'center', marginTop: 4 },
  selectedText: { color: '#2563EB', fontSize: 16, fontWeight: '700' },
});

export function RouteCompare({ options, selectedIndex, onSelect }: RouteCompareProps): ReactElement {
  if (options.length === 0) return <View />;

  return (
    <View style={compareStyles.container}>
      <Text variant="subtitle" style={compareStyles.heading}>
        {t('preview.compareRoutes')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={compareStyles.scroll}
        accessibilityRole="radiogroup"
      >
        {options.map((opt, i) => (
          <RouteCard
            key={i}
            option={opt}
            index={i}
            selected={i === selectedIndex}
            onPress={() => onSelect(i)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const compareStyles = StyleSheet.create({
  container: { gap: space.s },
  heading: { paddingHorizontal: space.s },
  scroll: { gap: space.s, paddingHorizontal: space.s },
});
