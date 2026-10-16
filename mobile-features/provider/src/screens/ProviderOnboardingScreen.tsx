import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  Text as RNText,
} from 'react-native';
import { expectStatus } from '../request';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  route: string;
}

interface TourSlide {
  icon: string;
  title: string;
  body: string;
  accentColor: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const TOUR_SLIDES: TourSlide[] = [
  {
    icon: '📊',
    title: t('onboarding.slide1_title'),
    body: t('onboarding.slide1_body'),
    accentColor: '#1565c0',
  },
  {
    icon: '💬',
    title: t('onboarding.slide2_title'),
    body: t('onboarding.slide2_body'),
    accentColor: '#7c3aed',
  },
  {
    icon: '📸',
    title: t('onboarding.slide3_title'),
    body: t('onboarding.slide3_body'),
    accentColor: '#0891b2',
  },
  {
    icon: '🎯',
    title: t('onboarding.slide4_title'),
    body: t('onboarding.slide4_body'),
    accentColor: '#d97706',
  },
  {
    icon: '📈',
    title: t('onboarding.slide5_title'),
    body: t('onboarding.slide5_body'),
    accentColor: '#16a34a',
  },
];

// ─── Progress bar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  done: number;
  total: number;
}

function ProfileProgressBar({ done, total }: ProgressBarProps): ReactElement {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct, animWidth]);

  const barColor = pct === 100 ? '#16a34a' : pct >= 60 ? '#1565c0' : '#d97706';

  return (
    <View style={progStyles.wrap}>
      <View style={progStyles.labelRow}>
        <RNText style={progStyles.label}>{t('onboarding.profile_completeness')}</RNText>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <RNText style={[progStyles.pct, { color: barColor }]}>{pct}٪</RNText>
      </View>
      <View style={progStyles.track}>
        <Animated.View
          style={[
            progStyles.fill,
            {
              backgroundColor: barColor,
              width: animWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      <RNText style={progStyles.sub}>
        {t('onboarding.steps_done', { done, total })}
      </RNText>
    </View>
  );
}

const progStyles = StyleSheet.create({
  wrap: { marginVertical: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#111' },
  pct: { fontSize: 14, fontWeight: '700' },
  track: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  sub: { fontSize: 12, color: '#666', marginTop: 4 },
});

// ─── Tour slide ────────────────────────────────────────────────────────────────

interface TourSlideCardProps {
  slide: TourSlide;
}

function TourSlideCard({ slide }: TourSlideCardProps): ReactElement {
  return (
    <View style={[tourStyles.card, { borderTopColor: slide.accentColor }]}>
      <RNText style={tourStyles.icon}>{slide.icon}</RNText>
      <RNText style={[tourStyles.title, { color: slide.accentColor }]}>{slide.title}</RNText>
      <RNText style={tourStyles.body}>{slide.body}</RNText>
    </View>
  );
}

const tourStyles = StyleSheet.create({
  card: {
    width: Dimensions.get('window').width - 64,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderTopWidth: 4,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    marginHorizontal: 4,
  },
  icon: { fontSize: 40, textAlign: 'center' },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 14, color: '#444', textAlign: 'center', lineHeight: 22 },
});

// ─── Checklist item ───────────────────────────────────────────────────────────

interface ChecklistRowProps {
  item: ChecklistItem;
  onPress: () => void;
}

function ChecklistRow({ item, onPress }: ChecklistRowProps): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      style={[checkStyles.row, item.done && checkStyles.rowDone]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[checkStyles.circle, item.done && checkStyles.circleDone]}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <RNText style={checkStyles.circleIcon}>{item.done ? '✓' : '○'}</RNText>
      </View>
      <RNText style={[checkStyles.label, item.done && checkStyles.labelDone]}>
        {item.label}
      </RNText>
      {!item.done && (
        <RNText style={checkStyles.arrow}>←</RNText>
      )}
    </Pressable>
  );
}

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 8,
  },
  rowDone: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: { borderColor: '#16a34a', backgroundColor: '#16a34a' },
  circleIcon: { fontSize: 14, color: '#555' },
  label: { flex: 1, fontSize: 14, color: '#333' },
  labelDone: { textDecorationLine: 'line-through', color: '#888' },
  arrow: { fontSize: 14, color: '#1565c0' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ProviderOnboardingScreen(): ReactElement {
  const api = useApi();
  const router = useRouter();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [tourDone, setTourDone] = useState(false);
  const [providerData, setProviderData] = useState<{
    hasLogo: boolean;
    hasHours: boolean;
    hasPhone: boolean;
    hasPost: boolean;
    hasMessaging: boolean;
  } | null>(null);
  const [_loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = expectStatus(await api.providers.me(), 200);
      setProviderData({
        hasLogo: Array.isArray(me.photos) && me.photos.length > 0,
        hasHours: !!me.hoursRaw,
        hasPhone: !!me.phone?.verified,
        hasPost: false, // would require separate posts check
        hasMessaging: Array.isArray(me.consents) && me.consents.includes('whatsapp_messages'),
      });
    } catch {
      setProviderData({ hasLogo: false, hasHours: false, hasPhone: false, hasPost: false, hasMessaging: false });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const checklist: ChecklistItem[] = [
    {
      key: 'logo',
      label: t('onboarding.check_logo'),
      done: providerData?.hasLogo ?? false,
      route: '/provider/edit-profile',
    },
    {
      key: 'hours',
      label: t('onboarding.check_hours'),
      done: providerData?.hasHours ?? false,
      route: '/provider/edit-profile',
    },
    {
      key: 'phone',
      label: t('onboarding.check_phone'),
      done: providerData?.hasPhone ?? false,
      route: '/provider/phone',
    },
    {
      key: 'post',
      label: t('onboarding.check_post'),
      done: providerData?.hasPost ?? false,
      route: '/provider/create-post',
    },
    {
      key: 'messaging',
      label: t('onboarding.check_messaging'),
      done: providerData?.hasMessaging ?? false,
      route: '/provider/consent',
    },
  ];

  const doneCount = checklist.filter((c) => c.done).length;

  const handleSlideNext = () => {
    if (currentSlide < TOUR_SLIDES.length - 1) {
      setCurrentSlide((s) => s + 1);
    } else {
      setTourDone(true);
    }
  };

  const handleSlidePrev = () => {
    setCurrentSlide((s) => Math.max(0, s - 1));
  };

  const handleChecklistItem = (route: string) => {
    router.push(route as never);
  };

  const handleFinish = () => {
    router.replace('/provider/dashboard' as never);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!tourDone) {
    const slide = TOUR_SLIDES[currentSlide]!;

    return (
      <View style={styles.tourContainer}>
        {/* Welcome header */}
        <View style={styles.tourHeader}>
          <RNText style={styles.welcomeEmoji}>🎉</RNText>
          <RNText style={styles.welcomeTitle}>{t('onboarding.welcome_title')}</RNText>
          <RNText style={styles.welcomeSubtitle}>{t('onboarding.welcome_subtitle')}</RNText>
        </View>

        {/* Slide dots */}
        <View style={styles.dotsRow} accessibilityRole="progressbar">
          {TOUR_SLIDES.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => setCurrentSlide(i)}
              style={[styles.dot, i === currentSlide && styles.dotActive]}
              accessibilityLabel={`${t('onboarding.slide_indicator')} ${i + 1}`}
            />
          ))}
        </View>

        {/* Current slide */}
        <View style={styles.slideWrap}>
          <TourSlideCard slide={slide} />
        </View>

        {/* Slide counter */}
        <RNText style={styles.slideCounter}>
          {t('onboarding.slide_of', {
            current: currentSlide + 1,
            total: TOUR_SLIDES.length,
          })}
        </RNText>

        {/* Navigation */}
        <View style={styles.tourNav}>
          {currentSlide > 0 && (
            <Pressable
              onPress={handleSlidePrev}
              style={styles.prevBtn}
              accessibilityRole="button"
            >
              <RNText style={styles.prevBtnText}>{t('onboarding.prev_slide')}</RNText>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={handleSlideNext}
            style={styles.nextBtn}
            accessibilityRole="button"
          >
            <RNText style={styles.nextBtnText}>
              {currentSlide < TOUR_SLIDES.length - 1
                ? t('onboarding.next_slide')
                : t('onboarding.start_setup')}
            </RNText>
          </Pressable>
        </View>

        {/* Skip */}
        <Pressable
          onPress={() => setTourDone(true)}
          style={styles.skipBtn}
          accessibilityRole="button"
        >
          <RNText style={styles.skipText}>{t('onboarding.skip_tour')}</RNText>
        </Pressable>
      </View>
    );
  }

  // ── Checklist view ────────────────────────────────────────────────────────

  return (
    <Screen scroll>
      <Text variant="title">{t('onboarding.setup_title')}</Text>
      <RNText style={styles.setupSubtitle}>{t('onboarding.setup_subtitle')}</RNText>

      <ProfileProgressBar done={doneCount} total={checklist.length} />

      {doneCount === checklist.length && (
        <View style={styles.allDoneBanner}>
          <RNText style={styles.allDoneIcon}>🏆</RNText>
          <RNText style={styles.allDoneText}>{t('onboarding.all_done')}</RNText>
        </View>
      )}

      <RNText style={styles.checklistTitle}>{t('onboarding.checklist_title')}</RNText>

      {checklist.map((item) => (
        <ChecklistRow
          key={item.key}
          item={item}
          onPress={() => handleChecklistItem(item.route)}
        />
      ))}

      <View style={styles.finishWrap}>
        <Button
          variant="primary"
          label={t('onboarding.go_dashboard')}
          onPress={handleFinish}
        />
      </View>

      {/* Feature summary */}
      <View style={styles.featureSummary}>
        <RNText style={styles.featureSummaryTitle}>{t('onboarding.features_title')}</RNText>
        {TOUR_SLIDES.map((slide, i) => (
          <View key={i} style={styles.featureRow}>
            <RNText style={styles.featureIcon}>{slide.icon}</RNText>
            <View style={styles.featureText}>
              <RNText style={styles.featureTitle}>{slide.title}</RNText>
              <RNText style={styles.featureBody}>{slide.body}</RNText>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tourContainer: {
    flex: 1,
    backgroundColor: '#f8faff',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: 'center',
  },
  tourHeader: { alignItems: 'center', marginBottom: 24, gap: 6 },
  welcomeEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  welcomeTitle: { fontSize: 24, fontWeight: '800', color: '#111', textAlign: 'center' },
  welcomeSubtitle: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },

  dotsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' },
  dotActive: { backgroundColor: '#1565c0', width: 20 },

  slideWrap: { width: '100%', alignItems: 'center', marginBottom: 12 },

  slideCounter: { fontSize: 13, color: '#888', marginBottom: 20 },

  tourNav: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 12 },
  prevBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  prevBtnText: { fontSize: 15, color: '#555' },
  nextBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  nextBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },

  skipBtn: { paddingVertical: 8 },
  skipText: { fontSize: 14, color: '#888', textDecorationLine: 'underline' },

  setupSubtitle: { fontSize: 15, color: '#555', marginBottom: 4, lineHeight: 22 },
  checklistTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10, marginTop: 8 },

  allDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#86efac',
    marginBottom: 8,
  },
  allDoneIcon: { fontSize: 24 },
  allDoneText: { fontSize: 15, fontWeight: '700', color: '#166534', flex: 1 },

  finishWrap: { marginTop: 16, marginBottom: 28 },

  featureSummary: {
    backgroundColor: '#f8faff',
    borderRadius: 12,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 24,
  },
  featureSummaryTitle: { fontSize: 15, fontWeight: '700', color: '#1e3a5f', marginBottom: 4 },
  featureRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  featureIcon: { fontSize: 22, lineHeight: 26 },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  featureBody: { fontSize: 13, color: '#555', lineHeight: 18 },
});
