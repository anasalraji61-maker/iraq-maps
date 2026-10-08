import { UserId, type Me } from '@iraq-maps/contracts';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { jest } from '@jest/globals';
import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';

export const user: Me = { id: UserId.parse('0b6f7c3e-2a8d-4f5b-9c1e-7d3a2b1c0e9f'), name: 'علي', locale: 'ar', roles: ['user'], createdAt: '2026-10-08T00:00:00.000Z' };
export const tokens = { accessToken: 'access', refreshToken: 'refresh', accessExpiresAt: '2026-10-08T00:15:00.000Z' };

type Response = { status: number; body?: unknown };
/** A ts-rest response as the screens read it (they never look at headers). */
export const reply = (status: number, body?: unknown): Promise<Response> => Promise.resolve({ status, body });
const endpoint = () => jest.fn((_req?: unknown) => reply(500));

/** Renders `ui` in Arabic with a fake session and a fake API whose endpoints answer 500 until a test stubs them. */
export async function setup(ui: ReactElement, { signedIn = true } = {}) {
  const api = {
    auth: { requestOtp: endpoint(), verifyOtp: endpoint(), refresh: endpoint(), logout: endpoint() },
    me: { get: endpoint(), update: endpoint(), remove: endpoint() },
  };
  const session = {
    state: signedIn ? ({ status: 'signedIn', user } as const) : ({ status: 'signedOut' } as const),
    signIn: jest.fn(async () => {}),
    updateUser: jest.fn(),
    signOut: jest.fn(async () => {}),
  };
  const view = await renderWithProviders(ui, { api: api as never, session, locale: 'ar' });
  return { api, session, router: jest.mocked(useRouter()), view };
}
