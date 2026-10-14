import { Locale } from '@iraq-maps/contracts';
import { getLocale, setLocale } from '@iraq-maps/i18n';
import { Button, ListItem, Screen, Text, tokens } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { t } from './strings';

export const ONBOARDING_DONE_KEY = 'app.hasSeenOnboarding';

type Step = 'welcome' | 'location' | 'language';

interface Props {
  /** Called when the user completes or skips all onboarding steps. */
  onDone: () => void;
}

/** Three-screen first-run onboarding: welcome → location permission → language selection. */
export function OnboardingFlow({ onDone }: Props): ReactElement {
  const [step, setStep] = useState<Step>('welcome');

  const finish = async () => {
    await SecureStore.setItemAsync(ONBOARDING_DONE_KEY, '1');
    onDone();
  };

  const requestLocation = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      // permission denied or unavailable — continue regardless
    }
    setStep('language');
  };

  if (step === 'welcome') {
    return (
      <Screen>
        <View style={styles.hero}>
          <View style={styles.logoPlaceholder} accessibilityLabel={t('onboarding.welcome.title')} />
          <Text variant="title">{t('onboarding.welcome.title')}</Text>
          <Text tone="muted">{t('onboarding.welcome.subtitle')}</Text>
        </View>
        <Button label={t('onboarding.welcome.start')} onPress={() => setStep('location')} />
      </Screen>
    );
  }

  if (step === 'location') {
    return (
      <Screen>
        <View style={styles.hero}>
          <Text variant="title">{t('onboarding.location.title')}</Text>
          <Text tone="muted">{t('onboarding.location.body')}</Text>
        </View>
        <Button label={t('onboarding.location.allow')} onPress={() => void requestLocation()} />
        <Button variant="secondary" label={t('onboarding.location.skip')} onPress={() => setStep('language')} />
      </Screen>
    );
  }

  // step === 'language'
  return (
    <Screen>
      <Text variant="title">{t('onboarding.language.title')}</Text>
      {Locale.options.map((locale) => (
        <ListItem
          key={locale}
          title={t(`onboarding.language.${locale}`)}
          selected={getLocale() === locale}
          onPress={() => setLocale(locale)}
        />
      ))}
      <Button label={t('onboarding.language.next')} onPress={() => void finish()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  logoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: tokens.color.primary,
    marginBottom: 8,
  },
});
