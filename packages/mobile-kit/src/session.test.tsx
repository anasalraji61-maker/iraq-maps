import type { ApiClient } from '@iraq-maps/api-client';
import type { Me, TokenPair } from '@iraq-maps/contracts';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';
import { SessionProvider, useApi, useSession, type Session } from './index';
import { memorySecureStore, renderWithProviders } from './testing';

jest.mock('expo-secure-store', () => jest.requireActual<typeof import('./testing')>('./testing').memorySecureStore);

const tokens: TokenPair = { accessToken: 'a1', refreshToken: 'r1', accessExpiresAt: '2026-10-08T12:00:00.000Z' };
const user: Me = { id: '0b7c1d4e-8f9a-4b2c-9d3e-1f2a3b4c5d6e' as Me['id'], name: 'Ali', locale: 'ar', roles: ['user'], createdAt: '2026-10-08T10:00:00.000Z' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const unauthorized = () => json(401, { title: 'Unauthorized', status: 401, code: 'unauthorized' });

const fetchMock = jest.fn<typeof fetch>();
let session: Session;
let api: ApiClient;
function Probe() {
  session = useSession();
  api = useApi();
  const { state } = session;
  return <Text testID="state">{state.status === 'signedIn' ? `signedIn:${state.user.name}` : state.status}</Text>;
}
const mount = () => render(<SessionProvider apiBaseUrl={() => 'http://api.test'}><Probe /></SessionProvider>);
const persist = async () => {
  await SecureStore.setItemAsync('session.tokens', JSON.stringify(tokens));
  await SecureStore.setItemAsync('session.user', JSON.stringify(user));
};

beforeEach(() => {
  global.fetch = fetchMock as typeof global.fetch;
});
afterEach(() => {
  fetchMock.mockReset();
  memorySecureStore.clear();
});

describe('SessionProvider', () => {
  it('starts signed out when nothing is stored', async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signedOut'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signIn persists the session, and a remount restores it and refreshes the profile', async () => {
    await mount();
    await act(() => session.signIn(tokens, user));
    expect(screen.getByTestId('state')).toHaveTextContent('signedIn:Ali');
    await screen.unmount();

    fetchMock.mockResolvedValue(json(200, { ...user, name: 'Sara' }));
    await mount();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signedIn:Sara'));
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v1/me', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer a1' }) }));
  });

  it('restores offline from the cached profile', async () => {
    await persist();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId('state')).toHaveTextContent('signedIn:Ali');
  });

  it('an expired session (refresh rejected) signs out and clears the store', async () => {
    await persist();
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json(401, { title: 'x', status: 401, code: 'refresh_invalid' }));
    await mount();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('signedOut'));
    expect(await SecureStore.getItemAsync('session.tokens')).toBeNull();
  });

  it('a refreshed token pair is persisted for the next launch', async () => {
    await persist();
    const fresh = { ...tokens, accessToken: 'a2', refreshToken: 'r2' };
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(json(200, fresh)).mockResolvedValueOnce(json(200, user));
    await mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(async () => expect(JSON.parse((await SecureStore.getItemAsync('session.tokens')) ?? '{}')).toEqual(fresh));
  });

  it('signOut clears the store and revokes the refresh token on the server', async () => {
    await persist();
    fetchMock.mockResolvedValue(json(200, user));
    await mount();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await act(() => session.signOut());
    expect(screen.getByTestId('state')).toHaveTextContent('signedOut');
    expect(await SecureStore.getItemAsync('session.tokens')).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith('http://api.test/v1/auth/logout', expect.objectContaining({ method: 'POST', body: JSON.stringify({ refreshToken: 'r1' }) }));
    expect(api).toBeDefined();
  });
});

describe('renderWithProviders', () => {
  it('provides the given session and API stubs', async () => {
    const get = jest.fn<ApiClient['me']['get']>();
    await renderWithProviders(<Probe />, { session: { state: { status: 'signedIn', user } }, api: { me: { get } as unknown as ApiClient['me'] } });
    expect(screen.getByTestId('state')).toHaveTextContent('signedIn:Ali');
    expect(api.me.get).toBe(get);
  });
});
