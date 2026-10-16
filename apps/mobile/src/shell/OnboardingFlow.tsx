/* eslint-disable i18next/no-literal-string */
/**
 * OnboardingFlow – full multi-step first-run experience.
 *
 * Steps (in order):
 *   1. welcome    – hero splash with app branding
 *   2. language   – pick AR / KU / EN
 *   3. city       – Baghdad / Erbil / Basra / Mosul / other
 *   4. purpose    – discover / navigate / business (multi-select)
 *   5. notifications – expo-notifications permission request
 *   6. location   – expo-location foreground permission
 *   7. done       – quick-tour cards for each tab
 *
 * Every step has a Skip option. RTL-safe (start/end, I18nManager).
 * Progress dots at the top of each step screen.
 */

import { Locale } from '@iraq-maps/contracts';
import { getLocale, setLocale } from '@iraq-maps/i18n';
import { Button, ListItem, Screen, Text, tokens } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useState, type ReactElement } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from './strings';

export const ONBOARDING_DONE_KEY = 'app.hasSeenOnboarding';

const STEPS = ['welcome', 'language', 'city', 'purpose', 'notifications', 'location', 'done'] as const;
type Step = (typeof STEPS)[number];

const TOTAL_STEPS = STEPS.length;

type PurposeKey = 'discover' | 'navigate' | 'business';
type CityKey = 'baghdad' | 'erbil' | 'basra' | 'mosul' | 'other';

interface Props {
  onDone: () => void;
}

// ── Progress dots ────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }): ReactElement {
  const isRTL = I18nManager.isRTL;
  return (
    <View style={[styles.dotsRow, isRTL && styles.dotsRowRTL]} accessibilityElementsHidden>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

// ── Skip / Back header ───────────────────────────────────────────────────────

function StepHeader({
  stepIndex,
  onSkip,
  onBack,
}: {
  stepIndex: number;
  onSkip: () => void;
  onBack: () => void;
}): ReactElement {
  const isRTL = I18nManager.isRTL;
  return (
    <View style={[styles.stepHeader, isRTL && styles.stepHeaderRTL]}>
      {stepIndex > 0 ? (
        <Pressable onPress={onBack} style={styles.headerBtn} hitSlop={12}>
          <RNText style={styles.headerBtnText}>{t('onboarding.back')}</RNText>
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
      <ProgressDots current={stepIndex} total={TOTAL_STEPS} />
      {stepIndex < TOTAL_STEPS - 1 ? (
        <Pressable onPress={onSkip} style={styles.headerBtn} hitSlop={12}>
          <RNText style={styles.headerBtnText}>{t('onboarding.skip')}</RNText>
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
    </View>
  );
}

// ── WelcomeStep ──────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }): ReactElement {
  return (
    <View style={styles.stepBody}>
      <View style={styles.hero}>
        <RNText style={styles.heroEmoji}>🗺️</RNText>
        <Text variant="title">{t('onboarding.welcome.title')}</Text>
        <Text tone="muted" style={styles.centered}>
          {t('onboarding.welcome.subtitle')}
        </Text>
      </View>
      <Button label={t('onboarding.welcome.start')} onPress={onNext} />
    </View>
  );
}

// ── LanguageStep ─────────────────────────────────────────────────────────────

function LanguageStep({ onNext }: { onNext: () => void }): ReactElement {
  const [selected, setSelected] = useState<Locale>(getLocale() as Locale);

  const choose = (locale: Locale) => {
    setSelected(locale);
    setLocale(locale);
  };

  return (
    <View style={styles.stepBody}>
      <View style={styles.textBlock}>
        <Text variant="title">{t('onboarding.language.title')}</Text>
        <Text tone="muted">{t('onboarding.language.subtitle')}</Text>
      </View>
      {Locale.options.map((locale) => (
        <ListItem
          key={locale}
          title={t(`onboarding.language.${locale}`)}
          selected={selected === locale}
          onPress={() => choose(locale as Locale)}
        />
      ))}
      <Button label={t('onboarding.next')} onPress={onNext} />
    </View>
  );
}

// ── CityStep ─────────────────────────────────────────────────────────────────

const CITIES: CityKey[] = ['baghdad', 'erbil', 'basra', 'mosul', 'other'];

function CityStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: CityKey | null;
  onSelect: (c: CityKey) => void;
  onNext: () => void;
}): ReactElement {
  return (
    <View style={styles.stepBody}>
      <View style={styles.textBlock}>
        <RNText style={styles.stepEmoji}>📍</RNText>
        <Text variant="title">{t('onboarding.city.title')}</Text>
        <Text tone="muted">{t('onboarding.city.subtitle')}</Text>
      </View>
      <View style={styles.cityGrid}>
        {CITIES.map((city) => (
          <Pressable
            key={city}
            style={[styles.cityChip, selected === city && styles.cityChipSelected]}
            onPress={() => onSelect(city)}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === city }}
          >
            <RNText style={[styles.cityChipText, selected === city && styles.cityChipTextSelected]}>
              {t(`onboarding.city.${city}`)}
            </RNText>
          </Pressable>
        ))}
      </View>
      <Button label={t('onboarding.next')} onPress={onNext} />
    </View>
  );
}

