import { testIDs } from '@iraq-maps/contracts';
import { registerNamespace, t } from '@iraq-maps/i18n';
import { AvailableRoutesProvider, href, SessionProvider, useRouteAvailable, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, ErrorToast, IconButton, Screen, TextField, tokens, useUiFonts } from '@iraq-maps/ui';
import { Stack, Tabs, useRouter } from 'expo-router';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableRoutes } from './available-routes';
import { apiBaseUrl, defaultApiUrl, isProduction, loadServerUrl, saveServerUrl } from './config';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';
import { persistLocaleChanges, restoreLocale, useLocale } from './locale';

registerNamespace('shell', { ar, ckb, en });

type ContractTab = keyof typeof testIDs.tabs;

/** Full ordered tab list; assistant is not yet in testIDs.tabs so it is typed separately. */
type Tab = ContractTab | 'assistant';

const tabIcons: Record<Tab, AndroidSymbol> = {
  map: 'map',
  discover: 'explore',
  messages: 'chat',
  assistant: 'smart_toy',
  account: 'person',
  // kept for back-compat; not shown in the primary bar
  activity: 'history',
};

/** Primary tab bar order — five tabs visible to the user. */
const tabs: Tab[] = ['map', 'discover', 'messages', 'assistant', 'account'];
const font = { fontFamily: tokens.font.family };
// AA contrast for inactive labels (textMuted) and 12sp labels instead of the 10sp default. Noto Sans Arabic's line box
// is tall, so the label gets a fixed line height without Android's extra font padding.
const LABEL_LINE_HEIGHT = 18;
const tabBarOptions = {
  tabBarActiveTintColor: tokens.color.primary,
  tabBarInactiveTintColor: tokens.color.textMuted,
  tabBarLabelStyle: { ...font, fontSize: 12, lineHeight: LABEL_LINE_HEIGHT, includeFontPadding: false },
  headerTitleStyle: font,
};
// A tab item is 5dp padding above and below a 28dp icon, then the label; 4dp spare. The library's 49dp default clips
// the label. The bar adds the bottom safe-area inset as padding (gesture navigation), so the height includes it too.
const TAB_ITEM_CHROME = 5 + 28 + 5 + 4;

interface ErrorBoundaryState { hasError: boolean }

/**
 * Catches unhandled render errors and shows a recoverable "حدث خطأ غير متوقع" screen.
 * Must be a class component — React only supports class-based error boundaries.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  reset = () => this.setState({ hasError: false });

  override render() {
    if (this.state.hasError) {
      return (
        <Screen>
          <EmptyState
            title={t('shell:error.unexpected')}
            action={{ label: t('shell:error.retry'), onPress: this.reset }}
          />
        </Screen>
      );
    }
    return this.props.children;
  }
}

/** Nothing renders until the saved locale, server URL, fonts and session are restored, so nothing flashes. */
export function RootLayout() {
  const fontsReady = useUiFonts();
  // i18n has no React binding: an ar <-> ckb switch (no reload) re-mounts the navigator so every screen re-reads t().
  // The navigation state lives above it (expo-router), so the user stays where they were.
  const locale = useLocale();
  const [restored, setRestored] = useState(false);
  const [serverError, setServerError] = useState(false);
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

  // Auto-dismiss the server error toast after 4 seconds.
  useEffect(() => {
    if (!serverError) return;
    const id = setTimeout(() => setServerError(false), 4000);
    return () => clearTimeout(id);
  }, [serverError]);

  if (!fontsReady || !restored) return null;
  return (
    <ErrorBoundary>
      <SessionProvider apiBaseUrl={apiBaseUrl} onServerError={() => setServerError(true)}>
        <AvailableRoutesProvider routes={availableRoutes()}>
          <SessionRestored>
            {/* Screens set their own (announced) title; '' only avoids showing a raw route path when one does not. */}
            <Stack key={locale} screenOptions={{ title: '', headerTitleStyle: font }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Protected guard={!isProduction()}>
                <Stack.Screen name="dev-settings" options={{ title: t('shell:devSettings.title') }} />
              </Stack.Protected>
            </Stack>
          </SessionRestored>
        </AvailableRoutesProvider>
      </SessionProvider>
      {serverError ? <ErrorToast message={t('shell:error.serverError')} /> : null}
    </ErrorBoundary>
  );
}

/** Signed-out users browse every tab; the account tab (feature-account) shows the sign-in entry. */
function SessionRestored({ children }: { children: ReactNode }) {
  return useSession().state.status === 'loading' ? null : children;
}

export function TabsLayout() {
  const router = useRouter();
  const devSettings = useRouteAvailable('devSettings');
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const tabBarStyle = { height: TAB_ITEM_CHROME + Math.ceil(LABEL_LINE_HEIGHT * fontScale) + bottom };
  return (
    <Tabs screenOptions={{ ...tabBarOptions, tabBarStyle }}>
      {tabs.map((tab) => {
        const label = tab === 'assistant' ? t('shell:tabs.assistant') : t(`common:tabs.${tab}`);
        const testID = tab in testIDs.tabs ? testIDs.tabs[tab as ContractTab] : undefined;
        return (
          <Tabs.Screen
            key={tab}
            name={tab === 'map' ? 'index' : tab}
            options={{
              title: label,
              // Without it iOS appends an English "tab, N of 5" to the label.
              tabBarAccessibilityLabel: label,
              tabBarButtonTestID: testID,
              tabBarIcon: ({ color, size }) => <SymbolView name={{ android: tabIcons[tab], web: tabIcons[tab] }} tintColor={color} size={size} />,
              headerRight:
                tab === 'account' && devSettings
                  ? () => <IconButton icon="developer_mode" accessibilityLabel={t('shell:devSettings.open')} onPress={() => router.push(href('devSettings'))} />
                  : undefined,
            }}
          />
        );
      })}
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
      <TextField
        testID={testIDs.dev.serverUrlInput}
        label={t('shell:devSettings.serverUrl')}
        value={url}
        onChangeText={setUrl}
        placeholder={defaultApiUrl()}
        keyboardType="url"
        direction="ltr"
        error={result === 'invalid' ? t('shell:devSettings.invalidUrl') : undefined}
      />
      {result === 'saved' ? <Banner kind="success" message={t('shell:devSettings.saved', { url: apiBaseUrl() })} /> : null}
      <Button testID={testIDs.dev.serverUrlSave} label={t('common:actions.save')} onPress={save} />
    </Screen>
  );
}
