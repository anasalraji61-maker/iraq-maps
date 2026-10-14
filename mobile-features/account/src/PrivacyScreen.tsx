import { StyleSheet, View } from 'react-native';
import { Screen, Text } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

/** In-app privacy policy: what data we collect and why. Arabic-first. */
export function PrivacyScreen(): ReactElement {
  return (
    <Screen scroll>
      <ScreenTitle title={t('privacy.title')} />
      <Text variant="body">{t('privacy.intro')}</Text>

      <View style={styles.section}>
        <Text variant="subtitle">{t('privacy.collect.heading')}</Text>
        <Text variant="body">{t('privacy.collect.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('privacy.use.heading')}</Text>
        <Text variant="body">{t('privacy.use.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('privacy.share.heading')}</Text>
        <Text variant="body">{t('privacy.share.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('privacy.rights.heading')}</Text>
        <Text variant="body">{t('privacy.rights.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('privacy.contact.heading')}</Text>
        <Text variant="body">{t('privacy.contact.body')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
});
