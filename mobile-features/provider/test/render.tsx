import { UserId } from '@iraq-maps/contracts';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { jest } from '@jest/globals';
import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';

type Response = { status: number; body?: unknown };
export const reply = (status: number, body?: unknown): Promise<Response> => Promise.resolve({ status, body });
const endpoint = () => jest.fn((_req?: unknown) => reply(500));

export async function setup(ui: ReactElement) {
  const api = {
    providers: {
      create: endpoint(),
      me: endpoint(),
      update: endpoint(),
      phoneStart: endpoint(),
      phoneConfirm: endpoint(),
      submit: endpoint(),
      consents: endpoint(),
      setConsent: endpoint(),
      claim: endpoint(),
    },
    media: {
      createUpload: endpoint(),
      completeUpload: endpoint(),
    },
  };
  const session = {
    state: { status: 'signedIn' as const, user: { id: UserId.parse('0b6f7c3e-2a8d-4f5b-9c1e-7d3a2b1c0e9f'), name: 'علي' as const, locale: 'ar' as const, roles: ['user'] as ('user' | 'provider' | 'moderator' | 'admin')[], createdAt: '2026-10-08T00:00:00.000Z' } },
    signIn: jest.fn(async () => {}),
    updateUser: jest.fn(),
    signOut: jest.fn(async () => {}),
  };
  const view = await renderWithProviders(ui, { api: api as never, session, locale: 'ar' });
  return { api, session, router: jest.mocked(useRouter()), view };
}
