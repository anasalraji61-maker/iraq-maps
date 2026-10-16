/**
 * PromoBadge — compact badge shown on place cards to surface active promotions.
 *
 * Variants:
 *  - discount: "20% خصم" in red/pink
 *  - bogo:     "اشترِ 1 احصل على 1" badge
 *  - free:     "مجاني" badge
 *  - new:      "جديد" blue badge for recently-added promos
 *  - expiry:   countdown chip (e.g. "ينتهي خلال 3 س")
 *
 * Usage:
 *   <PromoBadge type="percentage_discount" value={20} />
 *   <PromoBadge type="buy_one_get_one" />
 *   <PromoBadge type="new" />
 *   <PromoBadge type="expiry" validTo="2026-10-17T20:00:00Z" />
 */

import React, { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  I18nManager,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Types ─────────────────────────────────────────────────────────────────────

export type PromoBadgeType =
  | 'percentage_discount'
  | 'fixed_discount'
  | 'buy_one_get_one'
  | 'free_item'
  | 'happy_hour'
  | 'first_visit'
  | 'new'
  | 'expiry';

export interface PromoBadgeProps {
  type: PromoBadgeType;
  /** Discount value — used for percentage_discount (0..100) and fixed_discount (IQD). */
  value?: number;
  /** ISO datetime — used for the expiry countdown. */
  validTo?: string;
  /** Whether to show the pulse animation (default: true for percentage_discount). */
  animated?: boolean;
  /** Additional style applied to the outer container. */
  style?: ViewStyle;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const THEME = {
  discount: { bg: '#FCE4EC', text: '#C62828', border: '#F48FB1' },
  bogo:     { bg: '#E8EAF6', text: '#3949AB', border: '#9FA8DA' },
  free:     { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' },
  happyHr:  { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' },
  firstV:   { bg: '#E3F2FD', text: '#1565C0', border: '#90CAF9' },
  newBadge: { bg: '#E3F2FD', text: '#1565C0', border: '#90CAF9' },
  expiry:   { bg: '#FFF8E1', text: '#F57F17', border: '#FFE082' },
  expiryUrgent: { bg: '#FFEBEE', text: '#B71C1C', border: '#EF9A9A' },
} as const;

// ── Countdown helper ──────────────────────────────────────────────────────────

function useCountdown(validTo?: string): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!validTo) return;
    function update() {
      const ms = new Date(validTo!).getTime() - Date.now();
      if (ms <= 0) { setLabel(t('promoBadge.expired')); return; }
      const totalMinutes = Math.floor(ms / 60_000);
      if (totalMinutes < 60) {
        setLabel(t('promoBadge.expiresMinutes', { n: totalMinutes }));
      } else {
        const h = Math.floor(totalMinutes / 60);
        if (h < 24) {
          setLabel(t('promoBadge.expiresHours', { n: h }));
        } else {
          const d = Math.floor(h / 24);
          setLabel(t('promoBadge.expiresDays', { n: d }));
        }
      }
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [validTo]);

  return label;
}

// ── Pulse animation ───────────────────────────────────────────────────────────

function PulseDot({ color }: { color: string }): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.8, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={[
        dotStyles.dot,
        { backgroundColor: color, transform: [{ scale }], opacity },
      ]}
      accessibilityElementsHidden
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PromoBadge({
  type,
  value,
  validTo,
  animated,
  style,
}: PromoBadgeProps): ReactElement | null {
  const countdown = useCountdown(type === 'expiry' ? validTo : undefined);

  // Determine theme and label based on type.
  let theme: (typeof THEME)[keyof typeof THEME];
  let label: string;
  let showPulse = animated ?? false;

  switch (type) {
    case 'percentage_discount':
      theme = THEME.discount;
      label = value != null ? t('promoBadge.percentOff', { n: value }) : t('promoBadge.discount');
      showPulse = animated ?? true;
      break;

    case 'fixed_discount':
      theme = THEME.discount;
      label = value != null
        ? t('promoBadge.fixedOff', { n: value.toLocaleString('ar-IQ') })
        : t('promoBadge.discount');
      break;

    case 'buy_one_get_one':
      theme = THEME.bogo;
      label = t('promoBadge.bogo');
      break;

    case 'free_item':
      theme = THEME.free;
      label = t('promoBadge.freeItem');
      break;

    case 'happy_hour':
      theme = THEME.happyHr;
      label = t('promoBadge.happyHour');
      break;

    case 'first_visit':
      theme = THEME.firstV;
      label = t('promoBadge.firstVisit');
      break;

    case 'new':
      theme = THEME.newBadge;
      label = t('promoBadge.new');
      break;

    case 'expiry': {
      if (!countdown) return null;
      const ms = validTo ? new Date(validTo).getTime() - Date.now() : Infinity;
      const urgent = ms < 3_600_000; // < 1 h
      theme = urgent ? THEME.expiryUrgent : THEME.expiry;
      label = countdown;
      showPulse = animated ?? urgent;
      break;
    }

    default:
      return null;
  }

  const containerStyle: ViewStyle[] = [
    styles.badge,
    {
      backgroundColor: theme.bg,
      borderColor: theme.border,
    },
    style ?? {},
  ];

  const textStyle: TextStyle = {
    ...styles.label,
    color: theme.text,
  };

  return (
    <View style={containerStyle} accessibilityLabel={label} accessibilityRole="text">
      {showPulse && <PulseDot color={theme.text} />}
      <Text style={textStyle} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ── Compound: row of badges for a single place ───────────────────────────────

export interface PlacePromoBadgesProps {
  /** Promotion type of the best active promo for this place. */
  promoType?: PromoBadgeType;
  /** Discount value for percentage or fixed promo. */
  promoValue?: number;
  /** Expiry datetime of the active promo. */
  promoValidTo?: string;
  /** Whether the promo was added within the last 7 days. */
  isNew?: boolean;
  style?: ViewStyle;
}

/**
 * Renders up to two badges: the primary discount badge and optionally a "new" or expiry indicator.
 */
export function PlacePromoBadges({
  promoType,
  promoValue,
  promoValidTo,
  isNew,
  style,
}: PlacePromoBadgesProps): ReactElement | null {
  if (!promoType && !isNew) return null;

  const msLeft = promoValidTo ? new Date(promoValidTo).getTime() - Date.now() : Infinity;
  const endingSoon = msLeft < 86_400_000 && msLeft > 0; // < 24 h

  return (
    <View style={[rowStyles.row, style]}>
      {promoType && (
        <PromoBadge type={promoType} value={promoValue} />
      )}
      {isNew && !promoType && (
        <PromoBadge type="new" />
      )}
      {endingSoon && promoValidTo && (
        <PromoBadge type="expiry" validTo={promoValidTo} />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

const dotStyles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
