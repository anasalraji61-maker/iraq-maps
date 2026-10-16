/**
 * BadgesScreen — showcase of all badges, earned and locked.
 *
 * Features:
 *   - 2-column grid of all 20 system badges
 *   - Earned: full colour with earned date
 *   - Locked: grayscale with progress bar and hint text
 *   - Tap a badge → detail bottom sheet with progress / share button
 *   - Filter tabs: الكل / مكتسبة / مقفلة
 *   - Header summary: earned count / total
 *   - Share badge via system share sheet
 *   - Pull to refresh
 *
 * All text via t().  Layouts use start/end (RTL-safe).
 * Route: account/badges
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  I18nManager,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../strings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const td = t as (k: any, opts?: any) => string;

I18nManager.forceRTL(true);

// ─── Icons ────────────────────────────────────────────────────────────────────
const ICON_BACK   = '←';
const ICON_SHARE  = '↗';
const ICON_LOCK   = '🔒';
const ICON_CHECK  = '✓';
const ICON_CLOSE  = '✕';
const ICON_TROPHY = '🏆';
const ICON_STAR   = '⭐';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:      '#1565C0',
  primaryLight: '#E3F2FD',
  accent:       '#FF6F00',
  accentLight:  '#FFF8E1',
  surface:      '#FFFFFF',
  bg:           '#F5F7FA',
  textPrimary:  '#1A1A2E',
  textSecondary:'#546E7A',
  textDisabled: '#B0BEC5',
  border:       '#E0E0E0',
  shadow:       'rgba(0,0,0,0.08)',
  overlay:      'rgba(0,0,0,0.55)',
  badge:        '#7B1FA2',
  badgeLight:   '#F3E5F5',
  locked:       '#9E9E9E',
  lockedBg:     '#F5F5F5',
  earned:       '#2E7D32',
  earnedLight:  '#E8F5E9',
  progress:     '#1565C0',
  progressBg:   '#E3F2FD',
};

// ─── Badge type (matches contracts shape) ─────────────────────────────────────

interface BadgeData {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  icon: string;
  hint_ar: string;
  hint_en: string;
  earnedAt: string | null;
  earned: boolean;
  progress: number;        // 0–1
  targetCount: number;
  currentCount: number;
}

// ─── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'earned' | 'locked';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_BADGES: BadgeData[] = [
  { id: 'b1',  slug: 'first_checkin',      title_ar: 'أول زيارة',         title_en: 'First Visit',        icon: '🌟', earned: true,  earnedAt: '2025-03-01T10:00:00Z', progress: 1,    targetCount: 1,   currentCount: 1,  description_ar: 'سجّلت أول زيارة!', description_en: 'First check-in!', hint_ar: 'سجّل أول زيارة.', hint_en: 'Check in for the first time.' },
  { id: 'b2',  slug: 'restaurant_lover',   title_ar: 'عاشق المطاعم',      title_en: 'Restaurant Lover',   icon: '🍽️', earned: true,  earnedAt: '2025-04-15T14:30:00Z', progress: 1,    targetCount: 10,  currentCount: 10, description_ar: '10 مطاعم!', description_en: '10 restaurants!', hint_ar: 'سجّل 10 زيارات في المطاعم.', hint_en: 'Visit 10 restaurants.' },
  { id: 'b3',  slug: 'shrine_visitor',     title_ar: 'زائر الأضرحة',      title_en: 'Shrine Visitor',     icon: '🕌', earned: false, earnedAt: null,                   progress: 0.6,  targetCount: 5,   currentCount: 3,  description_ar: 'زر 5 أضرحة.', description_en: 'Visit 5 shrines.', hint_ar: 'سجّل 5 زيارات في الأضرحة أو المساجد.', hint_en: 'Visit 5 shrines or mosques.' },
  { id: 'b4',  slug: 'explorer',           title_ar: 'مستكشف',             title_en: 'Explorer',           icon: '🎯', earned: false, earnedAt: null,                   progress: 0.33, targetCount: 3,   currentCount: 1,  description_ar: '3 أماكن في يوم واحد.', description_en: '3 places in one day.', hint_ar: 'زر 3 أماكن في يوم واحد.', hint_en: 'Visit 3 different places in one day.' },
  { id: 'b5',  slug: 'streak_7',           title_ar: 'متواصل',             title_en: 'On a Roll',          icon: '🔥', earned: true,  earnedAt: '2025-05-10T08:00:00Z', progress: 1,    targetCount: 7,   currentCount: 7,  description_ar: '7 أيام متتالية!', description_en: '7-day streak!', hint_ar: 'سجّل 7 أيام متتالية.', hint_en: 'Check in 7 days in a row.' },
  { id: 'b6',  slug: 'streak_30',          title_ar: 'الأسطورة',           title_en: 'Legend',             icon: '💎', earned: false, earnedAt: null,                   progress: 0.23, targetCount: 30,  currentCount: 7,  description_ar: '30 يوماً متتالياً!', description_en: '30-day streak!', hint_ar: 'سجّل 30 يوماً متتالياً.', hint_en: 'Check in 30 days in a row.' },
  { id: 'b7',  slug: 'baghdad_king',       title_ar: 'ملك بغداد',          title_en: 'King of Baghdad',    icon: '👑', earned: false, earnedAt: null,                   progress: 0.12, targetCount: 100, currentCount: 12, description_ar: '100 زيارة في بغداد.', description_en: '100 Baghdad check-ins.', hint_ar: 'سجّل 100 زيارة في بغداد.', hint_en: 'Check in 100 times in Baghdad.' },
  { id: 'b8',  slug: 'ramadan_visitor',    title_ar: 'زائر رمضان',         title_en: 'Ramadan Visitor',    icon: '🌙', earned: true,  earnedAt: '2025-03-15T19:00:00Z', progress: 1,    targetCount: 1,   currentCount: 1,  description_ar: 'زيارة في رمضان!', description_en: 'Check-in during Ramadan!', hint_ar: 'سجّل زيارة في رمضان.', hint_en: 'Check in during Ramadan.' },
  { id: 'b9',  slug: 'pioneer',            title_ar: 'رائد',               title_en: 'Pioneer',            icon: '⭐', earned: false, earnedAt: null,                   progress: 0,    targetCount: 1,   currentCount: 0,  description_ar: 'أول زيارة في مكان جديد.', description_en: 'First check-in at a new place.', hint_ar: 'كن أول من يزور مكاناً.', hint_en: 'Be first to check in anywhere.' },
  { id: 'b10', slug: 'regular',            title_ar: 'زبون دائم',          title_en: 'Regular',            icon: '📍', earned: false, earnedAt: null,                   progress: 0.3,  targetCount: 10,  currentCount: 3,  description_ar: 'زر نفس المكان 10 مرات.', description_en: 'Visit same place 10 times.', hint_ar: 'زر نفس المكان 10 مرات.', hint_en: 'Visit the same place 10 times.' },
  { id: 'b11', slug: 'night_owl',          title_ar: 'بومة الليل',         title_en: 'Night Owl',          icon: '🦉', earned: false, earnedAt: null,                   progress: 0,    targetCount: 1,   currentCount: 0,  description_ar: 'زيارة بعد منتصف الليل.', description_en: 'Check in after midnight.', hint_ar: 'سجّل زيارة بعد منتصف الليل.', hint_en: 'Check in after midnight.' },
  { id: 'b12', slug: 'early_bird',         title_ar: 'باكر الصباح',        title_en: 'Early Bird',         icon: '🌅', earned: false, earnedAt: null,                   progress: 0,    targetCount: 1,   currentCount: 0,  description_ar: 'زيارة قبل 7 صباحاً.', description_en: 'Check in before 7 am.', hint_ar: 'سجّل زيارة قبل 7 صباحاً.', hint_en: 'Check in before 7 am.' },
  { id: 'b13', slug: 'weekend_warrior',    title_ar: 'محارب الجمعة',       title_en: 'Friday Warrior',     icon: '🎉', earned: false, earnedAt: null,                   progress: 0.4,  targetCount: 5,   currentCount: 2,  description_ar: '5 زيارات يوم الجمعة.', description_en: '5 Friday check-ins.', hint_ar: 'سجّل 5 زيارات يوم الجمعة.', hint_en: 'Check in 5 times on Fridays.' },
  { id: 'b14', slug: 'road_tripper',       title_ar: 'متجول المدن',        title_en: 'Road Tripper',       icon: '🗺️', earned: false, earnedAt: null,                   progress: 0.33, targetCount: 3,   currentCount: 1,  description_ar: 'زر 3 مدن.', description_en: 'Visit 3 cities.', hint_ar: 'زر 3 مدن مختلفة.', hint_en: 'Visit 3 different cities.' },
  { id: 'b15', slug: 'cafe_hopper',        title_ar: 'جوّال المقاهي',      title_en: 'Café Hopper',        icon: '☕', earned: false, earnedAt: null,                   progress: 0.2,  targetCount: 15,  currentCount: 3,  description_ar: '15 مقهى.', description_en: '15 café check-ins.', hint_ar: 'زر 15 مقهى.', hint_en: 'Visit 15 cafés.' },
  { id: 'b16', slug: 'history_buff',       title_ar: 'عاشق التاريخ',       title_en: 'History Buff',       icon: '🏛️', earned: false, earnedAt: null,                   progress: 0.1,  targetCount: 10,  currentCount: 1,  description_ar: '10 مواقع تاريخية.', description_en: '10 historical site check-ins.', hint_ar: 'زر 10 مواقع تاريخية.', hint_en: 'Visit 10 historical sites.' },
  { id: 'b17', slug: 'shopaholic',         title_ar: 'عاشق التسوق',        title_en: 'Shopaholic',         icon: '🛍️', earned: false, earnedAt: null,                   progress: 0.05, targetCount: 20,  currentCount: 1,  description_ar: '20 مركز تسوق.', description_en: '20 mall check-ins.', hint_ar: 'زر 20 مركز تسوق.', hint_en: 'Visit 20 shopping malls.' },
  { id: 'b18', slug: 'centurion',          title_ar: 'المئوي',             title_en: 'Centurion',          icon: '🏆', earned: false, earnedAt: null,                   progress: 0.25, targetCount: 100, currentCount: 25, description_ar: '100 زيارة إجمالية.', description_en: '100 total check-ins.', hint_ar: 'سجّل 100 زيارة.', hint_en: 'Check in 100 times total.' },
  { id: 'b19', slug: 'social_butterfly',   title_ar: 'الفراشة الاجتماعية', title_en: 'Social Butterfly',   icon: '🦋', earned: false, earnedAt: null,                   progress: 0,    targetCount: 5,   currentCount: 0,  description_ar: 'زر مع 5 أصدقاء.', description_en: 'Visit with 5 friends.', hint_ar: 'شارك زياراتك مع 5 أصدقاء.', hint_en: 'Check in with 5 companions.' },
  { id: 'b20', slug: 'eid_celebrant',      title_ar: 'مبارك العيد',        title_en: 'Eid Celebrant',      icon: '🌟', earned: false, earnedAt: null,                   progress: 0,    targetCount: 1,   currentCount: 0,  description_ar: 'زيارة في يوم العيد.', description_en: 'Check in on Eid.', hint_ar: 'سجّل زيارة يوم العيد.', hint_en: 'Check in on Eid day.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEarnedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Baghdad',
  });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }): ReactElement {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: value,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [value, width]);

  const widthPct = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={pbStyles.track}>
      <Animated.View style={[pbStyles.fill, { width: widthPct }]} />
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: {
    height: 5,
    backgroundColor: C.progressBg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: C.progress,
    borderRadius: 3,
  },
});

// ─── Badge card ───────────────────────────────────────────────────────────────

function BadgeCard({
  badge,
  onPress,
}: {
  badge: BadgeData;
  onPress: (badge: BadgeData) => void;
}): ReactElement {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onPress(badge));
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1 }}>
      <TouchableOpacity
        style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}
        onPress={handlePress}
        activeOpacity={0.9}
        accessibilityLabel={badge.title_ar}
        accessibilityHint={badge.earned ? td('badges.earned_hint') : badge.hint_ar}
      >
        {/* Lock overlay for unearned */}
        {!badge.earned && (
          <View style={styles.lockOverlay}>
            <Text style={styles.lockIcon}>{ICON_LOCK}</Text>
          </View>
        )}

        {/* Icon */}
        <View style={[styles.badgeIconWrap, !badge.earned && styles.badgeIconWrapLocked]}>
          <Text style={[styles.badgeIcon, !badge.earned && styles.badgeIconLocked]}>
            {badge.icon}
          </Text>
        </View>

        {/* Title */}
        <Text
          style={[styles.badgeTitle, !badge.earned && styles.badgeTitleLocked]}
          numberOfLines={2}
        >
          {badge.title_ar}
        </Text>

        {/* Earned date or progress */}
        {badge.earned && badge.earnedAt ? (
          <View style={styles.earnedRow}>
            <Text style={styles.earnedCheck}>{ICON_CHECK}</Text>
            <Text style={styles.earnedDate} numberOfLines={1}>
              {formatEarnedDate(badge.earnedAt)}
            </Text>
          </View>
        ) : (
          <View style={styles.progressWrap}>
            <ProgressBar value={badge.progress} />
            <Text style={styles.progressLabel}>
              {badge.currentCount}/{badge.targetCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Badge detail bottom sheet ────────────────────────────────────────────────

function BadgeDetailSheet({
  badge,
  onClose,
}: {
  badge: BadgeData;
  onClose: () => void;
}): ReactElement {
  const slideY = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, friction: 8, useNativeDriver: true }).start();
  }, [slideY]);

  const handleClose = () => {
    Animated.timing(slideY, { toValue: 400, duration: 250, useNativeDriver: true }).start(onClose);
  };

  const handleShare = async () => {
    try {
      const message = badge.earned
        ? `حصلت على شارة "${badge.title_ar}" ${badge.icon} في تطبيق خرائط العراق! 🗺️`
        : `أسعى للحصول على شارة "${badge.title_ar}" ${badge.icon} في تطبيق خرائط العراق!`;
      await Share.share({ message });
    } catch {
      // User cancelled or share failed — no action needed
    }
  };

  const remainingCount = badge.targetCount - badge.currentCount;

  return (
    <Modal transparent animationType="none" visible onRequestClose={handleClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {/* Close */}
          <TouchableOpacity style={styles.sheetCloseBtn} onPress={handleClose} accessibilityLabel={td('nav.close')}>
            <Text style={styles.sheetCloseIcon}>{ICON_CLOSE}</Text>
          </TouchableOpacity>

          {/* Badge icon */}
          <View style={[styles.sheetIconWrap, !badge.earned && styles.sheetIconWrapLocked]}>
            <Text style={[styles.sheetIcon, !badge.earned && styles.sheetIconLocked]}>
              {badge.icon}
            </Text>
            {badge.earned && (
              <View style={styles.sheetEarnedBadge}>
                <Text style={styles.sheetEarnedBadgeText}>{ICON_CHECK}</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.sheetTitle}>{badge.title_ar}</Text>
          <Text style={styles.sheetTitleEn}>{badge.title_en}</Text>

          {/* Status */}
          {badge.earned ? (
            <View style={styles.sheetEarnedChip}>
              <Text style={styles.sheetEarnedChipIcon}>{ICON_STAR}</Text>
              <Text style={styles.sheetEarnedChipText}>
                {td('badges.earned_on')} {badge.earnedAt ? formatEarnedDate(badge.earnedAt) : ''}
              </Text>
            </View>
          ) : (
            <View style={styles.sheetLockedChip}>
              <Text style={styles.sheetLockedChipIcon}>{ICON_LOCK}</Text>
              <Text style={styles.sheetLockedChipText}>{td('badges.locked')}</Text>
            </View>
          )}

          {/* Description */}
          <Text style={styles.sheetDesc}>{badge.description_ar}</Text>

          {/* Progress (locked only) */}
          {!badge.earned && (
            <View style={styles.sheetProgressWrap}>
              <View style={styles.sheetProgressHeader}>
                <Text style={styles.sheetProgressLabel}>{td('badges.progress')}</Text>
                <Text style={styles.sheetProgressCount}>
                  {badge.currentCount}/{badge.targetCount}
                </Text>
              </View>
              <ProgressBar value={badge.progress} />
              {remainingCount > 0 && (
                <Text style={styles.sheetProgressRemaining}>
                  {td('badges.remaining', { count: remainingCount })}
                </Text>
              )}
            </View>
          )}

          {/* Hint (locked only) */}
          {!badge.earned && (
            <View style={styles.hintBox}>
              <Text style={styles.hintLabel}>{td('badges.hint')}</Text>
              <Text style={styles.hintText}>{badge.hint_ar}</Text>
            </View>
          )}

          {/* Share button */}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
            accessibilityLabel={td('badges.share')}
          >
            <Text style={styles.shareBtnIcon}>{ICON_SHARE}</Text>
            <Text style={styles.shareBtnText}>{td('badges.share')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Header summary ───────────────────────────────────────────────────────────

function BadgeSummaryHeader({ badges }: { badges: BadgeData[] }): ReactElement {
  const earned = badges.filter((b) => b.earned).length;
  const total = badges.length;
  const pct = total > 0 ? earned / total : 0;

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIconWrap}>
        <Text style={styles.summaryIcon}>{ICON_TROPHY}</Text>
      </View>
      <View style={styles.summaryBody}>
        <Text style={styles.summaryCount}>
          {earned}
          <Text style={styles.summaryTotal}>/{total}</Text>
        </Text>
        <Text style={styles.summaryLabel}>{td('badges.summary_label')}</Text>
        <View style={styles.summaryProgressWrap}>
          <ProgressBar value={pct} />
        </View>
        <Text style={styles.summaryPct}>{Math.round(pct * 100)}%</Text>
      </View>
    </View>
  );
}

// ─── Filter tabs ───────────────────────────────────────────────────────────────

function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: FilterTab;
  counts: { all: number; earned: number; locked: number };
  onChange: (tab: FilterTab) => void;
}): ReactElement {
  const tabs: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: 'all',    label: td('badges.filter_all'),    count: counts.all },
    { key: 'earned', label: td('badges.filter_earned'), count: counts.earned },
    { key: 'locked', label: td('badges.filter_locked'), count: counts.locked },
  ];

  return (
    <View style={styles.tabRow}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tabBtn, active === tab.key && styles.tabBtnActive]}
          onPress={() => onChange(tab.key)}
          accessibilityLabel={`${tab.label} (${tab.count})`}
        >
          <Text style={[styles.tabBtnText, active === tab.key && styles.tabBtnTextActive]}>
            {tab.label}
          </Text>
          <View style={[styles.tabCount, active === tab.key && styles.tabCountActive]}>
            <Text style={[styles.tabCountText, active === tab.key && styles.tabCountTextActive]}>
              {tab.count}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BadgesScreen(): ReactElement {
  const router = useRouter();
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selected, setSelected] = useState<BadgeData | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    // TODO: real API call via ts-rest client
    await new Promise((r) => setTimeout(r, 600));
    setBadges(MOCK_BADGES);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const refresh = useCallback(() => load(true), [load]);

  const filtered = badges.filter((b) => {
    if (filter === 'earned') return b.earned;
    if (filter === 'locked') return !b.earned;
    return true;
  });

  const counts = {
    all:    badges.length,
    earned: badges.filter((b) => b.earned).length,
    locked: badges.filter((b) => !b.earned).length,
  };

  // Render pairs for 2-column grid using a FlatList with numColumns
  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel={td('nav.back')}
        >
          <Text style={styles.backIcon}>{ICON_BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{td('badges.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>{td('badges.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[C.primary]} />
          }
          ListHeaderComponent={
            <>
              <BadgeSummaryHeader badges={badges} />
              <FilterTabs active={filter} counts={counts} onChange={setFilter} />
            </>
          }
          renderItem={({ item }) => (
            <BadgeCard badge={item} onPress={setSelected} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>{ICON_LOCK}</Text>
              <Text style={styles.emptyText}>
                {filter === 'earned'
                  ? td('badges.empty_earned')
                  : td('badges.empty_locked')}
              </Text>
            </View>
          }
        />
      )}

      {/* Badge detail sheet */}
      {selected && (
        <BadgeDetailSheet
          badge={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: { padding: 6, width: 36 },
  backIcon: { fontSize: 22, color: C.primary },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
  },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: C.textSecondary },

  // List
  listContent: { padding: 16, gap: 16 },
  columnWrapper: { gap: 12 },

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    gap: 16,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  summaryIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIcon: { fontSize: 32 },
  summaryBody: { flex: 1, gap: 4 },
  summaryCount: { fontSize: 28, fontWeight: '800', color: C.badge },
  summaryTotal: { fontSize: 16, fontWeight: '400', color: C.textSecondary },
  summaryLabel: { fontSize: 13, color: C.textSecondary },
  summaryProgressWrap: { marginTop: 4 },
  summaryPct: { fontSize: 11, color: C.textDisabled, marginTop: 2 },

  // Filter tabs
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    gap: 6,
  },
  tabBtnActive: { borderColor: C.primary, backgroundColor: C.primaryLight },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  tabBtnTextActive: { color: C.primary },
  tabCount: {
    backgroundColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabCountActive: { backgroundColor: C.primary },
  tabCountText: { fontSize: 11, color: C.textSecondary, fontWeight: '700' },
  tabCountTextActive: { color: C.surface },

  // Badge card
  badgeCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
    minHeight: 160,
  },
  badgeCardLocked: { backgroundColor: C.lockedBg },
  lockOverlay: {
    position: 'absolute',
    top: 8,
    end: 8,
  },
  lockIcon: { fontSize: 14, opacity: 0.5 },
  badgeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.badgeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconWrapLocked: { backgroundColor: '#EEEEEE' },
  badgeIcon: { fontSize: 34 },
  badgeIconLocked: { opacity: 0.4 },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
  },
  badgeTitleLocked: { color: C.locked },
  earnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  earnedCheck: { fontSize: 11, color: C.earned },
  earnedDate: {
    fontSize: 10,
    color: C.earned,
    flex: 1,
    textAlign: 'center',
  },
  progressWrap: { width: '100%', gap: 4 },
  progressLabel: { fontSize: 10, color: C.locked, textAlign: 'center' },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },

  // Detail sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: C.overlay,
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopStartRadius: 28,
    borderTopEndRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    alignItems: 'center',
    gap: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 4,
  },
  sheetCloseBtn: {
    position: 'absolute',
    top: 20,
    end: 20,
    padding: 8,
  },
  sheetCloseIcon: { fontSize: 16, color: C.textSecondary },
  sheetIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.badgeLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  sheetIconWrapLocked: { backgroundColor: '#EEEEEE' },
  sheetIcon: { fontSize: 52 },
  sheetIconLocked: { opacity: 0.35 },
  sheetEarnedBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.earned,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.surface,
  },
  sheetEarnedBadgeText: { fontSize: 13, color: C.surface, fontWeight: '700' },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
    textAlign: 'center',
  },
  sheetTitleEn: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
  },
  sheetEarnedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.earnedLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  sheetEarnedChipIcon: { fontSize: 14 },
  sheetEarnedChipText: { fontSize: 13, color: C.earned, fontWeight: '600' },
  sheetLockedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.lockedBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 6,
  },
  sheetLockedChipIcon: { fontSize: 14 },
  sheetLockedChipText: { fontSize: 13, color: C.locked, fontWeight: '600' },
  sheetDesc: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  sheetProgressWrap: { width: '100%', gap: 6 },
  sheetProgressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  sheetProgressLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  sheetProgressCount: { fontSize: 13, color: C.primary, fontWeight: '700' },
  sheetProgressRemaining: { fontSize: 12, color: C.textDisabled, textAlign: 'center' },
  hintBox: {
    width: '100%',
    backgroundColor: C.accentLight,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  hintLabel: { fontSize: 12, fontWeight: '700', color: C.accent },
  hintText: { fontSize: 13, color: C.textSecondary, lineHeight: 20 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 32,
    gap: 8,
    marginTop: 4,
    width: '100%',
  },
  shareBtnIcon: { fontSize: 16, color: C.surface },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: C.surface },
});

// Keep ICON_* imports used
void ICON_TROPHY;
void ICON_STAR;
