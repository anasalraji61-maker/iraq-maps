import { t } from '@iraq-maps/i18n';
import { href, useLocale, useSession } from '@iraq-maps/mobile-kit';
import { IconButton, tokens } from '@iraq-maps/ui';
import { Redirect, Stack, useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DevSettingsButton } from './dev-settings';
import { stackOptions } from './navigation';
import './strings';

const ACCOUNT_SCREENS = { index: 'index', language: 'language' } as const;
const LINKS = { authPhone: href('authPhone'), authName: href('authName'), account: href('account'), map: href('map') };
const CLOSE_ICON = 'close';

/** app/(tabs)/account/_layout.tsx: the account needs a signed-in user who has chosen a name. */
export function AccountLayout(): ReactElement {
  useLocale();
  const { state } = useSession();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signedOut') return <Redirect href={LINKS.authPhone} />;
  // A new user is signed in before choosing a name; onboarding resumes on the name step.
  if (state.user.name === null) return <Redirect href={LINKS.authName} />;
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name={ACCOUNT_SCREENS.index} options={{ headerShown: false }} />
      <Stack.Screen name={ACCOUNT_SCREENS.language} options={{ title: t('shell:account.language') }} />
    </Stack>
  );
}

/** app/auth/_layout.tsx: phone, code, then name. Leaves for the account once the user has a name. */
export function AuthLayout(): ReactElement {
  useLocale();
  const { state } = useSession();
  if (state.status === 'signedIn' && state.user.name !== null) return <Redirect href={LINKS.account} />;
  // The developer settings sit in this header too: a real phone needs the server URL before it can sign in.
  return (
    <Stack
      screenOptions={{
        ...stackOptions,
        title: t('shell:auth.title'),
        headerBackVisible: true,
        headerLeft: ({ canGoBack }) => (canGoBack ? null : <CloseButton />),
        headerRight: () => <DevSettingsButton />,
      }}
    />
  );
}

/** The account tab's redirect replaces the tabs, so the first auth step needs its own way back to the map. */
function CloseButton(): ReactElement {
  const router = useRouter();
  return <IconButton icon={CLOSE_ICON} accessibilityLabel={t('shell:auth.close')} onPress={() => router.replace(LINKS.map)} />;
}

function Loading(): ReactElement {
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel={t('shell:loading')} color={tokens.color.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.bg },
});
