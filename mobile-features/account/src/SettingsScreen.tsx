import { href, useSession } from '@iraq-maps/mobile-kit';
import { Button, ListItem, Screen, Text } from '@iraq-maps/ui';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

const SUPPORT_EMAIL = 'mailto:support@iraqsmartmaps.com';

const version = Constants.expoConfig?.version ?? '1.0.0';
const buildNumber =
  (Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? '1').toString();

export function SettingsScreen(): ReactElement {
  const router = useRouter();
  const session = useSession();
  const isSignedIn = session.state.status === 'signedIn';

  return (
    <Screen scroll>
      <ScreenTitle title={t('settings.title')} />
      <ListItem title={t('settings.language')} onPress={() => router.push(href('accountLanguage'))} />
      <ListItem title={t('settings.notifPrefs')} onPress={() => router.push(href('accountNotifPrefs'))} />
      <ListItem title={t('settings.theme')} onPress={() => router.push(href('accountTheme'))} />
      <ListItem title={t('settings.reportProblem')} onPress={() => void Linking.openURL(SUPPORT_EMAIL)} />
      <ListItem title={t('settings.privacy')} onPress={() => router.push(href('accountPrivacy'))} />
      <ListItem title={t('settings.terms')} onPress={() => router.push(href('accountTerms'))} />
      <ListItem title={t('settings.licenses')} onPress={() => router.push(href('accountLicenses'))} />
      {isSignedIn ? (
        <Button
          variant="secondary"
          label={t('settings.signOut')}
          onPress={() => void session.signOut()}
          testID="settings.signOut"
        />
      ) : null}
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
