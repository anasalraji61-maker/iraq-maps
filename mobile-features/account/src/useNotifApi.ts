import { notificationsContract, type NotificationPrefs } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { useCallback, useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';

async function getAccessToken(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync('session.tokens');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Thin ts-rest client for the notifications contract, using the same base URL as the main api client. */
export function useNotifApi() {
  const baseUrl = useApiBaseUrl();

  const client = useMemo(
    () =>
      initClient(notificationsContract, {
        baseUrl,
        baseHeaders: {},
        api: async (args) => {
          const token = await getAccessToken();
          const headers = new Headers(args.headers as Record<string, string>);
          if (token) headers.set('Authorization', `Bearer ${token}`);
          const res = await fetch(args.path, { method: args.method, headers, body: args.body ?? undefined });
          const body = await res.json().catch(() => undefined);
          return { status: res.status, body, headers: res.headers };
        },
      }),
    [baseUrl],
  );

  const getPrefs = useCallback(async (): Promise<NotificationPrefs> => {
    const res = await client.getPrefs();
    if (res.status === 200) return res.body as NotificationPrefs;
    throw new Error('getPrefs failed');
  }, [client]);

  const updatePrefs = useCallback(async (partial: Partial<NotificationPrefs>): Promise<NotificationPrefs> => {
    const res = await client.updatePrefs({ body: partial });
    if (res.status === 200) return res.body as NotificationPrefs;
    throw new Error('updatePrefs failed');
  }, [client]);

  const registerDevice = useCallback(async (token: string, platform: 'android' | 'ios'): Promise<void> => {
    await client.registerDevice({ body: { token: token as import('@iraq-maps/contracts').PushToken, platform } });
  }, [client]);

  return { getPrefs, updatePrefs, registerDevice };
}