// ── PurposeStep ──────────────────────────────────────────────────────────────

const PURPOSES: { key: PurposeKey; emoji: string }[] = [
  { key: 'discover', emoji: '✨' },
  { key: 'navigate', emoji: '🧭' },
  { key: 'business', emoji: '🏪' },
];

function PurposeStep({
  selected,
  onToggle,
  onNext,
}: {
  selected: Set<PurposeKey>;
  onToggle: (k: PurposeKey) => void;
  onNext: () => void;
}): ReactElement {
  return (
    <View style={styles.stepBody}>
      <View style={styles.textBlock}>
        <Text variant="title">{t('onboarding.purpose.title')}</Text>
        <Text tone="muted">{t('onboarding.purpose.subtitle')}</Text>
      </View>
      <View style={styles.purposeList}>
        {PURPOSES.map(({ key, emoji }) => {
          const isSelected = selected.has(key);
          return (
            <Pressable
              key={key}
              style={[styles.purposeCard, isSelected && styles.purposeCardSelected]}
              onPress={() => onToggle(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
            >
              <View style={styles.purposeCardInner}>
                <RNText style={styles.purposeEmoji}>{emoji}</RNText>
                <View style={styles.purposeText}>
                  <RNText style={[styles.purposeTitle, isSelected && styles.purposeTitleSelected]}>
                    {t(`onboarding.purpose.${key}`)}
                  </RNText>
                  <RNText style={styles.purposeDesc}>
                    {t(`onboarding.purpose.${key}Desc`)}
                  </RNText>
                </View>
                <View style={[styles.purposeCheck, isSelected && styles.purposeCheckSelected]}>
                  {isSelected ? <RNText style={styles.purposeCheckMark}>✓</RNText> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Button label={t('onboarding.next')} onPress={onNext} />
    </View>
  );
}

// ── NotificationsStep ────────────────────────────────────────────────────────

function NotificationsStep({ onNext }: { onNext: () => void }): ReactElement {
  const requestAndContinue = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // permission denied or unavailable — continue
    }
    onNext();
  };

  return (
    <View style={styles.stepBody}>
      <View style={styles.hero}>
        <RNText style={styles.heroEmoji}>🔔</RNText>
        <Text variant="title">{t('onboarding.notifications.title')}</Text>
        <Text tone="muted" style={styles.centered}>
          {t('onboarding.notifications.subtitle')}
        </Text>
      </View>
      <Button label={t('onboarding.notifications.allow')} onPress={() => void requestAndContinue()} />
      <Button variant="secondary" label={t('onboarding.notifications.skip')} onPress={onNext} />
    </View>
  );
}

// ── LocationStep ─────────────────────────────────────────────────────────────

function LocationStep({ onNext }: { onNext: () => void }): ReactElement {
  const requestAndContinue = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // permission denied or unavailable — continue
    }
    onNext();
  };

  return (
    <View style={styles.stepBody}>
      <View style={styles.hero}>
        <RNText style={styles.heroEmoji}>📡</RNText>
        <Text variant="title">{t('onboarding.location.title')}</Text>
        <Text tone="muted" style={styles.centered}>
          {t('onboarding.location.body')}
        </Text>
      </View>
      <Button label={t('onboarding.location.allow')} onPress={() => void requestAndContinue()} />
      <Button variant="secondary" label={t('onboarding.location.skip')} onPress={onNext} />
    </View>
  );
}

// ── DoneStep ─────────────────────────────────────────────────────────────────

const DONE_HINTS: string[] = [
  'mapHint',
  'discoverHint',
  'messagesHint',
  'assistantHint',
] as const;

function DoneStep({ onFinish }: { onFinish: () => void }): ReactElement {
  return (
    <View style={styles.stepBody}>
      <View style={styles.hero}>
        <RNText style={styles.heroEmoji}>🎉</RNText>
        <Text variant="title">{t('onboarding.done.title')}</Text>
        <Text tone="muted" style={styles.centered}>
          {t('onboarding.done.subtitle')}
        </Text>
      </View>
      <View style={styles.hintList}>
        {DONE_HINTS.map((hint) => (
          <View key={hint} style={styles.hintRow}>
            <RNText style={styles.hintText}>
              {t(`onboarding.done.${hint}` as Parameters<typeof t>[0])}
            </RNText>
          </View>
        ))}
      </View>
      <Button label={t('onboarding.done.start')} onPress={onFinish} />
    </View>
  );
}

// ── OnboardingFlow ────────────────────────────────────────────────────────────

export function OnboardingFlow({ onDone }: Props): ReactElement {
  const [stepIndex, setStepIndex] = useState(0);
  const [city, setCity] = useState<CityKey | null>(null);
  const [purposes, setPurposes] = useState<Set<PurposeKey>>(new Set());

  const step = STEPS[stepIndex] as Step;

  const next = () => setStepIndex((i) => Math.min(i + 1, TOTAL_STEPS - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const finish = async () => {
    await SecureStore.setItemAsync(ONBOARDING_DONE_KEY, '1');
    onDone();
  };

  const skipToEnd = () => void finish();

  const togglePurpose = (key: PurposeKey) => {
    setPurposes((prev) => {
      const next_ = new Set(prev);
      if (next_.has(key)) next_.delete(key);
      else next_.add(key);
      return next_;
    });
  };

  const renderStep = (): ReactElement => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep onNext={next} />;
      case 'language':
        return <LanguageStep onNext={next} />;
      case 'city':
        return <CityStep selected={city} onSelect={setCity} onNext={next} />;
      case 'purpose':
        return <PurposeStep selected={purposes} onToggle={togglePurpose} onNext={next} />;
      case 'notifications':
        return <NotificationsStep onNext={next} />;
      case 'location':
        return <LocationStep onNext={next} />;
      case 'done':
        return <DoneStep onFinish={() => void finish()} />;
    }
  };

  return (
    <Screen scroll>
      <StepHeader stepIndex={stepIndex} onSkip={skipToEnd} onBack={back} />
      {renderStep()}
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 8,
    marginBottom: 8,
  },
  stepHeaderRTL: {
    flexDirection: 'row-reverse',
  },
  headerBtn: {
    minWidth: 56,
    alignItems: 'center',
  },
  headerBtnText: {
    fontSize: 14,
    color: tokens.color.textMuted,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dotsRowRTL: {
    flexDirection: 'row-reverse',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    borderRadius: 4,
    backgroundColor: tokens.color.primary,
  },
  dotInactive: {
    backgroundColor: tokens.color.border,
  },
  stepBody: {
    flex: 1,
    gap: 12,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  heroEmoji: {
    fontSize: 72,
    lineHeight: 88,
  },
  stepEmoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  textBlock: {
    gap: 4,
    paddingBottom: 8,
    alignItems: 'center',
  },
  // ── City step
  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  cityChip: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cityChipSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}18`,
  },
  cityChipText: {
    fontSize: 15,
    color: tokens.color.text,
  },
  cityChipTextSelected: {
    color: tokens.color.primary,
    fontWeight: '600',
  },
  // ── Purpose step
  purposeList: {
    gap: 10,
  },
  purposeCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    padding: 16,
    backgroundColor: tokens.color.surface,
  },
  purposeCardSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}10`,
  },
  purposeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  purposeEmoji: {
    fontSize: 28,
  },
  purposeText: {
    flex: 1,
    gap: 2,
  },
  purposeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
  },
  purposeTitleSelected: {
    color: tokens.color.primary,
  },
  purposeDesc: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
  purposeCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purposeCheckSelected: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  purposeCheckMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // ── Done step
  hintList: {
    gap: 8,
    paddingHorizontal: 8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  hintText: {
    fontSize: 14,
    color: tokens.color.text,
    flex: 1,
  },
});
