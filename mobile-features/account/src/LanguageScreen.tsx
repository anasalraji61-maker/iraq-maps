import { Locale, testIDs } from '@iraq-maps/contracts';
import { getLocale, setLocale, t as translate } from '@iraq-maps/i18n';
import { useApi, useSession } from '@iraq-maps/mobile-kit';
import { Banner, ListItem, Screen } from '@iraq-maps/ui';
import { Stack, useRouter } from 'expo-router';
import { type ReactElement } from 'react';
import { expectStatus, useRequest } from './request';
import { t } from './strings';

/** Saves the choice to the profile first when signed in; the shell reacts to setLocale (direction change and reload). */
export function LanguageScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const { busy, error, run } = useRequest();
  const current = getLocale();
  const loading = translate('common:status.loading');

  const choose = (locale: Locale) => {
    if (busy) return;
    void run(async () => {
      if (session.state.status === 'signedIn') session.updateUser(expectStatus(await api.me.update({ body: { locale } }), 200));
      setLocale(locale);
      router.back();
    });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('language.title') }} />
      {busy ? <Banner kind="info" message={loading} /> : null}
      {error ? <Banner kind="error" message={error} /> : null}
      {Locale.options.map((locale) => (
        <ListItem
          key={locale}
          testID={testIDs.auth.locale[locale]}
          title={t(`languages.${locale}`)}
          selected={locale === current}
          onPress={() => choose(locale)}
        />
      ))}
    </Screen>
  );
}
