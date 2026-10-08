import { testIDs } from '@iraq-maps/contracts';
import { registerNamespace, t } from '@iraq-maps/i18n';
import { AvailableRoutesProvider, href, SessionProvider, useRouteAvailable, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, IconButton, Screen, Text, TextField, tokens, useUiFonts } from '@iraq-maps/ui';
import { Stack, Tabs, useRouter } from 'expo-router';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { availableRoutes } from './available-routes';
import { apiBaseUrl, defaultApiUrl, isProduction, loadServerUrl, saveServerUrl } from './config';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';
import { persistLocaleChanges, restoreLocale, useLocale } from './locale';

registerNamespace('shell', { ar, ckb, en });

type Tab = keyof typeof testIDs.tabs;
const tabIcons: Record<Tab, AndroidSymbol> = { map: 'map', discover: 'explore', messages: 'chat', activity: 'history', account: 'person' };
const tabs = Object.keys(tabIcons) as Tab[];

/** Nothing renders until the saved locale, server URL, fonts and session are restored, so nothing flashes. */
export function RootLayout() {
  const fontsReady = useUiFonts();
  // i18n has no React binding: an ar <-> ckb switch (no reload) re-mounts the navigator so every screen re-reads t().
  // The navigation state lives above it (expo-router), so the user stays where they were.
  const locale = useLocale();
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let mounted = true;
    let stop: (() => void) | undefined;
    void Promise.all([restoreLocale(), loadServerUrl()]).then(() => {
      if (!mounted) return;
      stop = persistLocaleChanges();
      setRestored(true);
    });
    return () => {
      mounted = false;
      stop?.();
    };
  }, []);
  if (!fontsReady || !restored) return null;
  return (
    <SessionProvider apiBaseUrl={apiBaseUrl}>
      <AvailableRoutesProvider routes={availableRoutes()}>
        <SessionRestored>
          <Stack key={locale} screenOptions={{ title: '', headerTitleStyle: { fontFamily: tokens.font.family } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Protected guard={!isProduction()}>
              <Stack.Screen name="dev-settings" />
            </Stack.Protected>
          </Stack>
        </SessionRestored>
      </AvailableRoutesProvider>
    </SessionProvider>
  );
}

/** Signed-out users browse every tab; the account tab (feature-account) shows the sign-in entry. */
function SessionRestored({ children }: { children: ReactNode }) {
  return useSession().state.status === 'loading' ? null : children;
}

export function TabsLayout() {
  const router = useRouter();
  const devSettings = useRouteAvailable('devSettings');
  const font = { fontFamily: tokens.font.family };
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: tokens.color.primary, tabBarLabelStyle: font, headerTitleStyle: font }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab}
          name={tab === 'map' ? 'index' : tab}
          options={{
            title: t(`common:tabs.${tab}`),
            tabBarButtonTestID: testIDs.tabs[tab],
            tabBarIcon: ({ color, size }) => <SymbolView name={{ android: tabIcons[tab], web: tabIcons[tab] }} tintColor={color} size={size} />,
            headerRight:
              tab === 'account' && devSettings
                ? () => <IconButton icon="developer_mode" accessibilityLabel={t('shell:devSettings.open')} onPress={() => router.push(href('devSettings'))} />
                : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}

/** The one empty state for tabs whose feature is not delivered yet. */
export function PendingScreen() {
  return (
    <Screen>
      <EmptyState title={t('common:comingSoon.title')} body={t('common:comingSoon.body')} />
    </Screen>
  );
}

/** Non-production builds only: point the app at a reachable API (a laptop on the same Wi-Fi, or staging). */
export function DevSettingsScreen() {
  const [url, setUrl] = useState(apiBaseUrl);
  const [result, setResult] = useState<'saved' | 'invalid'>();
  if (isProduction()) return null;
  const save = async () => {
    const value = url.trim();
    if (value && !/^https?:\/\/[^\s/]+\S*$/i.test(value)) return setResult('invalid');
    await saveServerUrl(value.replace(/\/+$/, ''));
    setUrl(apiBaseUrl());
    setResult('saved');
  };
  return (
    <Screen scroll>
      <Text variant="title">{t('shell:devSettings.title')}</Text>
      <TextField
        testID={testIDs.dev.serverUrlInput}
        label={t('shell:devSettings.serverUrl')}
        value={url}
        onChangeText={setUrl}
        placeholder={defaultApiUrl()}
        keyboardType="url"
        error={result === 'invalid' ? t('shell:devSettings.invalidUrl') : undefined}
      />
      {result === 'saved' ? <Banner kind="success" message={t('shell:devSettings.saved', { url: apiBaseUrl() })} /> : null}
      <Button testID={testIDs.dev.serverUrlSave} label={t('common:actions.save')} onPress={save} />
    </Screen>
  );
}
