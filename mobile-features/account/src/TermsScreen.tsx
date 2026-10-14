import { StyleSheet, View } from 'react-native';
import { Screen, Text } from '@iraq-maps/ui';
import { type ReactElement } from 'react';
import { ScreenTitle } from './ScreenTitle';
import { t } from './strings';

/** In-app terms of use. Arabic-first. */
export function TermsScreen(): ReactElement {
  return (
    <Screen scroll>
      <ScreenTitle title={t('terms.title')} />
      <Text variant="body">{t('terms.intro')}</Text>

      <View style={styles.section}>
        <Text variant="subtitle">{t('terms.use.heading')}</Text>
        <Text variant="body">{t('terms.use.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('terms.prohibited.heading')}</Text>
        <Text variant="body">{t('terms.prohibited.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('terms.content.heading')}</Text>
        <Text variant="body">{t('terms.content.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('terms.liability.heading')}</Text>
        <Text variant="body">{t('terms.liability.body')}</Text>
      </View>

      <View style={styles.section}>
        <Text variant="subtitle">{t('terms.changes.heading')}</Text>
        <Text variant="body">{t('terms.changes.body')}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
});
