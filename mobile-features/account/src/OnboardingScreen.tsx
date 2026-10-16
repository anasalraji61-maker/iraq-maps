import { Locale } from '@iraq-maps/contracts';
import { setLocale } from '@iraq-maps/i18n';
import { href } from '@iraq-maps/mobile-kit';
import { Button, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  Dimensions,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { t } from './strings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PRIMARY = '#1976D2';
const PRIMARY_LIGHT = '#42A5F5';
const ACCENT = '#FF6B35';

type Slide = {
  key: string;
  titleKey: Parameters<typeof t>[0];
  bodyKey: Parameters<typeof t>[0];
  icon: string;
  gradient: [string, string];
};

const SLIDES: Slide[] = [
  { key: 'welcome', titleKey: 'onboarding.welcome.title', bodyKey: 'onboarding.welcome.body', icon: '🗺️', gradient: [PRIMARY, PRIMARY_LIGHT] },
  { key: 'map', titleKey: 'onboarding.map.title', bodyKey: 'onboarding.map.body', icon: '📍', gradient: ['#1565C0', '#1E88E5'] },
  { key: 'discover', titleKey: 'onboarding.discover.title', bodyKey: 'onboarding.discover.body', icon: '✨', gradient: ['#6A1B9A', '#AB47BC'] },
  { key: 'assistant', titleKey: 'onboarding.assistant.title', bodyKey: 'onboarding.assistant.body', icon: '🤖', gradient: [ACCENT, '#FF8C5A'] },
];

const LANGUAGES: { locale: Locale; labelKey: Parameters<typeof t>[0] }[] = [
  { locale: 'ar', labelKey: 'onboarding.language.arabic' },
  { locale: 'ckb', labelKey: 'onboarding.language.kurdish' },
  { locale: 'en', labelKey: 'onboarding.language.english' },
];

type Step = 'slides' | 'language' | 'permissions';

function SlideView({ slide }: { slide: Slide }): ReactElement {
  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={[styles.iconContainer, { backgroundColor: slide.gradient[0] }]}>
        <Text style={styles.slideIcon}>{slide.icon}</Text>
      </View>
      <Text variant="title" style={styles.slideTitle}>{t(slide.titleKey)}</Text>
      <Text tone="muted" style={styles.slideBody}>{t(slide.bodyKey)}</Text>
    </View>
  );
}

function DotsIndicator({ count, current }: { count: number; current: number }): ReactElement {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
      ))}
    </View>
  );
}

