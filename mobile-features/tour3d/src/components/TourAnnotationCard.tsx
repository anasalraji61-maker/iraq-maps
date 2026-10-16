/**
 * TourAnnotationCard – rich popup card for a selected tour annotation.
 * Shows type badge, title, description, icon type, language tabs, linked-place
 * navigation button, and a share stub.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Tour3DAnnotation, Tour3DIconType } from '@iraq-maps/contracts';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnnotationCardLanguage = 'ar' | 'ckb' | 'en';

export interface TourAnnotationCardProps {
  annotation: Tour3DAnnotation;
  language?: AnnotationCardLanguage;
  onClose?: () => void;
  onNavigateToPlace?: (placeId: string) => void;
  onLanguageChange?: (lang: AnnotationCardLanguage) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_TYPE_META: Record<Tour3DIconType, { emoji: string; color: string }> = {
  info: { emoji: 'ℹ️', color: '#1a3a5c' },
  place: { emoji: '📍', color: '#c9a84c' },
  photo: { emoji: '📷', color: '#6c757d' },
  food: { emoji: '🍽', color: '#e67e22' },
  mosque: { emoji: '🕌', color: '#27ae60' },
  historic: { emoji: '🏛', color: '#8B4513' },
  shop: { emoji: '🛍', color: '#9b59b6' },
};

function iconTypeMeta(iconType: Tour3DIconType) {
  return ICON_TYPE_META[iconType] ?? ICON_TYPE_META.info;
}

function getLabel(ann: Tour3DAnnotation, lang: AnnotationCardLanguage): string {
  if (lang === 'ckb' && ann.labelCkb) return ann.labelCkb;
  if (lang === 'en' && ann.labelEn) return ann.labelEn;
  return ann.labelAr;
}

/** Stub description paragraphs keyed by icon type — looked up via i18n. */
function getDescription(iconType: Tour3DIconType, _lang: AnnotationCardLanguage): string {
  // All descriptions are sourced from i18n; lang param reserved for future per-language fallback.
  const keyMap: Partial<Record<Tour3DIconType, string>> = {
    historic: 'annotation.historicalDesc',
    mosque: 'annotation.mosqueDesc',
    info: 'annotation.currentDesc',
    place: 'annotation.placeDesc',
    food: 'annotation.foodDesc',
    photo: 'annotation.photoDesc',
    shop: 'annotation.shopDesc',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t((keyMap[iconType] ?? 'annotation.currentDesc') as any);
}

// ---------------------------------------------------------------------------
// Language tab
// ---------------------------------------------------------------------------

interface LangTabProps {
  lang: AnnotationCardLanguage;
  current: AnnotationCardLanguage;
  label: string;
  accentColor: string;
  onPress: (lang: AnnotationCardLanguage) => void;
}

function LangTab({ lang, current, label, accentColor, onPress }: LangTabProps) {
  const isActive = lang === current;
  return (
    <Pressable
      style={[tabStyles.tab, isActive && { borderBottomColor: accentColor }]}
      onPress={() => onPress(lang)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={label}
    >
      <Text style={[tabStyles.text, isActive && { color: accentColor, fontWeight: '700' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const tabStyles = StyleSheet.create({
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  text: { fontSize: 13, color: '#888', fontWeight: '500' },
});

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function TourAnnotationCard({
  annotation,
  language = 'ar',
  onClose,
  onNavigateToPlace,
  onLanguageChange,
}: TourAnnotationCardProps) {
  const [activeLang, setActiveLang] = useState<AnnotationCardLanguage>(language);

  const slideAnim = useRef(new Animated.Value(80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 70,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 70,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, opacityAnim, scaleAnim]);

  useEffect(() => {
    setActiveLang(language);
  }, [language]);

  const handleLangChange = (lang: AnnotationCardLanguage) => {
    setActiveLang(lang);
    onLanguageChange?.(lang);
  };

  const meta = iconTypeMeta(annotation.iconType);
  const label = getLabel(annotation, activeLang);
  const description = getDescription(annotation.iconType, activeLang);
  const hasLinkedPlace = !!annotation.linkedPlaceId;

  return (
    <Animated.View
      style={[
        cardStyles.container,
        {
          transform: [
            { translateY: slideAnim },
            { scale: scaleAnim },
          ],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* ── Top row: icon badge + close ─────────────────────────────────── */}
      <View style={cardStyles.topRow}>
        <View style={[cardStyles.iconBadge, { backgroundColor: meta.color }]}>
          <Text style={cardStyles.iconEmoji}>{meta.emoji}</Text>
          <Text style={cardStyles.iconLabel}>
            {t(`annotation.iconType.${annotation.iconType}` as Parameters<typeof t>[0])}
          </Text>
        </View>

        <View style={cardStyles.topActions}>
          {/* Share stub */}
          <Pressable
            style={cardStyles.actionBtn}
            accessibilityRole="button"
            accessibilityLabel={t('annotation.share')}
          >
            <Text style={cardStyles.actionIcon}>↗</Text>
          </Pressable>

          {/* Close */}
          {onClose && (
            <Pressable
              style={[cardStyles.actionBtn, cardStyles.closeBtn]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('annotation.close')}
            >
              <Text style={cardStyles.closeIcon}>{t('icon.close')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Language tabs ────────────────────────────────────────────────── */}
      <View style={cardStyles.langTabsRow}>
        <LangTab lang="ar" current={activeLang} label={t('audio.languageAr')} accentColor={meta.color} onPress={handleLangChange} />
        <LangTab lang="ckb" current={activeLang} label={t('audio.languageCkb')} accentColor={meta.color} onPress={handleLangChange} />
        <LangTab lang="en" current={activeLang} label={t('audio.languageEn')} accentColor={meta.color} onPress={handleLangChange} />
      </View>

      {/* ── Title ────────────────────────────────────────────────────────── */}
      <Text style={cardStyles.title}>{label}</Text>

      {/* ── Description ──────────────────────────────────────────────────── */}
      {description.length > 0 && (
        <Text style={cardStyles.description}>{description}</Text>
      )}

      {/* ── Location coordinates ─────────────────────────────────────────── */}
      <View style={cardStyles.coordRow}>
        <Text style={cardStyles.coordIcon}>📍</Text>
        <Text style={cardStyles.coordText}>
          {annotation.location[1].toFixed(5)}, {annotation.location[0].toFixed(5)}
        </Text>
        {annotation.altitude > 0 && (
          <Text style={cardStyles.altText}>{t('icon.altPrefix')} {annotation.altitude}{t('icon.altSuffix')}</Text>
        )}
      </View>

      {/* ── Navigate to real location ────────────────────────────────────── */}
      {hasLinkedPlace && (
        <Pressable
          style={[cardStyles.navButton, { backgroundColor: meta.color }]}
          onPress={() => annotation.linkedPlaceId && onNavigateToPlace?.(annotation.linkedPlaceId)}
          accessibilityRole="button"
        >
          <Text style={cardStyles.navIcon}>🗺</Text>
          <Text style={cardStyles.navText}>{t('annotation.navigateToPlace')}</Text>
          <Text style={cardStyles.navArrow}>{'←'}</Text>
        </Pressable>
      )}

      {/* ── Audio stub ───────────────────────────────────────────────────── */}
      <Pressable style={cardStyles.audioRow} accessibilityRole="button" accessibilityLabel={t('annotation.audioPlay')}>
        <View style={cardStyles.audioPlayBtn}>
          <Text style={cardStyles.audioPlayIcon}>▶</Text>
        </View>
        <View style={cardStyles.audioInfo}>
          <Text style={cardStyles.audioTitle}>{t('annotation.audioGuide')}</Text>
          <Text style={cardStyles.audioDuration}>~2:30</Text>
        </View>
        <Text style={cardStyles.audioHint}>{t('annotation.tapToLearnMore')}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 0,
  },
  iconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  iconEmoji: { fontSize: 16 },
  iconLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  topActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 14, color: '#555', fontWeight: '700' },
  closeBtn: { backgroundColor: '#fce4e4' },
  closeIcon: { fontSize: 12, color: '#c0392b', fontWeight: '800' },
  langTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e0d5',
    marginTop: 12,
    marginHorizontal: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a1a',
    paddingHorizontal: 14,
    paddingTop: 12,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  description: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingTop: 8,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  coordIcon: { fontSize: 12, opacity: 0.5 },
  coordText: {
    fontSize: 11,
    color: '#aaa',
    fontVariant: ['tabular-nums'],
  },
  altText: {
    fontSize: 11,
    color: '#aaa',
    marginStart: 4,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  navIcon: { fontSize: 16 },
  navText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14 },
  navArrow: { color: '#fff', fontSize: 18, fontWeight: '800' },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f0e8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#c9a84c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayIcon: { fontSize: 14, color: '#fff' },
  audioInfo: { flex: 1 },
  audioTitle: { fontSize: 13, fontWeight: '600', color: '#333' },
  audioDuration: { fontSize: 11, color: '#888', marginTop: 2 },
  audioHint: { fontSize: 11, color: '#aaa' },
});
