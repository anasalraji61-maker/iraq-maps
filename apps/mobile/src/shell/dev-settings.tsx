import { testIDs } from '@iraq-maps/contracts';
import { t } from '@iraq-maps/i18n';
import { href, useLocale, useRouteAvailable } from '@iraq-maps/mobile-kit';
import { Banner, Button, IconButton, Screen, Text, TextField, type BannerProps } from '@iraq-maps/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { apiBaseUrl, defaultApiUrl, devToolsEnabled, saveServerUrl, ServerUrl } from './server-url';
import './strings';

// Non-visible enum props stay out of JSX: the repo's i18next/no-literal-string rule flags every literal there.
const SETTINGS_ICON = 'settings';
const URL_KEYBOARD = 'url';
const SECONDARY = 'secondary';
const LINKS = { home: href('map'), devSettings: href('devSettings') };

/** Header button to the developer settings; renders nothing where that screen is not available (production). */
export function DevSettingsButton(): ReactElement | null {
  const router = useRouter();
  const available = useRouteAvailable('devSettings');
  if (!available) return null;
  return <IconButton icon={SETTINGS_ICON} accessibilityLabel={t('shell:dev.open')} onPress={() => router.push(LINKS.devSettings)} />;
}

/** app/dev-settings.tsx: the server URL for emulators and real phones. Production builds redirect home. */
export function DevSettingsScreen(): ReactElement {
  useLocale();
  return devToolsEnabled() ? <ServerUrlForm /> : <Redirect href={LINKS.home} />;
}

function ServerUrlForm(): ReactElement {
  const [value, setValue] = useState(apiBaseUrl);
  const [error, setError] = useState<string>();
  const [banner, setBanner] = useState<Pick<BannerProps, 'kind' | 'message'>>();

  const apply = async (url: string | null) => {
    setError(undefined);
    try {
      await saveServerUrl(url);
      setValue(apiBaseUrl());
      setBanner({ kind: 'success', message: t('shell:dev.saved', { url: apiBaseUrl() }) });
    } catch {
      setBanner({ kind: 'error', message: t('shell:dev.failed') });
    }
  };

  const save = () => {
    const parsed = ServerUrl.safeParse(value);
    if (parsed.success) return void apply(parsed.data);
    setBanner(undefined);
    setError(t('shell:dev.invalid'));
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ headerShown: true, title: t('shell:dev.title') }} />
      <Text>{t('shell:dev.help', { url: defaultApiUrl() })}</Text>
      <TextField
        label={t('shell:dev.serverUrl')}
        value={value}
        onChangeText={setValue}
        error={error}
        keyboardType={URL_KEYBOARD}
        testID={testIDs.dev.serverUrlInput}
      />
      <Button label={t('shell:dev.save')} onPress={save} testID={testIDs.dev.serverUrlSave} />
      <Button label={t('shell:dev.reset')} onPress={() => void apply(null)} variant={SECONDARY} />
      {banner ? <Banner {...banner} /> : null}
    </Screen>
  );
}