function LanguagePicker({
  selected,
  onSelect,
}: {
  selected: Locale;
  onSelect: (locale: Locale) => void;
}): ReactElement {
  return (
    <View style={styles.languageContainer}>
      <Text variant="title" style={styles.sectionTitle}>{t('onboarding.language.title')}</Text>
      <Text tone="muted" style={styles.sectionBody}>{t('onboarding.language.body')}</Text>
      <View style={styles.languageList}>
        {LANGUAGES.map(({ locale, labelKey }) => (
          <Pressable
            key={locale}
            onPress={() => onSelect(locale)}
            style={[styles.languageItem, selected === locale && styles.languageItemSelected]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === locale }}
            accessibilityLabel={t(labelKey)}
          >
            <Text style={[styles.languageLabel, selected === locale && styles.languageLabelSelected]}>
              {t(labelKey)}
            </Text>
            {selected === locale && <Text style={styles.checkmark}>{t('onboarding.checkmark')}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type PermStatus = 'idle' | 'granted' | 'denied';

function PermissionsStep({
  onDone,
}: {
  onDone: () => void;
}): ReactElement {
  const [locationStatus, setLocationStatus] = useState<PermStatus>('idle');
  const [notifStatus, setNotifStatus] = useState<PermStatus>('idle');

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationStatus(status === 'granted' ? 'granted' : 'denied');
  };

  const requestNotifs = async () => {
    const perms = await Notifications.requestPermissionsAsync();
    const ok = (perms as { granted?: boolean }).granted ?? (perms as { status?: string }).status === 'granted';
    setNotifStatus(ok ? 'granted' : 'denied');
  };

  const allDone = locationStatus !== 'idle' && notifStatus !== 'idle';

  return (
    <View style={styles.permissionsContainer}>
      <Text variant="title" style={styles.sectionTitle}>{t('onboarding.permissions.title')}</Text>
      <Text tone="muted" style={styles.sectionBody}>{t('onboarding.permissions.body')}</Text>
      <View style={styles.permissionList}>
        <View style={styles.permissionItem}>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionIcon}>📍</Text>
            <View style={styles.permissionText}>
              <Text variant="subtitle">{t('onboarding.permissions.location.title')}</Text>
              <Text tone="muted" variant="caption">{t('onboarding.permissions.location.body')}</Text>
            </View>
          </View>
          {locationStatus === 'idle' ? (
            <Button label={t('onboarding.permissions.allow')} onPress={() => { void requestLocation(); }} />
          ) : (
            <Text style={locationStatus === 'granted' ? styles.granted : styles.denied}>
              {locationStatus === 'granted' ? t('onboarding.permissions.granted') : t('onboarding.permissions.denied')}
            </Text>
          )}
        </View>
        <View style={styles.permissionItem}>
          <View style={styles.permissionInfo}>
            <Text style={styles.permissionIcon}>🔔</Text>
            <View style={styles.permissionText}>
              <Text variant="subtitle">{t('onboarding.permissions.notifs.title')}</Text>
              <Text tone="muted" variant="caption">{t('onboarding.permissions.notifs.body')}</Text>
            </View>
          </View>
          {notifStatus === 'idle' ? (
            <Button label={t('onboarding.permissions.allow')} onPress={() => { void requestNotifs(); }} />
          ) : (
            <Text style={notifStatus === 'granted' ? styles.granted : styles.denied}>
              {notifStatus === 'granted' ? t('onboarding.permissions.granted') : t('onboarding.permissions.denied')}
            </Text>
          )}
        </View>
      </View>
      {allDone ? (
        <Button label={t('onboarding.permissions.continue')} onPress={onDone} />
      ) : (
        <Button variant="secondary" label={t('onboarding.skip')} onPress={onDone} />
      )}
    </View>
  );
}

export function OnboardingScreen(): ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>('slides');
  const [slideIndex, setSlideIndex] = useState(0);
  const [selectedLocale, setSelectedLocale] = useState<Locale>('ar');
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setSlideIndex(index);
  };

  const handleNext = () => {
    if (slideIndex < SLIDES.length - 1) {
      goToSlide(slideIndex + 1);
    } else {
      fadeOut(() => setStep('language'));
    }
  };

  const fadeOut = (cb: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      cb();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const handleLanguageNext = () => {
    setLocale(selectedLocale);
    I18nManager.forceRTL(selectedLocale !== 'en');
    fadeOut(() => setStep('permissions'));
  };

  const handlePermissionsDone = () => {
    router.replace(href('authPhone'));
  };

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== slideIndex) setSlideIndex(index);
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {step === 'slides' && (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            scrollEventThrottle={16}
            style={styles.scrollView}
          >
            {SLIDES.map((slide) => <SlideView key={slide.key} slide={slide} />)}
          </ScrollView>
          <DotsIndicator count={SLIDES.length} current={slideIndex} />
          <View style={styles.slideActions}>
            <Button label={slideIndex < SLIDES.length - 1 ? t('onboarding.next') : t('onboarding.getStarted')} onPress={handleNext} />
            {slideIndex < SLIDES.length - 1 && (
              <Button variant="secondary" label={t('onboarding.skip')} onPress={() => fadeOut(() => setStep('language'))} />
            )}
          </View>
        </>
      )}
      {step === 'language' && (
        <ScrollView contentContainerStyle={styles.stepScroll}>
          <LanguagePicker selected={selectedLocale} onSelect={setSelectedLocale} />
          <View style={styles.stepActions}>
            <Button label={t('onboarding.next')} onPress={handleLanguageNext} />
          </View>
        </ScrollView>
      )}
      {step === 'permissions' && (
        <ScrollView contentContainerStyle={styles.stepScroll}>
          <PermissionsStep onDone={handlePermissionsDone} />
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollView: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 64,
    paddingBottom: 24,
    gap: 20,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  slideIcon: { fontSize: 56 },
  slideTitle: { textAlign: 'center' },
  slideBody: { textAlign: 'center', lineHeight: 24 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BDBDBD',
  },
  dotActive: { backgroundColor: PRIMARY, width: 20 },
  slideActions: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 8,
  },
  stepScroll: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  stepActions: { marginTop: 24, gap: 8 },
  sectionTitle: { textAlign: 'center', marginTop: 48, marginBottom: 8 },
  sectionBody: { textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  languageContainer: { flex: 1 },
  languageList: { gap: 12 },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
  },
  languageItemSelected: {
    borderColor: PRIMARY,
    backgroundColor: '#E3F2FD',
  },
  languageLabel: { fontSize: 18, fontWeight: '500' },
  languageLabelSelected: { color: PRIMARY, fontWeight: '700' },
  checkmark: { color: PRIMARY, fontSize: 20, fontWeight: '700' },
  permissionsContainer: { flex: 1, gap: 16 },
  permissionList: { gap: 16, marginBottom: 8 },
  permissionItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    gap: 12,
    backgroundColor: '#FAFAFA',
  },
  permissionInfo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  permissionIcon: { fontSize: 28, marginTop: 2 },
  permissionText: { flex: 1, gap: 4 },
  granted: { color: '#2E7D32', fontWeight: '600' },
  denied: { color: '#C62828', fontWeight: '600' },
});
