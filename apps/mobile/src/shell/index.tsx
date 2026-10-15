import AsyncStorage from '@react-native-async-storage/async-storage';
import { testIDs } from '@iraq-maps/contracts';
import { registerNamespace, t } from '@iraq-maps/i18n';
import { AvailableRoutesProvider, href, SessionProvider, useApi, useRouteAvailable, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, ErrorToast, IconButton, Screen, TextField, ThemeProvider, tokens, useUiFonts } from '@iraq-maps/ui';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { Stack, Tabs, useRouter } from 'expo-router';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableRoutes } from './available-routes';
import { apiBaseUrl, defaultApiUrl, isProduction, loadServerUrl, saveServerUrl } from './config';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';
import { persistLocaleChanges, restoreLocale, useLocale } from './locale';
import { NetworkBanner } from './NetworkBanner';
import { OnboardingFlow, ONBOARDING_DONE_KEY } from './OnboardingFlow';

registerNamespace('shell', { ar, ckb, en });

type ContractTab = keyof typeof testIDs.tabs;

/** Full ordered tab list; assistant and activity are not yet in testIDs.tabs so typed separately. */
type Tab = ContractTab | 'assistant' | 'activity';

const tabIcons: Record<Tab, AndroidSymbol> = {
  map: 'map',
  discover: 'explore',
  messages: 'chat',
  assistant: 'smart_toy',
  activity: 'history',
  account: 'person',
};

/** Primary tab bar order — six tabs visible to the user. */
const tabs: Tab[] = ['map', 'discover', 'messages', 'assistant', 'activity', 'account'];

const MESSAGES_POLL_MS = 60_000;
const RECEIPTS_KEY = '@iraq-maps/messages/read-receipts';

/** Polls unread inquiry count every 60 s when the user is signed in. Returns 0 when signed out.
 *  Reads locally-stored read receipts (set by InquiryDetailScreen) to determine what's unread. */
function useUnreadMessagesCount(): number {
  const api = useApi();
  const session = useSession();
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (session.state.status !== 'signedIn') {
      setCount(0);
      return;
    }
    const fetch = async () => {
      try {
        const res = await api.messaging.listInquiries({ query: {} });
        if (res.status !== 200) return;
        let receipts: Record<string, string> = {};
        try {
          const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
          if (raw) receipts = JSON.parse(raw) as Record<string, string>;
        } catch { /* ignore */ }
        const unread = res.body.items.filter((i: { id: string }) => !receipts[i.id]).length;
        setCount(unread);
      } catch { /* network error */ }
    };
    void fetch();
    timerRef.current = setInterval(() => void fetch(), MESSAGES_POLL_MS);
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current); };
  }, [api, session.state.status]);

  return count;
}

/** Polls unread notification count every 30 s when the user is signed in. Returns 0 when signed out. */
function useUnreadNotificationCount(): number {
  const api = useApi();
  const session = useSession();
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (session.state.status !== 'signedIn') {
      setCount(0);
      return;
    }
    const fetch = async () => {
      try {
        const res = await api.notifications.listNotifications({ query: { unreadOnly: true } });
        if (res.status === 200) setCount(res.body.unreadCount);
      } catch {
        // network error — keep previous count
      }
    };
    void fetch();
    intervalRef.current = setInterval(() => void fetch(), 30_000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [api, session.state.status]);

  return count;
}
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [serverError, setServerError] = useState(false);
  useEffect(() => {
    let mounted = true;
    let stop: (() => void) | undefined;
    void Promise.all([restoreLocale(), loadServerUrl(), SecureStore.getItemAsync(ONBOARDING_DONE_KEY)]).then(([, , seen]) => {
      if (!mounted) return;
      stop = persistLocaleChanges();
      if (!seen) setShowOnboarding(true);
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
  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <OnboardingFlow onDone={() => setShowOnboarding(false)} />
      </ErrorBoundary>
    );
  }
  return (
    <ThemeProvider>
    <ErrorBoundary>
      <NetworkBanner />
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
    </ThemeProvider>
  );
}

/**
 * Listens for push notification taps and deep-links into the app.
 * Convention: notification.request.content.data fields:
 *   screen: 'messages' | 'discover' | 'activity' | 'place'
 *   inquiryId, postId, placeId — entity identifiers depending on screen
 */
function useNotificationDeepLink() {
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined;
      if (!data) return;
      try {
        switch (data.screen) {
          case 'messages':
            router.push(href('messages'));
            break;
          case 'discover':
            if (data.postId) router.push(href('discoverPost', { postId: data.postId }));
            else router.push(href('discover'));
            break;
          case 'activity':
            router.push(href('activity'));
            break;
          case 'place':
            if (data.placeId) router.push(href('place', { placeId: data.placeId }));
            break;
          default:
            // unknown screen — open activity tab as a fallback
            router.push(href('activity'));
        }
      } catch {
        // navigation errors are non-fatal
      }
    });
    return () => sub.remove();
  }, [router]);
}

/** Signed-out users browse every tab; the account tab (feature-account) shows the sign-in entry. */
function SessionRestored({ children }: { children: ReactNode }) {
  useNotificationDeepLink();
  return useSession().state.status === 'loading' ? null : children;
}

export function TabsLayout() {
  const router = useRouter();
  const devSettings = useRouteAvailable('devSettings');
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const tabBarStyle = { height: TAB_ITEM_CHROME + Math.ceil(LABEL_LINE_HEIGHT * fontScale) + bottom };
  const unreadCount = useUnreadNotificationCount();
  const unreadMessages = useUnreadMessagesCount();
  return (
    <Tabs screenOptions={{ ...tabBarOptions, tabBarStyle }}>
      {tabs.map((tab) => {
        const label = (tab === 'assistant' || tab === 'activity') ? t(`shell:tabs.${tab}`) : t(`common:tabs.${tab}`);
        const testID = tab in testIDs.tabs ? testIDs.tabs[tab as ContractTab] : undefined;
        const badge =
          (tab === 'activity' && unreadCount > 0 ? unreadCount : undefined) ??
          (tab === 'messages' && unreadMessages > 0 ? unreadMessages : undefined);
        return (
          <Tabs.Screen
            key={tab}
            name={tab === 'map' ? 'index' : tab}
            options={{
              title: label,
              // Without it iOS appends an English "tab, N of 5" to the label.
              tabBarAccessibilityLabel: label,
              tabBarButtonTestID: testID,
              tabBarBadge: badge,
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
