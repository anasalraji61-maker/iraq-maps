/**
 * PriceDisplay — price information widget.
 * Shows IQD-formatted prices with confidence bar, source attribution
 * and a "Submit price" affordance.
 * All text via t(). RTL-safe (start/end).
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import type { PriceLevel } from '@iraq-maps/contracts';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@iraq-maps/ui';
import { t } from '../strings';

// ── IQD formatter ─────────────────────────────────────────────────────────────

/** Format an IQD amount with thousands separators and the IQD symbol. */
export function formatIqd(amount: number): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('ar-IQ');
  return `${formatted} ${t('search.currencyIqd')}`;
}

/** Format a price range. */
export function formatIqdRange(min: number, max: number): string {
  if (min === max) return formatIqd(min);
  return `${formatIqd(min)} — ${formatIqd(max)}`;
}

// ── Price level colours ───────────────────────────────────────────────────────

const LEVEL_COLOR: Record<PriceLevel, string> = {
  budget: '#43A047',
  mid_range: '#1E88E5',
  expensive: '#FB8C00',
  luxury: '#8E24AA',
};

function priceLevelLabel(level: PriceLevel): string {
  if (level === 'budget') return t('place.priceBudget');
  if (level === 'mid_range') return t('place.priceMidRange');
  if (level === 'expensive') return t('place.priceExpensive');
  return t('place.priceLuxury');
}

function sourceLabel(source: string): string {
  if (source === 'user_report') return t('place.sourceUserReport');
  if (source === 'provider') return t('place.sourceProvider');
  if (source === 'heuristic') return t('place.sourceHeuristic');
  if (source === 'osm') return t('place.sourceOsm');
  return source;
}

// ── Confidence bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ value, color }: { value: number; color: string }): ReactElement {
  const pct = Math.round(value * 100);
  return (
    <View style={confStyles.row}>
      <Text style={confStyles.label}>{t('insights.confidence')}</Text>
      <View style={confStyles.track}>
        <View style={[confStyles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
      <Text style={confStyles.value}>{pct}%</Text>
    </View>
  );
}

const confStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11, color: '#757575', minWidth: 50 },
  track: { flex: 1, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  value: { fontSize: 11, color: '#757575', minWidth: 28, textAlign: 'right' },
});

// ── Single price row ──────────────────────────────────────────────────────────

export interface PriceRowItem {
  item: string;
  priceIqd: number;
  confidence: number;
  source: string;
  observedAt: string;
}

function PriceRow({ item: priceItem }: { item: PriceRowItem }): ReactElement {
  let timeStr: string;
  try {
    const d = new Date(priceItem.observedAt);
    timeStr = d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
  } catch {
    timeStr = '';
  }

  const color = priceItem.confidence >= 0.7 ? '#43A047' : priceItem.confidence >= 0.4 ? '#FB8C00' : '#9E9E9E';

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.header}>
        <Text style={rowStyles.itemName}>{priceItem.item}</Text>
        <Text style={rowStyles.price}>{formatIqd(priceItem.priceIqd)}</Text>
      </View>
      <ConfidenceBar value={priceItem.confidence} color={color} />
      <View style={rowStyles.meta}>
        <Text style={rowStyles.source}>{sourceLabel(priceItem.source)}</Text>
        {timeStr ? <Text style={rowStyles.date}>{timeStr}</Text> : null}
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0', gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 14, fontWeight: '500', flex: 1 },
  price: { fontSize: 15, fontWeight: '700', color: '#1A237E' },
  meta: { flexDirection: 'row', gap: 8 },
  source: { fontSize: 11, color: '#9E9E9E' },
  date: { fontSize: 11, color: '#BDBDBD' },
});

// ── Main PriceDisplay ─────────────────────────────────────────────────────────

