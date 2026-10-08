import { describe, expect, it, jest } from '@jest/globals';
import { testIDs } from '@iraq-maps/contracts';
import { act, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { nativeHeaderTitles, renderApp, storeSession } from './test/app';

describe('AccountLayout', () => {
  it('shows a spinner while the session is being restored', async () => {
    const read = SecureStore.getItemAsync;
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation((key) => (key.startsWith('iraq-maps.session.') ? new Promise(() => {}) : read(key)));
    const pathname = await renderApp('/account');
    expect(await screen.findByLabelText('جارٍ التحميل')).toBeOnTheScreen();
    expect(pathname()).toBe('/account');
  });

  it('sends a signed-out user from the account tab to the phone step', async () => {
    const pathname = await renderApp('/');
    await userEvent.setup().press(await screen.findByTestId(testIDs.tabs.account));
    expect(await screen.findByText('phone screen')).toBeOnTheScreen();
    expect(pathname()).toBe('/auth/phone');
  });

  it('resumes onboarding on the name step for a signed-in user without a name', async () => {
    await storeSession(null);
    const pathname = await renderApp('/account');
    expect(await screen.findByText('name screen')).toBeOnTheScreen();
    expect(pathname()).toBe('/auth/name');
  });

  it('opens the account for a signed-in user with a name, under the tab header', async () => {
    await storeSession('سارا');
    const pathname = await renderApp('/account');
    expect(await screen.findByText('account screen')).toBeOnTheScreen();
    expect(pathname()).toBe('/account');
    expect(screen.getByRole('heading', { name: 'حسابي' })).toBeOnTheScreen();
  });

  it('gives the language page its own header with a back button instead of the tab header', async () => {
    await storeSession('سارا');
    await renderApp('/account/language');
    expect(await screen.findByText('language screen')).toBeOnTheScreen();
    expect(nativeHeaderTitles()).toContain('اللغة');
    expect(screen.queryByRole('heading', { name: 'حسابي' })).not.toBeOnTheScreen();
  });
});

describe('AuthLayout', () => {
  it('sends a user who already has a name to the account', async () => {
    await storeSession('سارا');
    const pathname = await renderApp('/auth/phone');
    expect(await screen.findByText('account screen')).toBeOnTheScreen();
    expect(pathname()).toBe('/account');
  });

  it('leaves for the account as soon as the name is saved', async () => {
    await storeSession(null);
    const pathname = await renderApp('/auth/name');
    await userEvent.setup().press(await screen.findByText('name screen'));
    expect(await screen.findByText('account screen')).toBeOnTheScreen();
    expect(pathname()).toBe('/account');
  });

  it('titles the steps and offers developer settings, because a real phone needs the server URL first', async () => {
    const pathname = await renderApp('/auth/phone');
    expect(await screen.findByText('phone screen')).toBeOnTheScreen();
    expect(nativeHeaderTitles()).toContain('تسجيل الدخول');
    await userEvent.setup().press(screen.getByRole('button', { name: 'فتح إعدادات المطوّر' }));
    expect(await screen.findByTestId(testIDs.dev.serverUrlInput)).toBeOnTheScreen();
    expect(pathname()).toBe('/dev-settings');
  });

  it('lets a user who was sent to sign in close it and go back to the map', async () => {
    const pathname = await renderApp('/');
    await userEvent.setup().press(await screen.findByTestId(testIDs.tabs.account));
    await userEvent.setup().press(await screen.findByRole('button', { name: 'إغلاق' }));
    expect(await screen.findByTestId(testIDs.tabs.map)).toBeOnTheScreen();
    expect(pathname()).toBe('/');
  });

  it('shows close only on the first step; later steps go back', async () => {
    await renderApp('/auth/phone');
    expect(await screen.findByRole('button', { name: 'إغلاق' })).toBeOnTheScreen();
    await act(async () => router.push('/auth/otp'));
    expect(await screen.findByText('otp screen')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'إغلاق' })).not.toBeOnTheScreen();
  });
});
