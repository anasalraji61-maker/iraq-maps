import { href } from '@iraq-maps/mobile-kit';
import { ListItem, Screen, Text } from '@iraq-maps/ui';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const PRIVACY_URL = 'https://iraqsmartmaps.com/privacy';
const TERMS_URL = 'https://iraqsmartmaps.com/terms';
const SUPPORT_EMAIL = 'mailto:support@iraqsmartmaps.com';

const version = Constants.expoConfig?.version ?? '1.0.0';
const buildNumber =
  (Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '1').toString();

export function SettingsScreen(): ReactElement {
  const router = useRouter();

  return (
    <Screen scroll>
      <ScreenTitle title={t('settings.title')} />
      <ListItem title={t('settings.language')} onPress={() => router.push(href('accountLanguage'))} />
      <ListItem title={t('settings.reportProblem')} onPress={() => void Linking.openURL(SUPPORT_EMAIL)} />
      <ListItem title={t('settings.privacy')} onPress={() => void Linking.openURL(PRIVACY_URL)} />
      <ListItem title={t('settings.terms')} onPress={() => void Linking.openURL(TERMS_URL)} />
      <View style={styles.versionRow}>
        <Text variant="caption">{t('settings.version', { version, build: buildNumber })}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  versionRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