export interface PriceDisplayProps {
  /** Overall price level estimate */
  priceLevel?: PriceLevel | null;
  /** Confidence in the price level (0–1) */
  confidence?: number;
  /** Source of price level data */
  source?: string;
  /** ISO datetime of last observation */
  observedAt?: string;
  /** Individual item prices */
  items?: PriceRowItem[];
  /** Called when the user taps "Submit price" */
  onSubmitPrice?: () => void;
  /** If true, shows "Prices may vary" disclaimer */
  showDisclaimer?: boolean;
}

/**
 * PriceDisplay — shows price level, confidence, individual item prices,
 * source attribution and a submit button.
 * Never renders prices without confidence (CLAUDE.md rule 5).
 */
export function PriceDisplay({
  priceLevel,
  confidence,
  source,
  observedAt,
  items = [],
  onSubmitPrice,
  showDisclaimer = true,
}: PriceDisplayProps): ReactElement {
  const hasLevel = priceLevel !== null && priceLevel !== undefined;
  const levelColor = hasLevel ? LEVEL_COLOR[priceLevel!] : '#9E9E9E';

  let timeStr = '';
  if (observedAt) {
    try {
      const d = new Date(observedAt);
      timeStr = d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
    } catch {
      timeStr = '';
    }
  }

  return (
    <View style={mainStyles.container}>
      {/* Header */}
      <View style={mainStyles.header}>
        <Text style={mainStyles.title}>{t('place.priceLevel')}</Text>
        {hasLevel && confidence !== undefined ? (
          <View style={[mainStyles.levelChip, { backgroundColor: `${levelColor}20`, borderColor: levelColor }]}>
            <Text style={[mainStyles.levelText, { color: levelColor }]}>{priceLevelLabel(priceLevel!)}</Text>
          </View>
        ) : (
          <Text style={mainStyles.noData}>{t('place.noInsightsData')}</Text>
        )}
      </View>

      {/* Confidence + source */}
      {hasLevel && confidence !== undefined ? (
        <View style={mainStyles.meta}>
          <ConfidenceBar value={confidence} color={levelColor} />
          <View style={mainStyles.sourceRow}>
            {source ? <Text style={mainStyles.sourceText}>{t('place.insightsSource', { source: sourceLabel(source) })}</Text> : null}
            {timeStr ? <Text style={mainStyles.sourceText}>{timeStr}</Text> : null}
          </View>
        </View>
      ) : null}

      {/* Item price list */}
      {items.length > 0 ? (
        <View style={mainStyles.itemList}>
          <Text style={mainStyles.sectionTitle}>{t('insights.priceList')}</Text>
          {items.map((item, idx) => (
            <PriceRow key={`${item.item}-${idx}`} item={item} />
          ))}
        </View>
      ) : null}

      {/* Disclaimer */}
      {showDisclaimer ? (
        <Text style={mainStyles.disclaimer}>{t('insights.pricesDisclaimer')}</Text>
      ) : null}

      {/* Submit button */}
      {onSubmitPrice ? (
        <Pressable
          style={mainStyles.submitBtn}
          onPress={onSubmitPrice}
          accessibilityRole="button"
          accessibilityLabel={t('place.reportPrice')}
        >
          <Text style={mainStyles.submitText}>{t('insights.submitPriceBtn')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const mainStyles = StyleSheet.create({
  container: { gap: 12, padding: 16, backgroundColor: '#FAFAFA', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0E0E0' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '600', color: '#212121' },
  noData: { fontSize: 13, color: '#9E9E9E' },
  levelChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  levelText: { fontSize: 13, fontWeight: '600' },
  meta: { gap: 6 },
  sourceRow: { flexDirection: 'row', gap: 8 },
  sourceText: { fontSize: 11, color: '#9E9E9E' },
  itemList: { gap: 0 },
  sectionTitle: { fontSize: 12, color: '#757575', fontWeight: '500', marginBottom: 4 },
  disclaimer: { fontSize: 11, color: '#BDBDBD', fontStyle: 'italic' },
  submitBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#E3F2FD', borderRadius: 10, alignItems: 'center' },
  submitText: { fontSize: 14, color: '#1565C0', fontWeight: '600' },
});
