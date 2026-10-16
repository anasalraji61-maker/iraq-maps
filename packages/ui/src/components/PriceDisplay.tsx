/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * PriceDisplay — formatted Iraqi Dinar (IQD) price component.
 *
 * - Formats IQD with thousands separator (١٬٠٠٠ or 1,000).
 * - Optional Arabic-Indic digits.
 * - Range display (from–to).
 * - Sale price with strikethrough original.
 * - "Price unknown" / "Free" / "Price upon request" states.
 * - RTL-safe layout.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { toArabicIndic } from './ArabicText';
import { fonts, tokens } from '../tokens';

// ── Formatting helpers ────────────────────────────────────────────────────────

const { color, space, font } = tokens;

/** Format a number with thousands separators. */
function formatThousands(n: number, arabicNumerals: boolean): string {
  const formatted = n.toLocaleString('en-US'); // gives "1,234,567"
  return arabicNumerals ? toArabicIndic(formatted) : formatted;
}

/** Render IQD amount as string: "١٬٢٣٤٬٥٦٧ د.ع" or "1,234,567 IQD". */
function formatIQD(amount: number, arabicNumerals: boolean, short = true): string {
  const numStr = formatThousands(amount, arabicNumerals);
  const currency = short ? 'د.ع' : 'دينار عراقي';
  return `${numStr} ${currency}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PriceState =
  | { kind: 'known'; amount: number }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'sale'; original: number; sale: number }
  | { kind: 'free' }
  | { kind: 'unknown' }
  | { kind: 'on_request' };

export type PriceSize = 'small' | 'medium' | 'large';

export interface PriceDisplayProps {
  price: PriceState;
  /** Use Arabic-Indic numerals. Default: true. */
  arabicNumerals?: boolean;
  /** Short currency symbol (د.ع) vs full label. Default: true. */
  shortCurrency?: boolean;
  size?: PriceSize;
  /** Show source/confidence annotation. */
  source?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FONT_SIZES: Record<PriceSize, { main: number; secondary: number; label: number }> = {
  small:  { main: 14, secondary: 12, label: 11 },
  medium: { main: font.size.body, secondary: 14, label: 12 },
  large:  { main: font.size.title, secondary: font.size.body, label: 13 },
};

const s = StyleSheet.create({
  root: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  amount: {
    fontFamily: fonts.bold,
    color: color.primary,
  },
  rangeFrom: {
    fontFamily: fonts.bold,
    color: color.primary,
  },
  rangeSep: {
    fontFamily: fonts.regular,
    color: color.textMuted,
  },
  rangeTo: {
    fontFamily: fonts.bold,
    color: color.primary,
  },
  salePrice: {
    fontFamily: fonts.bold,
    color: '#B71C1C',
  },
  originalPrice: {
    fontFamily: fonts.regular,
    color: color.textMuted,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: '#FFEBEE',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  discountText: {
    fontFamily: fonts.bold,
    color: '#B71C1C',
    fontSize: 11,
  },
  free: {
    fontFamily: fonts.bold,
    color: color.primary,
  },
  unknown: {
    fontFamily: fonts.regular,
    color: color.textMuted,
    fontStyle: 'italic',
  },
  onRequest: {
    fontFamily: fonts.regular,
    color: color.textMuted,
  },
  source: {
    fontFamily: fonts.regular,
    color: color.textMuted,
    marginTop: 2,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function discountPercent(original: number, sale: number): number {
  return Math.round(((original - sale) / original) * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PriceDisplay({
  price,
  arabicNumerals = true,
  shortCurrency = true,
  size = 'medium',
  source,
  style,
  testID,
}: PriceDisplayProps) {
  const fs = FONT_SIZES[size];
  const mainStyle: TextStyle = { fontSize: fs.main };
  const secondaryStyle: TextStyle = { fontSize: fs.secondary };
  const labelStyle: TextStyle = { fontSize: fs.label };

  function renderPrice() {
    switch (price.kind) {
      case 'known':
        return (
          <View style={s.row}>
            <Text style={[s.amount, mainStyle]}>
              {formatIQD(price.amount, arabicNumerals, shortCurrency)}
            </Text>
          </View>
        );

      case 'range': {
        const fromStr = formatIQD(price.min, arabicNumerals, shortCurrency);
        const toStr = formatIQD(price.max, arabicNumerals, shortCurrency);
        return (
          <View style={s.row}>
            <Text style={[s.rangeFrom, mainStyle]}>{fromStr}</Text>
            <Text style={[s.rangeSep, secondaryStyle]}> — </Text>
            <Text style={[s.rangeTo, mainStyle]}>{toStr}</Text>
          </View>
        );
      }

      case 'sale': {
        const pct = discountPercent(price.original, price.sale);
        return (
          <View style={{ gap: 4 }}>
            <View style={s.row}>
              <Text style={[s.salePrice, mainStyle]}>
                {formatIQD(price.sale, arabicNumerals, shortCurrency)}
              </Text>
              <Text style={[s.originalPrice, secondaryStyle]}>
                {formatIQD(price.original, arabicNumerals, shortCurrency)}
              </Text>
            </View>
            <View style={s.discountBadge}>
              <Text style={[s.discountText, labelStyle]}>
                {arabicNumerals ? toArabicIndic(String(pct)) : pct}% خصم
              </Text>
            </View>
          </View>
        );
      }

      case 'free':
        return <Text style={[s.free, mainStyle]}>مجاني</Text>;

      case 'unknown':
        return <Text style={[s.unknown, mainStyle]}>السعر غير متوفر</Text>;

      case 'on_request':
        return <Text style={[s.onRequest, mainStyle]}>السعر عند الطلب</Text>;

      default:
        return null;
    }
  }

  return (
    <View style={[s.root, style]} testID={testID}>
      {renderPrice()}
      {source && (
        <Text style={[s.source, labelStyle]} numberOfLines={1}>
          المصدر: {source}
        </Text>
      )}
    </View>
  );
}

PriceDisplay.displayName = 'PriceDisplay';

// ── Helpers exported for tests ────────────────────────────────────────────────
export { formatIQD, formatThousands };
