import { AvailableRoutesProvider, SessionProvider } from '@iraq-maps/mobile-kit';
import { useUiFonts } from '@iraq-maps/ui';
import { Stack } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { availableRoutes } from './available-routes';
import { startLocale } from './locale';
import { stackOptions } from './navigation';
import { apiBaseUrl, loadServerUrl } from './server-url';

/** True once the locale (with its layout direction) and the developer server URL are restored. */
function useBoot(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    let stop: (() => void) | null = null;
    void Promise.all([startLocale(), loadServerUrl()]).then(([unsubscribe]) => {
      stop = unsubscribe;
      if (!mounted) stop?.();
      // No unsubscribe means a direction reload is under way: keep the screen empty until it happens.
      else if (stop) setReady(true);
    });
    return () => {
      mounted = false;
      stop?.();
    };
  }, []);
  return ready;
}

/** app/_layout.tsx: renders nothing until the fonts and the boot state are ready, so the first screen is already right. */
export function RootLayout(): ReactElement | null {
  const fontsReady = useUiFonts();
  const booted = useBoot();
  if (!fontsReady || !booted) return null;
  return (
    <SessionProvider apiBaseUrl={apiBaseUrl}>
      <AvailableRoutesProvider routes={availableRoutes()}>
        <Stack screenOptions={{ ...stackOptions, headerShown: false }} />
      </AvailableRoutesProvider>
    </SessionProvider>
  );
}
