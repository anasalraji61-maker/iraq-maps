import { Locale, testIDs } from '@iraq-maps/contracts';
import { getLocale, setLocale } from '@iraq-maps/i18n';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { Banner, ListItem, Screen, Text } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { type ReactElement } from 'react';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

/** Saves the choice to the profile first when signed in; the shell reacts to setLocale (direction change and reload). */
export function LanguageScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const { error, run } = useRequest();
  const current = getLocale();

  const choose = (locale: Locale) =>
    run(async () => {
      if (session.state.status === 'signedIn') session.updateUser(expectStatus(await api.me.update({ body: { locale } }), 200));
      setLocale(locale);
      router.back();
    });

  return (
    <Screen>
      <Text variant="title">{t('language.title')}</Text>
      {error ? <Banner kind="error" message={error} /> : null}
      {Locale.options.map((locale) => (
        <ListItem
          key={locale}
          testID={testIDs.auth.locale[locale]}
          title={t(`languages.${locale}`)}
          subtitle={locale === current ? t('language.current') : undefined}
          onPress={() => choose(locale)}
        />
      ))}
    </Screen>
  );
}
