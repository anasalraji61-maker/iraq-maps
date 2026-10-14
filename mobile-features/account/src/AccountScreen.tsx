import { testIDs, type NotificationPrefs } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { href, useApi, useSession } from '@iraq-maps/mobile-kit';
import { Banner, Button, EmptyState, ListItem, Screen, Sheet, Text } from '@iraq-maps/ui';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { Platform } from 'react-native';
import { NotifPrefsSection } from './NotifPrefsSection';
import { expectStatus, useRequest } from './request';
import { t } from './strings';
import { useNotifApi } from './useNotifApi';

export function AccountScreen(): ReactElement {
  const api = useApi();
  const session = useSession();
  const router = useRouter();
  const notifApi = useNotifApi();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const { busy, error, run } = useRequest();
  const { state } = session;

  // Register device push token and load notification prefs on sign-in
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    void (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          const platform = Platform.OS === 'ios' ? 'ios' : 'android';
          await notifApi.registerDevice(tokenData.data, platform);
        }
      } catch {
        // gracefully skip if unavailable
      }
      try {
        const prefs = await notifApi.getPrefs();
        setNotifPrefs(prefs);
      } catch {
        // gracefully skip
      }
    })();
  }, [state.status, notifApi]);

  if (state.status === 'loading') return <Screen>{null}</Screen>;

  const languageItem = (
    <ListItem
      testID={testIDs.account.language}
      title={t('profile.language')}
      subtitle={t(`languages.${getLocale()}`)}
      onPress={() => router.push(href('accountLanguage'))}
    />
  );

  if (state.status === 'signedOut') {
    return (
      <Screen>
        <EmptyState title={t('profile.signedOutTitle')} body={t('profile.signedOutBody')} />
        <Button testID={testIDs.account.signIn} label={t('profile.signIn')} onPress={() => router.push(href('authPhone'))} />
        {languageItem}
      </Screen>
    );
  }

  const deleteAccount = () =>
    run(async () => {
      expectStatus(await api.me.remove(), 204);
      setConfirmingDelete(false);
      await session.signOut();
    });
  const banner = error ? <Banner kind="error" message={error} /> : null;

  return (
    <Screen scroll>
      {confirmingDelete ? null : banner}
      <ListItem title={t('profile.name')} subtitle={state.user.name ?? t('profile.noName')} onPress={() => router.push(href('authName'))} />
      <ListItem testID={testIDs.provider.entry} title={t('profile.registerBusiness')} onPress={() => router.push(href('providerRegister'))} />
      {languageItem}
      {notifPrefs ? (
        <NotifPrefsSection
          prefs={notifPrefs}
          onToggle={async (key, value) => {
            const updated = await notifApi.updatePrefs({ [key]: value });
            setNotifPrefs(updated);
          }}
        />
      ) : null}
      <Button testID={testIDs.account.logout} variant="secondary" label={t('profile.logout')} onPress={() => run(() => session.signOut())} loading={busy} />
      <Button testID={testIDs.account.delete} variant="danger" label={t('profile.delete')} onPress={() => setConfirmingDelete(true)} disabled={busy} />
      <Sheet visible={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <Text variant="subtitle">{t('deleteSheet.title')}</Text>
        <Text>{t('deleteSheet.body')}</Text>
        {banner}
        <Button testID={testIDs.account.deleteConfirm} variant="danger" label={t('deleteSheet.confirm')} onPress={deleteAccount} loading={busy} />
        <Button variant="secondary" label={t('deleteSheet.cancel')} onPress={() => setConfirmingDelete(false)} disabled={busy} />
      </Sheet>
    </Screen>
  );
}
