import type { ApiClient } from '@iraq-maps/api-client';
import { getLocale } from '@iraq-maps/i18n';
import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useApi, useRouteAvailable, useSession, type Session } from './index';
import { renderWithProviders } from './testing';

let seen: { session: Session; api: ApiClient; place: boolean } | undefined;
function Probe() {
  seen = { session: useSession(), api: useApi(), place: useRouteAvailable('place') };
  return <Text>{seen.session.state.status}</Text>;
}

describe('renderWithProviders', () => {
  it('defaults to a signed-out Arabic session with every route available', async () => {
    await renderWithProviders(<Probe />);
    expect(screen.getByText('signedOut')).toBeOnTheScreen();
    expect(getLocale()).toBe('ar');
    expect(seen?.place).toBe(true);
    await expect(seen?.session.signOut()).resolves.toBeUndefined();
  });

  it('applies session, api, locale and route overrides', async () => {
    const signOut = jest.fn(async () => {});
    const api = { me: {} } as Partial<ApiClient>;
    const user = { id: 'u1', name: 'هه‌ژار', locale: 'ckb', roles: ['user'], createdAt: '2026-10-01T08:00:00.000Z' } as never;
    await renderWithProviders(<Probe />, { session: { state: { status: 'signedIn', user }, signOut }, api, locale: 'en', availableRoutes: ['map'] });
    expect(screen.getByText('signedIn')).toBeOnTheScreen();
    expect(getLocale()).toBe('en');
    expect(seen?.api).toBe(api);
    expect(seen?.place).toBe(false);
    await seen?.session.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
