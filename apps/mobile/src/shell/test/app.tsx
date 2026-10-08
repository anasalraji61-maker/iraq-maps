import { Me } from '@iraq-maps/contracts';
import { useSession } from '@iraq-maps/mobile-kit';
import * as SecureStore from 'expo-secure-store';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { AccountLayout, AuthLayout, DevSettingsScreen, PendingScreen, RootLayout, TabsLayout } from '../index';

type Routes = Record<string, () => ReactElement | null>;

const stub = (name: string) => () => <Text>{name}</Text>;

/** feature-account's name step, reduced to saving a name. */
function NameStep(): ReactElement {
  const { state, updateUser } = useSession();
  return <Text onPress={() => state.status === 'signedIn' && updateUser({ ...state.user, name: 'سارا' })}>name screen</Text>;
}

/** The route files as they are today: every tab, account included, is a PendingScreen. */
export const routesNow: Routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': PendingScreen,
  '(tabs)/discover': PendingScreen,
  '(tabs)/messages': PendingScreen,
  '(tabs)/activity': PendingScreen,
  '(tabs)/account': PendingScreen,
};

/** The wiring the shell asks the integrator for (README), with the feature-account screens stubbed. */
const routesM0: Routes = {
  ...Object.fromEntries(Object.entries(routesNow).filter(([file]) => file !== '(tabs)/account')),
  '(tabs)/account/_layout': AccountLayout,
  '(tabs)/account/index': stub('account screen'),
  '(tabs)/account/language': stub('language screen'),
  'auth/_layout': AuthLayout,
  'auth/phone': stub('phone screen'),
  'auth/otp': stub('otp screen'),
  'auth/name': NameStep,
  'dev-settings': DevSettingsScreen,
};

/** Renders the app at `initialUrl` and resolves to a reader of the current pathname. */
export async function renderApp(initialUrl: string, routes: Routes = routesM0): Promise<() => string> {
  const app = renderRouter(routes, { initialUrl });
  await app;
  return () => app.getPathname();
}

const profile = (name: string | null): Me =>
  Me.parse({ id: '0b6f3c1e-8d2a-4e57-9a43-5c1d2e3f4a5b', name, locale: 'ar', roles: ['user'], createdAt: '2026-10-01T09:00:00.000Z' });

/** Leaves a session in storage the way mobile-kit saves it and answers every request; returns the requested URLs. */
export async function storeSession(name: string | null): Promise<string[]> {
  const tokens = { accessToken: 'test-access', refreshToken: 'test-refresh', accessExpiresAt: '2026-10-08T20:00:00.000Z' };
  await SecureStore.setItemAsync('iraq-maps.session.tokens', JSON.stringify(tokens));
  await SecureStore.setItemAsync('iraq-maps.session.user', JSON.stringify(profile(name)));
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return new Response(JSON.stringify(profile(name)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return requested;
}

/** Titles of the native stack headers on screen (they are props, not text). */
export const nativeHeaderTitles = (): unknown[] => {
  const titles: unknown[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const { type, props, children } = node as { type?: string; props?: { title?: unknown }; children?: unknown[] };
    if (type === 'RNSScreenStackHeaderConfig') titles.push(props?.title);
    children?.forEach(walk);
  };
  walk(screen.toJSON());
  return titles;
};
